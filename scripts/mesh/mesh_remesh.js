import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshTypes, MeshFlags, LogContext, MeshError, getArrayTemp, ReusableIter} from './mesh_base.js';
import {CDFlags, CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {applyTriangulation} from './mesh_tess.js';
import {
  dissolveEdgeLoops,
  fixManifold, getEdgeLoop, trianglesToQuads, triangulateFan, triangulateMesh, TriQuadFlags, vertexSmooth
} from './mesh_utils.js';
import {splitEdgesSmart2} from './mesh_subdivide.js';
import {getCurveVerts, smoothCurvatures} from './mesh_curvature.js';
import {Vertex} from './mesh_types.js';
import {BVHVertFlags, getDynVerts} from '../util/bvh.js';
import {getFaceSets} from './mesh_facesets.js';

const EDGE_SHARP_LIMIT = 0.35 //percentage of PI

export const Remeshers = {};

export const RemeshClasses = [];
export const RemeshMap = {};

let cls_idgen = 0;

const ParamData = {};

let _a = 0;

let paramdata = [];

function p(min, max, defval) {
  let k = _a++;

  let value = defval;

  if (paramdata.length > k) {
    value = paramdata[k];
  } else {
    paramdata.length = k + 1;
    paramdata[k] = value;
  }

  ParamData[k] = {
    min, max, value, defval
  };

  return k;
}

const PARAM_KEY = 'remesh_params';

if (PARAM_KEY in localStorage) {
  try {
    paramdata = JSON.parse(localStorage[PARAM_KEY]);
  } catch (error) {
    util.print_stack(error);
    console.warn("Failed to parse json");
    paramdata = [];
  }
}
window._paramdata = paramdata;

export let RakeModes = {
  CURVATURE : 0,
  PARAM_VERT: 1
};

export const RemeshParams = {
  EDIST_P1      : p(0.1, 10.0, 1.0),
  EDIST_P2      : p(5.5, 6.5, 6.0),
  EDIST_P3      : p(-0.5, 1.5, 0.0),
  SUBD_FAC      : p(0.0, 1.0, 0.35),
  COLL_FAC      : p(0.0, 1.0, 0.35),
  RAKE_FACTOR   : p(0.0, 1.0, 0.5),
  SMOOTH_FACTOR : p(0.0, 1.0, 0.25),
  PROJ_FACTOR   : p(0.0, 1.0, 0.75),
  CSMOOTH_FAC   : p(0.0, 1.0, 0.0),
  CSMOOTH_REPEAT: p(0.0, 50.0, 4.0),
  ORIG_FACTOR   : p(0.0, 1.0, 0.25),
  TOTPARAM      : p()
};

function loadParams(params) {
  for (let i = 0; i < params.length; i++) {
    ParamData[i].value = params[i];
    paramdata[i] = params[i];
  }
}

window._loadParams = function (params) {
  loadParams(params);
  localStorage[PARAM_KEY] = JSON.stringify(util.list(paramdata));
}

window._resetParams = function () {
  console.log(ParamData);

  for (let i = 0; i < TOTPARAM; i++) {
    let p = ParamData[i];

    p.value = p.defval;
    paramdata[i] = p.value;
  }

  localStorage[PARAM_KEY] = JSON.stringify(util.list(paramdata));
}

const {
        EDIST_P1, EDIST_P2, EDIST_P3, SUBD_FAC, COLL_FAC, RAKE_FACTOR,
        PROJ_FACTOR, SMOOTH_FACTOR, CSMOOTH_FAC, CSMOOTH_REPEAT,
        ORIG_FACTOR, TOTPARAM
      } = RemeshParams;

export class Remesher {
  constructor(mesh, lctx = undefined, goalType, goalValue) {
    this.params = new Float64Array(TOTPARAM);
    for (let i = 0; i < this.params.length; i++) {
      this.params[i] = ParamData[i].value;
    }

    this.reproject = false;
    this.projMesh = undefined;

    this.excludedParams = new Set([
      RAKE_FACTOR,
      PROJ_FACTOR,
      //SMOOTH_FACTOR,
      SUBD_FAC,
      COLL_FAC,
      TOTPARAM]);

    this.mesh = mesh;
    this.lctx = lctx;
    this.done = false;

    this.cd_orig = -1;

    this.optData = undefined;

    this.goalType = goalType;
    this.goalValue = goalValue;
  }

  get origFactor() {
    return this.params[ORIG_FACTOR];
  }

  set origFactor(val) {
    this.params[ORIG_FACTOR] = val;
  }

  get relax() {
    return this.params[SMOOTH_FACTOR];
  }

  set relax(v) {
    this.params[SMOOTH_FACTOR] = v;
  }

  get projection() {
    return this.params[PROJ_FACTOR];
  }

  set projection(v) {
    this.params[PROJ_FACTOR] = v;
  }

  static remeshDefine() {
    return {
      type: -1,
    }
  }

  static register(cls) {
    RemeshClasses.push(cls);

    let code = cls_idgen++;
    let def = cls.remeshDefine();

    Remeshers[def.typeName] = code;
    RemeshMap[code] = cls;
  }

  getOrigData(mesh) {
    let idx = mesh.verts.customData.getNamedLayerIndex("__orig_co", "vec3");
    if (idx < 0) {
      let layer = mesh.verts.addCustomDataLayer("vec3", "__orig_co");
      layer.flag |= CDFlags.TEMPORARY;

      idx = layer.index;
    }

    this.cd_orig = idx;
    return idx;
  }

  initOrigData(mesh) {
    let cd_orig = this.getOrigData(mesh);

    for (let v of mesh.verts) {
      v.customData[cd_orig].value.load(v.co);
    }

    return cd_orig;
  }

  start() {
    if (this.reproject) {
      this.projMesh = this.mesh.copy();
      this.projMesh.regenTessellation();
      this.projMesh.regenBVH();
    }
  }

  step() {

  }

  finish() {

  }
}

export const RemeshGoals = {
  FACE_COUNT  : 0,
  EDGE_LENGTH : 1,
  EDGE_AVERAGE: 2
};

export const RemeshFlags = {
  SUBDIVIDE: 1,
  COLLAPSE : 2,
  CLEANUP  : 4
};

const EDGE_DIAG = MeshFlags.QUAD_EDGE;

const DENSITY_CD_MUL = 1.75;
const BOUNDARY_SMOOTH_WEIGHT = 0.1;

//const EDGE_DIAG = MeshFlags.MAKE_FACE_TEMP;

export class UniformTriRemesher extends Remesher {
  minEdges = 5;

  constructor(mesh, lctx = undefined, goalType, goalValue) {
    super(mesh, lctx, goalType, goalValue);

    this.totshells = 0;

    this.flag = RemeshFlags.SUBDIVIDE | RemeshFlags.COLLAPSE | RemeshFlags.CLEANUP;

    this.liveEdges = new WeakSet();

    this.lctx = lctx;
    this.subdFac = 0.5;
    this.collFac = 0.5;
    this.i = 0;
    this.elen = 1.0;

    this.cd_density = -1;
    this.cd_temps = new Array(16);
    this.tempKey = '__remesher_temp';

    this.timer = undefined;
    this.optData = undefined;

    this.istep = 0;
    this.minEdges = 5; //have at least these number of edges to continue iteration
  }

  get smoothCurveRepeat() {
    return this.params[CSMOOTH_REPEAT];
  }

  set smoothCurveRepeat(f) {
    this.params[CSMOOTH_REPEAT] = f;
  }

  get smoothCurveFac() {
    return this.params[CSMOOTH_FAC];
  }

  set smoothCurveFac(f) {
    this.params[CSMOOTH_FAC] = f;
  }

  get subdFac() {
    return this.params[SUBD_FAC]
  }

  set subdFac(v) {
    this.params[SUBD_FAC] = v;
  }

  get collFac() {
    return this.params[COLL_FAC]
  }

  set collFac(v) {
    this.params[COLL_FAC] = v;
  }

  get rakeFactor() {
    return this.params[RAKE_FACTOR];
  }

  set rakeFactor(v) {
    this.params[RAKE_FACTOR] = v;
  }

  static remeshDefine() {
    return {
      typeName: "UNIFORM_TRI"
    }
  }

  calcQuadEdges(mesh) {
    //V + F - (L - F) - 2(S - G) = E;

    let V = mesh.verts.length;
    let E = mesh.edges.length;
    //let L = mesh.loops.length;
    let F = mesh.faces.length;

    let L = 0;
    for (let f of mesh.faces) {
      L += f.lists.length;
    }

    let S = this.totshells;
    let G = (E - 2.0*F + L + 2.0*S - V)/2.0;

    console.log("S", S, "G", G);

    let totquad = F*0.5;
    let totedge = V + totquad - 2*(S - G);

    totedge += totquad;

    return totedge;
  }

  calcEdgeLen() {
    let mesh = this.mesh;

    let goal = this.goalValue;
    let elen = 0;
    let tot = 0;

    for (let e of mesh.edges) {
      let w = e.v1.co.vectorDistance(e.v2.co);
      elen += w;
      tot++;
    }

    if (tot === 0.0) {
      return;
    }

    elen /= tot;

    if (this.goalType === RemeshGoals.EDGE_AVERAGE) {
      elen *= goal;
    }

    return elen;
  }

  _calcEdgeTh(e) {
    if (!e.l || e.l === e.l.radial_next) {
      return -1;
    }

    let l1 = e.l, l2 = e.l.radial_next;
    return Math.acos(l1.f.no.dot(l2.f.no)*0.999999)/Math.PI;
  }

  initEdgeAngles() {
    let mesh = this.mesh;
    let cd_etemp = this.cd_temps[MeshTypes.EDGE];
    let liveset = this.liveEdges;

    const vec = new Vector3();

    for (let e of mesh.edges) {
      let etemp = e.customData[cd_etemp].value;

      vec.load(e.v2.co).sub(e.v1.co).normalize();

      liveset.add(e);

      etemp[0] = this._calcEdgeTh(e);

      //*
      etemp[1] = vec[0];
      etemp[2] = vec[1];
      etemp[3] = vec[2];
      //*/
    }

    const cd_vtemp = this.cd_temps[MeshTypes.VERTEX];
    let vec2 = new Vector3();

    for (let v of mesh.verts) {
      let vtemp = v.customData[cd_vtemp].color;
      let th;

      vec.zero();
      let tot = 0.0;

      for (let e of v.edges) {
        let etemp = e.customData[cd_etemp].value;

        if (etemp[0] === -1) {
          continue;
        }

        let w = etemp[0];

        vec2[0] = etemp[1];
        vec2[1] = etemp[2];
        vec2[2] = etemp[3];

        if (vec2.dot(vec) < 0) {
          vec2.negate();
        }

        vec.addFac(vec2, w);

        if (th === undefined || etemp[0] > th) {
          th = etemp[0];
        }

        tot++;
      }

      if (th !== undefined) {
        vtemp[0] = th;

        vec.normalize();

        //*
        vtemp[1] = vec[0];
        vtemp[2] = vec[1];
        vtemp[3] = vec[2];
        //*/
      }
    }

    for (let step = 0; step < 2; step++) {
      for (let v of mesh.verts) {
        let vtemp = v.customData[cd_vtemp].color;

        let t1 = 0;
        let tot = 0;

        for (let v2 of v.neighbors) {
          let t2 = v2.customData[cd_vtemp].color[0];

          t1 += t2;
          tot++;
        }

        if (!tot) {
          continue;
        }

        t1 /= tot;
        vtemp[0] += (t1 - vtemp[0])*0.5;
      }
    }
  }

  countShells() {
    let visit = new WeakSet();
    let stack = [];
    let mesh = this.mesh;

    this.totshells = 0;

    for (let v of mesh.verts) {
      if (visit.has(v)) {
        continue;
      }

      this.totshells++;
      stack.push(v);

      while (stack.length > 0) {
        const v2 = stack.pop();

        for (let v3 of v2.neighbors) {
          if (!visit.has(v3)) {
            visit.add(v3);
            stack.push(v3);
          }
        }
      }
    }
  }

  start(max = this.mesh.edges.length>>1) {
    this.countShells();

    let mesh = this.mesh;

    for (let i = 0; i < 2; i++) {
      let type = i ? MeshTypes.EDGE : MeshTypes.VERTEX;
      let elist = mesh.elists[type];

      let cdtype = type === MeshTypes.EDGE ? "vec4" : "color";

      let cd_temp = elist.customData.getNamedLayerIndex(this.tempKey, cdtype);
      if (cd_temp < 0) {
        let layer = elist.addCustomDataLayer(cdtype, this.tempKey);
        //layer.flag |= CDFlags.TEMPORARY;
        if (type === MeshTypes.EDGE) {
          layer.flag |= CDFlags.NO_INTERP;
        }

        cd_temp = layer.index;
      }

      this.cd_temps[type] = cd_temp;

      for (let elem of elist) {
        elem.customData[cd_temp].getValue().zero();
        elem.customData[cd_temp].getValue()[3] = 1.0;

        elem.flag |= MeshFlags.UPDATE;
      }
    }

    this.cd_density = mesh.verts.customData.getNamedLayerIndex("__density_", "color");
    if (this.cd_density === -1) {
      this.cd_density = mesh.verts.addCustomDataLayer("color", "__density_").index;
    }

    const cd_density = this.cd_density;
    for (let v of mesh.verts) {
      let c = v.customData[cd_density].color;
      c[0] = 1.0 / DENSITY_CD_MUL;
      c[1] = c[2] = 1.0;
      c[3] = 1.0;
    }

    this.initEdgeAngles();

    this.initOrigData(mesh);
    this.triangulate();

    this.max = max;
    this.elen = this.calcEdgeLen();
    getCurveVerts(mesh);

    super.start();
  }

  project() {
    let mesh = this.mesh;
    this.projMesh.bvhSettings.leafLimit = 64;
    let bvh = this.projMesh.getLastBVH();

    console.log("Reproject!");

    let dummy = new Vertex();

    let elems = [0, 0, 0];
    let ws = [0, 0, 0];

    let vdata1 = mesh.verts.customData;
    let vdata2 = this.projMesh.verts.customData;

    vdata1.initElement(dummy);

    for (let v of mesh.verts) {
      let isect = bvh.closestPoint(v);

      if (!isect) {
        continue;
      }

      const v1 = isect.tri.v1;
      const v2 = isect.tri.v2;
      const v3 = isect.tri.v3;

      ws[0] = isect.uv[0];
      ws[1] = isect.uv[1];
      ws[2] = 1.0 - ws[0] - ws[1];

      for (let k in vdata1.layers) {
        let layerset1 = vdata1.layers[k];
        let layerset2 = vdata2.layers[k];

        if (!layerset2) {
          continue;
        }

        for (let i = 0; i < layerset1.length; i++) {
          if (i >= layerset2.length) {
            break;
          }

          let cd_off1 = layerset1[i].index;
          let cd_off2 = layerset2[i].index;

          elems[0] = v1.customData[cd_off2];
          elems[1] = v2.customData[cd_off2];
          elems[2] = v3.customData[cd_off2];

          v.customData[cd_off1].interp(v.customData[cd_off1], elems, ws);
        }
      }

      v.load(isect.p);
    }
  }

  propRakeDirections() {
    let mesh = this.mesh;

    //const cd_dyn_vert = getDynVerts(mesh);
    const cd_fset = getFaceSets(mesh);
    const cd_curv = getCurveVerts(mesh);
    const cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];
      cv.update(v, cd_cotan, cd_fset);
    }

    let verts = util.list(mesh.verts);
    verts.sort((a, b) => {
      return Math.random() - 0.5;
      let d1 = Math.abs(a[0])**2 + Math.abs(a[1])**2 - a[2];
      let d2 = Math.abs(b[0])**2 + Math.abs(b[1])**2 - b[2];

      return d1 - d2;
    });

    let visit = new WeakSet();
    let queue = new util.Queue(512);

    for (let v of verts) {
      if (visit.has(v)) {
        continue;
      }

      queue.clear(false);
      queue.enqueue(v);
      visit.add(v);

      while (queue.length > 0) {
        let v2 = queue.dequeue();
        let cv2 = v2.customData[cd_curv];

        for (let v3 of v2.neighbors) {
          let cv3 = v3.customData[cd_curv];

          cv2.transform(cv2.dir, cv3.dir, v2.no);

          if (!visit.has(v3)) {
            queue.enqueue(v3);
            visit.add(v3);
          }
        }
      }
    }

    this.updateRakeDirVis();

    /*
    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];
      cv.relaxUvCells(v, cd_curv);
    }*/
  }

  solveRakeDirections() {
    let mesh = this.mesh;

    let cd_col = mesh.verts.customData.getNamedLayerIndex("_rake_dir", "color");
    if (cd_col < 0) {
      cd_col = mesh.verts.addCustomDataLayer("color", "_rake_dir").index;
    }

    let cd_fset = getFaceSets(mesh, false);
    const cd_curv = getCurveVerts(mesh);

    const cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    let tan = new Vector3();

    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];

      cv.update(v, cd_cotan, cd_fset);
      tan.load(cv.tan).normalize();
    }

    this.updateRakeDirVis();
  }

  updateRakeDirVis() {
    let mesh = this.mesh;

    let cd_col = mesh.verts.customData.getNamedLayerIndex("_rake_dir", "color");
    if (cd_col < 0) {
      cd_col = mesh.verts.addCustomDataLayer("color", "_rake_dir").index;
    }

    let cd_fset = getFaceSets(mesh, false);
    const cd_curv = getCurveVerts(mesh);

    const cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    let tan = new Vector3();
    let tan2 = new Vector3();

    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];

      tan.load(cv.dir).normalize();

      let c = v.customData[cd_col].color;

      if (0) {
        let totth = 0.0;

        for (let v2 of v.neighbors) {
          let cv2 = v2.customData[cd_curv];

          tan2.load(cv2.dir);
          cv2.transform(tan, tan2, v.no);

          let th = Math.acos(tan2.dot(tan)*0.99999);
          totth += th;
        }

        c[0] = c[1] = c[2] = Math.abs(totth / Math.PI);
      } else {
        c[0] = tan[0]*0.5 + 0.5;
        c[1] = tan[1]*0.5 + 0.5;
        c[2] = tan[2]*0.5 + 0.5;
      }

      c[3] = 1.0;

      v.flag |= MeshFlags.UPDATE;
    }

    mesh.regenRender();
  }

  rake(fac = this.rakeFactor) {
    let mesh = this.mesh, lctx = this.lctx;

    this.istep++;
    const rot = (this.istep) & 1;

    if (fac === 0.0) {
      return;
    }

    let fac2 = fac**0.5;

    let cd_curv;

    let _rtmp = new Vector3();
    let _rdir = new Vector3();
    let _rtmp2 = new Vector3();
    let _rtmp3 = new Vector3();

    let cd_vtemp = this.cd_temps[MeshTypes.VERTEX];
    let cd_etemp = this.cd_temps[MeshTypes.EDGE];

    let cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");
    let pvert_settings;

    const do_pvert = cd_pvert >= 0 && this.rakeMode === RakeModes.PARAM_VERT;

    if (do_pvert) {
      pvert_settings = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();
      pvert_settings.updateGen++;
    }

    for (let v of mesh.verts) {
      v.flag &= ~MeshFlags.NOAPI_TEMP1;
    }

    const cd_cotan = mesh.verts.customData.getLayerIndex("cotan");
    const boundflag = BVHVertFlags.BOUNDARY_ALL;
    const cd_dyn_vert = getDynVerts(mesh);
    const cd_fset = getFaceSets(mesh);

    let cd_vis = mesh.verts.customData.getNamedLayerIndex("_rakevis", "color");
    if (cd_vis < 0) {
      cd_vis = mesh.verts.addCustomDataLayer("color", "_rakevis").index;
    }

    let dorake = (v, fac = 0.5, sdis = 1.0) => {
      //return rake2(v, fac);
      const mv = v.customData[cd_dyn_vert];
      mv.check(v, cd_fset);

      let bound = mv.flag & boundflag;

      if (bound) {
        fac *= BOUNDARY_SMOOTH_WEIGHT;
      }

      let val = v.valence;

      if (fac === 0.0 || val === 0.0) {
        return;
      }


      //attempt to tweak rake falloff
      /*
      fac *= 1.0 - (1.0 - sdis)*(1.0 - sdis);

      //approximate square root with newton-raphson
      let fac0 = fac;
      fac = (fac0/fac + fac)*0.5;
      //*/

      //fac = 1.0 - (1.0 - fac)*(1.0 - fac);

      let co = _rtmp.zero();
      let tot = 0.0;

      let d1 = _rdir;
      let d2 = _rtmp2;
      let d3 = _rtmp3;

      let cv = v.customData[cd_curv];
      //.check happens exclusively in step now
      //cv.check(v, cd_cotan);

      if (do_pvert) {
        let pv = v.customData[cd_pvert];

        pv.checkTangent(pvert_settings, v, cd_pvert);

        d1[0] = pv.smoothTan[0];
        d1[1] = pv.smoothTan[1];
        d1[2] = pv.smoothTan[2];

        d1.normalize();
      } else {
        cv.check(v, cd_cotan, undefined, cd_fset);
        d1.load(cv.dir);
        d1.normalize();
      }


      let visc = v.customData[cd_vis].color;
      let uv = cv.diruv;

      visc[0] = Math.fract(uv[0]);
      visc[1] = Math.fract(uv[1]);
      visc[2] = 0.0;
      visc[3] = 1.0;

      let vtemp = v.customData[cd_vtemp].color;

      d3[0] = vtemp[1];
      d3[1] = vtemp[2];
      d3[2] = vtemp[3];

      if (d3.dot(d1) < 0.0) {
        d3.negate();
      }

      d1.interp(d3, vtemp[0]).normalize();

      if (rot) {
        d1.cross(v.no).normalize();
      }

      let pad = 0.025;//5*(1.35 - fac);
      let hadsharp = false;

      let dcount = 0;

      for (let e of v.edges) {
        const v2 = e.otherVertex(v);
        const mv2 = v2.customData[cd_dyn_vert];

        mv2.check(v2, cd_fset);

        if (bound && !(mv2.flag & boundflag)) {
          continue;
        }

        //if (e.flag & skipflag) {
        //continue;
        //}

        d2.load(v2.co).sub(v.co);

        let nfac = -d2.dot(v.no)*0.85;

        d2.addFac(v.no, nfac);
        d2.normalize();

        let w;

        let etemp = e.customData[cd_etemp].value;

        if (etemp[0] > EDGE_SHARP_LIMIT) {
          w = etemp[1]*d2[0] + etemp[2]*d2[1] + etemp[3]*d2[2];
          hadsharp = true;
        } else {
          w = d1.dot(d2);
        }

        w = Math.acos(w*0.99999)/Math.PI;
        let wfac = 1.0;

        //let limit = 0.07;
        let limit = 0.115;

        if (0) {
          let diag = Math.abs(w - 0.33) < limit || Math.abs(w - 0.66) < limit;
          diag = diag && dcount < 5;

          if (diag) {
            e.flag |= EDGE_DIAG | MeshFlags.DRAW_DEBUG;
            //count diagonals less
            wfac = 0.25;
            dcount++;
          } else {
            e.flag &= ~(EDGE_DIAG | MeshFlags.DRAW_DEBUG);
          }
        }

        //w = Math.abs(w - 0.5);
        //w = w*w*(3.0 - 2.0*w);

        //*
        if (0) {
          w = 1.0 - Math.tent(Math.tent(w));
          w = w*w*(3.0 - 2.0*w);
        } else if (val !== 4) {
          w = 1.0 - Math.tent((w - 0.5)*2.0);
          //w = Math.abs(w-0.5)*2.0;
          w = w*w*(3.0 - 2.0*w);
        } else {
          w = Math.tent((w - 0.5));
          w = w*w*(3.0 - 2.0*w);
        }//*/

        //if (val > 4) {
        //w += 0.5;
        //w = Math.tent(w - 0.5);
        //}

        w = w*(1.0 - pad) + pad;
        w *= wfac;

        co.addFac(v2.co, w);
        co.addFac(v.no, nfac*w);

        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0/tot);

      if (hadsharp) {
        v.co.interp(co, fac2);
      } else {
        v.co.interp(co, fac);
      }
    }

    cd_curv = getCurveVerts(mesh);
    cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");

    for (let v of mesh.verts) {
      //cv updating happens in step now
      //let cv = v.customData[cd_curv];
      //cv.update(v, cd_cotan, cd_fset);

      dorake(v, fac);
    }

  }

  updateDiagFlags() {
    let mesh = this.mesh, lctx = this.lctx;

    for (let e of mesh.edges) {
      e.flag &= ~(MeshFlags.QUAD_EDGE | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2);
    }

    let lflag = TriQuadFlags.DEFAULT | TriQuadFlags.MARK_ONLY;
    lflag &= ~TriQuadFlags.MARKED_EDGES;

    trianglesToQuads(mesh, mesh.faces, lflag, lctx);

    for (let e of mesh.edges) {
      if (e.flag & MeshFlags.QUAD_EDGE) {
        e.flag |= MeshFlags.DRAW_DEBUG;
      }
    }
  }

  step(vErrFunc = undefined) {
    let mesh = this.mesh;
    let elen = this.elen;
    let max = this.max;

    let cd_dyn_vert = getDynVerts(mesh);
    let cd_fset = getFaceSets(mesh, true);

    this.i++;

    if (this.lastt === undefined) {
      this.lastt = util.time_ms();
    }
    if (util.time_ms() - this.lastt > 500) {
      console.log(this.i, "quad edges", this.calcQuadEdges(mesh), mesh.edges.length);
      this.lastt = util.time_ms();
    }

    //console.log("SC", this.smoothCurveFac, this.smoothCurveRepeat);

    let cd_etemp = this.cd_temps[MeshTypes.EDGE];
    let liveset = this.liveEdges;

    let vec = new Vector3();

    for (let v of mesh.verts) {
      v.flag &= ~MeshFlags.BOUNDARY;
    }

    //update boundary flags
    for (let e of mesh.edges) {
      e.flag &= ~(EDGE_DIAG | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2);

      let etemp = e.customData[cd_etemp].value;

      let update = !liveset.has(e);

      if (!e.l || e.l === e.l.radial_next) {
        etemp[0] = -1;
        e.flag |= MeshFlags.BOUNDARY;
        e.v1.flag |= MeshFlags.BOUNDARY;
        e.v2.flag |= MeshFlags.BOUNDARY;
      } else if (etemp[0] === -1) {
        update = true;
        e.flag &= ~MeshFlags.BOUNDARY;
      }

      if (update) {
        liveset.add(e);
        vec.load(e.v2.co).sub(e.v1.co).normalize();

        etemp[0] = this._calcEdgeTh(e);
        etemp[1] = vec[0];
        etemp[2] = vec[1];
        etemp[3] = vec[2];
      }

      if (etemp[0] > EDGE_SHARP_LIMIT) {
        e.flag |= MeshFlags.DRAW_DEBUG2;
      }
    }

    let cd_curv = getCurveVerts(mesh);
    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];
      cv.update(v, cd_cotan, cd_fset);
    }

    if (this.smoothCurveFac > 0.0) {
      for (let i = 0; i < this.smoothCurveRepeat; i++) {
        smoothCurvatures(mesh, mesh.verts, this.smoothCurveFac);
      }
    }

    //this.propRakeDirections();

    for (let i = 0; i < 3; i++) {
      this.rake();
    }

    let es, es2;

    const cd_orig = this.cd_orig;
    const cd_vtemp = this.cd_temps[MeshTypes.VERTEX];
    const ofac = this.origFactor;

    for (let v of mesh.verts) {
      let oco = v.customData[cd_orig].value;
      let fac = v.customData[cd_vtemp].color[0];

      if (v.flag & MeshFlags.BOUNDARY) {
        fac = 0.8;
      }

      fac = fac*0.8 + 0.2;
      v.co.interp(oco, fac*ofac);
    }


    if (this.flag & RemeshFlags.SUBDIVIDE) {
      es = util.list(mesh.edges);
      es2 = this.subdivide(es, elen, max);
    }

    if (this.flag & RemeshFlags.COLLAPSE) {
      es = util.list(mesh.edges);
      es2 = this.collapse(es, elen, max);
      this.cleanupWires();
    }

    if (this.flag & RemeshFlags.CLEANUP) {
      this.cleanup();
    }

    if (!vErrFunc) {
      this.triangulate();
    }

    let co = new Vector3();
    let n = new Vector3();

    let relax = this.relax;
    let project = this.projection;

    //console.log("RELAX", relax, "PROJECTION", project);

    const boundflag = BVHVertFlags.BOUNDARY_ALL;

    function vsmooth(v) {
      let relax2 = relax;

      let tot = 0.0;
      co.zero();

      //let bound = v.flag & MeshFlags.BOUNDARY;

      let mv = v.customData[cd_dyn_vert];
      mv.check(v, cd_fset);

      let bound = mv.flag & boundflag;

      if (bound) {
        relax2 *= BOUNDARY_SMOOTH_WEIGHT;
      }

      if (mv.flag & BVHVertFlags.CORNER_ALL) {
        return;
      }

      for (let e of v.edges) {
        let w = 1.0;

        if (e.flag & EDGE_DIAG) {
          w = 0.01;
          continue;
        }

        let v2 = e.otherVertex(v);
        let mv2 = v2.customData[cd_dyn_vert];
        mv2.check(v2, cd_fset);


        if (bound && !(mv2.flag & boundflag)) {
          continue;
        }

        n.load(v2.co).sub(v.co);
        let d = n.dot(v.no);
        n.addFac(v.no, -d*project).add(v.co);

        let etemp = e.customData[cd_etemp].value;
        w = 0.01 + etemp[0];

        co.addFac(n, w);
        tot += w;
      }

      if (tot > 0.0) {
        co.mulScalar(1.0/tot);

        v.co.interp(co, relax2);
      }
    }

    this.updateDiagFlags();
    this.updateDensities();

    for (let v of mesh.verts) {
      v.flag |= MeshFlags.UPDATE;

      if (vErrFunc) {
        vErrFunc(v);
      }

      vsmooth(v);
    }

    let DRAW_DEBUG = MeshFlags.DRAW_DEBUG;

    let tan = new Vector3();
    let mid = new Vector3();
    let elen_sqrt2 = elen*Math.sqrt(2.0);
    let efac = this.rakeFactor;

    for (let e of mesh.edges) {
      if (0) { //edge distance constraint
        let l1 = e.co.v1.vectorDistance(e.co.v2);
        let elen2 = elen;

        if (e.flag & EDGE_DIAG) {
          elen2 = elen_sqrt2;
        }
        //mid.load(e.v1).interp(e.v2, 0.5);

        tan.load(e.co.v2).sub(e.co.v1);
        tan.normalize();
        tan.mulScalar((l1 - elen)*0.1*efac);

        if (isNaN(tan.dot(tan))) {
          console.error("NaN!", tan);
          break;
        }

        e.v1.co.addFac(tan, 1.0);
        e.v2.co.addFac(tan, -1.0);
      }

      //e.flag &= ~EDGE_DIAG;
      //e.flag &= ~DRAW_DEBUG;
    }

    if (this.reproject) {
      this.project();
    }

    //if (this.i%3 === 0) {
    mesh.regenTessellation();
    mesh.recalcNormals();
    //}

    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];
      cv._ignoreUpdate(v, cd_cotan, cd_fset);
    }
  }

  updateDensities() {
    let mesh = this.mesh;

    //update densities
    const cd_density = this.cd_density;

    for (let v of mesh.verts) {
      let val = 0;

      for (let e of v.edges) {
        if (!(e.flag & EDGE_DIAG)) {
          val++;
        }
      }

      let eps = -0.075*5;
      let fac = val > 4 ? 1.0 - eps : 1.0 + eps; //1.0 + Math.abs(val - 5.5)*0.05;

      let den = v.customData[cd_density].color[0] * DENSITY_CD_MUL;

      if (val === 4) { //hit goal, degrade towards 1
        den += (1.0 - den)*0.3;
      } else if (fac !== 0.0) {
        den *= fac;
      }

      den = Math.min(Math.max(den, 0.25), 2.0);
      v.customData[cd_density].color[0] = den / DENSITY_CD_MUL;
    }

    if (1) {
      //smooth density field a bit
      for (let v of mesh.verts) {
        let totd = 16.0;
        let d = v.customData[cd_density].color[0]*totd;

        for (let v2 of v.neighbors) {
          d += v2.customData[cd_density].color[0];
          totd += 1.0;
        }

        v.customData[cd_density].color[0] = d/totd;
      }
    }
  }

  collapse(es, elen, max) {
    elen *= 1.0 - this.collFac;

    let mesh = this.mesh, lctx = this.ctx;
    const cd_dyn_vert = getDynVerts(mesh);

    let tot = 0;
    const bound = BVHVertFlags.BOUNDARY_ALL;

    const cd_fset = getFaceSets(mesh, false);

    let op = e => {
      let mv1 = e.v1.customData[cd_dyn_vert];
      let mv2 = e.v2.customData[cd_dyn_vert];

      mv1.check(e.v1, cd_fset);
      mv2.check(e.v2, cd_fset);

      let bad = !!(mv1.flag & bound) !== !!(mv2.flag & bound);

      bad = bad || (mv1.flag & BVHVertFlags.CORNER_ALL);
      bad = bad || (mv2.flag & BVHVertFlags.CORNER_ALL);

      if (bad) {
        return;
      }

      tot++;
      let v = mesh.collapseEdge(e, undefined, lctx);

      if (v) {
        let mv = v.customData[cd_dyn_vert];
        mv.flag |= BVHVertFlags.NEED_BOUNDARY|BVHVertFlags.NEED_VALENCE;
      }
    }

    if (tot >= this.minEdges) {
      this.done = false;
    }

    return this.run(es, elen, max, 1.0, op);
  }

  subdivide(es, elen, max) {
    elen *= 1.0 + 1.5*this.subdFac;

    let mesh = this.mesh, lctx = this.lctx;

    let split_es = new Set();

    let op = e => split_es.add(e);
    let cd_dyn_vert = getDynVerts(mesh);

    if (!lctx) {
      lctx = new LogContext();
    }

    let postop = (es2) => {
      let oldnew = lctx.onnew;

      lctx.onnew = (e) => {
        if (e.type === MeshTypes.EDGE) {
          es2.add(e);
        } else if (e.type === MeshTypes.VERTEX) {
          let mv = e.customData[cd_dyn_vert];
          mv.flag |= BVHVertFlags.NEED_ALL;
        }

        if (oldnew) {
          oldnew.call(lctx, e);
        }
      }

      if (split_es.size < this.minEdges) {
        this.done = true;
      }

      splitEdgesSmart2(mesh, split_es, undefined, lctx);

      lctx.onnew = oldnew;
    }

    let es2 = this.run(es, elen, max, -1.0, op, postop);

    return es2;
  }

  /*sign signals which op is being run; -1 is subdivision and 1 is edge collapse*/
  run(es, elen, max, sign, op, postop) {
    let lctx = this.lctx;
    let mesh = this.mesh;

    if (es.length === 0) {
      return new Set();
    }

    let ws = [];

    let i = 0;

    let ep1 = this.params[EDIST_P1];
    let ep2 = this.params[EDIST_P2];
    let ep3 = this.params[EDIST_P3];

    let cd_etemp = this.cd_temps[MeshTypes.EDGE];
    let cd_vtemp = this.cd_temps[MeshTypes.VERTEX];
    let cd_density = this.cd_density;

    function func(t) {
      t = Math.min(t*2.0, 2.0);
      return 1.0 + t*t*t*5.0;
    }

    function escale(e) {
      let d1 = e.v1.customData[cd_density].color[0] * DENSITY_CD_MUL;
      let d2 = e.v2.customData[cd_density].color[0] * DENSITY_CD_MUL;

      return (d1 + d2)*0.5;
/*
      if (sign > 0) {
        let t1 = func(e.customData[cd_etemp].value[0]);
        //let t2 = func(e.v1.customData[cd_vtemp].color[0]);
        //let t3 = func(e.v2.customData[cd_vtemp].color[0]);

        t1 = t1*0.25 + 1.0;

        //let t1 = (t2 + t3)*0.1 + 1.0;
        return 1.25/t1;
      } else {
        return 1.25;
      }
 */
    }

    function edist1(e) {
      let dist = e.v1.co.vectorDistance(e.v2.co);

      return escale(e)*dist;
    }

    const edist2 = edist1;

    for (let e of es) {
      let w = edist1(e);

      ws.push(w);
      e.index = i++;
    }

    //let heap = new util.MinHeapQueue(es, ws);

    es.sort((a, b) => (ws[a.index] - ws[b.index])*sign);

    let es2 = new Set(es);

    max = Math.min(max, es.length);

    for (let i = 0; i < max; i++) {
      let e = es[i];

      if (e.eid < 0) {
        continue; //edge was already deleted
      }

      let w = edist2(e); //sign < 0.0 ? edist2(e) : edist1(e);

      let bad = (w - elen)*sign >= 0;

      //bad = bad || (w - elen)*sign >= 0;

      if (bad) {
        continue;
      }

      op(e);
    }


    if (postop) {
      postop(es2);
    }

    if (!lctx) {
      lctx = new LogContext();
    }

    let oldnew = lctx.onnew;
    lctx.onnew = (e) => {
      if (oldnew) {
        oldnew.call(lctx, e);
      }

      if (e.type === MeshTypes.EDGE) {
        es2.add(e);
      }
    }

    lctx.onnew = oldnew;

    return es2;
  }

  triangulate() {
    let mesh = this.mesh, lctx = this.lctx;

    for (let f of mesh.faces) {
      if (f.lists.length === 0) {
        console.error("Mesh error!", f.eid, f);
        mesh.killFace(f);
        continue;
      }

      for (let list of f.lists) {
        list._recount();
      }

      if (f.lists.length === 1 && f.lists[0].length === 3) {
        continue;
      }

      applyTriangulation(mesh, f, undefined, undefined, lctx);
    }
  }

  endOptTimer() {
    if (this.timer !== undefined) {
      console.warn("Stopping timer");

      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  optimizeParams(ctx) {
    if (this.timer !== undefined) {
      console.warn("Stopping timer");

      window.clearInterval(this.timer);
      this.timer = undefined;

      return;
    }

    let mesh = ctx.mesh;

    this.optData = {
      startMesh: mesh.copy(),
      first    : true,
      totvert  : -1,
      totedge  : -1,
      totface  : -1,
      tottri   : -1,

      error    : 0,
      vErrorMap: new WeakMap()
    }

    console.warn("Starting timer");
    this.timer = window.setInterval(() => {
      this.optStep();
      window.redraw_viewport(true);
    }, 400);
  }

  optStep(flag = RemeshFlags.SUBDIVIDE | RemeshFlags.COLLAPSE) {
    this.flag = flag;

    let opt = this.optData;
    let mesh;

    opt.error = 0;
    opt.vErrorMap = new Map();
    let totv;

    function verror(v) {
      let f = v.valence;

      if (f < 5) {
        f = Math.abs(f - 6)*2.0;
      } else {
        f = Math.abs(f - 6);
      }

      return f;
    }

    function verrorAdd(v) {
      let err = opt.vErrorMap.get(v);

      //subtract old error
      if (err !== undefined) {
        opt.error -= err;
      }

      //calc and add new error
      err = verror(v);
      opt.vErrorMap.set(v, err);

      opt.error += err;

      return err;
    }

    let error = () => {
      mesh = opt.startMesh.copy();

      this.mesh = mesh;
      this.start(Math.max(mesh.edges.length>>3, 15));

      /*
      for (let v of mesh.verts) {
        verrorAdd(v);
      }
      let err1 = opt.error/mesh.verts.length;
      //*/

      this.step();

      opt.error = 0.0;
      for (let v of mesh.verts) {
        verrorAdd(v);
      }

      let err2 = opt.error/mesh.verts.length;

      return err2;// - err1;
    }


    if (opt.first) {
      opt.first = false;
      opt.lastError = error();
      opt.lastTotVerts = mesh.verts.length;
    }

    let err1 = opt.lastError; //error();
    totv = opt.lastTotVerts; //mesh.verts.length;

    //[1.206292087774441, 6.190841042433117, 0.3695605924341646, 0.5, 0.5, 0.5, 0.25, 0.75, null]
    //[1.9234782336477683, 6.296527722487285, 0.3278386780289788, 0.5, 0.5, 0.5, 0.25, 0.75, null]
    //[1.9234782336477683, 6.296527722487285,0.3278386780289788,0.5,0.5,0.5,0.25,0.75]
    //[1.3960240823509982, 5.961192145079035, 0.6228621760940662, 0.5, 0.5, 0.5, 0.1485268403024131, 0.75, null]

    let start = util.list(this.params);

    for (let i = 0; i < this.params.length; i++) {
      let ri = ~~(Math.random()*this.params.length*0.9999);
      if (this.excludedParams.has(ri)) {
        continue;
      }

      let range = ParamData[ri];
      let df = (range.max - range.min);

      let f = this.params[ri] + (Math.random() - 0.5)*df*0.25;
      f = Math.min(Math.max(f, range.min), range.max);

      //console.log(range);

      this.params[ri] = f;

      //break;
    }

    console.log(JSON.stringify(util.list(start)));


    let err2 = error();
    let totv2 = mesh.verts.length;

    //[0.1,6.154625519445539,0.13336385429183517,0.5,0.5,0.5,0.4397070395552094,0.75]

    //err1 -= Math.abs(totv2 - totv)*0.5;

    if (err2 >= err1) {
      for (let i = 0; i < this.params.length; i++) {
        this.params[i] = start[i];
      }
    } else {
      opt.lastError = err2;
      opt.lastTotVerts = mesh.verts.length;
      this._saveParams();
    }

    console.error(err1.toFixed(3), err2.toFixed(3));
    //console.log("err1", err1.toFixed(3), "err2", err2.toFixed3());
    //console.log("error2", opt.error, mesh.verts.length);
  }

  _saveParams() {
    for (let i = 0; i < this.params.length; i++) {
      paramdata[i] = this.params[i];
      ParamData[i].value = this.params[i];
    }

    //XXX
    //localStorage[PARAM_KEY] = JSON.stringify(util.list(paramdata));
  }

  cleanupWires() {
    let mesh = this.mesh, lctx = this.lctx;

    for (let f of mesh.faces) {
      if (f.lists.length === 0 || f.lists.length[0] < 3) {
        mesh.killFace(f, lctx);
      }
    }

    for (let e of mesh.edges) {
      if (!e.l) {
        mesh.killEdge(e, lctx);
      }
    }
  }

  cleanup() {
    let mesh = this.mesh;
    let lctx = this.lctx;

    let cd_vtemp = this.cd_temps[MeshTypes.VERTEX];
    let cd_etemp = this.cd_temps[MeshTypes.EDGE];

    if (0) { //this.i%2 === 0) {
      //cleanupQuads(mesh, mesh.faces, lctx);
      trianglesToQuads(mesh, mesh.faces, undefined, lctx);
      vertexSmooth(mesh);
      vertexSmooth(mesh);
      vertexSmooth(mesh);
      triangulateMesh(mesh, mesh.faces, lctx);
    }

    for (let i = 0; i < 55; i++) {
      let stop = true;

      for (let v of mesh.verts) {
        if (v.flag & MeshFlags.BOUNDARY) {
          continue;
        }

        if (v.valence === 0) {
          mesh.killVertex(v, undefined, lctx);
          stop = false;
        } else if (v.valence < 5) {
          let bad = false;

          for (let e of v.edges) {
            if (e.l) {
              let l = e.l;
              let _i = 0;

              let etemp = e.customData[cd_etemp].value;

              if (0 && etemp[0] > EDGE_SHARP_LIMIT) {
                e.flag |= MeshFlags.DRAW_DEBUG2;

                bad = true;
                break;
              }

              do {
                if (l.f.lists[0].length !== 3) {
                  bad = true;
                }

                if (_i++ > 100) {
                  console.warn("Infinite loop error");
                  break;
                }

                l = l.radial_next;
              } while (l !== e.l);
            }
          }

          if (!bad) {
            mesh.dissolveVertex(v, lctx);
            this.done = false;
            stop = false;
          }
        }
      }

      if (stop) {
        break;
      }
    }
  }

  finish() {

  }
}

Remesher.register(UniformTriRemesher);


let _lctx = new LogContext();

export function cleanupTris(mesh, faces, lctx) {
  let vs = new Set();
  let es = new Set();
  let fs = new Set(faces);

  if (!lctx) {
    lctx = _lctx;
  }

  let onnew = lctx.onnew;
  lctx.onnew = (e) => {
    if (onnew) {
      onnew(e);
    }

    if (e.type === MeshTypes.FACE) {
      fs.add(e);
    }
  }

  triangulateMesh(mesh, faces, lctx);
  lctx.onnew = onnew;
  fs = fs.filter(f => f.eid >= 0);

  faces = fs;

  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);
      es.add(l.e);
    }
  }

  for (let e of new Set(es)) {
    if (e.eid < 0 || !e.l) {
      continue;
    }

    let l1 = e.l, l2 = e.l.radial_next;

    if (l1 === l2 || !l1.f.isQuad() || !l2.f.isQuad()) {
      continue;
    }

    if (l1.v === l2.v) {
      //non-manifold edge
      continue;
    }

    let v1 = l1.prev.v;
    let v2 = l1.v;
    let v3 = l2.prev.v;
    let v4 = l1.next.v;

    if (v1.valence + v3.valence < v2.valence + v4.valence) {
      //mesh.dissolveEdge(
      let e2 = mesh.rotateEdge(e, lctx);
      if (e2) {
        es.add(e2);
      }
    }
  }

  for (let v of vs) {
    if (v.eid < 0) {
      continue;
    }

    if (v.valence === 3 || v.valence === 4) {
      mesh.dissolveVertex(v, lctx);
    }
  }

  for (let e of es) {
    if (e.eid < 0) {
      continue;
    }

    if (e.v1.valence < 5 || e.v2.valence < 5) {
      mesh.collapseEdge(e, undefined, lctx);
    } else if (e.v1.valence > 6 && e.v2.valence > 6) {
      mesh.dissolveEdge(e, undefined, lctx);
    }
  }

  vs = vs.filter(v => v.eid >= 0);

  vertexSmooth(mesh, vs, 0.5, 0.8);

  for (let v of vs) {
    v.flag |= MeshFlags.UPDATE;
  }
}

