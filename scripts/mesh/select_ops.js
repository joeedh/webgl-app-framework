"use strict";

import {ToolOp, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {IntProperty, EnumProperty, BoolProperty, FloatProperty, FlagProperty} from "../path.ux/scripts/toolprop.js";
import {MeshTypes, MeshFlags} from './mesh_base.js';
import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SelMask, SelOneToolModes, SelToolModes} from '../editors/view3d/selectmode.js';
import {DataRefListProperty, DataRefProperty} from "../core/lib_api.js";
import {Icons} from '../editors/icon_enum.js';
import {MeshOp} from "./mesh_ops_base.js";

export class SelectOpBase extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() { return {
    uiname        : "Mesh Select",
    toolpath      : "{selectopbase}",
    icon          : -1,
    description   : "select an element",
    inputs        : ToolOp.inherit({
      object      : new DataRefProperty("object").private(),
      selmask     : new FlagProperty(undefined, SelMask).private(),
      mode        : new EnumProperty(undefined, SelToolModes)
    })
  }}

  undoPre(ctx) {
    this._undo = {};

    if (ctx.object !== undefined) {
      this._undo.activeObject = ctx.object.lib_id;
    } else {
      this._undo.activeObject = -1;
    }

    for (let mesh of this.getMeshes(ctx)) {
      let object_id = mesh.ownerId !== undefined ? mesh.ownerId : -1;

      let ud = this._undo[mesh.lib_id] = {
        object   : object_id,
        dataPath : mesh.meshDataPath,
        actives  : {},
        data     : []
      };

      let data = ud.data;

      for (let elist of mesh.getElemLists()) {
        if (elist.active !== undefined) {
          ud.actives[elist.type] = elist.active.eid;
        } else {
          ud.actives[elist.type] = -1;
        }

        if (elist.type == MeshTypes.LOOP) {
          continue;
        }

        for (let e of elist) {
          if (e.flag & MeshFlags.SELECT) {
            data.push(e.eid);
          }
        }
      }
    }

    //we put this here to avoid polluting exec
    window.redraw_viewport();
  }

  undo(ctx) {
    if (this._undo.activeObject !== undefined) {
      let ob = ctx.datalib.get(this._undo.activeObject);

      ctx.scene.objects.setActive(ob);
    }

    for (let k in this._undo) {
      if (k === "activeObject") {
        continue;
      }

      let ud = this._undo[k];
      let mesh = ctx.api.getValue(ctx, ud.dataPath);
      //let mesh = ctx.datalib.get(k);

      if (mesh === undefined) {
        console.warn("Bad undo data", k);
        continue;
      }

      mesh.selectNone();

      for (let elist of mesh.getElemLists()) {
        elist.active = mesh.eidmap[ud.actives[elist.type]];
      }

      for (let eid of ud.data) {
        let e = mesh.eidmap[eid];

        if (e === undefined) {
          console.warn("Bad eid in selectopbase undo", eid);
          continue;
        }

        mesh.setSelect(e, true);
      }

      mesh.regenRender();
      window.redraw_viewport();
    }
  }
};

export class SelectOneOp extends SelectOpBase {
  constructor(mesh, eid) {
    super();
  }

  static tooldef() { return {
    uiname        : "Mesh Select",
    toolpath      : "mesh.selectone",
    icon          : -1,
    description   : "select an element",
    inputs        : ToolOp.inherit({
      mode        : new EnumProperty(undefined, SelOneToolModes),
      setActiveObject : new BoolProperty(true),
      eid         : new IntProperty(-1).private()
    })
  }}

  exec(ctx) {
    let mesh = this.getMeshes(ctx)[0];

    let e = mesh.eidmap[this.inputs.eid.getValue()];

    if (e === undefined) {
      console.warn("invalid eid " + this.inputs.eid.getValue() + " in selectoneop.exec");
      return;
    }

    switch (this.inputs.mode.getValue()) {
      case SelOneToolModes.UNIQUE:
        mesh.selectNone();
        mesh.setSelect(e, true);
        mesh.setActive(e);
        break;
      case SelOneToolModes.ADD:
        mesh.setSelect(e, true);
        mesh.setActive(e);
        break;
      case SelOneToolModes.SUB:
        mesh.setSelect(e, false);
        break;
    };

    mesh.selectFlush(this.inputs.selmask.getValue());
    mesh.regenRender();
  }
};
ToolOp.register(SelectOneOp);

export class ToggleSelectAll extends SelectOpBase {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let ret = super.invoke(ctx, args);

    //ret.inputs.selmask.setValue(ctx.view3d.ctx.selectMask);
    ret.inputs.selmask.setValue(SelMask.VERTEX|SelMask.EDGE|SelMask.FACE);

    if ("mode" in args) {
      let mode = args.mode;

      if (typeof mode == "string") {
        mode = mode.toUpperCase();
      }

      ret.inputs.mode.setValue(mode)
    } else {
      ret.inputs.mode.setValue(SelToolModes.AUTO);
    }

    return ret;
  }

  static tooldef() {
    return {
      uiname: "Toggle Select All",
      toolpath: "mesh.toggle_select_all",
      icon: Icons.TOGGLE_SEL_ALL,
      description: "toggle select all",
      inputs: ToolOp.inherit({
        selmask: new FlagProperty(undefined, SelMask).private(),
        mode: new EnumProperty(undefined, SelToolModes)
      })
    }
  }

  exec(ctx) {
    console.log("toggle select all!", this.inputs.mode.getValue(), this.inputs.selmask.getValue())
    let selmask = this.inputs.selmask.getValue();
    let mode = this.inputs.mode.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let mode2 = mode;

      if (mode === SelToolModes.AUTO) {
        mode2 = SelToolModes.ADD;

        for (let elist of mesh.getElemLists()) {
          if (!(elist.type & selmask)) {
            continue;
          }

          if (elist.selected.length > 0) {
            mode2 = SelToolModes.SUB;
          }
        }
      }

      console.log("mode2", mode2, SelToolModes);

      for (let elist of mesh.getElemLists()) {
        if (!(elist.type & selmask)) {
          continue;
        }

        for (let e of elist.editable) {
          elist.setSelect(e, mode2 == SelToolModes.ADD);
        }
      }

      mesh.selectFlush(selmask);
      mesh.regenRender();
    }
  }
}

ToolOp.register(ToggleSelectAll);
