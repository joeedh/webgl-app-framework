/**
 * Generic brush stroke driver: turns a stream of raw pointer events into
 * evenly-spaced PaintSample dabs along an interpolating (centripetal
 * Catmull-Rom) spline. Even spacing can be measured in screen space or world
 * space; world spacing raycasts each input point and falls back to a
 * camera-facing plane for rays that miss. The driver does NOT mirror and does
 * NOT apply dabs to geometry — a consumer pushes events, pulls ready samples on
 * its tick, and owns mirroring / yielding / dab application downstream.
 *
 * All curve/arc-length math lives in the dependency-free
 * `scripts/util/stroke_math.ts`; this file only adds raycasting, projection and
 * PaintSample construction.
 */
import {PaintSample} from './pbvh_paintsample.js'
import {Bezier} from '../../../util/bezier.js'
import {Matrix4, Vector2, Vector3, Vector4} from '../../../path.ux/scripts/pathux.js'
import {arcLengthWalk, crToBezier, Cubic, evalCubic, lerpV, subCubic, Vec} from '../../../util/stroke_math.js'

/** Centripetal Catmull-Rom: no cusps/loops on clustered jittery input. */
const ALPHA = 0.5
/** Parameter half-width of the per-dab world-curve slice stored on ps.curve. */
const SLICE_HALF = 0.15

export interface StrokeInput {
  x: number
  y: number
  /** 0..1; caller normalizes (mouse => 1, pen/touch => e.pressure) */
  pressure: number
  tiltX: number
  tiltY: number
  twist: number
  /** caller pre-resolves ctrlKey + BrushFlags.INVERT */
  invert: boolean
  /** ms; informational only (not used for spacing) */
  time: number
  pointerType?: string
}

export enum StrokeSpaceMode {
  SCREEN = 0,
  WORLD = 1,
}

/** Narrow adapter over View3D so the driver stays decoupled/testable. */
export interface IStrokeProjection {
  project(co: Vector4, rendermat?: Matrix4): number
  unproject(co: Vector4, irendermat?: Matrix4): number
  getViewVec(localX: number, localY: number): Vector3
  getLocalMouse(x: number, y: number): Vector2
  cameraPos(): Vector3
  rendermat(): Matrix4
  /** device px; used to convert a screen-px radius to world units */
  glSize(): Vector2
  size(): Vector2
}

/** World-space ray hit. origin/dir and p/normal are all world space. */
export interface IStrokeHit {
  p: Vector3
  normal: Vector3
  dist: number
}
export type StrokeRayCast = (origin: Vector3, dir: Vector3) => IStrokeHit | undefined

export interface StrokeParams {
  radius: number
  strength: number
  spacing: number
  color: Vector4
}
/** Lifts feedTask's getchannel(): pressure -> dynamics-resolved params. */
export type StrokeParamProvider = (pressure: number) => StrokeParams

export interface StrokeDriverOptions {
  projection: IStrokeProjection
  getParams: StrokeParamProvider
  spaceMode: StrokeSpaceMode
  /** required for WORLD mode; optional for SCREEN */
  rayCast?: StrokeRayCast
}

interface ControlPoint {
  screen: Vec // [x,y]
  world: Vec // [x,y,z]
  normal: Vec // [x,y,z]
  viewvec: Vec // [x,y,z] ray direction at this point
  hit: boolean
  pressure: number
  tiltX: number
  tiltY: number
  twist: number
  invert: boolean
  params: StrokeParams
}

export class BrushStrokeDriver {
  opts: StrokeDriverOptions

  private inQueue: StrokeInput[] = []
  private cps: ControlPoint[] = []
  private walkCarry = 0
  private strokeS = 0
  private firstHit = false
  private lastHitWorld: Vec = [0, 0, 0]
  private prevEmitted: PaintSample | undefined
  private rawEmitted = false
  private ended = false
  private done = false

  private out: PaintSample[] = []
  private _rendermat = new Matrix4()
  private _irendermat = new Matrix4()
  private _view3dSize = new Vector2()
  private _tmp4 = new Vector4()

  constructor(opts: StrokeDriverOptions) {
    this.opts = opts
  }

  /** true once end() has been called AND the trailing segment is drained */
  get finished(): boolean {
    return this.done
  }

  reset(): void {
    this.inQueue.length = 0
    this.cps.length = 0
    this.walkCarry = 0
    this.strokeS = 0
    this.firstHit = false
    this.lastHitWorld = [0, 0, 0]
    this.prevEmitted = undefined
    this.rawEmitted = false
    this.ended = false
    this.done = false
    this.out.length = 0
  }

  /** Enqueue one raw pointer event (e.g. from on_pointermove). */
  push(input: StrokeInput): void {
    if (this.ended) {
      return
    }
    this.inQueue.push(input)
  }

