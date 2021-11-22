import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {LogContext} from './mesh_base.js';
import {CotanVert, CotanVertFlags} from './mesh_cotan.js';

import {nstructjs} from '../path.ux/scripts/pathux.js';

import {MeshFlags} from './mesh_base.js';
import {CustomDataElem, CDFlags} from './customdata.js';
import {BVHVertFlags, CDNodeInfo, MDynVert} from '../util/bvh.js';
import {IntElem} from './mesh_customdata.js';
import {getFaceSets} from './mesh_facesets.js';

export const CVFlags = {
  UPDATE     : (1<<11), //MeshFlags.UPDATE,
  UV_BOUNDARY: 2
};

let ctmps_vs = util.cachering.fromConstructor(Vector3, 512);
let ctmps_arrmats = new util.cachering(() => new Float64Array(16), 512);
let ctmps_mats = util.cachering.fromConstructor(Matrix4, 512);
let nmat_mats = util.cachering.fromConstructor(Matrix4, 512);

const PROJECT_CURV_NORMALS = false;

let tan_tmp = new Vector3();

let addtmps = util.cachering.fromConstructor(Vector3, 16);

function addMat(amat, v1, v2, w = 1.0, nmat) {
  if (isNaN(w)) {
    console.warn("NaN w in mesh_curvature.c:addMat");
    w = 1.0;
  }

  if (isNaN(v2.no.dot(v1.no)) || isNaN(w)) {
    console.log("NaN");
    debugger;
    return;
  }

  //let no = addtmps.next().load(v2.no);
  let no = addtmps.next().load(v2.no).sub(v1.no);

  //let no = addtmps.next().load(v2).sub(v1);

  if (nmat) {
    no.multVecMatrix(nmat);
  }

  amat[0] += no[0]*no[0]*w;
  amat[1] += no[0]*no[1]*w;
  amat[2] += no[0]*no[2]*w;

  //skip 3
  amat[4] += no[1]*no[0]*w;
  amat[5] += no[1]*no[1]*w;
  amat[6] += no[1]*no[2]*w;

  //skip 7
  amat[8] += no[2]*no[0]*w;
  amat[9] += no[2]*no[1]*w;
  amat[10] += no[2]*no[2]*w;
}

function calcCoKey(co) {
  let x = co[0], y = co[1], z = co[2];

  x = ~~(x*1024*1024);
  y = ~~(y*1024*128);
  z = ~~(z*1024);

  let hash = x ^ y;
  hash = hash ^ z;

  return (hash + x + y + z) & ((1<<27) - 1);
}

window._calcCoKey = calcCoKey;

let lasttime = util.time_ms();

let mtmp = new Matrix4();
let smstmp1 = new Vector3();
let smstmp2 = new Vector3();
let bstmp1 = new Vector3();
let bstmp2 = new Vector3();
let bstmp2b = new Vector3();
let bstmp3 = new Vector3();
let bstmp4 = new Vector3();
let bstmp5 = new Vector4();
let bstmp6 = new Vector4();
let bstmp7 = new Vector4();

export class CurvVert extends CustomDataElem {
  constructor() {
    super();
    this.tan = new Vector3();
    this.dir = new Vector3();
    this.diruv = new Vector4();

    this.k1 = 0;
    this.k2 = 0;
    this.no = new Vector3();
    this.flag = CVFlags.UPDATE;
    this.v = undefined;
    this.cokey = 0;

    this.weight = 1.0;

    this.covmat = new Float64Array(16);
  }

  static apiDefine(api, dstruct) {

  }

  static propegateUpdateFlags(mesh, cd_curv) {
    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];

