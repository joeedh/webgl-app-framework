/*
Widget Refactor Todo:

* DONE: Destroy WidgetTool, rename to ViewportEventListener or something


* */

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../../util/vectormath.js'
import {SimpleMesh, LayerTypes} from '../../../core/simplemesh'
import {Shapes} from '../../../core/simplemesh_shapes.js'
import {Shaders} from '../../../shaders/shaders.js'
import {isect_ray_plane} from '../../../path.ux/scripts/util/math.js'
import {isMobile} from '../../../path.ux/scripts/util/util.js'
import {CallbackNode, INodeConstructor, INodeSocketSet, Node, NodeFlags} from '../../../core/graph.js'
import {DependSocket} from '../../../core/graphsockets.js'
import {css2color} from '../../../path.ux/scripts/core/ui_base.js'
import {View3D} from '../view3d.js'
import {OptionalIf} from '../../../util/optionalIf.js'
import {ViewContext} from '../../../core/context.js'
import {util, math} from '../../../path.ux/pathux.js'

export interface IFindNearestResult {
  data: any
  dis: number
  z: number
  margin: number
}

const dist_temp_mats = util.cachering.fromConstructor(Matrix4, 512)
const dist_temps = util.cachering.fromConstructor(Vector3, 512)
const dist_temps4 = util.cachering.fromConstructor(Vector4, 512)
const dist_rets = util.cachering.fromConstructor(Vector2, 512)

export const WidgetFlags = {
  SELECT       : 1,
  //HIDE      : 2,
  HIGHLIGHT    : 4,
  CAN_SELECT   : 8,
  IGNORE_EVENTS: 16,
  ALL_EVENTS   : 32, //widget gets event regardless of if mouse cursor is near it
}

let shape_idgen = 0

export class WidgetShape<OPT extends {dead?: true | false | undefined} = {}> {
  public shapeid: string = ''

  // Internal properties
  protected _drawtemp: Vector3
  protected _drawtemp4: Vector4 = new Vector4()
  protected _debug_id: number
  protected _tempmat: Matrix4
  protected _tempmat2: Matrix4

  // Configuration properties
  extraMouseMargin: number
  destroyed: boolean
  flag: number
  owner: any // Type could be more specific if known
  wireframe: boolean
  worldscale: boolean
  wscale: number

  // Visual properties
  color: Vector4
  hcolor: Vector4 // highlight color
  matrix: Matrix4
  colortemp: Vector4
  drawmatrix: Matrix4

  // Rendering properties
  mesh: OptionalIf<SimpleMesh, OPT['dead']>
  gl?: WebGL2RenderingContext

  // Interaction handlers
  onclick: () => void

  constructor() {
    this._drawtemp = new Vector3()

    this._debug_id = shape_idgen++

    this.extraMouseMargin = 0 /* Adds to limit parameter of WidgetBase.findNearest*/

    this.destroyed = false
    this.flag = WidgetFlags.CAN_SELECT
    this.owner = undefined

    this.wireframe = false
    this.worldscale = false

    this.wscale = 1.0

    this.color = new Vector4([0.1, 0.5, 1.0, 1.0])
    this.hcolor = new Vector4([0.9, 0.9, 0.9, 0.8]) //highlight color

    this.matrix = new Matrix4()

    this.colortemp = new Vector4()

    //internal final draw matrix
    this.drawmatrix = new Matrix4()
    this._tempmat = new Matrix4()
    this._tempmat2 = new Matrix4()

    this.mesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV)

