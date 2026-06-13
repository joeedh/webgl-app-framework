/**
 * Integration-test support for sculptcore brush behavior. Exposes
 * `globalThis.__brushTest()`, which the Electron headless harness drives from
 * `--eval` (see `tests/integration/sculptcore_brushes.test.ts`); the result is
 * reflected into the `--dump` JSON as `brushtest`.
 *
 * Runs scripted strokes (via `runSculptcoreStroke`) at the six axis poles of
 * the spherified `litemesh-cube` scene — the octahedral symmetry makes the
 * poles statistically equivalent, so displacement magnitudes are comparable
 * across scenarios. Geometry is observed through the GPU vertex buffers (the
 * backend-agnostic bulk-data seam; raw vertex `co` isn't JS-readable on
 * native), diffing the `position` buffer before/after each stroke and reading
 * the legacy `color` stream for paint.
 *
 * Covered behaviors (ImmediateTODOs): brush invert (forward vs inverted DRAW
 * displacement direction), draw-sharp boundedness, mask painting gating a
 * subsequent DRAW, inverted mask strokes erasing mask, `brush.color` reaching
 * the color kernel, and the accumulate-by-default brush flags.
 */

import {Vector4} from '../path.ux/scripts/pathux.js'
import {BrushFlags, SculptTools} from '../brush/brush_base'
import type {SculptBrush} from '../brush/index'
import {runSculptcoreStroke} from '../editors/view3d/tools/sculptcore_ops'
import {AttrDomain, AttrUseFlags, LiteMesh} from './litemesh'
import {AttrType} from './litemesh_base'

/** Displacement metrics for one stroke, from the position-buffer diff. */
interface StrokeMetrics {
  /** Largest per-render-vertex displacement length. */
  maxDisp: number
  /** Render-vertices that moved more than 1e-6. */
  movedCount: number
  /** Mean displacement component along the dab normal, over moved verts. */
  meanAlongNormal: number
  /** Buffer length mismatch / missing buffer — metrics invalid. */
  invalid?: string
}

interface BrushTestResult {
  ok: boolean
  error?: string
  /** Forward DRAW at +Z: meanAlongNormal must be > 0. */
  drawForward?: StrokeMetrics
  /** Inverted DRAW at -Z: meanAlongNormal must be < 0 (digs inward). */
  drawInverted?: StrokeMetrics
  /** SHARP at +X: maxDisp must stay well under the brush radius. */
  sharp?: StrokeMetrics
  /** DRAW at -X after saturating mask there: movedCount/maxDisp ≈ 0. */
  drawMasked?: StrokeMetrics
  /** DRAW at +Y after mask paint + inverted mask erase: ≈ drawForward. */
  drawMaskErased?: StrokeMetrics
  /** Inverted SMOOTH at -Y: invert is ignored, must stay bounded. */
  smoothInverted?: StrokeMetrics
  /** KELVINLET grab at +Z with dabs moving +X: pulls verts along +X, bounded. */
  kelvinlet?: StrokeMetrics
  /** Color paint at +Z (after the draw): per-channel means over painted verts. */
  color?: {paintedCount: number; meanR: number; meanG: number; meanB: number; invalid?: string}
  /** ACCUMULATE default flag per tool (smooth/bsmooth/paint-smooth/inflate/clay). */
  accumulateDefaults?: Record<string, boolean>
  /** Non-finite floats in the final position buffer (must be 0). */
  nonFiniteCount?: number
  radius?: number
}

/** Minimal structural view of the IWasmInterface bits the buffer reads need
 * (mirrors test_harness.ts's DumpWasm; HEAPU8 present ⇒ WASM, absent ⇒ native). */
interface BufWasm {
  HEAPU8?: {buffer: ArrayBufferLike}
  gpu: Record<string, unknown>
  getBoundVector(name: string, vec: unknown): ArrayLike<unknown>
  pointerBytes?(bound: unknown, member: string, byteLen: number): Uint8Array | undefined
}
interface BufDesc {
  size: number
  elemsize: number
  name?: string
  data?: number
}