function cleanWireEdges(mesh, faces, lctx) {
  let vs = new Set();

  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);

      for (let e of l.v.edges) {
        let v2 = e.otherVertex(l.v);

        vs.add(v2);
      }
    }
  }

  return mesh.pruneWireGeometry(vs, lctx);
}

export function cleanupQuads2(mesh, faces, lctx) {
  let ret = false;

  //XXX
  faces = mesh.faces;

  if (cleanWireEdges(mesh, faces, lctx)) {
    faces = new Set(faces).filter(f => f.eid >= 0);
  }

  let newfaces = new Set();

  trianglesToQuads(mesh, faces, undefined, lctx, newfaces);

  for (let f of faces) {
    if (f.eid >= 0) {
      newfaces.add(f);
    }
  }
  faces = newfaces;

  let flag = MeshFlags.NOAPI_TEMP1;

  for (let e of mesh.edges) {
    e.flag |= flag;
  }

  for (let f of faces) {
    for (let l of f.loops) {
      l.e.flag &= ~flag;
    }
  }

  function step1() {
    let ret2 = false;

    let vs = new Set();
    let es = new Set();

    for (let f of faces) {
      for (let l of f.loops) {
        vs.add(l.v);
        es.add(l.e);
      }
    }

    let eloops = [];

    for (let e of es) {
      if (e.eid < 0 || !e.l) {
        continue;
      }
      if (e.flag & flag) {
        continue;
      }

      let ok = e.v1.valence === 4 && e.v2.valence === 4;
      ok = ok && e.l.f.isQuad();
      ok = ok && e.l.radial_next !== e.l && e.l.radial_next.f.isQuad();
      ok = ok && e.l.radial_next.radial_next === e.l;

      if (ok) {
        let eloop = getEdgeLoop(e);

        let bad = false;

        for (let e2 of eloop) {
          if (e2.flag & flag) {
            //bad = true;
            break;
          }
        }

        if (!bad) {
          for (let e2 of eloop) {
            e2.flag |= flag;
          }

          eloops.push(eloop);
          e.flag |= flag;

          ret2 = true;
          break;
        }
      }
    }

    for (let eloop of eloops) {
      eloop = eloop.filter((e) => {
        if (e.eid < 0) {
          return false;
        }

        if (e.faceCount !== 2) {
          return false;
        }

        return e.l.f.isQuad() && e.l.radial_next.f.isQuad();
      });

      eloop = new Set(eloop);

      if (eloop.size > 0) {
        dissolveEdgeLoops(mesh, eloop, false, lctx);
      }
    }

    //XXX
    faces = mesh.faces;
    //faces = faces.filter(f => f.eid >= 0);

    return ret2;
  }

  let vs = new Set();
  let es = new Set();

  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);
      es.add(l.e);
    }
  }

  function step2() {
    //return;
    let ret2 = false;

    let newfaces = new Set();
    trianglesToQuads(mesh, faces, undefined, lctx, newfaces);
    /*
    for (let f of newfaces) {
      faces.add(f);
    }
    faces = faces.filter(f => f.eid >= 0);
    */

    let co = new Vector3();

    for (let f of faces) {
      if (f.eid < 0) {
        continue;
      }

      if (!f.isTri()) {
        continue;
      }

      if (Math.random() > 0.1) {
        continue;
      }

      let l1 = f.lists[0].l;
      let e1 = l1.e;
      let e2 = l1.next.e;
      let e3 = l1.prev.e;

      let v1 = l1.v, v2 = l1.next.v, v3 = l1.prev.v;
      co.load(v1).add(v2).add(v3).mulScalar(1.0/3.0);

      mesh.collapseEdge(e1, undefined, lctx);
      mesh.collapseEdge(e2, undefined, lctx);

      if (v1.eid >= 0) {
        v1.load(co);
      } else if (v2.eid >= 0) {
        v2.load(co);
      } else if (v3.eid >= 0) {
        v3.load(co);
      }
    }

    vs = new Set();
    for (let f of faces) {
      if (f.eid < 0) {
        continue;
      }

      for (let list of f.lists) {
        list._recount();
      }

      for (let l of f.loops) {
        vs.add(l.v);
      }
    }

    for (let v of vs) {
      if (v.eid < 0) {
        continue;
      }

      if (v.valence === 2) {
        mesh.joinTwoEdges(v);
      }
    }

    for (let v of vs) {
      if (v.eid < 0) {
        continue;
      }

      if (v.valence !== 4) {
        v.index = 0;
        continue;
      }

      let ok = true;
      for (let f of v.faces) {
        ok = ok && f.isQuad();
      }

      if (ok) {
        v.index = 4;
      }
    }

    for (let v of vs) {
      if (v.eid < 0) {
        continue;
      }

      if (v.index === 4) {
        mesh.dissolveVertex(v);
        ret2 = true;
        // break;
      }
    }

    //XXX
    faces = mesh.faces;
    //faces = faces.filter(f => f.eid >= 0);
    return ret2;
  }

  let _i = 0;
  while (step1() && _i++ < 1000) {

  }

  mesh.recalcNormals();

  /*
  _i = 0;
  while (step2() && _i++ < 1000) {

  }*/

  return ret;
}

