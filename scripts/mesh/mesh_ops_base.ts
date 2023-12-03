import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, ListProperty,
  PropFlags, PropTypes, StringProperty,
  ToolOp, ToolFlags, UndoFlags, nstructjs,
  Vector2, Vector3, Vector4, Matrix4, Quat, ToolDef,
} from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';

import {Mesh, MeshDrawFlags, MeshFlags, MeshTypes, Vertex} from './mesh.js';
import {View3DOp} from '../editors/view3d/view3d_ops.js';
import {SceneObject} from "../sceneobject/sceneobject.js";
import {ToolContext} from "../../types/scripts/core/context";
import {DataBlock, DataRef} from "../core/lib_api";

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
export function* resolveMeshes(ctx: ToolContext, pathset: Iterable<string>) {
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

      if (!mesh) {
        console.warn("Bad mesh", key, mesh);
        continue;
      }

      if (mesh instanceof SceneObject) {
        let ob = mesh;
        mesh = mesh.data;

        mesh.ownerMatrix = ob.outputs.matrix.getValue();
        mesh.ownerId = ob.lib_id;
        mesh.meshDataPath = key;
      } else {
        mesh.ownerMatrix = undefined;
        mesh.ownerId = undefined;
        mesh.meshDataPath = key;
      }

      yield mesh;
    }
  }
}

export interface IMeshUndoData {
  dview: DataView,
  drawflag: MeshDrawFlags
}

export function saveUndoMesh(mesh: Mesh): IMeshUndoData {
  let data = [];

  nstructjs.writeObject(data, mesh);

  return {
    dview: new DataView(new Uint8Array(data).buffer),
    drawflag: mesh.drawflag
  };
}

export function loadUndoMesh(ctx: ToolContext, data: IMeshUndoData) {
  let datalib = ctx.datalib;

  let mesh = nstructjs.readObject<Mesh>(data.dview, Mesh);
  mesh.drawflag = data.drawflag;

  //XXX hackish! getblock[_us] copy/pasted code!
  let getblock = <BlockType extends DataBlock>(ref: DataRef | number): BlockType => {
    return datalib.get<BlockType>(ref);
  }

  let getblock_us = <BlockType extends DataBlock>(ref: DataRef | number): BlockType => {
    let ret = datalib.get<BlockType>(ref);

    if (ret !== undefined) {
      ret.lib_addUser(mesh);
    }

    return ret;
  }

  mesh.dataLink(getblock, getblock_us);
  return mesh;
}

export abstract class MeshOp<InputSet = {}, OutputSet = {}> extends View3DOp<
  InputSet & {
  meshPaths: ListProperty<StringProperty>
},
  OutputSet
> {
  static tooldef(): ToolDef {
    return {
      inputs: ToolOp.inherit({
        meshPaths: new ListProperty(StringProperty, ["mesh", "_all_objects_"]).private()
      }),
      outputs: ToolOp.inherit({}),
      toolpath: "",
      uiname: "",
      icon: -1
    }
  }

  _undo?: {
    [k: number]: IMeshUndoData
  };

  getActiveMesh(ctx: ToolContext): Mesh {
    //returns first mesh in .getMeshes list
    return this.getMeshes(ctx)[0];
  }

  getMeshes(ctx: ToolContext): Mesh[] {
    let ret = new util.set();

    for (let item of resolveMeshes(ctx, this.inputs.meshPaths)) {
      if (item)
        ret.add(item);
    }

    let ret2 = [];
    for (let mesh of ret) {
      ret2.push(mesh);
    }

    return ret2;
  }

  execPost(ctx: ToolContext) {
    //check for mesh structure errors
    let msg: [string] = [""];
    for (let mesh of this.getMeshes(ctx)) {
      if (1) {
        if (!mesh.validateMesh(msg)) {
          ctx.warning("Mesh error: " + msg);
          ctx.toolstack.toolCancel(ctx, this);
          break;
        }
      }
    }

    window.redraw_viewport();
    window.updateDataGraph();
  }

  calcUndoMem(ctx: ToolContext) {
    if (!this._undo) {
      return 0;
    }

    let tot = 0;

    for (let id in this._undo) {
      let data = this._undo[id];

      tot += data.dview.buffer.byteLength;
    }

    return tot;
  }

  undoPre(ctx: ToolContext) {
    let undo = this._undo = {};

    for (let mesh of this.getMeshes(ctx)) {
      undo[mesh.lib_id] = saveUndoMesh(mesh);
    }
  }

  undo(ctx: ToolContext) {
    let undo = this._undo;

    for (let mesh of this.getMeshes(ctx)) {
      let data = undo[mesh.lib_id];

      let mesh2 = loadUndoMesh(ctx, data);

      if (mesh.bvh) {
        mesh.bvh = undefined;
      }

      mesh.swapDataBlockContents(mesh2);

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenElementsDraw();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.updateDataGraph();
    window.redraw_viewport();
  }
}

export class MeshDeformOp<InputSet = {}, OutputSet = {}> extends MeshOp<InputSet, OutputSet> {
  constructor() {
    super();
  }

  _deformUndo: {
    [k: number]: number[]
  };

  calcUndoMem() {
    let tot = 0.0;

    for (let k in this._deformUndo) {
      let data = this._deformUndo[k];
      tot += data.length * 8;
    }

    return tot;
  }

  undoPre(ctx: ToolContext) {
    let undo = this._deformUndo = {};

    for (let mesh of this.getMeshes(ctx)) {
      let list = [];

      undo[mesh.lib_id] = list;

      for (let v of mesh.verts) {
        list.push(v.eid);

        list.push(v.co[0]);
        list.push(v.co[1]);
        list.push(v.co[2]);
      }
    }
  }

  undo(ctx: ToolContext) {
    for (let k in this._deformUndo) {
      let mesh = ctx.datalib.get<Mesh>(parseInt(k));

      if (!mesh) {
        console.warn("Undo error", k);
        continue;
      }

      let list = this._deformUndo[k];
      for (let i = 0; i < list.length; i += 4) {
        let eid = list[i], x = list[i + 1], y = list[i + 2], z = list[i + 3];
        let v = mesh.eidMap.get<Vertex>(eid);
        if (!v || v.type !== MeshTypes.VERTEX) {
          console.error("Undo error for vertex eid", eid, "got", v);
          continue;
        }

        v.co[0] = x;
        v.co[1] = y;
        v.co[2] = z;

        v.flag |= MeshFlags.UPDATE;
      }

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
    window.updateDataGraph();
  }
}