import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {
  nstructjs, ToolOp, BoolProperty, IntProperty, EnumProperty, FlagProperty,
  FloatProperty, Vec3Property, Vec2Property, StringProperty
} from '../path.ux/scripts/pathux.js';
import {TetTypes, TetFlags, TetRecalcFlags} from './tetgen_base.js';
import {TetMesh} from './tetgen.js';
import {DataRefProperty} from '../core/lib_api.js';
import {SelMask, SelToolModes} from '../editors/view3d/selectmode.js';

export class TetSelectOp extends ToolOp {
  static tooldef() {
    return {
      uiname     : "Tet Mesh Select",
      toolpath   : "{selectopbase}",
      icon       : -1,
      description: "select an element",
      inputs     : ToolOp.inherit({
        object : new DataRefProperty("object").private(),
        selmask: new FlagProperty(undefined, SelMask).private(),
        mode   : new EnumProperty(undefined, SelToolModes)
      })
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (ctx.object && !("object" in args)) {
      tool.inputs.object.setValue(ctx.object);
    }

    if (!("selmask" in args)) {
      tool.inputs.selmask.setValue(ctx.selectMask);
    }

    return tool;
  }

  calcUndoMem(ctx) {
    return this._undo ? this._undo.totMem : 0;
  }

  getMeshes(ctx) {
    let ob = ctx.datalib.get(this.inputs.object.getValue());

    if (!ob) {
      return [];
    }

    return [ob.data];
  }

  undoPre(ctx) {
    let undo = this._undo = {
      totMem : 0,
      meshes : []
    };

    for (let mesh of this.getMeshes(ctx)) {
      let ud = {
        mesh : mesh.lib_id,
        elists : {}
      };

      undo.meshes.push(ud);

      for (let k in mesh.elists) {
        let elist = mesh.elists[k];
        let list = [];

        ud.elists[k].selected = list;
        ud.elists[k].active = elist.active ? elist.active.eid : -1;
        ud.elists[k].highlight = elist.highlight ? elist.highlight.eid : -1;

        undo.totMem += 8*4;

        for (let elem of elist.selected) {
          list.push(elem.eid);
          undo.totMem += 8;
        }
      }
    }
  }

  undo(ctx) {
    for (let ud of this._undo) {
      let mesh = ctx.get(ud.lib_id);

      if (!mesh) {
        console.warn("Failed to load tet mesh " + ud.lib_id);
        continue;
      }

      mesh.selectNone();
      let eidMap = mesh.eidMap;

      for (let k in ud.elists) {
        let elist = mesh.elists[k];
        let ulist = ud.elists[k];

        elist.active = eidMap.get(ulist.active);
        elist.highlight = eidMap.get(ulist.highlight);

        for (let eid of ulist) {
          let elem = eidMap.get(eid);
          if (!elem) {
            console.warn("Failed to look up tet element " + eid);
            continue;
          }

          elist.setSelect(elem, true);
        }
      }

      mesh.regenRender();
    }

    window.redraw_viewport(true);
  }
}

