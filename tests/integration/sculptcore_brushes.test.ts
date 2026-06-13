/**
 * Brush-behavior integration test (ImmediateTODOs: invert handling, draw-sharp
 * boundedness, mask painting, brush.color piping, accumulate-by-default flags).
 *
 * Drives the real Electron app headlessly per backend on the spherified
 * `litemesh-cube` scene, runs `__brushTest()` (scripts/lite-mesh/
 * litemesh_brushtest_support.ts) via `--eval`, and asserts the structured
 * result reflected into the `--dump` JSON as `brushtest`. The driver runs
 * scripted strokes at the sphere's axis poles via `runSculptcoreStroke` and
 * measures displacement through the GPU position/color vertex buffers — the
 * backend-agnostic bulk-data seam.
 *
 * Prerequisites (else self-skips, logged): a resolvable Electron and the app
 * bundle (`pnpm build`). The native leg additionally needs the N-API addon
 * (`make.mjs node`); without it only the WASM leg runs.
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

interface StrokeMetrics {
  maxDisp: number
  movedCount: number
  meanAlongNormal: number
  invalid?: string
}

interface BrushTestResult {
  ok: boolean
  error?: string
  drawForward?: StrokeMetrics
  drawInverted?: StrokeMetrics
  sharp?: StrokeMetrics
  drawMasked?: StrokeMetrics
  drawMaskErased?: StrokeMetrics
  smoothInverted?: StrokeMetrics
  kelvinlet?: StrokeMetrics
  grab?: StrokeMetrics
  snakehook?: StrokeMetrics
  color?: {paintedCount: number; meanR: number; meanG: number; meanB: number; invalid?: string}
  accumulateDefaults?: Record<string, boolean>
  nonFiniteCount?: number
  radius?: number
}

/** Resolve the Electron executable via the electron/ workspace package. */
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

/** Boot headlessly under `backend`, run __brushTest(), return its result. */
function runBrushTest(electronExe: string, backend: 'wasm' | 'native'): BrushTestResult {
  const out = Path.join(fs.mkdtempSync(Path.join(os.tmpdir(), 'scbrush-')), `${backend}.json`)
  const env = {...process.env}
  delete env.ELECTRON_RUN_AS_NODE // else electron runs as plain node, no window
  execFileSync(
    electronExe,
    [
      Path.join(REPO_ROOT, 'electron', 'main.js'),
      '--headless',
      '--no-devtools',
      '--backend',
      backend,
      '--gen-scene',
      'litemesh-cube',
      // Moderate density: enough verts under a quarter-radius dab for stable
      // displacement statistics, still fast to build per backend.
      '--scene-arg',
      'subdiv=48',
      '--eval',
      '__brushTest()',
      '--dump',
      out,
      '--exit',
    ],
    {cwd: REPO_ROOT, env, encoding: 'utf-8', stdio: 'pipe', timeout: 120000}
  )
  if (!fs.existsSync(out)) throw new Error(`${backend} dump not written to ${out}`)
  const dump = JSON.parse(fs.readFileSync(out, 'utf-8')) as {brushtest?: BrushTestResult}
  if (!dump.brushtest) throw new Error(`${backend} dump has no brushtest result`)
  return dump.brushtest
}

const electronExe = resolveElectronExe()
const haveBundle = fs.existsSync(BUNDLE)
const haveNative = fs.existsSync(NATIVE_ADDON)
const canRun = !!electronExe && haveBundle

if (!canRun) {
  const why = [
    !electronExe && 'electron not resolvable (electron/ workspace)',
    !haveBundle && `app bundle missing (${Path.relative(REPO_ROOT, BUNDLE)}; run pnpm build)`,
  ]
    .filter(Boolean)
    .join('; ')
  // eslint-disable-next-line no-console
  console.warn(`[sculptcore-brushes] skipped: ${why}`)
} else if (!haveNative) {
  // eslint-disable-next-line no-console
  console.warn('[sculptcore-brushes] native leg skipped: addon missing (run make.mjs node)')
}

const backends: Array<'wasm' | 'native'> = haveNative ? ['wasm', 'native'] : ['wasm']
const maybe = canRun ? describe : describe.skip

