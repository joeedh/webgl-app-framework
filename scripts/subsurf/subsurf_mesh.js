import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {PCOS, PEID, PCOLOR, PTOT, PatchData, PatchList} from './subsurf_base.js';
import {MeshTypes, MeshFlags} from '../mesh/mesh_base.js';

let eco = new Vector3();
let ccSmoothRets = util.cachering.fromConstructor(Vector3, 64);

export function ccSmooth(v, weight1, weightR, weightS) {
  let ret = ccSmoothRets.next();

  let val = v.edges.length;
  let tot = 0.0;
  let boundary = 0;

  if (val === 0.0) {
    return;
  }

  if (weight1 === undefined) {
    weight1 = (val - 3) / val;
  }

  if (weightR === undefined) {
    weightR = 2.0/val;
  }

  if (weightS === undefined) {
    weightS = 1.0/val;
  }

  for (let e of v.edges) {
    if (e.l && e.l.radial_next === e.l) {
      boundary++;
    }
  }

  if (boundary && v.edges.length === 2) {
    return ret.load(v);
  }

  if (boundary) {
    eco.zero();

    let w1 = 1;
    let w2 = 2;

    eco.load(v);
    eco.mulScalar(w1);

    tot = w1;

    for (let e of v.edges) {
      let v2 = e.otherVertex(v);
      let w2 = 1.0;

      if (e.l && e.l.radial_next === e.l) {
        w2 = 10.0;
      }

      eco.addFac(v2, w2);
      tot += w2;
    }

    if (tot === 0.0) {
      return;
    }

    eco.mulScalar(1.0/tot);

    ret.load(eco);
    return ret;
  }

  let w1 = weight1;

  ret.load(v).mulScalar(w1);
  tot += w1;

  let wR = weightR;
  let wS = weightS;

  eco.zero();
  let tot2 = 0.0;

  for (let f of v.faces) {
    eco.addFac(f.cent, 1.0);
    tot2 += 1.0;
  }

  if (tot2) {
    eco.mulScalar(1.0/tot2);
    ret.addFac(eco, wS);
    tot += wS;
  }

  eco.zero();
  tot2 = 0.0;

  for (let e of v.edges) {
    let v2 = e.otherVertex(v);

    eco.addFac(v2, 1.0);
    tot2 += 1.0;
  }

  if (tot2 > 0.0) {
    eco.mulScalar(1.0/tot2);
    ret.addFac(eco, wR);
    tot += wR;
  }

  if (tot !== 0.0) {
    ret.mulScalar(1.0/tot);
  }

  return ret;
}

//this assumes that all faces are already quads
export function createPatches(mesh, faces = mesh.faces) {
  let patches = new PatchList();
  let ps = patches.patchdata;

  for (let f of mesh.faces) {
    let l = f.lists[0].l;

    let pi = ps.length;
    patches.eidmap[f.eid] = pi;

    for (let i = 0; i < PTOT; i++) {
      ps.push(0.0);
    }

    let v1                     = l.v, v2           = l.next.v,
        v3 = l.next.next.v, v4 = l.next.next.next.v;


    for (let i = 0; i < 3; i++) {
      ps[pi + PCOS + i] = v1[i];
      ps[pi + PCOS + (0*4 + 4)*3 + i] = v2[i];
      ps[pi + PCOS + (4*4 + 4)*3 + i] = v3[i];
      ps[pi + PCOS + (4*4 + 0)*3 + i] = v4[i];
    }
  }

  let dimen = patches.patchdata.length/4;

  dimen = Math.ceil(Math.sqrt(dimen));
  dimen = Math.ceil(Math.log(dimen)/Math.log(2.0));
  dimen = 1<<dimen;

  patches.texdimen = dimen;
  let totps = dimen*dimen*4;

  while (ps.length < totps) {
    ps.push(0.0);
  }

  patches.patchdata = new Float32Array(patches.patchdata);

  return patches;
}

