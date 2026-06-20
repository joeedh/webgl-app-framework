/**
 * Integration coverage for the node-editor ToolOps ported to TypeScript
 * (scripts/editors/node/node_ops.ts + node_selectops.ts), plus the `--eval`
 * harness bridge to `CTX.debug` (scripts/core/context.ts).
 *
 * The node editor is UI/app-coupled (path.ux widgets, the data API), so its code
 * can't be loaded in the jsdom unit harness — vectormath/path.ux don't transform
 * there (see tests/unit/isect_frustum.test.ts). Instead we drive the *real*
 * NW.js app headlessly, the same mechanism as sculptcore_parity.test.ts.
 *
 * To stay independent of the GPU (headless WebGPU rendering of a real mesh is
 * flaky on some hosts), this builds the empty scene and creates a standalone
 * material with `material.new` — `makeDefaultMaterial` gives it a 3-node shader
 * graph (DiffuseNode + GeometryNode + OutputNode, see core/material.ts). The node
 * ToolOps target `library.material[<id>].graph` directly (no mesh, no render),
 * and the resulting node count is read back from the harness `--dump`
 * (test_harness.ts `dumpScene` → `materials[].nodeCount`).
 *
 * Covers:
 *   - node.add_node                                    grows the graph (3 → 4)
 *   - node.toggle_select_all + node.delete_selected    empties it    (3 → 0)
 *   - --eval CTX.debug... + CTX.api.execTool(...)      the `--eval` → `CTX`
 *     test bridge from CLAUDE.md (reflection + driving a ToolOp from JS).
 *
 * Prerequisites (else self-skips, logged): a resolvable NW.js and the app
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

function resolveNwjsExe(): string | undefined {
  try {
    const exe = execFileSync('node', ['-e', "require('nw').findpath().then(p=>process.stdout.write(p),()=>process.exit(1))"], {
      cwd     : REPO_ROOT,
      encoding: 'utf-8',
    }).trim()
    return exe && fs.existsSync(exe) ? exe : undefined
  } catch {
    return undefined
  }
}

/**
 * Boot the app headlessly on the empty scene, run each `--eval` expression (in
 * order, before tools) then each `--run` tool, and return the parsed dump.
 * execFileSync passes args as an array (no shell), so the eval/tool strings need
 * no escaping.
 */
function runHarness(nwExe: string, {evals = [], runTools = []}: {evals?: string[]; runTools?: string[]}): Dump {
  const out = Path.join(fs.mkdtempSync(Path.join(os.tmpdir(), 'nodeops-')), 'dump.json')
  const env = {...process.env}

  // `--eval=<expr>` (single token), NOT `--eval <expr>`: a bare `<expr>` token
  // is parsed by headless Chromium as a positional URL and can abort the launch
  // when a value-taking flag follows it. The `=` form is an ignored switch to
  // Chromium; getArgList() still reads it.
  const evalArgs = evals.map((e) => `--eval=${e}`)
  const runArgs = runTools.flatMap((t) => ['--run', t])

  execFileSync(
    nwExe,
    [
      REPO_ROOT,
      '--apptest-headless',
      '--no-devtools',
      '--backend',
      'wasm',
      '--gen-scene',
      'empty',
      ...evalArgs,
      ...runArgs,
      '--dump',
      out,
      '--exit',
    ],
    {cwd: REPO_ROOT, env, encoding: 'utf-8', stdio: 'pipe', timeout: 90000}
  )

  if (!fs.existsSync(out)) throw new Error(`dump not written to ${out}`)
  return JSON.parse(fs.readFileSync(out, 'utf-8')) as Dump
}

/** A run that creates one material then runs `extraTools`; returns that material. */
function runOps(nwExe: string, extraTools: string[]): DumpMaterial {
  // material.new always runs first (creates the graph the other ops target).
  const dump = runHarness(nwExe, {runTools: ['material.new()', ...extraTools]})
  if (!Array.isArray(dump.materials) || dump.materials.length !== 1) {
    throw new Error(`expected exactly one datalib material, got ${JSON.stringify(dump.materials)}`)
  }
  return dump.materials[0]
}

const nwExe = resolveNwjsExe()
const haveBundle = fs.existsSync(BUNDLE)
const canRun = !!nwExe && haveBundle

const maybe = canRun ? describe : describe.skip

if (!canRun) {
  const why = [
    !nwExe && 'nw not resolvable (nwjs/ workspace)',
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
    baseline = runOps(nwExe!, [])
    // The material's lib_id is deterministic across these identical boots, so we
    // can target its graph path from the baseline run.
    const g = `graphPath='library.material[${baseline.libId}].graph' graphClass='shader'`
    afterAdd = runOps(nwExe!, [`node.add_node(${g} nodeClass='DiffuseNode')`])
    afterDeleteAll = runOps(nwExe!, [`node.toggle_select_all(${g} mode='ADD')`, `node.delete_selected(${g})`])
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

maybe('CTX.debug via the --eval harness bridge', () => {
  let dump: Dump

  beforeAll(() => {
    // The `--eval` flag runs JS in global scope (CTX reachable) before --run
    // tools (see CLAUDE.md's "Debug context API" guide). Two evals: the first
    // exercises CTX.debug reflection (and throws — aborting the second — if it's
    // broken), the second drives a ToolOp whose effect is observable in --dump.
    dump = runHarness(nwExe!, {
      evals: [
        "if (CTX.debug.listEditorTypes().filter(e => e.areaname === 'MaterialEditor').length !== 1)" +
          " throw new Error('MaterialEditor missing from CTX.debug.listEditorTypes()')",
        "CTX.api.execTool(CTX, 'material.new()')",
      ],
    })
  }, 120000)

  test('--eval reaches CTX.debug + CTX.api and drives a ToolOp', () => {
    // A material with the 3-node default graph proves both evals ran: the
    // reflection check passed (else it threw before material.new) and the
    // ToolOp executed via the CTX global.
    expect(dump.materials.map((m) => m.nodeCount)).toEqual([3])
  })
})
