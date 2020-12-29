import {
  IntProperty, FloatProperty, StringProperty, ListProperty,
  BoolProperty, EnumProperty, FlagProperty, ToolProperty,
  math, util, nstructjs, ToolOp
} from '../../path.ux/scripts/pathux.js';
import {MeshTypes, MeshFlags} from '../../mesh/mesh_base.js';
import {SelOneToolModes, SelToolModes} from '../view3d/selectmode.js';
import {Icons} from '../icon_enum.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
//import {FindNearest} from '../view3d/findnearest.js';
import {UVWrangler} from '../../mesh/unwrapping.js';
import {UVOpBase} from '../../mesh/mesh_uvops_base.js';
import {UVSelMask} from './uv_selectops.js';
import {UVFlags} from '../../mesh/mesh_customdata.js';


export class UVSetFlagBase extends UVOpBase {
  constructor() {
    super();
  }

  static canRun(ctx) {
    return ctx.mesh && ctx.mesh.loops.customData.hasLayer("uv");
  }

  static tooldef() {
    return {
      inputs: ToolOp.inherit({
        mode      : new EnumProperty(0, SelToolModes),
        selectMask: new FlagProperty(1, UVSelMask)
      })
    }
  }

  execPre(ctx) {
    let mesh = ctx.mesh;

    if (mesh) {
      mesh.regenUVEditor()
    }

    window.redraw_uveditors();
  }

  undoPre(ctx) {
    let mesh = ctx.mesh;
    let cd_uv = mesh.loops.customData.getLayerIndex("uv");

    if (cd_uv < 0) {
      this._undo = {
        list   : [],
        cd_uv  : cd_uv,
        mesh   : mesh.lib_id
      }

      return;
    }

    let list = [];
    for (let l of mesh.loops) {
      let uv = l.customData[cd_uv];

      list.push(l.eid);
      list.push(uv.flag);
    }

    this._undo = {
      list,
      cd_uv,
      mesh : mesh.lib_id
    }
  }

  undo(ctx) {
    let undo = this._undo;
    let mesh = ctx.datalib.get(undo.mesh);
    let list = undo.list;
    let cd_uv = undo.cd_uv;

    for (let i=0; i<list.length; i += 2) {
      let eid = list[i], flag = list[i+1];
      let l = mesh.eidmap[eid];

      if (!l || l.type !== MeshTypes.LOOP) {
        console.warn("Missing element " + eid, l);
        continue;
      }

      l.customData[cd_uv].flag = flag;
    }

    mesh.regenUVEditor();
    window.redraw_uveditors(false);
  }

  getLoops(ctx, selFacesOnly=true, SelLoopsOnly=true) {
    let mesh = ctx.mesh;

    if (!mesh) {
      return [];
    }

    let iter = selFacesOnly ? mesh.faces.selected.editable : mesh.faces;

    return (function*() {
      for (let f of iter) {
        for (let l of f.loops) {
          if (l.flag & MeshFlags.HIDE) {
            continue;
          }

          if (SelLoopsOnly && !(l.flag & MeshFlags.SELECT)) {
            continue;
          }

          yield l;
        }
      }
    })();
  }
  execPost(ctx) {
    window.redraw_uveditors(false);
  }
}

export class UVSetFlagOp extends UVSetFlagBase {
  static tooldef() {
    return {
      uiname : "Set Flag (UV)",
      toolpath : "uveditor.set_flag",
      inputs : ToolOp.inherit({
        flag : new FlagProperty(undefined, UVFlags)
      })
    }
  }

  exec(ctx) {
    let mesh = ctx.mesh;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");

    if (cd_uv < 0) {
      ctx.error("No UVs");
      return;
    }

    let flag = this.inputs.flag.getValue();

    if (!flag) {
      ctx.error("No flag");
      return;
    }

    for (let l of this.getLoops(ctx, true, true)) {
      let uv = l.customData[cd_uv];

      uv.flag |= flag;
    }
  }
}
ToolOp.register(UVSetFlagOp);

export class UVClearFlagOp extends UVSetFlagBase {
  static tooldef() {
    return {
      uiname : "Clear Flag (UV)",
      toolpath : "uveditor.clear_flag",
      inputs : ToolOp.inherit({
        flag : new FlagProperty(undefined, UVFlags)
      })
    }
  }

  exec(ctx) {
    let mesh = ctx.mesh;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");

    if (cd_uv < 0) {
      ctx.error("No UVs");
      return;
    }

    let flag = this.inputs.flag.getValue();

    if (!flag) {
      ctx.error("No flag");
      return;
    }

    for (let l of this.getLoops(ctx, true, true)) {
      let uv = l.customData[cd_uv];

      uv.flag &= ~flag;
    }
  }
}
ToolOp.register(UVClearFlagOp);

export class UVToggleFlagOp extends UVSetFlagBase {
  static tooldef() {
    return {
      uiname : "Toggle Flag (UV)",
      toolpath : "uveditor.toggle_flag",
      inputs : ToolOp.inherit({
        flag : new FlagProperty(undefined, UVFlags)
      })
    }
  }

  exec(ctx) {
    let mesh = ctx.mesh;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");

    if (cd_uv < 0) {
      ctx.error("No UVs");
      return;
    }

    let flag = this.inputs.flag.getValue();

    if (!flag) {
      ctx.error("No flag");
      return;
    }

    for (let l of this.getLoops(ctx, true, true)) {
      let uv = l.customData[cd_uv];

      uv.flag ^= flag;
    }
  }
}
ToolOp.register(UVToggleFlagOp);
