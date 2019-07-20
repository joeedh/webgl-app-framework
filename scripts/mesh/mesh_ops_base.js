import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property,
  PropFlags, PropTypes, PropSubTypes} from '../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {dist_to_line_2d} from '../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';

import {Mesh, MeshTypes} from '../core/mesh.js';
import '../path.ux/scripts/struct.js';
import {View3DOp} from '../editors/view3d/view3d_ops.js';

export function saveUndoMesh(mesh) {
  let data = [];

  nstructjs.manager.write_object(data, mesh);

  return new DataView(new Uint8Array(data).buffer);
}

export function loadUndoMesh(ctx, data) {
  let datalib = ctx.datalib;

  let mesh = nstructjs.manager.read_object(data, Mesh);

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
  undoPre(ctx) {
    let undo = this._undo = {};

    for (let ob of ctx.selectedMeshObjects) {
      undo[ob.lib_id] = saveUndoMesh(ob.data);
    }
  }

  execPost(ctx) {
    window.redraw_viewport();
    window.updateDataGraph();
  }

  undo(ctx) {
    let undo = this._undo;

    for (let ob of ctx.selectedMeshObjects) {
      let data = undo[ob.lib_id];

      let mesh = loadUndoMesh(ctx, data);

      ob.data.swapDataBlockContents(mesh);
      ob.data.regenRender();
      ob.data.update();
      ob.update();
    }

    window.updateDataGraph();
    window.redraw_viewport();
  }
};

