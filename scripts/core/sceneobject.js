import {DataBlock, DataRef} from './lib_api.js';
import '../path.ux/scripts/struct.js';
import {Light} from '../light/light.js';
let STRUCT = nstructjs.STRUCT;
import {Graph, SocketFlags} from './graph.js';
import {Matrix4, Vector3, Vector4, Quat} from '../util/vectormath.js';
import {Mesh} from '../mesh/mesh.js';
import {Vec3Socket, DependSocket, Matrix4Socket, Vec4Socket} from './graphsockets.js';

export const ObjectFlags = {
  SELECT    : 1,
  HIDE      : 2,
  LOCKED    : 4,
  HIGHLIGHT : 8,
  ACTIVE    : 16
};

let _mattemp = new Matrix4();

function mix(a, b, t) {
  return new Vector4(a).interp(b, t);
}
export let Colors = {
  0                       : [0.7, 0.7, 0.7, 1.0], //0
  [ObjectFlags.SELECT]    : [1.0, 0.7, 0.5, 1.0], //1
  [ObjectFlags.HIGHLIGHT] : [1.0, 0.8, 0.2, 1.0], //8
  [ObjectFlags.ACTIVE]    : [1.0, 0.5, 0.25, 1.0]
};
Colors[ObjectFlags.SELECT | ObjectFlags.HIGHLIGHT]
  = mix(Colors[ObjectFlags.SELECT], Colors[ObjectFlags.HIGHLIGHT], 0.5);
Colors[ObjectFlags.SELECT | ObjectFlags.ACTIVE]
  = mix(Colors[ObjectFlags.SELECT], Colors[ObjectFlags.ACTIVE], 0.5);
Colors[ObjectFlags.SELECT | ObjectFlags.ACTIVE | ObjectFlags.HIGHLIGHT]
  = mix(Colors[ObjectFlags.SELECT|ObjectFlags.HIGHLIGHT], Colors[ObjectFlags.ACTIVE|ObjectFlags.SELECT], 0.5);

window._colors = Colors;


export class SceneObject extends DataBlock {
  constructor(data=undefined) {
    super();
    
    this.data = data;
    this.flag = 0;
  }

  getEditorColor() {
    let flag = this.flag & (ObjectFlags.SELECT | ObjectFlags.HIGHLIGHT | ObjectFlags.ACTIVE);

    return Colors[flag];
  }

  static nodedef() {return {
    inputs : {
      depend : new DependSocket("depend", SocketFlags.MULTI),
      matrix : new Matrix4Socket("matrix"),
      color  : new Vec4Socket("color"),
      loc    : new Vec3Socket("loc"),
      rot    : new Vec3Socket("rot"),
      scale  : new Vec3Socket("scale", undefined, [1, 1, 1])
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

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }

  dataLink(getblock, getblock_us) {
    this.data = getblock_us(this.data);
  }
  
  draw(gl, uniforms, program) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    if ((this.data instanceof Mesh) || (this.data instanceof Light)) {
      this.data.draw(gl, uniforms, program, this);
    }
  }

  drawWireframe(gl, uniforms, program) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawWireframe(gl, uniforms, program, this);
  }
}
SceneObject.STRUCT = STRUCT.inherit(SceneObject, DataBlock) + `
  flag : int; 
  data : DataRef | DataRef.fromBlock(obj.data);
}
`;
nstructjs.manager.add_class(SceneObject);

DataBlock.register(SceneObject);
