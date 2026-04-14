import {
  nstructjs,
  util,
  ToolOp,
  vectormath,
  math,
  ToolProperty,
  IntProperty,
  FloatProperty,
  EnumProperty,
  FlagProperty,
  StringProperty,
  BoolProperty,
  Vec2Property,
  Vec3Property,
  Vec4Property,
  Mat4Property,
  KeyMap,
  HotKey,
} from '../path.ux/scripts/pathux'
import * as pathux from '../path.ux/scripts/pathux'
import * as mesh from '../mesh/mesh'
import * as mesh_utils from '../mesh/mesh_utils'
import * as mesh_types from '../mesh/mesh_utils'
import * as mesh_base from '../mesh/mesh_utils'
import * as unwrapping from '../mesh/unwrapping'
import {KDrawModes} from '../mesh/mesh_curvature_test'
import {DataBlock, DataRef, DataRefProperty, DataRefListProperty, IDataBlockConstructor} from '../core/lib_api'
import {SceneObjectData} from '../sceneobject/sceneobject_base'
import {ToolMode} from '../editors/view3d/view3d_toolmode'
import {SceneObject, composeObjectMatrix} from '../sceneobject/sceneobject'
import * as customdata from '../mesh/customdata'
import {
  Editor,
  VelPan,
  VelPanFlags,
  DataBlockBrowser,
  DirectionChooser,
  EditorSideBar,
  makeDataBlockBrowser,
  MeshMaterialChooser,
  MeshMaterialPanel,
  NewDataBlockOp,
  getContextArea,
  IEditorConstructor,
} from '../editors/editor_base'
import {Icons} from '../editors/icon_enum'
import {MeshToolBase} from '../editors/view3d/tools/meshtool'
import {MeshEditor} from '../editors/view3d/tools/mesheditor'
import {SelMask} from '../editors/view3d/selectmode'
import {MeshOp, MeshDeformOp} from '../mesh/mesh_ops_base'
import {MeshOpBaseUV} from '../mesh/mesh_uvops_base'
import {TransformOp} from '../editors/view3d/transform/transform_ops'
import * as widget_tools from '../editors/view3d/widgets/widget_tools'
import * as widgets from '../editors/view3d/widgets/widgets'
import * as simplemesh from '../webgl/simplemesh'
import * as paramizer from '../mesh/mesh_paramizer'
import * as displacement from '../mesh/mesh_displacement'
import * as curvature from '../mesh/mesh_curvature'
import * as curvature_test from '../mesh/mesh_curvature_test'
import * as utils from '../mesh/mesh_utils'
import * as subdivide from '../mesh/mesh_subdivide'
import * as bvh from '../util/bvh'
import * as bezier from '../util/bezier'
import * as shaders from '../shaders/shaders'
import * as subsurf from '../subsurf'
import * as graph from '../core/graph'
import * as graphsockets from '../core/graphsockets'
import * as sceneobject from '../sceneobject'
import {ViewContext} from '../core/context'

/** is a constructor a subclass of another constructor? */
export function subclassOf<T>(testCls: unknown, cls2: T): testCls is T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p = testCls as any
  while (p && p !== p.__proto__) {
    if (p === cls2 || p.constructor === cls2) {
      return true
    }
    p = p.__proto__
  }
  return false
}

export interface IAddonDefine {
  name: string
  version: number | number[]
  author?: string
  url?: string
  icon?: number | HTMLImageElement
  description?: string
  documentationUrl?: string
}

