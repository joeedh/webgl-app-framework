import {
  nstructjs, util, ToolOp, vectormath, math,
  ToolProperty, IntProperty, FloatProperty, EnumProperty,
  FlagProperty, StringProperty, BoolProperty, Vec2Property,
  Vec3Property, Vec4Property, Mat4Property, KeyMap, HotKey
} from '../path.ux/scripts/pathux.js';
import * as pathux from '../path.ux/scripts/pathux.js';
import * as mesh from '../mesh/mesh.js';
import * as mesh_utils from '../mesh/mesh_utils.js';
import * as unwrapping from '../mesh/unwrapping.js';
import {ParamizeModes} from '../mesh/mesh_paramizer.js';
import {SmoothMemoizer} from '../mesh/mesh_displacement.js';
import {KDrawModes} from '../mesh/mesh_curvature_test.js';
import {DataBlock, DataRef, DataRefProperty, DataRefListProperty} from '../core/lib_api.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';
import {ToolMode} from '../editors/view3d/view3d_toolmode.js';
import {SceneObject, ObjectFlags, composeObjectMatrix} from '../sceneobject/sceneobject.js';
import {CustomDataElem} from '../mesh/customdata.js';
import {
  Editor, VelPan, VelPanFlags, DataBlockBrowser, DirectionChooser, EditorSideBar, makeDataBlockBrowser,
  MeshMaterialChooser, MeshMaterialPanel, NewDataBlockOp, getContextArea
} from '../editors/editor_base.js';
import {Icons} from '../editors/icon_enum.js';
import {MeshToolBase} from '../editors/view3d/tools/meshtool.js';
import {MeshEditor} from '../editors/view3d/tools/mesheditor.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {MeshOp, MeshDeformOp} from '../mesh/mesh_ops_base.js';
import {MeshOpBaseUV} from '../mesh/mesh_uvops_base.js';
import {TransformOp} from '../editors/view3d/transform/transform_ops.js';
import * as widget_tools from '../editors/view3d/widgets/widget_tools.js';
import * as widgets from '../editors/view3d/widgets/widgets.js';
import * as simplemesh from '../core/simplemesh.ts';
import * as paramizer from '../mesh/mesh_paramizer.js';
import * as displacement from '../mesh/mesh_displacement.js';
import * as curvature from '../mesh/mesh_curvature.js';
import * as curvature_test from '../mesh/mesh_curvature_test.js';
import * as utils from '../mesh/mesh_utils.js';
import * as subdivide from '../mesh/mesh_subdivide.js';
import * as bvh from '../util/bvh.js';
import * as bezier from '../util/bezier.js';
import * as shaders from '../shaders/shaders.js';
import {CubicPatch} from '../subsurf/subsurf_patch.js';
import * as graph from '../core/graph.js';
import * as graphsockets from '../core/graphsockets.js';

export class AddonAPI {
  constructor(ctx) {
    this.nstructjs = nstructjs;
    this.util = util;
    this.vectormath = vectormath;
    this.math = math;
    this.simplemesh = simplemesh;
    this.pathux = pathux;
    this.mesh_utils = mesh_utils;
    this.unwrapping = unwrapping;
    this.sceneobject = {
      SceneObjectData, SceneObject, composeObjectMatrix
    };

    this.subsurf = {CubicPatch}

    this.mesh = {
      CustomDataElem, paramizer, displacement, curvature,
      curvature_test, utils, subdivide, KDrawModes,
      SmoothMemoizer, ParamizeModes
    };

    for (let k in mesh) {
      this.mesh[k] = mesh[k];
    }

    this.KeyMap = KeyMap;
    this.HotKey = HotKey;
    this.shaders = shaders;

    this.bvh = bvh;
    this.bezier = bezier;

    this.Icons = Icons; //icon_enum = {Icons};
    this.SelMask = SelMask;

    this.editor = {
      Editor, VelPan, VelPanFlags, DataBlockBrowser, DirectionChooser, EditorSideBar, makeDataBlockBrowser,
      MeshMaterialChooser, MeshMaterialPanel, NewDataBlockOp, getContextArea
    };

    this.widget3d = {};
    for (let k in widgets) {
      this.widget3d[k] = widgets[k];
    }
    for (let k in widget_tools) {
      this.widget3d[k] = widget_tools[k];
    }

    this.toolmode = {
      ToolMode, MeshToolBase, MeshEditor
    };

    this.toolop = {
      ToolOp, ToolProperty, IntProperty, FloatProperty, StringProperty,
      EnumProperty, FlagProperty, Vec2Property, Vec3Property, Vec4Property,
      Mat4Property, DataRefProperty, DataRefListProperty,
      MeshOp, MeshDeformOp, MeshOpBaseUV, TransformOp, BoolProperty
    };

    let this2 = this;

    const {Node, Graph, NodeSocketType} = graph;

    this.graph = {
      Node, Graph, NodeSocketType
    }

    for (let k in graphsockets) {
      this.graph[k] = graphsockets[k];
    }

    //reference back to addon
    this.addon = undefined;

    this.classes = {};
    this.classes.dataBlockClasses = [];
    this.classes.toolOpClasses = [];
    this.classes.structClasses = [];
    this.classes.toolModeClasses = [];
    this.classes.sceneObjectDataClasses = [];
    this.classes.customDataClasses = [];
    this.classes.editorClasses = [];
    this.classes.other = [];

    this._graphNodes = new Set();

    let dblock = class DataBlockSub extends DataBlock {
      static register(cls) {
        let ret = super.register(cls);
        this2.classes.dataBlockClasses.push(cls);

        return ret;
      }
    }
    this.lib_api = {
      DataBlock: dblock, DataRef, DataRefProperty, DataRefListProperty
    };
  }

