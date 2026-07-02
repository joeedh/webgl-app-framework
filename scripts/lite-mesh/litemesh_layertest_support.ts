/**
 * Integration-test support for sculpt layers (workstream F1 of
 * documentation/plans/displacementAndSubSurf.md). Exposes
 * `globalThis.__layerTest()`, driven by the NW.js headless harness via
 * `--eval` (see `tests/integration/sculptcore_layers.test.ts`); the result is
 * reflected into the `--dump` JSON as `layertest`.
 *
 * On the spherified `litemesh-cube` scene it adds a sculpt layer
 * (`Mesh.sculptLayerAdd`), runs one scripted LAYERDRAW stroke at the +Z pole
 * with the brush program's command 0 attr handle pointed at the layer's
 * vertex attr, and measures through the GPU position buffer (the
 * backend-agnostic bulk-data seam): displacement metrics, an FNV-1a checksum
 * of the post-stroke buffer (the wasm↔native bit-parity gate), and the
 * residual after one MeshLog undo (which must restore `co` and the layer
 * atomically).
 */

import {BrushFlags, SculptTools} from '../brush/brush_base'
import {DefaultBrushes} from '../brush/index'
import {SculptBrushes} from '@sculptcore/api/sculptcore/brush/SculptBrushes'
import {runSculptcoreStroke, SculptPaintOp} from '../editors/view3d/tools/sculptcore_ops'
import {LiteMesh} from './litemesh'
import {readGpuBuffer} from './litemesh_brushtest_support'

interface LayerTestResult {
  ok: boolean
  error?: string
  /** Brush radius used (a quarter of the sphere's pole distance). */
  radius?: number
  /** Settings index returned by sculptLayerAdd (expected 0). */
  layerIndex?: number
  /** The layer's attr index in the VERTEX AttrGroup (must be >= 0). */
  layerAttrIndex?: number
  /** sculptLayerCount() after the add (expected 1). */
  layerCount?: number
  /** Render-vertices moved > 1e-6 by the LAYERDRAW stroke. */
  movedCount?: number
  /** Largest per-render-vertex displacement of the stroke. */
  maxDisp?: number
  /** FNV-1a (32-bit) over the post-stroke position buffer bytes. */
  postChecksum?: number
  /** Float count of the post-stroke position buffer. */
  postFloatCount?: number
  /** Max |undone - preStroke| after one MeshLog undo (expected 0). */
  undoResidual?: number
  /** Non-finite floats in the post-stroke position buffer (must be 0). */
  nonFiniteCount?: number
}

/** FNV-1a 32-bit hash over the raw bytes of a Float32Array. */
function fnv1a(buf: Float32Array): number {
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  let h = 0x811c9dc5
  for (let i = 0; i < u8.length; i++) {
    h ^= u8[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Largest per-vertex displacement length between two position snapshots. */
function maxResidual(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity
  let max = 0
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1], b[i + 2] - a[i + 2])
    if (d > max) max = d
  }
  return max
}

function layerTest(): LayerTestResult {
  const result: LayerTestResult = {ok: false}
  const g = globalThis as unknown as {
    _appstate?: {ctx?: {object?: {data?: unknown}}}
    __layerTestResult?: LayerTestResult
  }
  try {
    const mesh = g._appstate?.ctx?.object?.data
    if (!(mesh instanceof LiteMesh)) throw new Error('active object is not a LiteMesh')

    const brush = DefaultBrushes.slotMap[SculptTools.DRAW]
    if (!brush) throw new Error('no default DRAW brush')

    // Recover the sphere's +Z pole distance from the position buffer.
    const pos0 = readGpuBuffer(mesh, 'position')
    if (!pos0) throw new Error('position buffer unreadable')
    let R = 0
    for (let i = 0; i < pos0.length; i += 3) {
      if (pos0[i + 2] > R) R = pos0[i + 2]
    }
    const radius = R * 0.25
    result.radius = radius

    const saved = {tool: brush.tool, strength: brush.strength, flag: brush.flag, autosmooth: brush.autosmooth}
    try {
      brush.tool = SculptTools.DRAW
      brush.autosmooth = 0
      brush.flag &= ~BrushFlags.ACCUMULATE

      // The first stroke triggers a GPU re-batch (the buffer set changes
      // length), so settle the layout with a zero-strength warmup first.
      brush.strength = 0
      runSculptcoreStroke({mesh, brush, dabs: [{p: [0, 0, R], normal: [0, 0, 1]}], radius})
      brush.strength = 1

      const li = mesh.mesh.sculptLayerAdd()
      result.layerIndex = li
      result.layerAttrIndex = mesh.mesh.sculptLayerAttrIndex(li)
      result.layerCount = mesh.mesh.sculptLayerCount()
      if (result.layerAttrIndex < 0) throw new Error('sculptLayerAttrIndex returned ' + result.layerAttrIndex)

      const before = readGpuBuffer(mesh, 'position')
      if (!before) throw new Error('pre-stroke position buffer unreadable')

      // One LAYERDRAW dab at the +Z pole, its slayer handle (manifest attrIdx
      // 0) pointed at the fresh layer's vertex attr.
      runSculptcoreStroke({
        mesh,
        brush,
        dabs             : [{p: [0, 0, R], normal: [0, 0, 1]}],
        radius,
        brushTypeOverride: SculptBrushes.LAYERDRAW,
        attrLayerOverride: {attrIdx: 0, layerIndex: result.layerAttrIndex},
      })

      const after = readGpuBuffer(mesh, 'position')
      if (!after || after.length !== before.length) {
        throw new Error('post-stroke position buffer unreadable/resized')
      }

      let moved = 0
      let maxDisp = 0
      let bad = 0
      for (let i = 0; i < after.length; i++) {
        if (!Number.isFinite(after[i])) bad++
      }
      for (let i = 0; i < after.length; i += 3) {
        const d = Math.hypot(after[i] - before[i], after[i + 1] - before[i + 1], after[i + 2] - before[i + 2])
        if (d > 1e-6) {
          moved++
          if (d > maxDisp) maxDisp = d
        }
      }
      result.movedCount = moved
      result.maxDisp = maxDisp
      result.nonFiniteCount = bad
      result.postChecksum = fnv1a(after)
      result.postFloatCount = after.length

      // One undo of the stroke's MeshLog step (the same path SculptPaintOp.undo
      // takes) must restore the pre-stroke positions exactly — `save vertex co,
      // no, slayer` records positions and the layer atomically.
      SculptPaintOp.meshLog!.undo(mesh.mesh, mesh.spatial)
      mesh.regenBounds()
      mesh.meshRevision++
      const undone = readGpuBuffer(mesh, 'position')
      if (!undone) throw new Error('post-undo position buffer unreadable')
      result.undoResidual = maxResidual(before, undone)
    } finally {
      brush.tool = saved.tool
      brush.strength = saved.strength
      brush.flag = saved.flag
      brush.autosmooth = saved.autosmooth
    }

    result.ok = true
  } catch (err) {
    result.error = String(err instanceof Error ? err.stack ?? err.message : err)
  }
  g.__layerTestResult = result
  return result
}

;(globalThis as {__layerTest?: typeof layerTest}).__layerTest = layerTest

export {layerTest}
