import {
  util,
  nstructjs,
  Vector2,
  Vector3,
  Vector4,
  Quat,
  Matrix4,
  ToolPropertyCache,
  buildToolSysAPI,
} from '../path.ux/scripts/pathux.js'

import * as editors from '../editors/all.js'

import '../tet/wiregen_ops.js'
import '../../addons/builtin/mesh/src/mesh_bevel.js'
import '../../addons/builtin/mesh/src/mesh_ops.js'
import '../../addons/builtin/mesh/src/mesh_extrudeops.js'

import '../image/image_ops.js'
import '../image/image.js'
import '../hair/strand.js'
import '../hair/strand_ops.js'
import '../hair/strand_selectops.js'

import {ResourceBrowser} from '../editors/resbrowser/resbrowser.js'
import {resourceManager} from '../core/resource.js'
import '../core/image.js'
import {buildCDAPI, buildElementAPI, CustomData} from '../../addons/builtin/mesh/src/customdata.js'
import {CameraData} from '../camera/camera.js'
import {Camera} from '../webgl/webgl.js'

import {buildProcMeshAPI} from '../../addons/builtin/mesh/src/mesh_gen.js'

import {makeToolModeEnum, ToolModes, ToolMode} from '../editors/view3d/view3d_toolmode.js'
import {NodeSocketClasses} from '../core/graph.js'
import {RenderSettings} from '../renderengine/renderengine_base'

import '../../addons/builtin/mesh/src/mesh_createops.js'

import {CurveSpline} from '../../addons/builtin/curve/src/curve.js'

let STRUCT = nstructjs.STRUCT
import '../editors/view3d/widgets/widget_tools.js' //ensure widget tools are all registered
import {WidgetFlags} from '../editors/view3d/widgets/widgets.js'
import {AddLightOp} from '../light/light_ops.js'
import {Light} from '../light/light.js'
import {DataAPI, DataPathError, DataStruct} from '../path.ux/scripts/pathux.js'
import {DataBlock, DataRef, Library, BlockTypes, BlockSet, BlockFlags, onBlockRegister} from '../core/lib_api.js'
import {View3D} from '../editors/view3d/view3d.js'
import {View3DFlags, CameraModes} from '../editors/view3d/view3d_base.js'
import {Editor, App, buildEditorsAPI} from '../editors/editor_base.js'
import {NodeEditorBase} from '../editors/node/NodeEditor.js'
import {NodeViewer} from '../editors/node/NodeEditor_debug.js'
import {MenuBarEditor} from '../editors/menu/MainMenu.js'
import {RGBASocket, Vec4Socket, Vec2Socket, Vec3Socket, FloatSocket} from '../core/graphsockets.js'
import {VelPan, VelPanFlags} from '../editors/velpan.js'
import {SelMask} from '../editors/view3d/selectmode.js'
import {ToolContext} from '../core/context.js'
import type {ViewContext} from '../core/context.js'
import {
  MeshModifierFlags,
  MeshFlags,
  MeshTypes,
  MeshDrawFlags,
  MeshFeatures,
  MeshSymFlags,
} from '../../addons/builtin/mesh/src/mesh_base.js'
import {Mesh} from '../../addons/builtin/mesh/src/mesh.js'
import {LiteMesh, LiteMeshDisplayMode, LiteMeshAttrItem, LiteMeshAttrCategory} from '../lite-mesh/litemesh.js'
import {Vertex, Element} from '../../addons/builtin/mesh/src/mesh_types.js'
import {ShaderNetwork} from '../shadernodes/shadernetwork.js'
import {Material} from '../core/material.js'
import '../shadernodes/allnodes.js'
import {ShaderNode} from '../shadernodes/shader_nodes.js'
import {Graph, Node, SocketFlags, NodeFlags, NodeSocketType} from '../core/graph.js'
import {ObjectFlags, SceneObject} from '../sceneobject/sceneobject.js'
import {ObjectSelectOneOp} from '../sceneobject/selectops.js'
import {DeleteObjectOp} from '../sceneobject/sceneobject_ops.js'
import {Scene, EnvLight, EnvLightFlags} from '../scene/scene.js'
import {api_define_graphclasses} from '../core/graph_class.js'
import {DisplayModes} from '../editors/debug/DebugEditor_base.js'
import {DebugEditor} from '../editors/debug/DebugEditor.js'

let api = new DataAPI()
import {Icons} from '../editors/icon_enum.js'
import {SceneObjectData} from '../sceneobject/sceneobject_base.js'
import {MaterialEditor} from '../editors/node/MaterialEditor.js'
import {
  BrushDynamics,
  BrushDynChannel,
  BrushFlags,
  BrushSpacingModes,
  DynTopoSettings,
  DynTopoSettingsSC,
  SculptBrush,
  SculptIcons,
  SculptTools,
} from '../brush/index'

import {buildProcTextureAPI, ProceduralTex, ProceduralTexUser} from '../texture/proceduralTex.js'
import {PropModes} from '../editors/view3d/transform/transform_base.js'
import {ImageBlock, ImageFlags, ImageGenTypes, ImageTypes, ImageUser} from '../image/image.js'
import {BVHSettings} from '../../addons/builtin/mesh/src/bvh.js'
import {AppSettings} from '../core/settings.js'

