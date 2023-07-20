import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import '../util/numeric.js';
import {applyTriangulation, triangulateFace} from './mesh_tess.js';

import {getArrayTemp, MeshTypes, LogContext, LogTags} from './mesh_base.js';
import {CDFlags} from './customdata.js';

let lctx_tmp = new LogContext();
let lctx_forward = undefined;
let lctx_f_mesh = undefined;

lctx_tmp.onnew = function(e, type) {
  if (e.type !== MeshTypes.EDGE) {
    if (lctx_forward) {
      lctx_forward.onnew(e, type);
    }
    return;
  }

  let flatlist = lctx_f_mesh.edges.customData.flatlist;

  for (let i=0; i<2; i++) {
    let v = i ? e.v2 : e.v1;

    for (let e2 of v.edges) {
      if (e !== e2) {
        for (let i=0; i<e.customData.length; i++) {
          if (!(flatlist[i].flag & CDFlags.NO_INTERP)) {
            e2.customData[i].copyTo(e.customData[i]);
          }
        }

        if (lctx_forward) {
          lctx_forward.onnew(e, type);
        }
        return;
      }
    }
  }

  if (lctx_forward) {
    lctx_forward.onnew(e, type);
  }
}

let countmap = [
  [0], [0,0], [0,0,0], [ //tris
    0, 1, 2, 3
  ],
  [ //quads
    0, 2, 1, 3, 4
  ]
];

/**
  counts number of new edges created by pattern-based subdivision,
  as done by splitEdgesSmart and splitEdgesSmart2
 */
export function countNewSplitEdges(e, eset) {
  if (!eset) {
    let count = 0;

    for (let f of e.faces) {
      if (f.isTri()) {
        count += 1;
      } else if (f.isQuad()) {
        count += 2;
      }
    }

    return count;
  }

  let count = 0;

  for (let f of e.faces) {
    if (f.lists.length > 0) {
      continue;
    }

    let tote = 0;
    let totv = 0;

    for (let l2 of f.loops) {
      if (l2.e === e || eset.has(l2.e)) {
        tote++;
      }

      totv++;
    }

    if (totv < countmap.length) {
      count += countmap[totv][tote];
    }
  }

  count = Math.max(count, 1);

  return count;
}

export class Pattern {
  constructor(verts, newverts, faces) {
    this.verts = verts;
    this.newverts = newverts;
    this.faces = faces;
    this.shift = 0;

    this.facetemps = [];
    this.facetemps2 = [];
    this._temps3 = [];

    if (verts) {
      this.array1 = new Array(verts.length + newverts.length);
      this.array2 = new Array(verts.length + newverts.length);
      this.array3 = new Array(verts.length + newverts.length);
      this.array4 = new Array(verts.length + newverts.length);

      this.genFaceTemps();
    }
  }

  genMasks() {
    let vs = this.verts;
    let vlen = vs.length;

    let masks = {};

    for (let i = 0; i < vlen; i++) {
      let mask = 0;

      for (let j = 0; j < vlen; j++) {
        let j2 = (j - i + vlen)%vlen;

        if (vs[j2]) {
          mask |= 1<<j;
        }
      }

      mask = mask | (vlen<<15);

      masks[mask] = i;
    }

    return masks;
  }

  mirror() {
    this.verts.reverse();
    let vlen = this.verts.length;

    for (let vpat of this.newverts) {
      for (let i = 0; i < vpat.length; i += 2) {
        vpat[i] = (vlen - vpat[i] - 1)%vlen;
      }
    }

    //vlen += this.newverts.length;

    for (let f of this.faces) {
      for (let i = 0; i < f.length; i++) {
        if (f[i] < this.verts.length) {
          f[i] = (vlen - f[i] - 1)%vlen;
        }
      }

      f.reverse();
    }

    return this;
  }

  copy() {
    let p = new Pattern()

    p.verts = this.verts.concat([]);
    p.newverts = this.newverts.concat([]);
    p.faces = this.faces.concat([]);

    p.array1 = new Array(this.verts.length + this.newverts.length);
    p.array2 = new Array(this.verts.length + this.newverts.length);
    p.array3 = new Array(this.verts.length + this.newverts.length);
    p.array4 = new Array(this.verts.length + this.newverts.length);

    for (let i = 0; i < p.newverts.length; i++) {
      p.newverts[i] = p.newverts[i].concat([]);
    }

    for (let i = 0; i < p.faces.length; i++) {
      p.faces[i] = p.faces[i].concat([]);
    }

    p.shift = this.shift;
    p.genFaceTemps();

    return p;
  }

