/**
 * Dependency-free frustum intersection predicates used by viewport
 * `castScreenRect` (box select). Kept in their own module — with zero imports —
 * so they can be unit-tested in isolation (importing isect.ts drags in
 * vectormath/three/path.ux, which the jsdom test harness can't load).
 *
 * A frustum is an array of plane equations `[nx, ny, nz, d]` with normals
 * pointing **inward**; a point is inside when `dot(n, p) + d >= 0` for every
 * plane. Re-exported from isect.ts (and thus `@framework/api`).
 */
// Type-only imports are erased at runtime, so this module stays dependency-free
// (the unit test loads it without pulling in vectormath/three/path.ux).
import type {Vector3Like, Vector4Like} from './vectormath.js'

type Vec4Arg = Vector4Like
type Vec3Arg = Vector3Like

/** True when `p` is on the inward side of every frustum plane. */
export function point_in_frustum(planes: Vec4Arg[], p: Vec3Arg) {
  for (let i = 0; i < planes.length; i++) {
    const pl = planes[i]
    if (pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] + pl[3] < 0.0) {
      return false
    }
  }
  return true
}

/**
 * Conservative AABB-vs-frustum test (positive-vertex / "p-vertex" method).
 * For each plane it picks the AABB corner farthest along the inward normal; if
 * that corner is behind the plane the box is wholly outside. May over-accept
 * boxes near frustum edges — fine for a BVH broad phase (an exact per-element
 * test refines the result).
 */
export function aabb_frustum_isect(planes: Vec4Arg[], min: Vec3Arg, max: Vec3Arg) {
  for (let i = 0; i < planes.length; i++) {
    const pl = planes[i]
    const px = pl[0] >= 0.0 ? max[0] : min[0]
    const py = pl[1] >= 0.0 ? max[1] : min[1]
    const pz = pl[2] >= 0.0 ? max[2] : min[2]

    if (pl[0] * px + pl[1] * py + pl[2] * pz + pl[3] < 0.0) {
      return false
    }
  }
  return true
}

/**
 * Conservative triangle-vs-frustum test. Rejects only when all three vertices
 * lie outside the same frustum plane (a separating plane among the six). Never
 * falsely rejects a truly-intersecting triangle, but may over-accept (e.g. a
 * triangle that wraps around the frustum without entering it) — acceptable for
 * a broad phase.
 */
export function tri_frustum_isect(planes: Vec4Arg[], v1: Vec3Arg, v2: Vec3Arg, v3: Vec3Arg) {
  for (let i = 0; i < planes.length; i++) {
    const pl = planes[i]
    const d1 = pl[0] * v1[0] + pl[1] * v1[1] + pl[2] * v1[2] + pl[3]
    const d2 = pl[0] * v2[0] + pl[1] * v2[1] + pl[2] * v2[2] + pl[3]
    const d3 = pl[0] * v3[0] + pl[1] * v3[1] + pl[2] * v3[2] + pl[3]

    if (d1 < 0.0 && d2 < 0.0 && d3 < 0.0) {
      return false
    }
  }
  return true
}