/**
 * A class constructor accepted by `api.mapStruct` / `inheritStruct`. The
 * data-API definition helpers are intentionally polymorphic over the concrete
 * DataBlock / Node / element subclass they map, so this is deliberately broad.
 */
type AnyClass = abstract new (...args: any[]) => any

/**
 * `this` inside a DataPath `.on(...)` change callback (and the `customGetSet`
 * getters/setters). path.ux binds the datapath's internal `ToolProperty` as
 * `this`, augmented with the exec scope: `ctx` is the root context object,
 * `dataref` is the runtime-resolved object the datapath addresses, and
 * `datapath` is the path string itself.
 */
interface ApiCallbackThis<Ref = any> {
  ctx: ViewContext
  dataref: Ref
  datapath: string
}

/**
 * The canonical data-API definition contract (refactor target — see
 * documentation/plans/api-define-defineapi-refactor.md). A participating class
 * exposes a static `defineAPI(api, struct?)` that declares its `DataStruct` and
 * returns it. `struct` defaults to `api.mapStruct(this)`; subclasses pass it
 * through `super.defineAPI(api, struct)` to inherit base properties.
 *
 * During the migration the registry below coexists with the legacy explicit
 * call list in `getDataAPI()`; it is not yet the source of truth.
 */
export interface DefineAPIClass {
  defineAPI(api: DataAPI, struct?: DataStruct): DataStruct
}

const dataAPIRegistry: DefineAPIClass[] = []

/**
 * Register a class so its `defineAPI` is invoked while the data API is built.
 * Idempotent. Addon classes should route through the addon `register(api)`
 * hook (see documentation/addons.md) so they can be torn down cleanly, rather
 * than calling this at module scope.
 */
export function registerDataAPI(cls: DefineAPIClass): void {
  if (!dataAPIRegistry.includes(cls)) {
    dataAPIRegistry.push(cls)
  }
}

/** The classes registered via {@link registerDataAPI}, in registration order. */
export function getDataAPIRegistry(): readonly DefineAPIClass[] {
  return dataAPIRegistry
}

export function api_define_rendersettings(api: DataAPI): void {
  let st = api.mapStruct(RenderSettings, true)

  st.bool('sharpen', 'sharpen', 'Sharpen')
  st.int('sharpenWidth', 'sharpenWidth', 'Sharpen Width').noUnits()
  st.float('filterWidth', 'filterWidth', 'AA Width').noUnits()
  st.float('sharpenFac', 'sharpenFac', 'Sharpen Fac').noUnits()
  st.int('minSamples', 'minSamples', 'Min Samples', 'Minimum samples to render before drawing to screen')
    .noUnits()
    .range(0, 10)
}

function api_define_socket(api: DataAPI, cls: AnyClass = NodeSocketType): DataStruct {
  let nstruct = api.mapStruct(cls, true)

  nstruct.flags('graph_flag', 'graph_flag', SocketFlags, 'Graph Flags', 'Flags')
  nstruct.int('graph_id', 'graph_id', 'Graph ID', 'Unique graph ID').readOnly()
  nstruct.string('name', 'name', 'Name', 'Name of socket')
  nstruct.string('uiname', 'uiname', 'UI Name', 'Name of socket')

  return nstruct
}

function api_define_node(api: DataAPI, cls: AnyClass = Node): DataStruct {
  let nstruct = api.mapStruct(cls, true)

  nstruct.flags('graph_flag', 'graph_flag', NodeFlags, 'Graph Flags', 'Flags')
  nstruct.int('graph_id', 'graph_id', 'Graph ID', 'Unique graph ID').readOnly()

  function defineSockets(inorouts: 'inputs' | 'outputs'): void {
    nstruct.list('', inorouts, [
      function getIter(api: DataAPI, list: any) {
        return (function* () {
          for (let k in list[inorouts]) {
            yield list[inorouts][k]
          }
        })()
      },
      function getLength(api: DataAPI, list: any) {
        return Object.keys(list[inorouts]).length
      },
      function get(api: DataAPI, list: any, key: string) {
        return list[inorouts][key]
      },
      function getKey(api: DataAPI, list: any, obj: any) {
        for (let k in list[inorouts]) {
          if (list[inorouts][k] === obj) return k
        }
      },
      function getStruct(api: DataAPI, list: any, key: string) {
        let obj = list[inorouts][key]

        if (obj === undefined) return api.getStruct(NodeSocketType)

        let ret

        if (obj.graph_flag & SocketFlags.INSTANCE_API_DEFINE) {
          if (!api.hasStruct(obj)) {
            ret = api.mapStruct(obj, true)
            obj.defineInstanceAPI(api, ret)
          } else {
            ret = api.getStruct(obj)
          }
        } else {
          ret = api.getStruct(obj.constructor)
        }

        return ret === undefined ? api.getStruct(NodeSocketType) : ret
      },
    ])
  }

  defineSockets('inputs')
  defineSockets('outputs')

  return nstruct
}

