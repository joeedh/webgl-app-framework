/**
 * Guards ImmediateTODOs "plane brushes project to center surface normal or
 * view normal": resolvePlaneDabNormal must return the negated, normalized view
 * vector for plane-family tools in VIEW mode (the default) and the untouched
 * surface normal otherwise. brush_enums.ts is dependency-free, so the real
 * module loads here (unlike brush_base.ts, which drags in path.ux).
 */
import {SculptTools, PlaneNormalModes, isPlaneFamilyTool, resolvePlaneDabNormal} from '../../scripts/brush/brush_enums'

/** Minimal stand-in for path.ux Vector3 (copy/negate/normalize subset). */
class Vec3 {
  v: [number, number, number]

  constructor(v: [number, number, number]) {
    this.v = [v[0], v[1], v[2]]
  }

  copy(): this {
    return new Vec3(this.v) as this
  }

  negate(): this {
    this.v = [-this.v[0], -this.v[1], -this.v[2]]
    return this
  }

  normalize(): this {
    const len = Math.hypot(...this.v)
    if (len > 0) {
      this.v = [this.v[0] / len, this.v[1] / len, this.v[2] / len]
    }
    return this
  }
}

const PLANE_TOOLS = [SculptTools.CLAY, SculptTools.SCRAPE, SculptTools.FILL]

describe('isPlaneFamilyTool', () => {
  test('true exactly for Clay/Scrape/Fill', () => {
    for (const tool of PLANE_TOOLS) {
      expect(isPlaneFamilyTool(tool)).toBe(true)
    }
    // WING_SCRAPE has its own kernel (wing planes anchored to the surface
    // frame) and must not pick up the view-normal option.
    for (const tool of [
      SculptTools.WING_SCRAPE,
      SculptTools.DRAW,
      SculptTools.SMOOTH,
      SculptTools.GRAB,
      SculptTools.PAINT,
    ]) {
      expect(isPlaneFamilyTool(tool)).toBe(false)
    }
  })
})

describe('resolvePlaneDabNormal', () => {
  const surface = () => new Vec3([0, 0, 1])
  const view = () => new Vec3([0, 4, -3]) // non-unit on purpose

  test('VIEW mode returns -viewVec, normalized, for each plane tool', () => {
    for (const tool of PLANE_TOOLS) {
      const sn = surface()
      const vv = view()
      const out = resolvePlaneDabNormal(tool, PlaneNormalModes.VIEW, sn, vv)
      expect(out.v[0]).toBeCloseTo(0)
      expect(out.v[1]).toBeCloseTo(-0.8)
      expect(out.v[2]).toBeCloseTo(0.6)
      // The input view vector must not be mutated (it is reused by the caller).
      expect(vv.v).toEqual([0, 4, -3])
    }
  })

  test('SURFACE mode returns the surface normal object untouched', () => {
    for (const tool of PLANE_TOOLS) {
      const sn = surface()
      const out = resolvePlaneDabNormal(tool, PlaneNormalModes.SURFACE, sn, view())
      expect(out).toBe(sn)
      expect(out.v).toEqual([0, 0, 1])
    }
  })

  test('non-plane tools get the surface normal even in VIEW mode', () => {
    for (const tool of [SculptTools.WING_SCRAPE, SculptTools.DRAW, SculptTools.GRAB]) {
      const sn = surface()
      const out = resolvePlaneDabNormal(tool, PlaneNormalModes.VIEW, sn, view())
      expect(out).toBe(sn)
    }
  })

  test('VIEW is the default mode value (per the TODO item)', () => {
    expect(PlaneNormalModes.VIEW).toBe(0)
  })
})