/**
 * Concatenate every GPU vertex buffer named `name` (after refreshing via
 * spatial.update). The GPU stream is split into per-batch buffers that share a
 * name, so reading just the first would cover only part of the mesh; vector
 * order is deterministic, so the concatenation diffs stably across strokes.
 */
function readGpuBuffer(lm: LiteMesh, name: string): Float32Array | undefined {
  const wasm = lm.wasm as unknown as BufWasm
  const spatial = lm.spatial as unknown as {update?: (gpu: unknown) => void}
  spatial.update?.(wasm.gpu)
  const buffersVec = (wasm.gpu as {buffers?: unknown}).buffers
  const buffers =
    wasm.HEAPU8 !== undefined
      ? (buffersVec as ArrayLike<BufDesc>)
      : (wasm.getBoundVector('', buffersVec) as ArrayLike<BufDesc>)
  const parts: Float32Array[] = []
  let total = 0
  for (let i = 0; i < (buffers.length | 0); i++) {
    const buf = buffers[i]
    if (!buf || buf.name !== name || !(buf.size | 0) || !(buf.elemsize | 0)) continue
    const floatCount = (buf.size | 0) * (buf.elemsize | 0)
    const bytes = floatCount * 4
    let u8: Uint8Array | undefined
    if (wasm.HEAPU8 !== undefined) {
      u8 = new Uint8Array(wasm.HEAPU8.buffer, buf.data as number, bytes)
    } else {
      u8 = wasm.pointerBytes?.(buf, 'data', bytes)
    }
    if (!u8 || u8.length < bytes) return undefined
    // Copy — the underlying buffers are reused/rebuilt across strokes.
    parts.push(new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + bytes)))
    total += floatCount
  }
  if (!parts.length) return undefined
  const out = new Float32Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function diffMetrics(before: Float32Array | undefined, after: Float32Array | undefined, n: number[]): StrokeMetrics {
  const m: StrokeMetrics = {maxDisp: 0, movedCount: 0, meanAlongNormal: 0}
  if (!before || !after) {
    m.invalid = 'position buffer unreadable'
    return m
  }
  if (before.length !== after.length) {
    m.invalid = `length changed ${before.length} -> ${after.length}`
    return m
  }
  const nl = Math.hypot(n[0], n[1], n[2]) || 1
  const nx = n[0] / nl
  const ny = n[1] / nl
  const nz = n[2] / nl
  let alongSum = 0
  for (let i = 0; i < before.length; i += 3) {
    const dx = after[i] - before[i]
    const dy = after[i + 1] - before[i + 1]
    const dz = after[i + 2] - before[i + 2]
    const d = Math.hypot(dx, dy, dz)
    if (d > 1e-6) {
      m.movedCount++
      alongSum += dx * nx + dy * ny + dz * nz
      if (d > m.maxDisp) m.maxDisp = d
    }
  }
  m.meanAlongNormal = m.movedCount > 0 ? alongSum / m.movedCount : 0
  return m
}

/** Run one stroke and return the position-buffer displacement metrics. */
function strokeAndMeasure(
  mesh: LiteMesh,
  brush: SculptBrush,
  tool: SculptTools,
  p: number[],
  normal: number[],
  radius: number,
  opts: {dabs?: number; invert?: boolean; strength?: number} = {}
): StrokeMetrics {
  const saved = {tool: brush.tool, strength: brush.strength}
  brush.tool = tool
  if (opts.strength !== undefined) brush.strength = opts.strength
  const before = readGpuBuffer(mesh, 'position')
  const dabs = Array.from({length: opts.dabs ?? 1}, () => ({p, normal}))
  runSculptcoreStroke({mesh, brush, dabs, radius, invert: opts.invert ?? false})
  const after = readGpuBuffer(mesh, 'position')
  brush.tool = saved.tool
  brush.strength = saved.strength
  return diffMetrics(before, after, normal)
}