  get argv() {
    return _appstate.arguments;
  }

  get ctx() {
    return _appstate.ctx;
  }

  register(cls) {
    if (!nstructjs.isRegistered(cls)) {
      nstructjs.register(cls);
    }

    function subclassOf(cls2) {
      let p = cls;
      while (p && p !== p.__proto__) {
        if (p === cls2 || p.constructor === cls2) {
          return true;
        }
        p = p.__proto__;
      }
    }

    let addToOther = true;

    if (subclassOf(ToolOp)) {
      //ensure tooldef doesn't raise any errors
      cls.tooldef();

      this.classes.toolOpClasses.push(cls);
      ToolOp.register(cls);
      addToOther = false;
    }

    if (subclassOf(DataBlock)) {
      this.classes.dataBlockClasses.push(cls);
      DataBlock.register(cls);
      addToOther = false;
    }

    if (subclassOf(ToolMode)) {
      this.classes.toolModeClasses.push(cls);
      ToolMode.register(cls);
      addToOther = false;

      if (window._appstate) {
        cls.defineAPI(_appstate.api);
      } else {
        let cb = () => {
          if (!window._appstate) {
            window.setTimeout(cb, 5);
            return;
          }

          cls.defineAPI(_appstate.api);
        }

        window.setTimeout(cb);
      }
    }

    if (subclassOf(CustomDataElem)) {
      this.classes.customDataClasses.push(cls);
      CustomDataElem.register(cls);
      addToOther = false;
    }

    if (subclassOf(Editor)) {
      this.classes.editorClasses.push(cls);
      Editor.register(cls);
      addToOther = false;
    }

    if (subclassOf(SceneObjectData)) {
      SceneObjectData.register(cls);
      this.classes.sceneObjectDataClasses.push(cls);
      addToOther = false;
    }

    if (addToOther) {
      this.classes.other.push(cls);
    }
  }

  graphConnect(src, output, dst, input) {
    let graph = this.ctx.graph;

    if (src.graph_id < 0) {
      console.warn("Auto-adding node to dependency graph");
      graph.add(src);
      this._graphNodes.add(src.graph_id);
    }

    if (dst.graph_id < 0) {
      console.warn("Auto-adding node to dependency graph");
      graph.add(dst);
      this._graphNodes.add(dst.graph_id);
    }

    if (typeof output === "string") {
      output = src.outputs[output];
    }
    if (typeof input === "string") {
      input = dst.inputs[input];
    }

    output.connect(input);
  }

  onNewFilePost() {

  }

  onNewFilePre() {
    this._graphNodes = [];
  }

  graphAdd(node) {
    this.ctx.graph.add(node);
    this._graphNodes.add(node.graph_id);
  }

  graphRemove(node) {
    let id = node.graph_id;

    this.ctx.graph.remove(node);
    this._graphNodes.delete(id);
  }

  unregister(cls) {
    if (!cls) {
      console.error("unregister called with no arguments");
      return;
    }
    console.log("unregistered", cls.name);

    //do not unregister with nstructjs
    //if (nstructjs.isRegistered(cls)) {
    //console.log("unregister with nstructjs!", cls);
    //nstructjs.unregister(cls);
    //}

    function subclassof(a, b) {
      while (a && a !== Object.__proto__) {
        if (a === b) {
          return true;
        }
        a = a.__proto__;
      }

      return false;
    }

    if (subclassof(cls, ToolMode)) {
      console.log("unregistering a toolmode", cls);

      ToolMode.unregister(cls);
    }

    if (subclassof(cls, ToolOp)) {
      ToolOp.unregister(cls);
    }

    if (subclassof(cls, DataBlock)) {
      DataBlock.unregister(cls);
    }

    if (subclassof(cls, SceneObjectData)) {
      SceneObjectData.unregister(cls);
    }

    if (subclassof(cls, Editor)) {
      Editor.unregister(cls);
    }
  }

  unregisterAll() {
    let graph;

    if (window._appstate) {
      graph = this.ctx.graph;
    }

    for (let id of this._graphNodes) {
      let n;

      if (!graph) {
        break;
      }

      try {
        n = graph.node_idmap[id];

        if (n) {
          graph.remove(n);
        }

      } catch (error) {
        console.error(error.stack);
        console.error(error.message);
        console.error("Failed to remove a graph node!", id, n);
      }
    }

    for (let k in this.classes) {
      for (let cls of this.classes[k]) {
        this.unregister(cls);
      }
    }

    return this;
  }
}
