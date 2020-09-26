import {SceneObjectData} from "../sceneobject/sceneobject_base.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../util/vectormath.js";
import {Shaders} from "../editors/view3d/view3d_shaders.js";
import {util, cconst, nstructjs} from "../path.ux/scripts/pathux.js";
import {DataBlock} from "../core/lib_api.js";
import {Camera} from "../core/webgl.js";
import {StandardTools} from "../sceneobject/stdtools.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {Matrix4Socket} from "../core/graphsockets.js";
import {Node, NodeFlags} from "../core/graph.js";
import {SimpleMesh, LayerTypes, PrimitiveTypes} from "../core/simplemesh.js";
import {Shapes} from "../core/simplemesh_shapes.js";
import {DependSocket} from "../core/graphsockets.js";
import {CameraTypes} from "./camera_types.js";

export class CameraData extends SceneObjectData {
  constructor() {
    super();

    this.camera = new Camera();
    this.curve = undefined;

    this.camera.pos.zero();
    this.camera.target.load([0, 0, 1]);
    this.camera.up.load([0, 1, 0]);

    this.finalCamera = new Camera();
    this.type = CameraTypes.STANDALONE;
    this.speed = 1.0;
    this.height = 1.0;
    this.azimuth = 0.0;

    this.speed = 1.0;
    this._drawkey = undefined;
    this.mesh = undefined;

    this._last_hash = undefined;
    this.pathFlipped = false;
  }

  get height() {
    return this.camera.pos[0];
  }

  set height(h) {
    this.camera.target.sub(this.camera.pos);
    this.camera.pos[0] = h;
    this.camera.target.add(this.camera.pos);
  }

  get rotate() {
    return Math.atan2(this.camera.up[1], this.camera.up[0]);
  }

  set rotate(th) {
    this.camera.up[0] = Math.cos(th);
    this.camera.up[1] = Math.sin(th);

    this.update();
  }

  get flipped() {
    return this.camera.target[2] < 0.0;
  }

  set flipped(val) {
    val = val ? -1 : 1;
    this.camera.target[2] = val;

    this.update();
  }

  /**draws IDs.  no need for packing,
   they're drawn into a float framebuffer

   red should be sceneobject id + 1.
   green should be any sub-id (also + 1) provided by
   sceneobjectdata, e.g. vertices in a mesh.
   */
  drawIds(view3d, gl, selectMask, uniforms, object) {
    let shader = Shaders.MeshIDShader;

    this.draw(view3d, gl, uniforms, shader, object);
  }

  gen(gl) {
    if (this.mesh) {
      this.mesh.destroy(gl);
    }

    let mesh = this.mesh = new SimpleMesh(LayerTypes.LOC||LayerTypes.ID|LayerTypes.COLOR);

    let th = this.camera.fovy / 180 * Math.PI;
    let id = -1, ob = this.getOwningObject();

    if (ob) {
      id = ob.lib_id;
    }

    let color = [0,0,0,1];
    let l;

    let d1=1, d2=this.camera.aspect, z = -Math.tan(Math.PI*0.5 - th*0.5);

    function line(v1, v2) {
      let l = mesh.line(v1, v2);
      l.ids(id, id);
      l.colors(color, color);
      return l;
    }

    line([0, 0, 0], [-d1, -d2, z]);
    line([0, 0, 0], [-d1, d2, z]);
    line([0, 0, 0], [d1, d2, z]);
    line([0, 0, 0], [d1, -d2, z]);

    line([-d1, -d2, z], [-d1, d2, z]);
    line([-d1, d2, z], [d1, d2, z]);
    line([d1, d2, z], [d1, -d2, z]);
    line([d1, -d2, z], [-d1, -d2, z]);

    line([0, d2, z], [0, d2+1, z]);
  }

