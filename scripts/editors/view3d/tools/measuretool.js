import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/struct.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
let STRUCT = nstructjs.STRUCT;
import {MovableWidget} from '../widget_utils.js';
import {ToolOp} from "../../../path.ux/scripts/simple_toolsys.js";
import {Vec3Property} from "../../../path.ux/scripts/toolprop.js";
import {PropModes, TransDataType, TransDataElem} from '../transform_base.js';
import {ConstraintSpaces} from "../transform_base.js";
import {aabb_union} from '../../../util/math.js';
import {SnapModes} from "../transform_ops.js";

import {AddPointOp, MeasureOp} from "./measuretool_ops.js";

export class MeasureAngleTool extends ToolMode {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;
    this.view3d = manager !== undefined ? manager.view3d : undefined;
    this.cursor = undefined;

    this.drawCursor = true;

    this.points = [];
    this.pointWidgets = [];
  }


  getViewCenter() {
    if (this.points.length == 0) {
      return undefined;
    }

    let ret = [new Vector3(this.points[0]), new Vector3(this.points[0])];

    for (let p of this.points) {
      ret[0].min(p);
      ret[1].max(p);
    }

    return ret;
  }

  static buildSettings(container) {

  }

  static buildHeader(header, addHeaderRow) {
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    tstruct.vectorList(3, "points", "points", "Points", "Points");
    return tstruct;
  }

  on_mousedown(e, x, y, was_touch) {
    let ctx = this.ctx;

    if (e.shiftKey || e.ctrlKey || e.altKey || e.commandKey) {
      return false;
    }

    if (this.manager.widgets.highlight !== undefined) {
      return false;
    }

    let mpos = new Vector2([x, y]);

    if (e.altKey || e.shiftKey || e.ctrlKey || e.commandKey) {
      return;
    }

    let ret = castRay(ctx, ctx.selectMask, mpos, ctx.view3d, CastModes.FRAMEBUFFER);
    if (ret === undefined) {
      this.cursor = undefined;
    }

    if (this.cursor) {
      let tool = new AddPointOp();

      tool.inputs.p.setValue(this.cursor);
      this.ctx.toolstack.execTool(tool);

      this.clearWidgets();
      this.update();

      return true;
    }

    return false;
  }

  clearWidgets() {
    super.clearWidgets();

    console.log("clearing widgets");
    this.pointWidgets = [];
  }

  updatePointWidgets() {
    if (this.ctx === undefined || this.ctx.scene === undefined) {
      return;
    }

    let manager = this.ctx.scene.widgets;

    if (this.pointWidgets.length !== this.points.length) {
      this.clearWidgets();

      for (let i=0; i<this.points.length; i++) {
        let path = "scene.tools.measure_angle.points[" + i + "]";

        let widget = new MovableWidget(manager, path, SnapModes.SURFACE);
        this.addWidget(widget);
        this.pointWidgets.push(widget);
        widget.update(manager);
      }

      window.redraw_viewport();
    }
  }

  update() {
    super.update();

    this.updatePointWidgets();
  }

  on_mousemove(e, x, y, was_touch) {
    let ctx = this.ctx;

    if (e.shiftKey || e.ctrlKey || e.altKey || e.commandKey) {
      return false;
    }

    if (this.manager.widgets.highlight !== undefined) {
      return false;
    }

    let mdown;

    if (was_touch) {
      mdown = !!(e.touches !== undefined && e.touches.length > 0);
    } else {
      mdown = e.buttons;
    }

    mdown = mdown & 1;

    if (!mdown && super.on_mousemove(e, x, y, was_touch)) {
      return true;
    }

    //(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    let mpos = new Vector2([x, y]);

    let ret = castRay(ctx, ctx.selectMask, mpos, ctx.view3d, CastModes.FRAMEBUFFER);

    //console.log(ret !== undefined);

    //console.log("castRay ret:", ret, mpos);
    if (ret !== undefined) {
      this.cursor = new Vector3(ret.p3d);
      window.redraw_viewport();
    } else {
      this.cursor = undefined;
    }

    return ret !== undefined;
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

    function line(a, b) {
      a = new Vector3(a);
      b = new Vector3(b);

      view3d.project(a);
      view3d.project(b);

      return overdraw.line(a, b);
    }

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

      let co2 = new Vector3(b);

      this.ctx.view3d.project(co2);

      cos.push(co2);
      texts.push(angle + String.fromCharCode(0x00B0));
    }

    this.ctx.view3d.overdraw.drawTextBubbles(texts, cos);
  }

  on_drawstart(gl, view3d) {
    this.drawAngles();

    //console.log(this.cursor);
    this.drawCursor = this.manager.widgets.highlight === undefined;

    if (this.drawCursor && this.cursor !== undefined) {
      let cam = this.ctx.view3d.camera;
      let mat = new Matrix4();

      let co = new Vector4(this.cursor);
      mat.translate(co[0], co[1], co[2]);

      co[3]  = 1.0;
      co.multVecMatrix(cam.rendermat);

      let scale = Math.abs(co[3]*0.01);

      mat.scale(scale, scale, scale);

      Shapes.SPHERE.draw(gl, {
        projectionMatrix : cam.rendermat,
        objectMatrix : mat,
        color : [1, 0.4, 0.2, 1.0],
      }, Shaders.WidgetMeshShader)
    }
  }

  static widgetDefine() {return {
    name        : "measure_angle",
    uiname      : "Measure Angle",
    icon        : Icons.MEASURE_ANGLE,
    flag        : 0,
    description : "Measure Angles",
    transWidgets: []
  }}
}

MeasureAngleTool.STRUCT = STRUCT.inherit(MeasureAngleTool, ToolMode) + `
  points : array(vec3);
}`;
nstructjs.manager.add_class(MeasureAngleTool);

ToolMode.register(MeasureAngleTool);