  /** Signal pointer-up; the next poll() flushes the trailing segment. */
  end(): void {
    this.ended = true
  }

  /** Drain queued events through the spline and return the dabs now ready. */
  poll(): PaintSample[] {
    this.out = []

    if (this.done) {
      return this.out
    }

    // snapshot the camera transform for this batch of events
    this._rendermat.load(this.opts.projection.rendermat())
    this._view3dSize.load(this.opts.projection.size())
    this._irendermat.load(this._rendermat)
    this._irendermat.invert()

    while (this.inQueue.length > 0) {
      this.ingest(this.inQueue.shift()!)
    }

    if (this.ended) {
      this.flush()
      this.done = true
    }

    return this.out
  }

  private ingest(input: StrokeInput): void {
    const proj = this.opts.projection

    const sp = proj.getLocalMouse(input.x, input.y)
    const screen: Vec = [sp[0], sp[1]]

    const vv = proj.getViewVec(screen[0], screen[1])
    const viewvec: Vec = [vv[0], vv[1], vv[2]]
    const origin = proj.cameraPos()

    const params = this.opts.getParams(input.pressure)

    let world: Vec
    let normal: Vec
    let hit = false

    const r = this.opts.rayCast?.(new Vector3(origin), new Vector3(vv))
    if (r) {
      world = [r.p[0], r.p[1], r.p[2]]
      normal = [r.normal[0], r.normal[1], r.normal[2]]
      hit = true
      this.firstHit = true
      this.lastHitWorld = world.slice()
    } else if (this.firstHit) {
      // miss after a real hit: project the last hit onto the camera-facing
      // plane at the cursor (sampleViewRay grab/snake fallback)
      world = this.synthesizeMiss(screen)
      normal = viewvec.slice()
    } else if (this.opts.spaceMode === StrokeSpaceMode.SCREEN) {
      // screen-mode before any surface exists: best-effort world position
      world = [origin[0] + viewvec[0], origin[1] + viewvec[1], origin[2] + viewvec[2]]
      normal = viewvec.slice()
    } else {
      // world-mode before any hit: no plane to project onto yet, discard
      return
    }

    this.cps.push({
      screen,
      world,
      normal,
      viewvec,
      hit,
      pressure: input.pressure,
      tiltX   : input.tiltX ?? 0,
      tiltY   : input.tiltY ?? 0,
      twist   : input.twist ?? 0,
      invert  : input.invert,
      params,
    })

    // first control point => one raw, non-interpolated dab
    if (!this.rawEmitted) {
      this.rawEmitted = true
      this.emitRaw(this.cps[this.cps.length - 1])
      return
    }

    // 1-segment lookahead: with a right neighbor present, the segment between
    // cps[L-3] and cps[L-2] is now fully determined
    const L = this.cps.length
    if (L >= 3) {
      this.emitSegment(L - 3, false)
    }
  }

  private flush(): void {
    const L = this.cps.length
    if (L >= 2) {
      this.emitSegment(L - 2, true)
    }
  }

  /** sampleViewRay miss trick: world point on the camera plane through last hit. */
  private synthesizeMiss(screen: Vec): Vec {
    const proj = this.opts.projection
    const p = this._tmp4
    p[0] = this.lastHitWorld[0]
    p[1] = this.lastHitWorld[1]
    p[2] = this.lastHitWorld[2]
    p[3] = 1.0

    proj.project(p, this._rendermat) // -> screen px, keeps depth in p[2]
    p[0] = screen[0]
    p[1] = screen[1]
    proj.unproject(p, this._irendermat)

    return [p[0], p[1], p[2]]
  }

  private emitRaw(cp: ControlPoint): void {
    const ps = this.makeSample(cp.world, cp.screen, cp, cp, 0, cp.normal, cp.hit)
    ps.isInterp = false
    ps.strokeS = this.strokeS
    ps.dstrokeS = 0
    ps.angle = 0
    ps.futureAngle = 0
    ps.curve = undefined

    this.prevEmitted = ps
    this.out.push(ps)
  }

