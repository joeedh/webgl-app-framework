import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {LogContext} from './mesh_base.js';

import {nstructjs} from '../path.ux/scripts/pathux.js';

import {MeshFlags} from './mesh_base.js';
import {CustomDataElem, CDFlags} from './customdata.js';
import {tri_angles} from '../util/math.js';

export const CotanVertFlags = {
  UPDATE: 1
};

let digest = new util.HashDigest();


let _cota = new Vector3();
let _cotb = new Vector3();
let _cotc = new Vector3();

export function cotangent_tri_weight_v3(v1, v2, v3) {
  let c_len;
  let a = _cota, b = _cotb, c = _cotc;

  a.load(v2).sub(v1);
  b.load(v3).sub(v1);
  c.load(a).cross(b);

  c_len = c.vectorLength();

  if (c_len > 0.00001) {
    return a.dot(b)/c_len;
  }

  return 0.0;
}


// TODO: check if (mathematically speaking) is it really necassary
// to sort the edge lists around verts

let _pr = new Vector3();
let _pq = new Vector3();

// from http://rodolphe-vaillant.fr/?e=20
export function tri_voronoi_area(p, q, r) {


  let pr = _pr, pq = _pq;

  pr.load(p).sub(r);
  pq.load(p).sub(q);

  let angles = math.tri_angles(p, q, r);

  if (angles[0] > Math.PI*0.5) {
    return math.tri_area(p, q, r)/2.0;
  } else if (angles[1] > Math.PI*0.5 || angles[2] > Math.PI*0.5) {
    return math.tri_area(p, q, r)/2.0;
  } else {
    let dpr = pr.dot(pr);
    let dpq = pq.dot(pq);

    let area = (1.0/8.0)*(dpr*cotangent_tri_weight_v3(q, p, r) + dpq*cotangent_tri_weight_v3(r, q, p));

    return area;
  }
}

export class CotanVert extends CustomDataElem {
  constructor() {
    super();

    this.ws = [];
    this.cot1 = [];
    this.cot2 = [];
    this.areas = [];
    this.totarea = 0;

    this._last_hash = 0;

    this.flag = CotanVertFlags.UPDATE;
  }

  static define() {
    return {
      typeName     : "cotan",
      uiName       : "cotan",
      defaultName  : "cotan",
      valueSize    : undefined,
      settingsClass: undefined
    }
  }

  calcMemSize() {
    return this.ws.length*8*4 + 8;
  }

  interp(dest, datas, ws) {
    dest.flag |= CotanVertFlags.UPDATE;
  }

  copyTo(b) {
    b.flag = this.flag | CotanVertFlags.UPDATE;

    b.ws = this.ws.concat([]);
    b.cot1 = this.cot1.concat([]);
    b.cot2 = this.cot2.concat([]);
    b.areas = this.areas.concat([]);
    b.totarea = this.totarea;
  }

  check(v, cd_cotan) {
    if (this.flag & CotanVertFlags.UPDATE) {
      this.recalc(v);
      return true;
    }

    digest.reset();
    digest.add(v[0]);
    digest.add(v[1]);
    digest.add(v[2]);
    digest.add(v.edges.length);
    digest.add(v.no[0]);
    digest.add(v.no[1]);
    digest.add(v.no[2]);

    let hash = digest.get();

    if (hash !== this._last_hash) {
      this._last_hash = hash;
      this.flag |= CotanVertFlags.UPDATE;

      //flag surrounding verts too
      for (let v2 of v.neighbors) {
        v2.customData[cd_cotan].flag |= CotanVertFlags.UPDATE;
      }
    }

    if (this.flag & CotanVertFlags.UPDATE) {
      this.recalc(v);
      return true;
    }

    return false;
  }

  recalc(v) {
    this.flag &= ~CotanVertFlags.UPDATE;
    let val = v.edges.length;

    if (this.ws.length !== val) {
      this.ws.length = val;
      this.cot1.length = val;
      this.cot2.length = val;
      this.areas.length = val;
    }

    let totarea = 0.0;

    let ws = this.ws, cot1 = this.cot1, cot2 = this.cot2, areas = this.areas;

    for (let i = 0; i < val; i++) {
      let eprev = v.edges[(i + val - 1)%val];
      let e = v.edges[i];
      let enext = v.edges[(i + 1)%val];

      let v1 = eprev.otherVertex(v);
      let v2 = e.otherVertex(v);
      let v3 = enext.otherVertex(v);

      let cot1_th = cotangent_tri_weight_v3(v1, v, v2);
      let cot2_th = cotangent_tri_weight_v3(v3, v2, v);

      let area = tri_voronoi_area(v, v1, v2);

      let w = (cot1_th + cot2_th);

      ws[i] = w;
      cot1[i] = cot1_th;
      cot2[i] = cot2_th;
      areas[i] = area;
      totarea += area;
    }

    if (totarea === 0.0) {
      return;
    }

    let mul = 1.0 / (2.0 * totarea);

    for (let i=0; i<val; i++) {
      ws[i] *= mul;
    }
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);

    this.flag |= CotanVertFlags.UPDATE;
  }
}

CotanVert.STRUCT = nstructjs.inherit(CotanVert, CustomDataElem) + `
  ws           : array(float);
  cot1         : array(float);
  cot2         : array(float);
  areas        : array(float);
  totarea      : float;
  flag         : int;
  _last_hash   : int;
}`;

nstructjs.register(CotanVert);
CustomDataElem.register(CotanVert);