  genFaceTemps() {
    let fs = this.facetemps = [];
    let fs2 = this.facetemps2 = [];

    for (let f of this.faces) {
      fs.push(new Array(f.length));
      fs2.push(new Array(f.length));
    }
  }
}

function makePatterns() {
  let patterns = [
    //tri with one subdivide edge
    new Pattern([0, 1, 0, 0], [], [
      [0, 1, 3],
      [1, 2, 3]]
    ),//*/

    //tri with two subdivided edges
    new Pattern([0, 1, 0, 1, 0], [], [
      [0, 1, 3],
      [1, 2, 3],
      [3, 4, 0],
    ]),//*/

    //tri with three subdivided edges
    new Pattern([0, 1, 0, 1, 0, 1], [], [
      [5, 0, 1],
      [1, 2, 3],
      [3, 4, 5],
      [1, 3, 5]
    ]),

    //quad with one edge
    new Pattern([0, 1, 0, 0, 0], [], [
      [0, 1, 3],
      [1, 2, 3],
      [0, 3, 4]
    ]),

    //quad with two opposite edges
    new Pattern([0, 1, 0, 0, 1, 0], [], [
      [0, 1, 4, 5],
      [1, 2, 3, 4],
    ]),

    //quad with two adj edges
    new Pattern([0, 1, 0, 1, 0, 0], [[1, 0.5, 3, 0.5]], [
      [0, 1, 6, 5],
      [1, 2, 3, 6],
      [3, 4, 5, 6]
    ]),

    //quad with three edges
    new Pattern([0, 1, 0, 1, 0, 1, 0], [], [
      [1, 2, 3],
      [1, 3, 4, 5],
      [5, 6, 0, 1]
    ]),

    //full quad
    new Pattern([0, 1, 0, 1, 0, 1, 0, 1], [
      [0, 0.25, 2, 0.25, 4, 0.25, 6, 0.25]
    ], [
      [7, 0, 1, 8],
      [1, 2, 3, 8],
      [3, 4, 5, 8],
      [5, 6, 7, 8]
    ])
  ]

  for (let p of patterns.concat([])) {
    //continue;
    let p2 = p.copy().mirror();

    let masks1 = p.genMasks();
    let masks2 = p2.genMasks();

    let ok = true;

    for (let mask in masks2) {
      if (mask in masks1) {
        //mirror of pattern is just pattern shifted
        //ok = false;
      }
    }

    if (ok) {
      patterns.push(p2);
    }
  }

  let pmap = {};

  for (let p of patterns) {
    let masks = p.genMasks();

    for (let mask in masks) {
      let shift = masks[mask];

      let p2 = p.copy();

      let vlen = p.verts.length;

      for (let vmap of p2.newverts) {
        for (let i = 0; i < vmap.length; i += 2) {
          vmap[i] = (vmap[i] + shift)%vlen;
        }
      }

      //vlen += p.newverts.length;

      for (let f of p2.faces) {
        for (let i = 0; i < f.length; i++) {
          if (f[i] < p.verts.length) {
            f[i] = (f[i] + shift)%vlen;
          }
        }
      }

      p2.shift = shift;
      pmap[mask] = p2;
      //console.log(mask);
    }
  }

  return pmap;
}

let patterns = makePatterns();
window._patterns = patterns;

