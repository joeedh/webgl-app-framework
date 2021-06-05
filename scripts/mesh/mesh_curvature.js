import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {LogContext} from './mesh_base.js';

import {nstructjs} from '../path.ux/scripts/pathux.js';

import {MeshFlags} from './mesh_base.js';
import {CustomDataElem, CDFlags} from './customdata.js';

export const CVFlags = {
  UPDATE : MeshFlags.UPDATE
};

let ctmps_vs = util.cachering.fromConstructor(Vector3, 512);
let ctmps_arrmats = new util.cachering(() => new Float64Array(16), 512);
let ctmps_mats = util.cachering.fromConstructor(Matrix4, 512);

const PROJECT_CURV_NORMALS = true;

let tan_tmp = new Vector3();

let addtmps = util.cachering.fromConstructor(Vector3, 16);
function addMat(amat, v1, v2, w=1.0, nmat) {
  let no = addtmps.next().load(v2.no).sub(v1.no);

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
  amat[8] += no[1]*no[0]*w;
  amat[9] += no[1]*no[1]*w;
  amat[10] += no[1]*no[2]*w;
}

function calcCoKey(co) {
  let x = co[0], y = co[1], z = co[2];

  x = ~~(x*1024*1024);
  y = ~~(y*1024*128);
  z = ~~(z*1024);

  let hash = x ^ y;
  hash = hash ^ z;

  return (hash + x + y + z) & ((1<<27)-1);
}
window._calcCoKey = calcCoKey;

let lasttime = util.time_ms();

let mtmp = new Matrix4();

export class CurvVert extends CustomDataElem {
  constructor() {
    super();
    this.tan = new Vector3();
    this.k1 = 0;
    this.k2 = 0;
    this.no = new Vector3();
    this.flag = CVFlags.UPDATE;
    this.v = undefined;
    this.cokey = 0;
  }

  calcMemSize() {
    return 8*6 + 8*2 + 8;
  }

