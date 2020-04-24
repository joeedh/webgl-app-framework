import {MeasurePoint, MeasureFlags} from "./measuretool_base.js";
import {MeasureToolBase, buildImperialString} from "./measuretool.js";
import '../../../path.ux/scripts/struct.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
let STRUCT = nstructjs.STRUCT;
import {SnapModes} from "../transform_ops.js";
import {AddPointOp, MeasureOp} from "./measuretool_ops.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castRay, CastModes} from "../findnearest.js";
import {ToolMode} from "../view3d_toolmode.js";
import * as units from '../../../path.ux/scripts/units.js';

export class MeasureDistTool extends MeasureToolBase {
  constructor() {
    super();

    this.maxPoints = 0;
  }

  static widgetDefine() {return {
    name        : "measure_dist",
    uiname      : "Measure Distance",
    icon        : Icons.MEASURE_DIST,
    flag        : 0,
    description : "Measure Distance",
    transWidgets: []
  }}

  on_drawstart(gl, view3d) {
    this.drawDists();

    super.on_drawstart(gl, view3d);
  }

  drawDists() {
    let ctx = this.ctx;
    let view3d = ctx.view3d;

    if (this.points.length < 2) {
      return;
    }

    let texts = [];
    let cos = [];

    let v1 = new Vector2();
    let v2 = new Vector2();

    let overdraw = this.ctx.view3d.overdraw;

    function line(a, b) {
      a = new Vector3(a);
      b = new Vector3(b);

      view3d.project(a);
      view3d.project(b);

      return overdraw.line(a, b);
    }

    let ps = this.points;

    let cent = new Vector2();
    let sum = 0.0;
    let colors = [];

    for (let i=0; i<ps.length-1; i++) {
      let a = ps[i], b = ps[i+1];

      let co2 = new Vector3(a).interp(b, 0.5);
      view3d.project(co2);

      cent.add(co2);

      let dist = a.vectorDistance(b);

      dist = units.convert(dist, units.Unit.baseUnit, "foot");
      sum += dist;

      let s = buildImperialString(dist);

      cos.push(co2);
      texts.push(s);
      colors.push("rgb(150,150,150)");

      line(a, b);
    }

    cent.mulScalar(1.0 / (ps.length-1));

    cos.push(cent);
    texts.push(buildImperialString(sum));
    colors.push("white");

    this.ctx.view3d.overdraw.drawTextBubbles(texts, cos, colors);
  }
}
MeasureDistTool.STRUCT = STRUCT.inherit(MeasureDistTool, MeasureToolBase) + `
}`;
nstructjs.manager.add_class(MeasureDistTool);
ToolMode.register(MeasureDistTool);
