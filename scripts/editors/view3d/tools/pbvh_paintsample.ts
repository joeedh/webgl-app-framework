import {bez4, Bezier, dbez4} from '../../../util/bezier.js'
import {Matrix4, Vector2, Vector3, Vector4, nstructjs} from '../../../path.ux/scripts/pathux.js'
import {view3dProject, view3dUnproject} from '../view3d_base'

export class PaintSample {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
PaintSample {
  p              : vec4;
  dp             : vec4;
  screenP        : vec2;
  dScreenP       : vec2;
  strokeS        : float;
  dstrokeS       : float;
  origp          : vec4;
  isInterp       : bool;
  sharp          : float;
  futureAngle    : float;

  vec            : vec3;
  dvec           : vec3;
  mirrored       : bool;

  color          : vec4;

  rendermat      : mat4;
  irendermat     : mat4;
  view3dSize     : vec2;

  viewvec        : vec3;
  vieworigin     : vec3;
  viewPlane      : vec3;

  planeoff       : float;
  rake           : float;
  strength       : float;
  angle          : float;
  radius         : float;
  w              : float;
  pinch          : float;
  smoothProj     : float;
  autosmooth     : float;
  autosmoothInflate : float;
  concaveFilter  : float;
  invert         : bool;
  esize          : float;
  curve          : optional(bezier.Bezier);
  pressure       : float;
  hit            : bool;
  useAltBrush    : bool;
  anchorVec      : vec3;
  liveAngle      : float;
}`
  )

  pressure = 1.0
  twist = 0.0
  tiltX = 0.0
  tiltY = 0.0

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
  irendermat: Matrix4
  view3dSize: Vector2
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
  /** triggered by shift key */
  useAltBrush = false
  /** Anchored stroke method: object-local vector from the fixed anchor to the
   * live cursor position (see StrokeMethod.ANCHORED). Zero outside Anchored. */
  anchorVec: Vector3
  /** Anchored stroke method, AnchoredLiveMode.ANGLE: screen-space angle
   * (radians) from the anchor to the live cursor. Zero otherwise. */
  liveAngle = 0

  constructor() {
    this.origp = new Vector4()
    this.p = new Vector4()
    this.dp = new Vector4()
    this.viewPlane = new Vector3()

    this.rendermat = new Matrix4()
    this.irendermat = new Matrix4()
    this.view3dSize = new Vector2()

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
    this.anchorVec = new Vector3()

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

  mirror(mul: Vector3 = new Vector3([1, 1, 1])): this {
    const mul4 = new Vector4().load3(mul)
    mul4[3] = 1

    this.p.mul(mul4)
    this.dp.mul(mul4)
    this.origp.mul(mul4)


    // s1 = (p * flip) * screenMatrix
    // s2 = s1 + one_pixel_offset
    // radius_scale = distance(unproject(s2), unproject(s1))
    // radius_scale should be same regardless of which components of flip are 1 or -1
    //
    // Folding R = diag(flip) into rendermat (-> R·rendermat) gives exactly that:
    // (p*flip)·(R·rendermat) == p·rendermat, so the projection always lands at the
    // un-flipped (primary) depth and the per-pixel radius_scale is flip-invariant.
    const refl = new Matrix4()
    refl.scale(mul4[0], mul4[1], mul4[2])
    this.rendermat.multiply(refl) // Matrix4.multiply(B) = B·this
    this.irendermat.load(this.rendermat).invert()

    this.curve?.mirror(mul)

    this.screenP.load(this.p)
    view3dProject(this.screenP, this.view3dSize, this.rendermat)

    // derive mirrored screen delta
    this.dScreenP.load(this.p).sub(this.dp)
    view3dProject(this.dScreenP, this.view3dSize, this.rendermat)
    this.dScreenP.sub(this.screenP)

    this.viewvec.mul(mul4)
    this.viewPlane.mul(mul4)
    this.vieworigin.mul(mul4)

    this.vec.mul(mul4)
    this.dvec.mul(mul4)
    this.anchorVec.mul(mul4)

    this.angle *= mul4[0] * mul4[1] * mul4[2]
    this.futureAngle *= mul4[0] * mul4[1] * mul4[2]
    this.liveAngle *= mul4[0] * mul4[1] * mul4[2]

    this.mirrored = !this.mirrored
    return this
  }

  copyTo(b: PaintSample): void {
    b.curve = this.curve?.clone()

    b.strokeS = this.strokeS
    b.dstrokeS = this.dstrokeS
    b.sharp = this.sharp
    b.tiltX = this.tiltX
    b.tiltY = this.tiltY
    b.twist = this.twist

    b.screenP.load(this.screenP)
    b.dScreenP.load(this.dScreenP)

    b.vec.load(this.vec)
    b.dvec.load(this.dvec)
    b.anchorVec.load(this.anchorVec)
    b.liveAngle = this.liveAngle

    b.origp.load(this.origp)
    b.p.load(this.p)
    b.dp.load(this.dp)

    b.w = this.w
    b.esize = this.esize

    b.isInterp = this.isInterp
    b.mirrored = this.mirrored
    b.hit = this.hit

    b.rendermat.load(this.rendermat)
    b.irendermat.load(this.irendermat)
    b.view3dSize.load(this.view3dSize)
    b.viewPlane.load(this.viewPlane)
    b.viewvec.load(this.viewvec)
    b.vieworigin.load(this.vieworigin)

    b.invert = this.invert
    b.color.load(this.color)
    b.angle = this.angle
    b.futureAngle = this.futureAngle
    b.smoothProj = this.smoothProj
    b.pressure = this.pressure
    b.autosmoothInflate = this.autosmoothInflate
    b.pinch = this.pinch
    b.rake = this.rake
    b.strength = this.strength
    b.radius = this.radius
    b.autosmooth = this.autosmooth
    b.planeoff = this.planeoff
    b.concaveFilter = this.concaveFilter

    b.useAltBrush = this.useAltBrush
  }

  copy(): PaintSample {
    const ret = new PaintSample()

    this.copyTo(ret)

    return ret
  }
}