export function loopSubdivide(mesh, faces=mesh.faces) {
  let faces2 = new Set();
  for (let f of faces) {
    let ok = f.lists.length === 1;
    ok = ok && f.lists[0].length === 3;
    if (ok) {
      faces2.add(f);
    }
  }
  faces = faces2;

  console.log(faces2);
  let vset = new Set();
  let eset = new Set();

  for (let f of faces) {
    for (let l of f.lists[0]) {
      vset.add(l.v);
      eset.add(l.e);
    }
  }

  let vdatas = new Map();
  let edatas = new Map();
  let vlist = [], llist=[], wlist = [];

  for (let e of eset) {
    vset.add(e.v1);
    vset.add(e.v2);
  }

  function makeDummy(v) {
    let d = new Vector3();

    d.customData = v !== undefined ? v.customData.map(f => f.copy()) : [];
    d.eid = v !== undefined ? v.eid : -1;
    d.type = MeshTypes.VERTEX;

    return d;
  }

  for (let v of vset) {
    let dummy = makeDummy(v);
    let tot = 0.0;

    vlist.length = 0;
    wlist.length = 0;

    for (let v2 of v.neighbors) {
      let w = 1.0;

      dummy.addFac(v2, w);

      vlist.push(v2);
      wlist.push(w);

      tot += w;
    }

    let w1 = tot*0.5;

    vlist.push(v);
    wlist.push(w1);
    dummy.addFac(v, w1);

    tot += w1;

    if (tot !== 0.0) {
      dummy.mulScalar(1.0/tot);

      for (let i = 0; i < wlist.length; i++) {
        wlist[i] /= tot;
      }
    }

    //XXX
    //dummy.load(v);

    mesh.verts.customDataInterp(dummy, vlist, wlist);
    vdatas.set(v, dummy);
  }

  let splitvs = new Set();
  for (let e of new Set(eset)) {
    let d1 = vdatas.get(e.v1);
    let d2 = vdatas.get(e.v2);

    let [ne, nv] = mesh.splitEdge(e);

    splitvs.add(nv);
    eset.add(ne);

    mesh.verts.setSelect(nv, true);
    mesh.edges.setSelect(ne, true);

    let dummy = makeDummy(nv);
    vlist.length = 3;
    wlist.length = 3;

    vlist[0] = d1;
    vlist[1] = d2;
    vlist[2] = nv;

    let w1 = 1, w2 = 1, w3 = 1;

    wlist[0] = w1 / (w1+w2+w3);
    wlist[1] = w2 / (w1+w2+w3);
    wlist[2] = w3 / (w1+w2+w3);

    dummy.load(d1).interp(d2, 0.5).interp(nv, 0.5);

    mesh.verts.customDataInterp(dummy, vlist, wlist);

    vdatas.set(nv, dummy);

    nv.customData = dummy.customData;
    nv[0] = dummy[0];
    nv[1] = dummy[1];
    nv[2] = dummy[2];
  }

  for (let v of vset) {
    let d = vdatas.get(v);
    v.customData = d.customData;
    //continue;
    v[0] = d[0];
    v[1] = d[1];
    v[2] = d[2];
  }

  function lerp(l, l1, l2, l3) {
    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.next.next, l3);
  }

  for (let f of faces) {
    let l1 = f.lists[0].l;
    let l2 = l1.next;
    let l3 = l2.next;
    let l4 = l3.next;
    let l5 = l4.next;
    let l6 = l5.next;

    let t1 = mesh.makeTri(l6.v, l1.v, l2.v);
    let t2 = mesh.makeTri(l2.v, l3.v, l4.v);
    let t3 = mesh.makeTri(l4.v, l5.v, l6.v);
    let t4 = mesh.makeTri(l6.v, l2.v, l4.v);

    mesh.faces.setSelect(t1, true);
    mesh.faces.setSelect(t2, true);
    mesh.faces.setSelect(t3, true);
    mesh.faces.setSelect(t4, true);

    lerp(t1.lists[0].l, l6, l1, l2);
    lerp(t2.lists[0].l, l2, l3, l4);
    lerp(t3.lists[0].l, l4, l5, l6);
    lerp(t4.lists[0].l, l6, l2, l4);

    mesh.killFace(f);
  }
}

