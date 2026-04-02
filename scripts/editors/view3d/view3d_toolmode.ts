import {KeyMap} from '../editor_base'
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from '../../core/simplemesh'
import {IWidgetConstructor, WidgetBase, WidgetFlags, WidgetManager} from './widgets/widgets.js'
import {
  Container,
  ContextOverlay,
  DataAPI,
  EnumProperty,
  IVectorOrHigher,
  Vector3,
  Vector4,
} from '../../path.ux/scripts/pathux.js'
import {Icons} from '../icon_enum.js'
import '../../path.ux/scripts/util/struct.js'
import {INodeConstructor, INodeSocketSet, Node} from '../../core/graph.js'
import {nstructjs} from '../../path.ux/scripts/pathux.js'

import '../../core/textsprite.js'

import messageBus, {BusTriggers} from '../../core/bus'
import type {ViewContext} from '../../core/context'
import {SceneObject} from '../../sceneobject/sceneobject'
import {Scene} from '../../scene/scene'
import type {BlockLoader, BlockLoaderAddUser} from '../../core/lib_api'
import {StandardTools} from '../../sceneobject/stdtools'
import type {AppState} from '../../core/appstate'
import {View3D} from '../all'
import {IUniformsBlock, ShaderProgram} from '../../core/webgl'
import {Mesh} from '../../mesh/mesh'
import {StructReader} from '../../path.ux/scripts/path-controller/types/util/nstructjs'
import {MeshDrawInterface} from './view3d_draw'
import { BoundingBox } from './view3d_utils'

export interface IToolModeDefine {
  name: string
  uiname: string
  icon: number
  flag: number
  description: string
  selectMode?: number
  stdtools?: StandardTools
  transWidgets?: (typeof WidgetBase)[]
}

export class ToolMode<NodeInputs extends INodeSocketSet = {}, NodeOutputs extends INodeSocketSet = {}> extends Node<
  NodeInputs,
  NodeOutputs,
  ViewContext
