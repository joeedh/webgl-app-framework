import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshTypes, MeshFlags, LogContext, MeshError, getArrayTemp, ReusableIter} from './mesh_base.js';
import {CDFlags, CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {applyTriangulation} from './mesh_tess.js';
import {
  dissolveEdgeLoops,
  fixManifold, getEdgeLoop, trianglesToQuads, triangulateFan, triangulateMesh, vertexSmooth
} from './mesh_utils.js';
import {splitEdgesSmart2} from './mesh_subdivide.js';
import {getCurveVerts, smoothCurvatures} from './mesh_curvature.js';

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
        PROJ_FACTOR, SMOOTH_FACTOR, CSMOOTH_FAC, CSMOOTH_REPEAT, TOTPARAM
      } = RemeshParams;

export class Remesher {
  constructor(mesh, lctx = undefined, goalType, goalValue) {
    this.params = new Float64Array(TOTPARAM);
    for (let i = 0; i < this.params.length; i++) {
      this.params[i] = ParamData[i].value;
    }

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
      v.customData[cd_orig].value.load(v);
    }

    return cd_orig;
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

const EDGE_DIAG = MeshFlags.QUAD_EDGE; //MAKE_FACE_TEMP;

export class UniformTriRemesher extends Remesher {
  constructor(mesh, lctx = undefined, goalType, goalValue) {
    super(mesh, lctx, goalType, goalValue);

    this.flag = RemeshFlags.SUBDIVIDE | RemeshFlags.COLLAPSE | RemeshFlags.CLEANUP;

    this.lctx = lctx;
    this.subdFac = 0.5;
    this.collFac = 0.5;
    this.i = 0;
    this.elen = 1.0;

    this.timer = undefined;
    this.optData = undefined;

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
    let F = mesh.faces.length;

    let S = 1;
    let G = 0;

    let totquad = F*0.5;
    let tot = V + totquad - 2*(S - G);

    tot += F*0.5;

    return tot;
  }

  calcEdgeLen() {
    let mesh = this.mesh;

    let goal = this.goalValue;
    let elen = 0;
    let tot = 0;

    for (let e of mesh.edges) {
      let w = e.v1.vectorDistance(e.v2);
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

  start(max = this.mesh.edges.length>>1) {
    let mesh = this.mesh;

    this.initOrigData(mesh);

    this.triangulate();

    this.max = max;
    this.elen = this.calcEdgeLen();
  }

  rake(fac = this.rakeFactor) {
    let mesh = this.mesh, lctx = this.lctx;

    if (fac === 0.0) {
      return;
    }

    let cd_curv;

    let _rtmp = new Vector3();
    let _rdir = new Vector3();
    let _rtmp2 = new Vector3();

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

    let dorake = (v, fac = 0.5, sdis = 1.0) => {
      //return rake2(v, fac);

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
      //let d3 = _rtmp3;

      let cv = v.customData[cd_curv];
      cv.check(v);

      if (do_pvert) {
        let pv = v.customData[cd_pvert];

        pv.checkTangent(pvert_settings, v, cd_pvert);

        d1[0] = pv.smoothTan[0];
        d1[1] = pv.smoothTan[1];
        d1[2] = pv.smoothTan[2];

        d1.normalize();
      } else {
        d1.load(cv.tan).normalize();
      }

      let pad = 0.025;//5*(1.35 - fac);

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);

        //if (e.flag & skipflag) {
        //continue;
        //}

        d2.load(v2).sub(v);

        let nfac = -d2.dot(v.no)*0.85;

        d2.addFac(v.no, nfac);
        d2.normalize();

        let w;

        w = d1.dot(d2);
        w = Math.acos(w*0.99999)/Math.PI;
        let wfac = 1.0;

        //let limit = 0.07;
        let limit = 0.14;

        if (Math.abs(w - 0.25) < limit || Math.abs(w - 0.75) < limit) {
          e.flag |= EDGE_DIAG | MeshFlags.DRAW_DEBUG;
          //count diagonals less
          wfac = 0.25;
        } else {
          e.flag &= ~(EDGE_DIAG | MeshFlags.DRAW_DEBUG);
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

        co.addFac(v2, w);
        co.addFac(v.no, nfac*w);
        tot += w;
      }


      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0/tot);
      v.interp(co, fac);
    }

    cd_curv = getCurveVerts(mesh);
    cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");

    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];
      cv.update(v);