  static apiDefine(api, dstruct) {

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

  check(v, forceCheck=false) {
    if (forceCheck || (v.flag & MeshFlags.UPDATE)) {
      let key = calcCoKey(v);
      //console.log("key", key);

      if (key !== this.cokey) {
        this.flag |= CVFlags.UPDATE;
        this.cokey = key;
      }
    }

    if (this.flag & CVFlags.UPDATE) {
      this.update(v);
    }

    return this;
  }

  update(v) {
    this.flag &= ~CVFlags.UPDATE;

    if (util.time_ms() - lasttime > 75) {
      //console.warn("Updating CV vert");
      lasttime = util.time_ms();
    }

    this.v = v;

    this.cokey = calcCoKey(v);

    let mat = ctmps_arrmats.next();
    for (let i=0; i<mat.length; i++) {
      mat[i] = 0.0;
    }

    let flag = MeshFlags.NOAPI_TEMP1;

    for (let v2 of v.neighbors) {
      v2.flag &= ~flag;

      for (let v3 of v2.neighbors) {
        v3.flag &= ~flag;
      }
    }

    let nmat;

    if (PROJECT_CURV_NORMALS) {
      nmat = mtmp;
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


    function rec(v2, depth=0) {
      for (let e of v2.edges) {
        let v3 = e.otherVertex(v2);

        if (v3.flag & flag) {
          continue;
        }

        v3.flag |= flag;
        addMat(mat, v, v3, undefined, nmat);

        if (depth > 0) {
          rec(v3, depth-1);
        }
      }
    }

    function unrec(v2, depth) {
      for (let e of v2.edges) {
        let v3 = e.otherVertex(v2);

        if (!(v3.flag & flag)) {
          continue;
        }

        v3.flag &= ~flag;

        if (depth > 0) {
          unrec(v3, depth-1);
        }
      }
    }

    let d1 = window.d1 !== undefined ? window.d1 : 1;
    d1 = ~~d1;

    //rec(v, d1);

    v.flag &= ~flag;
    //unrec(v, d1);

    if (1) {
      for (let v2 of v.neighbors) {
        if (!(v2.flag & flag)) {
          v2.flag |= flag;
          addMat(mat, v, v2, undefined, nmat);
        }
      }

      for (let v2 of v.neighbors) {
        for (let v3 of v2.neighbors) {
          if (!(v3.flag & flag)) {
            v3.flag |= flag;
            addMat(mat, v, v3, undefined, nmat);
          }
        }
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

    for (let i=0; i<75; i++) {
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

    this.k1 = no.vectorLength();

    if (this.k1 > 0.00001) {
      no.mulScalar(1.0 / this.k1);
    }

    this.no.load(no);
    this.tan.load(no).cross(v.no).normalize();

    return this;
  }

  setValue(b) {
    this.tan.load(b);
  }

  getValue() {
    return this.tan;
  }

  copyTo(b) {
    b.tan.load(this.tan);
    b.k1 = this.k1;
    b.k2 = this.k2;
    b.no.load(this.no);
    b.flag = this.flag;
  }

  interp(dst, datas, ws) {
    dst.tan.zero();
    dst.k1 = 0;
    dst.k2 = 0;
    dst.no.zero();

    for (let i=0; i<datas.length; i++) {
      let w = ws[i];
      let src = datas[i];

      if (i === 0) {
        dst.flag = src.flag | CVFlags.UPDATE;
      }

      dst.tan.addFac(src.tan, w);
      dst.no.addFac(src.no, w);
      dst.k1 += src.k1*w;
      dst.k2 += src.k2*w;
    }

    dst.no.normalize();
    dst.tan.normalize();
  }


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
}
CurvVert.STRUCT = nstructjs.inherit(CurvVert, CustomDataElem) + `
  flag      : int;
  tan       : vec3;
  k1        : double;
  k2        : double;
  no        : vec3;  
}
`;

nstructjs.register(CurvVert);
CustomDataElem.register(CurvVert);

export function getCurveVerts(mesh) {
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

  for (let v of mesh.verts) {
    v.customData[cd_curv].check();
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

export function dirCurveSmooth(v, dir, fac=0.5, cd_curv) {
  //implement me!
}

export function dirCurveSmooth2(v, dir, fac=0.5, cd_curv) {
  let cv = v.customData[cd_curv];

  let t1 = dtmp1;
  let t2 = dtmp2;
  let t3 = dtmp3;
  let t4 = dtmp4;
  let t5 = dtmp5;

  t1.load(cv.tan);
  t2.load(cv.tan).cross(cv.no).normalize();

  cv.check(v);

  let mat1 = dmat1;
  mat1.makeIdentity();

  let co = dtmp8;
  let tot = 0.0;

  co.zero();

  for (let v2 of v.neighbors) {
    let cv2 = v2.customData[cd_curv];

    cv2.check(v2);

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

  co.mulScalar(1.0 / tot);

  v.interp(co, fac);
  v.flag |= MeshFlags.UPDATE;
}
export function dirCurveSmooth1(v, dir, fac=0.5) {
  let w, th, llen;
  let maxllen=0.0;
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

    w = Math.abs(t1.dot(dir)) / llen;
  }

  function calcCurv(v) {
    let sum=0.0, count=0.0;

    for (let v2 of v.neighbors) {
      calcWeight(v, v2);

      sum += Math.abs(th)*w;
      count += 1.0;
    }

    return count ? sum / count : 0.0;
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
        v3.flag &= ~(flag|flag2);
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

      sum += Math.abs(dk) * w;
      count += 1.0;
    }

    return count ? sum / count : 0.0;
  }

  let g = dtmp5;
  let df = 0.0005;

  let r1 = error();
  let totg = 0.0;

  for (let i=0; i<3; i++) {
    let orig = v[i];

    v[i] += df;
    let r2 = error();
    v[i] = orig;

    g[i] = (r2 - r1) / df;

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

  for (let i=0; i<3; i++) {
    let off = -g[i]*k;

    off = Math.min(Math.max(off, -limit), limit);

    v[i] += off;
  }

  v.flag |= MeshFlags.UPDATE;
}

export function smoothCurvatures(mesh, vs=mesh.verts, fac=1.0, projection=0.0) {
  vs = new Set(vs);

  let cd_curv = getCurveVerts(mesh);

  let tmp1 = new Vector3();
  let tmp2 = new Vector3();
  let tmp3 = new Vector3();

  let dosmooth = (v, fac) => {
    let totw = 0.0;
    let sv = v.customData[cd_curv];

    let tan = tmp1.load(sv.tan);

    for (let v2 of v.neighbors) {
      let sv2 = v2.customData[cd_curv];
      let w = 1.0;

      w = Math.abs(Math.abs(sv2.k1) - Math.abs(sv2.k2));

      let tan2 = tmp2.load(sv2.tan);
      let d = tan2.dot(v.no);
      tan2.addFac(v.no, -d).normalize();

      tan.addFac(tan2, w);
      totw += w;
    }

    if (totw > 0.0) {
      tan.mulScalar(1.0 / totw);
      sv.tan.interp(tan, fac).normalize();
    }
  }

  for (let v of vs) {
    dosmooth(v, fac);
  }
}