      if (cv.flag & CVFlags.UPDATE) {
        for (let v2 of v.neighbors) {
          let cv2 = v2.customData[cd_curv];
          cv2.flag |= CVFlags.UPDATE;
        }
      }
    }
  }

  /*
  get flag() {
    return this._flag;
  }
  set flag(v) {
    if (this._flag !== undefined && util.time_ms() - lasttime > 75) {
      console.warn("flag set", v);
      lasttime = util.time_ms();
    }

    this._flag = v;
  }//*/

  static define() {
    return {
      elemTypeMask: 0, //see MeshTypes in mesh.js
      typeName    : "curv",
      uiTypeName  : "Curvature",
      defaultName : "Curvature",
      valueSize   : 3,
      flag        : CDFlags.TEMPORARY,

      //if not undefined, a LayerSettingsBase child class defining overall settings that's not per-element
      settingsClass: undefined,
    }
  };

  calcMemSize() {
    return 8*6 + 8*2 + 8;
  }

  _ignoreUpdate(v, cd_cotan) {
    this.cokey = calcCoKey(v);
    this.flag &= ~CVFlags.UPDATE;

    return this;
  }

  relaxUvCells(v, cd_curv) {
    let co = smstmp1;
    let co2 = smstmp2;

    co.zero();
    let bound = this.flag & CVFlags.UV_BOUNDARY;

    let tot = 0.0;
    let iu = Math.floor(this.diruv[0]);
    let iv = Math.floor(this.diruv[1]);

    for (let v2 of v.neighbors) {
      let cv2 = v2.customData[cd_curv];
      let bound2 = cv2.flag & CVFlags.UV_BOUNDARY;

      if (bound) {
        if (!bound2) {
          continue;
        }

        if (Math.floor(cv2.diruv[0]) !== iu || Math.floor(cv2.diruv[1]) !== iv) {
          //continue;
        }
      }

      co2.load(v2).sub(v);
      co2.addFac(v.no, -v.no.dot(co2)*0.999);
      co2.add(v);

      co.add(co2);
      tot++;
    }

    if (tot >= 2) {
      co.mulScalar(1.0 / tot);
      v.load(co);
    }
  }

  check(v, cd_cotan, forceCheck = false, cd_fset) {
    if (forceCheck || (v.flag & MeshFlags.UPDATE)) {
      let key = calcCoKey(v);
      //console.log("key", key);

      if (key !== this.cokey) {
        this.flag |= CVFlags.UPDATE;
        this.cokey = key;
      }
    }

    if (this.flag & CVFlags.UPDATE) {
      this.update(v, cd_cotan, cd_fset);
    }

    return this;
  }

  transform(t1, t2, no) {
    let bit = 0;

    if (t2.dot(t1) < 0) {
      bit |= 1;
      t2.negate();
    }

    let th = Math.abs(Math.acos(t1.dot(t2)*0.99999));
    if (th > Math.PI*0.25) {
      t2.cross(no);
      t2.normalize();
      bit |= 2;
    }

    if (t2.dot(t1) < 0) {
      t2.negate();
      bit |= 4;
    }

    return bit;
  }

  //propegate from neighboring verts and any boundaries
  _blendStep(v, cd_cotan, cd_fset = -1) {
    let cd_dyn_vert = -1;
    let cd_curv = -1;
    let tot_int_layers = 0;

    this.flag &= ~CVFlags.UV_BOUNDARY;

    //XXX hackish way to find customdata layers
    for (let i = 0; i < v.customData.length; i++) {
      let data = v.customData[i];

      if (data instanceof MDynVert) {
        cd_dyn_vert = i;
      } else if (data instanceof CurvVert) {
        cd_curv = i;
      }
    }

    this.tan.normalize();

    //debugger;

    let bound = false;
    let mv1;
    let valence;

    if (cd_dyn_vert >= 0) {
      mv1 = v.customData[cd_dyn_vert];
      mv1.check(v, cd_fset);
      valence = v.valence; //mv1.valence;

      bound = mv1.flag & BVHVertFlags.BOUNDARY_ALL;
    } else {
      debugger;
      valence = v.valence;
      bound = v.flag & MeshFlags.BOUNDARY;
    }

    let dir1 = bstmp2.load(this.dir);
    let dir1_t = bstmp2b.load(this.dir).cross(v.no).normalize();

    let tot = 0; //valence*0.5*this.weight;
    let tan = bstmp3.load(this.dir);

    if (isNaN(tan.dot(tan)) || isNaN(tot)) {
      console.error("NaN 1!");
      debugger;
    }

    tan.mulScalar(tot);
    //let uv = bstmp5.load(this.diruv);

    let totuv = 0.0;
    //bstmp6.load(this.diruv);
    bstmp6.zero();

    for (let v2 of v.neighbors) {
      let cv2 = v2.customData[cd_curv];

      let bound2;
      let mv2;

      if (cd_dyn_vert < 0) {
        bound2 = v2.flag & MeshFlags.BOUNDARY;
      } else {
        mv2 = v2.customData[cd_dyn_vert];
        mv2.check(v2, cd_fset);

        bound2 = mv2.flag & BVHVertFlags.BOUNDARY_ALL;
      }

      let dir2 = bstmp1;
      let w = cv2.weight;

      if (bound && bound2) {
        let dir2 = bstmp1.load(v2).sub(v);
        dir2.addFac(v.no, -v.no.dot(dir2));

        let dw = window.dw !== undefined ? window.dw : 1000.0;

        w = this.weight = dw;

        dir2.normalize();
      } else {
        if (cv2.dir.dot(cv2.dir) === 0.0) {
          cv2.dir.load(cv2.tan);
        }

        dir2.load(cv2.dir);
      }

      let bits = this.transform(dir1, dir2, v.no);

      //let len = v.vectorDistance(v2);

      let evec = bstmp4.load(v2).sub(v);

      let du = dir1.dot(evec);
      let dv = dir1_t.dot(evec);

      let gu = this.diruv[0] + du;
      let gv = this.diruv[1] + dv;

      cv2.diruv[0] += (gu - cv2.diruv[0])*0.5;
      cv2.diruv[1] += (gv - cv2.diruv[1])*0.5;

      let iu = Math.abs(Math.floor(cv2.diruv[0]) - Math.floor(this.diruv[0]));
      let iv = Math.abs(Math.floor(cv2.diruv[1]) - Math.floor(this.diruv[1]));
      if (iu || iv) {
        this.flag |= CVFlags.UV_BOUNDARY;
      }

      bstmp6[0] += cv2.diruv[0];
      bstmp6[1] += cv2.diruv[1];
      totuv += 1.0;

      tan.addFac(dir2, w);
      tot += w;
    }


    if (isNaN(tan.dot(tan))) {
      console.error("NaN 2!");
      debugger;
    }

    tot += this.weight;
    tan.addFac(this.dir, this.weight);

    tan.normalize();
    this.weight = tot/(valence + 1);

    if (totuv > 0.0) {
      bstmp6.mulScalar(1.0/totuv);
      this.diruv.load(bstmp6);
    }

    this.dir.load(tan);
    //this.dir.interp(tan, 0.5).normalize();
  }

  update(v, cd_cotan, cd_fset) {
    if (cd_fset === undefined) {
      debugger;
      cd_fset = -1;
    }

    let cotan = v.customData[cd_cotan];

    cotan.check(v, cd_cotan);

    this.flag &= ~CVFlags.UPDATE;

    if (util.time_ms() - lasttime > 75) {
      //console.warn("Updating CV vert");
      lasttime = util.time_ms();
    }

    this.v = v;

    this.cokey = calcCoKey(v);

    let mat = this.covmat; //ctmps_arrmats.next();
    for (let i = 0; i < mat.length; i++) {
      mat[i] = 0.0;
    }

    let flag = MeshFlags.NOAPI_TEMP1;

    for (let v2 of v.neighbors) {
      v2.flag &= ~flag;

      for (let v3 of v2.neighbors) {
        v3.flag &= ~flag;

        /*
        for (let v4 of v3.neighbors) {
          v4.flag &= ~flag;
        }
        //*/
      }
    }

    let nmat;

    if (PROJECT_CURV_NORMALS) {
      nmat = this._makeProjMat(v, cd_cotan);
    }

    //rec(v, d1);

    v.flag &= ~flag;
    //unrec(v, d1);

    let co1 = ctmps_vs.next().zero();
    let tot1 = 0.0;

    let tot = 0;

    if (1) {
      let cotan = v.customData[cd_cotan];
      cotan.check(v, cd_cotan);

      let ci = 0;

      for (let v2 of v.neighbors) {
        co1.add(v2);
        tot1++;

        let w = cotan.ws[ci];

        if (!(v2.flag & flag)) {
          v2.flag |= flag;
          addMat(mat, v, v2, -w, nmat);
          tot += w;
        }

        ci++;
      }

      //*
      ci = 0;
      for (let v2 of v.neighbors) {
        let cotan2 = v2.customData[cd_cotan];
        cotan2.check(v2, cd_cotan);

        let w2 = cotan.ws[ci];
        let cj = 0;

        for (let v3 of v2.neighbors) {
          let ck = 0;
          //let cotan3 = v3.customData[cd_cotan];
          //cotan3.check(v3, cd_cotan);

          for (let v4 of v3.neighbors) {
            if (!(v4.flag & flag)) {
              let w = w2;//cotan3.ws[ck] * w2 * cotan2.ws[cj];

              v4.flag |= flag;
              addMat(mat, v, v4, -w, nmat);
              tot += w;
            }

            ck++;
          }

          cj++;
        }

        ci++;
      }//*/
    }

    //addMat(mat, v, v, tot, nmat);

    this._finish(nmat, v, cd_cotan, cd_fset);

    return;

    let sign = 1.0;

    if (tot1 > 0) {
      co1.mulScalar(1.0/tot1);
      co1.sub(v);
      if (co1.dot(v.no) < 0) {
        sign = -1;
      }
    }

    let mat2 = ctmps_mats.next();
    mat2.load(mat);

    let lastno = ctmps_vs.next().zero();
    let no = ctmps_vs.next();

    no.load(v.no)

    if (PROJECT_CURV_NORMALS) {
      no.multVecMatrix(nmat);
    }

    for (let i = 0; i < 75; i++) {
      if (i > 0 && no.vectorDistanceSqr(lastno) < 0.0001) {
        break;
      }

      lastno.load(no);
      no.normalize();

      no.multVecMatrix(mat2);
    }

    if (PROJECT_CURV_NORMALS) {
      nmat.transpose();
      no.multVecMatrix(nmat);
    }

    //no.mulScalar(sign);

    this.k1 = no.vectorLength();

    if (this.k1 > 0.00001) {
      no.mulScalar(1.0/this.k1);
      //this.k1 = 1.0 / this.k1;
    }

    this.no.load(no);
    this.tan.load(no).cross(v.no).normalize();

    return this;
  }

  _makeProjMat(v, cd_cotan) {
    let nmat = nmat_mats.next();
    nmat.makeIdentity();

    let tan;

    if (v.edges.length > 0) {
      let e = v.edges[0];
      tan = tan_tmp.load(v.edges[0].otherVertex(v)).sub(v);
      tan.normalize();
    }

    nmat.makeNormalMatrix(v.no, tan);
    nmat.transpose();
  }

  _finish(nmat, v, cd_cotan, cd_fset) {
    let mat = this.covmat;
    let mat2 = ctmps_mats.next();
    mat2.load(mat);

    let lastno = ctmps_vs.next().zero();
    let no = ctmps_vs.next();

    no.load(v.no)

    if (PROJECT_CURV_NORMALS) {
      no.multVecMatrix(nmat);
    }

    for (let i = 0; i < 75; i++) {
      if (i > 0 && no.vectorDistanceSqr(lastno) < 0.0001) {
        break;
      }

      lastno.load(no);
      no.normalize();

      no.multVecMatrix(mat2);
    }

    if (PROJECT_CURV_NORMALS) {
      nmat.transpose();
      no.multVecMatrix(nmat);
    }

    //no.mulScalar(sign);

    this.k1 = no.vectorLength();

    if (this.k1 > 0.00001) {
      no.mulScalar(1.0/this.k1);
      //this.k1 = 1.0 / this.k1;
    }

    this.no.load(no);
    this.tan.load(no).cross(v.no).normalize();

    if (isNaN(no.dot(no)) || isNaN(this.tan.dot(this.tan))) {
      console.error("NaN!", this.no, this.k1, mat2);
      debugger;
    }

    this._blendStep(v, cd_cotan, cd_fset);
  }

  setValue(b) {
    this.tan.load(b);
  }

  getValue() {
    return this.tan;
  }

  copyTo(b) {
    b.tan.load(this.tan);
    b.dir.load(this.dir);
    b.diruv.load(this.diruv);

    b.k1 = this.k1;
    b.k2 = this.k2;
    b.no.load(this.no);
    b.flag = this.flag;
  }

  interp(dst, datas, ws) {
    let nx = 0, ny = 0, nz = 0;
    let k1 = 0, k2 = 0;
    let weight = 0;
    let tx = 0, ty = 0, tz = 0;
    let dx = 0, dy = 0, dz = 0, dw = 0.0;
    let ddu = 0.0, ddv = 0.0;
    let ddx = 0.0, ddy = 0.0;

    for (let i = 0; i < datas.length; i++) {
      let w = ws[i];
      let src = datas[i];

      if (i === 0) {
        dst.flag = src.flag | CVFlags.UPDATE;
      }

      dx += src.dir[0]*w;
      dy += src.dir[1]*w;
      dz += src.dir[2]*w;

      ddu += src.diruv[0]*w;
      ddv += src.diruv[1]*w;
      ddx += src.diruv[2]*w;
      ddy += src.diruv[3]*w;

      nx += src.no[0]*w;
      ny += src.no[1]*w;
      nz += src.no[2]*w;

      tx += src.tan[0]*w;
      ty += src.tan[1]*w;
      tz += src.tan[2]*w;

      k1 += src.k1*w;
      k2 += src.k2*w;

      weight += src.weight*w;
    }

    dst.diruv[0] = ddu;
    dst.diruv[1] = ddv;
    dst.diruv[2] = ddx;
    dst.diruv[3] = ddy;

    dst.dir.loadXYZ(dx, dy, dz).normalize();
    dst.no.loadXYZ(nx, ny, nz).normalize();
    dst.tan.loadXYZ(tx, ty, tz).normalize();

    dst.k1 = k1;
    dst.k2 = k2;
    dst.weight = weight;
  }
}