function api_define_datablock(api: DataAPI, cls: AnyClass = DataBlock): DataStruct {
  let dstruct = api_define_node(api, cls)

  dstruct.int('lib_id', 'lib_id', 'Lib ID').readOnly()

  let def = dstruct.flags('lib_flag', 'lib_flag', BlockFlags, 'Flag')

  def.icons({
    FAKE_USER: Icons.FAKE_USER,
  })

  def.on('change', function (this: ApiCallbackThis, newval: any, oldval: any) {
    let owner = this.dataref
    console.log('Fake user change', newval, oldval)

    if (newval === oldval) {
      return
    }

    if (newval) {
      owner.lib_users++
    } else {
      owner.lib_users--
    }
  })

  def.descriptions({
    FAKE_USER: 'Protect against auto delete',
  })

  dstruct.string('name', 'name', 'name')

  return dstruct
}

export function api_define_meshelem(api: DataAPI): void {
  let st = api.mapStruct(Element, true)

  st.flags('flag', 'flag', MeshFlags)
  st.flags('type', 'type', MeshTypes).readOnly()
  st.int('eid', 'id', 'ID', 'ID').readOnly()

  buildElementAPI(api, st)
}

export function api_define_meshvertex(api: DataAPI): void {
  let st = api.inheritStruct(Vertex, Element)
}

export function api_define_sceneobject_data(api: DataAPI, cls: AnyClass): DataStruct {
  let mstruct = api_define_datablock(api, cls)

  mstruct.list<Material[], number, Material>('materials', 'materials', [
    function getIter(api: DataAPI, list: Material[]) {
      return list
    },
    function getLength(api: DataAPI, list: Material[]) {
      return list.length
    },
    function get(api: DataAPI, list: Material[], key: number) {
      return list[key]
    },
    function getKey(api: DataAPI, list: Material[], obj: Material) {
      return list.indexOf(obj)
    },
    function getStruct(api: DataAPI, list: Material[], key: number) {
      return api.mapStruct(Material)
    },
  ])

  mstruct.bool('usesMaterial', 'usesMaterial', 'Uses Material').readOnly()
  return mstruct
}

/**
 * LiteMesh ObData properties (surfaced in the properties editor's ObData tab
 * via LiteMesh.buildPropertiesTab). Resolved through the `object.data`
 * dynamicStruct, which looks the struct up by class in the global registry.
 *
 * NOTE: this central, old-style registration is legacy. New data-API
 * definitions should move to a static `defineAPI(api)` method on the class
 * itself (matching ToolMode/SculptBrush); api_define.js would then just
 * invoke it. Keeping the pattern here for now to match api_define_mesh.
 */
export function api_define_litemesh(api: DataAPI): DataStruct {
  let mstruct = api_define_sceneobject_data(api, LiteMesh)

  let def = mstruct
    .flags(
      'displayColorMode',
      'displayColorMode',
      LiteMeshDisplayMode,
      'Display',
      'Attributes shown on the LiteMesh surface (combinable)'
    )
    .uiNames({
      VERTEX_COLOR: 'Vertex Color',
      POLY_GROUP  : 'Poly Groups',
    })
  def.on('change', function () {
    window.redraw_viewport()
  })

  // ObData attribute manager (Wave 2b). The attribute ListBox binds to this
  // `attrs` DataList; `showBuiltinAttrs` toggles the builtin filter.
  mstruct.bool('showBuiltinAttrs', 'showBuiltinAttrs', 'Show builtin attributes').on('change', function () {
    window.redraw_all?.()
  })

  // Category (AttrUse) of the attr selected in the ListBox. The setter rejects
  // roles invalid for the attr's type/domain (validCategories), so offering the
  // full set here is safe; setting a role also activates the layer.
  mstruct
    .enum('selectedAttrCategory', 'selectedAttrCategory', LiteMeshAttrCategory, 'Category', 'Attribute category / role')
    .uiNames({NONE: 'None', COLOR: 'Color', UV: 'UV', POLYGROUP: 'Poly Group'})
    .on('change', function () {
      window.redraw_all?.()
    })

  let astruct = api.mapStruct(LiteMeshAttrItem, true)
  astruct.string('attrName', 'attrName', 'Name').readOnly()

  // list(valueProp, apiPathSegment, funcs): value read from mesh.attrItems,
  // addressed in the data API as `object.data.attrs`.
  mstruct.list('attrItems', 'attrs', {
    getIter(api: DataAPI, list: LiteMeshAttrItem[]) {
      return list
    },
    getLength(api: DataAPI, list: LiteMeshAttrItem[]) {
      return list.length
    },
    get(api: DataAPI, list: LiteMeshAttrItem[], key: number) {
      return list[key]
    },
    getKey(api: DataAPI, list: LiteMeshAttrItem[], obj: LiteMeshAttrItem) {
      return list.indexOf(obj)
    },
    getStruct(api: DataAPI, list: LiteMeshAttrItem[], key: number) {
      return api.mapStruct(LiteMeshAttrItem)
    },
  })

  return mstruct
}

