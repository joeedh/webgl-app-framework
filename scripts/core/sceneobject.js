import {DataBlock, DataRef} from './lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Graph, SocketFlags} from './graph.js';
import {Matrix4, Vector3, Vector4, Quat} from '../util/vectormath.js';
import {Mesh} from './mesh.js';
import {Vec3Socket, DependSocket, Matrix4Socket, Vec4Socket} from './graphsockets.js';

export const ObjectFlags = {
  SELECT : 1,
  HIDE   : 2,
  LOCKED : 4
};

let _mattemp = new Matrix4();

export class SceneObject extends DataBlock {
  constructor(data=undefined) {
    super();
    
    this.data = data;
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
    let pmat;

    if (this.inputs.matrix.edges.length > 0) {
      pmat = this.inputs.matrix.edges[0].getValue();
    } else {
      pmat = this.inputs.matrix.getValue();
    }
    
    let loc = this.inputs.loc.getValue();
    let rot = this.inputs.rot.getValue();
    let scale = this.inputs.scale.getValue();
    
    let mat = this.outputs.matrix.getValue();
    
    mat.makeIdentity();

    if (isNaN(loc.dot(loc))) {
      loc.zero();
    }
    if (isNaN(rot.dot(rot))) {
      rot.zero();
    }
    if (isNaN(scale.dot(scale))) {
      scale[0] = scale[1] = scale[2] = 1.0;
    }


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
    let ret = new SceneObject();
    
    reader(ret);
    ret.afterSTRUCT();
    
    return ret;
  }
  
  dataLink(getblock, getblock_us) {
    this.data = getblock_us(this.data);
  }
  
  draw(gl, uniforms, program) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    
    if (this.data instanceof Mesh) {
      this.data.draw(gl, uniforms, program);
    }
  }
}
SceneObject.STRUCT = STRUCT.inherit(SceneObject, DataBlock) + `
  flag : int; 
  data : DataRef | DataRef.fromBlock(obj.data);
}
`;
nstructjs.manager.add_class(SceneObject);

DataBlock.register(SceneObject);
