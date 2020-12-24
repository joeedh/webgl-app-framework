import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {ToolOp, ToolMacro, ToolFlags, UndoFlags} from '../path.ux/scripts/pathux.js';
import {TranslateOp} from "../editors/view3d/transform/transform_ops.js";
import {dist_to_line_2d, winding} from '../path.ux/scripts/util/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {MeshFlags, MeshTypes, MeshFeatures} from './mesh_base.js';
import {MeshOp} from './mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";
import {splitEdgesSmart} from "./mesh_subdivide.js";
import {GridBase, Grid, gridSides} from "./mesh_grids.js";
import {CustomDataElem} from "./customdata.js";

export function* walkFaceLoop(e) {
  let l = e.l;

  if (!l) {
    return;
  }

  let visit = new WeakSet();
  let _i = 0;

  while (1) {
    if (_i++ > 1000000) {
      console.error("infinite loop detected");
      break;
    }
    if (visit.has(l)) {
      break;
    }

    visit.add(l);

    l = l.prev.prev;
    l = l.radial_next;

    if (l === l.radial_next) {
      break;
    }
  }

  _i = 0;
  visit = new WeakSet();

  if (l === l.radial_next) {
    l = l.next.next;
  }

  do {
    if (_i++ > 1000000) {
      console.error("infinite loop detected");
      break;
    }

    if (visit.has(l)) {
      break;
    }

    yield l;

    visit.add(l)
    if (l === l.radial_next) {
      break;
    }
    l = l.radial_next.next.next;
  } while (_i++ < 1000000);
}

let _tritemp = new Array(3);

export function triangulateMesh(mesh, faces = mesh.faces) {
  let tri = _tritemp;

  if (!(faces instanceof Set)) {
    faces = new Set(faces);
  }

  let ret = [];
  let ltris = mesh.loopTris;

  for (let i = 0; i < ltris.length; i += 3) {
    let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

    if (faces.has(l1.f)) {
      tri.length = 3;
      tri[0] = l1.v;
      tri[1] = l2.v;
      tri[2] = l3.v;

      console.log(l1, l2, l3);
      let f2 = mesh.makeFace(tri);
      let l = f2.lists[0].l;

      ret.push(f2);

      mesh.copyElemData(f2, l1.f);
      mesh.copyElemData(l, l1);
      mesh.copyElemData(l.next, l2);
      mesh.copyElemData(l.prev, l3);
    }
  }

  for (let f of faces) {
    mesh.killFace(f);
  }

  return ret;
}

export function bisectMesh(mesh, faces, vec, offset = new Vector3()) {
  faces = new Set(faces);

  vec = new Vector3(vec);
  vec.normalize();

  let mat = new Matrix4();

  let up = new Vector3();
  let ax = Math.abs(vec[0]), ay = Math.abs(vec[1]), az = Math.abs(vec[2]);
  if (ax >= ay && ax >= az) {
    up[1] = 1.0;
    up[2] = 1.0;
  } else if (ay >= ax && ay >= az) {
    up[0] = 1.0;
    up[2] = 1.0;
  } else {
    up[0] = 1.0;
    up[1] = 1.0;
  }

  console.log("Bisect mesh!", vec, up);
  up = up.cross(vec).normalize();

  mat.makeNormalMatrix(vec, up);
  mat.translate(offset[0], offset[1], offset[2]);

  let imat = new Matrix4(mat);

  mat.invert();

  console.log("" + mat);

  let p1 = new Vector3();
  let p2 = new Vector3();
  let p3 = new Vector3();
  let p4 = new Vector3();
  let p5 = new Vector3();
  let p6 = new Vector3();
  let p7 = new Vector3();

  let ltris = mesh.loopTris;
  let faces2 = new Set();
  let edges = new Set();
  let emap = new Map();
  let edges2 = new Set();

  let tris = [];

  let sign = (f) => f >= 0 ? 1 : -1;
  let check = (a, b) => sign(a[2]) !== sign(b[2]) && Math.abs(a[2] - b[2]) > 0.001;

  for (let f of faces) {
    for (let list of f.lists) {
      for (let l of list) {
        p1.load(l.v).multVecMatrix(mat);
        p2.load(l.next.v).multVecMatrix(mat);

        if (check(p1, p2)) {
          edges.add(l.e);
        }
      }
    }
  }

  //faces2 = new Set(triangulateMesh(mesh, faces2));

  let tmp1 = [0, 0, 0];
  let tmp2 = [0, 1, 2];
  let tmp3 = [0, 0, 0];
  let vtmp = [0, 0, 0];
  let vtmp2 = [0, 0, 0, 0];

  for (let l of mesh.loops) {
    let v1 = l.v, v2 = l.next.v;
    let e = l.e;

    if ((v1 !== e.v1 || v2 !== e.v2) && (v1 !== e.v2 || v2 !== e.v1)) {
      console.log("loop error!", l.eid);
    }
  }

  let verts2 = new Set();

  //*
  for (let e of edges) {
    p1.load(e.v1).multVecMatrix(mat);
    p2.load(e.v2).multVecMatrix(mat);

    if (!check(p1, p2)) {
      continue;
    }

    //console.log(p1[2], p2[2]);

    p2.sub(p1);
    let t = -p1[2]/p2[2];

    p1.addFac(p2, t);
    p1[2] = 0.0;
    p1.multVecMatrix(imat);

    //let v = mesh.makeVertex(p1);
    let nev = mesh.splitEdge(e, t);
    emap.set(e, nev[1]);

    verts2.add(nev[1]);
    edges2.add(nev[0]);
  }

  for (let f of faces) {
    for (let list of f.lists) {
      let l1, l2;

      for (let l of list) {
        if (verts2.has(l.v)) {
          if (!l1) {
            l1 = l;
          } else if (l !== l1.prev && l !== l1.next) {
            l2 = l;
            break;
          }
        }
      }

      if (l1 && l2) {
        console.log("SPLIT!");
        mesh.splitFace(f, l1, l2);
      }
    }
  }

  return {
    newVerts: verts2,
    newEdges: edges2
  };
}