export function api_define_imageuser(api: DataAPI): DataStruct {
  let st = api.mapStruct(ImageUser, true)

  st.struct('image', 'image', 'Image', api.mapStruct(ImageBlock))

  return st
}

export function api_define_image(api: DataAPI): void {
  let st = api_define_datablock(api, ImageBlock)

  st.enum('type', 'type', ImageTypes, 'Image Type')
  st.enum('genType', 'genType', ImageGenTypes, 'Generator')
  st.int('width', 'width', 'Width').noUnits().range(1, 16384).step(5)
  st.int('height', 'height', 'Height').noUnits().range(1, 16384).step(5)
  st.string('url', 'url', 'URL')
  st.bool('ready', 'ready', 'Ready', 'Is the image ready for use').readOnly()
  st.flags('flag', 'flag', ImageFlags, 'Flag')
  st.color4('genColor', 'genColor', 'Color')

  api_define_imageuser(api)
}

export function api_define_bvhsettings(api: DataAPI): void {
  let st = api.mapStruct(BVHSettings, true)

  st.int('depthLimit', 'depthLimit', 'Depth Limit').range(1, 32).noUnits()
  st.int('drawLevelOffset', 'drawLevelOffset', 'Draw Level').range(0, 8).noUnits()
  st.int('leafLimit', 'leafLimit', 'Tri Limit').range(1, 4096).step(5).noUnits()
}

export function api_define_mesh(api: DataAPI, pstruct: DataStruct): void {
  api_define_bvhsettings(api)

  let mstruct = api_define_sceneobject_data(api, Mesh)
  pstruct.struct('mesh', 'mesh', 'Mesh', mstruct)

  mstruct.int('uiTriangleCount', 'triCount', 'Triangles', 'Total number of triangles in the mesh').readOnly()
  mstruct.struct('bvhSettings', 'bvhSettings', 'BVH Settings', api.mapStruct(BVHSettings))

  let def
  def = mstruct.flags('symFlag', 'symFlag', MeshSymFlags, 'Symmetry Flags', 'Mesh Symmetry Flags')
  def.icons({
    X: Icons.SYM_X,
    Y: Icons.SYM_Y,
    Z: Icons.SYM_Z,
  })
  def.on('change', function (this: ApiCallbackThis<Mesh>, e: any) {
    let mesh = this.dataref

    mesh.updateMirrorTags()

    mesh.recalcNormals()
    mesh.regenRender()
    mesh.regenTessellation()
    mesh.graphUpdate()
  })

  def = mstruct.flags('flag', 'flag', MeshModifierFlags, 'Modifier Flag', 'Mesh modifier flags')
  def.icons({
    SUBSURF: Icons.SUBSURF,
  })

  def.on('change', (e: any) => {
    window.redraw_viewport()
  })

  buildCDAPI(api)

  api_define_meshelem(api)
  api_define_meshvertex(api)

  function defineElemList(key: string, type: number): void {
    mstruct.struct(key + '.customData', key + 'Data', 'Custom Datas', api.mapStruct(CustomData, false))

    mstruct.list(key, key, [
      function getIter(api: DataAPI, list: any) {
        return list
      },
      function getLength(api: DataAPI, list: any) {
        return list.length
      },
      function get(api: DataAPI, list: any, key: number) {
        return list.local_eidmap[key]
      },
      function getKey(api: DataAPI, list: any, obj: any) {
        return obj !== undefined ? obj.eid : -1
      },
      function getActive(api: DataAPI, list: any) {
        return list.active
      },
      function setActive(api: DataAPI, list: any, key: number | undefined) {
        list.active = key !== undefined ? list.local_eidmap[key] : undefined
        window.redraw_viewport()
      },
      function getStruct(api: DataAPI, list: any, key: number) {
        return api.mapStruct(Vertex, false)
      },
    ])
  }

  defineElemList('verts', MeshTypes.VERTEX)
  defineElemList('edges', MeshTypes.EDGE)
  defineElemList('loops', MeshTypes.LOOP)
  defineElemList('faces', MeshTypes.FACE)

  //MeshModifierFlags
}

// Phase 3 shim — body moved to CurveSpline.defineAPI
// (addons/builtin/curve/src/curve.ts).
export function api_define_curvespline(api: DataAPI): DataStruct {
  return CurveSpline.defineAPI(api)
}

function api_define_shadernode(api: DataAPI, cls?: AnyClass): DataStruct {
  let nstruct = api_define_node(api, ShaderNode)

  return nstruct
}

// Phase 3 shim — body moved to Camera.defineAPI (scripts/webgl/webgl.ts).
export function api_define_camera(api: DataAPI): void {
  Camera.defineAPI(api)
}