export interface IAddon {
  addonDefine: IAddonDefine
  /** called only once, create classes here */
  onAddonCreate?(api: AddonAPI<this>): void
  unregister(): void
  register(api: AddonAPI<this>): void
  handleArgv(api: AddonAPI<this>, argv: string[]): void
  validArgv(api: AddonAPI<this>, argv: string[]): void
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type GenericConstructor = Function

export class AddonClasses<T> {
  dataBlockClasses: IDataBlockConstructor[] = []
  toolOpClasses: GenericConstructor[] = []
  structClasses: GenericConstructor[] = []
  toolModeClasses: GenericConstructor[] = []
  sceneObjectDataClasses: GenericConstructor[] = []
  customDataClasses: GenericConstructor[] = []
  editorClasses: GenericConstructor[] = []
  other: GenericConstructor[] = []
}

export class AddonAPI<T> {
  readonly shaders = shaders
  readonly nstructjs = nstructjs
  readonly util = util
  readonly vectormath = vectormath
  readonly math = math
  readonly subsurf = subsurf

  readonly simplemesh = simplemesh
  readonly pathux = pathux
  readonly mesh_utils = mesh_utils
  readonly unwrapping = unwrapping

  readonly sceneobject = sceneobject

  readonly mesh = {
    ...mesh,
    ...mesh_base,
    ...mesh_types,
    ...customdata,
    utils: mesh_utils,
    paramizer,
    displacement,
    curvature,
  } as const

  readonly KeyMap = KeyMap
  readonly HotKey = HotKey
  readonly bvh = bvh
  readonly bezier = bezier
  readonly Icons = Icons
  readonly SelMask = SelMask
  readonly editor = {
    Editor,
    VelPan,
    VelPanFlags,
    DataBlockBrowser,
    DirectionChooser,
    EditorSideBar,
    makeDataBlockBrowser,
    MeshMaterialChooser,
    MeshMaterialPanel,
    NewDataBlockOp,
    getContextArea,
  }

  readonly widgets3d = {
    ...widgets,
    ...widget_tools,
  } as const

  readonly toolmode = {ToolMode, MeshToolBase, MeshEditor} as const
  readonly toolop = {
    ToolOp,
    ToolProperty,
    IntProperty,
    FloatProperty,
    StringProperty,
    EnumProperty,
    FlagProperty,
    Vec2Property,
    Vec3Property,
    Vec4Property,
    Mat4Property,
    DataRefProperty,
    DataRefListProperty,
    MeshOp,
    MeshDeformOp,
    MeshOpBaseUV,
    TransformOp,
    BoolProperty,
  } as const
  readonly graph = {
    ...graph,
    ...graphsockets,
  }

  addon?: T

  classes = new AddonClasses<T>()
  _graphNodes = new Set<graph.Node['graph_id']>()

  readonly lib_api: {
    DataBlock: typeof DataBlock
    DataRef: typeof DataRef
    DataRefProperty: typeof DataRefProperty
    DataRefListProperty: typeof DataRefListProperty
  }

  constructor() {
    //reference back to addon
    this.addon = undefined

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const this2 = this
    const dataBlockProxy = class DataBlockAddon extends DataBlock {
      static register(cls: any) {
        const ret = super.register(cls)
        this2.classes.dataBlockClasses.push(cls)

        return ret
      }
    }
    this.lib_api = {
      DataBlock: dataBlockProxy as typeof DataBlock,
      DataRef,
      DataRefProperty,
      DataRefListProperty,
    }
  }

  get argv() {
    return _appstate.arguments
  }

  get ctx() {
    return _appstate.ctx
  }