CurvVert.STRUCT = nstructjs.inherit(CurvVert, CustomDataElem) + `
  flag      : int;
  tan       : vec3;
  dir       : vec3;
  k1        : double;
  k2        : double;
  no        : vec3;
  weight    : double;
  diruv     : vec4;  
}
`;

nstructjs.register(CurvVert);
CustomDataElem.register(CurvVert);

export function getCurveVerts(mesh) {
  let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");
  if (cd_cotan < 0) {
    let layer = mesh.verts.addCustomDataLayer("cotan");
    layer.flag |= CDFlags.TEMPORARY;
    cd_cotan = layer.index;
  }

  let cd_curv = mesh.verts.customData.getLayerIndex("curv");

  if (cd_curv < 0) {
    let layer = mesh.verts.addCustomDataLayer("curv");
    layer.flag |= CDFlags.TEMPORARY;
    cd_curv = layer.index;
  }

  return cd_curv;
}

export function initCurveVerts(mesh) {
  let cd_curv = getCurveVerts(mesh);
  let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

  for (let v of mesh.verts) {
    v.customData[cd_curv].check(v, cd_cotan);
  }

  return cd_curv;
}


//directional curvature smooth
const dtmp1 = new Vector3();
const dtmp2 = new Vector3();
const dtmp3 = new Vector3();
const dtmp4 = new Vector3();
const dtmp5 = new Vector3();
const dtmp6 = new Vector3();
const dtmp7 = new Vector3();
const dtmp8 = new Vector3();
const dtmp9 = new Vector3();
const dmat1 = new Matrix4();
const dmat2 = new Matrix4();
const dmat3 = new Matrix4();
const dmat4 = new Matrix4();

