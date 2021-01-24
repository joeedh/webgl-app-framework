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

let addtmps = util.cachering.fromConstructor(Vector3, 16);
function addMat(amat, v1, v2, w=1.0) {
  let no = addtmps.next().load(v2.no).sub(v1.no);

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

  check(v) {
    if (v.flag & CVFlags.UPDATE) {
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

    for (let v2 of v.neighbors) {
      if (!(v2.flag & flag)) {
        v2.flag |= flag;
        addMat(mat, v, v2);
      }
      //  continue;
      for (let v3 of v2.neighbors) {
        if (!(v3.flag & flag)) {
          v3.flag |= flag;
          addMat(mat, v, v3);
        }
      }
    }

    let mat2 = ctmps_mats.next();
    mat2.load(mat);

    let lastno = ctmps_vs.next().zero();
    let no = ctmps_vs.next();

    no.load(v.no);

    for (let i=0; i<75; i++) {
      no.normalize();

      if (i > 0 && no.vectorDistanceSqr(lastno) < 0.0001) {
        break;
      }

      lastno.load(no);
      no.multVecMatrix(mat2);
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
    b.no = new Vector3();
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
