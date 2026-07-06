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

import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'
import {bootDump, resolveNwjsExe, NWJS_APP_DIR} from './nwjs_boot'
import {decodePngGray, meanAbsDiff, type GrayImage} from '../lib/png_gray'

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

/** `__multiresVdmTest()` result — the X1 VDM-on-finest-level gate. */
interface MultiresVdmTestResult {
  ok: boolean
  error?: string
  radius?: number
  levels?: number
  texelsTouched?: number
  clampedDefault?: number
  promptSignal?: number
  tileCount?: number
  atlasFloatCount?: number
  atlasChecksum?: number
  atlasQuantChecksum?: number
  atlasMaxAbs?: number
  posChecksumBefore?: number
  posChecksumAfter?: number
  hasVdmAfterSwitch?: boolean
  atlasStableAcrossSwitch?: boolean
}

/** `__stencilAmplifyTest()` result — the X3 stage-1 TS-device SpMV gate. */
interface StencilAmplifyResult {
  ok: boolean
  error?: string
  editLevel?: number
  renderLevel?: number
  fineCount?: number
  nnz?: number
  diffs?: number
  maxAbsErr?: number
  jsVsCpu?: number
  jsVsGpu?: number
  gpuChecksum?: number
  cpuChecksum?: number
  triIndexCount?: number
  triIndexOk?: boolean
}

function runMultiresTest(
  nwExe: string,
  backend: 'wasm' | 'native'
): {base: MultiresTestResult; vdm: MultiresVdmTestResult; amp: StencilAmplifyResult} {
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
      'globalThis.__evalTestResult = {base: __multiresTest(), vdm: __multiresVdmTest()}',
      // Async driver: the harness awaits each eval's RESULT, so return the
      // promise chain (top-level await is not legal in an eval'd script).
      '--eval',
      '__stencilAmplifyTest().then(r => { globalThis.__evalTestResult.amp = r })',
    ],
    {tmpPrefix: 'scmultires-', timeout: 180000}
  ) as {
    evalResult?: {base?: MultiresTestResult; vdm?: MultiresVdmTestResult; amp?: StencilAmplifyResult}
  }
  if (!dump.evalResult?.base) throw new Error(`${backend} dump has no multiresTest result`)
  if (!dump.evalResult?.vdm) throw new Error(`${backend} dump has no multiresVdmTest result`)
  if (!dump.evalResult?.amp) throw new Error(`${backend} dump has no stencilAmplifyTest result`)
  return {base: dump.evalResult.base, vdm: dump.evalResult.vdm, amp: dump.evalResult.amp}
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
  const vdmResults = new Map<'wasm' | 'native', MultiresVdmTestResult>()
  const ampResults = new Map<'wasm' | 'native', StencilAmplifyResult>()

  beforeAll(() => {
    for (const backend of backends) {
      const r = runMultiresTest(nwExe!, backend)
      results.set(backend, r.base)
      vdmResults.set(backend, r.vdm)
      ampResults.set(backend, r.amp)
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

  // --- X1 gate: a VDM layer on the finest multires level. ---

  test.each(eachBackend)('%s: VDM driver ran cleanly', (backend) => {
    const r = vdmResults.get(backend)!
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`[sculptcore-multires] ${backend} VDM driver error:\n${r.error}`)
    }
    expect(r.ok).toBe(true)
    expect(r.levels).toBe(2)
  })

  test.each(eachBackend)('%s: splat lands through the synthesized grid-chart UVs', (backend) => {
    const r = vdmResults.get(backend)!
    expect(r.texelsTouched).toBeGreaterThan(0)
    expect(r.tileCount).toBeGreaterThan(0)
  })

  test.each(eachBackend)('%s: VDM splat moves no vertices', (backend) => {
    const r = vdmResults.get(backend)!
    expect(r.posChecksumAfter).toBe(r.posChecksumBefore)
  })

  test.each(eachBackend)('%s: the clamp ceiling fires the add-a-level prompt signal', (backend) => {
    const r = vdmResults.get(backend)!
    // Near-zero α collapses the fold ceiling — most of the footprint clamps.
    expect(r.promptSignal).toBeGreaterThan(r.texelsTouched! / 2)
  })

  test.each(eachBackend)('%s: the store survives a level switch bit-exactly', (backend) => {
    const r = vdmResults.get(backend)!
    expect(r.hasVdmAfterSwitch).toBe(true)
    expect(r.atlasStableAcrossSwitch).toBe(true)
  })

  // --- X3 stage 1: the TS-device stencil SpMV reproduces the CPU chain. ---

  test.each(eachBackend)('%s: amplification export seam is bit-exact; GPU within tolerance', (backend) => {
    const r = ampResults.get(backend)!
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`[sculptcore-multires] ${backend} amplify driver error:\n${r.error}`)
    }
    expect(r.ok).toBe(true)
    expect(r.fineCount).toBeGreaterThan(0)
    // The export seam (tables, row order, src) is gated bit-exact via the
    // JS fma-exact eval; the GPU gets a display-tier absolute tolerance —
    // Dawn's D3D12 path lowers WGSL fma unfused (1-ulp-class noise; native
    // wgpu is bit-exact per the S5 gate), and determinism is gated by the
    // exact cross-backend checksum below.
    // eslint-disable-next-line no-console
    console.log(
      `[sculptcore-multires] ${backend} amplify diffs=${r.diffs} maxAbsErr=${r.maxAbsErr} jsVsCpu=${r.jsVsCpu}`
    )
    expect(r.jsVsCpu).toBe(0)
    expect(r.maxAbsErr).toBeLessThanOrEqual(1e-5)
  })

  test.each(eachBackend)('%s: the render-level index emitter is sane', (backend) => {
    const r = ampResults.get(backend)!
    expect(r.triIndexOk).toBe(true)
    expect(r.triIndexCount).toBeGreaterThan(0)
    expect(r.triIndexCount! % 3).toBe(0)
  })

  crossTest('amplified positions are checksum-identical across backends', () => {
    const wasm = ampResults.get('wasm')!
    const native = ampResults.get('native')!
    expect(native.fineCount).toBe(wasm.fineCount)
    expect(native.nnz).toBe(wasm.nnz)
    expect(native.gpuChecksum).toBe(wasm.gpuChecksum)
    expect(native.triIndexCount).toBe(wasm.triIndexCount)
  })

  crossTest('VDM atlases agree across backends (quantized signature)', () => {
    const wasm = vdmResults.get('wasm')!
    const native = vdmResults.get('native')!
    expect(native.texelsTouched).toBe(wasm.texelsTouched)
    expect(native.clampedDefault).toBe(wasm.clampedDefault)
    expect(native.promptSignal).toBe(wasm.promptSignal)
    expect(native.tileCount).toBe(wasm.tileCount)
    expect(native.atlasFloatCount).toBe(wasm.atlasFloatCount)
    // Bit-exact since the F3 frame provider went transcendental-free (the X1
    // follow-up): the curvature seed now uses only IEEE-exact ops, so frames —
    // and therefore texels — are identical across backends.
    expect(native.atlasQuantChecksum).toBe(wasm.atlasQuantChecksum)
    expect(native.atlasChecksum).toBe(wasm.atlasChecksum)
  })
})

