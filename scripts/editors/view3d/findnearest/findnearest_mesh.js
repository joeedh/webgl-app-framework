import {CastModes, FindnearestClass} from '../findnearest.js';
import {SelMask} from '../selectmode.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../../../util/vectormath.js";
import {Shaders} from "../../../shaders/shaders.js";
import * as util from "../../../util/util.js";
import {FindNearestRet} from "../findnearest.js";
import {MeshTypes} from "../../../mesh/mesh_base.js";
import {Mesh} from "../../../mesh/mesh.js";

let _findnearest_rets = util.cachering.fromConstructor(FindNearestRet, 1024);
let _castray_rets = util.cachering.fromConstructor(FindNearestRet, 1024);

export class FindnearestMesh extends FindnearestClass {
  static define() {return {
    selectMask : SelMask.GEOM
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

    if (object !== undefined) {
      uniforms.objectMatrix = object.outputs.matrix.getValue();
      uniforms.object_id = object.lib_id;
    }

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

    let sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, 1, 1, true, selectMask);
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

    co[0] = 2.0*x/size[0] - 1.0;
    co[1] = -(2.0*y/size[1] - 1.0);
    co[2] = depth*2.0 - 1.0;
    co[3] = 1.0;

    //console.log(" ", co);
    co.multVecMatrix(view3d.camera.irendermat);

    if (co[3] !== 0.0 && view3d.camera.rendermat.isPersp) {
      co.mulScalar(1.0 / co[3]);
    }

    depth = co[2];
    co[2] = depth;

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

    let sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, limit, limit, false, selmask);
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

      if (ob < 0 || idx <= 0)
        continue;

      //console.log(ob, idx);

      ob = ctx.datalib.get(ob);
      let mesh;

      if (ob !== undefined) {
        if (!(ob.data instanceof Mesh)) {
          continue;
        }

        mesh = ob.data;
      } else {
        //pull from ctx.mesh
        //HACKISH!
        mesh = ctx.mesh;
      }

      let e = mesh.eidmap[idx];

      if (e === undefined) {
        console.warn(`Corruption in findnearest_mesh implemented; e=${e}, ob=${ob}, idx=${idx}`, ob);
        continue;
      }

      //console.log(e.type, selmask);
      if (!(e.type & selmask)) {
        continue;
      }

      /*we now allow this, so meshtool.js derived classes work
      if (ob === undefined || ob.data === undefined) {
        //console.warn("warning, invalid object", id);
        continue;
      }*/

      let ret = _findnearest_rets.next().reset();

      ret.data = e;
      ret.object = ob;
      ret.p3d = new Vector3();

      if (e.type & (MeshTypes.VERTEX|MeshTypes.HANDLE)) {
        ret.p3d.load(e);
      } else if (e.type === MeshTypes.EDGE) {
        ret.p3d.load(e.v1).interp(e.v2, 0.5);
      } else if (e.type === MeshTypes.FACE) {
        let tot = 0.0;;
        for (let v of e.verts) {
          ret.p3d.add(v);
        }

        tot++;
        if (tot > 0) {
          ret.p3d.mulScalar(1.0 / tot);
        }
      }

      if (ob !== undefined) {
        ret.p3d.multVecMatrix(ob.outputs.matrix.getValue());
      }

      ret.dis = Math.sqrt(x2 * x2 + y2 * y2);

      let p = new Vector3(ret.p3d);
      view3d.project(p);

      ret.mesh = mesh;
      ret.p2d.load(p);
      return [ret];
    }
  }
}

FindnearestClass.register(FindnearestMesh);