export function api_define_cameradata(api: DataAPI): void {
  let mstruct = api_define_datablock(api, CameraData)

  let onchange = function (this: ApiCallbackThis) {
    let camera = this.dataref

    camera.update()
  }

  mstruct.struct('camera', 'camera', 'Camera', api.mapStruct(Camera, false))
  mstruct.struct('finalCamera', 'finalCamera', 'finalCamera', api.mapStruct(Camera, false))
  mstruct.float('speed', 'speed', 'Anim Speed').range(0.00001, 100.0)
  mstruct.float('height', 'height', 'Height').range(-100, 100.0).on('change', onchange)

  mstruct.bool('flipped', 'flipped', 'Flipped').on('change', onchange)
  mstruct.bool('pathFlipped', 'pathFlipped', 'Flip Path').on('change', onchange)

  mstruct
    .float('azimuth', 'azimuth', 'Azimuth')
    .on('change', onchange)
    .range(-Math.PI, Math.PI)
    .displayUnit('degree')
    .baseUnit('radian')

  mstruct.float('rotate', 'rotate', 'Rotation').range(-Math.PI, Math.PI).displayUnit('degree').baseUnit('radian')
}

function api_define_graph(api: DataAPI, cls: AnyClass = Graph): DataStruct {
  let gstruct = api.mapStruct(cls)

  gstruct.list('', 'nodes', [
    function getIter(api: DataAPI, list: any) {
      return list.nodes.values()
    },
    function getLength(api: DataAPI, list: any) {
      return list.nodes.length
    },
    function get(api: DataAPI, list: any, key: string) {
      return list.node_idmap.get(key)
    },
    function getKey(api: DataAPI, list: any, obj: any) {
      return '' + obj.graph_id
    },
    function getActive(api: DataAPI, list: any) {
      return list.nodes.active
    },
    function setActive(api: DataAPI, list: any, key: string) {
      list.nodes.active = list.node_idmap.get(key)
    },
    function getStruct(api: DataAPI, list: any, key: string) {
      let obj = list.node_idmap.get(key)

      if (obj === undefined) return api.getStruct(Node)

      let ret = api.getStruct(obj.constructor)
      return ret === undefined ? api.getStruct(Node) : ret
    },
  ])

  return gstruct
}

function api_define_nodesockets(api: DataAPI): void {
  api_define_socket(api)

  for (let cls of NodeSocketClasses) {
    let st = api.inheritStruct(cls, NodeSocketType)
    cls.defineAPI(api, st)
  }
}

function api_define_nodes(api: DataAPI): void {}

function api_define_shadernetwork(api: DataAPI, parent: DataStruct): DataStruct {
  let mstruct = api_define_datablock(api, ShaderNetwork)

  parent.struct('shadernetwork', 'shadernetwork', 'ShaderNetwork', mstruct)

  mstruct.struct('graph', 'graph', 'Shader Graph', api.getStruct(Graph))

  return mstruct
}

// Phase 3 shim — body moved to Material.defineAPI (scripts/core/material.ts).
function api_define_material(api: DataAPI): void {
  Material.defineAPI(api)
}

function api_define_sceneobject(api: DataAPI, parent: DataStruct): DataStruct {
  let ostruct = api_define_datablock(api, SceneObject)

  // NOTE: the original passes the SceneObject *class* where struct() types a
  // string uiname; preserved verbatim (the value is only used for display).
  parent.struct('object', 'object', SceneObject as unknown as string, ostruct)

  ostruct.dynamicStruct('data', 'data', 'data')
  ostruct.struct('material', 'material', 'Material', api.mapStruct(Material, false))

  ostruct.flags('flag', 'flag', ObjectFlags).on('change', function () {
    window.redraw_viewport(true)
  })

  return ostruct
}

function api_define_libraryset(
  api: DataAPI,
  path: string,
  apiname: string,
  uiname: string,
  parent: DataStruct,
  cls: AnyClass
): void {
  //let lstruct = api.mapStruct(BlockSet, true);
  //parent.struct(path, apiname, uiname, lstruct);
  parent.list(path, apiname, [
    function get(api: DataAPI, list: any, key: number | string) {
      if (typeof key === 'number') {
        return list.idmap[key]
      } else {
        return list.namemap[key]
      }
    },

    function getIter(api: DataAPI, list: any) {
      return list
    },

    function getLength(api: DataAPI, list: any) {
      return list.length
    },

    function getActive(api: DataAPI, list: any) {
      return list.active
    },

    function setActive(api: DataAPI, list: any, key: number | undefined) {
      if (key === undefined || key === -1) {
        list.active = undefined
        return
      }

      let obj = list.idmap[key]
      if (obj === undefined) {
        throw new DataPathError('unknown datablock key ' + key + '.')
      }

      list.obj = obj
    },
    function getKey(api: DataAPI, list: any, obj: any) {
      return obj.lib_id
    },
    function getStruct(api: DataAPI, list: any, key: number | string) {
      let obj = typeof key === 'string' ? list.namemap[key] : list.idmap[key]

      if (obj === undefined) {
        return api.getStruct(DataBlock)
      }

      let ret = api.getStruct(obj.constructor)

      if (ret === undefined) {
        return api.getStruct(DataBlock)
      }

      return ret
    },
  ])
}

let libraryStruct: DataStruct | undefined
onBlockRegister(function onDataBlockRegister(blockCls: any) {
  if (libraryStruct !== undefined) {
    let def = blockCls.blockDefine()
    api_define_libraryset(api, def.typeName, def.typeName, def.uiName, libraryStruct, blockCls)
  }
})