export function duplicateMesh(mesh, geom) {
  let vs = new Set();
  let fs = new Set();
  let es = new Set();

  let sets = {
    [MeshTypes.VERTEX]: vs,
    [MeshTypes.EDGE]  : es,
    [MeshTypes.FACE]  : fs
  };

  for (let e of geom) {
    if (e.type === MeshTypes.LOOP) {
      continue;
    }

    sets[e.type].add(e);
  }

  let newvs = [];
  let newmap = new Map();
  let oldmap = new Map();

  for (let f of fs) {
    for (let list of f.lists) {
      for (let l of list) {
        vs.add(l.v);
        es.add(l.e);
      }
    }
  }

  for (let e of es) {
    vs.add(e.v1);
    vs.add(e.v2);
  }

  for (let v of vs) {
    v.index = newvs.length;

    let v2 = mesh.makeVertex(v);
    mesh.copyElemData(v2, v);

    newvs.push(v2);
    newmap.set(v, v2);
    oldmap.set(v2, v);
  }

  let newes = [];

  for (let e of es) {
    let v1 = newvs[e.v1.index];
    let v2 = newvs[e.v2.index];

    e.index = newes.length;

    let e2 = mesh.makeEdge(v1, v2);
    mesh.copyElemData(e2, e);

    newmap.set(e, e2);
    oldmap.set(e2, e);
    newes.push(e2);
  }

  let newfs = [];

  for (let f of fs) {
    let vs = [];
    let ls = [];

    let listi = 0;
    let f2;

    for (let list of f.lists) {
      vs.length = 0;
      ls.length = 0;

      for (let l of list) {
        vs.push(newvs[l.v.index]);
        ls.push(l);
      }

      let list2;
      if (listi === 0) {
        f2 = mesh.makeFace(vs);

        newfs.push(f2);
        oldmap.set(f, f2);
        newmap.set(f2, f);

        list2 = f2.lists[0];
      } else {
        mesh.makeHole(f, vs);
        list2 = f2.lists[listi];
      }

      let l = list2.l;
      for (let i = 0; i < ls.length; i++) {
        mesh.copyElemData(l, ls[i]);
        l = l.next;
      }

      listi++;
    }
  }

  return {
    newVerts: newvs,
    newEdges: newes,
    newFaces: newfs,
    oldToNew: newmap,
    newToOld: oldmap
  }
}

/**
 mergeMap maps deleting vertices to ones that will be kept.

 */