    this.onclick = () => {
      console.log('widget click!')
    }
  }

  onContextLost(e: WebGLContextEvent) {
    if (this.mesh !== undefined) {
      this.mesh.onContextLost(e)
    }
  }

  destroy(gl: WebGL2RenderingContext) {
    if (this.gl !== undefined && gl !== this.gl) {
      console.warn('Destroy called with new gl context')
    } else if (this.gl === undefined && gl !== undefined) {
      this.gl = gl
    }

    if (this.gl === undefined) {
      return
    }

    const deadThis = this as unknown as WidgetShape<OPT & {dead: true}>
    deadThis.mesh!.destroy(deadThis.gl!)
    deadThis.mesh = undefined
    deadThis.destroyed = true
  }

  //returns [distance (in 2d screen space), z (for simple z ordering)]
  distToMouse(view3d: View3D, x: number, y: number, matrix: Matrix4, wscale?: number) {
    throw new Error('implement me')
  }

  copy() {
    const ret = new (this as any).constructor()
    this.copyTo(ret)
    return ret
  }

  copyTo(b: this) {
    b.flag = this.flag
    b.owner = this.owner
    b.matrix.load(this.matrix)
    //b.loc.load(this.loc)
    //b.rot.load(this.rot)
    //b.scale.load(this.scale)
    b.mesh = this.mesh

    return b
  }

  setUniforms(manager: WidgetManager, uniforms: any) {
    const view3d = manager.ctx.view3d

    uniforms.color = this.colortemp.load(this.color)
    uniforms.size = view3d.glSize
    uniforms.aspect = view3d.activeCamera.aspect
    uniforms.near = view3d.activeCamera.near
    uniforms.far = view3d.activeCamera.far
    uniforms.polygonOffset = 0.0
    uniforms.projectionMatrix = manager.ctx.view3d.activeCamera.rendermat
    uniforms.objectMatrix = this.drawmatrix
  }

  draw(gl: WebGL2RenderingContext, manager: WidgetManager, matrix: Matrix4, alpha = 1.0, no_z_write = false) {
    if (this.destroyed) {
      console.log('Reusing widget shape')
      this.destroyed = false
    }

    if (this.mesh === undefined) {
      console.warn('missing mesh in WidgetShape.prototype.draw()')
      return
    }

    const view3d = manager.ctx.view3d

    this.mesh.program = Shaders.WidgetMeshShader

    this.setUniforms(manager, this.mesh.uniforms)
    this.mesh.uniforms.color[3] = alpha

    /* Derive zoom scale */
    const mat = this.drawmatrix
    mat.load(matrix).multiply(this.matrix)

    const camera = manager.ctx.view3d.activeCamera
    const co = this._drawtemp4
    co.zero()
    co[3] = 1.0
    co.multVecMatrix(mat)

    /* Use w component of projected vector. */
    co[3] = 1.0
    co.multVecMatrix(camera.rendermat)
    const w = co[3]

    const smat = this._tempmat
    smat.makeIdentity()

    let scale = isMobile() ? w * 0.15 : w * 0.075 //Math.max(w*0.05, 0.01);
    if (this.worldscale) {
      scale = 1.0
    }

    //XXX
    scale = 1.0

    this.wscale = scale

    smat.scale(scale, scale, scale)

    mat.makeIdentity()
    mat.multiply(matrix)
    mat.multiply(this.matrix)
    mat.multiply(smat)

    gl.enable(gl.BLEND)

    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE)
    //gl.blendEquation(gl.FUNC_ADD);

    if (!no_z_write) {
      gl.enable(gl.DEPTH_TEST)
      gl.depthMask(true)
    } else {
      gl.depthMask(false)
    }

    if (this.wireframe) {
      this.mesh.drawLines(gl, undefined, Shaders.WidgetMeshShader)
    } else {
      this.mesh.draw(gl)
    }

    if (this.flag & WidgetFlags.HIGHLIGHT) {
      gl.enable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      //this.mesh.draw(gl);

      const hcolor = this.colortemp.load(this.hcolor)
      hcolor[3] = alpha

      this.mesh.draw(gl, {
        polygonOffset: 0.1,
        color        : hcolor,
      })

      if (!no_z_write) {
        gl.enable(gl.DEPTH_TEST)
      }
    }

    gl.disable(gl.BLEND)
  }
}

export class WidgetTorus extends WidgetShape {
  tco: Vector3

  constructor() {
    super()

    this.colortemp = new Vector4()
    this.extraMouseMargin = 64

    this.tco = new Vector3()
    this.shapeid = 'TORUS'
  }

  draw(gl: WebGL2RenderingContext, manager: WidgetManager, matrix: Matrix4) {
    this.mesh = manager.shapes[this.shapeid]

    return super.draw(gl, manager, matrix)
  }

  distToMouse(view3d: View3D, x: number, y: number, matrix: Matrix4, wscale = 1.0) {
    const mat = dist_temp_mats.next()
    mat.load(matrix)

    const origin = dist_temps.next().zero()
    const plane = dist_temps.next().zero()
    const m = mat.$matrix

    origin[0] = m.m41
    origin[1] = m.m42
    origin[2] = m.m43

    plane[0] = m.m31
    plane[1] = m.m32
    plane[2] = m.m33
    plane.normalize()

    const view = new Vector3(view3d.getViewVec(x, y))
    view.normalize()
    const vieworigin = view3d.activeCamera.pos

    const isect = isect_ray_plane(origin, plane, vieworigin, view)

    if (!isect) {
      return 10000.0
    }

    let z = isect.vectorDistance(vieworigin)

    let dis = isect.vectorDistance(origin)
    //dis = Math.abs(dis - 1.0)/this.wscale;

    const scale = (mat.$matrix.m11 ** 2 + mat.$matrix.m21 ** 2 + mat.$matrix.m31 ** 2) ** 0.5

    dis = Math.abs(dis / wscale - scale * 0.5) * 0.25

    const viewsize = view3d.size[1]

    dis *= viewsize
    z *= viewsize / wscale

    console.log('dis', dis.toFixed(4), 'scale', scale, wscale)

    return [dis, z]
  }
}