function api_define_library(api: DataAPI, parent: DataStruct): void {
  let lstruct = api.mapStruct(Library)
  libraryStruct = lstruct

  parent.struct('datalib', 'library', 'Library', lstruct)

  for (let cls of BlockTypes) {
    let def = cls.blockDefine()

    api_define_libraryset(api, def.typeName!, def.typeName!, def.uiName!, lstruct, cls)
  }

  //let lstruct = api.mapStruct(BlockSet, true);
  //parent.struct(path, apiname, uiname, lstruct);
  parent.list('blocks', 'blocks', [
    function get(api: DataAPI, list: any, key: number | string) {
      return list.get(key)
    },

    function getIter(api: DataAPI, list: any) {
      return list
    },

    function getLength(api: DataAPI, list: any) {
      let len = 0
      for (let list2 of list.libs) {
        len += list2.length
      }

      return len
    },

    function getActive(api: DataAPI, list: any) {
      return undefined
    },

    function setActive(api: DataAPI, list: any, key: number | string) {
      return undefined
    },
    function getKey(api: DataAPI, list: any, obj: any) {
      return obj.lib_id
    },
    function getStruct(api: DataAPI, list: any, key: number | string) {
      let obj = list.get(key)

      if (obj === undefined) {
        return api.getStruct(DataBlock)
      }

      let ret = api.getStruct(obj.constructor)

      if (ret === undefined) {
        return api.getStruct(DataBlock)
      }
    },
  ])
}

export function api_define_velpan(api: DataAPI, parent?: DataStruct): DataStruct {
  let vp = api.mapStruct(VelPan)

  vp.vec2('pos', 'pos', 'Position')
  vp.vec2('scale', 'scale', 'Scale')
  vp.vec2('min', 'min', 'Boundary Minimum')
  vp.vec2('max', 'max', 'Boundary Maximum')

  return vp
}

export function api_define_screen(api: DataAPI, parent: DataStruct): void {
  let st = api.mapStruct(App)

  parent.struct('screen', 'screen', 'Screen', st)

  st.list('sareas', 'editors', [
    //list should be main App (Screen) instance
    function get(api: DataAPI, list: any, key: number) {
      return list[key].area
    },

    function getKey(api: DataAPI, list: any, obj: any) {
      console.log(arguments)
      for (let i = 0; i < list.length; i++) {
        if (list[i].area === obj) {
          return i
        }
      }
    },

    function getLength(api: DataAPI, list: any) {
      return list.length
    },

    function getIter(api: DataAPI, list: any) {
      return (function* () {
        for (let sarea of list) {
          yield sarea.area
        }
      })()
    },

    function getStruct(api: DataAPI, list: any, key: number) {
      let obj = list[key]
      if (obj === undefined) return api.getStruct(Editor)
      obj = obj.area

      let ret = api.getStruct(obj.constructor)
      ret = ret === undefined ? api.getStruct(Editor) : ret

      return ret
    },

    function getActive(api: DataAPI, list: any) {
      return Editor.getActiveArea()
    },
  ])
}

export function api_define_envlight(api: DataAPI): DataStruct {
  let estruct = api.mapStruct(EnvLight)

  let onchange = () => {
    window.redraw_viewport()
  }

  estruct.color3('color', 'color', 'Color', 'Ambient light color').on('change', onchange)
  estruct.float('power', 'power', 'Power', 'Power of ambient light power').on('change', onchange).noUnits()
  estruct.flags('flag', 'flag', EnvLightFlags, 'flag', 'Ambient light flags').on('change', onchange)
  estruct.float('ao_dist', 'ao_dist', 'Distance').on('change', onchange).noUnits()
  estruct.float('ao_fac', 'ao_fac', 'Factor').on('change', onchange).noUnits()

  return estruct
}

export function api_define_light(api: DataAPI, pstruct: DataStruct): void {
  let lstruct = api_define_datablock(api, Light)

  let onchange = () => {
    window.redraw_viewport()
  }

  pstruct.struct('light', 'light', 'Light', lstruct)
}