export function dirCurveSmooth(v, dir, fac = 0.5, cd_curv) {
  //implement me!
}

export function dirCurveSmooth2(v, dir, fac = 0.5, cd_curv) {
  let cv = v.customData[cd_curv];

  let t1 = dtmp1;
  let t2 = dtmp2;
  let t3 = dtmp3;
  let t4 = dtmp4;
  let t5 = dtmp5;

  t1.load(cv.tan);
  t2.load(cv.tan).cross(cv.no).normalize();

  let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

  cv.check(v, cd_cotan);

  let mat1 = dmat1;
  mat1.makeIdentity();

  let co = dtmp8;
  let tot = 0.0;

  co.zero();

  for (let v2 of v.neighbors) {
    let cv2 = v2.customData[cd_curv];

    cv2.check(v2, cd_cotan);

    t3.load(cv2.tan);
    t4.load(cv2.tan).cross(cv2.no).normalize();

    let m = mat1.$matrix;

    m.m11 = cv2.tan[0];
    m.m21 = cv2.tan[1];
    m.m31 = cv2.tan[2];

    m.m12 = t4[0];
    m.m22 = t4[1];
    m.m32 = t4[2];

    m.m13 = cv2.no[0];
    m.m23 = cv2.no[1];
    m.m33 = cv2.no[2];

    let imat1 = dmat2;
    imat1.load(mat1);
    imat1.invert();

    t1.load(v).sub(v2)

    if (0) {
      t1.multVecMatrix(imat1);
      t1[2] *= 0.25;
      t1.multVecMatrix(mat1);
    }

    let d = t1.dot(v2.no);
    t1.addFac(v2.no, -d*0.5);

    t1.add(v2);

    let w = 1.0;
    co.addFac(t1, w);
    tot += w;
  }

  if (tot === 0.0) {
    return;
  }

  co.mulScalar(1.0/tot);

  v.interp(co, fac);
  v.flag |= MeshFlags.UPDATE;
}

