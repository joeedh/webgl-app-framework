import {nstructjs, util, ToolOp, vectormath, math} from '../path.ux/scripts/pathux.js';
import * as pathux from '../path.ux/scripts/pathux.js';
import * as mesh from '../mesh/mesh.js';
import * as mesh_utils from '../mesh/mesh_utils.js';
import * as unwrapping from '../mesh/unwrapping.js';

import {DataBlock, DataRef, DataRefProperty, DataRefListProperty} from '../core/lib_api.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';
import {ToolMode} from '../editors/view3d/view3d_toolmode.js';
import {SceneObject, ObjectFlags, composeObjectMatrix} from '../sceneobject/sceneobject.js';
import {CustomDataElem} from '../mesh/customdata.js';
import {Editor, VelPan, VelPanFlags, DataBlockBrowser, DirectionChooser, EditorSideBar, makeDataBlockBrowser,
  MeshMaterialChooser, MeshMaterialPanel, NewDataBlockOp, getContextArea} from '../editors/editor_base.js';
import {Icons} from '../editors/icon_enum.js';

export class AddonAPI {
  constructor(ctx) {
    this.nstructjs = nstructjs;
    this.util = util;
    this.vectormath = vectormath;
    this.math = math;
    this.pathux = pathux;
    this.mesh_utils = mesh_utils;
    this.mesh = mesh;
    this.unwrapping = unwrapping;
    this.sceneobject = {
      SceneObjectData, SceneObject, composeObjectMatrix
    };

    this.icon_enum = {Icons};

    this.editor = {
      Editor, VelPan, VelPanFlags, DataBlockBrowser, DirectionChooser, EditorSideBar, makeDataBlockBrowser,
      MeshMaterialChooser, MeshMaterialPanel, NewDataBlockOp, getContextArea
    };

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

    this._graphNodes = new Set();

    let this2 = this;

    let dblock = class DataBlockSub extends DataBlock {
      static register(cls) {
        let ret = super.register(cls);
        this2.dataBlockClasses.push(cls);

        return ret;
      }
    }

    this.lib_api = {
      DataBlock : dblock, DataRef, DataRefProperty, DataRefListProperty
    };
  }

  get ctx() {
    return _appstate.ctx;
  }

  register(cls) {
    if (cls.STRUCT && !cls.structName) {
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

    if (subclassOf(ToolOp)) {
      this.classes.toolOpClasses.push(cls);
      ToolOp.register(cls);
    }

    if (subclassOf(DataBlock)) {
      this.classes.dataBlockClasses.push(cls);
      DataBlock.register(cls);
    }

    if (subclassOf(ToolMode)) {
      this.classes.toolModeClasses.push(cls);
      ToolMode.register(cls);
    }

    if (subclassOf(CustomDataElem)) {
      this.classes.customDataClasses.push(cls);
      CustomDataElem.register(cls);
    }

    if (subclassOf(Editor)) {
      this.classes.editorClasses.push(cls);
      Editor.register(cls);
    }

    if (subclassOf(SceneObjectData)) {
      SceneObjectData.register(cls);
      this.classes.sceneObjectDataClasses.push(cls);
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

  unregisterAll() {
    for (let db of this.classes.dataBlockClasses) {
      DataBlock.unregister(db);
    }
    for (let tool of this.classes.toolOpClasses) {
      ToolOp.unregister(tool);
    }
    for (let toolmode of this.classes.toolModeClasses) {
      ToolMode.unregister(toolmode);
    }
    for (let data of this.classes.sceneObjectDataClasses) {
      SceneObjectData.unregister(data);
    }

    let graph = this.ctx.graph;
    for (let id of this._graphNodes) {
      let n = graph.node_idmap[id];
      if (n) {
        graph.remove(n);
      }
    }
  }
}
