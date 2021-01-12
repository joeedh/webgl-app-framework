import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import '../util/numeric.js';
import {applyTriangulation, triangulateFace} from './mesh_tess.js';

export function splitEdgesSimple(mesh, es, testfunc, lctx) {
  let newvs = new Set();
  let newfs = new Set();
  let killfs = new Set();
  let newes = new Set();

  //return {newvs, newfs, killfs, newes};

  for (let e of es) {
    for (let f of e.faces) {
      if (f.lists[0].length > 3 || f.lists.length > 1) {
        //killfs.add(f);
      }
    }
  }

  let fs = [];

  for (let e of es) {
    if (testfunc && !testfunc(e)) {
      continue;
    }

    //if (e.v1.edges.length + e.v2.edges.length < 18) {
      fs.length = 0;
      for (let f of e.faces) {
        if (f.lists.length > 1 || f.lists[0].length > 3) {
          fs.push(f);
        }
      }

      for (let f of fs) {
        killfs.add(f);
        newfs.delete(f);
        applyTriangulation(mesh, f, newfs, newes, lctx);
      }

      let [ne, nv] = mesh.splitEdge(e, 0.5, lctx);

      newes.add(ne);
      newvs.add(nv);
    //}
  }

/*
  let ltris = [];
  for (let f of killfs) {
    f.calcNormal();
    triangulateFace(f, ltris);
  }

  for (let i=0; i<ltris.length; i += 3) {
    let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];

    let e1 = mesh.getEdge(l1.v, l2.v);
    let e2 = mesh.getEdge(l2.v, l3.v);
    let e3 = mesh.getEdge(l3.v, l1.v);

    let tri = mesh.makeTri(l1.v, l2.v, l3.v);
    let l = tri.lists[0].l;

    tri.calcNormal();
    tri.flag |= MeshFlags.UPDATE;

    mesh.copyElemData(tri, l1.f);
    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.prev, l3);

    newfs.add(tri);

    if (!e1) {
      newes.add(l.e);
    }

    if (!e2) {
      newes.add(l.next.e);
    }

    if (!e3) {
      newes.add(l.prev.e);
    }
  }*/

  for (let f of killfs) {
    if (f.eid >= 0) {
      mesh.killFace(f, lctx);
    }
  }

  return {newvs, newfs, killfs, newes};
}

