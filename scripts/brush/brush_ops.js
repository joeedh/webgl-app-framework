import {
  ToolOp, StringProperty, BoolProperty, EnumProperty,
  FlagProperty, FloatProperty, IntProperty, nstructjs
} from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import {SculptBrush, DefaultBrushes, getBrushes} from './brush.js';
import {Icons} from '../editors/icon_enum.js';

export class BrushOp extends ToolOp {
  static tooldef() {
    return {
      inputs: {
        dataPath: new StringProperty("scene.tools.sculpt")
      }
    }
  }

  getBrush(ctx) {
    let brush = ctx.api.getValue(ctx, this.inputs.dataPath.getValue());

    if (!brush) {
      console.warn("No brush at datapath " + this.inputs.dataPath.getValue());
    }

    return brush;
  }

  undoPre(ctx) {
    let undo = this._undo = {
      dview: undefined
    };

    let brush = this.getBrush(ctx);
    if (brush) {
      let data = [];
      nstructjs.writeObject(data, brush);

      data = new Uint8Array(data);
      data = new DataView(data.buffer);
      undo.dview = data;
    }
  }

  undo(ctx) {
    let brush = this.getBrush(ctx);

    if (!brush) {
      return;
    }

    let dview = this._undo.dview;
    if (!dview) {
      console.warn("Warning, brush existed but not undo data");
      return;
    }

    let brush2 = nstructjs.readObject(dview, SculptBrush);

    let gb = (dref) => {
      return ctx.datalib.get(dref);
    }

    let gb_us = (dref, owner) => {
      if (!owner) {
        owner = brush2;
      }

      let block = ctx.datalib.get(dref);
      if (block) {
        block.lib_addUser(owner);
      }

      return block;
    }

    brush2.dataLink(gb, gb_us);

    if (brush.texUser.texture) {
      brush.texUser.texture.lib_remUser(brush);
    }

    brush2.copyTo(brush);

    if (brush.texUser.texture) {
      brush.texUser.texture.lib_addUser(brush);
    }
  }
}

export class LoadDefaultBrush extends BrushOp {
  static tooldef() {
    return {
      uiname  : "Load Brush Defaults",
      toolpath: "brush.load_default",
      inputs  : ToolOp.inherit({}),
      icon    : Icons.RELOAD
    }
  }

  exec(ctx) {
    let brush = this.getBrush(ctx);
    if (!brush) {
      return;
    }

    let brush2;
    let comb = DefaultBrushes["Comb"];

    if (brush.name === comb.name && comb && brush.tool === comb.tool) {
      brush2 = comb;
    } else {
      for (let k in DefaultBrushes) {
        let brush3 = DefaultBrushes[k];

        if (brush3.tool === brush.tool) {
          brush2 = brush3;
          break;
        }
      }
    }

    console.log(brush2, brush.tool, DefaultBrushes);

    if (brush.texUser.texture) {
      brush.texUser.texture.lib_remUser(brush);
    }

    brush2.copyTo(brush);

    if (brush.texUser.texture) {
      brush.texUser.texture.lib_addUser(brush);
    }

    brush.graphUpdate();
    window.updateDataGraph();
  }
}

ToolOp.register(LoadDefaultBrush);

export class ReloadAllBrushes extends ToolOp {
  static tooldef() {return {
    uiname : "Reload All Brushes",
    toolpath : "brush.reload_all_defaults",
    description : "Reload all brushes from defaults",
    icon : Icons.RELOAD
  }}

  exec(ctx) {
    getBrushes(ctx, true);
  }
}
ToolOp.register(ReloadAllBrushes);