let _lctx_ring = util.cachering.fromConstructor(LogContext, 64);

//used by UniformQuadRemesher
function _cleanupQuads(mesh, faces = mesh.faces, lctx, maxVerts = 1e17) {
  if (!(faces instanceof Set)) {
    faces = new Set(faces);
  }

  let totv = 0;

  let es = new Set();
  let vs = new Set();

  let tris = [];
  for (let f of faces) {
    if (f.isTri()) {
      tris.push(f);
    }
  }

  for (let t of tris) {
    faces.delete(t);
  }

  mesh.regenTessellation();
  mesh.recalcNormals();

  trianglesToQuads(mesh, tris, undefined, lctx, faces);

  mesh.regenTessellation();

  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);
      es.add(l.e);
    }
  }

  for (let v of vs) {
    if (totv >= maxVerts) {
      break;
    }

    if (v.eid < 0) {
      continue;
    }

    if (v.valence !== 3) {
      continue;
    }

    let ok;

    for (let l of v.loops) {
      if (l.v !== v) {
        l = l.next;
      }

      ok = l.f.isQuad();
      ok = ok && l.next.next.v.valence === 3;

      if (ok) {
        let l2 = mesh.splitFace(l.f, l, l.next.next, lctx);

        for (let l of l2.f.loops) {
          mesh.setSelect(l.v, true);
          l.v.flag |= MeshFlags.UPDATE;
        }

        if (l2) {
          mesh.collapseEdge(l2.e, undefined, lctx);

          totv++;
        }

        //return;
        //break;
      }
    }
  }

  let es2 = new Set();

  for (let v of vs) {
    v.flag |= MeshFlags.UPDATE;

    if (v.eid < 0 || v.valence < 5) {
      continue;
    }

    if (v.valence === 6) {
      let tottri = 0;
      let totquad = 0;

      let bad = false;

      for (let f of v.faces) {
        if (f.isTri()) {
          for (let l of f.loops) {
            if (l !== l.radial_next && l.radial_next.f.isTri()) {
              bad = true;
            }
          }
          tottri++;
        } else {
          totquad++;
        }
      }

      if (!bad && tottri === 2) {
        for (let e of v.edges) {
          let ok = e.l && e.l.f.isQuad();
          if (e.l && e.l.radial_next !== e.l) {
            ok = ok && e.l.radial_next.f.isQuad();
          }

          if (ok) {
            es2.add(e);
            break;
          }
        }

        continue;
      }
    }

    //continue;
    let ok;

    if (es2.size > maxVerts || totv > maxVerts) {
      //break;
    }

    for (let l of v.loops) {
      if (!l.f.isTri()) {
        continue;
      }

      let subd = true;// Math.random() > 0.5;
      ok = false;

      for (let l2 of l.f.loops) {
        if (0 && subd) {
          ok = true;
          es2.add(l2.e);
          continue;
        }

        if (l2.v.valence === 4 && l2.next.v.valence === 4) {
          ok = true;

          if (0) { //Math.random() > 0.25) {
            let l3 = l2.prev;

            if (l3.f === l3.radial_next.f || l3.f.isTri() || (Math.random() > 0.5)) {
              l3 = l2.next;
            }
            if (l3.f === l3.radial_next.f) {
              continue;
            }

            let l4 = l3.radial_next;
            let l5;

            if (l4.v !== l3.v) {
              l5 = l4.prev.prev;
            } else {
              l5 = l4.next.next;
            }

            if (l5.f.isTri()) {
              ok = false;
              continue;
            }

            es2.add(l5.prev.e);

            if (0) {
              console.log(l5.f.eid, l5.f.eid);

              try {
                mesh.splitFace(l5.f, l4, l5, lctx);
              } catch (error) {
                console.log(error.stack);
                console.log(error.message);
              }
            }
          } else {
            mesh.collapseEdge(l2.e, undefined, lctx);

            if (totv++ > maxVerts) {
              //break;
            }
          }
          break;
        }
      }

      if (ok) {
        break;
      }
    }
  }

  es2 = es2.filter(e => e.eid >= 0);

  splitEdgesSmart2(mesh, es2, undefined, lctx);
}

