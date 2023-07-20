import {nstructjs, util, math} from '../path.ux/scripts/pathux.js';
import {CustomDataElem, LayerSettingsBase} from './customdata.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import '../util/numeric.js';

let Queue = util.Queue;
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {buildCotanVerts, getCotanData, VAREA, VCTAN1, VCTAN2, VW, VETOT, vertexSmooth} from './mesh_utils.js';

export const ParamizeModes = {
  SELECTED: 1,
  MAX_Z   : 2
};


let tmp1 = new Vector3();
let tmp2 = new Vector3();
let tmp3 = new Vector3();

let gtmps = util.cachering.fromConstructor(Vector3, 256);

export const KDrawModes = {
  NO   : 0,
  TAN  : 1,
  BIN  : 2,
  DK1  : 3,
  DK2  : 4,
  DK3  : 5,
  D2K1 : 6,
  D2K2 : 7,
  D2K3 : 8,
  D3K1 : 9,
  D3K2 : 10,
  D3K3 : 11,
  ERROR: 12
};

window.kdrawmode = KDrawModes.TAN;

/* Propagate distance from v1 and v2 to v0. */
export function geodesic_distance_triangle(v0, v1, v2, dist1, dist2) {
  /* Vectors along triangle edges. */
  let v10 = gtmps.next();
  let v12 = gtmps.next();

  v10.load(v0).sub(v1);
  v12.load(v2).sub(v1);

  const eps = 0.0000000;

  if (dist1 > eps && dist2 > eps) {
    /* Local coordinate system in the triangle plane. */
    let u = gtmps.next(), v = gtmps.next(), n = gtmps.next();

    u.load(v12);
    let d12 = u.vectorLength();

    if (d12 > eps) {
      u.mulScalar(1.0/d12);
    } else {
      d12 = 0.0;
    }

    if (d12*d12 > eps) {
      n.load(v12).cross(v10);
      n.normalize();

      v.load(n).cross(u);

      /* v0 in local coordinates */
      let v0_ = gtmps.next().zero();
      v0_[0] = v10.dot(u);
      v0_[1] = Math.abs(v10.dot(v));

      /* Compute virtual source point in local coordinates, that we estimate the geodesic
       * distance is being computed from. See figure 9 in the paper for the derivation. */
      let a = 0.5*(1.0 + (dist1*dist1 - dist2*dist2)/(d12*d12));
      const hh = dist1*dist1 - a*a*d12*d12;

      if (hh > 0.0) {
        const h = Math.sqrt(hh);
        let S_ = gtmps.next().zero();

        S_[0] = a*d12;
        S_[1] = -h;

        /* Only valid if the line between the source point and v0 crosses
         * the edge between v1 and v2. */
        const x_intercept = S_[0] + h*(v0_[0] - S_[0])/(v0_[1] + h);

        if (x_intercept >= eps && x_intercept <= d12 - eps) {
          return S_.vectorDistance(v0_);
        }
      }
    }
  }


  /* Fall back to Dijsktra approximation in trivial case, or if no valid source
   * point found that connects to v0 across the triangle. */
  return Math.min(dist1 + v10.vectorLength(), dist2 + v0.vectorDistance(v2));
}

export const WeightModes = {
  SIMPLE     : 0,
  EDGE_LENGTH: 1,
  COTAN      : 2
};

export class ParamVertSettings extends LayerSettingsBase {
  constructor() {
    super();

    this.updateGen = 0;
    this.smoothTangents = true;
    this.weightMode = WeightModes.EDGE_LENGTH;
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    st.int("updateGen", "updateGen", "Generation").noUnits().readOnly();
    st.bool("smoothTangents", "smoothTangents", "Smooth Tangents"); //.noUnits().range(0, 25);
    st.enum("weightMode", "weightMode", WeightModes, "Weight Mode");

    return st;
  }

  copyTo(b) {
    b.updateGen = this.updateGen;
    b.smoothTangents = this.smoothTangents;
    b.weightMode = this.weightMode;
  }
}

ParamVertSettings.STRUCT = nstructjs.inherit(ParamVertSettings, LayerSettingsBase) + `
  updateGen      : int;
  smoothTangents : bool;
  weightMode     : int;
}`;
nstructjs.register(ParamVertSettings);

let tmp = new Vector3();

export class ParamVert extends CustomDataElem {
  constructor() {
    super();

    /*
    this.lastd2k1 = new Vector3();
    this.lastd2k2 = new Vector3();
    this.lastd2k3 = new Vector3();
    this.d2k1 = new Vector3();
    this.d2k2 = new Vector3();
    this.d2k3 = new Vector3();
    this.dk1 = this.dk2 = this.dk3 = new Vector3();
    this.d3k1 = this.d3k2 = this.d3k3 = new Vector3();
    //*/

    this.updateGen = 0;
    this.needsSmooth = false;
    this.disUV = new Vector4();
    this.smoothTan = new Vector3();
    this.totarea = 0.0;

    this.wlist = [];
  }

  static define() {
    return {
      typeName     : "paramvert",
      uiTypeName   : "Param Vert",
      defaultName  : "Param Vert",
      valueSize    : undefined,
      flag         : 0,
      settingsClass: ParamVertSettings
    }
  }

