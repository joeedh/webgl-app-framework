import {MeasurePoint, MeasureFlags} from "./measuretool_base.js";
import {MeasureToolBase} from "./measuretool.js";
import '../../../path.ux/scripts/util/struct.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
let STRUCT = nstructjs.STRUCT;
import {SnapModes} from "../transform_ops.js";
import {AddPointOp, MeasureOp} from "./measuretool_ops.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {ToolMode} from "../view3d_toolmode.js";

export class MeasureAngleTool extends MeasureToolBase {
  constructor() {
    super();

    this.maxPoints = 3;
  }

  static widgetDefine() {return {
    name        : "measure_angle",
    uiname      : "Measure Angle",
    icon        : Icons.MEASURE_ANGLE,
    flag        : 0,
    description : "Measure Angles",
    transWidgets: []
  }}

  draw(gl, view3d) {
    this.drawAngles();

    super.draw(gl, view3d);
  }

  drawAngles() {
    if (this.points.length !== 3) {
      return;
    }

    let texts = [];
    let cos = [];

    let v1 = new Vector2();
    let v2 = new Vector2();

    let overdraw = this.ctx.view3d.overdraw;
    let view3d = this.ctx.view3d;

    let line = (a, b, color=this.lineColor) => {
      a = new Vector3(a);
      b = new Vector3(b);

      view3d.project(a);
      view3d.project(b);

      return overdraw.line(a, b, color);
    };

    let ps = this.points;
    line(ps[0], ps[1]);
    line(ps[1], ps[2]);
    line(ps[2], ps[0]);

    for (let i=0; i<3; i++) {
      let a = this.points[(i+2)%3];
      let b = this.points[i];
      let c = this.points[(i+1)%3];

      v1.load(a).sub(b).normalize();
      v2.load(c).sub(b).normalize();

      let th = v1.dot(v2);
      let angle = 180*(Math.acos(th)/Math.PI);

      angle = angle.toFixed(1);

      let co2 = new MeasurePoint(b);

      this.ctx.view3d.project(co2);

      cos.push(co2);
      texts.push(angle + String.fromCharCode(0x00B0));
    }

    this.ctx.view3d.overdraw.drawTextBubbles(texts, cos);
  }
}
MeasureAngleTool.STRUCT = STRUCT.inherit(MeasureAngleTool, MeasureToolBase) + `
}`;
nstructjs.manager.add_class(MeasureAngleTool);
ToolMode.register(MeasureAngleTool);
