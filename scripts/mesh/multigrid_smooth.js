import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {CDFlags, CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';

/*

on factor;
off period;

load_package "avector";

comment: p1x := 0;
comment: p1y := 0;
comment: p1z := 0;

n1 := avec(n1x, n1y, n1z);

p1 := avec(p1x, p1y, p1z) + n1*nfac;
p2 := avec(p2x, p2y, p2z);
p3 := avec(p3x, p3y, p3z);

comment: l1 := VMOD (p3 - p1);
comment: l2 := VMOD (p2 - p1);
comment: l3 := VMOD (p3 - p2);

operator tlen;

comment: procedure tlen(x, y, z);
comment:   sqrt(x**2 + y**2 + z**2);

l1 := tlen(p2x-p1x-n1x, p2y-p1y-n1y, p2z-p1z-n1z);
l2 := tlen(p3x-p2x, p3y-p2y, p3z-p2z);
l3 := tlen(p1x+n1x*nfac-p3x, p1y+n1y*nfac-p3y, p1z+n1z*nfac-p3z);

s := (l1 + l2 + l3)/2.0;
triarea := (s*(s - l1)*(s - l2)*(s - l3)) - goal;

df(triarea, nfac);

dp1x := df(triarea, p1x);
dp1y := df(triarea, p1y);
dp1z := df(triarea, p1z);

dp2x := df(triarea, p2x);
dp2y := df(triarea, p2y);
dp2z := df(triarea, p2z);

dp3x := df(triarea, p3x);
dp3y := df(triarea, p3y);
dp3z := df(triarea, p3z);


*/
export class MultiGridSettings extends LayerSettingsBase {

}

MultiGridSettings.STRUCT = nstructjs.inherit(MultiGridSettings, LayerSettingsBase) + `
}`;
nstructjs.register(MultiGridSettings);

export const SmoothVertFlags = {
  SELECT: 1,
  SUPER : 2,
  QUEUED: 4,
  READY : 8
};

let sort_temps = util.cachering.fromConstructor(Vector3, 64);
let sort_list = [];
let idx_list = [];

export class MultiGridData extends CustomDataElem {
  constructor() {
    super();

    this.dco = new Vector3();
    this.oldco = new Vector3();
    this.co = new Vector3();

    this.dis = 0;
    this.geodis = 0;
    this.v = undefined;
    this.neighbors = [];
    this.weights = [];
    this.island = []; //for super verts, all verts surrounding the super vert
    this.flag = 0;
    this.area = 0;
  }

  calcMemSize() {
    let tot = 8*4*4 + 8*8;

    tot += this.neighbors.length*32;
    tot += this.weights.length*8;
    tot += this.island.length*32;

    return tot + 128;
  }

  sortNeighbors(owner) {
    let v1 = owner;

    let no = v1.no;

    let t1 = sort_temps.next();
    let t2 = sort_temps.next();

    let i = 0;
    for (let v2 of this.neighbors) {
      if (v2.vectorDistanceSqr(v1) === 0.0) {
        continue;
      }

      if (i === 0) {
        t1.load(v2).sub(v1);
      } else if (i === 1) {
        t2.load(v2).sub(v1);
      } else {
        break;
      }
      i++;
    }

    let d1 = t1.dot(no);
    //let d2 = t2.dot(no);

    //t2.addFac(no, -d2).normalize();

    t1.addFac(no, -d1).normalize();
    t2.load(t1).cross(no).normalize();
    let co = sort_temps.next();

    let ws = sort_list;
    ws.length = 0;

    let idx = idx_list;
    idx.length = 0;

    i = 0;
    for (let v2 of this.neighbors) {
      co.load(v2).sub(v1);

      let x = co.dot(t1);
      let y = co.dot(t2);
      let th = Math.atan2(y, x);

      ws.push(th);
      idx.push(i);
      i++;
    }

    idx.sort((a, b) => ws[a] - ws[b]);

    //console.log(ws.map(f => f.toFixed(2)));

    for (let i=0; i<idx.length; i++) {
      ws[i] = this.neighbors[idx[i]];
    }

    for (let i=0; i<idx.length; i++) {
      this.neighbors[i] = ws[i];
    }

    return this.neighbors;
  }

  copyTo(b) {
    b.dist = this.dist;
    b.v = this.v;
    b.oldco.load(this.oldco);
    b.geodis = this.geodis;
    b.neighbors = this.neighbors.concat([]);
    //do not copy flag
    //b.flag = this.flag;
  }

  static define() {
    return {
      typeName   : "multigrid_smooth",
      defaultName: "multigrid_smooth",
      uiName     : "multigrid_smooth"
    }
  }
}

MultiGridData.STRUCT = nstructjs.inherit(MultiGridData, CustomDataElem) + `
}`;
nstructjs.register(MultiGridData);
CustomDataElem.register(MultiGridData);

let name_idgen = 0;

export class Smoother {
  constructor(mesh) {
    this.verts = [];
    this.superVerts = [];
    this.vqueue = [];

    this.eidMap = new Map();

    this.limitFactor = window.lf ?? 2.0;

    this.adj = [];
    this.mesh = undefined;
    this.cd_smooth = -1;

    this.cd_name = "s" + (name_idgen++);

    this.dead = false;
    this.updateKey = "";

    if (mesh) {
      this.init(mesh);
    }
  }

  static calcUpdateKey(mesh) {
    let key = "" + mesh.lib_id + ":" + mesh.updateGen;
    key += ":" + mesh.verts.length + ":" + mesh.edges.length + ":" + mesh.faces.length;

    console.error("UPDATE KEY", key);

    return key;
  }

  static ensureSmoother(mesh, initAllVerts = true, limitFactor = undefined, forceCreate = false) {
    let bad = !mesh._smoother || forceCreate;

    if (limitFactor === undefined) {
      limitFactor = window.lf ?? 2.0;
    }

    if (!bad && mesh._smoother) {
      let ms = mesh._smoother;

      bad = bad || ms.dead;
      bad = bad || limitFactor !== ms.limitFactor;
      bad = bad || ms.updateKey !== this.calcUpdateKey(mesh);
    }

    if (bad) {
      if (mesh._smoother) {
        this.clearData(mesh);
      }

      let ms = mesh._smoother = new this(mesh);
      ms.limitFactor = limitFactor;

      if (initAllVerts) {
        for (let v of mesh.verts) {
          ms.addVert(v);
        }

        ms.update();
      }
    }

    return mesh._smoother;
  }

  init(mesh) {
    this.mesh = mesh;

    this.updateKey = this.constructor.calcUpdateKey(mesh);

    let cd_smooth = mesh.verts.customData.getNamedLayerIndex(this.cd_name, "multigrid_smooth");

    if (cd_smooth < 0) {
      let layer = mesh.verts.addCustomDataLayer("multigrid_smooth", this.cd_name);
      layer.flag |= CDFlags.TEMPORARY;
      cd_smooth = layer.index;
    }

    this.cd_smooth = cd_smooth;

    return this;
  }

  destroy() {
    if (this.mesh) {
      this.finish();
    }

    return this;
  }

  finish() {
    if (this.cd_smooth >= 0) {
      let cd_smooth = this.mesh.verts.customData.getNamedLayerIndex(this.cd_name, "multigrid_smooth");

      if (cd_smooth >= 0) {
        this.mesh.verts.removeCustomDataLayer(cd_smooth);
      }
    }

    this.mesh = undefined;
    this.cd_smooth = -1;

    return this;
  }

  ensureVert(v, eid = v.eid) {
    let cd_smooth = this.cd_smooth;
    let sv = v.customData[cd_smooth];

    if (!(sv.flag & SmoothVertFlags.QUEUED)) {
      this.addVert(v);
      return true;
    }

    return false;
  }

  addVert(v, eid = v.eid) {
    if (this.eidMap.has(eid)) {
      console.warn("vertex " + eid + " already exists");
      return;
    }

    let sv = v.customData[this.cd_smooth];
    sv.flag |= SmoothVertFlags.QUEUED;

    this.eidMap.set(eid, v);
    this.vqueue.push(v);
    this.verts.push(v);

    return this;
  }

  interp(superVerts = this.superVerts) {
    let cd_smooth = this.cd_smooth;

    for (let v of superVerts) {
      let sv = v.customData[cd_smooth];

      sv.dco.load(sv.co).sub(sv.oldco);
    }

    let tmp = new Vector3();

    //don't set verts to final projected position,
    //let smoother step do that, hopefully this
    //will help minimize error
    let fac = 0.75;

    for (let v of superVerts) {
      let sv = v.customData[cd_smooth];

      for (let v2 of sv.island) {
        let sv2 = v2.customData[cd_smooth];

        //v2.addFac(sv.dco);
        v2.flag |= MeshFlags.UPDATE;

        tmp.zero();
        tmp.addFac(sv.dco, sv2.weights[0]*fac);

        let i = 1;

        for (let v3 of sv2.neighbors) {
          let sv3 = v3.customData[cd_smooth];

          tmp.addFac(sv3.dco, sv2.weights[i]*fac);

          i++;
        }

        sv2.co.add(tmp);
      }
    }
  }

  update() {
    return this.calcSuperVerts();
  }

  calcSuperVerts() {
    let vs = new Set(this.vqueue);
    this.vqueue.length = 0;

    let limitFac = this.limitFactor;

    let visit = new WeakSet();
    let cd_smooth = this.cd_smooth;

    let elen = 0, elen_tot = 0;

    for (let v of vs) {
      let sv = v.customData[cd_smooth];

      for (let v2 of v.neighbors) {
        elen += v.vectorDistance(v2);
        elen_tot++;
      }

      sv.oldco.load(v);
      sv.co.load(v);
      sv.island.length = 0;

      sv.flag &= ~SmoothVertFlags.READY;
      sv.neighbors.length = 0;

      sv.dis = sv.geodis = 0;
      sv.v = undefined;
    }

    if (elen_tot > 0) {
      elen /= elen_tot;
    }

    const depthLimit = 128;

    let rec = (v, v1 = v, limit, geodis = 0, depth = 0) => {
      if (depth > depthLimit) {
        return;
      }

      let sv = v1.customData[cd_smooth];

      for (let v2 of v1.neighbors) {
        let sv2 = v2.customData[cd_smooth];

        if (sv2.flag & SmoothVertFlags.READY) {
          if (sv2.neighbors.indexOf(v) < 0) {
            sv2.neighbors.push(v);
          }

          continue;
        }

        let dis2 = v2.vectorDistance(v);
        let geodis2 = v2.vectorDistance(v1);

        if (dis2 > limit) {
          continue;
        }

        v.customData[cd_smooth].island.push(v2);

        sv2.oldco.load(v2);
        sv2.co.load(v2);
        sv2.dis = dis2;
        sv2.geodis = geodis + geodis2;
        sv2.v = v;
        sv2.flag |= SmoothVertFlags.READY;
        sv2.neighbors.push(v);

        rec(v, v2, limit, sv2.geodis, depth + 1);
      }
    }

    let superVerts = [];

    for (let v of vs) {
      let sv = v.customData[cd_smooth];

      if (sv.flag & SmoothVertFlags.READY) {
        continue;
      }

      let limit = 0, tot = 0.0;

      for (let v2 of v.neighbors) {
        limit += v.vectorDistance(v2);
        tot++;
      }

      if (tot === 0.0) {
        continue;
      }

      limit /= tot;
      limit *= limitFac;

      //XXX
      limit = elen*limitFac;

      sv.oldco.load(v);
      sv.v = v;
      sv.flag |= SmoothVertFlags.SUPER | SmoothVertFlags.READY;
      sv.dis = sv.geodis = 0;

      rec(v, v, limit);

      this.superVerts.push(v);

      superVerts.push(v);
    }

    for (let v of superVerts) {
      let sv = v.customData[cd_smooth];

      for (let v1 of sv.island) {
        for (let v2 of v1.neighbors) {
          let sv2 = v2.customData[cd_smooth];
          let v3 = sv2.v;

          if (!v3) {
            continue;
          }

          let sv3 = v3.customData[cd_smooth];

          if (v3 !== undefined && v3 !== v && sv.neighbors.indexOf(v3) < 0) {
            sv.neighbors.push(v3);
            sv3.neighbors.push(v);
          }
        }
      }
    }

    for (let v of superVerts) {
      let sv = v.customData[cd_smooth];

      let w = 0.0;

      for (let v2 of sv.island) {
        let max = v2.vectorDistance(v);
        let sv2 = v2.customData[cd_smooth];

        sv2.weights.length = 0;
        sv2.neighbors = sv.neighbors;

        for (let n of sv.neighbors) {
          let dis = n.vectorDistance(v2);

          max = Math.max(max, dis);
        }

        if (max === 0.0) {
          continue;
        }

        function weight(w) {
          w = 1.0 - w/max;

          //w = w*w*(3.0 - 2.0*w);
          //w = w**0.5;

          //return 1.0;
          return w;
        }

        let sum = weight(v2.vectorDistance(v));
        sv2.weights.push(sum);

        for (let n of sv.neighbors) {
          let dis2 = n.vectorDistance(v2);

          let w = weight(dis2);
          sv2.weights.push(w);

          sum += w;
        }

        //if (Math.random() > 0.99) {
        //console.log(sum, v2.vectorDistance(v), max, sv.neighbors);
        //}

        if (sum === 0.0) {
          //console.error("Eek!");
          continue;
        }

        for (let i = 0; i < sv2.weights.length; i++) {
          sv2.weights[i] /= sum;
        }
      }
    }

    return this;
  }

  getSuperVerts(verts) {
    let ret = new Set();
    let cd_smooth = this.cd_smooth;

    for (let v of verts) {
      let sv = v.customData[cd_smooth];

      if (sv.flag & SmoothVertFlags.SUPER) {
        ret.add(v);
      } else if (sv.v) {
        ret.add(sv.v);
      }
    }

    return ret;
  }

  smooth(superVerts = this.superVerts, fac = 1.0, projection, repeat = 4) {
    let cd_smooth = this.cd_smooth;
    let tmp = new Vector3();

    let totarea = 0.0;

    for (let v of superVerts) {
      v.flag |= MeshFlags.UPDATE;

      let sv = v.customData[cd_smooth];

      tmp.zero();
      let tot = 0.0;

      sv.sortNeighbors(v);

      for (let i=0; i<sv.neighbors.length; i++) {
        let v2 = sv.neighbors[i];
        let v3 = sv.neighbors[(i+1)%sv.neighbors.length];

        let sv2 = v2.customData[cd_smooth];
        let sv3 = v3.customData[cd_smooth];

        let area = math.tri_area(sv.co, sv2.co, sv3.co);
        totarea += area;

        if (projection > 0.0) {
          let t1 = _n1.load(sv2.co);

          t1.sub(sv.co);
          let d = t1.dot(v.no);

          t1.addFac(v.no, -d*projection).add(sv.co);
          tmp.add(t1);
        } else {
          tmp.add(sv2.co);
        }

        tot++;
      }

      if (tot !== 0.0) {
        tmp.mulScalar(1.0/tot);

        sv.co.interp(tmp, fac);
      }
    }

    let totarea2 = 0;

    for (let v of superVerts) {
      let sv = v.customData[cd_smooth];

      for (let i=0; i<sv.neighbors.length; i++) {
        let v2 = sv.neighbors[i];
        let v3 = sv.neighbors[(i+1)%sv.neighbors.length];

        let sv2 = v2.customData[cd_smooth];
        let sv3 = v3.customData[cd_smooth];

        let area = math.tri_area(sv.co, sv2.co, sv3.co);
        totarea2 += area;
      }
    }

    let ratio = totarea / totarea2;
    let orig = new Vector3();

    if (0) {
      for (let v of superVerts) {
        let sv = v.customData[cd_smooth];

        let nfac3 = 0;
        let tot = 0;

        orig.load(sv.co);

        //try to preserve surface area
        for (let i = 0; i < sv.neighbors.length; i++) {
          let v2 = sv.neighbors[i];
          let v3 = sv.neighbors[(i + 1)%sv.neighbors.length];

          let sv2 = v2.customData[cd_smooth];
          let sv3 = v3.customData[cd_smooth];

          let area = math.tri_area(sv.co, sv2.co, sv3.co);
          let goal = area*ratio;

          let nfac = (area - goal)*0.2;
          let df = 0.00001;

          //newton-raphson
          for (let step = 0; step < 5; step++) {
            sv.co.load(orig).addFac(v.no, nfac);
            let r1 = math.tri_area(sv.co, sv2.co, sv3.co) - goal;

            let nfac2 = nfac + df;
            sv.co.load(orig).addFac(v.no, nfac2);

            let r2 = math.tri_area(sv.co, sv2.co, sv3.co) - goal;

            r1 *= r1;
            r2 *= r2;

            let dnfac = (r2 - r1)/df;

            //console.log(dnfac, r1, nfac);

            let limit = step ? 0.0001 : 0.00001;

            if (Math.abs(dnfac) > limit) {
              nfac += -0.25*r1/dnfac;
            }
          }

          //console.log("nfac:", nfac);

          nfac *= 1.1;

          nfac3 += nfac;
          tot += 1;
        }

        if (tot === 0.0) {
          continue;
        }

        nfac3 /= tot;

        sv.co.load(orig).addFac(v.no, nfac3);
      }
    }

    //console.log("ratio:", ratio);

    let totarea3 = 0;

    for (let v of superVerts) {
      let sv = v.customData[cd_smooth];

      for (let i=0; i<sv.neighbors.length; i++) {
        let v2 = sv.neighbors[i];
        let v3 = sv.neighbors[(i+1)%sv.neighbors.length];

        let sv2 = v2.customData[cd_smooth];
        let sv3 = v3.customData[cd_smooth];

        let area = math.tri_area(sv.co, sv2.co, sv3.co);
        totarea3 += area;
      }
    }

    //console.log("totarea", totarea, totarea2, totarea3);

    this.interp(superVerts);

    let d1 = new Vector3();
    let d2 = new Vector3();
    let d3 = new Vector3();

    function vsmooth(v) {
      tmp.zero();
      let tot = 0.0;

      let sv = v.customData[cd_smooth];

      for (let v2 of v.neighbors) {
        let sv2 = v2.customData[cd_smooth];
        let w = 1.0;

        if (projection > 0.0) {
          let t1 = _n1;
          t1.load(v2).sub(v);
          let d = t1.dot(v.no);

          t1.addFac(v.no, -d*projection).add(v);

          tmp.addFac(t1, w);
        } else {
          tmp.addFac(sv2.co, w);
        }
        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      tmp.mulScalar(1.0/tot);
      sv.co.interp(tmp, fac);
    }

    for (let i = 0; i < repeat; i++) {
      for (let superv of superVerts) {
        let sv = superv.customData[cd_smooth];

        vsmooth(superv);

        for (let v of sv.island) {
          vsmooth(v);
        }
      }
    }
  }
}

var _n1 = new Vector3();
var _n2 = new Vector3();
var _n3 = new Vector3();
var _n4 = new Vector3();

export class MultiGridSmoother {
  constructor(mesh, levels = 2, limitFactor=1.5) {
    this.levels = [];
    this.verts = [];

    this.eidMap = new Map();

    let fac = 1.0;

    this.baseLimit = limitFactor;
    this.mesh = mesh;

    for (let i = 0; i < levels; i++) {
      let ms = new Smoother(mesh);

      ms.limitFactor *= fac;
      fac *= 2.0;

      this.levels.push(ms);
    }

    if (mesh) {
      this.updateKey = Smoother.calcUpdateKey(mesh);
    } else {
      this.updateKey = "";
    }

    this.levels.reverse();
  }

  init(mesh) {
    if (!this.mesh) {
      this.mesh = mesh;

      for (let ms of this.levels) {
        ms.init(mesh);
      }

      this.updateKey = Smoother.calcUpdateKey(mesh);
    }

    return this;
  }

  destroy() {
    for (let ms of this.levels) {
      ms.destroy();
    }

    return this;
  }

  addVert(v, eid=v.eid) {
    this.verts.push(v);

    for (let ms of this.levels) {
      ms.addVert(v, eid);
    }

    return this;
  }

  ensureVert(v, eid=v.eid) {
    let ret = false;

    if (!this.eidMap.has(eid)) {
      this.eidMap.set(eid, v);
      this.verts.push(v);
      ret = true;
    }

    for (let ms of this.levels) {
      ret = ret || ms.ensureVert(v, eid);
    }

    return ret;
  }

  update() {
    for (let ms of this.levels) {
      ms.update();
    }

    return this;
  }

  getSuperVerts(vs) {
    //defer this to later
    return new Set(vs);
  }

  smooth(verts=this.verts, weightFunc, fac = 1.0, projection=0.0, repeat = 4) {
    let sverts = [];

    for (let ms of this.levels) {
      let svs = new Set(ms.getSuperVerts(verts));

      sverts.push(svs);
      let cd_smooth = ms.cd_smooth;

      for (let v of svs) {
        let sv = v.customData[cd_smooth];

        sv.co.load(v);
        sv.oldco.load(v);

        for (let v2 of sv.island) {
          let sv2 = v2.customData[cd_smooth];

          sv2.co.load(v2);
          sv2.oldco.load(v2);
        }
      }
    }

    //weightFunc = undefined;

    let lastsvs;
    let last_cd_smooth;

    for (let i=0; i<this.levels.length; i++) {
      let ms = this.levels[i];
      let svs = sverts[i];

      let cd_smooth = ms.cd_smooth;

      if (i > 0) {
        let cd_smooth2 = this.levels[i-1].cd_smooth;

        for (let v of svs) {
          let sv = v.customData[cd_smooth];
          let svprev = v.customData[cd_smooth2];

          sv.co.load(svprev.co);
          sv.oldco.load(svprev.co);

          for (let v2 of sv.island) {
            let sv2 = v2.customData[cd_smooth];
            let sv2prev = v2.customData[cd_smooth2];

            sv2.co.load(sv2prev.co);
            sv2.oldco.load(sv2prev.co);
          }
        }
      }

      ms.smooth(svs, fac, projection, repeat) //, weightFunc, fac, repeat);
      lastsvs = svs;
      last_cd_smooth = cd_smooth;

      //break;
    }

    let svs = lastsvs; //sverts[this.levels.length-1];
    let cd_smooth = last_cd_smooth; //this.levels[this.levels.length-1].cd_smooth;

    for (let v of svs) {
      let sv = v.customData[cd_smooth];
      let w = weightFunc ? weightFunc(v) : 1.0;

      v.interp(sv.co, w);
      v.flag |= MeshFlags.UPDATE;

      for (let v2 of sv.island) {
        let sv2 = v2.customData[cd_smooth];

        let w = weightFunc ? weightFunc(v2) : 1.0;
        v2.interp(sv2.co, w);

        v2.flag |= MeshFlags.UPDATE;
      }
    }

    /*
    console.log(this);
    console.log("cd_smoothes:");
    for (let ms of this.levels) {
      console.log("  " + ms.cd_smooth);
    }

     */

    return this;
  }

  static clearData(mesh) {
    let lset = mesh.verts.customData.getLayerSet("multigrid_smooth");
    lset = new Set(lset);

    for (let layer of lset) {
      mesh.verts.removeCustomDataLayer(layer.index);
    }
  }

  finish() {
    for (let ms of this.levels) {
      ms.finish();
    }

    this.constructor.clearData(this.mesh);

    return this;
  }

  static ensureSmoother(mesh, initAllVerts = true,
                        limitFactor        = undefined,
                        forceCreate        = false,
                        levels = undefined) {
    let bad = !mesh._smoother;
    bad = bad || forceCreate;

    if (!bad) {
      let ms = mesh._smoother;

      if (limitFactor) {
        bad = bad || ms.baseLimit !== limitFactor;
      }

      bad = bad || ms.updateKey !== Smoother.calcUpdateKey(mesh);
    }

    if (bad) {
      console.log("making new mesh smoother");
      if (mesh._smoother) {
        mesh._smoother.destroy();
      }

      this.clearData(mesh);

      let ms = mesh._smoother = new MultiGridSmoother(mesh, levels, limitFactor);

      if (initAllVerts) {
        for (let v of mesh.verts) {
          ms.addVert(v);
        }
      }
    }

    return mesh._smoother;
  }
}