export function dirCurveSmooth1(v, dir, fac = 0.5) {
  let w, th, llen;
  let maxllen = 0.0;
  let avgllen = 0.0;
  let avgllen_tot = 0.0;

  function calcWeight(v, v2) {
    let t1 = dtmp6;
    let t2 = dtmp7;

    t1.load(v2).sub(v);
    let d = t1.dot(v2);

    t2.load(v2.no).sub(v.no);
    llen = t2.vectorLength();

    maxllen = Math.max(maxllen, llen);
    avgllen += llen;
    avgllen_tot++;

    if (llen < 0.00001) {
      w = 0.0;
      th = 0.0;
      llen = 0.0;

      return;
    }

    t2.mulScalar(1.0/llen);

    th = v.no.dot(v2.no);
    th = Math.acos(th*0.999999);

    w = Math.abs(t1.dot(dir))/llen;
  }

  function calcCurv(v) {
    let sum = 0.0, count = 0.0;

    for (let v2 of v.neighbors) {
      calcWeight(v, v2);

      sum += Math.abs(th)*w;
      count += 1.0;
    }

    return count ? sum/count : 0.0;
  }

  function error() {
    let t1 = dtmp1;
    let t2 = dtmp2;

    let sum = 0.0;
    let count = 0.0;

    let flag = MeshFlags.NOAPI_TEMP1;
    let flag2 = MeshFlags.NOAPI_TEMP2;

    v.flag &= ~flag;
    for (let v2 of v.neighbors) {
      for (let v3 of v.neighbors) {
        v3.flag &= ~(flag | flag2);
      }
    }

    for (let v2 of v.neighbors) {
      for (let v3 of v2.neighbors) {
        if (!(v3.flag & flag)) {
          v3.calcNormal(true);
          v3.flag |= flag;
        }
      }
    }

    let k1 = calcCurv(v);

    for (let v2 of v.neighbors) {
      let k2 = calcCurv(v2);
      //calcWeight(v, v2);
      let dk = (k2 - k1);

      sum += Math.abs(dk)*w;
      count += 1.0;
    }

    return count ? sum/count : 0.0;
  }

  let g = dtmp5;
  let df = 0.0005;

  let r1 = error();
  let totg = 0.0;

  for (let i = 0; i < 3; i++) {
    let orig = v[i];

    v[i] += df;
    let r2 = error();
    v[i] = orig;

    g[i] = (r2 - r1)/df;

    totg += g[i]*g[i];
  }

  if (totg === 0.0) {
    return;
  }

  if (avgllen_tot) {
    avgllen /= avgllen_tot;
  }

  if (maxllen < 0.00005) {
    return;
  }

  let limit = maxllen*0.5;

  let k = fac; //r1/totg*0.1;

  for (let i = 0; i < 3; i++) {
    let off = -g[i]*k;

    off = Math.min(Math.max(off, -limit), limit);

    v[i] += off;
  }

  v.flag |= MeshFlags.UPDATE;
}

