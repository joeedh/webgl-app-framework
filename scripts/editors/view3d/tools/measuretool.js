import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/struct.js';
import {TranslateWidget} from "../widget_tools.js";
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
let STRUCT = nstructjs.STRUCT;
import {MovableWidget} from '../widget_utils.js';
import {NodeSocketType} from "../../../core/graph.js";
import {DataStruct} from '../../../path.ux/scripts/simple_controller.js';
import {DataPathError} from "../../../path.ux/scripts/simple_controller.js";

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

    if (this.cursor && this.points.length < 3) {
      console.log("adding a point", this.points.length+1);

      this.points.push(this.cursor.copy());
      this.update();

      window.redraw_viewport();
      return true;
    } else if (this.cursor && this.points.length >= 3) {
      console.log("adding a point", 1);

      this.clearWidgets();
      this.points = [this.cursor.copy()];
      this.update();

      window.redraw_viewport();
      return true;
    }

    return false;
  }

  clearWidgets() {
    super.clearWidgets();

    console.log("clearing widgets");
    this.pointWidgets = [];
  }

  update() {
    super.update();

    if (this.ctx === undefined || this.ctx.scene === undefined) {
      return;
    }

    let manager = this.ctx.scene.widgets;

    if (this.pointWidgets.length < this.points.length) {
      for (let i=this.pointWidgets.length; i<this.points.length; i++) {
        let path = "scene.tools.measure_angle.points[" + i + "]";

        let widget = new MovableWidget(manager, path);
        this.addWidget(widget);
        this.pointWidgets.push(widget);
      }
    }
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

  on_drawstart(gl, view3d) {
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
