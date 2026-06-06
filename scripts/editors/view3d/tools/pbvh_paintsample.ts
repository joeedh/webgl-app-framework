import {bez4, Bezier, dbez4} from '../../../util/bezier.js'
import {Matrix4, Vector2, Vector3, Vector4, nstructjs} from '../../../path.ux/scripts/pathux.js'

export class PaintSample {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
PaintSample {
  p              : vec4;
  dp             : vec4;
  sp             : vec4;
  strokeS        : float;
  dstrokeS       : float;
  dsp            : vec4;
  origp          : vec4;
  isInterp       : bool;
  sharp          : float;
  futureAngle    : float;

  vec            : vec3;
  dvec           : vec3;
  mirrored       : bool;

  color          : vec4;

  rendermat      : mat4;

  viewvec        : vec3;
  vieworigin     : vec3;
  viewPlane      : vec3;
  autosmoothInflate : float;

  planeoff       : float;
  rake           : float;
  strength       : float;
  angle          : float;
  radius         : float;
  w              : float;
  pinch          : float;
  smoothProj     : float;
  autosmooth     : float;
  concaveFilter  : float;
  invert         : bool;
  esize          : float;
  curve          : optional(Bezier);
  pressure       : float;
  hit            : bool;
}`
  )

  pressure = 1.0

  static interpKeys = [
    'pressure',
    'origp',
    'pinch',
    'sharp',
    'strength',
    'radius',
    'rake',
    'autosmooth',
    'concaveFilter',
  ] as const

  /** interpolated 'original' (at start of stroke) position via original position
   * attribute if one exists
   */
  origp: Vector4
  /** world space position */
  p: Vector4
  /** change in position */
  dp: Vector4
  viewPlane: Vector3
  rendermat: Matrix4
  /* arc length S along stroke in units of brush radius */
  strokeS: number
  /* change in arc length S along stroke in units of brush radius*/
  dstrokeS: number
  smoothProj: number
  pinch: number
  sharp: number
  // screen space point
  screenP: Vector2
  // screen space point change
  dScreenP: Vector2
  futureAngle: number
  invert: boolean
  w: number
  color: Vector4
  angle: number
  viewvec: Vector3
  vieworigin: Vector3
  isInterp: boolean
  vec: Vector3
  dvec: Vector3
  autosmoothInflate: number
  concaveFilter: number
  strength: number
  radius: number
  rake: number
  autosmooth: number
  esize: number
  planeoff: number
  mirrored: boolean
  // a slice of the stroke curve
  curve: Bezier | undefined
  /** false when this sample came from a ray that missed the scene and was
   * projected onto the camera-facing plane through the last surface hit */
  hit = true
  /** @deprecated */
  mpos = new Vector2()

  constructor() {
    this.origp = new Vector4()
    this.p = new Vector4()
    this.dp = new Vector4()
    this.viewPlane = new Vector3()

    this.rendermat = new Matrix4()

    this.strokeS = 0.0
    this.dstrokeS = 0.0

    this.smoothProj = 0.0

    this.pinch = 0.0
    this.sharp = 0.0

    //screen coordinates
    this.screenP = new Vector2()
    this.dScreenP = new Vector2()

    this.futureAngle = 0

    this.invert = false

    this.w = 0.0

    this.color = new Vector4()
    this.angle = 0

    this.viewvec = new Vector3()
    this.vieworigin = new Vector3()

    this.isInterp = false

    this.vec = new Vector3()
    this.dvec = new Vector3()

    this.autosmoothInflate = 0.0
    this.concaveFilter = 0.0
    this.strength = 0.0
    this.radius = 0.0
    this.rake = 0.0
    this.autosmooth = 0.0
    this.esize = 0.0
    this.planeoff = 0.0

    this.mirrored = false
  }

  static getMemSize(): number {
    let tot = 13 * 8
    tot += 5 * 3 * 8 + 8 * 5
    tot += 5 * 4 * 8 + 8 * 5 + 16 * 8

    return tot
  }

  mirror(mul: Vector4 = new Vector4([1, 1, 1, 1])): this {
    this.p.mul(mul)
    this.dp.mul(mul)
    this.origp.mul(mul)

    //this.sp.mulScalar(mul);
    this.dScreenP.mul(mul)
    this.viewvec.mul(mul)
    this.viewPlane.mul(mul)

    this.vec.mul(mul)
    this.dvec.mul(mul)

    this.angle *= mul[0] * mul[1] * mul[2]
    this.futureAngle *= mul[0] * mul[1] * mul[2]

    this.mirrored = !this.mirrored

    return this
  }

  copyTo(b: PaintSample): void {
    b.smoothProj = this.smoothProj
    b.futureAngle = this.futureAngle
    b.curve = this.curve?.clone()
    b.pressure = this.pressure

    b.strokeS = this.strokeS
    b.dstrokeS = this.dstrokeS
    b.sharp = this.sharp

    b.viewPlane.load(this.viewPlane)
    b.viewvec.load(this.viewvec)
    b.vieworigin.load(this.vieworigin)
    b.angle = this.angle
    b.invert = this.invert

    b.origp.load(this.origp)

    b.screenP.load(this.screenP)
    b.dScreenP.load(this.dScreenP)

    b.vec.load(this.vec)
    b.dvec.load(this.dvec)

    b.p.load(this.p)
    b.dp.load(this.dp)
    b.autosmoothInflate = this.autosmoothInflate

    b.w = this.w
    b.esize = this.esize

    b.color.load(this.color)
    b.isInterp = this.isInterp
    b.mirrored = this.mirrored
    b.hit = this.hit

    b.rendermat.load(this.rendermat)

    b.pinch = this.pinch
    b.rake = this.rake
    b.strength = this.strength
    b.radius = this.radius
    b.autosmooth = this.autosmooth
    b.planeoff = this.planeoff
    b.concaveFilter = this.concaveFilter
  }

  copy(): PaintSample {
    const ret = new PaintSample()

    this.copyTo(ret)

    return ret
  }
}