export class WidgetArrow extends WidgetShape {
  constructor() {
    super()

    this.shapeid = 'ARROW'
  }

  draw(gl: WebGL2RenderingContext, manager: WidgetManager, matrix: Matrix4) {
    this.mesh = manager.shapes[this.shapeid]
    super.draw(gl, manager, matrix)
  }

  distToMouse(view3d: View3D, x: number, y: number, matrix: Matrix4, wscale = 1.0) {
    const mat = dist_temp_mats.next()
    mat.load(matrix)

    const v1 = dist_temps.next().zero()
    const v2 = dist_temps.next().zero()

    const sz = wscale
    v1[2] = sz
    v2[2] = -sz

    v1.multVecMatrix(matrix)
    v2.multVecMatrix(matrix)

    view3d.project(v1)
    view3d.project(v2)

    const tout = dist_rets.next().zero()

    let t = tout[0]

    const p = new Vector2().loadXY(x, y)
    const t1 = new Vector2(v2 as unknown as Vector2).sub(v1),
      t2 = new Vector2(p).sub(v1)
    t1.normalize()

    t = t1.dot(t2) / v1.vectorDistance(v2)
    t = Math.min(Math.max(t, -0.25), 1.25)

    const lineco = dist_temps.next()
    lineco.load(v1).interp(v2, t)

    let dis = p.vectorDistance(lineco)
    const pad = t < 0.25 ? 8 : 4

    /* Get distance to fat line by subtracting from dis. */
    dis = Math.max(dis - pad, 0)
    return [Math.max(dis, 0), lineco[2], t]
  }
}

export class WidgetBlockArrow extends WidgetArrow {
  constructor() {
    super()
    this.shapeid = 'BLOCKARROW'
  }

  distToMouse(view3d: View3D, x: number, y: number, matrix: Matrix4, wscale = 1.0) {
    const ret = super.distToMouse(view3d, x, y, matrix, wscale)

    return ret
  }
}

export class WidgetSphere extends WidgetShape {
  constructor() {
    super()
    this.shapeid = 'SPHERE'
  }

  draw(gl: WebGL2RenderingContext, manager: WidgetManager, matrix: Matrix4) {
    this.mesh = manager.shapes[this.shapeid]
    super.draw(gl, manager, matrix)
  }

  distToMouse(view3d: View3D, x: number, y: number, matrix: Matrix4, wscale = 1.0) {
    const v = new Vector3()
    //measure scale

    const v1 = dist_temps.next().zero()
    const v2 = dist_temps.next().zero()

    const mat = this.drawmatrix
    const mm = mat.$matrix

    v1.multVecMatrix(mat)
    v1.multVecMatrix(matrix)

    const r = 0.5 * Math.sqrt(mm.m11 * mm.m11 + mm.m12 * mm.m12 + mm.m13 * mm.m13)

    view3d.project(v1)
    const z = v1[2]

    const dd = Math.sqrt((x - v1[0]) ** 2 + (y - v1[1]) ** 2)
    const rett = dist_rets.next()

    rett[0] = dd
    rett[1] = v1[2]
    //console.log(rett);
    //return rett;

    view3d.unproject(v1)

    v2[0] = x
    v2[1] = y
    v2[2] = z
    view3d.unproject(v2)

    //get point on boundary
    const rco = dist_temps.next().zero()
    rco.load(v2).sub(v1).normalize().mulScalar(r).add(v1)

    const t1 = dist_temps.next()
    const t2 = dist_temps.next()

    t1.load(v2).sub(rco)
    t2.load(v2).sub(v1)

    const sign = t1.dot(t2) < 0.0 ? -1.0 : 1.0

    view3d.project(v2)
    view3d.project(rco)

    const dis = v2.vectorDistance(rco)

    const ret = dist_rets.next()

    ret[0] = sign > 0.0 ? dis : -1 //XXX fixme: why is -1 necassary?
    ret[1] = rco[2]

    return ret
  }
}

export class WidgetPlane extends WidgetShape {
  constructor() {
    super()
    this.shapeid = 'PLANE'
  }

  draw(gl: WebGL2RenderingContext, manager: WidgetManager, matrix: Matrix4) {
    this.mesh = manager.shapes[this.shapeid]
    super.draw(gl, manager, matrix)
  }

