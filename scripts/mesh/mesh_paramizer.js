import {nstructjs, util, math} from '../path.ux/scripts/pathux.js';
import {CustomDataElem, LayerSettingsBase} from './customdata.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';

let Queue = util.Queue;
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {buildCotanVerts, getCotanData, VAREA, VCTAN1, VCTAN2, VW, VETOT} from './mesh_utils.js';

export const ParamizeModes = {
  SELECTED : 1,
  MAX_Z    : 2
};


let tmp1 = new Vector3();
let tmp2 = new Vector3();
let tmp3 = new Vector3();

let gtmps = util.cachering.fromConstructor(Vector3, 256);

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

  updateWeights(ps, owning_v, cd_pvert, cd_disp=undefined) {
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

    totw = totw ? 1.0 / totw : 0.0;

    for (let i=0; i<wi; i++) {
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
  updateTangent(ps, owning_v, cd_pvert, noSmooth = false, cd_disp=undefined, noNorm=false) {
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

export function paramizeMesh(mesh, cd_pvert, mode=ParamizeModes.SELECTED) {
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
    let pv = v.customData[cd_pvert];
    pv.updateTangent(ps, v, cd_pvert, true);

    pv.smoothTan[0] = pv.disUV[1];
    pv.smoothTan[1] = pv.disUV[2];
    pv.smoothTan[2] = pv.disUV[3];
  }

  for (let v of mesh.verts) {
    let pv = v.customData[cd_pvert];
    pv.updateTangent(ps, v, cd_pvert);
  }
}