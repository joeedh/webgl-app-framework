"use strict";

import {ToolOp, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {IntProperty, EnumProperty, BoolProperty, FloatProperty, FlagProperty} from "../path.ux/scripts/toolprop.js";
import {Mesh, MeshTypes, MeshFlags} from '../core/mesh.js';
import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SelMask, SelOneToolModes, SelToolModes} from '../editors/view3d/selectmode.js';
import {DataRefListProperty, DataRefProperty} from "../core/lib_api.js";


export class SelectOpBase extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() { return {
    uiname        : "Mesh Select",
    toolpath      : "{selectopbase}",
    icon          : -1,
    description   : "select an element",
    inputs        : {
      object      : new DataRefProperty("object"),
      selmask     : new FlagProperty(undefined, SelMask),
      mode        : new EnumProperty(undefined, SelToolModes)
    }
  }}

  undoPre(ctx) {
    this._undo = {};

    if (ctx.object !== undefined) {
      this._undo.activeObject = ctx.object.lib_id;
    } else {
      this._undo.activeObject = -1;
    }

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;

      let ud = this._undo[mesh.lib_id] = {
        object  : ob.lib_id,
        actives : {},
        data    : []
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
          data.push(e.eid);
        }
      }
    }

    //we put this here to avoid polluting exec
    window.redraw_viewport();
  }

  undo(ctx) {
    if (this._undo.activeObject !== undefined) {
      let ob = this.datalib.get(this._undo.activeObject);

      ctx.scene.setActive(ob);
    }

    for (let k in this._undo) {
      let mesh = ctx.datalib.get(k);

      if (mesh === undefined) {
        console.warn("Bad undo data", k);
        continue;
      }

      let ud = this._undo[k];

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
      eid         : new IntProperty(-1)
    })
  }}

  exec(ctx) {
    let ob = ctx.datalib.get(this.inputs.object.getValue());
    if (ob === undefined) {
      console.warn("Bad object id passed to SelectOneOp", this.inputs.object.getValue());
      return;
    }

    let mesh = ob.data;
    let e = mesh.eidmap[this.inputs.eid.getValue()];

    if (e === undefined) {
      console.warn("invalid eid " + this.inputs.eid.getValue() + " in selectoneop.exec");
      return;
    }

    console.log("select", this.inputs.mode.getValue());

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