  distToMouse(view3d: View3D, x: number, y: number, matrix: Matrix4, wscale = 1.0) {
    const origin = dist_temps.next().zero()

    origin.multVecMatrix(matrix)
    const sorigin = dist_temps.next().load(origin)
    view3d.project(sorigin)

    const n = dist_temps.next().zero()
    const mm = matrix.$matrix
    n[0] = mm.m31
    n[1] = mm.m32
    n[2] = mm.m33
    n.normalize()

    /* Derive plane boundaries. */
    const axisx = new Vector3()
    const axisy = new Vector3()

    axisx.loadXYZ(0.5, 0, 0).multVecMatrix(matrix)
    axisy.loadXYZ(0, 0.5, 0).multVecMatrix(matrix)
    view3d.project(axisx)
    view3d.project(axisy)

    const view = view3d.getViewVec(x, y)

    const scalex = axisx.vectorDistance(sorigin)
    const scaley = axisy.vectorDistance(sorigin)

    const isect = math.isect_ray_plane(origin, n, view3d.activeCamera.pos, view)
    const ret2 = dist_rets.next()

    if (isect) {
      const zco = dist_temps.next().load(isect)
      view3d.project(zco)

      const imat = this._tempmat2
      imat.load(matrix).invert()

      isect.multVecMatrix(imat)

      const sx = dist_temps.next().load(isect)
      const sy = dist_temps.next().load(isect)

      sx[1] = sy[0] = 0.0
      sx[2] = sy[2] = 0.0
      sx.multVecMatrix(matrix)
      sy.multVecMatrix(matrix)

      view3d.project(sx)
      view3d.project(sy)

      let dx = sx.vectorDistance(sorigin)
      let dy = sy.vectorDistance(sorigin)

      dx = Math.max(dx - scalex, 0.0)
      dy = Math.max(dy - scaley, 0.0)

      const dis = Math.max(Math.abs(dx), Math.abs(dy))

      ret2[0] = dis
      ret2[1] = zco[2]

      return ret2
    } else {
      ret2[0] = 10000.0
      ret2[1] = 0.0

      return ret2
    }
  }
}

export class WidgetChevron extends WidgetPlane {
  constructor() {
    super()

    this.shapeid = 'CHEVRON'
  }
}

export class WidgetDoubleChevron extends WidgetPlane {
  constructor() {
    super()

    this.shapeid = 'CHEVRON_DOUBLE'
  }
}

export interface IWidgetConstructor<
  Inputs extends INodeSocketSet = {},
  Outputs extends INodeSocketSet = {},
  T extends WidgetBase<Inputs, Outputs> = WidgetBase<Inputs, Outputs>,
> {
  new (...args: unknown[]): T
  widgetDefine(): {
    name: string
    uiname: string
    icon: number
    description: string
    selectMode?: number
    flag?: number
  }
  nodedef: INodeConstructor<T, Inputs, Outputs>['nodedef']
}

export class WidgetBase<Inputs extends INodeSocketSet = {}, Outputs extends INodeSocketSet = {}> extends Node<
  Inputs,
  Outputs,
  ViewContext