// --- X2 stage 3: the Ptex fragment render gate (screenshot A/B) ------------

interface PtexRenderResult {
  ok: boolean
  error?: string
  mode?: string
  charts?: number
  texelsTouched?: number
  tileCount?: number
}

/** Boot on litemesh-cube, drive `__vdmRenderTest(mode)` (the vdmrender support
 * gained 'mrflat'/'ptex' modes), capture the screenshot. */
function runPtexRender(
  nwExe: string,
  backend: 'wasm' | 'native',
  mode: 'mrflat' | 'ptex'
): {result: PtexRenderResult; image: GrayImage} {
  const dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'ptexrender-'))
  const dumpPath = Path.join(dir, 'dump.json')
  const pngPath = Path.join(dir, 'shot.png')
  execFileSync(
    nwExe,
    [
      NWJS_APP_DIR,
      '--apptest-headless',
      '--no-devtools',
      '--backend',
      backend,
      '--gen-scene',
      'litemesh-cube',
      '--scene-arg',
      'subdiv=6',
      `--eval=__vdmRenderTest('${mode}')`,
      '--dump',
      dumpPath,
      '--screenshot',
      pngPath,
      '--exit',
    ],
    {cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 180000}
  )
  if (!fs.existsSync(dumpPath)) throw new Error(`${backend}/${mode}: dump not written`)
  if (!fs.existsSync(pngPath)) throw new Error(`${backend}/${mode}: screenshot not written`)
  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf-8')) as {evalResult?: PtexRenderResult}
  if (!dump.evalResult) throw new Error(`${backend}/${mode}: dump has no evalResult`)
  return {result: dump.evalResult, image: decodePngGray(fs.readFileSync(pngPath))}
}

