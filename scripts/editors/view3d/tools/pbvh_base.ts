import {
  BaseVector,
  Curve1DProperty,
  EnumProperty,
  Vec2Property,
  FlagProperty,
  FloatProperty,
  keymap,
  Mat4Property,
  Matrix4,
  ToolOp,
  ToolProperty,
  Vector2,
  Vector3,
  Vector4,
  nstructjs,
  IndexRange,
  PropertySlots,
  IVectorOrHigher,
} from '../../../path.ux/scripts/pathux.js'

import {BrushFlags, SculptBrush, SculptTools, BrushSpacingModes, DynTopoSettings} from '../../../brush/brush'
import {ProceduralTex, TexUserFlags, TexUserModes} from '../../../texture/proceduralTex'
import {DataRefProperty, DataRef} from '../../../core/lib_api.js'
import {AttrRef, CDFlags} from '../../../mesh/customdata.js'
import {TetMesh} from '../../../tet/tetgen.js'
import {Mesh, Vector3LayerElem, Vertex} from '../../../mesh/mesh.js'
import {GridBase} from '../../../mesh/mesh_grids.js'
import {BVH, BVHFlags, IsectRet} from '../../../util/bvh.js'
import {MeshFlags} from '../../../mesh/mesh.js'

import * as util from '../../../util/util.js'
import * as math from '../../../util/math.js'

export function getBVH(ctx: any): BVH | undefined {
  const ob = ctx.object

  if (!ob) {
    return undefined
  }

  if (ob.data instanceof Mesh || ob.data instanceof TetMesh) {
    return ob.data.getBVH({autoUpdate: false})
  }
}

export function regenBVH(ctx: any): void {
  const ob = ctx.object

  if (!ob) {
    return undefined
  }

  if (ob.data instanceof Mesh || ob.data instanceof TetMesh) {
    ob.data.regenBVH()
  }
}

export const SymAxisMap: Vector3[][] = [
  [],
  [[-1, 1, 1]], //x
  [[1, -1, 1]], //y
  [
    [-1, 1, 1],
    [-1, -1, 1],
    [1, -1, 1],
  ], //x + y

  [[1, 1, -1]], //z
  [
    [-1, 1, 1],
    [1, 1, -1],
    [-1, 1, -1],
  ], //x+z
  [
    [1, -1, 1],
    [1, 1, -1],
    [1, -1, -1],
  ], //y+z

  [
    [-1, 1, 1],
    [1, -1, 1],
    [1, 1, -1],
    [-1, -1, 1],
    [-1, -1, -1],
    [-1, 1, -1],
    [1, -1, -1],
  ], //x+y+z
].map((v) => v.map((v) => new Vector3(v)))

export let BRUSH_PROP_TYPE: any

export class BrushProperty extends ToolProperty<SculptBrush> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
BrushProperty {
  brush    : SculptBrush;
  _texture : ProceduralTex;
  hasTex   : bool | !!this.brush.texUser.texture;
}`
  )

  brush: SculptBrush
  _texture: any

  constructor(value?: any) {
    super(BRUSH_PROP_TYPE)

    this.brush = new SculptBrush()
    this._texture = new ProceduralTex()

    if (value) {
      this.setValue(value)
    }
  }

  calcMemSize(): number {
    return this.brush.calcMemSize() + this._texture.calcMemSize()
  }

  setDynTopoSettings(dynTopo: DynTopoSettings): void {
    this.brush.dynTopo.load(dynTopo)
  }

  setValue(brush: SculptBrush): this {
    brush.copyTo(this.brush, false)

    if (this.brush.texUser.texture) {
      this.brush.texUser.texture.copyTo(this._texture, true)
      this.brush.texUser.texture = this._texture
    }

    return this
  }

  getValue(): SculptBrush {
    return this.brush
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this)
    super.loadSTRUCT(reader)

    const structThis = this as typeof this & {hasTex?: boolean}

    const texuser = this.brush.texUser
    if (structThis.hasTex) {
      delete structThis.hasTex
      this.brush.texUser.texture = this._texture
    } else {
      this.brush.texUser.texture = undefined
    }
  }
}

BRUSH_PROP_TYPE = ToolProperty.register(BrushProperty)

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
}`
  )

  origp: Vector4
  p: Vector4
  dp: Vector4
  viewPlane: Vector3
  rendermat: Matrix4
  strokeS: number
  dstrokeS: number
  smoothProj: number
  pinch: number
  sharp: number
  sp: Vector4
  dsp: Vector4
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
  curve: Bezier | undefined
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
    this.sp = new Vector4()
    this.dsp = new Vector4()

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
    this.dsp.mul(mul)
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

    b.strokeS = this.strokeS
    b.dstrokeS = this.dstrokeS
    b.sharp = this.sharp

    b.viewPlane.load(this.viewPlane)
    b.viewvec.load(this.viewvec)
    b.vieworigin.load(this.vieworigin)
    b.angle = this.angle
    b.invert = this.invert

    b.origp.load(this.origp)

    b.sp.load(this.sp)
    b.dsp.load(this.dsp)

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

