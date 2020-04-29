import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/struct.js';
import {MeshToolBase} from "./meshtool.js";

let STRUCT = nstructjs.STRUCT;
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
import {MovableWidget} from '../widget_utils.js';
import {SnapModes} from "../transform_ops.js";

import {AddPointOp, MeasureOp} from "./measuretool_ops.js";
import {MeasurePoint, MeasureFlags} from "./measuretool_base.js";
import {Mesh, MeshDrawFlags} from "../../../mesh/mesh.js";
import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
        MeshFeatureError} from '../../../mesh/mesh_base.js';
import {CurveSpline} from "../../../curve/curve.js";

export class CurveToolBase extends MeshToolBase {
  constructor(manager) {
    super(manager);

    this._isCurveTool = true;

    let path = "scene.tools." + this.constructor.widgetDefine().name;
    path += ".curve";

    this._meshPath = path;
    this.selectMask = SelMask.VERTEX|SelMask.HANDLE;

    let features = MeshFeatures.MAKE_VERT|MeshFeatures.KILL_VERT;
    features |= MeshFeatures.MAKE_EDGE|MeshFeatures.KILL_EDGE;
    features |= MeshFeatures.SPLIT_EDGE|MeshFeatures.JOIN_EDGE;
    features |= MeshFeatures.EDGE_HANDLES | MeshFeatures.EDGE_CURVES_ONLY;

    this.mesh = new CurveSpline(features);
    this.drawflag = this.mesh.drawflag = MeshDrawFlags.SHOW_NORMALS;
  }

  static widgetDefine() {return {
    name        : "curve_test",
    uianme      : "Curve Test",
    icon       : Icons.APPEND_VERTEX,
    flag        : 0,
    description : "curve tester"
  }}

  /*
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
  //*/

  static isCurveTool(instance) {
    return instance._isCurveTool;
  }

  static buildElementSettings(container) {
    let col = container.col();
    let path = "scene.tools." + this.widgetDefine().name;

    col.prop(path + ".curve.verts.active.namedLayers['knot'].speed");
  }

  static buildSettings(container) {
  }

  static buildHeader(header, addHeaderRow) {
    let strip = header.strip();

    strip.useIcons();

    let path = "scene.tools." + this.widgetDefine().name;
    path += ".curve";

    //strip.tool(`mesh.delete_selected`);
    //strip.tool(`mesh.clear_points`);
  }

  getMeshPaths() {
    return [this._meshPath];
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    let mstruct = api.mapStruct(CurveSpline, false);

    tstruct.struct("mesh", "curve", "Curve", mstruct);

    let onchange = () => {
      window.redraw_viewport();
    };

    return tstruct;
  }

  on_mousedown(e, x, y, was_touch) {
    return super.on_mousedown(e, x, y, was_touch);
  }

  update() {
    super.update();
  }

  findnearest3d(view3d, x, y, selmask) {
    /*
    make sure findnearest api gets the right mesh
    */
    let ctx = this.buildFakeContext(this.ctx);
    return FindNearest(ctx, selmask, new Vector2([x, y]), view3d);
  }

  on_mousemove(e, x, y, was_touch) {
    return super.on_mousemove(e, x, y, was_touch);
  }

  reset() {
    this.mesh = new CurveSpline();
  }

  drawSphere(gl, view3d, p, scale=0.01) {
    let cam = this.ctx.view3d.camera;
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
    this.mesh.drawflag = this.drawflag;
    super.draw(gl, view3d);
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }
  }

}

CurveToolBase.STRUCT = STRUCT.inherit(CurveToolBase, ToolMode) + `
  mesh : mesh.CurveSpline;
}`;
nstructjs.manager.add_class(CurveToolBase);
ToolMode.register(CurveToolBase);
