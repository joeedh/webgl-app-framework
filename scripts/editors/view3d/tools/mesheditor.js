import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/core/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {MeshToolBase} from "./meshtool.js";

let STRUCT = nstructjs.STRUCT;
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
import {MovableWidget} from '../widget_utils.js';
import {SnapModes} from "../transform_ops.js";

import {Mesh, MeshDrawFlags} from "../../../mesh/mesh.js";
import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError} from '../../../mesh/mesh_base.js';
import {CurveSpline} from "../../../curve/curve.js";
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {ContextOverlay} from "../../../path.ux/scripts/controller/context.js";
import {PackFlags} from "../../../path.ux/scripts/core/ui_base.js";

export class MeshEditor extends MeshToolBase {
  constructor(manager) {
    super(manager);

    this.selectMask = SelMask.VERTEX|SelMask.HANDLE;
  }

  static widgetDefine() {return {
    name        : "mesh",
    uianme      : "Edit Geometry",
    icon       : Icons.MESHTOOL,
    flag        : 0,
    description : "Edit vertices/edges/faces"
  }}

  static buildElementSettings(container) {
    super.buildElementSettings(container);
    let path = "scene.tools." + this.widgetDefine().name;
  }

  static buildSettings(container) {
  }

  static buildHeader(header, addHeaderRow) {
    let strip = header.strip();

    strip.useIcons();
    strip.inherit_packflag |= PackFlags.HIDE_CHECK_MARKS;

    strip.prop("selectmode_enum[VERTEX]");
    if (this.haveHandles()) {

    }
    strip.prop("selectmode_enum[EDGE]");
    strip.prop("selectmode_enum[FACE]");

    //strip.tool(`mesh.delete_selected`);
    //strip.tool(`mesh.clear_points`);
  }

  haveHandles() {
    let ctx = this.ctx;
    if (!ctx)
      return;


  }

  getMeshPaths() {
    let rets = [];

    for (let ob of this.ctx.selectedMeshObjects) {
      let path  = `library.mesh[${ob.lib_id}]`
    }
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
      //let path = "scene.tools." + this.constructor.widgetDefine().name;
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
      let key = "toolmode_" + this.constructor.widgetDefine().name;

      let data = this.curve !== undefined ? this.curve : CurveSpline;

      this.sceneObject = this.ctx.scene.getInternalObject(this.ctx, key, data);
      this.sceneObject.flag |= ObjectFlags.SELECT;
      this.curve = this.sceneObject.data;
      this.curve.owningToolMode = this.constructor.widgetDefine().name;
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

    this.curve = getblock_addUser(this.curve);
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }

    this.curve.owningToolMode = this.constructor.widgetDefine().name;
  }

}

MeshEditor.STRUCT = STRUCT.inherit(MeshEditor, ToolMode) + `
  curve    : DataRef | DataRef.fromBlock(obj.curve);
  drawflag : int;
}`;
nstructjs.manager.add_class(MeshEditor);
ToolMode.register(MeshEditor);