maybe('sculptcore tessellated tier render (X3 stage 2 screenshot A/B)', () => {
  let coarse!: {result: PtexRenderResult; image: GrayImage}
  let fine!: {result: PtexRenderResult; image: GrayImage}
  let tess!: {result: PtexRenderResult; image: GrayImage}
  let tessVdm!: {result: PtexRenderResult; image: GrayImage}
  let tessNative: {result: PtexRenderResult; image: GrayImage} | undefined
  let tessVdmNative: {result: PtexRenderResult; image: GrayImage} | undefined

  beforeAll(() => {
    coarse = runPtexRender(nwExe!, 'wasm', 'mrcoarse' as never)
    fine = runPtexRender(nwExe!, 'wasm', 'mrflat')
    tess = runPtexRender(nwExe!, 'wasm', 'tess' as never)
    tessVdm = runPtexRender(nwExe!, 'wasm', 'tessvdm' as never)
    if (haveNative) {
      tessNative = runPtexRender(nwExe!, 'native', 'tess' as never)
      tessVdmNative = runPtexRender(nwExe!, 'native', 'tessvdm' as never)
    }
  }, 900000)

  test('drivers ran cleanly', () => {
    for (const run of [coarse, fine, tess, tessVdm]) {
      if (!run.result.ok) {
        // eslint-disable-next-line no-console
        console.error(`[tess-render] ${run.result.mode} error:\n${run.result.error}`)
      }
      expect(run.result.ok).toBe(true)
    }
  })

  test('the tessellated draw shows the amplified geometry, not the cage', () => {
    const vsFine = meanAbsDiff(tess.image, fine.image)
    const vsCoarse = meanAbsDiff(tess.image, coarse.image)
    const fineVsCoarse = meanAbsDiff(fine.image, coarse.image)
    // eslint-disable-next-line no-console
    console.log(
      `[tess-render] tess-vs-fine=${vsFine.toFixed(4)} tess-vs-coarse=${vsCoarse.toFixed(4)} ` +
        `fine-vs-coarse=${fineVsCoarse.toFixed(4)}`
    )
    // The coarse and fine levels must actually differ for the A/B to mean
    // anything; tess (same geometry as fine, shading residual only — the
    // finalize pass computes 4-neighbour lattice normals vs the batch's full
    // 1-ring v.no, measured 0.055 vs 0.23 level separation) must sit well
    // inside half the level separation.
    expect(fineVsCoarse).toBeGreaterThan(0.05)
    expect(vsFine).toBeLessThan(0.1)
    expect(vsFine).toBeLessThan(vsCoarse * 0.5)
  })

  test('the stage-3 VDM apply displaces the tessellated silhouette', () => {
    expect(tessVdm.result.texelsTouched).toBeGreaterThan(0)
    const vsTess = meanAbsDiff(tessVdm.image, tess.image)
    // eslint-disable-next-line no-console
    console.log(`[tess-render] tessvdm-vs-tess=${vsTess.toFixed(4)}`)
    // The splat dab must visibly move the amplified surface (the fragment
    // tier shades but cannot move silhouettes — this tier can).
    expect(vsTess).toBeGreaterThan(0.05)
  })

  const parityTest = haveNative ? test : test.skip
  parityTest(
    'native and wasm render the same tessellated images',
    () => {
      expect(tessNative!.result.ok).toBe(true)
      const d = meanAbsDiff(tessNative!.image, tess.image)
      const dv = meanAbsDiff(tessVdmNative!.image, tessVdm.image)
      // eslint-disable-next-line no-console
      console.log(`[tess-render] meanAbs(native-wasm) tess=${d.toFixed(4)} tessvdm=${dv.toFixed(4)}`)
      expect(d).toBeLessThan(0.1)
      expect(dv).toBeLessThan(0.1)
    },
    240000
  )
})

maybe('sculptcore Ptex fragment render (screenshot A/B)', () => {
  let flat!: {result: PtexRenderResult; image: GrayImage}
  let ptex!: {result: PtexRenderResult; image: GrayImage}
  let ptexNative: {result: PtexRenderResult; image: GrayImage} | undefined

  beforeAll(() => {
    flat = runPtexRender(nwExe!, 'wasm', 'mrflat')
    ptex = runPtexRender(nwExe!, 'wasm', 'ptex')
    if (haveNative) {
      ptexNative = runPtexRender(nwExe!, 'native', 'ptex')
    }
  }, 600000)

  test('drivers ran cleanly and the splat landed', () => {
    for (const run of [flat, ptex]) {
      if (!run.result.ok) {
        // eslint-disable-next-line no-console
        console.error(`[ptex-render] ${run.result.mode} error:\n${run.result.error}`)
      }
      expect(run.result.ok).toBe(true)
    }
    expect(ptex.result.texelsTouched).toBeGreaterThan(0)
    expect(ptex.result.tileCount).toBeGreaterThan(0)
  })

  test('the VDM_PTEX sampler visibly displaces the shading', () => {
    expect(ptex.image.width).toBe(flat.image.width)
    const d = meanAbsDiff(ptex.image, flat.image)
    // eslint-disable-next-line no-console
    console.log(`[ptex-render] meanAbs(ptex-flat)=${d.toFixed(4)}`)
    expect(d).toBeGreaterThan(0.1)
  })

  const parityTest = haveNative ? test : test.skip
  parityTest(
    'native and wasm render the same ptex image',
    () => {
      expect(ptexNative!.result.ok).toBe(true)
      expect(ptexNative!.result.texelsTouched).toBe(ptex.result.texelsTouched)
      expect(ptexNative!.result.tileCount).toBe(ptex.result.tileCount)
      const d = meanAbsDiff(ptexNative!.image, ptex.image)
      // eslint-disable-next-line no-console
      console.log(`[ptex-render] meanAbs(native-wasm)=${d.toFixed(4)}`)
      expect(d).toBeLessThan(0.1)
    },
    240000
  )
})