export function splitEdgesPreserveQuads(mesh, es, testfunc, lctx) {
  if (!(es instanceof Set)) {
    es = new Set(es);
  }

  let fs = new Set();

  function addf(f) {
    if (fs.has(f)) {
      return false;
    }

    f.index = 0;

    for (let l of f.loops) {
      if (es.has(l.e)) {
        f.index++;
      }
    }

    fs.add(f);

    return true;
  }

  for (let e of es) {
    for (let f of e.faces) {
      addf(f);
    }
  }

  if (1) {
    let flag = MeshFlags.TEMP1;
    for (let f of fs) {
      f.index = 0;

      for (let l of f.loops) {
        l.e.flag &= ~flag;

        if (es.has(l.e)) {
          l.e.flag |= flag;
          f.index++;
        }
      }
    }

    for (let f of fs) {
      if (!f.isQuad()) {
        continue;
      }

      let count = 0;
      let e;
      let l;

      for (let l2 of f.loops) {
        if (l2.e.flag & flag) {
          count++;
          e = l2.e;
          l = l2;
        }
      }

      if (l && l.radial_next !== l && l.radial_next.f.index !== 1) {
        continue;
      }

      if (count === 1) {
        let l2 = l.radial_next;
        let f2 = l2.f;

        es.delete(e);
        fs.delete(f);

        if (f !== f2) {
          fs.delete(f2);
        }

        let [ne, nv] = mesh.splitEdge(e, 0.5, lctx);
        mesh.splitFace(f, l.prev.prev, l.next, lctx);

        if (f !== f2) {
          if (l2.v !== l.v) {
            mesh.splitFace(f2, l2.prev, l2.next, lctx);
          } else {
            mesh.splitFace(f2, l2.prev.prev, l2.next, lctx);
          }
        }

        mesh.dissolveEdge(e, lctx);
      }
    }
  }

  function adde(e) {
    if (!es.has(e)) {
      for (let f of e.faces) {
        if (!addf(f)) {
          f.index++;
        }
      }

      es.add(e);
    }
  }

  function reme(e) {
    if (!es.delete(e)) {
      return;
    }

    for (let f of e.faces) {
      f.index--;
    }
  }

  if (0) { //split edge loops
    for (let e of es) {
      for (let f of e.faces) {
        if (!f.isQuad() || f.index !== 1) {
          continue;
        }

        let startl = e.loopForFace(f);
        let l = startl;
        let maxsteps = 1000;
        for (let i=0; i<maxsteps; i++) {
          if (i === maxsteps-1) {
            console.warn("Possible infinite loop error");
          }

          adde(l.e);

          l = l.next.next.radial_next;

          if (!fs.has(l.f)) {
            addf(l.f);
          }

          let bad = l === startl || l === l.radial_next;
          bad = bad || !l.f.isQuad();
          bad = bad || l.f.index > 2;

          if (bad) {
            break;
          }
        }

      }
    }
  }

  console.log("es", es, fs);

  for (let step=0; step<15; step++) {
    let found = false;

    let flag = MeshFlags.TEMP1;

    for (let f of fs) {
      f.flag &= ~flag;
    }

    if (0 && step === 0) {
      for (let f of fs) {
        console.log(f.index);

        if (f.flag & flag) {
          continue;
        }

        f.flag |= flag;

        if (f.index === 4) {
          for (let l of f.loops) {
            for (let e of l.v.edges) {
              if (es.has(e)) {
                continue;
              }

              for (let l2 of e.loops) {
                if (!fs.has(l2.f)) {
                  addf(l2.f);
                  l2.f.flag |= flag;
                } else {
                  l2.f.index++;
                }
              }

              es.add(e);
            }
          }

          found = true;
        }
      }
    }

    for (let f of fs) {
      if (!f.isQuad()) {
        continue;
      }

      let e, l;
      let count = 0;

      for (let l2 of f.loops) {
        if (es.has(l2.e)) {
          count++;
          e = l2.e;
          l = l2;
        }
      }

      if (count !== 1 || !e) {
        continue;
      }

      //case a
      //try to find one vert to split
      let va;

      for (let v of e.verts) {
        let ok = true;

        let val = v.valence;
        if (val !== 4 && val > 2) {
          va = v;
          continue;
        }

        for (let l2 of v.loops) {
          let e2 = l2.e;

          if (e2 === e || !fs.has(l2.f)) {
            continue;
          }

          if (es.has(e2)) {
            ok = false;
            break;
          }
        }

        if (ok) {
          va = v;
          break;
        }
      }

      if (va) {
        found = true;
        for (let e2 of va.edges) {
          adde(e2);
        }
      } else {
        reme(e);
      }
    }

    for (let e of es) {
      for (let l of e.loops) {
        if (!fs.has(l.f)) {
          l.f.index = 0;
          for (let e of l.f.edges) {
            l.f.index += es.has(e) ? 1 : 0;
          }
        }

        fs.add(l.f);
      }
    }

    for (let f of fs) {
      if (step < 3 && !found) {
        break;
      }

      if (f.isQuad() && f.index === 3) {
        found = true;

        for (let e of f.edges) {
          es.add(e);
        }
      }
    }

    if (!found) {
      break;
    }
  }

  return splitEdgesSmart2(mesh, es, testfunc, lctx);
}

