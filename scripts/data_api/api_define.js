import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import '../editors/view3d/widget_tools.js'; //ensure widget tools are all registered
import {WidgetTool, WidgetFlags} from '../editors/view3d/widgets.js';
import {AddLightOp} from "../light/light_ops.js";
import {Light} from '../light/light.js';
import {PropsEditor} from "../editors/properties/PropsEditor.js";
import {DataAPI, DataPathError} from '../path.ux/scripts/simple_controller.js';
import {DataBlock, DataRef, Library, BlockSet, BlockFlags} from '../core/lib_api.js'
import * as toolprop from '../path.ux/scripts/toolprop.js';
import {View3D} from '../editors/view3d/view3d.js';
import {View3DFlags} from '../editors/view3d/view3d_base.js';
import {Editor, App} from '../editors/editor_base.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {RGBASocket, Vec4Socket, Vec2Socket, Vec3Socket, FloatSocket} from "../core/graphsockets.js";
import {VelPan, VelPanFlags} from '../editors/velpan.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Context} from '../core/context.js';
import {MeshModifierFlags, MeshFlags} from '../mesh/mesh_base.js';
import {Mesh} from '../mesh/mesh.js';
import {Vertex, Edge, Loop, Face} from '../mesh/mesh_types.js';
import {ShaderNetwork} from '../core/material.js';
import '../shadernodes/allnodes.js';
import {ShaderNode} from '../shadernodes/shader_nodes.js';
import {Graph, Node, SocketFlags, NodeFlags, NodeSocketType} from '../core/graph.js';
import {SelectOneOp} from '../sceneobject/selectops.js';
import {Scene, EnvLight, EnvLightFlags} from "../core/scene.js";
import {api_define_graphclasses} from '../core/graph_class.js';

let api = new DataAPI();
import {Icons} from '../editors/icon_enum.js';

export function api_define_editor(api, cls) {
  let astruct = api.mapStruct(cls);

  astruct.vec2("pos", "pos", "Position", "Position of editor in window");
  astruct.vec2("size", "size", "Size", "Size of editor");
  astruct.string("type", "type", "Type", "Editor type").customGetSet(function() {
    let obj = this.dataref;

    return obj.constructor.define().areaname;
  });

  return astruct;
}
export function api_define_view3d(api, pstruct) {
  let vstruct = api_define_editor(api, View3D);
  
  pstruct.struct("view3d", "view3d", "Viewport", vstruct);
  let def = vstruct.enum("selectmode", "selectmode", SelMask, "Selection Mode", "Selection Mode");

  def.icons({
    VERTEX : Icons.VERT_MODE,
    EDGE   : Icons.EDGE_MODE,
    FACE   : Icons.FACE_MODE,
    OBJECT : Icons.CIRCLE_SEL
  });

  function onchange() {
    window.redraw_viewport();
  }

  let prop = WidgetTool.getToolEnum();
  def = vstruct.enum("widgettool", "active_tool", prop.values, "Active Tool", "Currently active tool widget");
  def.setProp(prop);
  def.on("change", onchange);

  vstruct.flags("flag", "flag", View3DFlags).on("change", onchange).icons({
    SHOW_RENDER : Icons.RENDER
  });
}

function api_define_socket(api, cls=NodeSocketType) {
  let nstruct = api.mapStruct(cls, true);

  nstruct.flags("graph_flag", "graph_flag", SocketFlags, "Flag", "Flags");
  nstruct.int("graph_id", "graph_id", "Graph ID", "Unique graph ID").read_only();
  nstruct.string("name", "name", "Name", "Name of socket");
  nstruct.string("uiname", "uiname", "UI Name", "Name of socket");

  return nstruct;
}

function api_define_vec2_socket(api) {
  let nstruct = api_define_socket(api, Vec2Socket);
  nstruct.vec2("value", "value", "Color", "Color");
}

function api_define_vec3_socket(api) {
  let nstruct = api_define_socket(api, Vec3Socket);
  nstruct.vec3("value", "value", "Color", "Color");
}

function api_define_vec4_socket(api) {
  let nstruct = api_define_socket(api, Vec4Socket);
  nstruct.vec4("value", "value", "Color", "Color");
}

