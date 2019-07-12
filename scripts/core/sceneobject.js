import {DataBlock, DataRef} from './lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Graph} from '../graph.js';
import {Matrix4, Vector3, Vector4, Quat} from '../util/vectormath.js';

import {Vector3Socket, DependSocket, Matrix4Socket, Vector4Socket} from './graphsockets.js';

export const ObjectFlags = {
  SELECT : 1,
  HIDE   : 2
};

export class SceneObject extends DataBlock {
  constructor(data=undefined) {
    this.data = data;
    super();
  }

  static nodedef() {return {
    inputs : {
      depend : new DependSocket("depend", SocketFlags.MULTI),
      matrix : new Matrix4Socket("matrix"),
      color  : new Vec4Socket("color"),
      loc    : new Vec3Socket("loc"),
      rot    : new Vec3Socket("rot"),
      scale  : new Vec3Socket("scale")
    },
    
    outputs : {
      color : new Vec4Socket("color"),
      matrix : new Matrix4Socket("matrix"),
      depend : new DependSocket("depend")
    }
  }}
  
  exec() {
    let pmat = this.inputs.matrix.getValue();
    if (this.inputs.matrix.edges.length > 0) {
      pmat = this.inputs.matrix.edges[0].getValue();
    }
    
    let loc = this.inputs.loc.getValue();
    let rot = this.inputs.loc.getValue();
    let scale = this.inputs.loc.getValue();
    
    let mat = this.outputs.matrix.getValue();
    
    mat.makeIdentity();
    
    mat.translate(loc[0], loc[1], loc[2]);
    mat.euler_rotate(rot[0], rot[1], rot[2]);
    mat.scale(scale[0], scale[1], scale[2]);
    
    mat.multiply(pmat);
    
    this.outputs.matrix.setValue(mat);
    this.outputs.depend.setValue(true);

    this.outputs.matrix.update();
    this.outputs.depend.update();
  }

  static blockDefine() { return {
    typeName    : "object",
    defaultName : "Object",
    uiName   : "Object",
    flag     : 0,
    icon     : -1
  }}
  
  static fromSTRUCT(reader) {
    let ret = new Scene();
    
    reader(ret);
    
    return ret;
  }
  
  dataLink(getblock, getblock_us) {
  }
}

DataBlock.register(SceneObject);
SceneObject.STRUCT = STRUCT.inherit(SceneObject, DataBlock) + `
  data : DataRef | DataRef.fromBlock(obj.data);
}
`;
