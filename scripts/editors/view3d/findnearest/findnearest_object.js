import {CastModes, FindnearestClass} from '../findnearest.js';
import {SelMask} from '../selectmode.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../../../util/vectormath.js";
import {Shaders} from "../../../shaders/shaders.js";
import * as util from "../../../util/util.js";
import {FindNearestRet} from "../findnearest.js";
import {Mesh} from "../../../mesh/mesh.js";

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

  static castViewRay_framebuffer(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    let gl = view3d.gl;
    let sbuf = view3d.selectbuf;
    let x = ~~p[0], y = ~~p[1];
    let ret = _castray_rets.next().reset();
    let size = view3d.glSize;

    let dpi = view3d.gl.canvas.dpi;
    size = new Vector2(size);
    size.mulScalar(1.0 / dpi);

    let camera = view3d.camera;
    let far = camera.far, near = camera.near;

    let co = new Vector4();

    //this might already be in local mouse space
    //x -= view3d.glPos[0];
    //y -= view3d.glPos[1];

    let sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, 1, 1, true);
    if (sample === undefined) {
      return;
    }

    let ob = ~~(sample.data[0] + 0.5) - 1;
    let depth = sample.depthData[0];

    let range = gl.getParameter(gl.DEPTH_RANGE);
    depth = (depth - range[0]) / (range[1] - range[0]);

    if (ob < 0 || depth === 1.0 || depth === 0.0)
      return undefined;

    ob = ctx.datalib.get(ob);

    if (0) {//ob.data instanceof PointSet && ob.data.ready) {
      let ptree = ob.data.res.data;
      console.log("POINTSET", ptree);

      let renderer = _appstate.three_render;
      let threeCamera = ctx.view3d.threeCamera;

      let uniforms = {
        objectMatrix : ob.outputs.matrix.getValue(),
        object_id : ob.lib_id
      };

      threeCamera.pushUniforms(uniforms);

      sbuf.fbo.update(gl, size[0], size[1]);
      sbuf.fbo.bind(gl);

      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.CULL_FACE);

      gl.viewport(0, 0, size[0], size[1]);
      gl.scissor(0, 0, size[0], size[1]);

      gl.clearColor(0, 0, 0, 1.0);
      gl.clearDepth(camera.far);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

      //renderer.setFramebuffer(sbuf.fbo.fbo);
      renderer.setViewport(0, 0, size[0], size[1]);

      let viewer = {
        pRenderer : view3d.pRenderer,
        renderer  : renderer
      };

      co[0] = 2.0*x/size[0] - 1.0;
      co[1] = -(2.0*y/size[1] - 1.0);
      co[2] = near + 0.01;
      co[2] = -(co[2] - near) / (far - near);
      co[2] = co[2]*2.0 - 1.0;
      //co[2] = -co[2];
      co[3] = 1.0;

      co.multVecMatrix(camera.irendermat);
      co.mulScalar(1.0 / co[3]);
      co = new Vector3(co).normalize();

      console.log(co, view3d.getViewVec(x, y).normalize());

      co = view3d.getViewVec(x, y).normalize();

      let ray = new THREE.Ray(camera.pos.asTHREE(), co.asTHREE());

      //console.log(camera.pos, co);

      let ret = ptree.pick(viewer, threeCamera, ray, {pickWindowSize : 65});

      console.log("RET", ret);

      sbuf.fbo.unbind(gl);
      sbuf.regen = 1;
      threeCamera.popUniforms(uniforms);
      renderer.setFramebuffer(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }


    /*
    comment: linear z
    f1 := (z - near) / (far - near);
    solve(f1 - depth, z);

    comment: inverse z;

    f1 := (1/z - 1/near) / (1/far - 1/near);
    solve(f1 - depth, z);
    */


    co[0] = 2.0*x/size[0] - 1.0;
    co[1] = -(2.0*y/size[1] - 1.0);
    co[2] = depth*2.0 - 1.0;
    co[3] = 1.0;

    //console.log(" ", co);
    co.multVecMatrix(view3d.camera.irendermat);
    //co.multVecMatrix(view3d.camera.ipersmat);

    if (co[3] !== 0.0 && view3d.camera.rendermat.isPersp) {
      co.mulScalar(1.0 / co[3]);
    }
    //console.log(":", co);

    depth = co[2];
    //depth = -(far*near) / (far*depth - near*depth - far);
    //depth = (depth - near) / (far - near);
    //console.log(depth2, depth*2.0-1.0);
    co[2] = depth;

    //co.multVecMatrix(view3d.camera.icameramat);

    ret.object = ob;
    ret.p2d.load(p);
    ret.p3d.load(co);
    ret.dis = depth;

    return [ret];
  }

  static castViewRay(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    if (mode === CastModes.FRAMEBUFFER) {
      return this.castViewRay_framebuffer(...arguments);
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