> {
  ctx: ViewContext | undefined
  flag: number
  id: number
  wscale: number
  children: WidgetBase[]
  destroyed: boolean
  shape: WidgetShape | undefined
  manager: WidgetManager | undefined
  matrix: Matrix4
  _tempmatrix: Matrix4
  parent?: WidgetBase;

  ['constructor']: IWidgetConstructor<Inputs, Outputs, this> = this['constructor']

  constructor() {
    super()

    const def = this.constructor!.widgetDefine()

    this.ctx = undefined
    this.flag = def.flag ?? 0
    this.id = -1
    this.wscale = 1.0

    this.children = []
    this.destroyed = false

    this.shape = undefined
    this.manager = undefined //is set by WidgetManager

    this.matrix = new Matrix4()
    this._tempmatrix = new Matrix4()
  }

  /** generate a string key that describes this widget, but isn't necassarily unique.
   *  this is used to keep track of whether widgets have already been created or not */
  genKey() {
    return ''
  }

  setMatrix(mat: Matrix4) {
    this.matrix.load(mat)
    return this
  }

  getWscale() {
    let widget = this as WidgetBase
    while (widget.parent) {
      widget = widget.parent
    }

    return widget.wscale
  }

  //can this widget run?
  static ctxValid(ctx: ViewContext) {
    const mask = this.widgetDefine().selectMode
    return mask !== undefined ? !!(ctx.selectMask & mask) : true
  }

  get isDead() {
    //throw new Error("implement me");
    return false
  }

  onRemove() {
    this.manager?.remove(this)

    if (this.graph_graph) {
      this.graph_graph.remove(this)
      this.graph_graph = undefined
    }
  }

  onContextLost(e: WebGLContextEvent) {
    if (this.shape !== undefined) {
      this.shape.onContextLost(e)
    }
  }

  destroy(gl: WebGL2RenderingContext) {
    if (this.destroyed) {
      return
    }

    this.destroyed = true

    for (const c of this.children) {
      c.destroy(gl)
    }
  }

  /* weight screen space distance by (screen space scaled) z. */
  static _weightDisZ(view3d: View3D, dis: number, z: number) {
    return dis + z * 0.1
  }

  /**note that it's valid for containers
   * to return themselves, *if* they have
   * a shape and aren't purely containers
   * @param x view3d-local coordinate x
   * @param y view3d-local coordinate y
   */
  findNearest(view3d: View3D, x: number, y: number, limit = 8, matrix?: Matrix4): IFindNearestResult | undefined {
    let mindis, minz, minret, minf, minmargin

    if (!matrix) {
      matrix = dist_temp_mats.next()
      matrix.load(this.matrix)
    }

    const wscale = this.getWscale()

    if (this.shape !== undefined) {
      const disz = this.shape.distToMouse(view3d, x, y, matrix, wscale)

      mindis = disz[0]
      minz = disz[1]
      minret = this
      minmargin = this.shape.extraMouseMargin
    }

    const childmat = dist_temp_mats.next()
    for (const child of this.children) {
      childmat.load(matrix).multiply(child.matrix)

      const ret = child.findNearest(view3d, x, y, limit, childmat)

      if (ret === undefined) {
        continue
      }
      if (ret.dis > limit + ret.margin) {
        continue
      }

      const f = WidgetBase._weightDisZ(view3d, ret.dis, ret.z)

      if (minf === undefined || f < minf) {
        minf = f
        mindis = ret.dis
        minz = ret.z
        minret = ret.data ? ret.data : child
        minmargin = ret.margin
      }
    }

    if (mindis !== undefined && mindis > limit + minmargin) {
      return undefined
    }

    return {
      data  : minret,
      dis   : mindis,
      z     : minz,
      margin: minmargin,
    }
  }

  add(child) {
    this.children.push(child)

    child.parent = this
    child.manager = this.manager
    child.ctx = this.ctx

    if (this.manager) {
      this.manager.add(child)
    }

    return child
  }

  // XXX delete this
  update(): this {
    if (this.isDead) {
      this.remove()
    }
    return this
  }

  remove() {
    if (this.manager === undefined) {
      console.warn('widget not part of a graph', this.manager)
      return
    }

    this.manager.remove(this)

    if (this.graph_graph) {
      this.graph_graph.remove(this)
      this.graph_graph = undefined
    }
  }

  on_mousedown(e, localX, localY, was_touch) {
    const child = this.findNearestWidget(this.manager.ctx.view3d, localX, localY)
    let ret = false

    if (this.onclick) {
      ret = this.onclick(e)
    }

    if (child !== undefined && child !== this) {
      if (child.on_mousedown) {
        child.on_mousedown(e, localX, localY)
      }
      return true
    } else if (child === this) {
      return true
    }

    return ret
  }

  on_mousemove(e, localX, localY) {
    const child = this.findNearestWidget(this.manager.ctx.view3d, localX, localY)

    if (child !== undefined && child !== this) {
      child.on_mousemove(e, localX, localY)
      return true
    } else if (child === this) {
      return true
    }

    return false
  }

  findNearestWidget(view3d, localX, localY) {
    const ret = this.findNearest(view3d, localX, localY)
    if (ret) {
      return ret.data
    }
  }

  on_mouseup(e, localX, localY, was_touch) {
    const child = this.findNearestWidget(this.manager.ctx.view3d, localX, localY)

    if (child !== undefined && child !== this) {
      child.on_mouseup(e, localX, localY)
      return true
    } else if (child === this) {
      return true
    }

    return false
  }

  on_keydown(e, localX, localY) {
    return true
  }

  draw(gl, manager, matrix = undefined) {
    const mat = this._tempmatrix

    mat.makeIdentity()
    mat.load(this.matrix)

    if (matrix !== undefined) {
      mat.preMultiply(matrix)
    }

    /* Apply zoom scaling. */
    if (!this.parent) {
      const co = new Vector3()
      const w = this.ctx.view3d.project(co)
      const s = w * 0.075 // / this.ctx.view3d.size[1];

      this.wscale = s

      const smat = new Matrix4()
      smat.scale(s, s, s)
      mat.multiply(smat)
    }
    for (const w of this.children) {
      w.draw(gl, manager, mat)
    }

    if (this.shape === undefined) {
      return
    }

    if (this.flag & WidgetFlags.HIGHLIGHT) {
      this.shape.flag |= WidgetFlags.HIGHLIGHT
    } else {
      this.shape.flag &= ~WidgetFlags.HIGHLIGHT
    }

    this.shape.draw(gl, manager, mat)
  }

  _newbase(matrix, color, shape) {
    const ret = new WidgetBase()

    ret.shape = shape

    if (typeof color == 'string') {
      color = css2color(color)
    }

    if (color !== undefined) {
      ret.shape.color.load(color)

      if (color.length < 4) ret.shape.color[3] = 1.0
    }

    if (matrix !== undefined) {
      ret.matrix.load(matrix)
    }

    return ret
  }

  getTorus(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetTorus(this)))
  }

  getArrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetArrow(this)))
  }

  getSphere(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetSphere(this)))
  }

  getChevron(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetChevron(this)))
  }

  getDoubleChevron(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetDoubleChevron(this)))
  }

  getPlane(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetPlane(this)))
  }

  getBlockArrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetBlockArrow(this)))
  }

  setManager(manager) {
    this.manager = manager
    this.ctx = manager.ctx
  }

  exec(ctx: ViewContext) {
    super.exec(ctx)

    this.update()
    this.outputs.depend.graphUpdate()
  }

  /**
   * executes a (usually modal) tool, adding (and removing)
   * draw callbacks to execute this.update() as appropriate
   * */
  execTool(ctx, tool) {
    const view3d = this.ctx.view3d

    if (!this.inputs.depend.has(view3d._graphnode.outputs.onDrawPre)) {
      this.inputs.depend.connect(view3d._graphnode.outputs.onDrawPre)
    }

    const toolstack = this.ctx.toolstack
    toolstack.execTool(ctx, tool)

    if (tool._promise !== undefined) {
      tool._promise.then((ctx, was_cancelled) => {
        console.log('tool was finished', this, this._widget_tempnode, '.')

        if (this._widget_tempnode !== undefined) {
          this.inputs.depend.disconnect(view3d._graphnode.outputs.onDrawPre)
        }
      })
    }
  }

  static nodedef() {
    return {
      name   : 'widget3d',
      uiname : 'widget3d',
      inputs: {
        depend: new DependSocket(),
      },
      outputs: {
        depend: new DependSocket(),
      },
      flag   : NodeFlags.FORCE_INHERIT | NodeFlags.ZOMBIE,
    }
  }

  static widgetDefine() {
    return {
      name       : 'name',
      uiname     : 'uiname',
      icon       : -1,
      flag       : 0,
      description: '',
      selectMode : undefined, //force selectmode to this on widget create
    }
  }
}

