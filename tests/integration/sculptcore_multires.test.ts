/**
 * Multires subsurf integration test — the S app-wiring wasm↔native gate
 * (documentation/plans/displacementAndSubSurf.md).
 *
 * Drives the real NW.js app headlessly per backend on the spherified
 * `litemesh-cube` scene, runs `__multiresTest()` (scripts/lite-mesh/
 * litemesh_multirestest_support.ts) via `--eval`, and asserts the structured
 * result reflected into the `--dump` JSON as `evalResult`. The driver enables
 * a 3-level stack, proves the level round-trip is lossless, strokes the finest
 * level through the real sculpt seam (stroke-end writeback), round-trips the
 * stroke through MeshLog undo/redo, down-refits it into level 2, and deletes
 * the stack.
 *
 * Per backend: round-trip bit-stable, stroke deforms, undo/redo exact, refit
 * preserves the fine surface while moving the coarse one, cage restored.
 * Cross-backend: level counts and every position checksum must be identical
 * (the stencil chain is fma-anchored and the CG solve is deterministic).
 *
 * Prerequisites (else self-skips, logged): a resolvable NW.js and the app
 * bundle (`pnpm build`). The native leg additionally needs the N-API addon
 * (`make.mjs build node`); without it only the WASM leg + no cross-compare run.
 */

import fs from 'node:fs'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'
import {bootDump, resolveNwjsExe} from './nwjs_boot'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '../..')
const BUNDLE = Path.join(REPO_ROOT, 'build', 'entry_point.js')
const NATIVE_ADDON = Path.join(REPO_ROOT, 'sculptcore', 'build', 'native-node', 'sculptcore_node.node')

interface MultiresTestResult {
  ok: boolean
  error?: string
  radius?: number
  cageVerts?: number
  cageFaces?: number
  levels?: number
  levelVerts?: number
  levelFaces?: number
  roundTripOk?: boolean
  baseChecksum?: number
  baseFloatCount?: number
  movedCount?: number
  maxDisp?: number
  postChecksum?: number
  postFloatCount?: number
  undoResidual?: number
  redoResidual?: number
  level2PreChecksum?: number
  level2PostChecksum?: number
  level2FloatCount?: number
  refitChanged?: number
  refitFineResidual?: number
  cageRestored?: boolean
}

function runMultiresTest(nwExe: string, backend: 'wasm' | 'native'): MultiresTestResult {
  const dump = bootDump(
    nwExe,
    [
      '--headless',
      '--no-devtools',
      '--backend',
      backend,
      '--gen-scene',
      'litemesh-cube',
      // Small cage: 3 levels of CC refinement multiply the face count 64x, so
      // keep the cube coarse (levels drive the density, not the cage).
      '--scene-arg',
      'subdiv=6',
      '--eval',
      'globalThis.__evalTestResult = __multiresTest()',
    ],
    {tmpPrefix: 'scmultires-', timeout: 180000}
  ) as {evalResult?: MultiresTestResult}
  if (!dump.evalResult) throw new Error(`${backend} dump has no multiresTest result`)
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
  console.warn(`[sculptcore-multires] skipped: ${why}`)
} else if (!haveNative) {
  // eslint-disable-next-line no-console
  console.warn('[sculptcore-multires] native leg + cross-compare skipped: addon missing (run make.mjs build node)')
}

const backends: Array<'wasm' | 'native'> = haveNative ? ['wasm', 'native'] : ['wasm']
const maybe = canRun ? describe : describe.skip
const eachBackend = backends.map((b) => [b] as const)

maybe('sculptcore multires subsurf (level switch / writeback / down-refit)', () => {
  const results = new Map<'wasm' | 'native', MultiresTestResult>()

  beforeAll(() => {
    for (const backend of backends) {
      results.set(backend, runMultiresTest(nwExe!, backend))
    }
  }, 600000)

  test.each(eachBackend)('%s: driver ran cleanly', (backend) => {
    const r = results.get(backend)!
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`[sculptcore-multires] ${backend} driver error:\n${r.error}`)
    }
    expect(r.ok).toBe(true)
    expect(r.radius).toBeGreaterThan(0)
  })

  test.each(eachBackend)('%s: enable refines the cage into a 3-level stack', (backend) => {
    const r = results.get(backend)!
    expect(r.levels).toBe(3)
    // Uniform CC: every level multiplies faces by 4; level 3 = 64x the cage
    // quads (the spherified cube is all-quads already).
    expect(r.levelFaces).toBe(r.cageFaces! * 64)
    expect(r.levelVerts).toBeGreaterThan(r.cageVerts!)
  })

  test.each(eachBackend)('%s: level switch round-trip is bit-stable (S3 gate)', (backend) => {
    expect(results.get(backend)!.roundTripOk).toBe(true)
  })

  test.each(eachBackend)('%s: DRAW stroke on the finest level deforms the surface', (backend) => {
    const r = results.get(backend)!
    expect(r.movedCount).toBeGreaterThan(0)
    expect(r.maxDisp).toBeGreaterThan(0)
    expect(r.maxDisp!).toBeLessThan(r.radius!)
  })

  test.each(eachBackend)('%s: MeshLog undo/redo round-trips exactly (+ store resync)', (backend) => {
    const r = results.get(backend)!
    expect(r.undoResidual).toBeLessThan(1e-6)
    expect(r.redoResidual).toBeLessThan(1e-6)
  })

  test.each(eachBackend)('%s: down-refit moves level 2 and preserves level 3', (backend) => {
    const r = results.get(backend)!
    expect(r.refitChanged).toBeGreaterThan(0)
    expect(r.refitFineResidual).toBeLessThan(1e-6)
    expect(r.level2PostChecksum).not.toBe(r.level2PreChecksum)
  })

  test.each(eachBackend)('%s: delete restores the cage', (backend) => {
    expect(results.get(backend)!.cageRestored).toBe(true)
  })

  const crossTest = haveNative ? test : test.skip
  crossTest('level meshes and refit results are checksum-identical across backends', () => {
    const wasm = results.get('wasm')!
    const native = results.get('native')!
    expect(native.levelVerts).toBe(wasm.levelVerts)
    expect(native.levelFaces).toBe(wasm.levelFaces)
    expect(native.baseFloatCount).toBe(wasm.baseFloatCount)
    expect(native.baseChecksum).toBe(wasm.baseChecksum)
    expect(native.postFloatCount).toBe(wasm.postFloatCount)
    expect(native.postChecksum).toBe(wasm.postChecksum)
    expect(native.refitChanged).toBe(wasm.refitChanged)
    expect(native.level2FloatCount).toBe(wasm.level2FloatCount)
    expect(native.level2PreChecksum).toBe(wasm.level2PreChecksum)
    expect(native.level2PostChecksum).toBe(wasm.level2PostChecksum)
  })
})
