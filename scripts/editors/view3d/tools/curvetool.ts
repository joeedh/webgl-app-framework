import {Shapes} from '../../../core/simplemesh_shapes.js'
import {FindNearest} from '../findnearest'
import {ToolMode} from '../view3d_toolmode.js'
import {Icons} from '../../icon_enum.js'
import {SelMask} from '../selectmode.js'
import '../../../path.ux/scripts/util/struct.js'
import {MeshToolBase} from './meshtool'

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../../util/vectormath.js'
import {Shaders} from '../../../shaders/shaders.js'

import {MeshDrawFlags} from '../../../mesh/mesh.js'
import {CurveSpline} from '../../../curve/curve.js'
import {ContextOverlay, nstructjs} from '../../../path.ux/scripts/pathux.js'
import {BlockLoader, BlockLoaderAddUser, DataRef} from '../../../core/lib_api'
import type {ViewContext} from '../../../core/context.js'
import {View3D} from '../view3d.js'
import {Scene} from '../../../scene/scene.js'
import {StructReader} from '../../../path.ux/scripts/path-controller/types/util/nstructjs.js'

export class CurveToolOverlay extends ContextOverlay<unknown, ViewContext> {
  _toolclass: any
  _selectMask: number = -1
  _ob: DataRef = new DataRef(-1)

  constructor(state: any, toolmode?: any) {
    super(state)

    if (toolmode !== undefined) {
      this._toolclass = toolmode.constructor
      this._selectMask = toolmode.selectMask

      toolmode._getObject()
      this._ob = DataRef.fromBlock(toolmode.sceneObject)
    }
  }

  copy(): CurveToolOverlay {
    const ret: CurveToolOverlay = new CurveToolOverlay(this.state)

    ret._toolclass = this._toolclass
    ret._ob = this._ob
    ret._selectMask = this._selectMask

    return ret
  }

  get selectMask(): number {
    return this.ctx.toolmode!.selectMask
    //return this._selectMask;
  }

  validate(): boolean {
    return this.ctx.scene.toolmode instanceof this._toolclass
  }

  get selectedObjects(): any[] {
    return [this.object]
  }

  get selectedMeshObjects(): any[] {
    return [this.object]
  }

  get mesh(): any | undefined {
    const ob: any = this.ctx.datalib.get(this._ob)

    if (ob !== undefined) {
      return ob.data
    }
  }

  get object(): any {
    return this.ctx.datalib.get(this._ob)
  }
}

export class CurveToolBase extends MeshToolBase {
  _isCurveTool: boolean
  sceneObject: any | undefined
  _meshPath: string | undefined
  selectMask: number
  drawflag: number
  curve: CurveSpline | undefined

  constructor(ctx: ViewContext) {
    super(ctx)

    this._isCurveTool = true

    //internal scene object
    this.sceneObject = undefined

    this._meshPath = undefined
    this.selectMask = SelMask.VERTEX | SelMask.HANDLE

    this.drawflag = MeshDrawFlags.SHOW_NORMALS

    this.curve = undefined //is created later
  }

  static toolModeDefine() {
    return {
      ...super.toolModeDefine(),
      name       : 'curve_test',
      uiname     : 'Curve Test',
      icon       : Icons.APPEND_VERTEX,
      flag       : 0,
      description: 'curve tester',
    }
  }

  static getContextOverlayClass() {
    return CurveToolOverlay
  }

  static isCurveTool(instance: any): boolean {
    return instance._isCurveTool
  }

  static buildElementSettings(container: any): void {
    const col: any = container.col()
    const path: string = 'scene.tools.' + this.toolModeDefine().name

    col.prop(path + ".curve.verts.active.namedLayers['knot'].speed")
    col.prop(path + ".curve.verts.active.namedLayers['knot'].tilt")
  }

  static buildSettings(container: any): void {}

  static buildHeader(header: any, addHeaderRow: any): void {
    const strip: any = header.strip()

    strip.useIcons()

    let path: string = 'scene.tools.' + this.toolModeDefine().name
    path += '.curve'

    //strip.tool(`mesh.delete_selected`);
    //strip.tool(`mesh.clear_points`);
  }