export function cleanupQuads(mesh, faces = mesh.faces, lctx, maxVerts = 1e17) {
  if (!(faces instanceof Set)) {
    faces = new Set(faces);
  }

  let lctx2 = new LogContext();
  let userctx = lctx;

  lctx2.onnew = (e, tag) => {
    if (userctx) {
      userctx.onnew(e, tag);
    }

    if (e.type === MeshTypes.FACE) {
      faces.add(e);
    }
  }

  lctx2.onkill = (e, tag) => {
    if (userctx) {
      userctx.onkill(e, tag);
    }

    if (e.type === MeshTypes.FACE) {
      faces.delete(e);
    }
  }

  if (userctx) {
    lctx2.onkill = userctx.onkill;
    lctx2.onchange = userctx.onchange;
  }

  lctx = lctx2;

  let totv = 0;

  let es = new Set();
  let vs = new Set();

  let tris = [];
  for (let f of faces) {
    if (f.isTri()) {
      tris.push(f);
    }
  }

  for (let t of tris) {
    faces.delete(t);
  }

  mesh.regenTessellation();
  mesh.recalcNormals();

  trianglesToQuads(mesh, tris, undefined, lctx);

  mesh.updateBoundaryFlags();
  mesh.regenTessellation();

  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);
      es.add(l.e);
    }
  }

  let mask = window.dd !== undefined ? window.dd : (1 | 2 | 4 | 16 | 32);
  let stage = 0;
  //A

  if (mask & 1) {
    for (let v of vs) {
      if (v.eid < 0) {
        continue;
      }

      if (v.valence !== 3) {
        continue;
      }

      let ok;

      for (let l of v.loops) {
        if (l.v !== v) {
          l = l.next;
        }

        ok = l.f.isQuad();
        ok = ok && l.next.next.v.valence === 3;
        ok = ok && l !== l.next.next && l.next !== l.next.next && l.prev !== l.next.next;

        if (ok) {
          let l2 = mesh.splitFace(l.f, l, l.next.next, lctx);

          for (let l of l2.f.loops) {
            mesh.setSelect(l.v, true);
            l.v.flag |= MeshFlags.UPDATE;
          }

          if (l2) {
            mesh.collapseEdge(l2.e, undefined, lctx);

            if (totv++ > maxVerts) {
              return;
            }
          }

          //return;
          //break;
        }
      }
    }
  }

  if (mask & 2) {
    for (let v of vs) {
      v.flag |= MeshFlags.UPDATE;

      if (v.eid < 0 || v.valence < 5) {
        continue;
      }

      let ok;

      for (let l of v.loops) {
        if (!l.f.isTri()) {
          continue;
        }

        for (let l2 of l.f.loops) {
          if (l2.v.valence === 4 && l2.next.v.valence === 4) {
            ok = true;
            mesh.collapseEdge(l2.e, undefined, lctx);

            if (totv++ > maxVerts) {
              return;
            }
            break;
          }
        }

        if (ok) {
          break;
        }
      }
    }
  }

  for (let v of mesh.verts) {
    if (v.valence === 2) {
      mesh.joinTwoEdges(v, lctx);
    }
  }

  //find quads with two adjacent tris on two adjacent edges
  if (mask & 4) {
    for (let f of faces) {
      if (!f.isQuad()) {
        continue;
      }

      let ok = false;
      let l1, l2;
      let count = 0;

      for (let l of f.loops) {
        let ok2 = l.radial_next !== l && l.radial_next.f.isTri();

        count += ok2;

        ok2 = ok2 && l.next.radial_next !== l.next && l.next.radial_next.f.isTri();

        if (ok2) {
          l1 = l;
          l2 = l.next;
          //break;
        }
      }

      ok = l1 && l2;
      ok = ok && count === 2;

      if (!ok) {
        continue;
      }

      let la = l2;
      let lb = l2.next.next;

      let e1 = l1.e;
      let e2 = l2.e;

      if (mesh.splitFace(f, la, lb, lctx, true)) {
        mesh.dissolveEdge(e1, lctx);
        mesh.dissolveEdge(e2, lctx);
      }
    }
  }

  //collapse diagonal quads
  if (mask & 8) {
    for (let f of faces) {
      if (!f.isQuad()) {
        continue;
      }

      let l1, l2;

      for (let l of f.loops) {
        let ok = l.v.valence === 3;
        ok = ok && l.next.next.v.valence === 4;

        ok = ok && l !== l.next.next;
        ok = ok && l.next.next !== l.next;
        ok = ok && l.next.next !== l.prev;

        let ok2 = l.next.v.valence === 5 && l.prev.v.valence === 4;
        ok2 = ok2 || (l.next.v.valence === 4 && l.prev.v.valence === 5);

        ok = ok && ok2;

        if (!ok) {
          continue;
        }

        l1 = l;
        l2 = l.next.next;

        break;
      }

      if (!l1 || !l2) {
        continue;
      }

      let newl = mesh.splitFace(f, l1, l2, lctx);
      if (newl) {
        mesh.collapseEdge(newl.e, undefined, lctx);
      }
    }
  }

  //collapse edges with two three valence verts
  if (mask & 16) {
    for (let e of mesh.edges) {
      let ok = e.v1.valence === 3 && e.v2.valence === 3;

      if (!ok) {
        continue;
      }

      let ok2 = true;
      for (let i = 0; i < 2; i++) {
        let v = i ? e.v2 : e.v1;

        for (let l of v.loops) {
          if (!l.f.isQuad()) {
            ok2 = false;
          }
        }

        if (!ok2) {
          break;
        }
      }


      let count = 0;
      for (let l of e.loops) {
        count++;
      }

      //quad surrounded only by quads?
      ok2 = ok && count === 2;

      if (1 || !ok2) {
        mesh.collapseEdge(e, undefined, lctx);
        continue;
      }

      //case of quad surrounded by all quads

      let l1 = e.l, l2 = e.l.radial_next;
      l1 = l1.next.radial_next;
      l2 = l2.next.radial_next;

      if (l1 === l2) {
        console.error("EEK! non-manifold?");
        continue;
      }

      let e1 = mesh.splitFace(l1.f, l1, l1.next.next, lctx, true);
      let v1, v2;

      let e2 = mesh.splitFace(l2.f, l2, l2.next.next, lctx, true);

      e1 = e1 ? e1.e : undefined;
      e2 = e2 ? e2.e : undefined;

      let v = mesh.collapseEdge(e, undefined, lctx);
      if (v) {
        mesh.dissolveVertex(v, lctx);
      }

      if (e1) {
        //v1 = mesh.collapseEdge(e1, undefined, lctx);
      }
      if (e2) {
        //v2 = mesh.collapseEdge(e2, undefined, lctx);
      }


      if (v2 && v2.valence === 2) {
        //mesh.joinTwoEdges(v2, lctx);
      }
    }
  }

  //join quads with two adjacent triangles
  if (mask & 32) {
    for (let f of faces) {
      if (!f.isQuad()) {
        continue;
      }

      let startl;
      for (let l of f.loops) {
        let ok = l.radial_next.f.isTri();
        ok = ok && l.next.next.radial_next.f.isTri();
        ok = ok && l.next.radial_next.f.isQuad();
        ok = ok && l.prev.radial_next.f.isQuad();

        if (ok) {
          startl = l;
          break;
        }
      }

      if (!startl) {
        continue;
      }

      let e1 = startl.e;
      let e2 = startl.next.next.e;

      mesh.collapseEdge(e1, undefined, lctx);
      mesh.collapseEdge(e2, undefined, lctx);
    }
  }
  console.log("QUAD");
}