export function smoothCurvatures(mesh, vs = mesh.verts, fac = 0.5, projection = 0.0) {
  vs = new Set(vs);

  let cd_curv = getCurveVerts(mesh);
  let cd_fset = getFaceSets(mesh, false);

  let tmp1 = new Vector3();
  let tmp2 = new Vector3();
  let tmp3 = new Vector3();
  let tmp4 = new Vector3();

  let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

  let dosmooth = (v, fac) => {
    let val = v.edges.length;
    let cv = v.customData[cd_curv];

    if (val == 0.0) {
      return;
    }

    let mat = cv.covmat;
    let w1 = 1.0 - fac;
    let w2 = fac/val;

    for (let i = 0; i < 16; i++) {
      mat[i] *= w1;
    }

    for (let v2 of v.neighbors) {
      let cv2 = v2.customData[cd_curv];
      let mat2 = cv2.covmat;

      for (let i = 0; i < 16; i++) {
        mat[i] += mat2[i]*w2;
      }
    }

    //XXX argh, space conversion?
    let nmat = new Matrix4();
    cv._finish(nmat, v, cd_cotan, cd_fset);
  }

  let quat = new Quat();
  let dosmooth_quat = (v, fac) => {
    let totw = 0.0;
    let sv = v.customData[cd_curv];
    let tan1 = tmp3.load(sv.tan).normalize();

    let tan = tmp1.load(sv.tan);

    for (let v2 of v.neighbors) {
      let sv2 = v2.customData[cd_curv];
      let w = 1.0;

      //w = Math.abs(Math.abs(sv2.k1) - Math.abs(sv2.k2));
      w = 1.0;

      let tan2 = tmp2.load(sv2.tan);
      let d = tan2.dot(v.no);
      tan2.addFac(v.no, -d).normalize();

      if (!((v.flag | v2.flag) & MeshFlags.SINGULARITY)) {
        let th = -Math.acos(tan2.dot(tan1)*0.999999);
        th = th%(Math.PI*0.5);

        if (Math.abs(th) > Math.PI*0.25) {
          th = -(Math.PI*0.5 - Math.abs(th))*Math.sign(th);
        }

        th = -th;

        tmp4.load(tan1).cross(tan2).normalize();

        quat.axisAngleToQuat(tmp4, th);
        quat.normalize();
        tan2.mulVecQuat(quat);

        if (Math.random() > 0.999) {
          //console.log("TH", tan2.dot(tan1));
        }
      }

      tan.addFac(tan2, w);
      totw += w;
    }

    if (totw > 0.0) {
      tan.mulScalar(1.0/totw);
      sv.tan.interp(tan, fac).normalize();
    }
  }

  for (let v of vs) {
    v.customData[cd_curv].check(v, cd_cotan);
  }

  for (let v of vs) {
    dosmooth(v, fac);
  }
}