export function api_define_scene(api: DataAPI, pstruct: DataStruct): void {
  let sstruct = api_define_datablock(api, Scene)

  pstruct.struct('scene', 'scene', 'Scene', sstruct)

  sstruct.struct('envlight', 'envlight', 'Ambient Light', api_define_envlight(api))
  sstruct.bool('propEnabled', 'propEnabled', 'Magnet Mode').icon(Icons.MAGNET)
  sstruct.enum('propMode', 'propMode', PropModes, 'Magnet Curve')
  sstruct.float('propRadius', 'propRadius', 'Magnet Radius').noUnits().range(0.01, 1000000)
  sstruct.bool('propIslandOnly', 'propIslandOnly', 'Island Only')

  let prop = makeToolModeEnum()

  let def = sstruct.enum('toolmode_i', 'toolmode', prop, 'ToolMode', 'ToolMode')
  def.on('change', function (this: ApiCallbackThis<Scene>, newval: any, oldval: any) {
    let scene = this.dataref

    console.log('toolmode change', oldval, newval)

    scene.toolmode_i = oldval
    scene.switchToolMode(newval)
    window.redraw_viewport()
  })

  let onchange = function (this: ApiCallbackThis<Scene>, newval: number, oldval: number) {
    let scene = this.dataref

    scene.updateWidgets()
    window.redraw_viewport()
  }

  /*
  def = sstruct.enum("widgettool", "active_tool", prop.values, "Active Tool", "Currently active tool widget");
  def.setProp(prop);
  def.on("change", onchange);
  */

  let base = ToolMode.defineAPI(api)
  sstruct.dynamicStruct('toolmode', 'tool', 'Active Tool', base)

  //vstruct.dynamicStruct("toolmode_namemap", "toolmodes", "ToolModes");
  let struct2 = sstruct.struct('toolmode_namemap', 'tools', 'Saved Tool Data')
  struct2.name = 'ToolModes'

  for (let cls of ToolModes) {
    let def = cls.toolModeDefine()

    let struct3 = cls.defineAPI(api)

    struct2.struct(def.name, def.name, def.uiname, struct3)
  }
}

export function api_define_dyntopo(api: DataAPI): void {
  DynTopoSettings.defineAPI(api)
}

export function api_define_dyntopo_sc(api: DataAPI): void {
  DynTopoSettingsSC.defineAPI(api)
}

export function api_define_brush(api: DataAPI, cstruct: DataStruct): void {
  let bst = api_define_datablock(api, SculptBrush)

  api_define_dyntopo(api)
  api_define_dyntopo_sc(api)

  bst.flags('flag', 'flag', BrushFlags, 'Flag').icons({
    SHARED_SIZE: Icons.SHARED_BRUSH_SIZE,
  })

  bst
    .float('smoothRadiusMul', 'smoothRadiusMul', 'Smooth Radius')
    .description('Multiply brush radius by this factor for smoothing')
    .range(0.125, 15.0)
    .noUnits()

  bst.float('rakeCurvatureFactor', 'rakeCurvatureFactor', 'Curvature Factor').noUnits().range(0.0, 1.0)

  bst.enum('spacingMode', 'spacingMode', BrushSpacingModes, 'Spacing Mode').descriptions({
    EVEN: 'Fixed distance between brush points',
    NONE: 'Use raw brush points',
  })

  bst.float('sharp', 'sharp', 'Sharpening').range(0.0, 1.0).noUnits().step(0.015)

  bst.float('strength', 'strength', 'Strength').range(0.001, 2.0).noUnits().step(0.015)
  bst.float('radius', 'radius', 'Radius').range(0.1, 350.0).noUnits().step(1.0)
  bst.enum('tool', 'tool', SculptTools).icons(SculptIcons)

  bst.float('autosmooth', 'autosmooth', 'Autosmooth').range(0.0, 2.0).noUnits()
  bst.float('autosmoothInflate', 'autosmoothInflate', 'Inflation').range(0.0, 1.0).noUnits()

  bst.float('planeoff', 'planeoff', 'planeoff').range(-3.5, 3.5).noUnits()
  bst.float('spacing', 'spacing', 'Spacing').range(0.01, 12.0).noUnits()
  bst.color4('color', 'color', 'Primary Color')
  bst.color4('bgcolor', 'bgcolor', 'Secondary Color')
  bst.float('concaveFilter', 'concaveFilter', 'Concave Wash').range(0.0, 1.0).noUnits()
  bst.float('rake', 'rake', 'Rake').range(0.0, 1.0).noUnits()
  bst.float('normalfac', 'normalfac', 'Normal Fac').range(0.0, 1.0).noUnits()
  bst.float('pinch', 'pinch', 'Pinch').range(0.0, 1.0).noUnits()

  bst
    .float('smoothProj', 'smoothProj', 'Projection', 'How much smoothing should project to surface')
    .range(0.0, 0.97)
    .noUnits()

  bst.struct('texUser', 'texUser', 'Texture', api.mapStruct(ProceduralTexUser))
  bst.struct('dynTopo', 'dynTopo', 'DynTopo', api.mapStruct(DynTopoSettings))
  bst.struct('dynTopoSC', 'dynTopoSC', 'DynTopo', api.mapStruct(DynTopoSettingsSC))

  bst.curve1d('falloff', 'falloff', 'Falloff')
  bst.curve1d('falloff2', 'falloff2', 'Falloff', 'Inbetween Falloff')

  let dst

  let cst = api.mapStruct(BrushDynChannel, true)
  cst.bool('useDynamics', 'useDynamics', 'Use Dynamics').icon(Icons.BRUSH_DYNAMICS)
  cst.curve1d('curve', 'curve', 'Curve')

  dst = api.mapStruct(BrushDynamics, true)
  let b = new BrushDynamics()

  for (let ch of b.channels) {
    dst.struct(ch.name, ch.name, ch.name, cst)
  }

  bst.struct('dynamics', 'dynamics', 'Dynamics', dst)
}