export let PAINT_SAMPLE_TYPE: any

export class PaintSampleProperty extends ToolProperty<PaintSample[]> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
PaintSampleProperty {
  data : array(PaintSample);
}`
  )

  data: PaintSample[]

  constructor() {
    super(PAINT_SAMPLE_TYPE)
    this.data = []
  }

  calcMemSize(): number {
    let tot = super.calcMemSize()

    tot += PaintSample.getMemSize() * this.data.length

    return tot
  }

  push(sample: PaintSample): this {
    this.data.push(sample)
    return this
  }

  getValue(): PaintSample[] {
    return this.data
  }

  setValue(b: Iterable<PaintSample>): this {
    super.setValue(b instanceof Array ? b : Array.from(b))

    this.data.length = 0
    for (const item of b) {
      this.data.push(item)
    }

    return this
  }

  copy(): this {
    const ret = new PaintSampleProperty()

    for (const item of this) {
      ret.push(item.copy())
    }

    return ret as unknown as this
  }

  loadSTRUCT(reader: any): void {
    reader(this)
    super.loadSTRUCT(reader)
  }

  [Symbol.iterator](): Iterator<PaintSample> {
    return this.data[Symbol.iterator]()
  }
}

PAINT_SAMPLE_TYPE = ToolProperty.register(PaintSampleProperty)

export class SetBrushRadius extends ToolOp<{radius: FloatProperty; brush: DataRefProperty<SculptBrush>}> {
  last_mpos: Vector2
  mpos: Vector2
  start_mpos: Vector2
  cent_mpos: Vector2
  first: boolean
  _undo: any
  rand: util.MersenneRandom

  constructor() {
    super()

    this.rand = new util.MersenneRandom()

    this.last_mpos = new Vector2()
    this.mpos = new Vector2()
    this.start_mpos = new Vector2()
    this.cent_mpos = new Vector2()
    this.first = true
  }

  static canRun(ctx: any): boolean {
    return ctx.toolmode?.constructor.name === 'BVHToolMode'
  }

  static tooldef(): any {
    return {
      uiname  : 'Set Brush Radius',
      toolpath: 'brush.set_radius',
      inputs: {
        radius: new FloatProperty(15.0),
        brush : new DataRefProperty(SculptBrush),
      },
      is_modal: true,
    }
  }

  static invoke(ctx: ViewContext, args: any) {
    const tool = super.invoke(ctx, args)

    const toolmode = ctx.toolmode as unknown as BVHToolMode
    if (toolmode?.constructor.name !== 'BVHToolMode') {
      return tool
    }

    const brush = toolmode.getBrush()
    if (!brush) {
      return tool
    }

    if (!('brush' in args)) {
      tool.inputs.brush.setValue(brush)
    }

    if (!('radius' in args)) {
      const radius = brush.flag & BrushFlags.SHARED_SIZE ? toolmode.sharedBrushRadius : brush.radius
      tool.inputs.radius.setValue(radius)
    }

    return tool
  }

  modalStart(ctx: any): any {
    this.rand.seed(0)
    this.first = true

    return super.modalStart(ctx)
  }

  on_pointermove(e: any): void {
    const mpos = this.mpos

    mpos[0] = e.x
    mpos[1] = e.y

    const ctx = this.modal_ctx

    const brush = ctx.datalib.get(this.inputs.brush.getValue())
    if (!brush) {
      return
    }

    if (this.first) {
      this.first = false
      this.cent_mpos.load(mpos).subScalar(brush.radius / devicePixelRatio / Math.sqrt(2.0))

      this.start_mpos.load(mpos)
      this.last_mpos.load(mpos)
      return
    }

    const l1 = mpos.vectorDistance(this.cent_mpos)
    const l2 = this.last_mpos.vectorDistance(this.cent_mpos)

    if (l2 === 0.0 || l1 === 0.0) {
      return
    }

    this.resetTempGeom()
    this.makeTempLine(this.cent_mpos, this.mpos, 'rgba(25,25,25,0.25)')

    const toolmode = ctx.toolmode
    if (toolmode?.constructor.name === 'BVHToolMode') {
      toolmode.mpos.load(this.cent_mpos)
    }

    const ratio = l1 / l2
    let radius: number

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      const bvhtool = ctx.scene.toolmode_namemap.bvh
      if (bvhtool) {
        radius = bvhtool.sharedBrushRadius
      } else {
        radius = brush.radius
      }
    } else {
      radius = brush.radius
    }

    radius *= ratio
    console.log('F', ratio, radius)

    this.last_mpos.load(mpos)
    this.inputs.radius.setValue(radius)

    this.exec(ctx)
  }

  on_pointerup(e: any): void {
    this.modalEnd(false)
  }

  exec(ctx: any): void {
    const brush = ctx.datalib.get(this.inputs.brush.getValue())

    if (brush) {
      if (brush.flag & BrushFlags.SHARED_SIZE) {
        const toolmode = ctx.scene.toolmode_namemap.bvh

        if (toolmode) {
          toolmode.sharedBrushRadius = this.inputs.radius.getValue()
        }
      } else {
        brush.radius = this.inputs.radius.getValue()
      }
    }
  }

  undoPre(ctx: any): void {
    const brush = ctx.datalib.get(this.inputs.brush.getValue())

    this._undo = {}

    if (brush) {
      this._undo.radius = brush.radius
      this._undo.brushref = DataRef.fromBlock(brush)
    }
  }

  undo(ctx: any): void {
    const undo = this._undo

    if (!undo.brushref) {
      return
    }

    const brush = ctx.datalib.get(undo.brushref)
    if (!brush) {
      return
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      const toolmode = ctx.scene.toolmode_namemap.bvh

      if (toolmode) {
        toolmode.sharedBrushRadius = undo.radius
      }
    } else {
      brush.radius = undo.radius
    }
  }

  on_keydown(e: any): void {
    switch (e.keyCode) {
      case keymap['Escape']:
      case keymap['Enter']:
      case keymap['Space']:
        this.modalEnd(false)
        break
    }
  }
}

ToolOp.register(SetBrushRadius)

const co = new Vector3()
const t1 = new Vector3()
const t2 = new Vector3()

export class PathPoint {
  color: string
  co: Vector2
  origco: Vector2
  vel: Vector2
  acc: Vector2
  dt: number

  constructor(co: any, dt: number) {
    this.color = 'yellow'
    this.co = new Vector2(co)
    this.origco = new Vector2(co)
    this.vel = new Vector2()
    this.acc = new Vector2()
    this.dt = dt
  }
}

export function calcConcave(v: any): number {
  co.zero()
  let tot = 0.0
  let elen = 0

  for (const v2 of v.neighbors) {
    co.add(v2.co)
    elen += v2.co.vectorDistance(v.co)

    tot++
  }

  if (tot === 0.0) {
    return 0.5
  }

  elen /= tot

  co.mulScalar(1.0 / tot)
  t1.load(v.co)
    .sub(co)
    .mulScalar(1.0 / elen)
  const fac = t1.dot(v.no) * 0.5 + 0.5

  return 1.0 - fac
}

export function calcConcaveLayer(mesh: any): void {
  const name = '_paint_concave'

  let cd_concave = mesh.verts.customData.getNamedLayerIndex(name, 'float')
  if (cd_concave < 0) {
    const layer = mesh.verts.addCustomDataLayer('float', name)
    layer.flag |= CDFlags.TEMPORARY

    cd_concave = layer.index
  }

  for (const v of mesh.verts) {
  }
}

import {bez4, Bezier, dbez4} from '../../../util/bezier.js'
import {copyMouseEvent} from '../../../path.ux/scripts/path-controller/util/events.js'
import {CameraModes} from '../view3d_base.js'
import type {ToolContext, ViewContext} from '../../../core/context.js'
import {BVHToolMode} from './pbvh'
import {StructReader} from '../../../path.ux/scripts/path-controller/types/util/nstructjs.js'

export abstract class PaintOpBase<Inputs extends PropertySlots = {}, Outputs extends PropertySlots = {}> extends ToolOp<
  {
    brush: BrushProperty //
    samples: PaintSampleProperty //
    symmetryAxes: FlagProperty //
    falloff: any //
    rendermat: any //
    viewportSize: Vec2Property
  } & Inputs,
  Outputs,
  ToolContext,
  ViewContext
> {
  task: any | undefined
  grabMode: boolean
  mfinished: boolean
  last_mpos: Vector2 | Vector3
  last_p: Vector3
  last_origco: Vector4
  _first: boolean
  last_draw: number
  lastps1: any | undefined
  lastps2: any | undefined
  last_radius: number
  last_vec: Vector3
  rand: any
  queue: any[]
  qlast_time: number
  timer: number | undefined
  path: PathPoint[]
  alast_time: number
  _savedViewPoints: any[]

  constructor() {
    super()

    this.task = undefined

    this.grabMode = false

    this.mfinished = false
    this.last_mpos = new Vector2()
    this.last_p = new Vector3()
    this.last_origco = new Vector4()
    this._first = true

    this.last_draw = util.time_ms()

    this.lastps1 = undefined
    this.lastps2 = undefined

    this.last_radius = 0
    this.last_vec = new Vector3()

    this.rand = new util.MersenneRandom()

    this.queue = []
    this.qlast_time = util.time_ms()
    this.timer = undefined

    this.path = []
    this.alast_time = util.time_ms()

    this._savedViewPoints = []
  }

  static tooldef(): any {
    return {
      inputs: {
        brush       : new BrushProperty(),
        samples     : new PaintSampleProperty(),
        symmetryAxes: new FlagProperty(undefined, {X: 1, Y: 2, Z: 4}),
        falloff     : new Curve1DProperty(),
        rendermat   : new Mat4Property(),
        viewportSize: new Vec2Property(),
      },
    }
  }

  static needOrig(brush: any): boolean {
    const mode = brush.tool

    let isPaint = mode === SculptTools.MASK_PAINT || mode === SculptTools.TEXTURE_PAINT
    isPaint = isPaint || mode === SculptTools.PAINT || mode === SculptTools.PAINT_SMOOTH

    let ret = mode === SculptTools.SHARP || mode === SculptTools.GRAB
    ret = ret || mode === SculptTools.SNAKE // || mode === SculptTools.SMOOTH;
    ret = ret || (!isPaint && mode !== SculptTools.GRAB && brush.pinch !== 0.0)
    ret = ret || mode === SculptTools.PINCH || mode === SculptTools.SLIDE_RELAX

    //ret = ret || brush.autosmooth > 0 || brush.rake > 0 || brush.pinch > 0;

    if (brush.texUser.texture) {
      ret = ret || !!(brush.texUser.flag & TexUserFlags.ORIGINAL_CO)
    }

    return ret
  }

  timer_on_tick(): void {
    if (!this.modalRunning) {
      window.clearInterval(this.timer)
      this.timer = undefined
      return
    }

    //XXX currently disabled
    if (this.queue.length === 0) {
      return
    }

    if (util.time_ms() - this.last_draw > 100) {
      this.last_draw = util.time_ms()
      this.drawPath()
    }

    if (util.time_ms() - this.qlast_time > 5) {
      const time = util.time_ms()

      this.taskNext()

      this.qlast_time = util.time_ms()
    }
  }

  appendPath(x: number, y: number): void {
    let dt = util.time_ms() - this.alast_time
    dt = Math.max(dt, 1.0)

    const p = new PathPoint([x, y], dt)
    const path = this.path
    const dpi = devicePixelRatio

    if (path.length > 0) {
      const p0 = path[path.length - 1]
      p.vel.load(p.co).sub(p0.co)
      p.acc.load(p.vel).sub(p0.vel)

      let vel: Vector2
      //vel = new Vector3(p.vel).add(p0.vel).mulScalar(0.5);
      vel = p.vel
      const l1 = p0.vel.vectorLength()
      const l2 = p.vel.vectorLength()

      if (p.vel.vectorLength() > 7 / dpi) {
        const co = new Vector2()

        const a = new Vector2()
        const b = new Vector2()
        const c = new Vector2()
        const d = new Vector2()

        const vel1 = new Vector2(p0.vel).addFac(p0.acc, 0.5).mulScalar(0.5)
        const vel2 = new Vector2(p.vel).addFac(p.acc, 0.5).mulScalar(0.5)

        a.load(p0.co)
        d.load(p.co)
        b.load(a).addFac(vel1, 1.0 / 3.0)
        c.load(d).addFac(vel2, -1.0 / 3.0)

        co.load(p0.co)
          .addFac(p.vel, 0.5)
          .addFac(p.acc, 1.0 / 6.0)

        const brush = this.inputs.brush.getValue()
        const radius = brush.radius
        const spacing = brush.spacing

        const steps = Math.ceil(p.co.vectorDistance(p0.co) / (4 * radius * spacing))

        if (steps === 0) {
          this.path.push(p)
          this.alast_time = util.time_ms()
          return
        }

        let s = 0,
          ds = 1.0 / steps
        dt *= ds

        const lastp = p0

        for (let i = 0; i < steps; i++, s += ds) {
          const p2 = new PathPoint(undefined, ds)
          for (let j = 0; j < 2; j++) {
            p2.co[j as 0 | 1] = bez4(a[j], b[j], c[j], d[j], s)
            p2.vel[j as 0 | 1] = dbez4(a[j], b[j], c[j], d[j], s) * ds
          }

          p2.color = 'orange'
          p2.origco.load(p0.co).interp(p.co, s)

          //console.log(p2.co);

          p2.vel.load(p2.co).sub(lastp.co)
          p2.acc.load(p2.vel).sub(lastp.vel)
          this.path.push(p2)
        }

        p.vel
          .load(d)
          .sub(c)
          .mulScalar(-3.0 * ds)

        p.acc.load(p.vel).sub(lastp.vel)
        p.dt = dt

        if (0) {
          const p2 = new PathPoint(co, dt * 0.5)
          path.push(p2)

          p2.dt = dt * 0.5
          p.dt = dt * 0.5

          p2.vel.load(p2.co).sub(p0.co)
          p2.acc.load(p2.vel).sub(p0.vel)

          p.vel.load(p.co).sub(p2.co)
          p.acc.load(p.vel).sub(p2.vel)
        }

        //console.log("add points");
      }
    }

    path.push(p)
    this.alast_time = util.time_ms()
  }

  drawPath(): void {
    this.resetTempGeom()
    let lastp: PathPoint | undefined

    let start = this.path.length
    if (this.queue.length > 0) {
      start = this.queue[0][2]
    }

    const n = new Vector2()
    const color = 'rgba(255, 255, 255, 0.4)'

    for (let pi = start; pi < this.path.length; pi++) {
      const p = this.path[pi]

      if (lastp) {
        n.load(p.co).sub(lastp.co).normalize()
        const t = n[0]
        n[0] = n[1]
        n[1] = -t
        n.mulScalar(15.0)
        n.add(p.origco)

        this.makeTempLine(lastp.co, p.co, color)

        //this.makeTempLine(p.co, n, p.color);
        //this.makeTempLine(lastp.origco, p.origco, p.color);
      }
      lastp = p
    }
  }

  on_keydown(e: any): void {
    switch (e.keyCode) {
      case keymap['Escape']:
        this.modalEnd(false)

        if (this.timer) {
          window.clearInterval(this.timer)
          this.timer = undefined
        }

        //terminate immediately
        this.queue.length = 0
        while (this.task) {
          this.taskNext()
        }
        break
      case keymap['Enter']:
      case keymap['Space']:
        this.modalEnd(false)
        break
    }
  }

  on_pointermove(e: any, in_timer: boolean = false): void {
    if (this.mfinished) {
      return //wait for modalEnd
    }

    let pi = this.path.length

    if (this.inputs.brush.getValue().spacingMode === BrushSpacingModes.EVEN) {
      //console.log("Even spacing mode");

      //try to detect janky events and interpolate with a curve
      //note that this is not the EVEN spacing mode which happens in
      //subclases, it doesn't respect brush spacing when outputting the curve
      this.appendPath(e.x, e.y)
    } else {
      const p = new PathPoint([e.x, e.y], util.time_ms() - this.alast_time)
      this.path.push(p)
    }

    this.alast_time = util.time_ms()
    this.drawPath()

    for (; pi < this.path.length; pi++) {
      const p = this.path[pi]

      const e2 = copyMouseEvent(e)

      this.queue.push([e2, p, pi])
      //this.on_pointermove_intern(e, p.co[0], p.co[1], in_timer, pi !== this.path.length-1);
    }

    if (!this.task) {
      this.task = this.makeTask()
    }
  }

  makeTask(): Generator<void, void, unknown> {
    const this2 = this

    return (function* () {
      while (this2.queue.length > 0) {
        const [e, p, pi] = this2.queue.shift()

        const iter = this2.on_pointermove_intern(e, p.co[0], p.co[1], true, pi !== this2.path.length - 1) as any

        if (typeof iter === 'object' && iter[Symbol.iterator]) {
          for (const step of iter) {
            yield
          }
        }

        yield
      }
    })()
  }

  hasSampleDelay(): void {
    const brush = this.inputs.brush.getValue()

    let delayMode = false
    if (brush.texUser.texture) {
      const flag = brush.texUser.flag
      const mode = brush.texUser.mode

      delayMode = mode === TexUserModes.VIEW_REPEAT
      delayMode = delayMode && !!(flag & TexUserFlags.FANCY_RAKE)
    }

    //console.log("delayMode:", delayMode);
  }

  on_pointermove_intern(
    e: PointerEvent,
    x: number = e.x,
    y: number = e.y,
    in_timer: boolean = false,
    isInterp: boolean = false
  ) {
    //this.makeTempLine()

    const ctx = this.modal_ctx!

    if (!ctx.object || !(ctx.object.data instanceof Mesh || ctx.object.data instanceof TetMesh)) {
      return
    }

    const toolmode = ctx.toolmode
    const view3d = ctx.view3d
    const brush = this.inputs.brush.getValue()

    if (toolmode instanceof BVHToolMode) {
      //the pbvh toolmode is responsible for drawing brush circle,
      //make sure it has up to date info for that
      toolmode.mpos[0] = x
      toolmode.mpos[1] = y
    }

    const mpos = view3d.getLocalMouse(x, y)
    x = mpos[0]
    y = mpos[1]

    let pressure = 1.0

    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      pressure = e.pressure
    }

    //console.log(e.ctrlKey, view3d.size, x, y, e.targetTouches, pressure);

    const rendermat = view3d.activeCamera.rendermat
    const view = view3d.getViewVec(x, y)
    const origin = view3d.activeCamera.pos

    let invert = false
    const mode = brush.tool

    if (e.ctrlKey && mode !== SculptTools.PAINT && mode !== SculptTools.PAINT_SMOOTH) {
      invert = true
    }

    if (brush.flag & BrushFlags.INVERT) {
      invert = !invert
    }

    this.inputs.viewportSize.setValue(view3d.size)

    return this.sampleViewRay(rendermat, mpos, view, origin, pressure, invert, isInterp)
  }

  getBVH(mesh: Mesh | TetMesh): BVH {
    return mesh.getBVH({autoUpdate: false})!
  }

  abstract initOrigData(mesh: Mesh): AttrRef<Vector3LayerElem>
  abstract getOrigCo(
    mesh: Mesh,
    vertex: Vertex,
    cd_grid: AttrRef<GridBase>,
    cd_orig: AttrRef<Vector3LayerElem>
  ): Vector3

  sampleViewRay(
    rendermat: Matrix4,
    mpos: Vector2,
    view: IVectorOrHigher<3>,
    origin: IVectorOrHigher<3>,
    pressure: number,
    invert: boolean,
    isInterp: boolean
  ) {
    const brush = this.inputs.brush.getValue()
    const mode = brush.tool

    const ctx = this.modal_ctx!

    if (!ctx.object || !(ctx.object.data instanceof Mesh || ctx.object.data instanceof TetMesh)) {
      return
    }

    /*
    let falloff = this.inputs.falloff.getValue();
    let strengthMul = falloff.integrate(1.0) - falloff.integrate(0.0);
    strengthMul = Math.abs(strengthMul !== 0.0 ? 1.0 / strengthMul : strengthMul);
    */

    let radius = brush.radius

    const getchannel = (key: string, val: number): number => {
      const ch = brush.dynamics.getChannel(key)
      if (ch?.useDynamics) {
        return val * ch.curve.evaluate(pressure)
      } else {
        return val
      }
    }

    radius = getchannel('radius', radius)

    const toolmode = ctx.toolmode
    const view3d = ctx.view3d

    if (toolmode instanceof BVHToolMode) {
      toolmode._radius = radius
    }

    //console.log("pressure", pressure, strength, dynmask);

    const ob = ctx.object
    const mesh = ob.data as Mesh

    const bvh = this.getBVH(mesh)

    const axes: number[] = [-1]
    const sym = mesh.symFlag

    for (let i = 0; i < 3; i++) {
      if (mesh.symFlag & (1 << i)) {
        axes.push(i)
      }
    }

    const haveOrigData = PaintOpBase.needOrig(brush)
    const cd_orig = haveOrigData ? this.initOrigData(mesh) : undefined
    const cd_grid = GridBase.meshGridRef(mesh)

    let isect: any
    const obmat = ob.outputs.matrix.getValue()
    const matinv = new Matrix4(obmat)
    matinv.invert()

    origin = new Vector3(origin)
    origin.multVecMatrix(matinv)

    const view4 = new Vector4().load3(view as Vector3)
    view4[3] = 0.0
    view4.multVecMatrix(matinv)
    view = new Vector3(view4).normalize()

    for (const axis of axes) {
      let view2 = new Vector3(view)
      let origin2 = new Vector3(origin)

      if (axis !== -1) {
        origin2[axis as Vector2['LEN']] = -origin2[axis]
        view2[axis as Vector2['LEN']] = -view2[axis]
      }

      origin2 = new Vector3(origin2)
      view2 = new Vector3(view2)

      const isect2 = bvh.castRay(origin2, view2)

      if (isect2 && (!isect || isect2.dist < isect.dist)) {
        isect = isect2.copy()
        origin = origin2
        view = view2
      }
    }

    const origco = new Vector4()

    if (!isect) {
      if ((this.grabMode || mode === SculptTools.GRAB || mode === SculptTools.SNAKE) && !this._first) {
        const p = new Vector3(this.last_p)
        p.multVecMatrix(obmat)

        view3d.project(p, rendermat)

        p[0] = mpos[0]
        p[1] = mpos[1]

        view3d.unproject(p, rendermat.clone().invert())
        p.multVecMatrix(matinv)

        const dis = p.vectorDistance(origin)

        isect = new IsectRet()

        isect.p = p
        isect.dis = dis
        isect.tri = undefined
      } else {
        return
      }
    } else {
      const tri = isect.tri

      if (haveOrigData) {
        const o1 = this.getOrigCo(mesh, tri.v1, cd_grid, cd_orig!)
        const o2 = this.getOrigCo(mesh, tri.v2, cd_grid, cd_orig!)
        const o3 = this.getOrigCo(mesh, tri.v3, cd_grid, cd_orig!)

        for (const i of IndexRange(3)) {
          origco[i as Vector3['LEN']] =
            o1[i] * isect.uv[0] + o2[i] * isect.uv[1] + o3[i] * (1.0 - isect.uv[0] - isect.uv[1])
        }

        origco[3] = 1.0
      } else {
        origco.load(isect.p)
        origco[3] = 1.0
      }
    }

    const p3 = new Vector4(isect.p)
    p3[3] = 1.0

    const matrix = new Matrix4(ob.outputs.matrix.getValue())
    p3.multVecMatrix(rendermat)

    const w = p3[3] * matrix.$matrix.m11

    if (view3d.cameraMode === CameraModes.ORTHOGRAPHIC) {
      //w = 1.0;
    }

    //let w2 = Math.cbrt(w);

    if (w <= 0) return

    radius /= Math.max(view3d.glSize[0], view3d.glSize[1])
    radius *= Math.abs(w)

    const vec = new Vector3()

    if (isect.tri) {
      vec.load(isect.tri.v1.no)
      vec.add(isect.tri.v2.no)
      vec.add(isect.tri.v3.no)
      vec.normalize()
    } else {
      vec.load(view).normalize()
    }

    view.negate()
    if (vec.dot(view) < 0) {
      view.negate()
    }
    view.normalize()

    vec.interp(view, 1.0 - brush.normalfac).normalize()

    if (this._first) {
      this.last_mpos.load(mpos)
      this.last_p.load(isect.p)
      this.last_origco.load(origco)
      this.last_vec.load(vec)
      this.last_radius = radius
      this._first = false

      return undefined
    }

    this._savedViewPoints.push({
      viewvec  : new Vector3(view),
      viewp    : new Vector3(origin),
      rendermat: rendermat.clone(),
      mpos     : new Vector2(mpos),
    })

    return {
      // XXX possible performance issue!
      // allocating a vector3 here
      origco: new Vector3(origco),
      p     : isect.p as Vector3,
      isect : isect.copy() as IsectRet,
      radius,
      ob,
      vec,
      mpos,
      view: view as Vector3,
      getchannel,
      w,
    }
  }

  //for debugging purposes
  writeSaveViewPoints(n: number = 5): string {
    function toFixed(f: number): string {
      let s = f.toFixed(n)
      while (s.endsWith('0')) {
        s = s.slice(0, s.length - 1)
      }

      if (s.length === 0) {
        return '0'
      }

      if (s[s.length - 1] === '.') {
        s += '0'
      }

      return s
    }

    function myToJSON(obj: any): string {
      if (typeof obj === 'object') {
        if (Array.isArray(obj) || obj instanceof BaseVector) {
          let s = '['
          for (let i = 0; i < obj.length; i++) {
            if (i > 0) {
              s += ','
            }

            s += myToJSON(obj[i])
          }

          s += ']'

          return s
        } else if (obj instanceof Matrix4) {
          return myToJSON(obj.getAsArray())
        } else {
          let s = '{'
          const keys = Object.keys(obj)

          for (let i = 0; i < keys.length; i++) {
            const k = keys[i]
            let v: any

            try {
              v = obj[k]
            } catch (error) {
              console.log('error with property ' + k)
              continue
            }

            if (typeof v === 'function') {
              continue
            }

            if (i > 0) {
              s += ','
            }

            s += `"${k}" : ${myToJSON(v)}`
          }
          s += '}'

          return s
        }
      } else if (typeof obj === 'number') {
        return toFixed(obj)
      } else {
        return '' + obj
      }
    }

    return myToJSON(this._savedViewPoints)
  }

  taskNext(): void {
    if (!this.task) {
      return
    }

    const time = util.time_ms()
    while (util.time_ms() - time < 45) {
      let ret: any

      try {
        ret = this.task.next()
      } catch (error) {
        util.print_stack(error)
        this.task = undefined
        break
      }

      if (!ret || ret.done) {
        this.task = undefined
        break
      }
    }
  }

  modalEnd(was_cancelled: boolean): void {
    this.mfinished = true

    if (!this.modalRunning) {
      return
    }

    if (this.task) {
      //can't end modal
      console.log('Waiting for task to finish')
      this.taskNext()

      window.setTimeout(() => {
        this.modalEnd(was_cancelled)
      }, 150)

      return
    }

    super.modalEnd(was_cancelled)

    if (this.timer !== undefined) {
      window.clearInterval(this.timer)
      this.timer = undefined
    }
  }

  on_pointerup(e: any): void {
    this.mfinished = true
    this.modalEnd(false)
  }

  undoPre(ctx: any): void {
    throw new Error('implement me!')
  }

  calcUndoMem(ctx: any): number {
    throw new Error('implement me!')
  }

  modalStart(ctx: any): void {
    this.mfinished = false

    this.lastps1 = undefined
    this.lastps2 = undefined

    if (this.timer !== undefined) {
      window.clearInterval(this.timer)
    }

    this.timer = window.setInterval(() => this.timer_on_tick(), 5)

    this._first = true
    super.modalStart(ctx)
  }

  undo(ctx: any): void {
    throw new Error('implement me!')
  }
}

export class MaskOpBase<Inputs extends {} = {}, Outputs extends {} = {}> extends ToolOp<Inputs, Outputs> {
  _undo: any
  rand = new util.MersenneRandom()

  constructor() {
    super()
  }

  calcUndoMem(ctx: any): number {
    const ud = this._undo

    if (ud.gridData) {
      return ud.gridData.length * 8
    }

    if (ud.vertData) {
      return ud.vertData.length * 8
    }

    return 0
  }

  undoPre(ctx: any): void {
    const mesh = ctx.mesh || ctx.tetmesh

    const ud: any = (this._undo = {mesh: -1})

    if (!mesh) {
      return
    }

    ud.mesh = mesh.lib_id

    const cd_grid = GridBase.meshGridOffset(mesh)
    let cd_mask: number

    ud.cd_grid = cd_grid

    if (cd_grid >= 0) {
      const gd: number[] = (ud.gridData = [])
      cd_mask = ud.cd_mask = mesh.loops.customData.getLayerIndex('mask')

      if (cd_mask < 0) {
        return
      }

      for (const l of mesh.loops) {
        const grid = l.customData[cd_grid]

        for (const p of grid.points) {
          if (p.flag & MeshFlags.HIDE) {
            continue
          }

          gd.push(l.eid)
          gd.push(p.eid)
          gd.push(p.customData[cd_mask].value)
        }
      }
    } else {
      cd_mask = ud.cd_mask = mesh.verts.customData.getLayerIndex('mask')

      if (cd_mask < 0) {
        return
      }
      const vd: number[] = (ud.vertData = [])

      for (const v of mesh.verts) {
        if (v.flag & MeshFlags.HIDE) {
          continue
        }

        vd.push(v.eid)
        vd.push(v.customData[cd_mask].value)
      }
    }
  }

  undo(ctx: any): void {
    const ud = this._undo
    const mesh = ctx.datalib.get(ud.mesh)

    if (!mesh) {
      return
    }

    const cd_grid = GridBase.meshGridOffset(mesh)
    let cd_mask: number
    const cd_node = mesh.bvh ? mesh.bvh.cd_node : new AttrRef(-1)

    ud.cd_grid = cd_grid
    const updateflag = BVHFlags.UPDATE_MASK | BVHFlags.UPDATE_DRAW

    if (cd_grid >= 0) {
      for (const l of mesh.loops) {
        const grid = l.customData[cd_grid]
        grid.regenEIDMap()
      }

      const gd = ud.gridData
      cd_mask = ud.cd_mask = mesh.loops.customData.getLayerIndex('mask')

      if (cd_mask < 0) {
        return
      }

      for (let gi = 0; gi < gd.length; gi += 3) {
        const leid = gd[gi],
          peid = gd[gi + 1],
          mask = gd[gi + 2]

        const l = mesh.eidMap.get(leid)
        if (!l) {
          console.error('Missing loop ' + leid)
          continue
        }

        const grid = l.customData[cd_grid]
        const eidMap = grid.getEIDMap(mesh)

        const p = eidMap.get(peid)

        if (!p) {
          console.warn('Missing grid vert:' + peid)
          continue
        }

        p.customData[cd_mask].value = mask
        p.flag |= MeshFlags.UPDATE

        if (cd_node.i >= 0) {
          const node = p.customData[cd_node.i].node

          if (node) {
            node.setUpdateFlag(updateflag)
          }
        }
      }
    } else {
      cd_mask = ud.cd_mask = mesh.verts.customData.getLayerIndex('mask')

      if (cd_mask < 0) {
        return
      }
      const vd = ud.vertData

      for (let vi = 0; vi < vd.length; vi += 2) {
        const veid = vd[vi],
          mask = vd[vi + 1]

        const v = mesh.eidMap.get(veid)

        if (!v) {
          console.warn('Missing vertex ' + veid)
          continue
        }

        v.customData[cd_mask].value = mask
        v.flag |= MeshFlags.UPDATE

        if (cd_node.i >= 0) {
          const node = v.customData[cd_node.i].node
          if (node) {
            node.setUpdateFlag(updateflag)
          }
        }
      }
    }

    mesh.regenRender()
    mesh.graphUpdate()
    window.redraw_viewport(true)
  }

  getCDMask(mesh: any): number {
    const cd_grid = GridBase.meshGridOffset(mesh)

    if (cd_grid >= 0) {
      return mesh.loops.customData.getLayerIndex('mask')
    } else {
      return mesh.verts.customData.getLayerIndex('mask')
    }
  }

  execPre(ctx: any): void {
    this.rand.seed(0)
  }

  getVerts(mesh: any, updateBVHNodes: boolean = true): Generator<any, void, unknown> {
    const this2 = this

    const cd_node = mesh.bvh ? mesh.bvh.cd_node : new AttrRef(-1)
    const bvh = mesh.bvh ? mesh.bvh : undefined

    updateBVHNodes = updateBVHNodes && cd_node.i >= 0

    const updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK

    return (function* () {
      const cd_mask = this2.getCDMask(mesh)
      const cd_grid = GridBase.meshGridOffset(mesh)

      if (cd_mask < 0) {
        return
      }

      if (cd_grid >= 0) {
        for (const l of mesh.loops) {
          const grid = l.customData[cd_grid]
          for (const p of grid.points) {
            yield p

            if (updateBVHNodes) {
              const node = p.customData[cd_node.i].node
              if (node) {
                node.setUpdateFlag(updateflag)
              }
            }
          }
        }
      } else {
        for (const v of mesh.verts) {
          yield v

          if (updateBVHNodes) {
            const node = v.customData[cd_node.i].node
            if (node) {
              node.setUpdateFlag(updateflag)
            }
          }
        }
      }

      mesh.regenRender()
      mesh.graphUpdate()
      window.redraw_viewport(true)
    })()
  }
}

export class ClearMaskOp extends MaskOpBase<{value: FloatProperty}> {
  static tooldef(): any {
    return {
      uiname  : 'Clear Mask',
      toolpath: 'paint.clear_mask',
      inputs: {
        value: new FloatProperty(1.0),
      },
    }
  }

  exec(ctx: any): void {
    const mesh = ctx.mesh
    if (!mesh) {
      return
    }

    const cd_mask = this.getCDMask(mesh)
    if (cd_mask < 0) {
      return
    }

    const value = this.inputs.value.getValue()

    for (const v of this.getVerts(mesh, true)) {
      v.customData[cd_mask].value = value
    }
  }
}

ToolOp.register(ClearMaskOp)