  private emitSegment(i: number, rightClamp: boolean): void {
    const cps = this.cps
    const p1 = cps[i]
    const p2 = cps[i + 1]
    const p0 = i > 0 ? cps[i - 1] : p1
    const p3 = rightClamp ? p2 : cps[i + 2]

    const screenB = crToBezier(p0.screen, p1.screen, p2.screen, p3.screen, ALPHA)
    const worldB = crToBezier(p0.world, p1.world, p2.world, p3.world, ALPHA)

    const spacing = p2.params.spacing
    const radiusPx = p2.params.radius

    let drivingB: Cubic
    let spacingDist: number
    if (this.opts.spaceMode === StrokeSpaceMode.WORLD) {
      drivingB = worldB
      const worldRadius = this.worldRadiusAt(evalCubic(worldB, 0.5), radiusPx)
      spacingDist = Math.max(spacing * 2 * worldRadius, 1e-5)
    } else {
      drivingB = screenB
      spacingDist = Math.max(spacing * 2 * radiusPx, 1e-5)
    }

    const walk = arcLengthWalk(drivingB, spacingDist, this.walkCarry)
    this.walkCarry = walk.carryOut

    for (const t of walk.ts) {
      const worldP = evalCubic(worldB, t)
      const screenP = evalCubic(screenB, t)
      const normalP = lerpV(p1.normal, p2.normal, t)
      const hit = t < 0.5 ? p1.hit : p2.hit

      const ps = this.makeSample(worldP, screenP, p1, p2, t, normalP, hit)
      ps.isInterp = true

      this.strokeS += spacing
      ps.strokeS = this.strokeS
      ps.dstrokeS = spacing

      const prev = this.prevEmitted
      if (prev) {
        ps.dScreenP[0] = ps.screenP[0] - prev.screenP[0]
        ps.dScreenP[1] = ps.screenP[1] - prev.screenP[1]
        ps.dp[0] = ps.p[0] - prev.p[0]
        ps.dp[1] = ps.p[1] - prev.p[1]
        ps.dp[2] = ps.p[2] - prev.p[2]
        ps.angle = Math.atan2(ps.dScreenP[1], ps.dScreenP[0])
        prev.futureAngle = ps.angle
      }

      const slice = subCubic(worldB, t - SLICE_HALF, t + SLICE_HALF)
      ps.curve = new Bezier(slice[0], slice[1], slice[2], slice[3]).createQuads()
      ps.futureAngle = ps.angle

      this.prevEmitted = ps
      this.out.push(ps)
    }
  }

  /** Screen-px radius -> world units at a world point (sampleViewRay ~1336-1340). */
  private worldRadiusAt(worldP: Vec, radiusPx: number): number {
    const proj = this.opts.projection
    const p = this._tmp4
    p[0] = worldP[0]
    p[1] = worldP[1]
    p[2] = worldP[2]
    p[3] = 1.0
    const w = proj.project(p, this._rendermat)
    const gl = proj.glSize()
    return (radiusPx / Math.max(gl[0], gl[1])) * Math.abs(w)
  }

  /** Fill the position / view / interpolated-param fields of a PaintSample. */
  private makeSample(
    worldP: Vec,
    screenP: Vec,
    cpA: ControlPoint,
    cpB: ControlPoint,
    t: number,
    normalP: Vec,
    hit: boolean
  ): PaintSample {
    const proj = this.opts.projection
    const ps = new PaintSample()

    const p = this._tmp4
    p[0] = worldP[0]
    p[1] = worldP[1]
    p[2] = worldP[2]
    p[3] = 1.0
    const w = proj.project(p, this._rendermat)

    ps.p[0] = worldP[0]
    ps.p[1] = worldP[1]
    ps.p[2] = worldP[2]
    ps.p[3] = w
    ps.w = w
    ps.screenP[0] = screenP[0]
    ps.screenP[1] = screenP[1]

    setNorm(ps.vec, normalP)
    const viewvec = lerpV(cpA.viewvec, cpB.viewvec, t)
    setNorm(ps.viewvec, viewvec)
    setNorm(ps.viewPlane, viewvec)

    const origin = proj.cameraPos()
    ps.vieworigin[0] = origin[0]
    ps.vieworigin[1] = origin[1]
    ps.vieworigin[2] = origin[2]
    ps.rendermat.load(this._rendermat)
    ps.irendermat.load(this._irendermat)
    ps.view3dSize.load(this._view3dSize)

    ps.radius = lerpNum(cpA.params.radius, cpB.params.radius, t)
    ps.strength = lerpNum(cpA.params.strength, cpB.params.strength, t)
    ps.pressure = lerpNum(cpA.pressure, cpB.pressure, t)
    ps.tiltX = lerpNum(cpA.tiltX, cpB.tiltX, t)
    ps.tiltY = lerpNum(cpA.tiltY, cpB.tiltY, t)
    ps.twist = lerpNum(cpA.twist, cpB.twist, t)
    ps.invert = t < 0.5 ? cpA.invert : cpB.invert
    ps.color.load(cpA.params.color).interp(cpB.params.color, t)
    ps.hit = hit

    return ps
  }
}

function setNorm(out: Vector3, v: Vec): void {
  out[0] = v[0]
  out[1] = v[1]
  out[2] = v[2]
  out.normalize()
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
