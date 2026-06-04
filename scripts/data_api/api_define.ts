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
import {buildCDAPI} from '../../addons/builtin/mesh/src/customdata.js'
// CameraData self-registers at module scope; api_define is its only importer,
// so this side-effect import is what brings it into the bundle.
import '../camera/camera.js'

import {buildProcMeshAPI} from '../../addons/builtin/mesh/src/mesh_gen.js'

import {NodeSocketClasses} from '../core/graph.js'

import '../../addons/builtin/mesh/src/mesh_createops.js'

import {CurveSpline} from '../../addons/builtin/curve/src/curve.js'

let STRUCT = nstructjs.STRUCT
import '../editors/view3d/widgets/widget_tools.js' //ensure widget tools are all registered
import {WidgetFlags} from '../editors/view3d/widgets/widgets.js'
import {AddLightOp} from '../light/light_ops.js'
import {Light} from '../light/light.js'
import {DataAPI, DataStruct} from '../path.ux/scripts/pathux.js'
import {DataBlock, DataRef, Library, onBlockRegister, defineLibrarySet} from '../core/lib_api.js'
import {View3D} from '../editors/view3d/view3d.js'
import {View3DFlags, CameraModes} from '../editors/view3d/view3d_base.js'
import {App, buildEditorsAPI} from '../editors/editor_base.js'
import {NodeEditorBase} from '../editors/node/NodeEditor.js'
import {NodeViewer} from '../editors/node/NodeEditor_debug.js'
import {MenuBarEditor} from '../editors/menu/MainMenu.js'
import {RGBASocket, Vec4Socket, Vec2Socket, Vec3Socket, FloatSocket} from '../core/graphsockets.js'
import {VelPan, VelPanFlags} from '../editors/velpan.js'
import {SelMask} from '../editors/view3d/selectmode.js'
import {ToolContext} from '../core/context.js'
import type {ViewContext} from '../core/context.js'
import {Mesh} from '../../addons/builtin/mesh/src/mesh.js'
// LiteMesh self-registers at module scope; api_define is its only importer.
import '../lite-mesh/litemesh.js'
import {Vertex, Element} from '../../addons/builtin/mesh/src/mesh_types.js'
import {ShaderNetwork} from '../shadernodes/shadernetwork.js'
import {Material} from '../core/material.js'
import '../shadernodes/allnodes.js'
import {ShaderNode} from '../shadernodes/shader_nodes.js'
import {Graph, Node, SocketFlags, NodeSocketType} from '../core/graph.js'
import {SceneObject} from '../sceneobject/sceneobject.js'
import {ObjectSelectOneOp} from '../sceneobject/selectops.js'
import {DeleteObjectOp} from '../sceneobject/sceneobject_ops.js'
import {Scene} from '../scene/scene.js'
import {api_define_graphclasses} from '../core/graph_class.js'
import {DisplayModes} from '../editors/debug/DebugEditor_base.js'
import {DebugEditor} from '../editors/debug/DebugEditor.js'

let api = new DataAPI()
import {Icons} from '../editors/icon_enum.js'
import {setSceneObjectMaterialClass} from '../sceneobject/sceneobject_base.js'
import {MaterialEditor} from '../editors/node/MaterialEditor.js'

import {buildProcTextureAPI} from '../texture/proceduralTex.js'
import {BVHSettings} from '../../addons/builtin/mesh/src/bvh.js'
import {AppSettings} from '../core/settings.js'

// Registry primitives live in the dependency-free leaf `api_define_registry.ts`
// so core classes can self-register from their own modules without a
// `class → api_define → class` import cycle. Imported for local use and
// re-exported for back-compat.
import {registerDataAPI, getDataAPIRegistry, type DefineAPIClass} from './api_define_registry.js'
export {registerDataAPI, getDataAPIRegistry, type DefineAPIClass}

// Inject the Material class into sceneobject_base so SceneObjectData.defineAPI
// can map its `materials` list struct without a sceneobject_base → core/material
// import cycle (see setSceneObjectMaterialClass). This runs at module load, so
// the class is set before getDataAPI() walks the API.
setSceneObjectMaterialClass(Material)

