import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/struct.js';
import {nstructjs, util} from '../../../path.ux/scripts/pathux.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../../../path.ux/scripts/pathux.js";

import {CurveToolBase} from './curvetool.js';
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {CurveSpline} from "../../../curve/curve.js";
import {CameraData} from "../../../camera/camera.js";

export class CameraPathTool extends CurveToolBase {
  constructor(manager) {
    super(manager);

    this.animationSpeed = 1.0;
    this.cameraObject = undefined;
    this.camera = undefined;
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    tstruct.float("animationSpeed", "animationSpeed", "Anim Speed").range(0.01, 100.0);
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
    } else if (!this.camera) {
      this.camera = this.cameraObject.data;
    }
  }

  static buildSettings(container) {
    super.buildSettings(container);

    let path = "scene.tools." + this.widgetDefine().name;

    let col = container.col();
    col.prop(path + ".animationSpeed");

    col.prop(path + ".camera.camera.fov");
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
  animationSpeed : float;
  cameraObject   : DataRef | DataRef.fromBlock(obj.cameraObject);
}`;

nstructjs.register(CameraPathTool);
ToolMode.register(CameraPathTool);