export function splitEdgesSmart(mesh, es) {
  let vs = new Set();

  for (let e of es) {
    vs.add(e.v1);
    vs.add(e.v2);
  }

  let newvs = new Set();
  let killfs = new Set();
  let fs = new Set();

  for (let e of es) {
    if (e.l === undefined) {
      continue;
    }

    for (let l of e.loops) {
      fs.add(l.f);
    }

    let nev = mesh.splitEdge(e, 0.5);

    newvs.add(nev[1]);
  }

  let patterns = [
    [[1, 0, 0, 0], [2, -1, -1, -1]], //triangle with one split edge
    [[1, 0, 0, 0, 0], [2, -1, -1, -1, -1]], //quad with one split edge
    [[1, 0, 1, 0, 0, 0], [2, -1, -1, 5, -1, -1]], //quad with two edges
    [[1, 0, 0, 1, 0, 0], [3, -1, -1, -1, -1, -1]],
    //[4, -1, -1, -1, -2, -1],
  ]

  let ptable = new Array(1024);
  let temps = new Array(1024);

  //mirror patterns
  for (let pat of patterns.concat([])) {
    let pat2 = [new Array(pat[0].length), new Array(pat[1].length)];

    for (let i = 0; i < pat2[1].length; i++) {
      pat2[1][i] = -1;
    }

    for (let i = 0; i < pat2[0].length; i++) {
      let i2 = (i + pat2[0].length - 1) % pat2[0].length;
      i2 = pat2[0].length - 1 - i2;

      pat2[0][i] = pat[0][i2];
      let t = pat[1][i2];

      if (t >= 0) {
        t = (t + pat2[0].length - 1) % pat2[0].length;
        t = pat2[0].length - 1 - t;

        pat2[1][i] = t;
      } else {
        pat2[1][i] = -1;
      }

    }

    //console.log(pat, pat2);
    patterns.push(pat2);
  }

  let pat = [[1, 0, 1, 0, 1, 0], [2, -1, 4, -1, 0, -1]]; //tri with three edges
  patterns.push(pat);

  for (let pat of patterns) {
    let mask = 0;

    let pmask = pat[0];
    pat = pat[1];

    for (let i = 0; i < pat.length; i++) {
      if (pmask[i]) {
        mask |= 1 << i;
      }
    }

    mask |= pat.length << 8;
    ptable[mask] = pat;
    temps[mask] = new Array(pat.length);
  }

  let newfs = new Set();

  for (let f of fs) {
    let l1;

    let tot = 0;
    for (let l of f.lists[0]) {
      tot++;
    }

    for (let l of f.lists[0]) {
      if (newvs.has(l.v)) {
        l1 = l;
        break;
      }
    }

    if (!l1) {
      continue;
    }

    let l = l1;
    let mi = 0;
    let mask = tot << 8;

    do {
      if (newvs.has(l.v)) {
        mask |= 1 << mi;
      }

      mi++;
      l = l.next;
    } while (l !== l1);

    if (mask === (1|4|16|64) + (8<<8)) {
      //console.log("quad!");

      let a = l1.prev.prev;
      let b = l1.next.next;

      let l2 = mesh.splitFace(f, l1, l1.next.next.next.next);
      newfs.add(l2.f);

      let olde = l2.e;
      let nev = mesh.splitEdge(l2.e, 0.5);

      let [newe, newv] = nev;
      newvs.add(newv);

      mesh.connectVerts(a.v, newv);
      mesh.connectVerts(b.v, newv);
      //l2 = mesh.splitFaceAtVerts(l2.f, a.v, newv);

      continue;


      for (let step=0; step<2; step++) {
        let e2 = step ? newe : olde;

        let l3 = e2.l;
        let _i = 0;

        do {
          let l4 = l3;

          if (l4.next.v === newv) {
            l4 = l4.next;
          } else if (l4.prev.v === newv) {
            l4 = l4.prev;
          }

          //console.log("splitting", l4);

          newfs.add(mesh.splitFace(l4.f, l4, l4.next.next.next).f);

          if (_i++ > 1000) {
            console.warn("infinite loop error");
            break;
          }
          l3 = l3.radial_next;
        } while (l3 !== e2.l);

        break;
      }

      //mesh.splitFace(l3.f, l3, l3.next.next.next);

      continue;
    } else if (mask === (1|4|16) + (6<<8)) {
      let l3 = l1.next.next;
      let l4 = l1.prev;

      newfs.add(mesh.splitFace(l1.f, l1, l1.next.next).f);
      newfs.add(mesh.splitFace(l3.f, l3, l3.next.next).f);

      newfs.add(mesh.splitFace(l4.f, l4.prev, l4.next).f);

      continue;
    }

    let pat = ptable[mask];
    if (!pat) {
      continue;
      //console.log("no pattern", mask);
      let ls = [];
      for (let l of f.lists[0]) {
        ls.push(l);
      }

      for (let i=1; i<ls.length-1; i++) {
        let l1 = ls[0], l2 = ls[i], l3 = ls[i+1];

        let f2 = mesh.makeFace([l1.v, l2.v, l3.v]);
        let l = f2.lists[0].l;

        mesh.copyElemData(l, l1);
        mesh.copyElemData(l.next, l2);
        mesh.copyElemData(l.prev, l3);
        mesh.copyElemData(f2, l1.f);

        newfs.add(f2);
      }

      killfs.add(f);
      mesh.killFace(f);
      continue;
    }

    let temp = temps[mask];
    l = l1;
    mi = 0;
    do {
      temp[mi++] = l;
      l = l.next;
    } while (l !== l1);

    let l2 = l1.next.next;
    if (l2 === l1 || l2.next === l1 || l2.prev === l1) {
      continue;
    }

    let f2 = f;

    for (let i = 0; i < pat.length; i++) {
      let idx = pat[i];

      if (idx < 0) {
        continue;
      }

      let l1 = temp[i];
      let l2 = temp[idx];

      f2 = l1.f;

      if (l1.f === l2.f && l1.f === f2) {
        //console.log("splitting face", l1, l2);
        newfs.add(mesh.splitFace(f2, l1, l2).f);
      } else {
        //console.log("pattern error", pat, idx);
      }
    }

    //break;
  }

  return {
    newvs : newvs,
    newfs : newfs,
    killfs : killfs
  }
}

