import {DataBlock, DataRef} from '../core/lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class SceneObjectData extends DataBlock {
  draw(gl, uniforms, program, object) {
    throw new Error("implement me");
  }

  drawWireframe(gl, uniforms, program, object) {

  }
}
SceneObjectData.STRUCT = STRUCT.inherit(SceneObjectData, DataBlock) + `
}
`;
nstructjs.manager.add_class(SceneObjectData);