export function weldVerts(mesh, mergeMap) {
  console.log("welding", mergeMap);

  let copy = mesh.copy();

  let mfs = new Set();
  let mes = new Set();

  let vs = new Set(mergeMap.keys());
  let deles = new Set();

  let mapvs = new Set(mergeMap.values());
  for (let v of new Set(vs)) {
    if (mapvs.has(v)) {
      console.warn("bad weld vert", v);
      vs.delete(v);
    }
  }

  //tag edges
  for (let v of vs) {
    let nv = mergeMap.get(v);

    for (let e of v.edges) {
      if (e.otherVertex(v) === nv) {
        deles.add(e);
        e.v1.edges.remove(e);
        e.v2.edges.remove(e);
        e.index = 0;
      } else {
        mes.add(e);
        e.index = 1;

        for (let f of e.faces) {
          mfs.add(f);
        }
      }
    }
  }

  //unlink face loops
  for (let f of mfs) {
    for (let list of f.lists) {
      for (let l of list) {
        mesh._radialRemove(l.e, l);
      }
    }
  }

  for (let e of mes) {
    let v1 = mergeMap.get(e.v1);
    let v2 = mergeMap.get(e.v2);

    if (v1 === v2) {
      if (e.v1.edges.indexOf(e) >= 0) {
        e.v1.edges.remove(e);
      }

      if (e.v2.edges.indexOf(e) >= 0) {
        e.v2.edges.remove(e);
      }

      e.index = 0;
      deles.add(e);
    }

    if (v1) {
      e.v1 = v1;

      if (e.index) {
        e.v1.edges.push(e);
      }
    }

    if (v2) {
      e.v2 = v2;

      if (e.index) {
        e.v2.edges.push(e);
      }
    }
  }

  let fs2 = new Set();

  for (let f of mfs) {
    for (let list of new Set(f.lists)) {
      let l = list.l;
      let _i = 0;

      let vset = new Set();

      do {
        if (_i++ > 1000) {
          console.warn("infinite loop error");
          break;
        }

        let nv = mergeMap.get(l.v);
        if (nv) {
          l.v = nv;
        }

        l = l.next;
      } while (l !== list.l);

      l = list.l
      do {
        if (_i++ > 1000) {
          console.warn("infinite loop error");
          break;
        }

        if (vset.has(l.v)) {
          l.prev.next = l.next;
          l.next.prev = l.prev;
          delete mesh.eidmap[l.eid];
          mesh.loops.remove(l);
          l.eid = -1;

          if (list.l === l) {
            list.l = l.next;
          }

          list.length--;
        }

        vset.add(l.v);

        l = l.next;
      } while (l !== list.l);

      list._recount();
      if (list.length < 3) {
        f.lists.remove(list);
      }
    }

    if (f.lists.length === 0) {
      delete mesh.eidmap[f.eid];
      mesh.faces.remove(f);
      f.eid = -1;
    } else {
      fs2.add(f);
    }

    for (let v of vs) {
      if (v.eid >= 0) {
        mesh.verts.remove(v);
        delete mesh.eidmap[v.eid];
      }
      v.eid = -1;
    }

    for (let e of deles) {
      delete mesh.eidmap[e.eid];
      mesh.edges.remove(e);
      e.eid = -1;
    }
  }

  for (let f of fs2) {
    for (let list of f.lists) {
      for (let l of list) {
        l.e = mesh.makeEdge(l.v, l.next.v, true);
      }

      for (let l of list) {
        mesh._radialInsert(l.e, l);
      }
    }
  }

  let msgout = [""];
  if (!mesh.validateMesh(msgout)) {
    console.error(msgout[0]);

    mesh.swapDataBlockContents(copy);
  }
}


export function symmetrizeMesh(mesh, faces, axis, sign, mergeThreshold = 0.00001) {
  let vs = new Set();
  let es = new Set();

  for (let f of faces) {
    for (let list of f.lists) {
      for (let l of list) {
        vs.add(l.v);
        es.add(l.e);
      }
    }
  }

  let vec = new Vector3();
  vec[axis] = sign;

  bisectMesh(mesh, faces, vec);
  let vs2 = new Set();
  let mergeMap = new Map();

  for (let v of vs) {
    if (Math.sign(v[axis]) !== Math.sign(sign) && Math.abs(v[axis]) > 0.0001) {
      for (let f of v.faces) {
        faces.delete(f);
      }

      mesh.killVertex(v);
    } else {
      vs2.add(v);
    }
  }

  let geom = new Set();

  for (let v of vs2) {
    for (let e of v.edges) {
      geom.add(e);

      for (let l of e.loops) {
        geom.add(l.f);
      }
    }
  }

  let ret = duplicateMesh(mesh, geom);
  for (let v of ret.newVerts) {
    v[axis] = -v[axis];

    if (Math.abs(v[axis]) < mergeThreshold) {
      mergeMap.set(v, ret.newToOld.get(v));
    }
  }

  for (let f of ret.newFaces) {
    mesh.reverseWinding(f);
  }

  weldVerts(mesh, mergeMap);
}