function api_define_rgba_socket(api) {
  let nstruct = api_define_socket(api, RGBASocket);
  nstruct.color4("value", "value", "Color", "Color");
}

function api_define_float_socket(api) {
  let nstruct = api_define_socket(api, FloatSocket);
  nstruct.float("value", "value", "value", "value");
}

function api_define_node(api, cls=Node) {
  let nstruct = api.mapStruct(cls, true);

  nstruct.flags("graph_flag", "graph_flag", NodeFlags, "Flag", "Flags");
  nstruct.int("graph_id", "graph_id", "Graph ID", "Unique graph ID").read_only();

  function defineSockets(inorouts) {
    nstruct.list("", inorouts, [
      function getIter(api, list) {
        return (function*() {
          for (let k in list[inorouts]) {
            yield list[inorouts][k];
          }
        })();
      },
      function getLength(api, list) {
        return Object.keys(list[inorouts]).length;
      },
      function get(api, list, key) {
        return list[inorouts][key];
      },
      function getKey(api, list, obj) {
        for (let k in list[inorouts]) {
          if (list[inorouts][k] === obj)
            return k;
        }
      },
      function getStruct(api, list, key) {
        let obj = list[inorouts][key];

        if (obj === undefined)
          return api.getStruct(NodeSocketType);

        let ret = api.getStruct(obj.constructor);
        return ret === undefined ? api.getStruct(NodeSocketType) : ret;
      }
    ]);
  }

  defineSockets("inputs");
  defineSockets("outputs");

  return nstruct;
}

function api_define_datablock(api, cls=DataBlock) {
  let dstruct = api_define_node(api, cls);

  dstruct.int("lib_id", "lib_id", "Lib ID").read_only();
  dstruct.string("name", "name", "name");

  return dstruct;
}

export function api_define_mesh(api, pstruct) {
  let mstruct = api_define_datablock(api, Mesh);
  pstruct.struct("mesh", "mesh", "Mesh", mstruct);

  let def = mstruct.flags("flag", "flag", MeshModifierFlags, "Modifier Flag", "Mesh modifier flags");
  def.icons({
    SUBSURF : Icons.SUBSURF
  });

  def.on("change", (e) => {
    window.redraw_viewport();
  });
  //MeshModifierFlags
}


function api_define_shadernode(api, cls) {
  let nstruct = api_define_node(api, ShaderNode);

  return nstruct;
}

function api_define_graph(api, cls=Graph) {
  let gstruct = api.mapStruct(cls);

  gstruct.list("", "nodes", [
    function getIter(api, list) {
      return list.nodes;
    },
    function getLength(api, list) {
      return list.nodes.length;
    },
    function get(api, list, key) {
      return list.node_idmap[key];
    },
    function getKey(api, list, obj) {
      return obj.graph_id;
    },
    function getActive(api, list) {
      return list.nodes.active;
    },
    function setActive(api, list, key) {
      list.nodes.active = list.node_idmap[key];
    },
    function getStruct(api, list, key) {
      let obj = list.node_idmap[key];

      if (obj === undefined)
        return api.getStruct(Node);

      let ret = api.getStruct(obj.constructor);
      return ret === undefined ? api.getStruct(Node) : ret;
    }
  ]);

  return gstruct;
}

function api_define_material(api, parent) {
  let mstruct = api_define_datablock(api, ShaderNetwork);

  parent.struct("material", "material", "ShaderNetwork", mstruct);

  mstruct.struct("graph", "graph", "Shader Graph", api.getStruct(Graph));
}

function api_define_libraryset(api, path, apiname, uiname, parent, cls) {
  //let lstruct = api.mapStruct(BlockSet, true);
  //parent.struct(path, apiname, uiname, lstruct);
  parent.list(path, apiname, [
    function get(api, list, key) {
      return list.idmap[key];
    },

    function getIter(api, list) {
      return list;
    },

    function getLength(api, list) {
      return list.length;
    },

    function getActive(api, list) {
      return list.active;
    },

    function setActive(api, list, key) {
      if (key === undefined || key == -1) {
        list.active = undefined;
        return;
      }

      let obj = list.idmap[key];
      if (obj === undefined) {
        throw new DataPathError("unknown datablock key " + key + ".");
      }

      list.obj = obj;
    },
    function getKey(api, list, obj) {
      return obj.lib_id;
    },
    function getStruct(api, list, key) {
      let obj = list.idmap[key];

      if (obj === undefined) {
        return api.getStruct(DataBlock);
      }

      let ret = api.getStruct(obj.constructor);

      if (ret === undefined) {
        return api.getStruct(DataBlock);
      }
    }
  ]);
}