export function cleanupQuadsOld(mesh, faces, lctx) {

  if (0) {
    faces = mesh.faces;

    for (let v of mesh.verts) {
      let ok = v.valence === 4;

      for (let f of v.faces) {
        if (!f.isQuad()) {
          ok = false;
        }
      }

      if (v.valence === 2) {
        v.index = 2;
      } else if (ok) {
        v.index = 4;
      } else {
        v.index = 0;
      }

      for (let v of mesh.verts) {
        if (v.index === 4) {
          mesh.dissolveVertex(v, lctx);
        }
      }
    }

    for (let v of mesh.verts) {
      if (v.valence === 2) {
        mesh.joinTwoEdges(v, lctx);
      }
    }

    mesh.recalcNormals();

    for (let i = 0; i < 2; i++) {
      vertexSmooth(mesh, mesh.verts, 0.5, 0.5);
    }

    mesh.recalcNormals();

    triangulateMesh(mesh, mesh.faces, lctx);

    for (let i = 0; i < 6; i++) {
      vertexSmooth(mesh, mesh.verts, 0.5, 0.5);
    }

    trianglesToQuads(mesh, mesh.faces, undefined, lctx);
    mesh.recalcNormals();

    for (let i = 0; i < 6; i++) {
      vertexSmooth(mesh, mesh.verts, 0.5, 0.5);
    }

    mesh.recalcNormals();

    return;
  }

  if (0) {
    cleanupQuads2(mesh, faces, lctx);
    vertexSmooth(mesh, mesh.verts, 0.5, 0.5);

    let lctx2;

    //XXX
    if (1) {
      faces = mesh.faces;
      lctx2 = lctx;
    } else {
      faces = new Set(faces).filter(f => f.eid >= 0);

      function onnew(f) {
        if (f.type !== MeshTypes.FACE) {
          return;
        }

        faces.add(f);

        if (lctx) {
          lctx.newFace(f);
        }
      }

      lctx2 = _lctx_ring.next().reset();
      lctx2.onnew = onnew;
    }

    triangulateMesh(mesh, new Set(faces), lctx2);
    trianglesToQuads(mesh, faces, undefined, lctx2);
  }

  let ret = true;
  let vs = new Set();

  if (cleanWireEdges(mesh, faces, lctx)) {
    faces = new Set(faces).filter(f => f.eid >= 0);
  }

  for (let f of faces) {
    f.calcNormal();
  }

  let co = new Vector3();

  function vsmooth(v, fac = 0.5) {
    co.zero();
    let tot = 0;

    let bound = v.flag & MeshFlags.BOUNDARY;

    if (bound) {
      fac *= BOUNDARY_SMOOTH_WEIGHT;
    }

    for (let v2 of v.neighbors) {
      if (bound && !(v2.flag & MeshFlags.BOUNDARY)) {
        continue;
      }

      tot++;
      co.add(v2);
    }

    if (tot) {
      co.mulScalar(1.0/tot);
      v.interp(co, 0.5);
    }
  }


  if (!(faces instanceof Set)) {
    faces = new Set(faces);
  }

  /*
  if (0) {
    for (let f of faces) {
      if (!f.isTri()) {
        for (let l of f.loops) {
          vsmooth(l.v, 0.5);
        }

        f.calcNormal();

        applyTriangulation(mesh, f, faces, undefined, lctx);
      }
    }

    for (let f of faces) {
      if (f.eid >= 0) {
        for (let l of f.loops) {
          vsmooth(l.v);
        }
      }
    }

    trianglesToQuads(mesh, faces, undefined, lctx, faces);
  }//*/

  faces = faces.filter(f => f.eid >= 0);
  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);
    }
  }

  for (let v of vs) {
    v.index = v.valence;
  }

  for (let v of vs) {
    if (v.eid < 0) {
      continue;
    }

    let kill = (v.index === 3 && Math.random() < 0.1);
    //kill = kill || (v.index === 5 && Math.random() < 0.02);

    if (kill) {
      let f = mesh.dissolveVertex(v, lctx);
      if (f) {
        faces.add(f);
      }
      continue;
    }

    if (v.index < 3 || v.index > 5) {
      //if (Math.random() > 0.01) {
      //  continue;
      //}
      /*
      if ((v.valence === 3 || v.valence === 5) && Math.random() > 0.05) {
        continue;
      }//*/

      let bad = false;
      for (let e of v.edges) {
        for (let l of e.loops) {
          if (l.f.lists[0].length > 4) {
            bad = true;
            break;
          }
        }

        if (bad) {
          break;
        }
      }

      if (!bad) {
        let f = mesh.dissolveVertex(v, lctx);
        if (f) {
          faces.add(f);
          //applyTriangulation(mesh, f, faces, undefined, lctx);
        }
      }
    }
  }

  let es = new Set();
  for (let f of faces) {
    for (let l of f.loops) {
      es.add(l.e);
    }
  }

  for (let f of faces) {
    if (f.eid >= 0 && f.isNgon()) {
      for (let l of f.loops) {
        let v = l.v;
        vsmooth(v, 1.0);

        for (let v2 of v.neighbors) {
          vsmooth(v2, 0.5);
        }
      }

      f.calcNormal();

      applyTriangulation(mesh, f, faces, undefined, lctx);
      //triangulateFan(mesh, f, faces, lctx);
    }
    //if (f.lists.length > 0
  }

  for (let f of faces) {
    if (f.eid < 0 || f.lists.length !== 1) {
      continue;
    }

    let len = f.length;

    if (len === 4) {
      let stop = false;

      for (let l of f.loops) {
        let ok = (l.v.valence === 3 && l.next.next.v.valence === 3);
        ok = ok && (l.next.v.valence !== 3 && l.prev.valence !== 3);
        ok = ok && l.v !== l.next.next.v;

        if (ok) {
          let newl = mesh.splitFace(l.f, l, l.next.next, lctx);

          if (newl) {
            mesh.collapseEdge(newl.e, undefined, lctx);
          }

          ret = false;
          stop = true;
          break;
        }
      }

      if (stop) {
        continue;
      }

      for (let l of f.loops) {
        let ok = l.radial_next.f.isTri();
        ok = ok && l.next.radial_next.f.isTri();

        if (!ok) {
          continue;
        }

        stop = true;

        let e1 = l.e, e2 = l.next.e;
        let v = l.next.v;

        try {
          let newl = mesh.splitFace(f, l, l.next.next, lctx);
          let [ne, nv] = mesh.splitEdge(newl.e, 0.5, lctx);

          let newl2 = mesh.splitFaceAtVerts(l.f, v, nv, lctx);

          mesh.dissolveEdge(e1, lctx);
          mesh.dissolveEdge(e2, lctx);

          ret = false;
        } catch (error) {
          if (!(error instanceof MeshError)) {
            throw error;
          } else {
            util.print_stack(error);
          }
        }

        break;
      }

      if (stop) {
        continue;
      }
    } else if (len === 3 && 1) { //strategy one: collapse loops between tris
      let stop = false;

      let minl, mincount;

      for (let l of f.lists[0]) {
        if (!l.radial_next.f.isQuad()) {
          continue;
        }

        if (l.v.valence > 6 || l.next.v.valence > 6) {
          continue;
        }

        let l2 = l.radial_next;
        let _i = 0;

        do {
          if (!l2.f.isQuad()) {
            break;
          }

          l2 = l2.next.next;
          if (l2.radial_next === l2) {
            break;
          }

          if (l2.radial_next.v === l2.v) {
            //just flip bad windings as we go along
            mesh.reverseWinding(l2.radial_next.f);
          }

          l2 = l2.radial_next;

          if (_i++ > 1000000) {
            console.warn("infinite loop error");
            break;
          }
        } while (l2 !== l);

        if (l2.f.isQuad()) {
          //continue;
        }

        if (l.e.v1.valence > 4 || l.e.v2.valence > 4) {
          continue;
        }

        let count = _i;

        //console.log("count:", count);

        if (mincount === undefined || count < mincount) {
          mincount = count;
          minl = l;
        }
      }

      if (minl) {// && Math.random() > 0.1) {
        stop = true;
        mesh.collapseEdge(minl.e, undefined, lctx);
        ret = false;
      }

      if (stop) {
        continue;
      }
    } else if (len === 3 && 0) { //strategy two: expand edge loops between tris
      let minl, mincount, minl2;

      for (let l of f.loops) {
        if (!l.radial_next.f.isQuad()) {
          continue;
        }

        for (let step = 0; step < 1; step++) {
          let e;

          if (step) {
            if (l.prev.radial_next === l.prev) {
              continue;
            }

            let l2 = l.prev.radial_next;
            if (l2.v === l.prev.v) {
              e = l2.prev.e;
            } else {
              e = l2.next.e;
            }
          } else {
            if (l.radial_next === l) {
              continue;
            }

            let l2 = l.radial_next;
            if (l2.v === l.v) {
              e = l2.prev.e;
            } else {
              e = l2.next.e;
            }
          }
          let l2 = e.l;
          let _i = 0;

          if (l2.v !== l.v) {
            l2 = l2.prev.v === l.v ? l2.prev : l2.next;
          }

          do {
            if (_i++ > 1000000) {
              console.warn("infinite loop error");
              break;
            }

            let v2 = l2.e.otherVertex(l2.v);
            if (v2.valence !== 4 || !l2.f.isQuad()) {
              break;
            }

            l2 = l2.next;
            if (l2 === l2.radial_next) {
              break;
            }

            if (l2.radial_next.v === l2.v) {
              //just flip bad windings as we go along
              mesh.reverseWinding(l2.radial_next.f);
            }

            l2 = l2.radial_next.next;

          } while (l2.e !== e);

          let count = _i;
          //console.log("count", count);

          if (minl === undefined || count < mincount) {
            mincount = count;
            minl = e.l;
            minl2 = l;
          }
        }
      }

      console.log(mincount, minl);

      if (minl) {
        let l1 = minl2;
        let l2 = minl.v === minl2.v ? minl.prev : minl;

        if (l2.v !== l1.v) {
          l2 = l2.next.v === l1.v ? l2.next : l2.prev;
        }

        mesh.splitEdge(l2.e, 0.5, lctx);
        let l3 = l2.next.next.next;

        if (l2 !== l3 && l3 !== l2.prev && l3 !== l2.next) {
          mesh.splitFace(l2.f, l2, l3, lctx);
        } else {
          l3 = l2.next.next;
          if (l2 !== l3 && l3 !== l2.prev && l3 !== l2.next) {
            mesh.splitFace(l2.f, l2, l3, lctx);
          }
        }
      }
    }
  }

  return ret;
}