//export function rotateEdge(mesh, e) {
//}

export function flipLongTriangles(mesh, faces) {
  let es = new Set();
  let faces2 = new Set();

  for (let f of faces) {
    let count = 0;
    for (let l of f.loops) {
      count++;
    }

    if (count !== 3 || f.lists.length > 1) {
      continue;
    }

    faces2.add(f);
  }

  faces = faces2;

  for (let f of faces) {
    for (let l of f.loops) {
      if (l.radial_next !== l && faces.has(l.radial_next.f)) {
        es.add(l.e);
      }
    }
  }

  console.log(es, faces);
  let deles = new Set();

  for (let e of es) {
    let l1 = e.l;
    let l2 = e.l.radial_next;

    let ok = true;

    let w1 = winding(l1.v, l2.prev.v, l1.prev.v);
    let w2 = winding(l1.prev.v, l2.prev.v, l1.next.v);

    ok = ok && w1 === w2;
    ok = ok && l1.prev.v.vectorDistanceSqr(l2.prev.v) < e.v1.vectorDistanceSqr(e.v2);

    if (ok) {
      es.delete(e);

      let f1 = mesh.makeTri(l1.v, l2.prev.v, l1.prev.v);
      let f2 = mesh.makeTri(l1.prev.v, l2.prev.v, l1.next.v);

      let e2 = mesh.getEdge(l1.prev.v, l2.prev.v);

      mesh.copyElemData(f1, l1.f);
      mesh.copyElemData(f2, l2.f);
      mesh.copyElemData(e2, e);

      deles.add(e);

      let lb1 = f1.lists[0].l;
      let lb2 = f2.lists[0].l;

      mesh.copyElemData(lb1, lb1);
      mesh.copyElemData(lb1.next, l2.prev);
      mesh.copyElemData(lb1.prev, l1.prev);

      mesh.copyElemData(lb2, l1.prev);
      mesh.copyElemData(lb2.next, l2.prev);
      mesh.copyElemData(lb2.prev, l1.next);

      f1.calcNormal();
      f2.calcNormal();

      e.v1.flag |= MeshFlags.UPDATE;
      e.v2.flag |= MeshFlags.UPDATE;
      mesh.killEdge(e);
    }
  }

  for (let e of deles) {
    e.v1.flag |= MeshFlags.UPDATE;
    e.v2.flag |= MeshFlags.UPDATE;

    mesh.killEdge(e);
  }

  console.log("done");
}

export const TriQuadFlags = {
  NICE_QUADS: 1,
  COLOR     : 2,
  SEAM      : 4,
  UVS       : 8,
  DEFAULT   : 1 | 4
};