function api_define_library(api, parent) {
  let lstruct = api.mapStruct(Library);

  parent.struct("datalib", "library", "Library", lstruct);
  api_define_libraryset(api, "shadernetwork", "materials", "Materials", lstruct, ShaderNetwork);
}

export function api_define_velpan(api, parent) {
  let vp = api.mapStruct(VelPan);

  vp.vec2("pos", "pos", "Position");
  vp.vec2("scale", "scale", "Scale");
  vp.vec2("min", "min", "Boundary Minimum");
  vp.vec2("max", "max", "Boundary Maximum");

  return vp;
}

export function api_define_node_editor(api, parent) {
  let nedstruct = api_define_editor(api, NodeEditor);

  parent.struct("nodeEditor", "nodeEditor", "Node Editor", nedstruct);
  nedstruct.string("graphPath", "graphPath", "data path to graph that's being edited");
  nedstruct.struct("velpan", "velpan", "Pan / Zoom", api.getStruct(VelPan));
}

export function api_define_screen(api, parent) {
  let st = api.mapStruct(App);

  parent.struct("screen", "screen", "Screen", st);

  st.list("sareas", "editors", [
    //list should be main App (Screen) instance
    function get(api, list, key) {
      return list[key].area;
    },

    function getKey(api, list, obj) {
      console.log(arguments);
      for (let i=0; i<list.length; i++) {
        if (list[i].area === obj) {
          return i;
        }
      }
    },

    function getLength(api, list) {
      return list.length;
    },

    function getIter(api, list) {
      return (function *() {
        for (let sarea of list) {
          yield sarea.area;
        }
      })();
    },

    function getStruct(api, list, key) {
      let obj = list[key];
      if (obj === undefined) return api.getStruct(Editor);
      obj = obj.area;

      let ret = api.getStruct(obj.constructor);
      ret = ret === undefined ? api.getStruct(Editor) : ret;

      return ret;
    },

    function getActive(api, list) {
      return Editor.getActiveArea();
    }
  ]);
}

export function api_define_envlight(api) {
  let estruct = api.mapStruct(EnvLight);

  let onchange = () => {
    window.redraw_viewport();
  }

  estruct.color3("color", "color", "Color", "Ambient light color").on("change", onchange);
  estruct.float("power", "power", "Power", "Power of ambient light power").on("change", onchange);
  estruct.flags("flag", "flag", EnvLightFlags, "flag", "Ambient light flags").on("change", onchange);
  estruct.float("ao_dist", "ao_dist", "Distance").on("change", onchange);
  estruct.float("ao_fac", "ao_fac", "Factor").on("change", onchange);

  return estruct;
}

export function api_define_scene(api, pstruct) {
  let sstruct = api_define_datablock(api, Scene);

  pstruct.struct("scene", "scene", "Scene", sstruct);
  sstruct.struct("envlight", "envlight", "Ambient Light", api_define_envlight(api));
}

export function getDataAPI() {
  let cstruct = api.mapStruct(Context);

  api_define_velpan(api);

  api_define_socket(api);
  api_define_vec2_socket(api);
  api_define_vec3_socket(api);
  api_define_vec4_socket(api);
  api_define_rgba_socket(api);
  api_define_float_socket(api);

  api_define_node(api);
  api_define_shadernode(api);
  api_define_graph(api);

  api_define_datablock(api, DataBlock);

  api_define_view3d(api, cstruct);
  api_define_node_editor(api, cstruct);

  api_define_mesh(api, cstruct);
  api_define_material(api, cstruct);

  api_define_library(api, cstruct);
  api_define_editor(api, Editor);
  api_define_screen(api, cstruct);
  api_define_scene(api, cstruct);

  api.setRoot(cstruct);

  api_define_graphclasses(api);

  return api;
}