//like splitEdgesSmart but optimized for sculpt
export function splitEdgesSmart2(mesh, es, testfunc, lctx, smoothFac=0.0) {
  lctx_forward = lctx;
  lctx = lctx_tmp;
  lctx_f_mesh = mesh;

  let newes = new Set();
  let newvs = new Set();
  let fs = new Set();

  if (!(es instanceof Set)) {
    es = new Set(es);
  }

  for (let e of es) {
    for (let l of e.loops) {
      fs.add(l.f);
    }
  }



  if (smoothFac > 0.0) {
    for (let e of es) {
      let [ne, nv] = mesh.splitEdgeWhileSmoothing(e, 0.5, smoothFac, lctx);

      newvs.add(nv);
      newes.add(ne);
    }
  } else {
    for (let e of es) {
      let [ne, nv] = mesh.splitEdge(e, 0.5, lctx);

      newvs.add(nv);
      newes.add(ne);
    }
  }

  for (let f of fs) {
    if (f.lists.length > 1) {
      console.warn("Implement me!");
      continue;
    }

    let mask = 0;
    let i = 0;
    let count = 0;

    for (let l of f.loops) {
      let bit = newvs.has(l.v);

      l.v.index = bit ? 1 : 0;
      mask |= bit ? (1<<i) : 0;

      i++;
      count++;
    }

    mask |= count<<15;

    //console.log(mask, patterns[mask]);

    let pat = patterns[mask];
    if (!pat) {
      continue;
    }

    let vs = pat.array1;
    let ls = pat.array2;

    let vi = 0;

    for (let l of f.loops) {
      vs[vi] = l.v;
      ls[vi] = l;
      vi++;
    }

    for (let vmap of pat.newverts) {
      let v = mesh.makeVertex();

      let vs2 = pat._temps3;
      vs2.length = vmap.length >> 1;

      if (lctx) {
        lctx.newVertex(v, LogTags.SPLIT_EDGES_SMART2);
      }

      v.zero();

      vs[vi] = v;

      let ws2 = getArrayTemp(vmap.length>>1);
      let ls2 = getArrayTemp(vmap.length>>1);

      //create a dummy loop
      let l = new Loop();
      l.eid = 0;
      mesh.loops.customData.initElement(l);

      let wi = 0;

      for (let i = 0; i < vmap.length; i += 2) {
        let v2 = vs[vmap[i]];
        let w = vmap[i + 1];

        ls2[wi] = ls[vmap[i]];
        ws2[wi] = w;
        vs2[wi] = v2;

        v.addFac(v2, w);

        wi++;
      }

      mesh.verts.customDataInterp(v, vs2, ws2);
      mesh.loops.customDataInterp(l, ls2, ws2);

      ls[vi] = l;

      vi++;
    }

    for (let i = 0; i < pat.faces.length; i++) {
      let f2 = pat.faces[i], vs2 = pat.facetemps[i];
      let ls2 = pat.facetemps2[i];

      for (let j = 0; j < f2.length; j++) {
        //console.log(f2[j], vs);
        vs2[j] = vs[f2[j]];
        ls2[j] = ls[f2[j]];
      }

      //console.log("--", vs2, pat.faces[i], i);

      f2 = mesh.makeFace(vs2, undefined, undefined, lctx, LogTags.SPLIT_EDGES_SMART2);

      mesh.copyElemData(f2, f);

      let j = 0;
      for (let l of f2.loops) {
        mesh.copyElemData(l, ls2[j]);
        j++;
      }

      for (let j = 0; j < vs2.length; j++) {
        vs2[j] = ls2[j] = undefined;
      }
    }

    for (let i = 0; i < vs.length; i++) {
      vs[i] = ls[i] = undefined;
    }

    mesh.killFace(f, lctx, LogTags.SPLIT_EDGES_SMART2);
  }

  lctx_forward = lctx_f_mesh = undefined;
}

export function splitEdgesSimple2(mesh, es, testfunc, lctx) {
  lctx_forward = lctx;
  lctx_f_mesh = mesh;
  lctx = lctx_tmp;

  let flag = MeshFlags.TEMP2;

  for (let e of es) {
    let [ne, nv] = mesh.splitEdge(e, 0.5, lctx);

    e.v1.flag &= ~flag;
    ne.v2.flag &= ~flag;
    nv.flag |= flag;
  }

  for (let e of es) {
    for (let v of e.verts) {
      if (!(v.flag & flag)) {
        continue;
      }

      for (let l of v.loops) {
        l.f.flag &= ~flag;
      }

      v.flag &= ~flag;

      for (let e of v.edges) {
        for (let l of e.loops) {
          if (l.f.flag & flag) {
            continue;
          }

          l.f.flag |= flag;

          if (l.next.v === v) {
            l = l.next;
          } else if (l.prev.v === v) {
            l = l.prev;
          }

          let l2 = l.next.next;
          if (l2 !== l.prev && l2 !== l.next && l2 !== l) {
            let l3 = mesh.splitFace(l.f, l, l2, lctx);

            if (l3) {
              l3.f.flag |= flag;
            }
          }
        }
      }
    }
  }

  lctx_f_mesh = lctx_forward = undefined;
}

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

    /*
    for (let i=0; i<2; i++) {
      let v = i ? nv : e.v1;
      for (let f of v.faces) {
        if (f.lists.length > 1 || f.lists[0].length > 3) {
          killfs.add(f);
        }
      }
    }

    for (let f of killfs) {
      if (f.eid >= 0) {
        applyTriangulation(mesh, f, newfs, newes, lctx);
      }
    }//*/

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