/**
 * A class constructor accepted by `api.mapStruct`. The data-API definition
 * helpers are intentionally polymorphic over the concrete DataBlock / Node /
 * element subclass they map, so this is deliberately broad.
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
 * Classes whose `defineAPI` has already run this build. Guards the registry
 * population pass so a class is populated exactly once even if it is also
 * defined-first explicitly (e.g. by a class-dependent helper).
 */
const _definedAPIClasses = new Set<DefineAPIClass>()

/**
 * Run a class's `defineAPI` once. Returns its (now-populated) struct. Safe to
 * call ahead of the registry loop (e.g. from a class-dependent helper that needs
 * a populated struct); the loop then skips it.
 */
function defineOnce(api: DataAPI, cls: DefineAPIClass): DataStruct {
  if (!_definedAPIClasses.has(cls)) {
    _definedAPIClasses.add(cls)
    cls.defineAPI(api)
  }
  return api.mapStruct(cls as AnyClass, false)
}

/**
 * Register the addon (`addons/builtin/*`) classes that participate in the data
 * API. Idempotent. Registration order is irrelevant — struct *creation* is
 * decoupled from *population* (cached empty structs are shared by reference),
 * and subclass `defineAPI`s *chain* their parent (`super.defineAPI(api, struct)`
 * re-declares the parent's members onto the child's own struct) rather than
 * copying an already-built parent struct, so no class needs another to be
 * populated first.
 *
 * Core (non-addon) classes self-register from their own modules via
 * `registerDataAPI(this)` at module scope (the registry primitive lives in the
 * dependency-free leaf `api_define_registry.ts`, so there is no
 * `class → api_define → class` cycle). They land in the registry as a
 * side-effect of being imported — which this module does for every one of them.
 *
 * Addon classes (`Mesh`, `Vertex`, `Element`, `BVHSettings`, `CurveSpline`)
 * stay centralized here rather than self-registering: addon convention forbids
 * module-scope registration side-effects (they must be routable through each
 * addon's `register(api)` hook for clean teardown), and getDataAPI runs in the
 * AppState constructor before `startAddons`, so the registry must already be
 * fully populated by then. Routing them through the addon `register(api)` hook —
 * so core's `api_define.ts` stops importing `addons/builtin/*` — is the
 * registry's larger payoff and is left as a follow-up (see TODO.md).
 */
function registerAddonDataAPIClasses(): void {
  registerDataAPI(BVHSettings)
  registerDataAPI(Element)
  registerDataAPI(Vertex)
  registerDataAPI(Mesh)
  registerDataAPI(CurveSpline)
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
  return Node.defineAPI(api, api.mapStruct(cls, true))
}

function api_define_datablock(api: DataAPI, cls: AnyClass = DataBlock): DataStruct {
  return DataBlock.defineAPI(api, api.mapStruct(cls, true))
}

function api_define_shadernode(api: DataAPI, cls?: AnyClass): DataStruct {
  let nstruct = api_define_node(api, ShaderNode)

  return nstruct
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
  // NodeSocketType's own struct (used as the fallback target by Node's socket
  // lists via api.getStruct(NodeSocketType)).
  api_define_socket(api)

  for (let cls of NodeSocketClasses) {
    // Chain the base socket props onto each subclass's own struct (api_define_socket
    // re-declares them rather than copying NodeSocketType's struct), then let the
    // subclass add its specifics — no dependency on NodeSocketType being built first.
    let st = api_define_socket(api, cls)
    cls.defineAPI(api, st)
  }
}

let libraryStruct: DataStruct | undefined
onBlockRegister(function onDataBlockRegister(blockCls: any) {
  if (libraryStruct !== undefined) {
    let def = blockCls.blockDefine()
    defineLibrarySet(api, def.typeName, def.typeName, def.uiName, libraryStruct, blockCls)
  }
})