  draw(view3d, gl, uniforms, program, object) {
    let hash = this.camera.generateUpdateHash();

    //check if we need to update to dependency graph
    //because a camera parameter has changed
    if (hash !== this._last_hash) {
      this._last_hash = hash;
      this.update();
    }

    uniforms = Object.assign(uniforms, {});

    uniforms.objectMatrix = new Matrix4(this.finalCamera.icameramat);

    let co = new Vector3();
    co.multVecMatrix(this.finalCamera.icameramat);
    let w = co.multVecMatrix(uniforms.projectionMatrix)/75.0;

    uniforms.objectMatrix.scale(w, w, w);
    //let co = new Vector3();
    //co.multVecMatrix(uniforms.objectMatrix);
    //console.log(co);

    let key = this.camera.fovy + ":" + this.camera.aspect;

    if (!this.mesh || key !== this._drawkey) {
      this._drawkey = key;
      this.gen(gl);
    }

    gl.disable(gl.DEPTH_TEST);
    this.mesh.draw(gl, uniforms, program);
    gl.enable(gl.DEPTH_TEST);

    //Shapes.CUBE.draw(gl, uniforms, program);
  }

  exec(ctx) {
    let ob = this.getOwningObject();
    let scene = ctx.scene;

    if (!ob || !scene)
      return;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());

    let amatrix = new Matrix4();
    amatrix.euler_rotate(0, this.azimuth, 0);

    if (this.type === CameraTypes.SPLINE_PATH && this.curvespline) {
      if (!this.inputs.depend.has(this.curvespline)) {
        this.inputs.depend.connect(this.curvespline.outputs.depend);
      }

      console.log("CurveSpline update");
      let time = scene.time*this.speed/scene.fps;
      let curve = this.curvespline;

      time = time % curve.length;
      if (this.pathFlipped) {
        time = curve.length - time;
      }

      let tan = new Vector3(), nor = new Vector3();

      let p = curve.evaluate(time, tan, nor);
      let bin = new Vector3(tan).cross(nor);

      tan.normalize();
      bin.normalize();
      nor.normalize();

      //ignore scene object matrix
      matrix.makeIdentity();
      matrix.translate(p[0], p[1], p[2]);

      let matrix2 = new Matrix4();
      let m = matrix2.$matrix;

      m.m11 = bin[0]; m.m12 = bin[1]; m.m13 = bin[2];
      m.m21 = nor[0]; m.m22 = nor[1]; m.m23 = nor[2];
      m.m31 = tan[0]; m.m32 = tan[1]; m.m33 = tan[2];

      //matrix2.transpose();

      matrix.multiply(matrix2);


      matrix.multiply(amatrix);
    } else {
      matrix.multiply(amatrix);
    }

    let camera = this.camera;
    let finalCamera = this.finalCamera;

    finalCamera.load(camera);

    //*
    finalCamera.pos.multVecMatrix(matrix);
    finalCamera.target.multVecMatrix(matrix);
    finalCamera.orbitTarget.multVecMatrix(matrix);
    //*/

    let up = new Vector4(finalCamera.up);
    up[3] = 0.0;
    up.multVecMatrix(matrix);
    up.normalize();
    finalCamera.up.load(up);

    finalCamera.regen_mats();
  }

  drawWireframe(view3d, gl, uniforms, program, object) {

  }

  drawOutline(view3d, gl, uniforms, program, object) {
    this.drawWireframe(...arguments);
  }

  static nodedef() {return {
    flag   : NodeFlags.SAVE_PROXY,
    name     : "camera",
    uiname   : "Camera",
    inputs   : Node.inherit(),
    outputs  : Node.inherit()
  }}

  static blockDefine() {return {
    typeName     : "camera",
    defaultName  : "Camera",
    uiName       : "Camera",
    flag         : 0,
    icon         : -1
  }}

  static dataDefine() {return {
    name       : "",
    selectMask : SelMask.CAMERA, //valid selection modes for StandardTools, see SelMask
    tools      : undefined
  }}

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);

    this.curvespline = getblock_addUser(this.curvespline, this);
  }

}

CameraData.STRUCT = nstructjs.inherit(CameraData, SceneObjectData) + `
  camera       : Camera;
  curvespline  : DataRef | DataRef.fromBlock(obj.curvespline);
  type         : int;
  speed        : float;
  azimuth      : float;
}
`;

nstructjs.register(CameraData);
DataBlock.register(CameraData);
SceneObjectData.register(CameraData);
