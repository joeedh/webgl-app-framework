import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {PCOS, PEID, PCOLOR, PTOT, PatchData, PatchList} from './subsurf_base.js';

let eco = new Vector3();
let ccSmoothRets = util.cachering.fromConstructor(Vector3, 64);

export function ccSmooth(v, weight1, weightR, weightS) {
  let ret = ccSmoothRets.next();

  let val = v.edges.length;
  let tot = 0.0;
  let boundary = 0;

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

  ret.mulScalar(1.0/tot);

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

export function subdivide(mesh, faces = mesh.faces, linear = false) {
  let fset = new Set();
  let eset = new Set();
  let vset = new Set();
  let splitvs = new Set();

  let lmap = new Map();

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

  let cents = [];

  for (let f of faces) {
    f.calcCent();
    f.index = cents.length;
    cents.push(new Vector3(f.cent));
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

  for (let e of eset) {
    let v1 = e.v1, v2 = e.v2;

    //console.log("subdividing edge", e.eid);
    let ret = mesh.splitEdge(e, 0.5);

    let ne = ret[0], nv = ret[1];

    mesh.verts.setSelect(nv, true);
    mesh.edges.setSelect(ne, true);

    mesh.updateMirrorTag(nv);

    splitvs.add(nv);

    if (!linear && e.l && e.l.radial_next !== e.l) {
      let cent1 = cents[e.l.f.index];
      let cent2 = cents[e.l.radial_next.f.index];

      eco.load(vcos[v1.index]).add(vcos[v2.index]);
      eco.add(cent1).add(cent2);
      eco.mulScalar(0.25);

      nv.load(eco);
    } else if (!linear && e.l) {
      let cent1 = cents[e.l.f.index];

      eco.load(vcos[v1.index]).add(vcos[v2.index]);
      let w = 0.0;
      eco.addFac(cent1, w);

      eco.mulScalar(1.0/(2.0 + w));
      nv.load(eco);
    } else {
      eco.load(vcos[v1.index]).interp(vcos[v2.index], 0.5);
      nv.load(eco);
    }

    nv.index = -1;
  }

  if (!linear) {
    for (let v of vset2) {
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
            tot += w2;
          }
        }

        eco.mulScalar(1.0/tot);
        v.load(eco);
        continue;
      }

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);

        if (!splitvs.has(v2)) {
          v2 = vcos[v2.index];
        }

        eco.addFac(v2, 1.0);
        tot2 += 1.0;
        //v.addFac(v2, wR);
        //tot += wR;
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
        eco.addFac(cents[f.index], 1.0);
        tot2 += 1.0;
      }

      if (tot2) {
        eco.mulScalar(1.0/tot2);
        v.addFac(eco, wS);
        tot += wS;
      }

      if (boundary) {
        let w2 = 0.0;
        v.addFac(vcos[v.index], w2);
        tot += w2;
      }

      v.mulScalar(1.0/tot);
      mesh.doMirrorSnap(v);
    }
  }


  let lsinterp = [];
  let vsinterp = [];
  let winterp = [];
  let cent2 = new Vector3();
  let centout = new Map();

  for (let f of fset) {
    cent2.load(cents[f.index])

    //f.calcCent();

    //cent2.interp(f.cent, 0.5);

    let centv = mesh.makeVertex(cent2);

    centout.set(f.eid, centv);

    mesh.verts.setSelect(centv, true);

    lsinterp.length = 0;
    f.lists[0]._recount();

    vsinterp.length = 0;

    for (let l of f.lists[0]) {
      vsinterp.push(l.v);
      lsinterp.push(l);
      winterp.push(1.0/f.lists[0].length);
    }

    mesh.verts.customDataInterp(centv, vsinterp, winterp);

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