  calcMemSize() {
    return 32;
  }

  getValue() {
    return this.disUV;
  }

  interp(dest, datas, ws) {
    let x = 0, y = 0, z = 0, w = 0;
    let tx = 0, ty = 0, tz = 0;

    for (let i = 0; i < datas.length; i++) {
      let vec = datas[i].disUV;
      let weight = ws[i];

      x += vec[0]*weight;
      y += vec[1]*weight;
      z += vec[2]*weight;
      w += vec[3]*weight;

      vec = datas[i].smoothTan;

      tx += vec[0]*weight;
      ty += vec[1]*weight;
      tz += vec[2]*weight;
    }

    //normalize
    let l = Math.sqrt(y**2 + z**2 + w**2);

    if (l > 0.0) {
      l = 1.0/l;
    }

    dest.disUV[0] = x;
    dest.disUV[1] = y*l;
    dest.disUV[2] = z*l;
    dest.disUV[3] = w*l;

    dest.smoothTan[0] = tx;
    dest.smoothTan[1] = ty;
    dest.smoothTan[2] = tz;

    dest.smoothTan.normalize();
  }

  updateWeights(ps, owning_v, cd_pvert, cd_disp = undefined) {
    const val = owning_v.valence;

    if (this.wlist.length !== val) {
      this.wlist.length = val;
    }

    if (ps.weightMode === WeightModes.SIMPLE) {
      let w = 1.0/val;

      for (let i = 0; i < val; i++) {
        this.wlist[i] = w;
      }
    } else if (ps.weightMode === WeightModes.EDGE_LENGTH) {
      let wi = 0;
      let tot = 0.0;
      const wlist = this.wlist;

      for (let v2 of owning_v.neighbors) {
        let a = v2;
        let b = owning_v;

        if (cd_disp !== undefined) {
          a = v2.customData[cd_disp].worldco;
          b = owning_v.customData[cd_disp].worldco;
        }

        const w = a.vectorDistance(b);


        wlist[wi++] = w;
        tot += w;
      }

      if (tot) {
        tot = 1.0/tot;
      }

      for (let i = 0; i < val; i++) {
        wlist[i] *= tot;
      }
    } else {
      this.updateCotan(ps, owning_v, cd_pvert);
    }
  }

  updateCotan(ps, owning_v, cd_pvert) {
    if (ps.weightMode !== WeightModes.COTAN) {
      return;
    }

    let v = owning_v;

    let vdata = getCotanData(v);
    let totarea = 0.0;
    let totw = 0.0;

    let wi = 0;
    let vi = VETOT; //skip first entry

    for (let e of v.edges) {
      let area = vdata[vi + VAREA];
      let cot1 = vdata[vi + VCTAN1];
      let cot2 = vdata[vi + VCTAN2];

      let w = vdata[vi + VW];

      //cot1 = 1.0 / (cot1 + 0.00001);
      //cot2 = 1.0 / (cot2 + 0.00001);
      w = 1.0; //cot1 + cot2;

      if (area !== 0.0) {
        w *= area;
      }

      if (!area) {
        vi += VETOT;
        wi++;
        continue;
      }

      totarea += area;

      //w = -(cot1 + cot2);

      this.wlist[wi] = w//*area;

      vi += VETOT;
      wi++;
    }

    totw = totw ? 1.0/totw : 0.0;

    for (let i = 0; i < wi; i++) {
      this.wlist[wi] *= totw;
    }

    this.totarea = totarea;
  }

  smooth(ps, owning_v, cd_pvert, depth = 0) {
    let v = owning_v;

    let tot = 0.0;
    tmp.zero();

    this.needsSmooth = false;

    let flag = MeshFlags.MAKE_FACE_TEMP;

    for (let v2 of v.neighbors) {
      for (let v3 of v2.neighbors) {
        v3.flag &= ~flag;
      }
    }

    for (let v2 of v.neighbors) {
      for (let v3 of v2.neighbors) {
        if (v3 === v) {
          continue;
        }

        if (v3.flag & flag) {
          continue;
        }

        let pv3 = v3.customData[cd_pvert];
        let w = v3.vectorDistance(v);
        //w = 1.0;

        pv3.checkTangent(ps, v3, cd_pvert, true);
        v3.flag |= flag;

        tmp[0] += pv3.disUV[1]*w;
        tmp[1] += pv3.disUV[2]*w;
        tmp[2] += pv3.disUV[3]*w;
        //tmp.addFac(pv3.smoothTan, w);

        tot += w;
      }
    }

    if (tot) {
      let d = tmp.dot(v.no);
      tmp.addFac(v.no, -d);
      tmp.normalize();
      /*
        this.smoothTan[0] = this.disUV[1];
        this.smoothTan[1] = this.disUV[2];
        this.smoothTan[2] = this.disUV[3];
        this.smoothTan.interp(tmp, 1.0);
      */
      this.smoothTan.load(tmp);
    }
  }