function brushTest(): BrushTestResult {
  const result: BrushTestResult = {ok: false}
  try {
    const g = globalThis as unknown as {
      _appstate?: {ctx?: {object?: {data?: unknown}}}
      _DefaultBrushes?: Record<string, SculptBrush>
    }
    const mesh = g._appstate?.ctx?.object?.data
    if (!(mesh instanceof LiteMesh)) throw new Error('active object is not a LiteMesh')
    const brushes = g._DefaultBrushes
    if (!brushes) throw new Error('no default brushes')
    // _DefaultBrushes is keyed by display name; resolve by the tool enum.
    const need = (tool: number): SculptBrush => {
      for (const k in brushes) {
        const b = brushes[k]
        if (b && b.tool === tool) return b
      }
      throw new Error(`no default brush for tool ${tool}`)
    }

    // The litemesh-cube scene is a spherified cube of half-extent `size` —
    // recover the actual pole distance from the position buffer.
    const pos0 = readGpuBuffer(mesh, 'position')
    if (!pos0) throw new Error('position buffer unreadable')
    let R = 0
    for (let i = 0; i < pos0.length; i += 3) {
      if (pos0[i + 2] > R) R = pos0[i + 2]
    }
    const radius = R * 0.25
    result.radius = radius

    // ACCUMULATE defaults (pure flag check, no strokes).
    result.accumulateDefaults = {
      smooth     : !!(need(SculptTools.SMOOTH).flag & BrushFlags.ACCUMULATE),
      bsmooth    : !!(need(SculptTools.BSMOOTH).flag & BrushFlags.ACCUMULATE),
      paintSmooth: !!(need(SculptTools.PAINT_SMOOTH).flag & BrushFlags.ACCUMULATE),
      inflate    : !!(need(SculptTools.INFLATE).flag & BrushFlags.ACCUMULATE),
      clay       : !!(need(SculptTools.CLAY).flag & BrushFlags.ACCUMULATE),
    }

    const draw = need(SculptTools.DRAW)

    // The first stroke triggers a GPU re-batch (the buffer set changes length),
    // so run a zero-strength warmup to settle the layout before measuring.
    strokeAndMeasure(mesh, draw, SculptTools.DRAW, [0, 0, R], [0, 0, 1], radius, {strength: 0})

    // Forward DRAW at the +Z pole — verts move outward along the dab normal.
    result.drawForward = strokeAndMeasure(mesh, draw, SculptTools.DRAW, [0, 0, R], [0, 0, 1], radius, {strength: 1})

    // Inverted DRAW at the -Z pole — must dig inward (negative along normal).
    result.drawInverted = strokeAndMeasure(mesh, draw, SculptTools.DRAW, [0, 0, -R], [0, 0, -1], radius, {
      strength: 1,
      invert  : true,
    })

    // SHARP at +X — regression for the absolute-step explosion: displacement
    // must stay well under the brush radius.
    result.sharp = strokeAndMeasure(mesh, need(SculptTools.SHARP), SculptTools.SHARP, [R, 0, 0], [1, 0, 0], radius, {
      strength: 1,
      dabs    : 3,
    })

    // Mask gate at -X: saturate the mask, then DRAW inside the masked disk —
    // displacement must collapse vs drawForward.
    const maskBrush = need(SculptTools.MASK_PAINT)
    strokeAndMeasure(mesh, maskBrush, SculptTools.MASK_PAINT, [-R, 0, 0], [-1, 0, 0], radius, {strength: 1, dabs: 5})
    result.drawMasked = strokeAndMeasure(mesh, draw, SculptTools.DRAW, [-R, 0, 0], [-1, 0, 0], radius * 0.6, {
      strength: 1,
    })

    // Mask erase at +Y: paint mask, erase it with an inverted mask stroke,
    // then DRAW — displacement must come back (≈ drawForward).
    strokeAndMeasure(mesh, maskBrush, SculptTools.MASK_PAINT, [0, R, 0], [0, 1, 0], radius, {strength: 1, dabs: 5})
    strokeAndMeasure(mesh, maskBrush, SculptTools.MASK_PAINT, [0, R, 0], [0, 1, 0], radius, {
      strength: 1,
      dabs    : 7,
      invert  : true,
    })
    result.drawMaskErased = strokeAndMeasure(mesh, draw, SculptTools.DRAW, [0, R, 0], [0, 1, 0], radius * 0.6, {
      strength: 1,
    })

    // Inverted SMOOTH at -Y: smooth ignores invert; must stay bounded (no
    // divergent anti-Laplacian blow-up).
    result.smoothInverted = strokeAndMeasure(
      mesh,
      need(SculptTools.SMOOTH),
      SculptTools.SMOOTH,
      [0, -R, 0],
      [0, -1, 0],
      radius,
      {strength: 1, dabs: 3, invert: true}
    )

    // KELVINLET grab at +Z: a grab brush pulls the region under the dab in the
    // stroke-movement direction, so it needs *moving* dabs (grabTo is the
    // per-dab displacement, zero until the brush moves). March three dabs along
    // +X near the pole and verify the surface follows (+X mean displacement),
    // and that the elastic field stays bounded (no blow-up).
    {
      const kelvinlet = need(SculptTools.KELVINLET)
      const step = radius * 0.3
      const kdabs = [
        {p: [0, 0, R], normal: [0, 0, 1]},
        {p: [step, 0, R], normal: [0, 0, 1]},
        {p: [step * 2, 0, R], normal: [0, 0, 1]},
      ]
      const saved = {tool: kelvinlet.tool, strength: kelvinlet.strength}
      kelvinlet.tool = SculptTools.KELVINLET
      kelvinlet.strength = 1
      const before = readGpuBuffer(mesh, 'position')
      runSculptcoreStroke({mesh, brush: kelvinlet, dabs: kdabs, radius})
      const after = readGpuBuffer(mesh, 'position')
      kelvinlet.tool = saved.tool
      kelvinlet.strength = saved.strength
      // Project displacement onto +X (the stroke direction).
      result.kelvinlet = diffMetrics(before, after, [1, 0, 0])
    }

    // Color paint back at +Z (deform-independent): paint a green-dominant color
    // and read the legacy composited `color` stream. The old kernel hardcoded
    // red, so meanG > meanR is the brush.color-piping regression signal.
    const colorBrush = need(SculptTools.COLOR)
    if (mesh.activeAttrLayerIndex(AttrUseFlags.COLOR) < 0) {
      mesh.addAttr(AttrDomain.VERTEX, AttrType.Float4, AttrUseFlags.COLOR)
    }
    const savedColor = new Vector4(colorBrush.color)
    colorBrush.color.loadXYZW(0.1, 0.9, 0.3, 1.0)
    const colBefore = readGpuBuffer(mesh, 'color')
    strokeAndMeasure(mesh, colorBrush, SculptTools.COLOR, [0, 0, R], [0, 0, 1], radius, {strength: 1, dabs: 3})
    const colAfter = readGpuBuffer(mesh, 'color')
    colorBrush.color.load(savedColor)
    if (!colBefore || !colAfter || colBefore.length !== colAfter.length) {
      result.color = {paintedCount: 0, meanR: 0, meanG: 0, meanB: 0, invalid: 'color buffer unreadable/resized'}
    } else {
      let painted = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (let i = 0; i < colAfter.length; i += 4) {
        const dr = Math.abs(colAfter[i] - colBefore[i])
        const dg = Math.abs(colAfter[i + 1] - colBefore[i + 1])
        const db = Math.abs(colAfter[i + 2] - colBefore[i + 2])
        if (dr + dg + db > 0.05) {
          painted++
          sr += colAfter[i]
          sg += colAfter[i + 1]
          sb += colAfter[i + 2]
        }
      }
      result.color = {
        paintedCount: painted,
        meanR       : painted ? sr / painted : 0,
        meanG       : painted ? sg / painted : 0,
        meanB       : painted ? sb / painted : 0,
      }
    }

    // Final sanity: no NaN/Inf anywhere in the position buffer.
    const posEnd = readGpuBuffer(mesh, 'position')
    let bad = 0
    if (posEnd) {
      for (let i = 0; i < posEnd.length; i++) {
        if (!Number.isFinite(posEnd[i])) bad++
      }
    }
    result.nonFiniteCount = bad
    result.ok = true
  } catch (err) {
    result.error = String(err instanceof Error ? (err.stack ?? err.message) : err)
  }
  ;(globalThis as {__brushTestResult?: BrushTestResult}).__brushTestResult = result
  return result
}

;(globalThis as {__brushTest?: typeof brushTest}).__brushTest = brushTest

export {brushTest}