import {ccSmooth, subdivide} from '../subsurf/subsurf_mesh.js';
import {Vertex} from './mesh_types.js';
import {MeshFlags} from './mesh_base.js';

let ccSmoothRets = util.cachering.fromConstructor(Vector3, 64);
let eco = new Vector3();
let eco2 = new Vector3();
let nco = new Vector3();

export function ccSmooth2(v, ws) {
  let ret = ccSmoothRets.next();

  let val = v.edges.length;
  let tot = 0.0;
  let boundary = 0;

  let weight1 = ws[0] ?? 0;
  let weightR = ws[1] ?? 0;
  let weightR2 = ws[2] ?? 0;
  let weightS = ws[3] ?? 0;

  let nweightR = ws[4] ?? 0;
  let nweightS = ws[5] ?? 0;
  let nweight1 = ws[6] ?? 0;


  if (weight1 === undefined) {
    weight1 = (val - 3) / val;
  }

  if (weightR === undefined) {
    weightR = 2.0/val;
  }

  if (weightS === undefined) {
    weightS = 1.0/val;
  }

  let ring1 = new Set();

  for (let e of v.edges) {
    ring1.add(e.otherVertex(v));

    if (e.l && e.l.radial_next === e.l) {
      boundary++;
    }
  }

  if (boundary && v.edges.length === 2) {
    return ret.load(v);
  }

  if (boundary) {
    eco.zero();

    let w1 = ws[6] ?? 1;
    let w2 = ws[7] ?? 2;

    eco.load(v);
    eco.mulScalar(w1);

    tot = w1;

    for (let e of v.edges) {
      if (e.l && e.l.radial_next === e.l) {
        let v2 = e.otherVertex(v);

        eco.addFac(v2, w2);
        tot += w2;
      }
    }

    eco.mulScalar(1.0/tot);

    ret.load(eco);
    return ret;
  }

  let w1 = weight1;

  ret.load(v).mulScalar(w1);
  //ret.addFac(v.no, nweight1);

  tot += w1;

  let wR = weightR;
  let wS = weightS;

  eco.zero();
  eco2.zero();
  nco.zero();

  let tot2 = 0.0;
  let ntot2 = 0.0;

  for (let f of v.faces) {
    let w = f.cent.vectorDistance(v);

    eco.addFac(f.cent, 1.0);
    nco.addFac(f.no, w);

    tot2 += 1.0;
    ntot2 += w;
  }

  if (tot2) {
    eco.mulScalar(1.0/tot2);

    ret.addFac(eco, wS);
    tot += wS;
  }

  if (ntot2) {
    nco.mulScalar(1.0/ntot2);
    ret.addFac(nco, nweightS);
  }

  eco.zero();
  eco2.zero();
  nco.zero();

  tot2 = 0.0;
  let tot3 = 0.0;
  ntot2 = 0.0;

  let doneset = new WeakSet();

  for (let e of v.edges) {
    let v2 = e.otherVertex(v);

    if (0) {
      for (let e2 of v2.edges) {
        let v3 = e2.otherVertex(v2);

        if (doneset.has(v3)) {
          continue;
        }

        doneset.add(v3);

        if (!ring1.has(v3) && v3 !== v) {
          eco2.addFac(v3, 1.0);
          tot3 += 1.0;
        }
      }
    }

    let w = v2.vectorDistance(v);
    nco.addFac(v2.no, w);

    eco.addFac(v2, 1.0);
    tot2 += 1.0;
    ntot2 += w;
  }

  if (tot3 > 0) {
    eco2.mulScalar(1.0 / tot3);
    ret.addFac(eco2, weightR2);
    tot += weightR2;
  }

  if (ntot2) {
    nco.mulScalar(1.0/ntot2);
    ret.addFac(nco, nweightR);
  }

  if (tot2 > 0.0) {
    eco.mulScalar(1.0/tot2);
    ret.addFac(eco, wR);
    tot += wR;
  }

  if (Math.abs(tot) > 0) {
    //ret.mulScalar(1.0/tot);
  }

  return ret;
}

