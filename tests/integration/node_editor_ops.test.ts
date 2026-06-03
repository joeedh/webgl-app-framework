/**
 * Integration coverage for the node-editor ToolOps ported to TypeScript
 * (scripts/editors/node/node_ops.ts + node_selectops.ts, driven through the
 * NodeGraphOp.invoke / fetchGraph / AbstractGraphClass paths).
 *
 * The node editor is UI/app-coupled (path.ux widgets, the data API, the active
 * NodeEditor area), so its code can't be loaded in the jsdom unit harness —
 * vectormath/path.ux don't transform there (see tests/unit/isect_frustum.test.ts).
 * Instead we drive the *real* Electron app headlessly, the same mechanism as
 * sculptcore_parity.test.ts.
 *
 * To stay independent of the GPU (headless WebGPU rendering of a real mesh is
 * flaky on some hosts), this builds the empty scene and creates a standalone
 * material with `material.new` — `makeDefaultMaterial` gives it a 3-node shader
 * graph (DiffuseNode + GeometryNode + OutputNode, see core/material.ts). The
 * node ToolOps then target `library.material[<id>].graph` directly (no mesh, no
 * render), and the resulting node count is read back from the harness `--dump`
 * (test_harness.ts `dumpScene` → `materials[].nodeCount`).
 *
 * Asserts the ported ops actually mutate the graph in a running app:
 *   - node.add_node           adds one node            (3 → 4)
 *   - node.toggle_select_all  + node.delete_selected   wipes the graph (3 → 0)
 *
 * Prerequisites (else self-skips, logged): a resolvable Electron and the app
 * bundle (`build/entry_point.js`, `pnpm build`). The native sculptcore addon is
 * NOT required — the ops are pure-JS graph edits on the WASM backend.
 */

import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '../..')
const BUNDLE = Path.join(REPO_ROOT, 'build', 'entry_point.js')

interface DumpMaterial {
  libId: number
  nodeCount: number
}
interface Dump {
  materials: DumpMaterial[]
}

function resolveElectronExe(): string | undefined {
  try {
    const exe = execFileSync('node', ['-p', "require('electron')"], {
      cwd     : Path.join(REPO_ROOT, 'electron'),
      encoding: 'utf-8',
    }).trim()
    return exe && fs.existsSync(exe) ? exe : undefined
  } catch {
    return undefined
  }
}

/**
 * Boot the app headlessly on the empty scene, create a material, run each extra
 * `--run` tool in order, then dump. Returns the single datalib material.
 */
function runOps(electronExe: string, extraTools: string[]): DumpMaterial {
  const out = Path.join(fs.mkdtempSync(Path.join(os.tmpdir(), 'nodeops-')), 'dump.json')
  const env = {...process.env}
  delete env.ELECTRON_RUN_AS_NODE // else electron runs as plain node, no window

  // material.new always runs first (creates the graph the other ops target).
  const runArgs = ['material.new()', ...extraTools].flatMap((t) => ['--run', t])

  execFileSync(
    electronExe,
    [
      Path.join(REPO_ROOT, 'electron', 'main.js'),
      '--headless',
      '--no-devtools',
      '--backend', 'wasm',
      '--gen-scene', 'empty',
      ...runArgs,
      '--dump', out,
      '--exit',
    ],
    {cwd: REPO_ROOT, env, encoding: 'utf-8', stdio: 'pipe', timeout: 90000},
  )

  if (!fs.existsSync(out)) throw new Error(`dump not written to ${out}`)
  const dump = JSON.parse(fs.readFileSync(out, 'utf-8')) as Dump

  if (!Array.isArray(dump.materials) || dump.materials.length !== 1) {
    throw new Error(`expected exactly one datalib material, got ${JSON.stringify(dump.materials)}`)
  }
  return dump.materials[0]
}

const electronExe = resolveElectronExe()
const haveBundle = fs.existsSync(BUNDLE)
const canRun = !!electronExe && haveBundle

const maybe = canRun ? describe : describe.skip

if (!canRun) {
  const why = [
    !electronExe && 'electron not resolvable (electron/ workspace)',
    !haveBundle && `app bundle missing (${Path.relative(REPO_ROOT, BUNDLE)}; run pnpm build)`,
  ]
    .filter(Boolean)
    .join('; ')
  // eslint-disable-next-line no-console
  console.warn(`[node-editor-ops] skipped: ${why}`)
}

maybe('node-editor ToolOps mutate the shader graph (headless)', () => {
  let baseline: DumpMaterial
  let afterAdd: DumpMaterial
  let afterDeleteAll: DumpMaterial

  beforeAll(() => {
    baseline = runOps(electronExe!, [])
    // The material's lib_id is deterministic across these identical boots, so we
    // can target its graph path from the baseline run.
    const g = `graphPath='library.material[${baseline.libId}].graph' graphClass='shader'`
    afterAdd = runOps(electronExe!, [`node.add_node(${g} nodeClass='DiffuseNode')`])
    afterDeleteAll = runOps(electronExe!, [
      `node.toggle_select_all(${g} mode='ADD')`,
      `node.delete_selected(${g})`,
    ])
  }, 300000)

  test('material.new yields the 3-node makeDefaultMaterial graph', () => {
    expect(baseline.nodeCount).toBe(3)
  })

  test('node.add_node adds exactly one node', () => {
    expect(afterAdd.nodeCount).toBe(baseline.nodeCount + 1)
  })

  test('toggle_select_all + delete_selected empties the graph', () => {
    expect(afterDeleteAll.nodeCount).toBe(0)
  })
})