function api_define_library(api: DataAPI, parent: DataStruct): void {
  // The per-blocktype lists (library.mesh, library.scene, …) are Library's own
  // struct members, populated by Library.defineAPI via the registry pass. This
  // attach-only driver shim fetches that struct, keeps the dynamic-registration
  // wiring (libraryStruct, used by the onBlockRegister hook above), and wires
  // the parent-level attaches below.
  let lstruct = api.mapStruct(Library, false)
  libraryStruct = lstruct

  parent.struct('datalib', 'library', 'Library', lstruct)

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

  // ── Population pass ─────────────────────────────────────────────────────
  // Non-class struct builders (path.ux submodule types, free structs, the
  // socket inherit loop, and the customdata / procedural / graph-class helpers)
  // have no class `defineAPI`, so they stay explicit. Order among them is
  // irrelevant: struct *creation* is decoupled from *population* (cached empty
  // structs are shared by reference) and the on-disk catalog is canonically
  // sorted (tools/gen-datapaths.mjs), so build order never affects output.
  api_define_matrix4(api)
  api_define_velpan(api)
  api_define_nodesockets(api)
  api_define_shadernode(api) // Node.defineAPI on ShaderNode's struct (not ShaderNode.defineAPI)
  api_define_graph(api) // Graph free struct (nodes list)
  buildCDAPI(api) // customdata element structs — Mesh.defineAPI attaches CustomData by ref, so it must exist first

  // Every participating class populates its own struct via `defineAPI`. The
  // registry replaces the old hand-maintained call list; `defineOnce` runs each
  // exactly once. Iteration order is irrelevant — subclass `defineAPI`s chain
  // their parent (re-declaring its members onto the child struct) rather than
  // copying an already-built parent, so no class depends on another's struct
  // being populated first. The only build-first structs (Graph, VelPan, fetched
  // by reference via api.getStruct) are created in the pre-pass above.
  //
  // Core classes have already self-registered at module scope (they reach the
  // registry as a side-effect of being imported by this module). Only the addon
  // classes still need registering here.
  registerAddonDataAPIClasses()
  for (let cls of getDataAPIRegistry()) {
    defineOnce(api, cls)
  }

  // Class-dependent non-class helpers: these chain/merge from now-populated
  // class structs (e.g. buildProcMeshAPI chains DataBlock.defineAPI), so they
  // must run after the registry pass.
  buildProcTextureAPI(api, api_define_datablock)
  buildProcMeshAPI(api)
  api_define_graphclasses(api)

  /*
  api_define_node_editor(api, cstruct);
  api_define_node_viewer(api, cstruct);
  api_define_mateditor(api);
  api_define_debugeditor(api, cstruct);
  */

  // ── Attach pass ─────────────────────────────────────────────────────────
  // Build the ToolContext tree. This is inherently driver-level: it wires the
  // now-populated class structs (fetched by reference via mapStruct(_, false))
  // under named paths, plus the inline root lists. Previously these attaches
  // were interleaved into the per-subsystem shims.
  cstruct.struct('shadernetwork', 'shadernetwork', 'ShaderNetwork', api.mapStruct(ShaderNetwork, false))
  cstruct.struct('graph', 'graph', 'Graph', api.mapStruct(Graph))
  cstruct.struct('mesh', 'mesh', 'Mesh', api.mapStruct(Mesh, false))

  // Library: keep the dynamic-registration wiring (libraryStruct, read by the
  // onBlockRegister hook) and the parent-level attaches in the driver shim.
  api_define_library(api, cstruct)

  cstruct.struct('screen', 'screen', 'Screen', api.mapStruct(App, false))
  cstruct.struct('scene', 'scene', 'Scene', api.mapStruct(Scene, false))
  cstruct.struct('light', 'light', 'Light', api.mapStruct(Light, false))

  let ostruct = api.mapStruct(SceneObject, false)
  // NOTE: the original passes the SceneObject *class* where struct() types a
  // string uiname; preserved verbatim (the value is only used for display).
  cstruct.struct('object', 'object', SceneObject as unknown as string, ostruct)

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

  buildEditorsAPI(api, cstruct)
  buildToolSysAPI(api, true)

  cstruct.struct('propCache', 'toolDefaults', 'Tool Defaults', api.mapStruct(ToolPropertyCache))

  cstruct.struct('settings', 'settings', 'Settings', api.mapStruct(AppSettings, false))

  _done = true

  return api
}