export class UniformQuadRemesher extends UniformTriRemesher {
  constructor() {
    super(...arguments);

    this.i = 0;
    this.triQuadFlag = undefined; //use trianglesToQuads defaults
  }

  static remeshDefine() {
    return {
      typeName: "UNIFORM_QUAD"
    }
  }

  start() {
    super.start(...arguments);
    this.i = 0;
  }


  step() {
    let doquad = this.i%18 === 0;

    if (this.i%2 === 0 && !doquad) {
      this.mesh.regenTessellation();
      this.mesh.recalcNormals();

      for (let v of this.mesh.verts) {
        v.flag |= MeshFlags.UPDATE;
      }
    }

    if (1 || !doquad) {
      let i = this.i;

      let steps = 1;

      if (!doquad) {
        //steps = 3;
      }

      triangulateMesh(this.mesh, this.mesh.faces, this.lctx);
      for (let j = 0; j < steps; j++) {
        super.step();
      }

      if (!doquad) {
        trianglesToQuads(this.mesh, this.mesh.faces, undefined, this.lctx);
      }

      this.i = i;
    }

    if (doquad) {
      _cleanupQuads(this.mesh, this.mesh.faces, this.lctx, Math.max(this.mesh.verts.length>>4, 4));
      this.elen = this.calcEdgeLen();

      for (let i = 0; i < 3; i++) {
        vertexSmooth(this.mesh, this.mesh.verts, 0.5, 0.0);
      }
    }

    this.mesh.regenRender();
    this.mesh.graphUpdate();

    this.i++;

    return;
    let lctx = this.lctx;
    let mesh = this.mesh;

    if (this.i === 0) {
      super.step();

      mesh.regenTessellation();
      mesh.recalcNormals();
    }

    this.done = false;

    trianglesToQuads(mesh, mesh.faces, this.triQuadFlag, lctx);
    this.done = cleanupQuads(mesh, mesh.faces, lctx);

    let co1 = new Vector3(), co2 = new Vector3();
    for (let v of mesh.verts) {
      co1.zero();
      let tot = 0;

      for (let v2 of v.neighbors) {
        co2.load(v2).sub(v);
        let d = co2.dot(v.no);

        co2.addFac(v.no, -d).add(v);

        co1.add(co2);
        tot++;
      }

      if (tot) {
        co1.mulScalar(1.0/tot);
        v.interp(co1, 0.5);
      }
    }
    console.log("Quad remeshing");


    if (this.i++ > 55) {
      this.done = true;
    }
  }

