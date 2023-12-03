"use strict";

import {
  IntProperty, ToolOp, UndoFlags, EnumProperty, BoolProperty, FloatProperty, FlagProperty
} from "../path.ux/scripts/pathux.js";
import {MeshTypes, MeshFlags} from './mesh_base.js';
import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SelMask, SelOneToolModes, SelToolModes} from '../editors/view3d/selectmode.js';
import {DataRefListProperty, DataRefProperty} from "../core/lib_api.js";
import {Icons} from '../editors/icon_enum.js';
import {MeshOp} from "./mesh_ops_base.js";
import {SceneObject} from "../sceneobject/sceneobject.js";
import {Element} from './mesh_types.js';
import {FindNearest} from '../editors/view3d/findnearest.js';

export class MeshFlagOpBase extends MeshOp {
  constructor() {
    super(...arguments);
  }

  static tooldef() {return {
    inputs : ToolOp.inherit({
      elemMask : new FlagProperty(1, MeshTypes),
      flag : new EnumProperty(1, MeshFlags)
    })
  }}

  undoPre(ctx) {
    let undo = {
      meshes : []
    };

    let typemask = this.inputs.elemMask.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let ud = [];

      undo.meshes.push({
        list : ud,
        mesh : mesh.lib_id
      });

      for (let k in MeshTypes) {
        let type = MeshTypes[k];
        if (!(typemask & type)) {
          continue;
        }

        let elist = mesh.getElemList(type);
        for (let e of elist) {
          ud.push(e.eid);
          ud.push(e.flag);
        }
      }
    }

    this._undo = undo;
  }

  calcUndoMem(ctx) {
    let tot = 0;

    for (let udata of this._undo.meshes) {
      tot += udata.list.length*20;
    }

    return tot;
  }

  undo(ctx) {
    for (let udata of this._undo.meshes) {
      let {mesh, list} = udata;

      mesh = ctx.datalib.get(mesh);
      if (!mesh) {
        console.warn("Missing mesh!", udata.mesh, udata);
        continue;
      }

      for (let i=0; i<list.length; i += 2) {
        let eid = list[i], flag = list[i+1];

        let e = mesh.eidMap.get(eid);
        if (!e) {
          console.warn("Missing element " + eid);
          continue;
        }

        if ((e.flag & MeshFlags.SELECT) !== (flag & MeshFlags.SELECT)) {
          mesh.setSelect(e, flag & MeshFlags.SELECT);
        }

        e.flag = flag | MeshTypes.UPDATE;
      }

      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }

  getElemLists(mesh) {
    let ret = [];

    let typemask = this.inputs.elemMask.getValue();

    console.log("typemask:", typemask);

    for (let k in MeshTypes) {
      let type = MeshTypes[k];

      if (!(typemask & type)) {
        continue;
      }

      let elist = mesh.getElemList(type);
      ret.push(elist);
    }

    return ret;
  }
}

export class ToggleFlagOp extends MeshFlagOpBase {
  static tooldef() {return {
    uiname : "Toggle Flag",
    toolpath : "mesh.toggle_flag",
    icon : -1,
    inputs : ToolOp.inherit()
  }}

  exec(ctx) {
    let flag = this.inputs.flag.getValue();
    let typemask = this.inputs.elemMask.getValue();

    console.log("typemask:", typemask, "flag:", flag);

    for (let mesh of this.getMeshes(ctx)) {
      for (let elist of this.getElemLists(mesh)) {
        for (let elem of elist.selected.editable) {
          elem.flag ^= flag;
          elem.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.flushUpdateFlags();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}
ToolOp.register(ToggleFlagOp);


export class SetFlagOp extends MeshFlagOpBase {
  static tooldef() {return {
    uiname : "Set Flag",
    toolpath : "mesh.set_flag",
    icon : -1,
    inputs : ToolOp.inherit()
  }}

  exec(ctx) {
    let flag = this.inputs.flag.getValue();
    let typemask = this.inputs.elemMask.getValue();

    console.log("typemask:", typemask, "flag:", flag);

    for (let mesh of this.getMeshes(ctx)) {
      for (let elist of this.getElemLists(mesh)) {
        for (let elem of elist.selected.editable) {
          elem.flag |= flag;
          elem.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.flushUpdateFlags();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}
ToolOp.register(SetFlagOp);


export class ClearFlagOp extends MeshFlagOpBase {
  static tooldef() {return {
    uiname : "Clear Flag",
    toolpath : "mesh.clear_flag",
    icon : -1,
    inputs : ToolOp.inherit()
  }}

  exec(ctx) {
    let flag = this.inputs.flag.getValue();
    let typemask = this.inputs.elemMask.getValue();

    console.log("typemask:", typemask, "flag:", flag);

    for (let mesh of this.getMeshes(ctx)) {
      for (let elist of this.getElemLists(mesh)) {
        for (let elem of elist.selected.editable) {
          elem.flag &= ~flag;
          elem.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.flushUpdateFlags();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}
ToolOp.register(ClearFlagOp);
