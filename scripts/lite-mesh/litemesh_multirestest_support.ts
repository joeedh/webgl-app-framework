/**
 * Integration-test support for multires subsurf (workstream S of
 * documentation/plans/displacementAndSubSurf.md, app-wiring pass). Exposes
 * `globalThis.__multiresTest()`, driven by the NW.js headless harness via
 * `--eval` (see `tests/integration/sculptcore_multires.test.ts`); the result
 * rides the generic `__evalTestResult` dump seam.
 *
 * On the spherified `litemesh-cube` scene it enables a 3-level multires stack
 * (the cube parks as the cage), proves the S3 losslessness gate (a level
 * round-trip is bit-stable), runs one real DRAW stroke on the finest level
 * (stroke-end writeback folds it into the grids store; dyntopo is force-gated
 * off), round-trips the stroke through MeshLog undo/redo (+ writeback resync),
 * down-refits the stroke into level 2 (fine surface preserved, coarse surface
 * moved), and deletes the stack (cage restored). Positions are read CPU-side
 * (dumpVertCo), and FNV-1a checksums are the wasm↔native bit-parity gate.
 */

import {BrushFlags, SculptTools} from '../brush/brush_base'
import {DefaultBrushes} from '../brush/index'
import {runSculptcoreStroke, SculptPaintOp} from '../editors/view3d/tools/sculptcore_ops'
import {LiteMesh} from './litemesh'