export class WidgetList extends Array<WidgetBase> {
  active?: WidgetBase
  highlight?: WidgetBase
}

export class WidgetManager {
  // Core properties
  public ctx: ViewContext
  protected _init: boolean
  public gl: WebGL2RenderingContext | undefined
  public ready: boolean

  // Widget collections and management
  public widgets: WidgetList // Array with additional dynamic properties
  protected widget_idmap: {[key: number]: WidgetBase}
  protected widget_keymap: {[key: string]: WidgetBase}
  protected idgen: util.IDGen

  // Shape storage
  public shapes: {[key: string]: SimpleMesh}

  // Execution graph nodes
  protected nodes: {[key: number]: CallbackNode}

  constructor(ctx: ViewContext) {
    this._init = false
    this.widgets = new WidgetList()
    this.widget_idmap = {}
    this.shapes = {}
    this.idgen = new util.IDGen()
    this.ctx = ctx
    this.gl = undefined

    this.widget_keymap = {}

    //execution graph nodes
    this.nodes = {}
    this.widgets.active = undefined
    this.widgets.highlight = undefined

    this.ready = false
  }

  haveCallbackNode(id: number, name: string) {
    const key = id + ':' + name
    return key in this.nodes
  }

  hasWidget(cls: any) {
    for (const w of this.widgets) {
      if (w instanceof cls) return w
    }
  }

  glInit(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.loadShapes()
  }

  onContextLost(e: WebGLContextEvent) {
    this._init = false

    for (const w of this.widgets) {
      w.onContextLost(e)
    }
  }

  clearNodes() {
    const graph = this.ctx.graph

    for (const k in this.nodes) {
      const n = this.nodes[k]

      if (n.graph !== graph) {
        console.log('prune zombie node')
        delete this.nodes[k]
        continue
      }

      delete this.nodes[k]

      try {
        n.onRemove()
      } catch (error) {
        util.print_stack(error)
        console.warn('Error removing a node', n)
      }

      if (n.graph_graph) {
        n.graph_graph.remove(this)
        n.graph_graph = undefined
      }
    }

    //this.nodes = {}:
  }

  removeCallbackNode(n: CallbackNode) {
    const key = n._key

    if (this.nodes[key]) {
      this.ctx.graph.remove(this.nodes[key])
    }
  }

