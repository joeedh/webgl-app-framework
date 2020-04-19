import {CastModes, FindnearestClass} from '../findnearest.js';
import {SelMask} from '../selectmode.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../../../util/vectormath.js";
import {Shaders} from "../view3d_shaders.js";
import * as util from "../../../util/util.js";
import {FindNearestRet} from "../findnearest.js";

let _findnearest_rets = util.cachering.fromConstructor(FindNearestRet, 1024);
let _castray_rets = util.cachering.fromConstructor(FindNearestRet, 1024);

export class FindnearestObject extends FindnearestClass {
  static define() {return {
    selectMask : SelMask.OBJECT
  }}

  /*
  * called for all objects;  returns true
  * if an object is valid for this class (and was drawn)
  *
  * When drawing pass the object id to red and any subdata
  * to green.
  * */
  static drawIDs(view3d, gl, uniforms, object, mesh) {
    let program = Shaders.MeshIDShader;

    uniforms.objectMatrix = object.outputs.matrix.getValue();
    uniforms.object_id = object.lib_id;

    view3d.threeCamera.pushUniforms(uniforms);
    object.drawIds(view3d, gl, view3d.ctx.selectMask, uniforms);
    view3d.threeCamera.popUniforms();
  }

  static castRay_framebuffer(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    let sbuf = view3d.selectbuf;
    let x = ~~p[0], y = ~~p[1];

    let sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, 1, 1, true);

    if (sample === undefined) {
      return;
    }

    let ret = _castray_rets.next().reset();

    let ob = ~~(sample.data[0] + 0.5) - 1;
    let depth = sample.depthData[0];

    if (ob < 0 || depth === 1.0 || depth === 0.0)
      return undefined;

    let co = new Vector4();
    let size = view3d.glSize;

    let camera = view3d.camera;

    /*
    comment: linear z
    f1 := (z - near) / (far - near);
    solve(f1 - depth, z);

    comment: inverse z;

    f1 := (1/z - 1/near) / (1/far - 1/near);
    solve(f1 - depth, z);
    */

    let far = camera.far, near = camera.near;

    depth = -(far*near) / (far*depth - far - near*depth);

    //console.log(sample.data, depth, "|", x, y);

    co[0] = (x / size[0])*2.0 - 1.0;
    co[1] = (y / size[1])*2.0 - 1.0;
    co[2] = depth;
    co[3] = 1.0;

    co.multVecMatrix(view3d.camera.irendermat);
    if (co[3] !== 0.0) {
      co.mulScalar(1.0 / co[3]);
    }

    ret.p2d.load(p);
    ret.p3d.load(co);
    ret.dis = depth;

    return [ret];
  }

  static castRay(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    if (mode === CastModes.FRAMEBUFFER) {
      return this.castRay_framebuffer(...arguments);
    }
  }

  static findnearest(ctx, selmask, mpos, view3d, limit=25) {
    let x = mpos[0];
    let y = mpos[1];
    let sbuf = view3d.selectbuf;

    limit = Math.max(~~limit, 1);

    x = ~~x;
    y = ~~y;

    x -= limit >> 1;
    y -= limit >> 1;
    
    if (sbuf === undefined) {
      return undefined;
    }
    
    let sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, limit, limit);
    if (sample === undefined) {
      return;
    }

    let block = sample.data;
    let order = sample.order;

    for (let i of order) {
      let x2 = i % limit, y2 = ~~(i / limit);
      i *= 4;

      let ob = ~~(block[i] + 0.5) - 1;
      let idx = ~~(block[i+1] + 0.5) - 1;

      if (ob < 0)
        continue;

      ob = ctx.datalib.get(ob);

      if (ob === undefined || ob.data === undefined) {
        //console.warn("warning, invalid object", id);
        continue;
      }

      let ret = _findnearest_rets.next().reset();

      ret.data = idx >= 0 ? idx : ob;
      ret.object = ob;
      ret.p3d = new Vector3();
      ret.p3d.multVecMatrix(ob.outputs.matrix.getValue());
      ret.dis = Math.sqrt(x2 * x2 + y2 * y2);

      let p = new Vector3(ret.p3d);
      view3d.project(p);

      ret.p2d.load(p);
      return [ret];
    }
  }
}

FindnearestClass.register(FindnearestObject);