  finish() {
    super.finish();

    this.mesh.regenTessellation();
  }
}

Remesher.register(UniformQuadRemesher);

export let DefaultRemeshFlags = RemeshFlags.SUBDIVIDE | RemeshFlags.COLLAPSE | RemeshFlags.CLEANUP;

export function remeshMesh(mesh, remesher = Remeshers.UNIFORM_TRI, lctx = undefined, goalType, goalValue,
                           maxSteps                                     = 5,
                           rakeFactor                                   = 0.5, threshold                  = 0.5,
                           relax                                        = 0.25,
                           projection                                   = 0.8,
                           flag                                         = DefaultRemeshFlags,
                           maxEdges                                     = undefined,
                           rakeMode                                     = RakeModes.CURVATURE) {
  fixManifold(mesh, lctx);

  let cls = RemeshMap[remesher];

  let m = new cls(mesh, lctx, goalType, goalValue);

  m.rakeFactor = rakeFactor;
  m.collFac = m.subdFac = threshold;
  m.relax = relax;
  m.projection = projection;
  m.flag = flag;
  m.rakeMode = rakeMode;

  m.start(maxEdges);

  let i = 0;

  while (!m.done) {
    m.step();

    if (i++ > maxSteps) {
      break;
    }
  }

  m.finish();
}
