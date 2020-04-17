import {FindnearestClass} from '../findnearest.js';
import {SelMask} from '../selectmode.js';
import {Vector3} from "../../../util/vectormath.js";
import {Shaders} from "../view3d_shaders.js";
import * as util from "../../../util/util.js";
import {FindNearestRet} from "../findnearest.js";

let _findnearest_rets = util.cachering.fromConstructor(FindNearestRet, 64);

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

    view3d.threeCamera.pushUniforms(uniforms);
    object.draw(view3d, gl, uniforms, program);
    view3d.threeCamera.popUniforms();
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

      let idx = ~~(block[i] + 0.5), ob = ~~(block[i + 1] + 0.5);
      idx--;

      if (idx < 0)
        continue;

      let id = ob;
      ob = ctx.datalib.get(ob);

      if (ob === undefined || ob.data === undefined) {
        //console.warn("warning, invalid object", id);
        continue;
      }

      let ret = _findnearest_rets.next();

      ret.data = ret.object = ob;
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