> {
  static dataPath = 'scene.tool'

  // owning view3d
  view3d?: View3D
  
  transformWidget: number = -1
  ctx: ViewContext
  flag: number = 0
  widgets: WidgetBase[] = []
  _uniqueWidgets: {[key: string]: WidgetBase} = {}
  transWidget: WidgetBase | undefined

  drawlines: any[] = []
  drawtexts: any[] = []

  selectMask: number = 0
  _transProp: EnumProperty
  storedSelectMask: number = -1
  keymap: KeyMap
  manager?: WidgetManager;

  ['constructor']: INodeConstructor<this, NodeInputs, NodeOutputs> & typeof ToolMode = this['constructor']

  constructor(ctx: ViewContext) {
    super()

    this.ctx = ctx
    this.flag |= WidgetFlags.ALL_EVENTS

    this.drawlines = []
    this.drawtexts = []

    this.widgets = []
    this._uniqueWidgets = {}
    this.transWidget = undefined

    //@ts-ignore
    this.selectMask = this.constructor.toolModeDefine().selectMode
    //@ts-ignore
    this._transProp = this.constructor.getTransformProp()

    this.storedSelectMask = -1 //used by scene

    this.keymap = new KeyMap()
    this.defineKeyMap()
  }

  drawsObjectIdsExclusively(ob: SceneObject) {
    return false
  }

  setManager(widget_manager: WidgetManager) {
    this.manager = widget_manager
  }

  /** easy line drawing (in 3d)*/
  makeTempLine(v1: Vector3, v2: Vector3, color: Vector4) {
    const dl = this.ctx.view3d.makeDrawLine(v1, v2, color)
    this.drawlines.push(dl)
    return dl
  }

  makeTempText(co: Vector3, string: string, color: Vector4) {
    const dt = this.ctx.view3d.makeDrawText(co, string, color)
    this.drawtexts.push(dt)
    return dt
  }

  resetTempGeom(ctx = this.ctx) {
    for (const dl of this.drawlines) {
      ctx.view3d.removeDrawLine(dl)
    }
    for (const dt of this.drawtexts) {
      ctx.view3d.removeDrawText(dt)
    }

    this.drawlines.length = 0
  }

  static toolModeDefine(): IToolModeDefine {
    return {
      name        : 'name',
      uiname      : 'uiname',
      icon        : -1,
      flag        : 0,
      description : '',
      selectMode  : undefined, //if set, preferred selectmode, see SelModes
      stdtools    : undefined, //if set, will override standard tools in inherited keymaps
      transWidgets: [] as (typeof WidgetBase)[], //list of widget classes tied to this.transformWidget
    }
  }

  static nodedef() {
    return {
      name   : 'tool',
      uiname : 'tool',
      inputs : {},
      outputs: {},
    }
  }

  get typeName() {
    return this.constructor.toolModeDefine().name
  }

  getKeyMaps() {
    return [this.keymap]
  }

  defineKeyMap() {
    this.keymap = new KeyMap([])
  }

  //returns a bounding box [min, max]
  //if toolmode has a preferred aabb to
  //zoom out on, otherwise returns undefined;
  getViewCenter(): BoundingBox | undefined {
    return undefined
  }

  static buildEditMenu(): string[] {
    return []
  }

  static buildElementSettings(container: Container) {}

  static buildSettings(container: Container) {}

  dataLink(scene: Scene, getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser) {}

  static buildHeader(header: Container, addHeaderRow: () => Container) {}

  static getContextOverlayClass():
    | (new (state: AppState, toolmode: ToolMode) => ContextOverlay<unknown, ViewContext>)
    | undefined {
    return undefined
  }

  static busDefine() {
    return {
      events  : ['REGISTER', 'UNREGISTER'],
      triggers: [],
    } as const
  }

  onTrigger(trigger: BusTriggers<typeof ToolMode>, data: any) {
    // no triggers currently
    switch (
      trigger
      //
      // eslint-disable-next-line no-empty
    ) {
    }
  }

  static unregister(cls: any) {
    ToolModes.remove(cls)
    messageBus.emitSync(undefined, ToolMode, 'UNREGISTER', cls)
  }

  static register(cls: any) {
    if (cls.toolModeDefine === this.toolModeDefine) {
      throw new Error('cls is missing its toolModeDefine')
    }

    ToolModes.push(cls)
    messageBus.emitSync(undefined, ToolMode, 'REGISTER', cls)
  }

  static getTransformProp() {
    let classes = this.toolModeDefine().transWidgets
    classes = classes === undefined ? [] : classes

    const enumdef = {} as {[key: string]: number}
    const uinames = {} as {[key: string]: string}
    const icons = {} as {[key: string]: number}
    const descr = {} as {[key: string]: string}

    enumdef.NONE = 0
    icons.NONE = Icons.DISABLED
    uinames.NONE = 'disable'
    descr.NONE = 'Hide transform widgets'

    let i = 1

    for (const cls of classes) {
      const def = cls.widgetDefine()

      const k = def.name || cls.name

      enumdef[k] = i++
      uinames[k] = def.uiname ? def.uiname : k
      descr[k] = def.description ? def.description : uinames[k]
      icons[k] = def.icon ? def.icon : -1
    }

    const prop = new EnumProperty(undefined, enumdef)
    prop.addIcons(icons)
    prop.addUINames(uinames)
    prop.addDescriptions(descr)

    return prop
    //return WidgetTool.getToolEnum(classes, FlagProperty, true);
  }

  static defineAPI(api: DataAPI) {
    const cls = this

    const tstruct = api.mapStruct(cls, true)
    tstruct.name = this.name !== undefined ? this.name : this.toolModeDefine().name
    tstruct.string('typeName', 'type', 'Type', 'Tool Mode Type')

    const prop = this.getTransformProp()
    if (prop !== undefined) {
      tstruct.enum('transformWidget', 'transformWidget', prop, 'Transform Widget', 'Current transformation widget')
    }

    return tstruct
  }

  hasWidgetWithKey(key: string) {
    return this.getWidgetWithKey(key) !== undefined
  }

  getWidgetWithKey(key: string) {
    const widget = this.ctx.scene.widgets.getWidgetWithKey(key)

    if (widget && !widget.isDead && this.widgets.indexOf(widget) >= 0) {
      return widget
    }

    return undefined
  }

  /**
   * Spawn a unique widget
   * @param widgetclass : widget class
   */
  ensureUniqueWidget(widgetclass: typeof WidgetBase) {
    if (this.ctx === undefined) {
      return
    }

    const manager = this.ctx.scene.widgets

    const valid = widgetclass.ctxValid(this.ctx)
    const def = widgetclass.widgetDefine()

    if (def.name in this._uniqueWidgets && this._uniqueWidgets[def.name].isDead) {
      this.removeUniqueWidget(this.getUniqueWidget(widgetclass))
    }

    if (!valid && def.name in this._uniqueWidgets) {
      this.removeUniqueWidget(this.getUniqueWidget(widgetclass))
      window.redraw_viewport()

      return
    } else if (valid && !(def.name in this._uniqueWidgets)) {
      console.log('adding new widget', def.name)

      const widget = new widgetclass()
      manager.add(widget)

      this.widgets.push(widget)
      this._uniqueWidgets[def.name] = widget

      if (def.selectMode !== undefined && this.ctx.scene.selectMask !== def.selectMode) {
        this.ctx.scene.selectMask = def.selectMode
      }

      window.redraw_viewport()
      return widget
    } else {
      return this._uniqueWidgets[def.name]
    }
  }

  addWidget(widget: WidgetBase) {
    this.widgets.push(widget)
    this.ctx.scene.widgets.add(widget)
  }

  removeWidget(widget: WidgetBase) {
    for (const k in this._uniqueWidgets) {
      if (this._uniqueWidgets[k] === widget) {
        delete this._uniqueWidgets[k]
      }
    }

    this.widgets.remove(widget)
    this.ctx.scene.widgets.remove(widget)
  }

  hasUniqueWidget<T extends WidgetBase>(cls: IWidgetConstructor) {
    return this.getUniqueWidget(cls) !== undefined
  }

  getUniqueWidget<T extends WidgetBase>(cls: IWidgetConstructor) {
    const def = cls.widgetDefine()
    return this._uniqueWidgets[def.name]
  }

  removeUniqueWidget(widget: WidgetBase) {
    const def = widget.constructor.widgetDefine()

    if (this.widgets.includes(widget)) {
      this.widgets.remove(widget)
    }

    delete this._uniqueWidgets[def.name]
    widget.remove()
  }

  getWidgetHighlight() {
    return this.ctx.scene.widgets.widgets.highlight
  }

  hasWidgetHighlight() {
    return this.getWidgetHighlight() !== undefined
  }

  update() {
    if (!this.ctx) {
      return this
    }

    const cls = this.constructor.getContextOverlayClass()
    if (cls !== undefined) {
      console.warn('reimplement toolmode ctx overlays!')
    }
    //if (cls !== undefined && !this.ctx.hasOverlay(cls)) {
    //  this.ctx.pushOverlay(new cls(this.ctx.state, this))
    //}

    const del = []

    for (const widget of this.widgets) {
      if (widget.isDead) {
        del.push(widget)
      }
    }

    for (const widget of del) {
      this.widgets.remove(widget)
    }

    const tws = this.constructor.toolModeDefine().transWidgets || []
    let tcls: typeof WidgetBase | undefined
    const ti = this.transformWidget - 1

    if (ti >= 0 && ti < tws.length) {
      tcls = tws[ti]
    }

    if (this.transWidget && tcls !== this.transWidget.constructor) {
      console.log('removing transform widget')
      this.removeUniqueWidget(this.transWidget)
      this.transWidget = undefined
    }

    if (!this.transWidget && tcls) {
      this.transWidget = this.ensureUniqueWidget(tcls)
      console.log('making transform widget', tcls.name, this.transformWidget, this.transWidget)
    }

    /*
    for (let widget of this.widgets) {
      widget.update(this.ctx.scene.widgets);
    }
    //*/
    return this
  }

  onActive() {}

  clearWidgets() {
    if (!this.ctx || !this.ctx.scene) {
      return
    }

    const manager = this.ctx.scene.widgets

    for (const widget of this.widgets) {
      manager.remove(widget)
    }

    this.transWidget = undefined

    this._uniqueWidgets = {}
    this.widgets = []
  }

  onInactive() {
    const cls = this.constructor.getContextOverlayClass()

    //if (this.ctx && cls && this.ctx.hasOverlay(cls)) {
    //  this.ctx.removeOverlay(this.ctx.getOverlay(cls))
    //}

    this.clearWidgets()

    if (this.ctx) {
      this.resetTempGeom()
    }
  }

  graphDisconnect() {
    for (const sock of this.allsockets) {
      sock.disconnect()
    }
  }

  destroy() {
    this.clearWidgets()
    this.graphDisconnect()
  }

  onContextLost(e: WebGLContextEvent) {
    //
  }

  on_mousedown(e: PointerEvent, x: number, y: number, was_touch?: boolean) {}

  on_mousemove(e: PointerEvent, x: number, y: number, was_touch?: boolean) {}

  on_mouseup(e: PointerEvent, x: number, y: number, was_touch?: boolean) {}

  on_drawstart(view3d: View3D, gl: WebGL2RenderingContext) {}

  draw(view3d: View3D, gl: WebGL2RenderingContext) {}

  on_drawend(view3d: View3D, gl: WebGL2RenderingContext) {}

  /*
get view3d() {
  return this._view3d;
}

set view3d(val) {
  console.warn("view3d set", val !== undefined ? val.constructor.name : undefined);
  this._view3d = val;
}
//*/

  drawsObjectIds(obj: SceneObject) {
    return false
  }

  /**
   * draw any extra ids the toolmode needs
   * */
  drawIDs(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any) {}

  /*
   * called for all objects;  returns true
   * if an object if the toolmode drew the object
   * itself
   */
  drawObject(
    gl: WebGL2RenderingContext,
    uniforms: IUniformsBlock,
    program: ShaderProgram,
    object: SceneObject,
    mesh: Mesh
  ) {
    return false
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this)
    super.loadSTRUCT(reader)
  }
}