  createCallbackNode(id, name, callback, inputs, outputs) {
    const key = id + ':' + name

    if (this.nodes[key]) {
      this.ctx.graph.remove(this.nodes[key])
    }

    this.nodes[key] = CallbackNode.create(key, callback, inputs, outputs)
    this.nodes[key]._key = key

    return this.nodes[key]
  }

  loadShapes() {
    for (const k in Shapes) {
      const smesh = Shapes[k].copy()

      this.shapes[k] = smesh
    }

    this.ready = true
  }

  _picklimit(was_touch) {
    return was_touch ? 35 : 8
  }

  _fireAllEventWidgets(e, key, localX, localY, was_touch) {
    let ret = 0

    for (const w of this.widgets) {
      if (w.flag & WidgetFlags.ALL_EVENTS) {
        ret |= w[key](e, localX, localY, was_touch)
      }
    }

    return ret
  }

  on_keydown(e, localX, localY) {
    if (this._fireAllEventWidgets(e, 'on_keydown', localX, localY, false)) {
      return true
    }

    if (this.widgets.highlight !== undefined) {
      this.widgets.highlight.on_keydown(e, localX, localY)
    }
  }

  /**see view3d.getSubEditorMpos for how localX/localY are derived*/
  on_mousedown(e, localX, localY, was_touch) {
    console.log('widget mouse down')

    if (this._fireAllEventWidgets(e, 'on_mousedown', localX, localY, was_touch)) {
      return true
    }

    if (this.widgets.highlight !== undefined) {
      const flag = this.widgets.highlight.flag
      if (!(flag & WidgetFlags.IGNORE_EVENTS)) {
        this.widgets.highlight.on_mousedown(e, localX, localY, was_touch)

        return true
      }
    }
  }

  findNearest(x, y, limit = 16) {
    let mindis = 1e17
    const minz = 1e17
    let minw = undefined
    const minmargin = 0
    let minf

    const view3d = this.ctx.view3d

    for (const w of this.widgets) {
      let skip = w.flag & WidgetFlags.IGNORE_EVENTS
      skip = skip || w.parent !== undefined

      if (skip) {
        continue
      }

      const ret = w.findNearest(view3d, x, y, limit)

      if (ret === undefined || ret.dis > limit + ret.margin) {
        continue
      }

      //console.log(ret.z);
      const dis = ret.dis
      const z = ret.z
      const f = WidgetBase._weightDisZ(view3d, dis, z)

      if (minw === undefined || f < minf) {
        mindis = dis
        minf = f
        minw = ret.data
      }
    }

    return minw
  }

  updateHighlight(e, localX, localY, was_touch) {
    const w = this.findNearest(localX, localY, this._picklimit(was_touch))

    if (this.widgets.highlight !== w) {
      if (this.widgets.highlight !== undefined) {
        this.widgets.highlight.flag &= ~WidgetFlags.HIGHLIGHT
      }

      this.widgets.highlight = w
      if (w !== undefined) {
        w.flag |= WidgetFlags.HIGHLIGHT
      }

      window.redraw_viewport()
    }

    return w !== undefined
  }

  on_mousemove(e, localX, localY, was_touch) {
    const ret = this.updateHighlight(e, localX, localY, was_touch)

    //console.log(w);
    if (this._fireAllEventWidgets(e, 'on_mousemove', localX, localY, was_touch)) {
      return true
    }

    return ret
  }

  on_mouseup(e, localX, localY, was_touch) {
    this.updateHighlight(e, localX, localY, was_touch)

    if (this._fireAllEventWidgets(e, 'on_mouseup', localX, localY, was_touch)) {
      return true
    }

    if (this.widgets.highlight !== undefined) {
      return this.widgets.highlight.on_mouseup(e, localX, localY)
    }
  }

  add(widget) {
    if (widget === undefined || !(widget instanceof WidgetBase)) {
      console.warn('invalid widget type for ', widget)
      throw new Error('invalid widget type for ' + widget)
    }

    if (widget.id !== -1 && widget.id in this.widget_idmap) {
      console.warn('Warning, tried to add same widget twice')
      return undefined
    }

    widget.ctx = this.ctx
    widget.id = this.idgen.next()
    widget.manager = this

    this.widget_keymap[widget.genKey()] = widget
    this.widget_idmap[widget.id] = widget
    this.widgets.push(widget)

    //add children too
    for (const child of widget.children) {
      if (!(child.id in this.widget_idmap)) {
        this.add(child)
      }
    }

    window.redraw_viewport(true)
    return widget
  }

  hasWidgetWithKey(key) {
    return key in this.widget_keymap
  }

  getWidgetWithKey(key) {
    return this.widget_keymap[key]
  }

