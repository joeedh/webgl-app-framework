/* Dependency-free brush enums + pure helpers, importable from unit tests
 * (brush_base.ts drags in path.ux via Icons/BrushDynamics). brush_base
 * re-exports everything here, so import sites may use either module. */

/*
Note: there are different types of brushes:
  + 'Draw' brushes move vertices along the surface normal at the center of the brush
  + 'Clay' brushes project vertices to the plane defined by the surface normal at the center of the brush
  + 'Smooth' brushes average vertex positions with their neighbors
  + 'Mask' brushes modify the mask value of vertices
  + 'Paint' brushes modify vertex colors
  + 'Grab' brushes directly move portions of the mesh in some way.
  + Other various special brushes exist (e.g. 'Snake', 'Topology', 'Hole Filler', etc.)
*/

export enum SculptTools {
  CLAY = 0,
  FILL = 1,
  SCRAPE = 2,
  SMOOTH = 3,
  DRAW = 4,
  SHARP = 5,
  INFLATE = 6,
  SNAKE = 7,
  TOPOLOGY = 8,
  GRAB = 9,
  HOLE_FILLER = 10,
  MASK_PAINT = 11,
  WING_SCRAPE = 12,
  PINCH = 13,
  DIRECTIONAL_FAIR = 14,
  SLIDE_RELAX = 15,
  BVH_DEFORM = 16,
  COLOR = 17,
  POLYGROUP = 18,
  BSMOOTH = 19,
  KELVINLET = 20,
  PAINT = 128,
  PAINT_SMOOTH = 129,
  COLOR_BOUNDARY = 130,
  TEXTURE_PAINT = 150,
  FACE_SET_DRAW = 151,
}

/** Projection-plane orientation for the plane family (Clay/Scrape/Fill). */
export enum PlaneNormalModes {
  VIEW = 0,
  SURFACE = 1,
}

/** The brushes that share the plane.sbrush kernel (Clay/Scrape/Fill).
 * WING_SCRAPE is excluded — its wing planes anchor to the surface frame. */
export function isPlaneFamilyTool(tool: SculptTools): boolean {
  return tool === SculptTools.CLAY || tool === SculptTools.SCRAPE || tool === SculptTools.FILL
}

interface Vec3Like {
  copy(): this
  negate(): this
  normalize(): this
}

/**
 * Pick the plane-projection normal for a dab: in VIEW mode plane brushes
 * project onto a viewport-facing plane (-viewVec, normalized, so planeSide
 * semantics match the surface-normal convention); otherwise — SURFACE mode or
 * a non-plane tool — the surface normal at the brush center is used as-is.
 */
export function resolvePlaneDabNormal<T extends Vec3Like>(
  tool: SculptTools,
  mode: PlaneNormalModes,
  surfaceNormal: T,
  viewVec: T
): T {
  if (mode !== PlaneNormalModes.VIEW || !isPlaneFamilyTool(tool)) {
    return surfaceNormal
  }
  return viewVec.copy().negate().normalize()
}
