import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/core/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {nstructjs, util} from '../../../path.ux/scripts/pathux.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../../../path.ux/scripts/pathux.js";

import {CurveToolBase, CurveToolOverlay} from './curvetool.js';
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {CurveSpline} from "../../../curve/curve.js";
import {CameraData} from "../../../camera/camera.js";
import {CameraTypes} from "../../../camera/camera_types.js";

export class CameraPathOverlay extends CurveToolOverlay {
  get camera() {
    return this.ctx.toolmode.camera.finalCamera;
  }

  get timeStart() {
    return 0;
  }

  get timeEnd() {
    let toolmode = this.ctx.toolmode;

    return toolmode.camera.speed * toolmode.curve.length;
  }
}

export class CameraPathTool extends CurveToolBase {
  constructor(manager) {
    super(manager);

    this.cameraObject = undefined;
    this.camera = undefined;
  }

  static getContextOverlayClass() {
    return CameraPathOverlay;
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    tstruct.struct("camera", "camera", "Camera", api.mapStruct(CameraData));

    return tstruct;
  }

  _getObject() {
    super._getObject();

    if (this.cameraObject === undefined) {
      let key = "toolmode_" + this.constructor.widgetDefine().name + "_camera";

      let data = this.camera !== undefined ? this.camera : CameraData;

      this.cameraObject = this.ctx.scene.getInternalObject(this.ctx, key, data);
      this.cameraObject.flag |= ObjectFlags.SELECT;
    }

    if (!this.camera) {
      this.camera = this.cameraObject.data;
    }

    //check that camera is set up right
    this.camera.type = CameraTypes.SPLINE_PATH;
    if (!this.camera.curvespline) {
      this.camera.curvespline = this.curve;
      this.curve.lib_addUser(this.camera);

      this.cameraObject.update();
      this.camera.update();
    }
  }

  static buildSettings(container) {
    super.buildSettings(container);

    let path = "scene.tools." + this.widgetDefine().name;

    let col = container.col();

    col.prop(path + ".camera.speed");
    col.prop(path + ".camera.camera.fov");
    col.prop(path + ".camera.camera.aspect");
    col.prop(path + ".camera.flipped");
    col.prop(path + ".camera.rotate");
    col.prop(path + ".camera.azimuth");
    col.prop(path + ".camera.pathFlipped");
    col.prop(path + ".camera.height");
    col.prop(path + ".camera.camera.near");
    col.prop(path + ".camera.camera.far");

    col.prop(path + ".curve.isClosed");

    col.useIcons(false);
    //col.prop("view3d.flag[SHOW_CAMERA_VIEW]");
    col.check("view3d.flag[USE_CTX_CAMERA]", "View Camera");

    let strip = col.strip();

    strip.button("Play", () => {
      strip.ctx.play();
    });

    strip.button("Stop", () => {
      strip.ctx.stop();
    });

  }

  static widgetDefine() {return {
    name        : "camera_path",
    uianme      : "Camera Path",
    icon       : Icons.CAMERA_PATH,
    flag        : 0,
    description : "Animate Camera Along Path"
  }}

  dataLink(getblock, getblock_addUser) {
    this.cameraObject = getblock_addUser(this.cameraObject);
    if (this.cameraObject) {
      this.camera = this.cameraObject.data;
    }
  }
}
CameraPathTool.STRUCT = nstructjs.inherit(CameraPathTool, CurveToolBase) + `
  cameraObject   : DataRef | DataRef.fromBlock(obj.cameraObject);
}`;

nstructjs.register(CameraPathTool);
ToolMode.register(CameraPathTool);