  checkTangent(ps, owning_v, cd_pvert, noSmooth = false) {
    let updateCot = owning_v.valence !== this.wlist.length;
    updateCot = updateCot || ps.updateGen !== this.updateGen;

    if (updateCot) {
      this.updateWeights(ps, owning_v, cd_pvert);
    }

    if (ps.updateGen !== this.updateGen) {
      this.updateGen = ps.updateGen;
      this.needsSmooth = true;
      this.updateTangent(ps, owning_v, cd_pvert, noSmooth);
    }
  }

  /*calculate tangent and smooth with neighbors
  * if necassary */
  updateTangent(ps, owning_v, cd_pvert, noSmooth = false, cd_disp = undefined, noNorm = false) {
    let v = owning_v;

    this.updateGen = ps.updateGen;

    let pv = v.customData[cd_pvert];
    let d1 = pv.disUV[0];

    let dv = tmp1.zero();

    if (v.valence !== this.wlist.length) {
      this.updateWeights(ps, owning_v, cd_pvert);
    }

    let norm = 0.0;
    const cotan = ps.weightMode === WeightModes.COTAN;
    const edge_length = ps.weightMode === WeightModes.EDGE_LENGTH;

    let i = 0;
    for (let e of v.edges) {
      let v2 = e.otherVertex(v);
      let pv2 = v2.customData[cd_pvert];

      let d2 = pv2.disUV[0];

      let w = 1.0;

      w = this.wlist[i];

      let dv2;
      if (cd_disp !== undefined && cd_disp >= 0) {
        dv2 = tmp3.load(v2.customData[cd_disp].smoothco).sub(v.customData[cd_disp].smoothco);
      } else {
        dv2 = tmp3.load(v2).sub(v);
      }

      if (!noNorm) {
        dv2.normalize();
      }

      dv2.mulScalar((d2 - d1)*w);

      dv.add(dv2);

      i++;
    }

    if (cotan) {
      //norm = this.totarea**2;
      //dv.mulScalar(1.0 / norm);
    }

    if (noNorm) {
      if (i) {
        dv.mulScalar(1.0/i);
      }
    } else {
      dv.normalize();
    }

    pv.disUV[1] = dv[0];
    pv.disUV[2] = dv[1];
    pv.disUV[3] = dv[2];

    if (!noSmooth && ps.smoothTangents) {
      pv.smoothTan.load(dv);
      this.smooth(ps, owning_v, cd_pvert);
    }
  }

  mulScalar(f) {
    this.disUV.mulScalar(f);
    return this;
  }

  clear() {
    this.disUV.zero();
    return this;
  }

  add(b) {
    this.disUV.add(b.disUV);
    return this;
  }

  addFac(b, fac) {
    this.disUV.addFac(b.disUV, fac);
    return this;
  }

  sub(b) {
    this.disUV.sub(b.disUV);
    return this;
  }

  setValue(v) {
    this.disUV.load(v);
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);

    if (typeof this.disUV !== "object") {
      this.disUV = new Vector3();
    } else if (this.disUV instanceof Vector3) {
      this.disUV = new Vector4(this.disUV);
      this.disUV[3] = 0.0;
    }
  }

  copyTo(b) {
    b.disUV.load(this.disUV);
    b.smoothTan.load(this.smoothTan);
  }
}

ParamVert.STRUCT = nstructjs.inherit(ParamVert, CustomDataElem) + `
    disUV        : vec4;
    updateGen    : int;
    smoothTan    : vec3;
    wlist        : array(float);
    totarea      : float;
  }`;
nstructjs.register(ParamVert);
CustomDataElem.register(ParamVert);

export function calcGeoDist(mesh, cd_pvert, shell, mode) {
  let ps = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  let verts = new Set();
  let edges = new Set();
  let loops = new Set();
  let faces = new Set();

  let startv = undefined;

  console.log("cd_pvert", cd_pvert);
  for (let f of shell) {
    faces.add(f);

    for (let l of f.loops) {
      verts.add(l.v);
      edges.add(l.e);
      loops.add(l);

      if (startv === undefined || (l.v.flag & MeshFlags.SELECT)) {
        startv = l.v;
      }
    }
  }
  if (mode === ParamizeModes.MAX_Z) {
    let min = new Vector3().addScalar(1e17);
    let max = new Vector3().addScalar(1e17);

    let vs = [];

    for (let v of verts) {
      min.min(v);
      max.max(v);

      vs.push(v);
    }

    let cent = max.sub(min);
    vs.sort((a, b) => {
      const eps = 0.00001;

      let dz = a[2] - b[2];
      if (dz > -eps && dz < eps) {
        return b[2] - a[2];
      }

      let da = (a[1] - cent[1])**2 + (a[0] - cent[0])**2;
      let db = (b[1] - cent[1])**2 + (b[0] - cent[0])**2;

      return da - db;
    });

    if (vs.length > 0) {
      startv = vs[0];
    }
  }

  for (let v of verts) {
    let pv = v.customData[cd_pvert];
    pv.updateWeights(ps, v, cd_pvert);
  }

  for (let v of verts) {
    v.customData[cd_pvert].disUV[0] = -1;
  }

  startv.customData[cd_pvert].disUV[0] = 0.0;

  let queue = new Queue(1024*64);
  queue.enqueue(startv);

  let visit = new WeakSet();
  let _i = 0;

  visit.add(startv);

  while (queue.length > 0) {
    let v = queue.dequeue();
    let pv = v.customData[cd_pvert];

    for (let e of v.edges) {
      let vb = e.otherVertex(v);
      let pvb = vb.customData[cd_pvert];

      for (let l of e.loops) {
        let l2 = l;
        let _i = 0;

        do {
          if (_i++ > 100000) {
            console.warn("Infinite loop error");
            break;
          }

          let v2 = l2.v;
          let pv2 = v2.customData[cd_pvert];

          if (v2 === v) {
            l2 = l2.next;
            continue;
          }

          let dis = v2.vectorDistance(v);

          if (v2 !== vb && pvb.disUV[0] >= 0.0) {
            dis = geodesic_distance_triangle(v2, v, vb, pv.disUV[0], pvb.disUV[0]);
            dis -= pv.disUV[0];
          }

          if (visit.has(v2)) {
            let dis2 = pv.disUV[0] + dis;
            pv2.disUV[0] = Math.min(pv2.disUV[0], dis2);
            l2 = l2.next;
          } else {
            pv2.disUV[0] = pv.disUV[0] + dis;

            visit.add(v2);
            queue.enqueue(v2);
          }
        } while (l2 !== l);
      }
    }

    if (_i++ > 5000000) {
      console.warn("infinite loop error");
      break;
    }
  }

  return {
    verts, edges, loops, faces
  };
}