export function api_define_matrix4(api: DataAPI): DataStruct {
  let st = api.mapStruct(Matrix4, true)

  let data = st.struct('$matrix', 'data', 'Matrix Data')

  for (let i = 1; i <= 4; i++) {
    for (let j = 1; j <= 4; j++) {
      let key = 'm' + i + j

      data.float(key, key, key).noUnits()
    }
  }

  return st
}

let _done = false

export function getDataAPI(): DataAPI {
  if (_done) {
    return api
  }

  let cstruct = api.mapStruct(ToolContext)

  api_define_matrix4(api)

  api_define_velpan(api)
  api_define_nodesockets(api)

  api_define_node(api)
  api_define_image(api)

  api_define_shadernode(api)
  api_define_graph(api)

  api_define_datablock(api, DataBlock)
  api_define_shadernetwork(api, cstruct)
  api_define_material(api)

  cstruct.struct('graph', 'graph', 'Graph', api.mapStruct(Graph))

  buildProcTextureAPI(api, api_define_datablock)

  api_define_brush(api, cstruct)

  api_define_rendersettings(api)

  /*
  api_define_node_editor(api, cstruct);
  api_define_node_viewer(api, cstruct);
  api_define_mateditor(api);
  api_define_debugeditor(api, cstruct);
  */

  api_define_mesh(api, cstruct)
  api_define_litemesh(api)

  api_define_library(api, cstruct)
  api_define_screen(api, cstruct)
  api_define_curvespline(api)
  api_define_camera(api)
  api_define_cameradata(api)
  api_define_scene(api, cstruct)
  api_define_light(api, cstruct)

  let ostruct = api_define_sceneobject(api, cstruct)

  api_define_nodes(api)

  cstruct.list('', 'objects', [
    function getIter(api: DataAPI, list: any) {
      return (function* () {
        for (let ob of list.datalib.object) {
          yield ob
        }
      })()
    },
    function getLength(api: DataAPI, list: any) {
      return list.datalib.object.length
    },
    function get(api: DataAPI, list: any, key: number | string) {
      return list.datalib.get(key)
    },
    function getKey(api: DataAPI, list: any, obj: any) {
      return obj.lib_id
    },
    function getStruct(api: DataAPI, list: any, key: number | string) {
      return ostruct
    },
  ])
  api.setRoot(cstruct)

  cstruct.list('', 'datablocks', [
    function getIter(api: DataAPI, list: any) {
      return list.datalib.allBlocks
    },
    function getLength(api: DataAPI, list: any) {
      let len = 0
      for (let block of list.datalib.allBlocks) {
        len++
      }
      return len
    },
    function get(api: DataAPI, list: any, key: number | string) {
      return list.datalib.get(key)
    },
    function getKey(api: DataAPI, list: any, obj: any) {
      return obj.lib_id
    },
    function getStruct(api: DataAPI, list: any, key: number | string) {
      //console.log(list.datalib.get(key).constructor);
      return api.mapStruct(list.datalib.get(key).constructor, false)
    },
  ])

  api_define_graphclasses(api)
  buildProcMeshAPI(api)

  cstruct.struct('material', 'material', 'Material', api.mapStruct(Material, false))

  cstruct.dynamicStruct('last_tool', 'last_tool', 'Last Tool')

  let def = cstruct.flags('selectMask', 'selectmode', SelMask, 'Selection Mode', 'Selection Mode')
  def.icons({
    VERTEX: Icons.VERT_MODE,
    EDGE  : Icons.EDGE_MODE,
    FACE  : Icons.FACE_MODE,
    OBJECT: Icons.CIRCLE_SEL,
  })

  let sstruct = api.mapStruct(Scene, false)

  def = sstruct.flags('selectMask', 'selectMaskEnum', SelMask, 'Selection Mode', 'Selection Mode')
  def.icons({
    VERTEX: Icons.VERT_MODE,
    EDGE  : Icons.EDGE_MODE,
    FACE  : Icons.FACE_MODE,
    OBJECT: Icons.CIRCLE_SEL,
  })
  def.on('change', function (this: ApiCallbackThis<Scene>, newv: any, oldv: any) {
    let owner = this.dataref

    console.log('OWNER', owner, owner.selectMask)
    console.log('BLEH', arguments)

    let mask = owner.selectMask
    let old = oldv

    let newf = mask & ~old
    console.log('new flag', newf)

    owner.selectMask &= ~(SelMask.VERTEX | SelMask.FACE | SelMask.EDGE)
    owner.selectMask |= newf

    for (let ob of owner.objects.selected.editable) {
      if (ob.data && ob.data instanceof Mesh) {
        ob.data.regenElementsDraw()
      }
    }
  })

  AppSettings.defineAPI(api)

  buildEditorsAPI(api, cstruct)
  buildToolSysAPI(api, true)

  cstruct.struct('propCache', 'toolDefaults', 'Tool Defaults', api.mapStruct(ToolPropertyCache))

  cstruct.struct('settings', 'settings', 'Settings', api.mapStruct(AppSettings, false))

  _done = true

  return api
}