ToolMode.STRUCT = `
ToolMode {
  transformWidget  : int;
  storedSelectMask : int;
}
`
nstructjs.register(ToolMode)

type MeshId = string | number
export class MeshCache {
  meshid: MeshId
  meshes: {[k: MeshId]: ChunkedSimpleMesh | SimpleMesh}
  /**
   * current generation, we know mesh has changed when
   *  mesh.updateGen is not this
   */
  gen?: number
  drawer?: MeshDrawInterface

  constructor(meshid: MeshId) {
    this.meshid = meshid
    this.meshes = {}
    this.drawer = undefined

    this.gen = undefined
  }

  getMesh(name: MeshId) {
    return this.meshes[name]
  }

  makeMesh(name: MeshId, layers: LayerTypes) {
    if (!(name in this.meshes)) {
      this.meshes[name] = new SimpleMesh(layers)
    }

    return this.meshes[name]
  }

  makeChunkedMesh(name: MeshId, layers: LayerTypes) {
    if (layers === undefined) {
      throw new Error('layers cannot be undefined')
    }

    if (!(name in this.meshes)) {
      this.meshes[name] = new ChunkedSimpleMesh(layers)
    }

    return this.meshes[name]
  }

  destroy(gl: WebGL2RenderingContext) {
    this.drawer?.destroy(gl)

    for (const k in this.meshes) {
      this.meshes[k].destroy(gl)
    }

    this.meshes = {}
  }
}

export const ToolModes = [] as (typeof ToolMode)[]

export function makeToolModeEnum() {
  const map = {} as {[k: string]: number}
  const icons = {} as {[k: string]: number}
  const descr = {} as {[k: string]: string}
  const uinames = {} as {[k: string]: string}
  let i = 0

  for (const cls of ToolModes) {
    const def = cls.toolModeDefine()

    const key = def.name || cls.name

    map[key] = i
    icons[key] = def.icon !== undefined ? def.icon : -1
    descr[key] = '' + def.description
    uinames[key] = '' + def.uiname

    i++
  }

  const prop = new EnumProperty(undefined, map, 'toolmode', 'Tool Mode', 'Active tool mode')

  prop.addIcons(icons)
  prop.addDescriptions(descr)
  prop.addUINames(uinames)

  return prop
}

declare global {
  const _ToolModes: typeof ToolModes
  const _makeToolModeEnum: typeof makeToolModeEnum
  interface Window {
    _ToolModes: typeof _ToolModes
    _makeToolModeEnum: typeof _makeToolModeEnum
  }
}

window._ToolModes = ToolModes
window._makeToolModeEnum = makeToolModeEnum