export function trianglesToQuads(mesh, faces, flag=TriQuadFlags.DEFAULT) {
  let es = new Set();
  let faces2 = new Set();

  for (let f of faces) {
    let count = 0;
    for (let l of f.loops) {
      count++;
    }

    if (count !== 3 || f.lists.length > 1) {
      continue;
    }

    faces2.add(f);
  }
  faces = faces2;

  for (let f of faces) {
    for (let l of f.loops) {
      if (l.radial_next !== l && faces.has(l.radial_next.f)) {
        es.add(l.e);
      }
    }
  }

  let cd_color = mesh.verts.customData.getLayerIndex("color");
  let cd_uv = mesh.loops.customData.getLayerIndex("uv");
  let have_color = cd_color >= 0;
  let have_uv = cd_uv >= 0;

  let t1 = new Vector3();
  let t2 = new Vector3();
  let t3 = new Vector3();

  let dot3 = (v1, v2, v3) => {
    t1.load(v1).sub(v2).normalize();
    t2.load(v3).sub(v2).normalize();

    return t1.dot(t2);
  }

  let errorNiceQuad = (e, v1, v2, v3, v4) => {
    let th1 = dot3(v4, v1, v2);
    let th2 = dot3(v1, v2, v3);
    let th3 = dot3(v2, v3, v4);
    let th4 = dot3(v3, v4, v1);

    return th1**2 + th2**2 + th3**2 + th4**2;
  }

  if ((flag & TriQuadFlags.UVS) && !have_uv) {
    flag &= ~TriQuadFlags.UVS;
  }

  if ((flag & TriQuadFlags.COLOR) && !have_color) {
    flag &= ~TriQuadFlags.COLOR;
  }

  let errorSeam = (e, v1, v2, v3, v4) => {
    return e.flag & MeshFlags.SEAM ? 100000 : 0.0;
  }

  let errorUv = (e, v1, v2, v3, v4) => {
    let l1 = e.l, l2 = e.l.radial_next;

    let u1 = l1.customData[cd_uv].uv;
    let u2 = l2.customData[cd_uv].uv;
    let u3 = l1.next.customData[cd_uv].uv;
    let u4 = l1.next.radial_next.customData[cd_uv].uv;

    return u1.vectorDistanceSqr(u2) + u3.vectorDistanceSqr(u4);
  }

  let errorColor = (e, v1, v2, v3, v4) => {
    let l1 = e.l, l2 = e.l.radial_next;

    let u1 = l1.v.customData[cd_color].color;
    let u2 = l2.v.customData[cd_color].color;
    let u3 = l1.next.v.customData[cd_color].color;
    let u4 = l1.next.radial_next.v.customData[cd_color].color;

    return u1.vectorDistanceSqr(u2) + u3.vectorDistanceSqr(u4);
  }

  let funcs1 = {
    [TriQuadFlags.COLOR] : errorColor,
    [TriQuadFlags.UVS] : errorUv,
    [TriQuadFlags.SEAM] : errorSeam,
    [TriQuadFlags.NICE_QUADS] : errorNiceQuad
  };

  let funcs = [];

  for (let k in TriQuadFlags) {
    if (k === "DEFAULT") {
      continue;
    }

    let v = TriQuadFlags[k];

    if (flag & v) {
      funcs.push(funcs1[v]);
    }
  }

  let error = (e, v1, v2, v3,v4) => {
    let sum = 0.0;
    for (let f of funcs) {
      sum += f(e, v1, v2, v3, v4);
    }

    return sum;
  }

  let i = 0;
  let edges = [];
  for (let e of es) {
    edges.push(i++);
  }

  let ETOT = 5;

  let edata = [];
  for (let e of es) {
    let la = e.l, lb = e.l.radial_next;

    let l4 = la.prev, l3 = la.next, l2 = lb.prev, l1 = la;

    edata.push(e);
    edata.push(l1);
    edata.push(l2);
    edata.push(l3);
    edata.push(l4);
  }

  let ed = edata;
  edges.sort((a, b) => {
    a *= ETOT;
    b *= ETOT;
    let e1 = ed[a]
    let e2 = ed[b];

    let w1 = error(e1, ed[a+1].v, ed[a+2].v, ed[a+3].v, ed[a+4].v);
    let w2 = error(e2, ed[b+1].v, ed[b+2].v, ed[b+3].v, ed[b+4].v);

    //console.log(w1, w2);
    return w1 - w2;
  });

  let ws = [0.5, 0.5];
  let fs = [0, 0,];

  for (let i of edges) {
    i *= ETOT;

    let e = edata[i];

    if (!e.l || !faces.has(e.l.f) || !faces.has(e.l.radial_next.f)) {
      continue;
    }

    let l1 = edata[i+1], l2 = edata[i+2], l3 = edata[i+3], l4 = edata[i+4];

    let f1 = e.l.f, f2 = e.l.radial_next.f;

    faces.delete(f1);
    faces.delete(f2);

    fs[0] = f1;
    fs[1] = f2;

    let f = mesh.makeQuad(l1.v, l2.v, l3.v, l4.v);

    let l = f.lists[0].l;

    mesh.copyElemData(f, f1);
    mesh.faces.customDataInterp(f, fs, ws);

    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.next.next, l3);
    mesh.copyElemData(l.prev, l4);

    mesh.killEdge(e);
  }
}
