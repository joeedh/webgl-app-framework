import {DataBlock, DataRef} from '../core/lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Vector3} from '../util/vectormath.js';

export class SceneObjectData extends DataBlock {
  constructor() {
    super();
    
    this.material = undefined;
    this.usesMaterial = false;
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
}
SceneObjectData.STRUCT = STRUCT.inherit(SceneObjectData, DataBlock) + `
}
`;
nstructjs.manager.add_class(SceneObjectData);
