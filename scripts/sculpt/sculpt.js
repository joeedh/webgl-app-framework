import {SceneObjectData} from "../sceneobject/sceneobject_base.js";
import {util, nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';
import {Node} from "../core/graph.js";
import {DataBlock} from "../core/lib_api.js";

export class GPUSculpt extends SceneObjectData {
  constructor() {
    super();
  }

  static nodedef() {return {
    name : "trimesh",
    inputs : Node.inherit(),
    outputs : Node.inherit()
  }}

  static blockDefine(){return {
    typeName : "trimesh",
    uiName : "Sculpt",
    defaultName : "Sculpt"
  }}

  static dataDefine() {return {
    name : "trimesh"
  }}
}

GPUSculpt.STRUCT = STRUCT.inherit(GPUSculpt, SceneObjectData) + `
}`;

DataBlock.register(GPUSculpt);
SceneObjectData.register(GPUSculpt);
nstructjs.register(GPUSculpt);