      dorake(v, fac);
    }

  }

  step(vErrFunc = undefined) {
    let mesh = this.mesh;
    let elen = this.elen;
    let max = this.max;

    this.i++;

    console.log(this.i, "quad edges", this.calcQuadEdges(mesh), mesh.edges.length);

    console.log("SC", this.smoothCurveFac, this.smoothCurveRepeat);

    for (let e of mesh.edges) {
      e.flag &= ~(EDGE_DIAG|MeshFlags.DRAW_DEBUG);
    }

    if (this.smoothCurveFac > 0.0) {
      let cd_curv = getCurveVerts(mesh);

      for (let v of mesh.verts) {
        let sv = v.customData[cd_curv];
        sv.check(v);
      }

      for (let i = 0; i < this.smoothCurveRepeat; i++) {
        smoothCurvatures(mesh, mesh.verts, this.smoothCurveFac);
      }
    }

    for (let i = 0; i < 3; i++) {
      this.rake();
    }

    let es, es2;

    let cd_orig = this.cd_orig;

    for (let v of mesh.verts) {
      let oco = v.customData[cd_orig].value;
      v.interp(oco, 0.2);
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

    function vsmooth(v) {
      let tot = 0.0;
      co.zero();

      for (let e of v.edges) {
        if (e.flag & EDGE_DIAG) {
          continue;
        }

        let v2 = e.otherVertex(v);

        n.load(v2).sub(v);
        let d = n.dot(v.no);
        n.addFac(v.no, -d*project).add(v);

        co.add(n);
        tot++;
      }

      if (tot > 0.0) {
        co.mulScalar(1.0/tot);

        v.interp(co, relax);
      }
    }

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
      if (1) {
        let l1 = e.v1.vectorDistance(e.v2);
        let elen2 = elen;

        if (e.flag & EDGE_DIAG) {
          elen2 = elen_sqrt2;
        }
        //mid.load(e.v1).interp(e.v2, 0.5);

        tan.load(e.v2).sub(e.v1);
        tan.normalize();
        tan.mulScalar((l1 - elen)*0.1*efac);

        if (isNaN(tan.dot(tan))) {
          console.error("NaN!", tan);
          break;
        }

        e.v1.addFac(tan, 1.0);
        e.v2.addFac(tan, -1.0);
      }

      //e.flag &= ~EDGE_DIAG;
      //e.flag &= ~DRAW_DEBUG;
    }

    //if (this.i%3 === 0) {
    mesh.regenTessellation();
    mesh.recalcNormals();
    //}
  }

  collapse(es, elen, max) {
    elen *= 1.0 - this.collFac;

    let mesh = this.mesh, lctx = this.ctx;

    let tot = 0;

    let op = e => {
      tot++;
      mesh.collapseEdge(e, lctx);
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

    if (!lctx) {
      lctx = new LogContext();
    }

    let postop = (es2) => {
      let oldnew = lctx.onnew;

      lctx.onnew = (e) => {
        if (e.type === MeshTypes.EDGE) {
          es2.add(e);
        }

        if (oldnew) {
          oldnew.call(lctx, e);
        }
      }

      if (split_es.size < this.minEdges) {
        this.done = true;
      }

      console.log("split_es", split_es.size);

      splitEdgesSmart2(mesh, split_es, undefined, lctx);

      lctx.onnew = oldnew;
    }

    let es2 = this.run(es, elen, max, -1.0, op, postop);

    return es2;
  }

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

    function edist1(e) {
      let dist = e.v1.vectorDistance(e.v2);

      //XXX
      if (sign < 0) {
        return dist;
      }
      //return dist;

      let d = (e.v1.valence + e.v2.valence)*0.5;
      d = 1.0 + Math.max(d - ep2, ep3)**ep1;

      if (sign < 0) {
        //d = 1.0 / d;
      }

      dist *= d;

      return dist;
    }

    function edist2(e) {
      if (sign < 0) {
        return e.v1.vectorDistance(e.v2);
      } else {
        return edist1(e);
      }
    }

    for (let e of es) {
      //let w = e.v1.vectorDistance(e.v2);
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

    for (let i = 0; i < 55; i++) {
      let stop = true;

      for (let v of mesh.verts) {
        if (v.valence === 0) {
          mesh.killVertex(v, undefined, lctx);
          stop = false;
        } else if (v.valence < 5) {
          let bad = false;

          for (let f of v.faces) {
            if (f.lists[0].length !== 3) {
              bad = true;
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
      mesh.collapseEdge(e, lctx);
    } else if (e.v1.valence > 6 && e.v2.valence > 6) {
      mesh.dissolveEdge(e, lctx);
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

      mesh.collapseEdge(e1, lctx);
      mesh.collapseEdge(e2, lctx);

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
          mesh.collapseEdge(l2.e, lctx);

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
            mesh.collapseEdge(l2.e, lctx);

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

  mesh.regenTessellation();

  for (let f of faces) {
    for (let l of f.loops) {
      vs.add(l.v);
      es.add(l.e);
    }
  }

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
          mesh.collapseEdge(l2.e, lctx);

          if (totv++ > maxVerts) {
            return;
          }
        }

        //return;
        //break;
      }
    }
  }

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
          mesh.collapseEdge(l2.e, lctx);

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

  for (let v of mesh.verts) {
    if (v.valence === 2) {
      mesh.joinTwoEdges(v, lctx);
    }
  }

  //find quads with two adjacent tris on two adjacent edges
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

  //collapse diagonal quads
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
      mesh.collapseEdge(newl.e, lctx);
    }
  }

  //collapse edges with two three valence verts
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
      mesh.collapseEdge(e, lctx);
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

    let v = mesh.collapseEdge(e, lctx);
    if (v) {
      mesh.dissolveVertex(v, lctx);
    }

    if (e1) {
      //v1 = mesh.collapseEdge(e1, lctx);
    }
    if (e2) {
      //v2 = mesh.collapseEdge(e2, lctx);
    }


    if (v2 && v2.valence === 2) {
      //mesh.joinTwoEdges(v2, lctx);
    }
  }

  //join quads with two adjacent triangles
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

    mesh.collapseEdge(e1, lctx);
    mesh.collapseEdge(e2, lctx);
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

    for (let v2 of v.neighbors) {
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
            mesh.collapseEdge(newl.e, lctx);
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
        mesh.collapseEdge(minl.e, lctx);
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

        for (let step = 0; step < 2; step++) {
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
                           rakeFactor                                   = 0.5, threshold = 0.5,
                           relax                                        = 0.25,
                           projection                                   = 0.8,
                           flag                                         = DefaultRemeshFlags,
                           maxEdges                                     = undefined,
                           rakeMode=RakeModes.CURVATURE) {
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
