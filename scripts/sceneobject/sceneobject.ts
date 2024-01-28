import {DataBlock, DataRef} from '../core/lib_api.js';
import {
  nstructjs, util, math,
  Matrix4, EulerOrders, Vector3, Vector4, Quat
} from '../path.ux/pathux.js';

import {Graph, SocketFlags} from '../core/graph.js';
import {
  Vec3Socket, DependSocket, Matrix4Socket,
  Vec4Socket, EnumSocket
} from '../core/graphsockets.js';
import {Shaders} from '../shaders/shaders.js';
import {SceneObjectData} from "./sceneobject_base";
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import {ShaderProgram} from "../../types/scripts/core/webgl";
import {View3D} from "../../types/scripts/editors/view3d/view3d";
import {Material} from "../core/material";

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
export enum ObjectFlags {
  NONE = 0,
  SELECT = 1,
  HIDE = 2,
  LOCKED = 4,
  HIGHLIGHT = 8,
  ACTIVE = 16,
  INTERNAL = 32,
  DRAW_WIREFRAME = 64
}

function mix(a, b, t) {
  return new Vector4(a).interp(b, t);
}

export let Colors = {
  0: [0.7, 0.7, 0.7, 1.0], //0
  [ObjectFlags.SELECT]: [1.0, 0.378, 0.15, 1.0], //1
  [ObjectFlags.HIGHLIGHT]: [0.9, 0.5, 0.3, 1.0], //8
  [ObjectFlags.ACTIVE]: [0.0, 0.5, 1.0, 1.0]
};
Colors[ObjectFlags.SELECT | ObjectFlags.HIGHLIGHT]
  = mix(Colors[ObjectFlags.SELECT], Colors[ObjectFlags.HIGHLIGHT], 0.5);
Colors[ObjectFlags.SELECT | ObjectFlags.ACTIVE]
  = mix(Colors[ObjectFlags.SELECT], Colors[ObjectFlags.ACTIVE], 0.5);
Colors[ObjectFlags.SELECT | ObjectFlags.ACTIVE | ObjectFlags.HIGHLIGHT]
  = mix(Colors[ObjectFlags.SELECT | ObjectFlags.HIGHLIGHT], Colors[ObjectFlags.ACTIVE | ObjectFlags.SELECT], 0.5);

export function composeObjectMatrix(loc: Vector3, rot: Vector3, scale: Vector3, rotorder: EulerOrders, mat = new Matrix4()) {
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

  mat.euler_rotate_order(rot[0], rot[1], rot[2], rotorder);
  mat.scale(scale[0], scale[1], scale[2]);

  let m = mat.$matrix;
  m.m41 = loc[0];
  m.m42 = loc[1];
  m.m43 = loc[2];
  m.m44 = 1.0;
  //mat.translate(loc[0], loc[1], loc[2]);

  return mat;
}

export class SceneObject<InputSet={}, OutputSet={}> extends DataBlock<
  InputSet &
  {
    depend: DependSocket,
    rot: Vec3Socket,
    loc: Vec3Socket,
    scale: Vec3Socket,
    rotOrder: EnumSocket
    color: Vec4Socket,
    matrix: Matrix4Socket
  },
  OutputSet &
  {
    depend: DependSocket,
    color: Vec4Socket,
    matrix: Matrix4Socket,
  }
