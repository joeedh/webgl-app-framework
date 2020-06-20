import {DataBlock, DataRef} from '../core/lib_api.js';
import '../path.ux/scripts/util/struct.js';
import {Light} from '../light/light.js';
let STRUCT = nstructjs.STRUCT;
import {Graph, SocketFlags} from '../core/graph.js';
import {Matrix4, Vector3, Vector4, Quat} from '../util/vectormath.js';
import {Vec3Socket, DependSocket, Matrix4Socket, Vec4Socket} from '../core/graphsockets.js';
import * as util from '../util/util.js';

import * as THREE from '../extern/three.js';

let loc_rets = util.cachering.fromConstructor(Vector3, 256);

/**
 Scene object flags

 @example

 export const ObjectFlags = {
   SELECT    : 1,
   HIDE      : 2,
   LOCKED    : 4,
   HIGHLIGHT : 8,
   ACTIVE    : 16
 };
*/
export const ObjectFlags = {
  SELECT    : 1,
  HIDE      : 2,
  LOCKED    : 4,
  HIGHLIGHT : 8,
  ACTIVE    : 16,
  INTERNAL  : 32
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
  constructor(data = undefined) {
    super();

    this.data = data;
    this.flag = 0;
    /** @type {ObjectFlags}*/
  }

  getEditorColor() {
    let flag = this.flag & (ObjectFlags.SELECT | ObjectFlags.HIGHLIGHT | ObjectFlags.ACTIVE);

    return Colors[flag];
  }

  destroy() {
    if (this.data !== undefined) {
      this.data.lib_remUser(this);
    }
  }

  static nodedef() {
    return {
      inputs: {
        depend: new DependSocket("depend", SocketFlags.MULTI),
        matrix: new Matrix4Socket("matrix"),
        color: new Vec4Socket("color"),
        loc: new Vec3Socket("loc"),
        rot: new Vec3Socket("rot"),
        scale: new Vec3Socket("scale", undefined, [1, 1, 1])
      },

      outputs: {
        color: new Vec4Socket("color"),
        matrix: new Matrix4Socket("matrix"),
        depend: new DependSocket("depend")
      }
    }
  }

  get material() {
    return this.data !== undefined && this.data.usesMaterial ? this.data.material : undefined;
  }

  set material(mat) {
    if (this.data !== undefined && this.data.usesMaterial) {
      this.data.material = mat;
      window.redraw_viewport();
    }
  }

  ensureGraphConnection() {
    if (!this.data.inputs.depend) {
      return; //data doesn't have a depend socket
    }

    for (let s of this.outputs.depend.edges) {
      if (s.node === this.data) {
        return true;
      }
    }

    console.log("make graph connection");

    this.outputs.depend.connect(this.data.inputs.depend);

    return false;
  }

  exec() {
    let pmat;

    this.ensureGraphConnection();

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

  loadMatrixToInputs(mat) {
    let rot = new Vector3();
    let loc = new Vector3();
    let size = new Vector3();

    mat.decompose(loc, rot, size);

    this.inputs.loc.setValue(loc);
    this.inputs.rot.setValue(rot);
    this.inputs.scale.setValue(size);

    this.update();
  }

  getBoundingBox() {
    let ret = this.data.getBoundingBox();

    if (!ret) {
      ret = [new Vector3(), new Vector3()];
    } else {
      ret = [ret[0].copy(), ret[1].copy()];
    }

    let matrix = this.outputs.matrix.getValue();

    ret[0].multVecMatrix(matrix);
    ret[1].multVecMatrix(matrix);

    return ret;
  }

  get locationWorld() {
    let ret = loc_rets.next().zero();

    ret.multVecMatrix(this.outputs.matrix.getValue());

    return ret;
  }

  static blockDefine() {
    return {
      typeName: "object",
      defaultName: "Object",
      uiName: "Object",
      flag: 0,
      icon: -1
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }

  dataLink(getblock, getblock_addUser) {
    this.data = getblock_addUser(this.data);
  }

  draw(view3d, gl, uniforms, program) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.draw(view3d, gl, uniforms, program, this);
  }

  drawWireframe(view3d, gl, uniforms, program) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawWireframe(view3d, gl, uniforms, program, this);
  }

  drawOutline(view3d, gl, uniforms, program) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawOutline(view3d, gl, uniforms, program, this);
  }

  drawIds(view3d, gl, selectMask, uniforms) {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawIds(view3d, gl, selectMask, uniforms, this);
  }
}

SceneObject.STRUCT = STRUCT.inherit(SceneObject, DataBlock) + `
  flag : int; 
  data : DataRef | DataRef.fromBlock(obj.data);
}
`;
nstructjs.manager.add_class(SceneObject);

DataBlock.register(SceneObject);