let seed = 0;

window.wlist = new Array(32);
for (let i=0; i<wlist.length; i++) {
  wlist[i] = new Array(3);

  for (let j=0; j<wlist[i].length; j++) {
    wlist[i][j] = 1.0;
  }

  wlist[i].vs = [];
}

//wlist = [[1,1,1],[1,1,1],[1,1,1],[0.7272410983839575,2.4435813347809017,-2.178471789743571],[4.430013563162839,-3.0104949259826426,-0.4227987613820692],[1.326717836316675,0.6465272350430536,-0.9773217315750529],[0.681027649669421,-0.4787632516505709,0.7498618279686324],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]];
//wlist = [[1,1,1],[1,1,1],[1,1,1],[6.646167205089089,-2.8228640166703745,-2.7923176090302224],[4.430013563162839,-3.0104949259826426,-0.4227987613820692],[1.5229585272194894,0.6007029290427015,-1.1367121116859757],[0.8063591339449,-0.7008216471446179,0.9884848294883335],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]];
//wlist = [[1,1,1],[1,1,1],[1,1,1],[3.064527215512514,0.9003473696084594,-2.9824036081532084],[4.430013563162839,-3.0104949259826426,-0.4227987613820692],[1.4373421440850709,0.18100604726428346,-0.6684819059378884],[0.46086543509170635,0.7658991176565205,-0.256928076403811],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]]
wlist = [[1,1,1],[1,1,1],[1,1,1],[-6.6919689877574235,7.7449541418130865,-5.255286055420358],[2.9252062698775627,-1.9281125217402386,-2.4574709914875257],[3.388478383795898,-2.3908329266981805,4.022667641869909],[0.08234435848112126,0.9784174088989873,0.1754479515452284],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]];

for (let ws of wlist) {
  ws.vs = [];
}

window.__last1 = new Map();

let timer = undefined;
window.__solve = function() {
  if (timer) {
    console.log("stopping timer");
    window.clearInterval(timer);
    timer = undefined;

    return;
  }

  let time = util.time_ms();

  timer = window.setInterval(() => {
    if (util.time_ms() - time < 500) {
      return;
    }

    _appstate.api.execTool(_appstate.ctx, "mesh.subdiv_test()");

    time = util.time_ms();
  }, 100);
}