> {
  data: SceneObjectData<any, any>;
  flag: ObjectFlags;

  constructor(data: SceneObjectData<any, any> = undefined) {
    super();

    this.data = data;
    this.flag = 0;

    if (data) {
      data.lib_addUser(this);
    }
    /** @type {ObjectFlags}*/
  }

  get rotationEuler() {
    return this.inputs.rot.getValue();
  }

  get rotationOrder() {
    return this.inputs.rotOrder.getValue();
  }

  set rotationOrder(i) {
    this.inputs.rotOrder.setValue(i);
  }

  get location() {
    return this.inputs.loc.getValue();
  }

  get scale() {
    return this.inputs.scale.getValue();
  }

  get material(): Material | undefined {
    return this.data !== undefined && this.data.usesMaterial ? this.data.material : undefined;
  }

  set material(mat: Material | undefined) {
    if (this.data !== undefined && this.data.usesMaterial) {
      this.data.material = mat;
      window.redraw_viewport();
    }
  }

  get locationWorld() {
    let ret = loc_rets.next().zero();

    ret.multVecMatrix(this.outputs.matrix.getValue());

    return ret;
  }

  static nodedef() {
    return {
      name: "sceneobject",
      inputs: {
        depend: new DependSocket("depend", SocketFlags.MULTI),
        matrix: new Matrix4Socket("matrix"),
        color: new Vec4Socket("color", undefined, new Vector4([0.5, 0.5, 0.5, 1.0])),
        loc: new Vec3Socket("loc"),
        rot: new Vec3Socket("rot").noUnits(),
        rotOrder: new EnumSocket("Euler Order", EulerOrders, undefined,
          EulerOrders.XYZ),
        scale: new Vec3Socket("scale", undefined, new Vector3([1, 1, 1])).noUnits()
      },

      outputs: {
        color: new Vec4Socket("color"),
        matrix: new Matrix4Socket("matrix"),
        depend: new DependSocket("depend")
      }
    }
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

  static STRUCT = nstructjs.inlineRegister(this, `
SceneObject {
  flag : int; 
  data : DataRef | DataRef.fromBlock(obj.data);
}
`)

  getEditorColor() {
    let flag = this.flag & (ObjectFlags.SELECT | ObjectFlags.HIGHLIGHT | ObjectFlags.ACTIVE);

    return Colors[flag];
  }

  destroy() {
    if (this.data !== undefined) {
      this.data.lib_remUser(this);
    }
  }

  graphDisplayName() {
    return this.name + ":" + this.graph_id + ":" + this.lib_id;
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
    let pmat: Matrix4;

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

    mat.euler_rotate_order(rot[0], rot[1], rot[2], this.inputs.rotOrder.getValue());
    mat.scale(scale[0], scale[1], scale[2]);

    let m = mat.$matrix;
    m.m41 = loc[0];
    m.m42 = loc[1];
    m.m43 = loc[2];
    m.m44 = 1.0;
    //mat.translate(loc[0], loc[1], loc[2]);

    mat.multiply(pmat);

    this.outputs.matrix.setValue(mat);
    this.outputs.depend.setValue(true);

    this.outputs.matrix.graphUpdate();
    this.outputs.depend.graphUpdate();
  }

  loadMatrixToInputs(mat: Matrix4): void {
    let rot = new Vector3();
    let loc = new Vector3();
    let size = new Vector3();

    mat.decompose(loc, rot, size);

    this.inputs.loc.setValue(loc);
    this.inputs.rot.setValue(rot);
    this.inputs.scale.setValue(size);

    this.update();
  }

  copyTo(b) {
    super.copyTo(b, false);
  }

  copy(addLibUsers = false) {
    //note that DataBlock.prototype.copy
    //will have copied datagraph sockets for us, though not their connections

    let ret = super.copy();

    ret.flag = this.flag;
    ret.data = this.data;

    if (addLibUsers) {
      ret.data.lib_addUser(ret);
    }

    return ret;
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

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
    super.loadSTRUCT(reader);
  }

  dataLink(getblock, getblock_addUser) {
    this.data = getblock_addUser(this.data, this);
  }

  draw(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any, program?: ShaderProgram): void {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;


    if (this.flag & ObjectFlags.DRAW_WIREFRAME) {
      uniforms.polygonOffset = uniforms.polygonOffset || 0.0;

      this.data.draw(view3d, gl, uniforms, program, this);

      program = Shaders.ObjectLineShader;

      let off = uniforms.polygonOffset;

      uniforms.polygonOffset = 0.3;
      uniforms.uColor = [0, 0, 0, 1];

      this.data.drawWireframe(view3d, gl, uniforms, program, this);

      uniforms.polygonOffset = off;
    } else {
      this.data.draw(view3d, gl, uniforms, program, this);
    }
  }

  drawWireframe(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any, program?: ShaderProgram): void {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawWireframe(view3d, gl, uniforms, program, this);
  }

  drawOutline(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any, program?: ShaderProgram): void {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawOutline(view3d, gl, uniforms, program, this);
  }

  drawIds(view3d: View3D, gl: WebGL2RenderingContext, selectMask: number, uniforms: any): void {
    uniforms.objectMatrix = this.outputs.matrix.getValue();
    uniforms.object_id = this.lib_id;

    this.data.drawIds(view3d, gl, selectMask, uniforms, this);
  }
}

DataBlock.register(SceneObject);
