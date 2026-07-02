/**
 * Sculpt-layer integration test — the F1 wasm↔native gate
 * (documentation/plans/displacementAndSubSurf.md).
 *
 * Drives the real NW.js app headlessly per backend on the spherified
 * `litemesh-cube` scene, runs `__layerTest()` (scripts/lite-mesh/
 * litemesh_layertest_support.ts) via `--eval`, and asserts the structured
 * result reflected into the `--dump` JSON as `layertest`. The driver adds a
 * sculpt layer, runs one LAYERDRAW stroke at the +Z pole with the brush
 * program's attr handle pointed at the layer, then undoes one MeshLog step.
 *
 * Per backend: the stroke must deform the surface, one undo must restore the
 * pre-stroke positions, exactly one layer must exist, and the position buffer
 * must stay finite. Cross-backend: the post-stroke position-buffer checksums
 * must be identical (both backends run the same C++ kernel).
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

interface LayerTestResult {
  ok: boolean
  error?: string
  radius?: number
  layerIndex?: number
  layerAttrIndex?: number
  layerCount?: number
  movedCount?: number
  maxDisp?: number
  postChecksum?: number
  postFloatCount?: number
  undoResidual?: number
  nonFiniteCount?: number
}

/** Boot headlessly under `backend`, run __layerTest(), return its result. */
function runLayerTest(nwExe: string, backend: 'wasm' | 'native'): LayerTestResult {
  const dump = bootDump(
    nwExe,
    [
      '--headless',
      '--no-devtools',
      '--backend',
      backend,
      '--gen-scene',
      'litemesh-cube',
      // Moderate density: enough verts under a quarter-radius dab for a clear
      // displacement signal, still fast to build per backend.
      '--scene-arg',
      'subdiv=48',
      '--eval',
      '__layerTest()',
    ],
    {tmpPrefix: 'sclayer-', timeout: 120000}
  ) as {layertest?: LayerTestResult}
  if (!dump.layertest) throw new Error(`${backend} dump has no layertest result`)
  return dump.layertest
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
  console.warn(`[sculptcore-layers] skipped: ${why}`)
} else if (!haveNative) {
  // eslint-disable-next-line no-console
  console.warn('[sculptcore-layers] native leg + cross-compare skipped: addon missing (run make.mjs build node)')
}

const backends: Array<'wasm' | 'native'> = haveNative ? ['wasm', 'native'] : ['wasm']
const maybe = canRun ? describe : describe.skip
const eachBackend = backends.map((b) => [b] as const)

maybe('sculptcore sculpt layers (LAYERDRAW)', () => {
  const results = new Map<'wasm' | 'native', LayerTestResult>()

  beforeAll(() => {
    for (const backend of backends) {
      results.set(backend, runLayerTest(nwExe!, backend))
    }
  }, 300000)

  test.each(eachBackend)('%s: driver ran cleanly', (backend) => {
    const r = results.get(backend)!
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`[sculptcore-layers] ${backend} driver error:\n${r.error}`)
    }
    expect(r.ok).toBe(true)
    expect(r.radius).toBeGreaterThan(0)
  })

  test.each(eachBackend)('%s: exactly one sculpt layer with a valid attr index', (backend) => {
    const r = results.get(backend)!
    expect(r.layerCount).toBe(1)
    expect(r.layerAttrIndex).toBeGreaterThanOrEqual(0)
  })

  test.each(eachBackend)('%s: LAYERDRAW stroke deforms the surface', (backend) => {
    const r = results.get(backend)!
    expect(r.movedCount).toBeGreaterThan(0)
    expect(r.maxDisp).toBeGreaterThan(0)
    // Sanity: a single full-strength dab stays bounded by the brush radius.
    expect(r.maxDisp!).toBeLessThan(r.radius!)
  })

  test.each(eachBackend)('%s: one undo restores the pre-stroke positions', (backend) => {
    const r = results.get(backend)!
    expect(r.undoResidual).toBeLessThan(1e-6)
  })

  test.each(eachBackend)('%s: no NaN/Inf in the post-stroke position buffer', (backend) => {
    const r = results.get(backend)!
    expect(r.nonFiniteCount).toBe(0)
  })

  const crossTest = haveNative ? test : test.skip
  crossTest('post-stroke position buffers are checksum-identical across backends', () => {
    const wasm = results.get('wasm')!
    const native = results.get('native')!
    expect(native.postFloatCount).toBe(wasm.postFloatCount)
    expect(native.postChecksum).toBe(wasm.postChecksum)
  })
})