export function splitEdgesSmart(mesh, es, lctx) {
  let vs = new Set();

  lctx_forward = lctx;
  lctx_f_mesh = mesh;
  lctx = lctx_tmp;

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

    let nev = mesh.splitEdge(e, 0.5, lctx);

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
      let i2 = (i + pat2[0].length - 1)%pat2[0].length;
      i2 = pat2[0].length - 1 - i2;

      pat2[0][i] = pat[0][i2];
      let t = pat[1][i2];

      if (t >= 0) {
        t = (t + pat2[0].length - 1)%pat2[0].length;
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
        mask |= 1<<i;
      }
    }

    mask |= pat.length<<8;
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
    let mask = tot<<8;

    do {
      if (newvs.has(l.v)) {
        mask |= 1<<mi;
      }

      mi++;
      l = l.next;
    } while (l !== l1);

    if (mask === (1 | 4 | 16 | 64) + (8<<8)) {
      //console.log("quad!");

      let a = l1.prev.prev;
      let b = l1.next.next;

      let l2 = mesh.splitFace(f, l1, l1.next.next.next.next, lctx);
      newfs.add(l2.f);

      let olde = l2.e;
      let nev = mesh.splitEdge(l2.e, 0.5, lctx);

      let [newe, newv] = nev;
      newvs.add(newv);

      mesh.connectVerts(a.v, newv, lctx);
      mesh.connectVerts(b.v, newv, lctx);
      //l2 = mesh.splitFaceAtVerts(l2.f, a.v, newv);

      continue;


      for (let step = 0; step < 2; step++) {
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
    } else if (mask === (1 | 4 | 16) + (6<<8)) {
      let l3 = l1.next.next;
      let l4 = l1.prev;

      newfs.add(mesh.splitFace(l1.f, l1, l1.next.next, lctx).f);
      newfs.add(mesh.splitFace(l3.f, l3, l3.next.next, lctx).f);

      newfs.add(mesh.splitFace(l4.f, l4.prev, l4.next, lctx).f);

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

      for (let i = 1; i < ls.length - 1; i++) {
        let l1 = ls[0], l2 = ls[i], l3 = ls[i + 1];

        let f2 = mesh.makeFace([l1.v, l2.v, l3.v], undefined, undefined, lctx);
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
        newfs.add(mesh.splitFace(f2, l1, l2, lctx).f);
      } else {
        //console.log("pattern error", pat, idx);
      }
    }

    //break;
  }

  lctx_forward = lctx_f_mesh = undefined;

  return {
    newvs : newvs,
    newfs : newfs,
    killfs: killfs
  }
}

import {ccSmooth, subdivide} from '../subsurf/subsurf_mesh.js';
import {Loop, Vertex} from './mesh_types.js';
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
    weight1 = (val - 3)/val;
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
    eco2.mulScalar(1.0/tot3);
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
for (let i = 0; i < wlist.length; i++) {
  wlist[i] = new Array(3);

  for (let j = 0; j < wlist[i].length; j++) {
    wlist[i][j] = 1.0;
  }

  wlist[i].vs = [];
}

