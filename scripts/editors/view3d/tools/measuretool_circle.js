import {MeasurePoint, MeasureFlags} from "./measuretool_base.js";
import {MeasureToolBase, buildImperialString, buildDistUnitsString} from "./measuretool.js";
import '../../../path.ux/scripts/struct.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import * as math from '../../../util/math.js';
import {Shaders} from '../view3d_shaders.js';
let STRUCT = nstructjs.STRUCT;
import {SnapModes} from "../transform_ops.js";
import {AddPointOp, MeasureOp} from "./measuretool_ops.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {ToolMode} from "../view3d_toolmode.js";
import * as units from '../../../path.ux/scripts/units.js';
import {circ_from_point3} from '../../../util/math.js';

export class MeasureCircleTool extends MeasureToolBase {
  constructor() {
    super();

    this.drawCursor = false;
    this.maxPoints = 3;
    this.circ = undefined;
  }

  static widgetDefine() {return {
    name        : "measure_circle",
    uiname      : "Measure Circle",
    icon        : Icons.MEASURE_CIRCLE,
    flag        : 0,
    description : "Measure Circle",
    transWidgets: []
  }}

  draw(gl, view3d) {
    this.drawCircle();

    if (this.circ !== undefined) {
      //gl.depthMask(true);
      this.drawSphere(gl, view3d, this.circ.p, 0.05);
    }
    //

    if (this.points.length === 3) {
      this.drawCursor = false;
    }

    super.draw(gl, view3d);
  }

  drawCircle() {
    let ctx = this.ctx;
    let view3d = ctx.view3d;

    if (this.points.length < 3) {
      return;
    }
    let cent = new Vector2();
    for (let p of this.points) {
      cent.add(p);
    }
    cent.mulScalar(1.0 / this.points.length);

    let texts = [];
    let cos = [];

    let v1 = new Vector2();
    let v2 = new Vector2();

    let overdraw = this.ctx.view3d.overdraw;

    let line = (a, b, color=this.lineColor) => {
      a = new Vector3(a);
      b = new Vector3(b);

      view3d.project(a);
      view3d.project(b);

      return overdraw.line(a, b, color);
    };

    let ps = this.points;

    let sum = 0.0;
    let colors = [];
    let steps = 64;
    let th = -Math.PI, dth = (2.0*Math.PI) / (steps - 1);

    let circ = circ_from_point3(ps[0], ps[1], ps[2]);
    this.circ = circ;

    if (circ === undefined) {
      return;
    }

    let co = new Vector3();
    let lastco = new Vector3();
    let r = circ.r, p = circ.p;

    for (let i=0; i<steps; i++, th += dth) {
      co[0] = Math.sin(th)*r;
      co[1] = Math.cos(th)*r;
      co[2] = 0.0;

      co.multVecMatrix(circ.matrix);
      co.add(p);

      if (i > 0) {
        line(lastco, co);
      }

      lastco.load(co);
    };

    line(ps[0], circ.p);

    cos.push(new Vector3(circ.p).interp(ps[0], 0.5));
    texts.push(buildDistUnitsString(circ.r) + " r\n" + buildDistUnitsString(circ.r*2) + " d");
    colors.push(undefined); //use default color

    cos.push(new Vector3(ps[1]));
    texts.push(buildDistUnitsString(circ.r*2*Math.PI) + " C");
    colors.push(undefined);

    for (let co of cos) {
      view3d.project(co);
    }

    this.ctx.view3d.overdraw.drawTextBubbles(texts, cos, colors);
  }
}
MeasureCircleTool.STRUCT = STRUCT.inherit(MeasureCircleTool, MeasureToolBase) + `
}`;
nstructjs.manager.add_class(MeasureCircleTool);
ToolMode.register(MeasureCircleTool);
