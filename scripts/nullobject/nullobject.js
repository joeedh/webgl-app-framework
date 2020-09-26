import {SceneObjectData} from "../sceneobject/sceneobject_base.js";
import '../path.ux/scripts/util/struct.js';
import {DataBlock} from "../core/lib_api.js";
import {NodeFlags} from "../core/graph.js";
let STRUCT = nstructjs.STRUCT;
import {SelMask} from "../editors/view3d/selectmode.js";

export class NullObject {
  static blockDefine() {return {
    typeName    : "nullobject",
    defaultName : "Null Object",
    uiName      : "Null Object",
    icon        : -1,
    flag        : 0
  }}

  static nodedef() {return {
    name   : "NullObject",
    flag   : NodeFlags.SAVE_PROXY,
    inputs : Node.inherit(),
    outputs : Node.inherit()
  }}

  static dataDefine() {return {
    name       : "NullObject",
    selectMask : SelMask.NULLOBJECT,
    tools      : undefined
  }}
};

NullObject.STRUCT = STRUCT.inherit(NullObject, SceneObjectData) + `
}
`;
nstructjs.register(NullObject);

DataBlock.register(NullObject);
SceneObjectData.register(NullObject);