  getMeshPaths(): string[] {
    if (this._meshPath === undefined) {
      this._getObject()

      if (this.sceneObject !== undefined) {
        const ob: any = this.sceneObject
        //set path to parent SceneObject so resolveMesh knows to
        //set ownerMatrix and ownerId
        const path: string = `objects[${ob.lib_id}]`
        this._meshPath = path
      } else {
        return []
      }
      //let path = "scene.tools." + this.constructor.toolModeDefine().name;
      //path += ".curve";
    }

    return [this._meshPath]
  }

  static defineAPI(api: any): any {
    const tstruct: any = super.defineAPI(api)

    const mstruct: any = api.mapStruct(CurveSpline, false)

    tstruct.struct('curve', 'curve', 'Curve', mstruct)

    const onchange: () => void = () => {
      window.redraw_viewport()
    }

    return tstruct
  }

  on_mousedown(e: any, x: number, y: number, was_touch: boolean) {
    return super.on_mousedown(e, x, y, was_touch)
  }

  onActive(): void {
    super.onActive()
  }

  onInactive(): void {
    super.onInactive()
  }

  _getObject(): void {
    if (this.sceneObject === undefined) {
      const key: string = 'toolmode_' + this.constructor.toolModeDefine().name

      const data: CurveSpline | typeof CurveSpline = this.curve !== undefined ? this.curve : CurveSpline

      this.sceneObject = this.ctx.scene.getInternalObject(this.ctx, key, data)
      this.ctx.scene!.objects.setSelect(this.sceneObject, true)

      this.curve = this.sceneObject.data! as CurveSpline
      this.curve.owningToolMode = this.constructor.toolModeDefine().name
    }
  }

  update(): this {
    this._getObject()
    super.update()
    return this
  }

  findnearest3d(view3d: View3D, x: number, y: number, selmask: number) {
    /*
    make sure findnearest api gets the right mesh
    */
    //let ctx = this.buildFakeContext(this.ctx);
    return FindNearest(this.ctx!, selmask, new Vector2([x, y]), view3d)
  }

  on_mousemove(e: PointerEvent, x: number, y: number, was_touch: boolean) {
    return super.on_mousemove(e, x, y, was_touch)
  }

  drawSphere(gl: WebGL2RenderingContext, view3d: View3D, p: Vector3, scale: number = 0.01): void {
    const cam = this.ctx.view3d.activeCamera
    const mat = new Matrix4()

    const co: Vector4 = new Vector4().load3(p)
    mat.translate(co[0], co[1], co[2])

    co[3] = 1.0
    co.multVecMatrix(cam.rendermat)

    scale = Math.abs(co[3] * scale)
    mat.scale(scale, scale, scale)

    Shapes.SPHERE.draw(
      gl,
      {
        projectionMatrix: cam.rendermat,
        objectMatrix    : mat,
        color           : [1, 0.4, 0.2, 1.0],
      },
      Shaders.WidgetMeshShader
    )
  }

  draw(view3d: View3D, gl: WebGL2RenderingContext): void {
    this._getObject()

    if (this.curve !== undefined) {
      if (this.curve.drawflag !== this.drawflag) {
        this.curve.drawflag = this.drawflag
        this.curve.regenRender()
      }

      super.draw(view3d, gl)
    }
  }

  dataLink(scene: Scene, getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser): void {
    super.dataLink(scene, getblock, getblock_addUser)
    this.curve = getblock<CurveSpline>(this.curve as unknown as DataRef)
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this)
    super.loadSTRUCT(reader)
    if (this.curve !== undefined) {
      this.curve.owningToolMode = this.constructor.toolModeDefine().name
    }
  }
}

CurveToolBase.STRUCT =
  nstructjs.inherit(CurveToolBase, ToolMode) +
  `
  curve    : DataRef | DataRef.fromBlock(obj.curve);
  drawflag : int;
}`
nstructjs.register(CurveToolBase)
ToolMode.register(CurveToolBase)
