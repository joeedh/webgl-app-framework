import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
import {MovableWidget} from '../widget_utils.js';
import {ToolOp} from "../../../path.ux/scripts/simple_toolsys.js";
import {Vec3Property} from "../../../path.ux/scripts/toolprop.js";
import {PropModes, TransDataType, TransDataElem} from '../transform_base.js';
import {ConstraintSpaces} from "../transform_base.js";
import {aabb_union} from '../../../util/math.js';
import {SnapModes} from "../transform_ops.js";

import {AddPointOp, MeasureOp} from "./measuretool_ops.js";
import {MeasurePoint, MeasureFlags} from "./measuretool_base.js";

if (Math.fract === undefined) {
  Math.fract = (f) => f - Math.floor(f);
}

export function buildImperialString(distft) {
  let miles = ~~(distft / 5280);

  let feet = ~~distft;
  let inches = Math.fract(distft)*12.0;

  let s = "";

  if (miles !== 0.0) {
    s += miles + "miles ";
  }

  if (feet !== 0.0) {
    s += feet + "ft ";
  }

  if (inches != 0.0) {
    let decimals;

    if (miles) {
      decimals = 1;
    } else if (feet) {
      decimals = 2;
    } else {
      decimals = 3;
    }

    s += inches.toFixed(decimals) + "in";
  }

  return s;
}

export function buildDistUnitsString(dist) {
  if (Unit.isMetric) {
    return dist.toFixed(4) + " m";
  } else {
    return buildImperialString(dist);
  }
}

export class MeasureToolBase extends ToolMode {
  constructor(manager) {
    super(manager);

    this.lineColor = "red";

    this.flag |= WidgetFlags.ALL_EVENTS;
    this.view3d = manager !== undefined ? manager.view3d : undefined;
    this.cursor = undefined;

    this.drawCursor = true;
    this._isMeasureTool = true;

    this.maxPoints = 3;
    this.points = [];
    this.pointWidgets = [];
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "measure.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "measure.toggle_select_all(mode='SUB')"),
      new HotKey("A", ["CTRL"], "measure.toggle_select_all(mode='ADD')"),
      new HotKey("X", [], "measure.delete_selected()"),
      new HotKey("Delete", [], "measure.delete_selected()")
    ]);

    return this.keymap;
  }

  static isMeasureTool(instance) {
    return instance._isMeasureTool;
  }

  static buildSettings(container) {
  }

  static buildHeader(header, addHeaderRow) {
    let strip = header.strip();

    strip.useIcons();
    strip.tool("measure.delete_selected");
    strip.tool("measure.clear_points");
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    let pstruct = api.mapStruct(MeasurePoint, true);

    let onchange = () => {
      window.redraw_viewport();
    }

    pstruct.vec3("", "co", "co", "Coordinates").on('change', onchange);
    pstruct.flags("flag", "flag", MeasureFlags, "Flags", "Flags").on('change', onchange);


    tstruct.arrayList("points", "points", pstruct, "Points", "Points");

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

    let ret = castViewRay(ctx, ctx.selectMask, mpos, ctx.view3d, CastModes.FRAMEBUFFER);
    if (ret === undefined) {
      this.cursor = undefined;
    }

    if (this.cursor) {
      let tool = new AddPointOp(this);

      tool.inputs.p.setValue(this.cursor);
      this.ctx.toolstack.execTool(this.ctx, tool);

      this.clearWidgets();
      this.update();

      return true;
    }

    return false;
  }

  getViewCenter() {
    let d = 1e17;
    let ret;

    for (let p of this.points) {
      if (ret === undefined) {
        ret = [new Vector3(p), new Vector3(p)];
      } else {
        ret[0].min(p);
        ret[1].max(p);
      }
    }

    return ret;
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
        let tname = this.constructor.widgetDefine().name;
        let path = `scene.tools.${tname}.points[${i}]`;

        let widget = new MovableWidget(manager, path, SnapModes.SURFACE);
        widget.addTools("measure.selectone", "measure.toggle_select_all");

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

    let ret = castViewRay(ctx, ctx.selectMask, mpos, ctx.view3d, CastModes.FRAMEBUFFER);

    //console.log(ret !== undefined);

    //console.log("castViewRay ret:", ret, mpos);
    if (ret !== undefined) {
      this.cursor = new MeasurePoint(ret.p3d);
      window.redraw_viewport();
    } else {
      this.cursor = undefined;
    }

    return ret !== undefined;
  }

  drawSphere(gl, view3d, p, scale=0.01) {
    let cam = this.ctx.view3d.activeCamera;
    let mat = new Matrix4();

    let co = new Vector4(p);
    mat.translate(co[0], co[1], co[2]);

    co[3]  = 1.0;
    co.multVecMatrix(cam.rendermat);

    scale = Math.abs(co[3] * scale);
    mat.scale(scale, scale, scale);

    Shapes.SPHERE.draw(gl, {
      projectionMatrix : cam.rendermat,
      objectMatrix : mat,
      color : [1, 0.4, 0.2, 1.0],
    }, Shaders.WidgetMeshShader)
  }

  draw(gl, view3d) {
    //console.log(this.cursor);
    this.drawCursor = this.manager.widgets.highlight === undefined;

    if (this.drawCursor && this.cursor !== undefined) {
      this.drawSphere(gl, view3d, this.cursor);
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }

    for (let i=0; i<this.points.length; i++) {
      if (!(this.points[i] instanceof MeasurePoint)) {
        this.points[i] = new MeasurePoint(this.points[i]);
      }
    }
  }

}

MeasureToolBase.STRUCT = STRUCT.inherit(MeasureToolBase, ToolMode) + `
  points : array(MeasurePoint);
}`;
nstructjs.manager.add_class(MeasureToolBase);