maybe.each(backends.map((b) => [b] as const))('sculptcore brush behavior (%s)', (backend) => {
  let r: BrushTestResult

  beforeAll(() => {
    r = runBrushTest(electronExe!, backend)
  }, 180000)

  test('driver ran cleanly', () => {
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`[sculptcore-brushes] ${backend} driver error:\n${r.error}`)
    }
    expect(r.ok).toBe(true)
    expect(r.radius).toBeGreaterThan(0)
  })

  test('smoothing/inflate/clay brushes accumulate by default', () => {
    expect(r.accumulateDefaults).toEqual({
      smooth     : true,
      bsmooth    : true,
      paintSmooth: true,
      inflate    : true,
      clay       : true,
    })
  })

  test('forward DRAW raises geometry along the dab normal', () => {
    expect(r.drawForward?.invalid).toBeUndefined()
    expect(r.drawForward!.movedCount).toBeGreaterThan(0)
    expect(r.drawForward!.meanAlongNormal).toBeGreaterThan(0)
  })

  test('inverted DRAW digs inward (invert flag respected)', () => {
    expect(r.drawInverted?.invalid).toBeUndefined()
    expect(r.drawInverted!.movedCount).toBeGreaterThan(0)
    expect(r.drawInverted!.meanAlongNormal).toBeLessThan(0)
  })

  test('draw-sharp displacement stays bounded (no explosion)', () => {
    expect(r.sharp?.invalid).toBeUndefined()
    expect(r.sharp!.movedCount).toBeGreaterThan(0)
    // Regression for the absolute-step explosion: three dabs of tangential
    // pull must stay well inside the brush radius.
    expect(r.sharp!.maxDisp).toBeLessThan(r.radius!)
  })

  test('saturated mask gates a subsequent DRAW', () => {
    expect(r.drawMasked?.invalid).toBeUndefined()
    // Inside the masked disk displacement must collapse vs the unmasked draw.
    expect(r.drawMasked!.maxDisp).toBeLessThan(r.drawForward!.maxDisp * 0.2)
  })

  test('inverted mask stroke erases mask (draw comes back)', () => {
    expect(r.drawMaskErased?.invalid).toBeUndefined()
    expect(r.drawMaskErased!.movedCount).toBeGreaterThan(0)
    expect(r.drawMaskErased!.meanAlongNormal).toBeGreaterThan(0)
    expect(r.drawMaskErased!.maxDisp).toBeGreaterThan(r.drawMasked!.maxDisp * 2)
  })

  test('smooth ignores invert and stays bounded', () => {
    expect(r.smoothInverted?.invalid).toBeUndefined()
    expect(r.smoothInverted!.maxDisp).toBeLessThan(r.radius!)
  })

  test('kelvinlet grab pulls the surface in the stroke direction, bounded', () => {
    expect(r.kelvinlet?.invalid).toBeUndefined()
    expect(r.kelvinlet!.movedCount).toBeGreaterThan(0)
    // Verts follow the +X march (grab direction); elastic field stays bounded.
    expect(r.kelvinlet!.meanAlongNormal).toBeGreaterThan(0)
    expect(r.kelvinlet!.maxDisp).toBeLessThan(r.radius! * 2)
  })

  test('grab drags the surface in the stroke direction, bounded', () => {
    expect(r.grab?.invalid).toBeUndefined()
    expect(r.grab!.movedCount).toBeGreaterThan(0)
    expect(r.grab!.meanAlongNormal).toBeGreaterThan(0)
    expect(r.grab!.maxDisp).toBeLessThan(r.radius! * 2)
  })

  test('snakehook drags + gathers in the stroke direction, bounded', () => {
    expect(r.snakehook?.invalid).toBeUndefined()
    expect(r.snakehook!.movedCount).toBeGreaterThan(0)
    expect(r.snakehook!.meanAlongNormal).toBeGreaterThan(0)
    expect(r.snakehook!.maxDisp).toBeLessThan(r.radius! * 2)
  })

  test('brush.color reaches the color kernel', () => {
    expect(r.color?.invalid).toBeUndefined()
    expect(r.color!.paintedCount).toBeGreaterThan(0)
    // The old kernel hardcoded red; painting (0.1, 0.9, 0.3) must leave a
    // green-dominant mean over the painted verts.
    expect(r.color!.meanG).toBeGreaterThan(r.color!.meanR)
    expect(r.color!.meanG).toBeGreaterThan(r.color!.meanB)
  })

  test('no NaN/Inf in the final position buffer', () => {
    expect(r.nonFiniteCount).toBe(0)
  })
})