export function meshSubdivideTest(mesh, faces=mesh.faces) {
  if (__last1) {
    for (let v of mesh.verts) {
      let co = __last1.get(v.eid);

      if (!co) {
        __last1.set(v.eid, new Vector3(v));
      } else {
        v.load(co);
      }
    }
  } else {
    __last1 = new Map();
    for (let v of mesh.verts) {
      __last1.set(v.eid, new Vector3(v));
    }
  }

  mesh.regenTesellation();
  mesh.recalcNormals();
  mesh.regenBVH();

  faces = new Set(mesh.faces);

  let origvs = new Set(mesh.verts);

  let copy = mesh.copy(undefined, true);
  let faces2 = new Set(copy.faces);

  mesh.debugLogClear();
  copy.debugLogClear();

  util.seed(seed++);
  seed += Math.random()*5.0;

  let origco = new Map();
  let origno = new Map();

  for (let v of mesh.verts) {
    origco.set(v, new Vector3(v));
    origno.set(v, new Vector3(v.no));
  }

  for (let v of mesh.verts) {
    if (v.edges.length === 0) {
      continue;
    }

    let len = 0;
    for (let e of v.edges) {
      len += e.v1.vectorDistance(e.v2);
    }
    len /= v.edges.length;

    for (let j=0; j<3; j++) {
      v[j] += (util.random() - 0.5)*len;
      v.flag |= MeshFlags.UPDATE;
    }
  }

  mesh.regenTesellation();
  mesh.recalcNormals();

  //mesh.regenRender();
  //return;

  window._meshcopy = copy;

  //let ret1 = subdivide(mesh, faces, true);
  let ret2 = subdivide(copy, faces2, false);

  let f;

  let myconsole = new util.SmartConsoleContext("solve");
  myconsole.timeIntervalAll = 150;

  function solve(err, ws, steps= 1550, val) {
    let df = 0.0005;
    let gs = new Array(ws.length);

    let startws1 = new Array(ws.length);
    for (let i=0; i<ws.length; i++) {
      startws1[i] = ws[i];
    }

    let starterr = err();

    let steps2 = 5;
    let fac = 1.0;

    let startws = new Array(ws.length);

    let stepi = 0, step=-1;

    let order = new Array(ws.length);

    outer: while (stepi < steps) {
      step++;
      stepi++;

      let r = err();

      f = stepi/steps;
      let f2 = 0.25; //Math.exp(-f*2.0)*0.25;

      let wmin = -1.0, wmax = 1.0;

      for(let i=0; i<order.length; i++) {
        order[i] = i;
      }
      for (let i=0; i<order.length; i++) {
        let t = order[i];
        let ri = ~~(util.random()*order.length*0.999999);

        order[i] = order[ri];
        order[ri] = t;
      }

      for (let i of order) {
        startws[i] = ws[i];

        ws[i] += (util.random()-0.5)*f2*r;
        //ws[i] = Math.min(Math.max(ws[i], wmin), wmax);
      }

      let r2 = err();

      f = Math.exp(-f*4.0);
      //console.log(stepi, "anneal fac", f.toFixed(4), ws, f2);

      if (r2 > r && util.random() > f) {
        for (let i of order) {
          ws[i] = startws[i];
        }

        continue;
      }

      //continue;

      for (let i = 0; i < steps2; i++, stepi++) {
        if (stepi >= steps) {
          break outer;
        }

        let r1 = err();

        let threshold = 0.0001;
        if (Math.abs(r1) <= threshold) {
          break;
        }

        let totg = 0.0;
        for (let j of order) {
          let orig = ws[j];

          ws[j] += df;

          let r2 = err();
          let g = (r2 - r1)/df;

          ws[j] = orig;

          totg += g*g;
          gs[j] = g;
        }

        if (totg === 0.0) {
          console.log("totg", totg, r1, step, ws)
          break;
        }

        //totg = Math.sqrt(totg);

        for (let j of order) {
          startws[j] = ws[j];
        }

        //totg = Math.sqrt(totg);

        for (let j of order) {
          let rfac;
          //rfac = Math.min(Math.max(Math.abs(r1), -5.0), 5.0);
          //rfac = (r1 < 0 ? -1 : 1) / totg;
          rfac = 0.15*r1 / totg;

          let delta = -rfac*gs[j];
          //delta = Math.max(Math.abs(delta), 0.01)*Math.sign(delta);

          if (isNaN(delta)) {
            console.log(ws, totg, gs, r1);
            throw new Error("NaN1");
          }

          ws[j] += delta;
          ws[j] = Math.min(Math.max(ws[j], wmin), wmax);
        }

        if (isNaN(totg)) {
          console.log(ws);
          throw new Error("NaN2");
        }

        if (ws[0] < 0) {
          ws[0] = 0;
        }

        let tot = 0.0;
        for (let w of ws) {
          tot += w;
        }

        for (let j of order) {
          //ws[j] /= tot !== 0.0 ? tot : 1.0;
        }

        let f3 = stepi/steps;
        f3 = Math.exp(-f3*6.0);

        if (err() > r1) {// && util.random() > f3) {
          for (let j=0; j<ws.length; j++) {
            ws[j] = startws[j];
          }

          break; //do next annealing step
        }

        //if (stepi % 20 === 0) {
          myconsole.log("  error:", err().toFixed(3), i + 1, fac, "val", val);
        //}
        fac *= 0.95;
      }
    }

    /*
    let tot = 0.0;
    for (let w of ws) {
      tot += w;
    }

    for (let i=0; i<ws.length; i++) {
      ws[i] /= tot !== 0.0 ? tot : 1.0;
    }
    */

    let s = '' + val +  '['
    for (let i=0; i<ws.length; i++) {
      if (i > 0) {
        s += ", ";
      }

      s += ws[i].toFixed(3);
    }
    s += ']';

    if (err() > starterr) {
      for (let i=0; i<ws.length; i++) {
        ws[i] = startws1[i];
      }
    }

    console.log("error:", err().toFixed(3), s, "val", val, "gfac", f);
  }

  mesh.regenTesellation();
  copy.regenTesellation();

  copy.recalcNormals();
  mesh.recalcNormals();

  for (let i=0; i<wlist.length; i++) {
    wlist[i].vs.length = 0;
  }

  for (let v2 of mesh.verts) {
    let v = copy.eidmap[v2.eid];
    let val = v2.edges.length;

    let ws2 = wlist[val];

    if (v && v instanceof Vertex) {
      ws2.vs.push([v2, v]);
    }
  }

  let wi = 0;
  for (let wi=0; wi<wlist.length; wi++) {
    let ws2 = wlist[wi];

    if (ws2.vs.length === 0) {
      continue;
    }

    function error() {
      let err = 0.0;

      for (let [v2, v] of ws2.vs) {
        let co = ccSmooth2(v, ws2);

        err += co.vectorDistanceSqr(v2);
      }

      return Math.sqrt(err);
    }

    if (wi > 1) {
      solve(error, ws2, undefined, wi);
      console.log(wi, error(), ws2, wi);
    }
  }

  for (let v2 of mesh.verts) {
    v2.load(origco.get(v2));
    v2.flag |= MeshFlags.UPDATE;
  }

  mesh.regenTesellation();
  mesh.recalcNormals();

  for (let v2 of mesh.verts) {
    let v = copy.eidmap[v2.eid];
    let val = v2.edges.length;

    let ws2 = wlist[val];

    if (v && v instanceof Vertex) {
      let co;

      //co = v;
      co = ccSmooth2(v, ws2);

      v2.load(co);
    }
  }

  mesh.regenTesellation();
  mesh.recalcNormals();
  mesh.regenRender();
  mesh.graphUpdate();

  return;

  for (let v2 of mesh.verts) {
    break;
    let v = copy.eidmap[v2.eid];

    function rand() {
      let f = util.random();

      return f-0.5;
    }

    if (v && v instanceof Vertex) {
      let val = v.edges.length;
      let startws = new Array(ws.length);

      let ws2;

      function error() {
        for (let i=0; i<startws.length; i++) {
          //startws[i] = ws2[i];
        }

        //ws2[0] = undefined;
        //ws2[1] = undefined;
        //ws2[2] = undefined;
        //ws2[3] = undefined;
        //ws2[4] = undefined;

        let co = ccSmooth2(v, ws);

        for (let i=0; i<startws.length; i++) {
          //ws2[i] = startws[i];
        }

        return co.vectorDistance(v2);
      }


      if (wlist[val] === undefined) {
        ws2 = wlist[val] = ws.concat([]);

        solve(error, ws2, undefined, v2.edges.length);
      } else {
        ws2 = wlist[val];
      }

      let co = ccSmooth2(v, ws);
      v2.load(co);
    }
  }

  console.log("seed: ", seed);
  //mesh.debugLogCompare(copy);

  mesh.regenTesellation();
  mesh.recalcNormals();
  mesh.regenRender();
  mesh.regenBVH();
  mesh.regenElementsDraw();
}