export function subdivide(mesh, faces = mesh.faces, linear = false) {
  let fset = new Set();
  let eset = new Set();
  let vset = new Set();
  let splitvs = new Set();

  let lmap = new Map();

  let lsinterp = [];
  let vsinterp = [];
  let winterp = [];
  let cent2 = new Vector3();
  let centout = new Map();

  for (let f of faces) {
    fset.add(f);
    f.calcCent();

    for (let list of f.lists) {
      for (let l of list) {
        vset.add(l.v);
        eset.add(l.e);
      }
    }
  }

  /*
  let origvmap = new Map();
  for (let v of vset) {
    let cd = {customData : [], eid : v.eid};

    for (let cd2 of v.customData) {
      cd.customData.push(cd2.copy());
    }

    origvmap.set(v, cd);
  }
  //*/

  function getorig(v) {
    return v;
    /*
    if (!origvmap.has(v)) {
      let dummy = {customData : v.customData.map(f => f.copy())};
      origvmap.set(v, dummy);
    }

    return origvmap.has(v) ? origvmap.get(v) : v;//*/
  }

  let cents = [];

  for (let f of faces) {
    f.calcCent();
    f.index = cents.length;

    f.flag |= MeshFlags.UPDATE;

    let centv = mesh.makeVertex(f.cent);

    mesh.verts.setSelect(centv, true);

    f.lists[0]._recount();

    vsinterp.length = 0;
    let fw = 1.0 / f.lists[0].length;

    for (let l of f.lists[0]) {
      vsinterp.push(l.v);
      lsinterp.push(l);
      winterp.push(fw);
    }

    mesh.verts.customDataInterp(centv, vsinterp, winterp);

    cents.push(centv);
  }

  let vset2 = new Set();
  let vset3 = new Set();

  for (let e of eset) {
    vset2.add(e.v1);
    vset2.add(e.v2);
  }

  for (let v of vset) {
    vset2.add(v);

    for (let f of v.faces) {
      for (let list of f.lists) {
        for (let l of list) {
          vset2.add(l.v);
        }
      }
    }
  }

  for (let v of vset2) {
    vset3.add(v);
  }

  let vcos = new Array(vset3.length);

  let i = 0;
  for (let v of vset3) {
    for (let e of v.edges) {
      vset3.add(e.otherVertex(v));
    }

    v.index = i;
    vcos[i] = new Vector3(v);
    i++;
  }

  let eco = new Vector3();

  let vlist = [];
  let wlist = [];

  for (let e of eset) {
    let v1 = e.v1, v2 = e.v2;

    e.flag |= MeshFlags.UPDATE;
    v1.flag |= MeshFlags.UPDATE;
    v2.flag |= MeshFlags.UPDATE;

    //console.log("subdividing edge", e.eid);
    let ret = mesh.splitEdge(e, 0.5);

    let ne = ret[0], nv = ret[1];

    mesh.verts.setSelect(nv, true);
    mesh.edges.setSelect(ne, true);

    mesh.updateMirrorTag(nv);

    splitvs.add(nv);
    vlist.length = 0;
    wlist.length = 0;

    if (!linear && e.l && e.l.radial_next !== e.l) {
      let cent1 = cents[e.l.f.index];
      let cent2 = cents[e.l.radial_next.f.index];

      eco.load(vcos[v1.index]).add(vcos[v2.index]);
      eco.add(cent1).add(cent2);
      eco.mulScalar(0.25);

      vlist.push(cent1);
      vlist.push(cent2);
      vlist.push(v1);
      vlist.push(v2);
      for (let i=0; i<4; i++) {
        wlist.push(0.25)
      }

      mesh.verts.customDataInterp(nv, vlist, wlist);

      nv.load(eco);
    } else if (!linear && e.l) {
      let cent1 = cents[e.l.f.index];

      /*
      on factor;

      polya := w1*a + w2*b + w3*c;
      polyb := w1*a + w3*c + w4*d;

      f1 := k1 + (k2 - k1)*v;
      f2 := k4 + (k3 - k4)*v;
      f3 := f1 + (f2 - f1)*u;

      wq1 := sub(k1=1, k2=0, k3=0, k4=0, f3);
      wq2 := sub(k1=0, k2=1, k3=0, k4=0, f3);
      wq3 := sub(k1=0, k2=0, k3=1, k4=0, f3);
      wq4 := sub(k1=0, k2=0, k3=0, k4=1, f3);

      polyc := wq1*a + wq2*b + wq3*c + wq4*d;

      f1 := polya*mul1 - polyc;
      f2 := polyb - polyc;

      solve({f1, f2}, {w1, w2});

      **/
      eco.load(vcos[v1.index]).add(vcos[v2.index]);
      let w = 0.0;
      eco.addFac(cent1, w);

      vlist.push(cent1);
      vlist.push(v1);
      vlist.push(v2);
      for (let i=0; i<4; i++) {
        wlist.push(1.0/(2.0 + w));
      }

      mesh.verts.customDataInterp(nv, vlist, wlist);

      eco.mulScalar(1.0/(2.0 + w));
      nv.load(eco);
    } else {
      eco.load(vcos[v1.index]).interp(vcos[v2.index], 0.5);
      nv.load(eco);
    }

    nv.index = -1;
  }

  if (!linear) {
    function finish(v) {
      //return;
      if (wlist.length !== vlist.length) {
        throw new Error();
      }
      if (wlist.length === 0) {
        return;
      }

      let totw = 0.0;
      for (let w of wlist) {
        totw += w;
      }
      for (let i=0; i<wlist.length; i++) {
        wlist[i] /= totw;
      }

      mesh.verts.customDataInterp(v, vlist, wlist);
    }

    for (let v of vset2) {
      let dummy;

      let val = v.edges.length;
      let tot = 0.0;

      if (v.edges.length === 2) {
        let bad = false;
        for (let e of v.edges) {
          if (!e.l || e.l.radial_next === e.l) {
            bad = true;
            break;
          }
        }

        if (bad) {
          continue;
        }
      }

      let w1 = (val - 3)/val;
      tot += w1;

      let wR = 2.0/val;
      let wS = 1.0/val;

      vlist.length = 0;
      wlist.length = 0;

      if (1) {
        dummy = {customData : []};
        for (let cd of v.customData) {
          dummy.customData.push(cd.copy());
        }

        vlist.push(dummy);
        wlist.push(w1);
      }

      v.mulScalar(w1);

      eco.zero();
      let tot2 = 0.0;
      let boundary = 0;

      for (let e of v.edges) {
        if (e.l && e.l.radial_next === e.l) {
          boundary++;
        }
      }

      if (boundary) {
        eco.zero();

        let w1 = 1;
        let w2 = 2;

        eco.load(vcos[v.index]);
        eco.mulScalar(w1);

        tot = w1;

        for (let e of v.edges) {
          if (e.l && e.l.radial_next === e.l) {
            let v2 = e.otherVertex(v);

            eco.addFac(v2, w2);

            wlist.push(w2/v.edges.length);
            vlist.push(getorig(v2));

            tot += w2;
          }
        }

        eco.mulScalar(1.0/tot);
        v.load(eco);

        finish(v);
        continue;
      }

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);

        //vlist.push(v2);
        vlist.push(getorig(v2));
        wlist.push(wR/v.edges.length);

        if (!splitvs.has(v2)) {
          v2 = vcos[v2.index];
        }

        eco.addFac(v2, 1.0);
        tot2 += 1.0;
      }

      if (tot2 > 0.0) {
        eco.mulScalar(1.0/tot2);
        v.addFac(eco, wR);
        tot += wR;
      }

      eco.zero();
      tot2 = 0.0;

      for (let f of v.faces) {
        if (boundary) {
          break;
        }

        for (let l2 of f.lists[0]) {
          let v2 = l2.v === v ? dummy : getorig(l2.v);

          vlist.push(v2);
          wlist.push(wS/v.edges.length/f.lists[0].length);
        }

        eco.addFac(cents[f.index], 1.0);
        tot2 += 1.0;
      }

      if (tot2) {
        eco.mulScalar(1.0/tot2);
        v.addFac(eco, wS);
        tot += wS;
      }

      /*
      if (boundary) {
        let w2 = 1.0;
        v.addFac(vcos[v.index], w2);

        tot += w2;
      }
      */

      finish(v);

      v.mulScalar(1.0/tot);
      mesh.doMirrorSnap(v);
    }
  }

  for (let f of fset) {
    let centv = cents[f.index];

    lsinterp.length = 0;
    winterp.length = 0;

    f.lists[0]._recount();

    let fw = 1.0 / f.lists[0].length;

    for (let l of f.lists[0]) {
      lsinterp.push(l);
      winterp.push(fw);
    }

    let l = f.lists[0].l;
    let _i = 0;
    do {

      let li = lsinterp.indexOf(l);
      let t = lsinterp[li];
      lsinterp[li] = lsinterp[lsinterp.length - 1];
      lsinterp[lsinterp.length - 1] = t;

      /*
      let v1 = l.v;
      let v2 = l.next.v;
      let v3 = centv;
      let v4 = l.prev.v;
      */

      let v1 = centv;
      let v2 = l.prev.v;
      let v3 = l.v;
      let v4 = l.next.v;

      let f2 = mesh.makeQuad(v1, v2, v3, v4);
      let l2 = f2.lists[0].l;

      f2.calcCent();

      lmap.set(l.eid, f2);

      mesh.loops.customDataInterp(l2, lsinterp, winterp);
      mesh.copyElemData(l2.next, l.prev);
      mesh.copyElemData(l2.next.next, l);
      mesh.copyElemData(l2.prev, l.next);

      mesh.faces.setSelect(f2, true);

      for (let l of f2.lists[0]) {
        mesh.edges.setSelect(l.e, true);
      }

      if (_i++ > 10000) {
        console.warn("infinite loop in subdiivde");
        break;
      }

      l = l.next.next;
    } while (l !== f.lists[0].l);

    mesh.killFace(f);
  }

  for (let v of vset) {
    mesh.doMirrorSnap(v);
  }
  for (let v of splitvs) {
    mesh.doMirrorSnap(v);
  }

  mesh.updateMirrorTags();
  mesh.validateMesh();

  return {
    oldLoopEidsToQuads: lmap,
    newVerts          : splitvs,
    centerFeidMap     : centout
  }
  //return mesh;
}

