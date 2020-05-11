import {util, nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';

import '../potree/potree_resource.js';
import '../potree/potree_types.js';
import '../potree/potree_ops.js';
import {ResourceBrowser} from '../editors/resbrowser/resbrowser.js';
import {resourceManager} from "../core/resource.js";
import '../core/image.js';
import {buildCDAPI} from "../mesh/customdata.js";
import {CameraData} from "../camera/camera.js";
import {Camera} from '../core/webgl.js';

import {makeToolModeEnum, ToolModes, ToolMode} from "../editors/view3d/view3d_toolmode.js";
import {NodeSocketClasses} from "../core/graph.js";

import '../mesh/mesh_createops.js';

import {CurveSpline} from "../curve/curve.js";

let STRUCT = nstructjs.STRUCT;
import '../editors/view3d/widget_tools.js'; //ensure widget tools are all registered
import {WidgetTool, WidgetFlags} from '../editors/view3d/widgets.js';
import {AddLightOp} from "../light/light_ops.js";
import {Light} from '../light/light.js';
import {SideBarEditor} from "../editors/sidebar/SideBarEditor.js";
import {DataAPI, DataPathError} from '../path.ux/scripts/controller/simple_controller.js';
import {DataBlock, DataRef, Library, BlockSet, BlockFlags} from '../core/lib_api.js'
import {View3D} from '../editors/view3d/view3d.js';
import {View3DFlags, CameraModes} from '../editors/view3d/view3d_base.js';
import {Editor, App} from '../editors/editor_base.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {NodeViewer} from '../editors/node/NodeEditor_debug.js';
import {MenuBarEditor} from "../editors/menu/MainMenu.js";
import {RGBASocket, Vec4Socket, Vec2Socket, Vec3Socket, FloatSocket} from "../core/graphsockets.js";
import {VelPan, VelPanFlags} from '../editors/velpan.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {ToolContext} from '../core/context.js';
import {MeshModifierFlags, MeshFlags, MeshTypes, MeshDrawFlags, MeshFeatures} from '../mesh/mesh_base.js';
import {Mesh} from '../mesh/mesh.js';
import {Vertex, Edge, Element, Loop, Face, Handle} from '../mesh/mesh_types.js';
import {ShaderNetwork} from '../shadernodes/shadernetwork.js';
import {Material} from '../core/material.js';
import '../shadernodes/allnodes.js';
import {ShaderNode} from '../shadernodes/shader_nodes.js';
import {Graph, Node, SocketFlags, NodeFlags, NodeSocketType} from '../core/graph.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {SelectOneOp} from '../sceneobject/selectops.js';
import {DeleteObjectOp} from '../sceneobject/sceneobject_ops.js';
import {Scene, EnvLight, EnvLightFlags} from "../scene/scene.js";
import {api_define_graphclasses} from '../core/graph_class.js';
import {DisplayModes} from '../editors/debug/DebugEditor_base.js';
import {DebugEditor} from '../editors/debug/DebugEditor.js';

let api = new DataAPI();
import {Icons} from '../editors/icon_enum.js';
import {SceneObjectData} from "../sceneobject/sceneobject_base.js";
import {PointSet} from "../potree/potree_types.js";

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

export function api_define_resbrowser(api, pstruct) {
  let rstruct = api_define_editor(api, ResourceBrowser);

  let types = resourceManager.makeEnum();

  function rebuild() {
    let resbrowser = this.dataref;

    if (resbrowser !== undefined) {
      resbrowser.rebuild();
    }
  }

  pstruct.struct("resbrowser", "resbrowser", "Resource Browser", rstruct);

  let prop = rstruct.enum("resourceType", "resourceType", types, "Mode");
  prop.on("change", rebuild);

  return rstruct;
}

export function api_define_view3d(api, pstruct) {
  let vstruct = api_define_editor(api, View3D);

  vstruct.float("subViewPortSize", "subViewPortSize", "View Size").range(1, 2048);
  vstruct.vec2("subViewPortPos", "subViewPortPos", "View Pos").range(1, 2048);

  let SelModes = {
    VERTEX : SelMask.VERTEX,
    EDGE   : SelMask.EDGE,
    FACE   : SelMask.FACE,
    OBJECT : SelMask.OBJECT
  };

  pstruct.struct("view3d", "view3d", "Viewport", vstruct);
  let def = vstruct.enum("selectmode", "selectmode", SelModes, "Selection Mode", "Selection Mode");

  def.icons({
    VERTEX : Icons.VERT_MODE,
    EDGE   : Icons.EDGE_MODE,
    FACE   : Icons.FACE_MODE,
    OBJECT : Icons.CIRCLE_SEL
  });

  function onchange() {
    window.redraw_viewport();
  }

  vstruct.flags("flag", "flag", View3DFlags, "View3D Flags").on("change", onchange).icons({
    SHOW_RENDER : Icons.RENDER,
    SHOW_GRID : Icons.SHOW_GRID
  });

  vstruct.enum("cameraMode", "cameraMode", CameraModes, "Camera Modes").on("change", onchange).icons({
    PERSPECTIVE : Icons.PERSPECTIVE,
    ORTHOGRAPHIC : Icons.ORTHOGRAPHIC
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

  let def = dstruct.flags("lib_flag", "flag", BlockFlags, "Flag");

  def.icons({
    FAKE_USER : Icons.FAKE_USER
  });

  def.on('change', function (newval, oldval) {
    let owner = this.dataref;
    console.log("Fake user change", newval, oldval);

    if (newval == oldval) {
      return;
    }

    if (newval) {
      owner.lib_users++;
    } else {
      owner.lib_users--;
    }
  });

  def.descriptions({
    FAKE_USER : "Protect against auto delete"
  });

  dstruct.string("name", "name", "name");

  return dstruct;
}

export function api_define_meshelem(api) {
  let st = api.mapStruct(Element, true);

  st.flags("flag", "flag", MeshFlags);
  st.flags("type", "type", MeshTypes).read_only();
  st.int("eid", "id", "ID", "ID").read_only();

  buildCDAPI(api, st);
}

export function api_define_meshvertex(api) {
  let st = api.inheritStruct(Vertex, Element);
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

  api_define_meshelem(api);
  api_define_meshvertex(api);

  mstruct.list("verts", "verts", [
    function getIter(api, list) {
      return list;
    },
    function getLength(api, list) {
      return list.length;
    },
    function get(api, list, key) {
      return list.local_eidmap[key];
    },
    function getKey(api, list, obj) {
      return obj !== undefined ? obj.eid : -1;
    },
    function getActive(api, list) {
      return list.active;
    },
    function setActive(api, list, key) {
      list.active = key !== undefined ? list.local_eidmap[key] : undefined;
      window.redraw_viewport();
    },
    function getStruct(api, list, key) {
      return api.mapStruct(Vertex, false);
    }
  ]);

  //MeshModifierFlags
}

export function api_define_curvespline(api) {
  let cstruct = api.inheritStruct(CurveSpline, Mesh);

  cstruct.bool("isClosed", "isClosed", "Closed Curve").on("change", function() {
    this.dataref.checkUpdate();
    this.dataref.regenRender();
  });

  return cstruct;
}

function api_define_shadernode(api, cls) {
  let nstruct = api_define_node(api, ShaderNode);

  return nstruct;
}

export function api_define_camera(api) {
  let cstruct = api.mapStruct(Camera, true);

  let onchange = function() {
    window.redraw_viewport();
  }

  cstruct.bool("isPerspective", "isPerspective", "Perspective or Orthographic").on('change', onchange);
  cstruct.vec3("pos", "pos", "Position").on('change', onchange);
  cstruct.vec3("target", "target", "Target").on('change', onchange);
  cstruct.vec3("up", "up", "Up").on('change', function () {
    let up = this.dataref;

    console.log("up changed");

    if (up !== undefined) {
      up.normalize();
    }

    window.redraw_viewport();
  })

  cstruct.float("near", "near", "Near Clipping Plane").range(0.00001, 100).on('change', onchange).rollerSlider();
  cstruct.float("far", "far", "Far Clipping Plane").range(0.00001, 100000000).on('change', onchange).rollerSlider();
  cstruct.float("aspect", "aspect", "Aspect").range(0.001, 4.0);
  cstruct.float("fovy", "fov", "Field of View").range(0.01, 110.0).baseUnit("degree").on('change', onchange);
}


export function api_define_cameradata(api) {
  let mstruct = api_define_datablock(api, CameraData);

  let onchange = function () {
    let camera = this.dataref;

    camera.update();
  };

  mstruct.struct("camera", "camera", "Camera", api.mapStruct(Camera, false));
  mstruct.struct("finalCamera", "finalCamera", "finalCamera", api.mapStruct(Camera, false));
  mstruct.float("speed", "speed", "Anim Speed").range(0.00001, 100.0);
  mstruct.float("height", "height", "Height").range(-100, 100.0).on("change", onchange);

  mstruct.bool("flipped", "flipped", "Flipped").on("change", onchange);
  mstruct.bool("pathFlipped", "pathFlipped", "Flip Path").on("change", onchange);

  mstruct.float("azimuth", "azimuth", "Azimuth").on("change", onchange).range(-Math.PI, Math.PI).displayUnit("degree").baseUnit("radian");

  mstruct.float("rotate", "rotate", "Rotation").range(-Math.PI, Math.PI).displayUnit("degree").baseUnit("radian");

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

function api_define_nodesockets(api) {
  for (let cls of NodeSocketClasses) {
    api_define_socket(api, cls);
  }
}

function api_define_nodes(api) {

}

function api_define_shadernetwork(api, parent) {
  let mstruct = api_define_datablock(api, ShaderNetwork);

  parent.struct("shadernetwork", "shadernetwork", "ShaderNetwork", mstruct);

  mstruct.struct("graph", "graph", "Shader Graph", api.getStruct(Graph));

  return mstruct;
}

function api_define_material(api) {
  let mstruct = api_define_datablock(api, Material);

  let redraw = (e) => {
    window.redraw_viewport();
  }

  mstruct.int("pointSize", "pointSize", "Size", "Point Size").range(1, 6).on('change', redraw);
  mstruct.enum("pointShape", "pointShape", Potree.PointShape, "Shape", "Point Shape").on('change', redraw);
  mstruct.enum("pointSizeType", "pointSizeType", Potree.PointSizeType, "Mode").on('change', redraw);
  mstruct.float("quality", "quality", "Quality", "Quality").range(0.001, 1.0).on('change', redraw);

  return mstruct;
}

function api_define_sceneobject(api, parent) {
  let ostruct = api_define_datablock(api, SceneObject);

  parent.struct("object", "object", SceneObject, ostruct);

  ostruct.dynamicStruct("data", "data", "data");
  ostruct.struct("material", "material", "Material", api.mapStruct(Material, false));

  return ostruct;
}

function api_define_pointset(api, ctxStruct) {
  let pstruct = api_define_datablock(api, PointSet);

  pstruct.struct("material", "material", "Material", api.mapStruct(Material, false));

  ctxStruct.struct("pointset", "pointset", "Point Set", pstruct);
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

export function api_define_debugeditor(api, parent) {
  let dedstruct = api_define_editor(api, DebugEditor);

  let redrawDebug = function() {
    let editor = this.dataref;

    editor._redraw();
  }

  parent.struct("debugEditor", "debugEditor", "Debug Editor", dedstruct);
  let edef = dedstruct.enum("displayMode", "displayMode", DisplayModes);

  edef.icons({
    RAW : Icons.VIEW_RAW,
    NORMAL : Icons.VIEW_NORMALS,
    DEPTH : Icons.VIEW_DEPTH,
    ALPHA : Icons.VIEW_ALPHA
  });

  edef.on("change", redrawDebug);
}

export function api_define_node_editor(api, parent) {
  let nedstruct = api_define_editor(api, NodeEditor);

  parent.struct("nodeEditor", "nodeEditor", "Node Editor", nedstruct);
  nedstruct.string("graphPath", "graphPath", "data path to graph that's being edited");
  nedstruct.struct("velpan", "velpan", "Pan / Zoom", api.getStruct(VelPan));
}

export function api_define_node_viewer(api, parent) {
  let nedstruct = api_define_editor(api, NodeViewer);

  parent.struct("nodeViewer", "nodeViewer", "Node Viewer", nedstruct);
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

export function api_define_light(api, pstruct) {
  let lstruct = api_define_datablock(api, Light);

  let onchange = () => {
    window.redraw_viewport();
  };

  pstruct.struct("light", "light", "Light", lstruct);
}

export function api_define_scene(api, pstruct) {
  let sstruct = api_define_datablock(api, Scene);

  pstruct.struct("scene", "scene", "Scene", sstruct);

  sstruct.struct("envlight", "envlight", "Ambient Light", api_define_envlight(api));

  let prop = makeToolModeEnum();

  let def = sstruct.enum("toolmode_i", "toolmode", prop, "ToolMode", "ToolMode");
  def.on('change', function(newval, oldval) {
    let scene = this.dataref;

    console.log("toolmode change", oldval, newval);

    scene.toolmode_i = oldval;
    scene.switchToolMode(newval);
    window.redraw_viewport();
  });

  let onchange = function(newval, oldval) {
    let scene = this.dataref;

    scene.updateWidgets();
    window.redraw_viewport();
  };

  prop = WidgetTool.getToolEnum();
  def = sstruct.enum("widgettool", "active_tool", prop.values, "Active Tool", "Currently active tool widget");
  def.setProp(prop);
  def.on("change", onchange);

  let base = ToolMode.defineAPI(api);
  sstruct.dynamicStruct("toolmode", "tool", "Active Tool", base);

  //vstruct.dynamicStruct("toolmode_namemap", "toolmodes", "ToolModes");
  let struct2 = sstruct.struct("toolmode_namemap", "tools", "Saved Tool Data");
  struct2.name = "ToolModes";

  for (let cls of ToolModes) {
    let def = cls.widgetDefine();

    let struct3 = cls.defineAPI(api);

    if (struct3 === undefined) {
      throw new Error("ToolMode.defineAPI cannot return undefined");
    }

    struct2.struct(def.name, def.name, def.uiname, struct3);
  }
}

export function getDataAPI() {
  let cstruct = api.mapStruct(ToolContext);

  api_define_velpan(api);
  api_define_nodesockets(api);

  api_define_socket(api);
  api_define_vec2_socket(api);
  api_define_vec3_socket(api);
  api_define_vec4_socket(api);
  api_define_rgba_socket(api);
  api_define_float_socket(api);

  api_define_material(api, cstruct);

  api_define_node(api);
  api_define_shadernode(api);
  api_define_graph(api);

  cstruct.struct("graph", "graph", "Graph", api.mapStruct(Graph));

  api_define_datablock(api, DataBlock);

  api_define_view3d(api, cstruct);
  api_define_resbrowser(api, cstruct);
  api_define_node_editor(api, cstruct);
  api_define_node_viewer(api, cstruct);
  api_define_debugeditor(api, cstruct);

  api_define_pointset(api, cstruct);
  api_define_mesh(api, cstruct);
  api_define_shadernetwork(api, cstruct);

  api_define_library(api, cstruct);
  api_define_editor(api, Editor);
  api_define_screen(api, cstruct);
  api_define_curvespline(api);
  api_define_camera(api);
  api_define_cameradata(api);
  api_define_scene(api, cstruct);
  api_define_light(api, cstruct);

  let ostruct = api_define_sceneobject(api, cstruct);

  api_define_nodes(api);

  cstruct.list("", "objects", [
    function getIter(api, list) {
      return (function*() {
        for (let ob of list.datalib.object) {
          yield ob;
        }
      })();
    },
    function getLength(api, list) {
      return list.datalib.object.length;
    },
    function get(api, list, key) {
      return list.datalib.get(key);
    },
    function getKey(api, list, obj) {
      return obj.lib_id;
    },
    function getStruct(api, list, key) {
      return ostruct;
    }
  ]);
  api.setRoot(cstruct);

  cstruct.list("", "datablocks", [
    function getIter(api, list) {
      return list.datalib.allBlocks;
    },
    function getLength(api, list) {
      let len = 0;
      for (let block of list.datalib.allBlocks) {
        len++;
      }
      return len;
    },
    function get(api, list, key) {
      return list.datalib.get(key);
    },
    function getKey(api, list, obj) {
      return obj.lib_id;
    },
    function getStruct(api, list, key) {
      console.log(list.datalib.get(key).constructor);
      return api.mapStruct(list.datalib.get(key).constructor, false);
    }
  ]);

  api_define_graphclasses(api);

  cstruct.dynamicStruct("last_tool", "last_tool", "Last Tool");

  return api;
}
