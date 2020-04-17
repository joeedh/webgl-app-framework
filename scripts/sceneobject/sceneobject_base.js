import {DataBlock, DataRef} from '../core/lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Vector3} from '../util/vectormath.js';
import {StandardTools} from './stdtools.js';

export const ObjectDataTypes = [];

export class SceneObjectData extends DataBlock {
  constructor() {
    super();
    
    this.material = undefined;
    this.usesMaterial = false;
  }

  static dataDefine() {return {
    name       : "",
    selectMask : 0, //valid selection modes for StandardTools, see SelMask
    tools      : StandardTools
  }}

  static getTools() {
    let def = this.dataDefine();

    if (def.tools)
      return def.tools;

    return StandardTools;
  }

  copy() {
    throw new Error("implement me");
  }

  copyAddUsers() {
    return this.copy();
  }

  getBoundingBox() {
    let d = 5;

    console.warn("getBoundingBox: implement me!");

    return [
      new Vector3([d, d, d]),
      new Vector3([d, d, d])
    ]
  }

  draw(view3d, gl, uniforms, program, object) {
    throw new Error("implement me");
  }

  drawWireframe(view3d, gl, uniforms, program, object) {

  }

  drawOutline(view3d, gl, uniforms, program, object) {
    this.drawWireframe(...arguments);
  }

  onContextLost(e) {

  }

  static register(cls) {
    if (!cls.hasOwnProperty("dataDefine")) {
      throw new Error("missing .dataDefine static method");
    }

    let def = cls.dataDefine();
    if (!def.hasOwnProperty("selectMask")) {
      throw new Error("dataDefine() is missing selectMask field")
    }

    ObjectDataTypes.push(cls);
  }
}
SceneObjectData.STRUCT = STRUCT.inherit(SceneObjectData, DataBlock) + `
}
`;
nstructjs.manager.add_class(SceneObjectData);
