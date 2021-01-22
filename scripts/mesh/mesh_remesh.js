import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshTypes, MeshFlags, LogContext, MeshError} from './mesh_base.js';
import {CDFlags, CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {applyTriangulation} from './mesh_tess.js';
import {
  dissolveEdgeLoops,
  fixManifold, getEdgeLoop, trianglesToQuads, triangulateFan, triangulateMesh, vertexSmooth
} from './mesh_utils.js';

export const Remeshers = {};

export const RemeshClasses = [];
export const RemeshMap = {};

let cls_idgen = 0;

export class Remesher {
  constructor(mesh, lctx = undefined) {
    this.mesh = mesh;
    this.lctx = lctx;
    this.done = false;
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

  step() {

  }

  finish() {

  }
}

export class UniformTriRemesher extends Remesher {
  constructor(mesh, lctx = undefined) {
    super(mesh, lctx);

    this.lctx = lctx;
  }

  static remeshDefine() {
    return {
      typeName: "UNIFORM_TRI"
    }
  }

  start() {
    let mesh = this.mesh;
    console.log("uniform remesh!");

    //triangulate
    for (let f of new Set(mesh.faces)) {
      if (f.lists.length > 1 || f.lists[0].length > 3) {
        applyTriangulation(mesh, f, undefined, undefined, this.lctx);
      }
    }
  }

  step() {
    this.done = true;

    let lctx = this.lctx;
    let mesh = this.mesh;

    if (mesh.edges.length === 0) {
      return;
    }

    let max = mesh.edges.length;

    let es = [];
    let ws = [];

    let elen = 0;
    let tot = 0;

    for (let e of mesh.edges) {
      let w = e.v1.vectorDistance(e.v2);
      elen += w;
      tot++;

      es.push(e);
    }

    elen /= tot;

    let i = 0;

    for (let e of mesh.edges) {
      let w = e.v1.vectorDistance(e.v2);

      ws.push(w);
      e.index = i++;
    }

    es.sort((a, b) => ws[a.index] - ws[b.index]);

    elen *= 0.9;

    for (let i = 0; i < max; i++) {
      let e = es[i];

      if (e.eid < 0) {
        continue; //edge was already deleted
      }

      let w = e.v1.vectorDistance(e.v2);

      if (ws[i] >= elen || w >= elen) {
        continue;
      }

      mesh.collapseEdge(e, lctx);
    }

    let co = new Vector3();

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

    for (let i = 0; i < 55; i++) {
      let stop = true;

      for (let v of mesh.verts) {
        if (v.valence === 0) {
          mesh.killVertex(v, undefined, lctx);
          stop = false;
          continue;
        } else if (v.valence < 5) {
          let bad = false;

          for (let f of v.faces) {
            if (f.lists[0].length !== 3) {
              bad = true;
            }
          }

          if (!bad) {
            mesh.dissolveVertex(v, lctx);
            stop = false;
            continue;
          }
        }
      }

      if (stop) {
        break;
      }
    }

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

    for (let v of mesh.verts) {

      let tot = 0.0;
      co.zero();

      for (let v2 of v.neighbors) {
        co.add(v2);
        tot++;
      }

      if (tot > 0.0) {
        co.mulScalar(1.0/tot);

        v.interp(co, 0.5);
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

    if (v1.valence+v3.valence < v2.valence + v4.valence) {
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
      co.load(v1).add(v2).add(v3).mulScalar(1.0 / 3.0);

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

export function cleanupQuads(mesh, faces, lctx) {
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

    for (let i=0; i<2; i++) {
      vertexSmooth(mesh, mesh.verts, 0.5, 0.5);
    }

    mesh.recalcNormals();

    triangulateMesh(mesh, mesh.faces, lctx);

    for (let i=0; i<6; i++) {
      vertexSmooth(mesh, mesh.verts, 0.5, 0.5);
    }

    trianglesToQuads(mesh, mesh.faces, undefined, lctx);
    mesh.recalcNormals();

    for (let i=0; i<6; i++) {
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
  function vsmooth(v, fac=0.5) {
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
    let lctx = this.lctx;
    let mesh = this.mesh;

    if (this.i === 0) {
      super.step();

      mesh.regenTesellation();
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

    this.mesh.regenTesellation();
  }
}

Remesher.register(UniformQuadRemesher);

export function remeshMesh(mesh, remesher = Remeshers.UNIFORM_TRI, lctx = undefined) {
  fixManifold(mesh, lctx);

  let cls = RemeshMap[remesher];

  let m = new cls(mesh, lctx);

  m.start();

  while (!m.done) {
    m.step();
  }

  m.finish();
}