export interface MultiresTestResult {
  ok: boolean
  error?: string
  /** Brush radius used (a quarter of the sphere's pole distance). */
  radius?: number
  /** Cage (pre-enable) live vert / face counts. */
  cageVerts?: number
  cageFaces?: number
  /** Stack depth + the finest level's mesh counts after enable. */
  levels?: number
  levelVerts?: number
  levelFaces?: number
  /** Level round-trip 3→1→3 reproduces positions bit-exactly (S3 gate). */
  roundTripOk?: boolean
  /** FNV-1a over the pre-stroke finest-level positions. */
  baseChecksum?: number
  baseFloatCount?: number
  /** Live verts moved > 1e-6 by the DRAW stroke + the largest displacement. */
  movedCount?: number
  maxDisp?: number
  /** FNV-1a over the post-stroke finest-level positions (bit-parity gate). */
  postChecksum?: number
  postFloatCount?: number
  /** Max |co - preStroke| after MeshLog undo + writeback (expected 0). */
  undoResidual?: number
  /** Max |co - postStroke| after MeshLog redo + writeback (expected 0). */
  redoResidual?: number
  /** Level-2 checksums before/after the down-refit (must differ). */
  level2PreChecksum?: number
  level2PostChecksum?: number
  level2FloatCount?: number
  /** Coarse verts the down-refit moved (> 0). */
  refitChanged?: number
  /** Max |level-3 co - postStroke| across the refit (surface preserved). */
  refitFineResidual?: number
  /** Vert count matches the cage again after multiresDelete. */
  cageRestored?: boolean
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

/** Flatten dumpVertCo() into Float32Array xyz triples (live-vert order). */
function dumpCoFlat(mesh: LiteMesh): Float32Array {
  const {co} = mesh.dumpVertCo()
  const out = new Float32Array(co.length * 3)
  for (let i = 0; i < co.length; i++) {
    out[i * 3] = co[i][0]
    out[i * 3 + 1] = co[i][1]
    out[i * 3 + 2] = co[i][2]
  }
  return out
}

function multiresTest(): MultiresTestResult {
  const result: MultiresTestResult = {ok: false}
  const g = globalThis as unknown as {
    _appstate?: {ctx?: {object?: {data?: unknown}}}
    __multiresTestResult?: MultiresTestResult
  }
  try {
    const mesh = g._appstate?.ctx?.object?.data
    if (!(mesh instanceof LiteMesh)) throw new Error('active object is not a LiteMesh')

    const brush = DefaultBrushes.slotMap[SculptTools.DRAW]
    if (!brush) throw new Error('no default DRAW brush')

    const cage = dumpCoFlat(mesh)
    result.cageVerts = cage.length / 3
    result.cageFaces = mesh.mesh.f.count

    const LEVELS = 3
    if (!mesh.multiresEnable(LEVELS)) throw new Error('multiresEnable failed')
    try {
      result.levels = mesh.multiresLevels
      if (mesh.multiresLevel !== LEVELS) throw new Error('finest level not active after enable')
      result.levelVerts = mesh.mesh.v.count
      result.levelFaces = mesh.mesh.f.count

      const base = dumpCoFlat(mesh)
      result.baseChecksum = fnv1a(base)
      result.baseFloatCount = base.length

      // S3 losslessness: an edit-free switch round-trip is bit-stable.
      mesh.multiresSetLevel(1)
      mesh.multiresSetLevel(LEVELS)
      result.roundTripOk = fnv1a(dumpCoFlat(mesh)) === result.baseChecksum

      let R = 0
      for (let i = 2; i < base.length; i += 3) {
        if (base[i] > R) R = base[i]
      }
      const radius = R * 0.25
      result.radius = radius

      const saved = {strength: brush.strength, flag: brush.flag, autosmooth: brush.autosmooth}
      try {
        brush.autosmooth = 0
        brush.flag &= ~BrushFlags.ACCUMULATE
        brush.strength = 1

        // One DRAW dab at the +Z pole; runSculptcoreStroke ends with
        // multiresWriteback (the stroke-end fold) and force-gates dyntopo off.
        runSculptcoreStroke({mesh, brush, dabs: [{p: [0, 0, R], normal: [0, 0, 1]}], radius})

        const after = dumpCoFlat(mesh)
        if (after.length !== base.length) throw new Error('vert count changed by the stroke')
        let moved = 0
        let maxDisp = 0
        for (let i = 0; i < after.length; i += 3) {
          const d = Math.hypot(after[i] - base[i], after[i + 1] - base[i + 1], after[i + 2] - base[i + 2])
          if (d > 1e-6) {
            moved++
            if (d > maxDisp) maxDisp = d
          }
        }
        result.movedCount = moved
        result.maxDisp = maxDisp
        result.postChecksum = fnv1a(after)
        result.postFloatCount = after.length

        // MeshLog undo/redo round-trip, each followed by the store resync the
        // interactive op performs (SculptPaintOp.undo/redo).
        SculptPaintOp.meshLog!.undo(mesh.mesh, mesh.spatial)
        mesh.multiresWriteback()
        result.undoResidual = maxResidual(base, dumpCoFlat(mesh))
        SculptPaintOp.meshLog!.redo(mesh.mesh, mesh.spatial)
        mesh.multiresWriteback()
        result.redoResidual = maxResidual(after, dumpCoFlat(mesh))

        // Down-refit: the stroke (stored at level 3) is least-squares-absorbed
        // into level 2; the level-3 surface must be preserved.
        mesh.multiresSetLevel(2)
        const l2Pre = dumpCoFlat(mesh)
        result.level2PreChecksum = fnv1a(l2Pre)
        result.level2FloatCount = l2Pre.length
        mesh.multiresSetLevel(LEVELS)

        result.refitChanged = mesh.multiresDownRefit()
        result.refitFineResidual = maxResidual(after, dumpCoFlat(mesh))

        mesh.multiresSetLevel(2)
        result.level2PostChecksum = fnv1a(dumpCoFlat(mesh))
        mesh.multiresSetLevel(LEVELS)
      } finally {
        brush.strength = saved.strength
        brush.flag = saved.flag
        brush.autosmooth = saved.autosmooth
      }
    } finally {
      mesh.multiresDelete()
    }
    result.cageRestored = dumpCoFlat(mesh).length === cage.length && mesh.mesh.f.count === result.cageFaces

    result.ok = true
  } catch (err) {
    result.error = String(err instanceof Error ? (err.stack ?? err.message) : err)
  }
  g.__multiresTestResult = result
  return result
}

;(globalThis as {__multiresTest?: typeof multiresTest}).__multiresTest = multiresTest

export {multiresTest}
