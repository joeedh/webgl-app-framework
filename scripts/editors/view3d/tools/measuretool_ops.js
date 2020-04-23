import {Vec3Property} from "../../../path.ux/scripts/toolprop.js";
import {MeasureAngleTool} from "./measuretool.js";
import {ToolOp} from "../../../path.ux/scripts/simple_toolsys.js";
import {Vector3} from "../../../util/vectormath.js";

export class MeasureOp extends ToolOp {
  constructor() {
    super();
  }

  undoPre(ctx) {
    let ms = ctx.scene.toolmode_namemap["measure_angle"];

    let points = [];
    for (let p of ms.points) {
      points.push(new Vector3(p));
    }

    this._undo = {
      points     : points,
      toolmode_i : ctx.scene.toolmode_i
    };
  }

  getToolMode(ctx) {
    return ctx.scene.toolmode_namemap["measure_angle"];
  }

  undo(ctx) {
    let ud = this._undo;
    if (ctx.scene.toolmode_i !== ud.toolmode_i) {
      ctx.scene.switchToolMode(ud.toolmode_i);
    }

    let ms = ctx.scene.toolmode_namemap["measure_angle"];
    ms.points = [];

    for (let i=0; i<ud.points.length; i++) {
      ms.points.push(new Vector3(ud.points[i]));
    }

    ms.updatePointWidgets();
    window.redraw_viewport();
  }

  execPost(ctx) {
    window.redraw_viewport();
  }
}

export class AddPointOp extends MeasureOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname : "Point Add (Measure)",
    name : "point_add",
    toolpath : "measure_angle.add_point",
    inputs : {
      p : new Vec3Property()
    }
  }}

  static canRun(ctx) {
    return ctx.scene.toolmode instanceof MeasureAngleTool;
  }

  exec(ctx) {
    let ms = this.getToolMode(ctx);

    let p = this.inputs.p.getValue();

    if (ms.points.length < 3) {
      ms.points.push(new Vector3(p));
    } else {
      ms.points = [new Vector3(p)];
    }

    ms.updatePointWidgets();
  }
}
ToolOp.register(AddPointOp);
