import {CastModes, FindnearestClass} from '../findnearest.js';
import {SelMask} from '../selectmode.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../../../util/vectormath.js";
import {Shaders} from "../../../shaders/shaders.js";
import * as util from "../../../util/util.js";
import {FindNearestRet} from "../findnearest.js";
import {MeshTypes} from "../../../mesh/mesh_base.js";
import {Mesh} from "../../../mesh/mesh.js";
import * as math from '../../../util/math.js';

let _findnearest_rets = util.cachering.fromConstructor(FindNearestRet, 1024);
let _castray_rets = util.cachering.fromConstructor(FindNearestRet, 1024);

let _cache = {};

export class FindnearestMesh extends FindnearestClass {
  static define() {return {
    selectMask : SelMask.GEOM
  }}

  static drawsObjectExclusively(view3d, object) {
    return false;
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this class (and was drawn)
  *
  * When drawing pass the object id to red and any subdata
  * to green.
  * */
  //XXX is this method used anymore?
  static drawIDs(view3d, gl, uniforms, object, mesh) {
    let program = Shaders.MeshIDShader;

    if (object !== undefined) {
      uniforms.objectMatrix = object.outputs.matrix.getValue();
      uniforms.object_id = object.lib_id;
    }

    ///view3d.ctx.selectMask
    //object.drawIds(view3d, gl, view3d.ctx.selectMask, uniforms);

    return true;
  }

  static castViewRay_framebuffer(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    let gl = view3d.gl;
    let sbuf = view3d.selectbuf;
    let x = ~~p[0], y = ~~p[1];
    let ret = new FindNearestRet(); //ref leak? _castray_rets.next().reset();
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

  static getSearchOrder(n) {
    if (n in _cache) {
      return _cache[n];
    }

    let ret = _cache[n] = [];

    for (let i=0; i<n*n; i++) {
      ret.push(i);
    }

    ret.sort((a, b) => {
      let x1 = a % n, y1 = ~~(a / n);
      let x2 = b % n, y2 = ~~(b / n);

      x1 -= n*0.5; y1 -= n*0.5;
      x2 -= n*0.5; y2 -= n*0.5;

      let w1 = /*Math.atan2(y1, x1) */ (x1*x1 + y1*y1);
      let w2 = /*Math.atan2(y2, x2) */ (x2*x2 + y2*y2);

      return w1-w2;
    });

    return ret;
  }


  static castScreenCircle(ctx, selmask, mpos, radius, view3d) {
    let x = mpos[0], y = mpos[1];

    x = ~~x;
    y = ~~y;

    let order = this.getSearchOrder(radius);
    let objects;

    if (selmask & SelMask.GEOM) {
      objects = new Set(ctx.selectedObjects).filter(ob => ob.data instanceof Mesh);
    } else {
      objects = new Set(ctx.scene.objects.editable).filter(ob => ob.data instanceof Mesh);
      selmask |= SelMask.FACE;
    }

    let hits = [];

    let cam = view3d.activeCamera;
    let co = new Vector3(cam.position);
    let ray = view3d.getViewVec(x, y);
    let ray1 = new Vector3(cam.target).sub(cam.pos);

    let report = Math.random() > 0.998;

    let tmp1 = new Vector3();
    let tmp2 = new Vector3();
    let tmp3 = new Vector3();
    let tmp4 = new Vector3();

    let selmask2 = selmask;
    let foundmask = 0;

    let ret_elems = [];
    let ret_objects = [];
    let visit = new WeakSet();

    function doElem(mat, ob, elem) {
      foundmask |= elem.type;

      if (!(elem.type & selmask2) || visit.has(elem)) {
        return;
      }

      visit.add(elem);

      if (elem.type === MeshTypes.VERTEX) {
        tmp1.load(elem).multVecMatrix(mat);
        view3d.project(tmp1);

        tmp2.load(mpos);
        tmp2[2] = 0.0;
        tmp1[2] = 0.0;

        let dis = tmp1.vectorDistance(tmp2);

        if (dis < radius) {
          ret_elems.push(elem);
          ret_objects.push(ob);
        }
      } else if (elem.type === MeshTypes.EDGE) {
        let e = elem;

        tmp1.load(e.v1).multVecMatrix(mat);
        tmp2.load(e.v2).multVecMatrix(mat);

        view3d.project(tmp1);
        view3d.project(tmp2);

        tmp3.load(mpos);
        tmp3[2] = 0.0;

        let dis = math.dist_to_line_2d(tmp3, tmp1, tmp2, true);

        if (dis < radius) {
          ret_elems.push(elem);
          ret_objects.push(ob);
        }
      } else if (elem.type === MeshTypes.FACE) {
        let f = elem;
        tmp1.load(f.cent).multVecMatrix(mat);
        view3d.project(tmp1);

        tmp2.load(mpos);
        tmp2[2] = 0.0;
        tmp1[2] = 0.0;

        let dis = tmp1.vectorDistance(tmp2);

        if (dis < radius) {
          ret_elems.push(elem);
          ret_objects.push(ob);
        }
      }
    }

    for (let i=0; i<1; i++) {
      //let dx = (i % radius);
      //let dy = ~~(i / radius);
      let dx = 0;
      let dy = 0;

      dx -= radius*0.5;
      dy -= radius*0.5;

      selmask2 = selmask;
      foundmask = 0;

      let x2 = dx + x;
      let y2 = dy + y;

      for (let ob of objects) {
        let me = ob.data;
        let bvh = me.getLastBVH(true, false, false, true);

        let mat = ob.outputs.matrix.getValue();
        let imat = new Matrix4(mat);
        imat.invert();

        let co2 = new Vector4();
        let ray2 = view3d.getViewVec(x2, y2); //new Vector4();

        co2.load(co);
        co2[3] = 1.0;

        ray2.load(ray);
        ray2[3] = 0.0;

        co2.multVecMatrix(imat);
        ray2.multVecMatrix(imat);
        ray2.normalize();

        //set up cone tracing fallback
        let p = new Vector3();
        let p2 = new Vector3();

        p[0] = x2;
        p[1] = y2;
        p[2] = 0.00000001;
        view3d.unproject(p);
        p.multVecMatrix(imat);

        co2.load(p);

        p2[0] = x2 + 1.0;
        p2[1] = y2 + 1.0;
        p2[2] = 0.00000001;
        view3d.unproject(p2);
        p2.multVecMatrix(imat);

        let radius1 = p2.vectorDistance(p)*1.0;

        p[0] = x2;
        p[1] = y2;
        p[2] = 0.99999999999;
        view3d.unproject(p);
        p.multVecMatrix(imat);

        ray2.load(p).sub(co2);

        p2[0] = x2 + 1.0;
        p2[1] = y2 + 1.0;
        p2[2] = 0.99999999999;
        view3d.unproject(p2);
        p2.multVecMatrix(imat);

        let radius2 = p2.vectorDistance(p)*1.0;

        //radius1 *= view3d.glSize[1];
        //radius2 *= view3d.glSize[1];

        let vs = bvh.vertsInCone(co2, ray2, radius1, radius2, false);
        let fs;

        if (selmask & SelMask.FACE) {
          fs = bvh.facesInCone(co2, ray2, radius1, radius2, true, false);
          console.log("fs", fs);
          for (let f of fs) {
            doElem(mat, ob, f, 0.0);
          }

          continue;
        }

        if (report) {
          //console.log(limit, dx, dy, radius1, radius2);
          console.log(vs);
        }

        for (let v of vs) {
          let skip = false;

          for (let e of v.edges) {
            if (e.l) {
              skip = true;
              break;
            }
          }

          if (skip) {
            // continue;
          }

          doElem(mat, ob, v, 0.0);

          for (let e of v.edges) {
            doElem(mat, ob, e, 0.0);
          }
        }
      }
    }

    return {
      elements : ret_elems,
      elementObjects : ret_objects
    };
  }

  static findnearest_pbvh(ctx, selmask, mpos, view3d, limit=25, depth=0) {
    let x = mpos[0], y = mpos[1];
    limit = Math.max(~~limit, 1);

    x = ~~x;
    y = ~~y;

    let order = this.getSearchOrder(limit);
    let objects;

    if (selmask & SelMask.GEOM) {
      objects = new Set(ctx.selectedObjects).filter(ob => ob.data instanceof Mesh);
    } else {
      objects = new Set(ctx.scene.objects.editable).filter(ob => ob.data instanceof Mesh);
      selmask |= SelMask.FACE;
    }

    let hits = [];

    let cam = view3d.activeCamera;
    let co = new Vector3(cam.position);
    let ray = view3d.getViewVec(x, y);
    let ray1 = new Vector3(cam.target).sub(cam.pos);

    let rets = [];

    let report = false; //Math.random() > 0.998;

    let minv, mine, minf;
    let minvob, mineob, minfob;
    let minvmat, minemat, minfmat;
    let minvdis, minedis, minfdis;

    let tmp1 = new Vector3();
    let tmp2 = new Vector3();
    let tmp3 = new Vector3();
    let tmp4 = new Vector3();

    let selmask2 = selmask;
    let foundmask = 0;

    function doElem(mat, ob, elem, dist) {
      foundmask |= elem.type;

      if (!(elem.type & selmask2)) {
        return;
      }

      if (elem.type === MeshTypes.VERTEX) {
        tmp1.load(elem.co).multVecMatrix(mat);
        view3d.project(tmp1);

        tmp2.load(mpos);
        tmp2[2] = 0.0;
        tmp1[2] = 0.0;

        let dis = tmp1.vectorDistance(tmp2);

        if (dis < limit && (minvdis === undefined || dis < minvdis)) {
          minv = elem;
          minvdis = dis;
          minvob = ob;
          minvmat = mat;
        }
      } else if (elem.type === MeshTypes.EDGE) {
        let e = elem;

        tmp1.load(e.v1.co).multVecMatrix(mat);
        tmp2.load(e.v2.co).multVecMatrix(mat);

        view3d.project(tmp1);
        view3d.project(tmp2);

        tmp3.load(mpos);
        tmp3[2] = 0.0;

        let dis = math.dist_to_line_2d(tmp3, tmp1, tmp2, true);

        if (dis < limit && (minedis === undefined || dis < minedis)) {
          mine = elem;
          minedis = dis;
          mineob = ob;
          minemat = mat;
        }
      } else if (elem.type === MeshTypes.FACE) {
        let f = elem;
        tmp1.load(f.cent).multVecMatrix(mat);
        view3d.project(tmp1);

        tmp2.load(mpos);
        tmp2[2] = 0.0;
        tmp1[2] = 0.0;

        let dis = Math.min(dist, tmp1.vectorDistance(tmp2));

        if (minfdis === undefined || dis < minfdis) {
          minf = elem;
          minfdis = dis;
          minfob = ob;
          minfmat = mat;
        }
      }
    }
    for (let i of order) {
      let dx = (i % limit);
      let dy = ~~(i / limit);

      dx -= limit*0.5;
      dy -= limit*0.5;

      selmask2 = selmask;
      foundmask = 0;

      let x2 = dx + x;
      let y2 = dy + y;

      for (let ob of objects) {
        let me = ob.data;
        let bvh = me.getLastBVH(true, false, false, true);

        let mat = ob.outputs.matrix.getValue();
        let imat = new Matrix4(mat);
        imat.invert();

        let co2 = new Vector3();
        co2[0] = x2;
        co2[1] = y2;
        co2[2] = 0.0000001;
        view3d.unproject(co2);

        let ray2 = view3d.getViewVec(x2, y2);

        ray2 = new Vector4(ray2);
        ray2[3] = 0.0;

        co2.multVecMatrix(imat);
        ray2.multVecMatrix(imat);
        ray2.normalize();

        let isect = bvh.castRay(co2, ray2);
        if (isect) {
          let tri = isect.tri;
          let l, f;

          if (tri.l1) {
            l = tri.l1;
            f = l.f;
          } else {
            f = me.eidMap.get(tri.id);
            l = f.loops[0].l;
          }

          if (!f) {
            console.warn("bvh error!");
            me.regenBVH();

            if (depth < 5) {
              return this.findnearest_pbvh(ctx, selmask, mpos, view3d, limit, depth+1);
            } else {
              continue;
            }
          }

          doElem(mat, ob, f, isect.dist);

          for (let l of f.loops) {
            doElem(mat, ob, l.v, isect.dist);
            doElem(mat, ob, l.e, isect.dist);
          }

          if (Math.random() > 0.995) {
            //console.log(f);
          }
        }
      }

      //clear found bits in selmask2
      selmask2 &= ~foundmask;

      if ((foundmask & MeshTypes.FACE) || selmask2 === 0 || selmask2 === MeshTypes.FACE) {
        continue;
      }

      for (let ob of objects) {
        let me = ob.data;
        let bvh = me.getLastBVH(true, false, false, true);

        let mat = ob.outputs.matrix.getValue();
        let imat = new Matrix4(mat);
        imat.invert();

        let co2 = new Vector4();
        let ray2 = view3d.getViewVec(x2, y2); //new Vector4();

        co2.load(co);
        co2[3] = 1.0;

        ray2.load(ray);
        ray2[3] = 0.0;

        co2.multVecMatrix(imat);
        ray2.multVecMatrix(imat);
        ray2.normalize();

        //set up cone tracing fallback
        let p = new Vector3();
        let p2 = new Vector3();

        p[0] = x2;
        p[1] = y2;
        p[2] = 0.00000001;
        view3d.unproject(p);
        p.multVecMatrix(imat);

        co2.load(p);

        p2[0] = x2 + 1.0;
        p2[1] = y2 + 1.0;
        p2[2] = 0.00000001;
        view3d.unproject(p2);
        p2.multVecMatrix(imat);

        let radius1 = p2.vectorDistance(p)*1.0;

        p[0] = x2;
        p[1] = y2;
        p[2] = 0.99999999999;
        view3d.unproject(p);
        p.multVecMatrix(imat);

        ray2.load(p).sub(co2);

        p2[0] = x2 + 1.0;
        p2[1] = y2 + 1.0;
        p2[2] = 0.99999999999;
        view3d.unproject(p2);
        p2.multVecMatrix(imat);

        let radius2 = p2.vectorDistance(p)*1.0;

        //radius1 *= view3d.glSize[1];
        //radius2 *= view3d.glSize[1];

        let vs = bvh.vertsInCone(co2, ray2, radius1, radius2, false);

        if (report) {
          //console.log(limit, dx, dy, radius1, radius2);
          console.log(vs);
        }

        for (let v of vs) {
          let skip = false;

          for (let e of v.edges) {
            if (e.l) {
              skip = true;
              break;
            }
          }

          if (skip) {
           // continue;
          }

          doElem(mat, ob, v);

          for (let e of v.edges) {
            doElem(mat, ob, e);
          }
        }
      }
    }

    if (minv) {
      let ret = new FindNearestRet();

      ret.mesh = minvob.data;
      ret.data = minv;
      ret.object = minvob;

      let co = tmp1;
      co.load(minv.co).multVecMatrix(minvmat);

      ret.dis = minvdis;
      ret.p3d.load(co);
      ret.p2d.load(co);

      view3d.project(ret.p2d);

      rets.push(ret);
    }

    if (mine) {
      let ret = new FindNearestRet();

      ret.mesh = mineob.data;
      ret.data = mine;
      ret.object = mineob;

      let co = tmp1;
      co.load(mine.v1.co).interp(mine.v2.co, 0.5).multVecMatrix(minemat);

      ret.dis = minedis;
      ret.p3d.load(co);
      ret.p2d.load(co);

      view3d.project(ret.p2d);

      rets.push(ret);
    }

    if (minf) {
      //console.log("minf", minf);

      let ret = new FindNearestRet();

      ret.mesh = minfob.data;
      ret.data = minf;
      ret.object = minfob;

      let co = tmp1;
      co.load(minf.cent).multVecMatrix(minfmat);

      ret.dis = 0.0; //minfdis;
      ret.p3d.load(co);
      ret.p2d.load(co);

      view3d.project(ret.p2d);

      rets.push(ret);
    }

    return rets;
  }

  static findnearest(ctx, selmask, mpos, view3d, limit=25) {
    return this.findnearest_pbvh(...arguments);

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

      let ob = ~~(block[i] + 0.25) - 1;
      let idx = ~~(block[i+1] + 0.25) - 1;

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

      //if (Math.random() > 0.998) {
      //  console.log(idx, mesh.eidmap[idx-3], mesh.eidmap[idx-2], mesh.eidmap[idx-1], mesh.eidmap[idx], mesh.eidmap[idx+1], mesh.eidmap[idx+2], mesh.eidmap[idx+3]);
      //}

      let e = mesh.eidmap[idx];

      if (e === undefined) {
        //console.warn(`Corruption in findnearest_mesh implemented; e=${e}, ob=${ob}, idx=${idx}`, ob);
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

      let ret = new FindNearestRet(); //ref leaf? _findnearest_rets.next().reset();

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