//wlist = [[1,1,1],[1,1,1],[1,1,1],[0.7272410983839575,2.4435813347809017,-2.178471789743571],[4.430013563162839,-3.0104949259826426,-0.4227987613820692],[1.326717836316675,0.6465272350430536,-0.9773217315750529],[0.681027649669421,-0.4787632516505709,0.7498618279686324],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]];
//wlist = [[1,1,1],[1,1,1],[1,1,1],[6.646167205089089,-2.8228640166703745,-2.7923176090302224],[4.430013563162839,-3.0104949259826426,-0.4227987613820692],[1.5229585272194894,0.6007029290427015,-1.1367121116859757],[0.8063591339449,-0.7008216471446179,0.9884848294883335],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]];
//wlist = [[1,1,1],[1,1,1],[1,1,1],[3.064527215512514,0.9003473696084594,-2.9824036081532084],[4.430013563162839,-3.0104949259826426,-0.4227987613820692],[1.4373421440850709,0.18100604726428346,-0.6684819059378884],[0.46086543509170635,0.7658991176565205,-0.256928076403811],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]]
wlist = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [-6.6919689877574235, 7.7449541418130865, -5.255286055420358],
         [2.9252062698775627, -1.9281125217402386, -2.4574709914875257],
         [3.388478383795898, -2.3908329266981805, 4.022667641869909],
         [0.08234435848112126, 0.9784174088989873, 0.1754479515452284], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1],
         [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1],
         [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1],
         [1, 1, 1]];

for (let ws of wlist) {
  ws.vs = [];
}

window.__last1 = new Map();

let timer = undefined;
window.__solve = function () {
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

export function meshSubdivideTest(mesh, faces = mesh.faces) {
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

  mesh.regenTessellation();
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

    for (let j = 0; j < 3; j++) {
      v[j] += (util.random() - 0.5)*len;
      v.flag |= MeshFlags.UPDATE;
    }
  }

  mesh.regenTessellation();
  mesh.recalcNormals();

  //mesh.regenRender();
  //return;

  window._meshcopy = copy;

  //let ret1 = subdivide(mesh, faces, true);
  let ret2 = subdivide(copy, faces2, false);

  let f;

  let myconsole = new util.SmartConsoleContext("solve");
  myconsole.timeIntervalAll = 150;

  function solve(err, ws, steps = 1550, val) {
    let df = 0.0005;
    let gs = new Array(ws.length);

    let startws1 = new Array(ws.length);
    for (let i = 0; i < ws.length; i++) {
      startws1[i] = ws[i];
    }

    let starterr = err();

    let steps2 = 5;
    let fac = 1.0;

    let startws = new Array(ws.length);

    let stepi = 0, step = -1;

    let order = new Array(ws.length);

    outer: while (stepi < steps) {
      step++;
      stepi++;

      let r = err();

      f = stepi/steps;
      let f2 = 0.25; //Math.exp(-f*2.0)*0.25;

      let wmin = -1.0, wmax = 1.0;

      for (let i = 0; i < order.length; i++) {
        order[i] = i;
      }
      for (let i = 0; i < order.length; i++) {
        let t = order[i];
        let ri = ~~(util.random()*order.length*0.999999);

        order[i] = order[ri];
        order[ri] = t;
      }

      for (let i of order) {
        startws[i] = ws[i];

        ws[i] += (util.random() - 0.5)*f2*r;
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
          rfac = 0.15*r1/totg;

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
          for (let j = 0; j < ws.length; j++) {
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

    let s = '' + val + '['
    for (let i = 0; i < ws.length; i++) {
      if (i > 0) {
        s += ", ";
      }

      s += ws[i].toFixed(3);
    }
    s += ']';

    if (err() > starterr) {
      for (let i = 0; i < ws.length; i++) {
        ws[i] = startws1[i];
      }
    }

    console.log("error:", err().toFixed(3), s, "val", val, "gfac", f);
  }

  mesh.regenTessellation();
  copy.regenTessellation();

  copy.recalcNormals();
  mesh.recalcNormals();

  for (let i = 0; i < wlist.length; i++) {
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
  for (let wi = 0; wi < wlist.length; wi++) {
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

  mesh.regenTessellation();
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

  mesh.regenTessellation();
  mesh.recalcNormals();
  mesh.regenRender();
  mesh.graphUpdate();

  return;

  for (let v2 of mesh.verts) {
    break;
    let v = copy.eidmap[v2.eid];

    function rand() {
      let f = util.random();

      return f - 0.5;
    }

    if (v && v instanceof Vertex) {
      let val = v.edges.length;
      let startws = new Array(ws.length);

      let ws2;

      function error() {
        for (let i = 0; i < startws.length; i++) {
          //startws[i] = ws2[i];
        }

        //ws2[0] = undefined;
        //ws2[1] = undefined;
        //ws2[2] = undefined;
        //ws2[3] = undefined;
        //ws2[4] = undefined;

        let co = ccSmooth2(v, ws);

        for (let i = 0; i < startws.length; i++) {
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

  mesh.regenTessellation();
  mesh.recalcNormals();
  mesh.regenRender();
  mesh.regenBVH();
  mesh.regenElementsDraw();
}







