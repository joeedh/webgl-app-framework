/**
 * Integration test for the `window._sculptcoreStrokeTester` dev/test driver
 * (scripts/editors/view3d/tools/sculptcore_ops.ts). Unlike `__brushTest`, which
 * uses the low-level `runSculptcoreStroke`, this exercises the *real* op path:
 * `_sculptcoreStrokeTester.runStroke` builds evenly-spaced samples through the
 * production `BrushStrokeDriver` (projection + raycast from normalized screen
 * points), runs `SculptPaintOp` non-modally through the toolstack, and logs
 * undo. So it doubles as a smoke test that the headless boot has a laid-out
 * `view3d` and an activatable sculpt tool mode.
 *
 * The driver runs in a single `--eval` and reports through the generic
 * `globalThis.__evalTestResult` seam (reflected into `--dump` as `evalResult`),
 * so it needs no bespoke support module. It asserts: a center stroke emits dabs,
 * records a non-empty undo step, and measurably changes the mesh bounds; undo
 * restores those bounds and redo reproduces the change.
 *
 * Prerequisites (else self-skips, logged): a resolvable NW.js and the app bundle
 * (`pnpm build`). The native leg additionally needs the N-API addon
 * (`make.mjs build node`); without it only the WASM leg runs.
 */

import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '../..')
const BUNDLE = Path.join(REPO_ROOT, 'build', 'entry_point.js')
const NATIVE_ADDON = Path.join(REPO_ROOT, 'sculptcore', 'build', 'native-node', 'sculptcore_node.node')

interface StrokeTesterResult {
  ok: boolean
  error?: string
  /** evenly-spaced dabs the driver emitted (raycast must have hit the surface) */
  dabs?: number
  /** MeshLog bytes recorded for the stroke's step (>0 ⇒ it mutated geometry) */
  stepMem?: number
  /** bounding-box diagonal sum before / after stroke / after undo / after redo */
  sizeBefore?: number
  sizeAfter?: number
  sizeUndone?: number
  sizeRedone?: number
}

/**
 * Self-contained `--eval` driver (runs in the renderer global scope, where
 * `_appstate` / `window` live). Switches to the sculpt tool mode, frames the
 * mesh, runs a short center clay stroke through `_sculptcoreStrokeTester`, and
 * records bounds + undo-step size before/after/undo/redo on __evalTestResult.
 */
const DRIVER = `(function () {
  var r = {ok: false}
  try {
    var ctx = _appstate.ctx
    ctx.scene.switchToolMode('sculptcore')
    var t = window._sculptcoreStrokeTester
    var mesh = t.mesh
    if (!mesh) throw new Error('active object is not a LiteMesh')
    t.frameMeshInCamera()
    var diag = function () {
      var bb = mesh.getBoundingBox()
      return Math.abs(bb[1][0] - bb[0][0]) + Math.abs(bb[1][1] - bb[0][1]) + Math.abs(bb[1][2] - bb[0][2])
    }
    r.sizeBefore = diag()
    var res = t.runStroke({
      points: [[0.42, 0.5], [0.5, 0.5], [0.58, 0.5]],
      radius: 150,
      brushSettings: {strength: 1.0},
    })
    r.dabs = res.dabs
    r.stepMem = t.meshLog ? t.meshLog.stepMemSize(res.tool.logStepId) : 0
    r.sizeAfter = diag()
    t.undo()
    r.sizeUndone = diag()
    t.redo()
    r.sizeRedone = diag()
    r.ok = true
  } catch (e) {
    r.error = String((e && e.stack) || e)
  }
  globalThis.__evalTestResult = r
})()`

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

/** Boot headlessly under `backend`, run the stroke-tester driver, return its result. */
function runStrokeTester(nwExe: string, backend: 'wasm' | 'native'): StrokeTesterResult {
  const out = Path.join(fs.mkdtempSync(Path.join(os.tmpdir(), 'scstroke-')), `${backend}.json`)
  execFileSync(
    nwExe,
    [
      REPO_ROOT,
      '--apptest-headless',
      '--no-devtools',
      '--backend',
      backend,
      '--gen-scene',
      'litemesh-cube',
      '--scene-arg',
      'subdiv=48',
      '--eval',
      DRIVER,
      '--dump',
      out,
      '--exit',
    ],
    {cwd: REPO_ROOT, env: {...process.env}, encoding: 'utf-8', stdio: 'pipe', timeout: 120000}
  )
  if (!fs.existsSync(out)) throw new Error(`${backend} dump not written to ${out}`)
  const dump = JSON.parse(fs.readFileSync(out, 'utf-8')) as {evalResult?: StrokeTesterResult}
  if (!dump.evalResult) throw new Error(`${backend} dump has no evalResult`)
  return dump.evalResult
}

const nwExe = resolveNwjsExe()
const haveBundle = fs.existsSync(BUNDLE)
const haveNative = fs.existsSync(NATIVE_ADDON)
const canRun = !!nwExe && haveBundle

if (!canRun) {
  const why = [
    !nwExe && 'nw not resolvable (nwjs/ workspace)',
    !haveBundle && `app bundle missing (${Path.relative(REPO_ROOT, BUNDLE)}; run pnpm build)`,
  ]
    .filter(Boolean)
    .join('; ')
  // eslint-disable-next-line no-console
  console.warn(`[sculptcore-stroke-tester] skipped: ${why}`)
} else if (!haveNative) {
  // eslint-disable-next-line no-console
  console.warn('[sculptcore-stroke-tester] native leg skipped: addon missing (run make.mjs build node)')
}

const backends: Array<'wasm' | 'native'> = haveNative ? ['wasm', 'native'] : ['wasm']
const maybe = canRun ? describe : describe.skip

maybe.each(backends.map((b) => [b] as const))('_sculptcoreStrokeTester (%s)', (backend) => {
  let r: StrokeTesterResult

  beforeAll(() => {
    r = runStrokeTester(nwExe!, backend)
  }, 180000)

  test('driver ran cleanly through the real op path', () => {
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`[sculptcore-stroke-tester] ${backend} driver error:\n${r.error}`)
    }
    expect(r.ok).toBe(true)
  })

  test('stroke emitted evenly-spaced dabs (raycast hit the framed mesh)', () => {
    expect(r.dabs ?? 0).toBeGreaterThan(0)
  })

  test('stroke recorded a non-empty undo step (it mutated geometry)', () => {
    expect(r.stepMem ?? 0).toBeGreaterThan(0)
  })

  test('stroke measurably changed the mesh bounds', () => {
    const delta = Math.abs((r.sizeAfter ?? 0) - (r.sizeBefore ?? 0))
    expect(delta).toBeGreaterThan(1e-4)
  })

  test('undo restores the bounds and redo reproduces the change', () => {
    const before = r.sizeBefore ?? 0
    const after = r.sizeAfter ?? 0
    const delta = Math.abs(after - before)
    // undo returns to the pre-stroke bounds...
    expect(Math.abs((r.sizeUndone ?? 0) - before)).toBeLessThan(delta * 0.05)
    // ...and redo reproduces the post-stroke bounds.
    expect(Math.abs((r.sizeRedone ?? 0) - after)).toBeLessThan(delta * 0.05)
  })
})