export function testCurvatureMath(mesh, cd_pvert, shell, mode) {
  let ps = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  let verts = new Set();
  let edges = new Set();
  let loops = new Set();
  let faces = new Set();

  let startv = undefined;

  console.log("cd_pvert", cd_pvert);
  for (let f of shell) {
    faces.add(f);

    for (let l of f.loops) {
      verts.add(l.v);
      edges.add(l.e);
      loops.add(l);

      if (startv === undefined || (l.v.flag & MeshFlags.SELECT)) {
        startv = l.v;
      }
    }
  }

  if (1) {
    let co = new Vector3();
    let n = new Vector3();
    let dv = new Vector3();
    let mat = new Matrix4();

    for (let v of verts) {
      let pv = v.customData[cd_pvert];

      co.zero();
      n.zero();
      let tot = 0.0;

      for (let v2 of v.neighbors) {
        co.add(v2);
        n.add(v2.no);
        tot++;
      }

      if (!tot) {
        continue;
      }

      co.mulScalar(1.0/tot);
      n.normalize();

      let dis = v.vectorDistance(co)*0.1;
      //dis = n.dot(v.no);
      //dis = Math.acos(n.dot(v.no);

      pv.disUV[0] = dis;
      co.sub(v);
      pv.dis = dis;

      pv.dv = new Vector3(co);
    }

    const CURVATURE = true;
    let dvtmp = new Vector3();

    let cos = [];
    const flag = MeshFlags.MAKE_FACE_TEMP;

    for (let v of verts) {
      if (!CURVATURE) {
        break;
      }
      let pv = v.customData[cd_pvert];

      mat.makeIdentity();
      let m = mat.$matrix;

      m.m11 = m.m22 = m.m33 = m.m44 = 0.0;

      let w = 1.0/(v.edges.length);

      for (let v2 of v.neighbors) {
        v2.flag &= ~flag;
        for (let v3 of v2.neighbors) {
          v3.flag &= ~flag;
        }
      }

      v.flag |= flag;

      let count = 0;

      for (let v2 of v.neighbors) {
        for (let v3 of v2.neighbors) {
          if (!(v3.flag & flag)) {
            v3.flag |= flag;

            let w = v3.vectorDistance(v);

            cov(m, v3.no, -w);
            count += w;
          }
        }
      }

      if (0 && count > 0) {
        let mul = 1.0/count;
        m.m11 *= mul;
        m.m12 *= mul;
        m.m13 *= mul;
        m.m21 *= mul;
        m.m22 *= mul;
        m.m23 *= mul;
        m.m31 *= mul;
        m.m32 *= mul;
        m.m33 *= mul;
      }

      //cov(m, v.no, 1.0);

      let dv = dvtmp;
      let dv2 = new Vector3();
      let dv3 = new Vector3();
      let k1, k2, k3;

      let lastn = undefined;

      function eigen(n, k1) {
        /*
        on factor;
        off period;

        x2 := x*m11 + y*m21 + z*m31;
        y2 := x*m12 + y*m22 + z*m32;
        z2 := x*m13 + y*m23 + z*m33;

        len := (x2**2 + y2**2 + z2**2)**0.5;

        on fort;

        df(len, x, 2);
        df(len, y, 2);
        df(len, z, 2);
        x2 / len;
        y2 / len;
        z2 / len;

        off fort;

        */
        //this[0] = x*matrix.$matrix.m11 + y*matrix.$matrix.m21 + z*matrix.$matrix.m31;
        //this[1] = x*matrix.$matrix.m12 + y*matrix.$matrix.m22 + z*matrix.$matrix.m32;
        //this[2] = x*matrix.$matrix.m13 + y*matrix.$matrix.m23 + z*matrix.$matrix.m33;

        `
        for (let j = 0; j < 35; j++) {
          n.multVecMatrix(mat);
          k1 = n.dot(n);
          n.normalize();

          if (0 && lastn !== undefined && Math.abs(n.dot(lastn)) > 0.99) {
            n[0] = (Math.random() - 0.5);
            n[1] = (Math.random() - 0.5);
            n[2] = (Math.random() - 0.5);
            n.normalize();
          }
        }//`;

        let m11 = m.m11, m12 = m.m12, m13 = m.m13;
        let m21 = m.m21, m22 = m.m22, m23 = m.m23;
        let m31 = m.m31, m32 = m.m32, m33 = m.m33;
        let x = n[0], y = n[1], z = n[2];
        let sqrt = Math.sqrt;

        //first derivative
        let dx = ((m22*y + m32*z + m12*x)*m12 + (m23*y + m33*z + m13*x)*m13 + (m21*y + m31
          *z + m11*x)*m11)/sqrt((m21*y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2
          + (m23*y + m33*z + m13*x)**2);
        let dy = ((m22*y + m32*z + m12*x)*m22 + (m23*y + m33*z + m13*x)*m23 + (m21*y + m31
          *z + m11*x)*m21)/sqrt((m21*y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2
          + (m23*y + m33*z + m13*x)**2);
        let dz = ((m22*y + m32*z + m12*x)*m32 + (m23*y + m33*z + m13*x)*m33 + (m21*y + m31
          *z + m11*x)*m31)/sqrt((m21*y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2
          + (m23*y + m33*z + m13*x)**2);

        dv[0] = dx;
        dv[1] = dy;
        dv[2] = dz;

        //second derivative
        dx = (((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y + m31*
          z + m11*x)**2)*(m12**2 + m13**2 + m11**2) - ((m22*y + m32*z + m12*x)*m12 + (
          m23*y + m33*z + m13*x)*m13 + (m21*y + m31*z + m11*x)*m11)**2)/(sqrt((m21
          *y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)
          **2)*((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y + m31
          *z + m11*x)**2));


        dy = (((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y + m31*
          z + m11*x)**2)*(m22**2 + m23**2 + m21**2) - ((m22*y + m32*z + m12*x)*m22 + (
          m23*y + m33*z + m13*x)*m23 + (m21*y + m31*z + m11*x)*m21)**2)/(sqrt((m21
          *y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)
          **2)*((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y + m31
          *z + m11*x)**2))


        dz = (((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y + m31*
          z + m11*x)**2)*(m32**2 + m33**2 + m31**2) - ((m22*y + m32*z + m12*x)*m32 + (
          m23*y + m33*z + m13*x)*m33 + (m21*y + m31*z + m11*x)*m31)**2)/(sqrt((m21
          *y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)
          **2)*((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y + m31
          *z + m11*x)**2));

        dv2[0] = dx;
        dv2[1] = dy;
        dv2[2] = dz;

        dx = (-3*(((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y +
          m31*z + m11*x)**2)*(m12**2 + m13**2 + m11**2) - ((m22*y + m32*z + m12*x)*
          m12 + (m23*y + m33*z + m13*x)*m13 + (m21*y + m31*z + m11*x)*m11)**2)*((m22
          *y + m32*z + m12*x)*m12 + (m23*y + m33*z + m13*x)*m13 + (m21*y + m31*z + m11*x
        )*m11))/(sqrt((m21*y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2 + (
          m23*y + m33*z + m13*x)**2)*((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z +
          m13*x)**2 + (m21*y + m31*z + m11*x)**2)**2);

        dy = (-3*(((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y +
          m31*z + m11*x)**2)*(m22**2 + m23**2 + m21**2) - ((m22*y + m32*z + m12*x)*
          m22 + (m23*y + m33*z + m13*x)*m23 + (m21*y + m31*z + m11*x)*m21)**2)*((m22
          *y + m32*z + m12*x)*m22 + (m23*y + m33*z + m13*x)*m23 + (m21*y + m31*z + m11*x
        )*m21))/(sqrt((m21*y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2 + (
          m23*y + m33*z + m13*x)**2)*((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z +
          m13*x)**2 + (m21*y + m31*z + m11*x)**2)**2)

        dz = (-3*(((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z + m13*x)**2 + (m21*y +
          m31*z + m11*x)**2)*(m32**2 + m33**2 + m31**2) - ((m22*y + m32*z + m12*x)*
          m32 + (m23*y + m33*z + m13*x)*m33 + (m21*y + m31*z + m11*x)*m31)**2)*((m22
          *y + m32*z + m12*x)*m32 + (m23*y + m33*z + m13*x)*m33 + (m21*y + m31*z + m11*x
        )*m31))/(sqrt((m21*y + m31*z + m11*x)**2 + (m22*y + m32*z + m12*x)**2 + (
          m23*y + m33*z + m13*x)**2)*((m22*y + m32*z + m12*x)**2 + (m23*y + m33*z +
          m13*x)**2 + (m21*y + m31*z + m11*x)**2)**2);

        dv3[0] = dx;
        dv3[1] = dy;
        dv3[2] = dz;

        //return k1;
      }

      n.load(v.no);

      if (1) {
        let nmat = [
          [m.m11, m.m12, m.m13],
          [m.m21, m.m22, m.m23],
          [m.m31, m.m32, m.m33]
        ];

        let ret = numeric.eig(nmat, 50);

        pv.no = new Vector3(ret.E.x[0]);
        pv.tan = new Vector3(ret.E.x[1]);
        pv.bin = new Vector3(ret.E.x[2]);
        pv.k1 = ret.lambda.x[0];
        pv.k2 = ret.lambda.x[1];
        pv.k3 = ret.lambda.x[2];

        pv.disUV[0] = (pv.k2 + pv.k3)**2;

        eigen(pv.no, pv.k1);
        pv.lastd2k1.load(pv.d2k1);
        pv.dk1 = new Vector3(dv);
        pv.d2k1 = new Vector3(dv2);
        pv.d3k1 = new Vector3(dv3);

        eigen(pv.tan, pv.k2);
        pv.lastd2k2.load(pv.d2k2);
        pv.dk2 = new Vector3(dv);
        pv.d2k2 = new Vector3(dv2);
        pv.d3k2 = new Vector3(dv3);

        eigen(pv.bin, pv.k3);
        pv.lastd2k3.load(pv.d2k3);
        pv.dk3 = new Vector3(dv);
        pv.d2k3 = new Vector3(dv2);
        pv.d3k3 = new Vector3(dv3);
      } else {

        pv.k1 = eigen();
        pv.lastd2k1.load(pv.d2k1);
        pv.no = new Vector3(n);
        pv.dk1 = new Vector3(dv);
        pv.d2k1 = new Vector3(dv2);
        pv.d3k1 = new Vector3(dv3);

        lastn = pv.no;

        /*
        for (let v2 of v.neighbors) {
          if (v2.vectorDistanceSqr(v) > 0.00001) {
            n.load(v2).sub(v).normalize();
            break;
          }
        }//*/

        //n.addFac(v.no, -n.dot(v.no));
        //n.negate();

        n.cross(v.no).normalize();
        //bias away from previous eigenvector
        m.m11 -= pv.k1;
        m.m22 -= pv.k1;
        m.m33 -= pv.k1;
        //no need to invert here, matrix is symmetric

        pv.k2 = eigen();
        pv.lastd2k2.load(pv.d2k2);
        pv.tan = new Vector3(n);
        pv.dk2 = new Vector3(dv);
        pv.d2k2 = new Vector3(dv2);
        pv.d3k2 = new Vector3(dv3);

        n.cross(v.no).normalize()//.negate();
        pv.k3 = eigen();
        pv.lastd2k3.load(pv.d2k3);
        pv.bin = new Vector3(n);
        pv.dk3 = new Vector3(dv);
        pv.d2k3 = new Vector3(dv2);
        pv.d3k3 = new Vector3(dv3);

        pv.disUV[0] = (pv.k2 + pv.k3)**2;
      }
    }

    let dv2 = new Vector3();
    let dv3 = new Vector3();
    let dv4 = new Vector3();
    let dv5 = new Vector3();
    let dv6 = new Vector3();

    function cov(m, n, w) {
      m.m11 += n[0]*n[0]*w;
      m.m12 += n[0]*n[1]*w;
      m.m13 += n[0]*n[2]*w;
      m.m21 += n[1]*n[0]*w;
      m.m22 += n[1]*n[1]*w;
      m.m23 += n[1]*n[2]*w;
      m.m31 += n[2]*n[0]*w;
      m.m32 += n[2]*n[1]*w;
      m.m33 += n[2]*n[2]*w;
    }

    for (let i = 0; i < 0; i++) {
      for (let v of verts) {
        let pv = v.customData[cd_pvert];
        let dis = 0.0;
        let tot = 0.0;

        dv.zero();
        let error = 0.0;

        if (!CURVATURE) {
          dv2[0] = pv.disUV[1];
          dv2[1] = pv.disUV[2];
          dv2[2] = pv.disUV[3];
        }

        for (let v2 of v.neighbors) {
          let pv2 = v2.customData[cd_pvert];
          let w = 1.0;

          if (!CURVATURE) {
            dv3[0] = pv.disUV[1];
            dv3[1] = pv.disUV[2];
            dv3[2] = pv.disUV[3];

            let dis1 = pv.dis, dis2 = pv2.dis;
            error += (dis1 - dis2)**2;

            for (let j = 0; j < 3; j++) {
              dv4[j] = pv.dv[j]*dis1 - pv.dv[j]*dis2 - pv2.dv[j]*dis1 + pv2.dv[j]*dis2;
            }

            dv.addFac(dv4, w);
          }

          dis += pv2.disUV[0]*w;
          tot += w;
        }

        if (!tot) {
          continue;
        }

        dis /= tot;
        error /= tot;

        pv.disUV[0] += (dis - pv.disUV[0])*0.75;

        if (!CURVATURE) {
          pv.dis = error;

          dv.mulScalar(1.0/tot);
          let totg = dv.dot(dv);

          if (totg === 0.0) {
            continue;
          }

          let mul = -error/totg;

          for (let j = 0; j < 3; j++) {
            v[j] += mul*dv[j]*0.1;
          }
        }

        v.flag |= MeshFlags.UPDATE;
      }
    }

    let tmp2 = new Vector3();
    let tmp3 = new Vector3();
    let tmp4 = new Vector3();

    for (let v of verts) {
      v.flag |= MeshFlags.UPDATE;

      let pv = v.customData[cd_pvert];
      let k = pv.disUV[0];

      let error = (pv.k2 + pv.k3)**2;
      let vec = tmp3;

      tmp2.load(pv.dk2).add(pv.dk3).mul(tmp2);

      vec.load(pv.d2k2).add(pv.d2k3).mulScalar((pv.k2 + pv.k3));
      vec.add(tmp2).mulScalar(2.0);

      error = vec.dot(vec); //pv.d2k3.dot(pv.d2k3);

      tmp4.load(pv.dk2).add(pv.dk3);
      tmp2.load(pv.d2k2).add(pv.d2k3).mul(tmp4).mulScalar(3.0);

      vec.load(pv.d3k2).add(pv.d3k3).mulScalar(pv.k2 + pv.k3);
      vec.add(tmp2).mulScalar(2.0);

      pv.disUV[0] = Math.abs(pv.k3)/20000.0;
      (pv.dk2.vectorLength() + pv.dk3.vectorLength())/20.0;//error*20.0;

      let t = new Vector3(pv.no);

      switch (kdrawmode) {
        case KDrawModes.TAN:
          t.load(pv.tan);
          break;
        case KDrawModes.NO:
          t.load(pv.no);
          break;
        case KDrawModes.BIN:
          t.load(pv.bin);
          break;
        case KDrawModes.DK1:
          t.load(pv.dk1);
          break;
        case KDrawModes.D2K1:
          t.load(pv.d2k1);
          break;
        case KDrawModes.D3K1:
          t.load(pv.d3k1);
          break;

        case KDrawModes.DK2:
          t.load(pv.dk2);
          break;
        case KDrawModes.D2K2:
          t.load(pv.d2k2);
          break;
        case KDrawModes.D3K2:
          t.load(pv.d3k2);
          break;

        case KDrawModes.DK3:
          t.load(pv.dk3);
          break;
        case KDrawModes.D2K3:
          t.load(pv.d2k3);
          break;
        case KDrawModes.D3K3:
          t.load(pv.d3k3);
          break;
      }
      vec.load(pv.d2k2).add(pv.d2k3);

      pv.smoothTan.load(t);
      pv.disUV[1] = t[0];
      pv.disUV[2] = t[1];
      pv.disUV[3] = t[2];

      if (vec.dot(vec) === 0.0) {
        continue;
      }

      error /= vec.dot(vec);

      let co = new Vector3(v);

      let fac = -0.005;
      if (0) {
        co.addFac(pv.d3k2, fac);//*pv.k2);///pv.k2);
        co.addFac(pv.d3k3, fac);//*pv.k3);///pv.k3);
      }

      if (isNaN(co.dot(co))) {
        console.warn("NaN!");
        co.load(v);
      }

      fac = pv.d2k1.vectorLength();//*0.5 + pv.dk3.vectorLength()*0.5;
      if (Math.abs(fac) > 1.0) {
        //fac = 1.0 / fac;
      }

      //co.addFac(v.no, fac);

      //v.addFac(pv.no, k*0.01);

      tmp2.load(pv.dk2).add(pv.dk3).mul(tmp2);

      vec.load(pv.d2k2).add(pv.d2k3).mulScalar((pv.k2 + pv.k3));
      vec.add(tmp2).mulScalar(2.0);

      pv.disUV[0] = pv.d2k2.dot(pv.d2k2) + pv.d2k3.dot(pv.d2k3);
      error = (pv.k2 + pv.k3)**2;

      if (window.kdrawmode === KDrawModes.ERROR) {
        pv.smoothTan.load(vec);
      }

      pv.disUV[0] = (pv.k2 + pv.k3)**2;

      if (0) {
        let totg = vec.dot(vec);
        if (totg > 0.0) {
          error /= totg;

          co.addFac(vec, -error*0.2);
        }
      } else if (1) {
        let fac = (pv.k1 + pv.k2 + pv.k3)**2;

        if (fac !== 0.0) {
          fac = 1.0 / fac;
        }

        fac *= -0.5;

        co.addFac(pv.dk1, fac);
        co.addFac(pv.dk2, fac);
        co.addFac(pv.dk3, fac);
      }

      cos.push(co);
      //v.addFac(pv.bin, -k*0.01);
    }

    let vi = 0;
    for (let v of verts) {
      v.load(cos[vi]);
      vi++;
    }

    //vertexSmooth(mesh, verts, 0.5);

    mesh.recalcNormals();
    mesh.regenRender();

    return {
      verts, edges, loops, faces
    };
  }

  if (mode === ParamizeModes.MAX_Z) {
    let min = new Vector3().addScalar(1e17);
    let max = new Vector3().addScalar(1e17);

    let vs = [];

    for (let v of verts) {
      min.min(v);
      max.max(v);

      vs.push(v);
    }

    let cent = max.sub(min);
    vs.sort((a, b) => {
      const eps = 0.00001;

      let dz = a[2] - b[2];
      if (dz > -eps && dz < eps) {
        return b[2] - a[2];
      }

      let da = (a[1] - cent[1])**2 + (a[0] - cent[0])**2;
      let db = (b[1] - cent[1])**2 + (b[0] - cent[0])**2;

      return da - db;
    });

    if (vs.length > 0) {
      startv = vs[0];
    }
  }

  for (let v of verts) {
    let pv = v.customData[cd_pvert];
    pv.updateWeights(ps, v, cd_pvert);
  }

  for (let v of verts) {
    v.customData[cd_pvert].disUV[0] = -1;
  }

  console.log(verts, edges, loops, faces);
  console.log(startv);

  startv.customData[cd_pvert].disUV[0] = 0.0;

  let queue = new Queue(1024*64);
  queue.enqueue(startv);

  let visit = new WeakSet();
  let _i = 0;

  visit.add(startv);

  while (queue.length > 0) {
    let v = queue.dequeue();
    let pv = v.customData[cd_pvert];

    for (let e of v.edges) {
      let vb = e.otherVertex(v);
      let pvb = vb.customData[cd_pvert];

      for (let l of e.loops) {
        let l2 = l;
        let _i = 0;

        do {
          if (_i++ > 100000) {
            console.warn("Infinite loop error");
            break;
          }

          let v2 = l2.v;
          let pv2 = v2.customData[cd_pvert];

          if (v2 === v) {
            l2 = l2.next;
            continue;
          }

          let dis = v2.vectorDistance(v);

          if (v2 !== vb && pvb.disUV[0] >= 0.0) {
            dis = geodesic_distance_triangle(v2, v, vb, pv.disUV[0], pvb.disUV[0]);
            dis -= pv.disUV[0];
          }

          if (visit.has(v2)) {
            let dis2 = pv.disUV[0] + dis;
            pv2.disUV[0] = Math.min(pv2.disUV[0], dis2);
            l2 = l2.next;
          } else {
            pv2.disUV[0] = pv.disUV[0] + dis;

            visit.add(v2);
            queue.enqueue(v2);
          }
        } while (l2 !== l);
      }
    }

    if (_i++ > 5000000) {
      console.warn("infinite loop error");
      break;
    }
  }

  return {
    verts, edges, loops, faces
  };
}

export function paramizeShell(mesh, cd_pvert, shell, mode) {
  let {verts, edges, faces} = calcGeoDist(mesh, cd_pvert, shell, mode);
}

export function smoothParam(mesh, verts = mesh.verts) {
  if (!mesh.verts.customData.hasLayer("paramvert")) {
    console.error("No parameterization customdata layer");
    return;
  }

  let cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");
  let ps = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  for (let v of verts) {
    let pv = v.customData[cd_pvert];
    pv.needsSmooth = true;
  }

  for (let v of verts) {
    let pv = v.customData[cd_pvert];

    pv.smooth(ps, v, cd_pvert);
  }

  for (let v of verts) {
    let pv = v.customData[cd_pvert];

    pv.disUV[1] = pv.smoothTan[0];
    pv.disUV[2] = pv.smoothTan[1];
    pv.disUV[3] = pv.smoothTan[2];
  }
}

export function paramizeMesh(mesh, cd_pvert, mode = ParamizeModes.SELECTED) {
  console.log("parameterize mesh");

  if (cd_pvert === undefined) {
    cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");
  }

  if (!mesh.verts.customData.hasLayer("paramvert")) {
    cd_pvert = mesh.verts.addCustomDataLayer("paramvert").index;
  }

  let ps = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  let visit = new WeakSet();
  let stack = [];
  let shells = [];

  for (let f of mesh.faces) {
    if (visit.has(f)) {
      continue;
    }

    let shell = [];
    shells.push(shell);

    stack.push(f);
    while (stack.length > 0) {
      f = stack.pop();
      visit.add(f);
      shell.push(f);

      for (let l of f.loops) {
        for (let l2 of l.e.loops) {
          if (!visit.has(l2.f)) {
            stack.push(l2.f);
            visit.add(l2.f);
          }
        }
      }
    }
  }

  console.log("shells", shells);

  for (let shell of shells) {
    paramizeShell(mesh, cd_pvert, shell, mode);
  }

  for (let v of mesh.verts) {
    //break; //XXX
    let pv = v.customData[cd_pvert];
    pv.updateTangent(ps, v, cd_pvert, true);

    pv.smoothTan[0] = pv.disUV[1];
    pv.smoothTan[1] = pv.disUV[2];
    pv.smoothTan[2] = pv.disUV[3];
  }

  for (let v of mesh.verts) {
    //break; //XXX
    let pv = v.customData[cd_pvert];
    pv.updateTangent(ps, v, cd_pvert);
  }
}