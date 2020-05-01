import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, ListProperty,
  PropFlags, PropTypes, PropSubTypes, StringProperty, StringSetProperty
} from '../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {dist_to_line_2d} from '../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';

import {Mesh, MeshTypes} from './mesh.js';
import '../path.ux/scripts/struct.js';
import {View3DOp} from '../editors/view3d/view3d_ops.js';
import {SceneObject} from "../sceneobject/sceneobject.js";

/**
 *
 * Iterates over pathset.  If
 * a path refers to a SceneObject
 * or is "_all_objects_",
 *
 * Each mesh will
 * have a .ownerMatrix property set referring
 * to sceneobject.outputs.matrix.getValue()
 *
 * Along with .ownerId referencing sceneobject.lib_id
 * And .meshDataPath for origin src API data path
 * */
export function* resolveMeshes(ctx, pathset) {
  for (let key of pathset) {
    if (key === "_all_objects_") {

      for (let ob of ctx.selectedMeshObjects) {
        let mesh = ob.data;

        mesh.ownerMatrix = ob.outputs.matrix.getValue();
        mesh.ownerId = ob.lib_id;
        mesh.meshDataPath = `objects[${ob.lib_id}].data`;

        yield mesh;
      }
    } else {
      let mesh = ctx.api.getValue(ctx, key);

      if (mesh instanceof SceneObject) {
        let ob = mesh;
        mesh = mesh.data;

        mesh.ownerMatrix = ob.outputs.matrix.getValue();
        mesh.ownerId = ob.lib_id;
        mesh.meshDataPath = key;
      } else if (mesh === undefined) {
        console.warn("Bad mesh", "'"+key+"'");
      } else {
        mesh.ownerMatrix = undefined;
        mesh.ownerId = undefined;
        mesh.meshDataPath = key;
      }

      yield mesh;
    }
  }
}

export function saveUndoMesh(mesh) {
  let data = [];

  nstructjs.manager.write_object(data, mesh);

  return {
    dview    : new DataView(new Uint8Array(data).buffer),
    drawflag : mesh.drawflag
  };
}

export function loadUndoMesh(ctx, data) {
  let datalib = ctx.datalib;

  let mesh = nstructjs.manager.read_object(data.dview, Mesh);
  mesh.drawflag = data.drawflag;

  //XXX hackish! getblock[_us] copy/pasted code!
  let getblock = (ref) => {
    return datalib.get(ref);
  }

  let getblock_us = (ref) => {
    let ret = datalib.get(ref);

    if (ret !== undefined) {
      ret.lib_addUser(mesh);
    }

    return ret;
  }

  mesh.dataLink(getblock, getblock_us);
  return mesh;
}

export class MeshOp extends View3DOp {
  static tooldef() {return {
    inputs : ToolOp.inherit({
      meshPaths : new ListProperty(StringProperty, ["mesh", "_all_objects_"]).private()
    })
  }}

  getActiveMesh(ctx) {
    //returns first mesh in .getMeshes list
    return this.getMeshes(ctx)[0];
  }

  getMeshes(ctx) {
    let ret = [];

    for (let item of resolveMeshes(ctx, this.inputs.meshPaths)) {
      ret.push(item);
    }

    return ret;
  }

  execPost(ctx) {
    //check for mesh structure errors
    let msg = [""];
    for (let mesh of this.getMeshes(ctx)) {
      if (!mesh.validateMesh(msg)) {
        ctx.warning("Mesh error: " + msg);
        ctx.toolstack.toolCancel(ctx, this);
        break;
      }
    }

    window.redraw_viewport();
    window.updateDataGraph();
  }

  undoPre(ctx) {
    let undo = this._undo = {};

    for (let mesh of this.getMeshes(ctx)) {
      undo[mesh.lib_id] = saveUndoMesh(mesh);
    }
  }

  undo(ctx) {
    let undo = this._undo;

    for (let mesh of this.getMeshes(ctx)) {
      let data = undo[mesh.lib_id];

      let mesh2 = loadUndoMesh(ctx, data);

      mesh.swapDataBlockContents(mesh2);
      mesh.regenRender();
      mesh.update();
    }

    window.updateDataGraph();
    window.redraw_viewport();
  }
};