  remove(widget) {
    if (!(widget.id in this.widget_idmap)) {
      console.warn('widget not in manager', widget.id, widget)
      return
    }

    if (this.ctx && this.ctx.graph) {
      this.ctx.graph.remove(widget)
    }

    if (widget.onremove) {
      widget.onremove()
    }

    if (widget === this.highlight) {
      this.highlight = undefined
    }
    if (widget === this.active) {
      this.active = undefined
    }

    delete this.widget_idmap[widget.id]
    delete this.widget_keymap[widget.genKey()]

    this.widgets.remove(widget)

    widget.id = -1

    if (this.ctx.view3d !== undefined && this.ctx.view3d.gl !== undefined) {
      widget.destroy(this.ctx.view3d.gl)
    }
  }

  clear() {
    const ws = this.widgets.slice(0, this.widgets.length)

    for (const widget of ws) {
      this.remove(widget)
    }
  }

  destroy(gl) {
    if (this.ctx.view3d !== undefined) {
      this.clearNodes()
    } else {
      //XXX ok just nuke all references in this.nodes
      this.nodes = {}
    }

    for (const k in this.shapes) {
      const shape = this.shapes[k]
      shape.destroy(gl)
    }

    if (this.gl !== undefined && gl !== this.gl) {
      console.warn('Destroy called with new gl context')
    } else if (this.gl === undefined && gl !== undefined) {
      this.gl = gl
    }

    gl = this.gl
    const widgets = this.widgets

    this.widgets = []
    this.widget_idmap = {}
    this.widgets.active = undefined
    this.widgets.highlight = undefined

    if (gl === undefined) {
      return
    }

    for (const w of widgets) {
      w.ctx = this.ctx
      w.manager = this

      try {
        w.destroy(gl)
      } catch (error) {
        util.print_stack(error)
        console.warn('Failed to destroy a widget', w)
      }
    }
  }

  draw(view3d, gl) {
    if (!this._init) {
      this._init = true
      this.glInit(gl)
    }

    const pushctx = view3d !== undefined && view3d !== this.ctx.view3d

    if (pushctx) {
      view3d.push_ctx_active()
    }

    for (const widget of this.widgets) {
      if (!widget.parent) {
        widget.draw(gl, this)
      }
    }

    if (pushctx) {
      view3d.pop_ctx_active()
    }
  }

  _newbase(matrix, color, shape) {
    const ret = new WidgetBase()

    ret.shape = shape

    if (typeof color == 'string') {
      color = css2color(color)
    }

    if (color !== undefined) {
      ret.shape.color.load(color)

      if (color.length < 4) ret.shape.color[3] = 1.0
    }

    if (matrix !== undefined) {
      ret.matrix.load(matrix)
    }

    return ret
  }

  arrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetArrow(this)))
  }

  chevron(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetChevron(this)))
  }

  plane(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetPlane(this)))
  }

  sphere(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetSphere(this)))
  }

  blockarrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetBlockArrow(this)))
  }

  updateGraph() {
    if (!this.ctx || !this.ctx.graph) {
      return
    }

    const graph = this.ctx.graph

    for (const widget of this.widgets) {
      if (widget.graph_id < 0) {
        graph.add(widget)
        window.redraw_viewport(true)
      }
    }
  }

  update() {
    this.updateGraph()
    const oldmat = new Matrix4()
    let update = false

    function test(m1: number, m2: number): boolean {
      return Math.abs(m1 - m2) > 0.001
    }

    function testMat(mat1: Matrix4, mat2: Matrix4) {
      let ret = false
      const m1 = mat1.$matrix
      const m2 = mat2.$matrix

      ret ||= test(m1.m11, m2.m11)
      ret ||= test(m1.m12, m2.m12)
      ret ||= test(m1.m13, m2.m13)
      ret ||= test(m1.m14, m2.m14)
      ret ||= test(m1.m21, m2.m21)
      ret ||= test(m1.m22, m2.m22)
      ret ||= test(m1.m23, m2.m23)
      ret ||= test(m1.m24, m2.m24)
      ret ||= test(m1.m31, m2.m31)
      ret ||= test(m1.m32, m2.m32)
      ret ||= test(m1.m33, m2.m33)
      ret ||= test(m1.m34, m2.m34)
      ret ||= test(m1.m41, m2.m41)
      ret ||= test(m1.m42, m2.m42)
      ret ||= test(m1.m43, m2.m43)
      ret ||= test(m1.m44, m2.m44)

      return ret
    }

    for (const widget of this.widgets) {
      oldmat.load(widget.matrix)

      widget.manager = this
      widget.update()

      update |= testMat(oldmat, widget.matrix)

      if (!widget.destroyed && widget.isDead) {
        widget.remove()
        update = true
      }
    }

    if (update) {
      window.redraw_viewport(true)
    }
  }
}