  register(cls: unknown) {
    if (typeof cls !== 'function') {
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!nstructjs.isRegistered(cls as any)) {
      nstructjs.register(cls)
    }

    let addToOther = true

    if (subclassOf(cls, ToolOp)) {
      //ensure tooldef doesn't raise any errors
      cls.tooldef()

      this.classes.toolOpClasses.push(cls)
      ToolOp.register(cls)
      addToOther = false
    }

    if (subclassOf(cls, DataBlock)) {
      this.classes.dataBlockClasses.push(cls)
      DataBlock.register(cls)
      addToOther = false
    }

    if (subclassOf(cls, ToolMode)) {
      this.classes.toolModeClasses.push(cls)
      ToolMode.register(cls)
      addToOther = false

      if (window._appstate) {
        cls.defineAPI(_appstate.api)
      } else {
        const cb = () => {
          if (!window._appstate) {
            window.setTimeout(cb, 5)
            return
          }

          cls.defineAPI(_appstate.api)
        }

        window.setTimeout(cb)
      }
    }

    if (subclassOf(cls, customdata.CustomDataElem)) {
      this.classes.customDataClasses.push(cls)
      customdata.CustomDataElem.register(cls)
      addToOther = false
    }

    if (subclassOf(cls, Editor)) {
      this.classes.editorClasses.push(cls)
      Editor.register(cls as unknown as IEditorConstructor)
      addToOther = false
    }

    if (subclassOf(cls, SceneObjectData)) {
      SceneObjectData.register(cls)
      this.classes.sceneObjectDataClasses.push(cls)
      addToOther = false
    }

    if (addToOther) {
      this.classes.other.push(cls)
    }
  }

  graphConnect<
    SRC extends graph.Node,
    SRCOUT extends graph.NodeSocketType | string,
    DST extends graph.Node,
    DSTIN extends graph.NodeSocketType | string,
  >(src: SRC, output: SRCOUT, dst: DST, input: DSTIN) {
    const graph = this.ctx.graph

    if (src.graph_id < 0) {
      console.warn('Auto-adding node to dependency graph')
      graph.add(src)
      this._graphNodes.add(src.graph_id)
    }

    if (dst.graph_id < 0) {
      console.warn('Auto-adding node to dependency graph')
      graph.add(dst)
      this._graphNodes.add(dst.graph_id)
    }

    const outsocket = (typeof output === 'string' ? src.outputs[output] : output) as graph.NodeSocketType
    const insocket = (typeof input === 'string' ? dst.inputs[input] : input) as graph.NodeSocketType

    outsocket.connect(insocket)
  }

  onNewFilePost() {}

  onNewFilePre() {
    this._graphNodes = new Set()
  }

  graphAdd(node: graph.Node) {
    this.ctx.graph.add(node)
    this._graphNodes.add(node.graph_id)
  }

  graphRemove(node: graph.Node) {
    const id = node.graph_id

    this.ctx.graph.remove(node)
    this._graphNodes.delete(id)
  }

  unregister(cls: unknown) {
    if (typeof cls !== 'function') {
      console.error('unregister called with no arguments')
      return
    }

    function consolelog(...args: any[]) {
      //console.log(...args)
    }

    consolelog('unregistered', cls.name)

    if (nstructjs.isRegistered(cls)) {
      nstructjs.unregister(cls);
    }

    if (subclassOf(cls, ToolMode)) {
      consolelog('unregistering a toolmode', cls)

      ToolMode.unregister(cls)
    }

    if (subclassOf(cls, customdata.CustomDataElem)) {
      consolelog('unregistering a toolmode', cls)

      customdata.CustomDataElem.unregister(cls)
    }

    if (subclassOf(cls, ToolOp)) {
      ToolOp.unregister(cls)
    }

    if (subclassOf(cls, DataBlock)) {
      DataBlock.unregister(cls)
    }

    if (subclassOf(cls, SceneObjectData)) {
      SceneObjectData.unregister(cls)
    }

    if (subclassOf(cls, Editor)) {
      Editor.unregister(cls)
    }
  }

  unregisterAll() {
    let graph

    if (window._appstate) {
      graph = this.ctx.graph
    }

    for (const id of this._graphNodes) {
      let n

      if (!graph) {
        break
      }

      try {
        n = graph.node_idmap.get(id)

        if (n) {
          graph.remove(n)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error(error.stack)
        console.error(error.message)
        console.error('Failed to remove a graph node!', id, n)
      }
    }

    for (const k in this.classes) {
      for (const cls of this.classes[k as keyof typeof this.classes]) {
        this.unregister(cls)
      }
    }

    this.classes = new AddonClasses()
    return this
  }
}
