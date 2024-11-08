import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.ts";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {MeshToolBase} from "./meshtool.js";

import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../../../shaders/shaders.js';
import {MovableWidget} from '../widgets/widget_utils.js';
import {SnapModes} from "../transform/transform_ops.js";

import {Mesh, MeshDrawFlags} from "../../../mesh/mesh.js";
import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
        MeshFeatureError} from '../../../mesh/mesh_base.js';
import {CurveSpline} from "../../../curve/curve.js";
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {ContextOverlay, nstructjs} from "../../../path.ux/scripts/pathux.js";

export class CurveToolOverlay extends ContextOverlay {
  constructor(state, toolmode) {
    super(state);

    if (toolmode !== undefined) {
      this._toolclass = toolmode.constructor;
      this._selectMask = toolmode.selectMask;

      toolmode._getObject();
      this._ob = DataRef.fromBlock(toolmode.sceneObject);
    }
  }

  copy() {
    let ret = new CurveToolOverlay(this.state);

    ret._toolclass = this._toolclass;
    ret._ob = this._ob;
    ret._selectMask = this._selectMask

    return ret;
  }

  get selectMask() {
    return this.ctx.toolmode.selectMask;
    //return this._selectMask;
  }

  validate() {
    return this.ctx.scene.toolmode instanceof this._toolclass;
  }

  get selectedObjects() {
    return [this.object];
  }

  get selectedMeshObjects() {
    return [this.object];
  }

  get mesh() {
    let ob = this.ctx.datalib.get(this._ob);

    if (ob !== undefined) {
      return ob.data;
    }
  }

  get object() {
    return this.ctx.datalib.get(this._ob);
  }
}

export class CurveToolBase extends MeshToolBase {
  constructor(manager) {
    super(manager);

    this._isCurveTool = true;

    //internal scene object
    this.sceneObject = undefined;

    this._meshPath = undefined;
    this.selectMask = SelMask.VERTEX|SelMask.HANDLE;

    this.drawflag = MeshDrawFlags.SHOW_NORMALS;

    this.curve = undefined; //is created later
  }

  static toolModeDefine() {return {
    name        : "curve_test",
    uianme      : "Curve Test",
    icon       : Icons.APPEND_VERTEX,
    flag        : 0,
    description : "curve tester"
  }}

  static getContextOverlayClass() {
    return CurveToolOverlay;
  }

  static isCurveTool(instance) {
    return instance._isCurveTool;
  }

  static buildElementSettings(container) {
    let col = container.col();
    let path = "scene.tools." + this.toolModeDefine().name;

    col.prop(path + ".curve.verts.active.namedLayers['knot'].speed");
    col.prop(path + ".curve.verts.active.namedLayers['knot'].tilt");
  }

  static buildSettings(container) {
  }

  static buildHeader(header, addHeaderRow) {
    let strip = header.strip();

    strip.useIcons();

    let path = "scene.tools." + this.toolModeDefine().name;
    path += ".curve";

    //strip.tool(`mesh.delete_selected`);
    //strip.tool(`mesh.clear_points`);
  }

  getMeshPaths() {
    if (this._meshPath === undefined) {
      this._getObject();

      if (this.sceneObject !== undefined) {
        let ob = this.sceneObject;
        //set path to parent SceneObject so resolveMesh knows to
        //set ownerMatrix and ownerId
        let path = `objects[${ob.lib_id}]`;
        this._meshPath = path;
      } else {
        return [];
      }
      //let path = "scene.tools." + this.constructor.toolModeDefine().name;
      //path += ".curve";
    }

    return [this._meshPath];
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    let mstruct = api.mapStruct(CurveSpline, false);

    tstruct.struct("curve", "curve", "Curve", mstruct);

    let onchange = () => {
      window.redraw_viewport();
    };

    return tstruct;
  }

  on_mousedown(e, x, y, was_touch) {
    return super.on_mousedown(e, x, y, was_touch);
  }

  onActive() {
    super.onActive();
  }

  onInactive() {
    super.onInactive();
  }

  _getObject() {
    if (this.sceneObject === undefined) {
      let key = "toolmode_" + this.constructor.toolModeDefine().name;

      let data = this.curve !== undefined ? this.curve : CurveSpline;

      this.sceneObject = this.ctx.scene.getInternalObject(this.ctx, key, data);
      this.ctx.scene.setSelect(this.sceneObject, true);

      this.curve = this.sceneObject.data;
      this.curve.owningToolMode = this.constructor.toolModeDefine().name;
    }
  }

  update() {
    this._getObject();

    super.update();
  }

  findnearest3d(view3d, x, y, selmask) {
    /*
    make sure findnearest api gets the right mesh
    */
    //let ctx = this.buildFakeContext(this.ctx);
    let ctx = this.ctx;
    return FindNearest(ctx, selmask, new Vector2([x, y]), view3d);
  }

  on_mousemove(e, x, y, was_touch) {
    return super.on_mousemove(e, x, y, was_touch);
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
    this._getObject();
    
    if (this.curve !== undefined) {
      if (this.curve.drawflag !== this.drawflag) {
        this.curve.drawflag = this.drawflag;
        this.curve.regenRender();
      }

      super.draw(gl, view3d);
    }
  }

  dataLink(scene, getblock, getblock_addUser) {
    super.dataLink(...arguments);

    this.curve = getblock_addUser(this.curve, this);
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }

    this.curve.owningToolMode = this.constructor.toolModeDefine().name;
  }

}

CurveToolBase.STRUCT = nstructjs.inherit(CurveToolBase, ToolMode) + `
  curve    : DataRef | DataRef.fromBlock(obj.curve);
  drawflag : int;
}`;
nstructjs.register(CurveToolBase);
ToolMode.register(CurveToolBase);
