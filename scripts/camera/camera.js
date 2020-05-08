import {SceneObjectData} from "../sceneobject/sceneobject_base.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../path.ux/scripts/vectormath.js";
import {util, cconst, nstructjs} from "../path.ux/scripts/pathux.js";
import {DataBlock} from "../core/lib_api.js";
import {Camera} from "../core/webgl.js";
import {StandardTools} from "../sceneobject/stdtools.js";
import {SelMask} from "../editors/view3d/selectmode.js";

export class CameraData extends SceneObjectData {
  constructor() {
    super();

    this.camera = new Camera();
    this.curvespline = undefined;
  }

  /**draws IDs.  no need for packing,
   they're drawn into a float framebuffer

   red should be sceneobject id + 1.
   green should be any sub-id (also + 1) provided by
   sceneobjectdata, e.g. vertices in a mesh.
   */
  drawIds(view3d, gl, selectMask, uniforms, object) {

  }

  draw(view3d, gl, uniforms, program, object) {

  }

  drawWireframe(view3d, gl, uniforms, program, object) {

  }

  drawOutline(view3d, gl, uniforms, program, object) {
    this.drawWireframe(...arguments);
  }

  static nodedef() {return {
    name     : "camera",
    uiname   : "Camera",
    inputs   : {},
    outputs  : {}
  }}

  static blockDefine() {return {
    typeName     : "camera",
    defaultName  : "Camera",
    uiName       : "Camera",
    flag         : 0,
    icon         : -1
  }}

  static dataDefine() {return {
    name       : "",
    selectMask : SelMask.CAMERA, //valid selection modes for StandardTools, see SelMask
    tools      : undefined
  }}

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);

    this.curvespline = getblock_addUser(this.curvespline);
  }

}

CameraData.STRUCT = nstructjs.inherit(CameraData, SceneObjectData) + `
  camera       : Camera;
  curvespline  : DataRef | DataRef.fromBlock(obj.curvespline);
}
`;

nstructjs.register(CameraData);
DataBlock.register(CameraData);
SceneObjectData.register(CameraData);
