import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {ToolOp, ToolMacro, ToolFlags, UndoFlags, COLINEAR_ISECT} from '../path.ux/scripts/pathux.js';
import {TranslateOp} from "../editors/view3d/transform/transform_ops.js";
import {dist_to_line_2d, winding} from '../path.ux/scripts/util/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';

import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {MeshFlags, MeshTypes, MeshFeatures, ReusableIter} from './mesh_base.js';
import {MeshOp} from './mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";
import {splitEdgesSmart} from "./mesh_subdivide.js";
import {GridBase, Grid, gridSides} from "./mesh_grids.js";
import {CustomDataElem} from "./customdata.js";

import {getArrayTemp} from './mesh_base.js';

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

export function triangulateFan(mesh, f, newfaces=undefined) {
  let startl = f.lists[0].l;
  let l = startl.next;

  do {
    let v1 = startl.v;
    let v2 = l.v;
    let v3 = l.next.v;

    let tri = mesh.makeTri(v1, v2, v3);
    let l2 = tri.lists[0].l;

    mesh.copyElemData(l2, startl);
    mesh.copyElemData(l2.next, l);
    mesh.copyElemData(l2.prev, l.next);
    mesh.copyElemData(tri, f);

    if (newfaces !== undefined) {
      newfaces.push(tri);
    }

    l = l.next;
  } while (l !== startl.prev);

  mesh.killFace(f);
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
        //console.log("SPLIT!");
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
  let vs = new Set(mergeMap.keys());
  let es = new Set();
  let fs = new Set();

  for (let v of mergeMap.values()) {
    v.flag |= MeshFlags.UPDATE;
    vs.add(v);
  }

  for (let v of vs) {
    for (let e of v.edges) {
      es.add(e);

      for (let l of e.loops) {
        fs.add(l.f);
      }
    }
  }

  //unlink loops from edges;
  for (let f of fs) {
    for (let l of f.loops) {
      mesh._radialRemove(l.e, l);
    }
  }

  let killes = new Set();

  //substitute merge verts into edges
  for (let e of es) {
    let v1 = mergeMap.get(e.v1);
    let v2 = mergeMap.get(e.v2);


    if (v1 && v2) {
      killes.add(e);
    } else if (v1) {
      killes.add(e);

      let e2 = mesh.ensureEdge(v1, e.v2);
      mesh.copyElemData(e2, e);
    } else if (v2) {
      killes.add(e);

      let e2 = mesh.ensureEdge(e.v1, v2);
      mesh.copyElemData(e2, e);
    }
  }

  //substitute merge verts into faces
  for (let f of fs) {
    for (let l of f.loops) {
      let v2 = mergeMap.get(l.v);
      if (v2) {
        l.v = v2;
      }
    }
  }

  //eliminate duplicate verts
  for (let f of fs) {
    let flag = MeshFlags.TEMP2;
    let flag2 = MeshFlags.TEMP3;

    for (let l of f.loops) {
      l.flag &= ~flag;
      l.v.flag &= ~flag;
    }

    for (let list of new Set(f.lists)) {
      let l = list.l, _i = 0;

      for (let l of list) {
        l.v.flag &= ~flag2;
      }

      do {
        if (l.v.flag & (flag2|flag)) {
          if (!(l.v.flag & flag2)) {
            //hrm, holes are sharing verts, what to do.  the same?
          }

          l.prev.next = l.next;
          l.next.prev = l.prev;

          l.e = undefined; //do not allow killLoop to mess with l.e
          this._killLoop(l);

          if (l === list.l) {
            list.l = l.next;
          }

          if (l === list.l) {
            list.l = undefined;
            list.length = 0;
            break;
          } else {
            list.length--;
          }
        }
        l.v.flag |= flag;
        l.v.flag |= flag2;

        l = l.next;
        if (_i++ > 1000000) {
          console.warn("infinite loop error");
          break;
        }
      } while (l !== list.l);

      if (list.length === 0) {
        if (list === f.lists[0]) {
          //delete entire face
          mesh.killFace(f);
          continue;
        } else {
          f.lists.remove(list);
        }
      }
    }
  }

  //remove deleted faces
  for (let f of fs) {
    if (f.eid < 0) {
      continue;
    }

    let bad = f.lists.length === 0;
    for (let list of f.lists) {
      list._recount();
      bad = bad || list.length < 3;
    }

    if (bad) {
      mesh.killFace(f);
      continue;
    }
  }

  //relink face loops to edges
  for (let f of fs) {
    if (f.eid < 0) {
      continue;
    }

    for (let l of f.loops) {
      l.e = mesh.ensureEdge(l.v, l.next.v);
      mesh._radialInsert(l.e, l);
    }
  }

  //remove deleted edges
  for (let e of killes) {
    if (e.eid >= 0) {
      mesh.killEdge(e);
    }
  }

  for (let v of mergeMap.keys()) {
    if (v.eid >= 0) {
      mesh.killVertex(v);
    }
  }

  mesh.fixDuplicateFaces(false);
}

export function weldVerts_old(mesh, mergeMap) {
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

    let bad = f.lists.length === 0;
    let count = 0;

    for (let l of f.loops) {
      count++;
    }

    bad = bad || count < 3;

    if (bad) {
      delete mesh.eidmap[f.eid];
      mesh.faces.remove(f);
      f.eid = -1;
    } else {
      for (let list of f.lists) {
        list._recount();
      }
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
    let count = 0;

    for (let l of f.loops) {
      count++;
    }

    if (count < 3) {
      mesh.killFace(f);
      continue;
    }

    for (let list of f.lists) {
      for (let l of list) {
        l.e = mesh.ensureEdge(l.v, l.next.v);
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


export function symmetrizeMesh(mesh, faces, axis, sign, mergeThreshold = 0.0001) {
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

  console.log("mergeMap", mergeMap);

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

export function trianglesToQuads(mesh, faces, flag=TriQuadFlags.DEFAULT, lctx) {
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
    if (!f) {
      continue;
    }

    if (lctx) {
      lctx.newFace(f);
    }

    let l = f.lists[0].l;

    mesh.copyElemData(f, f1);
    mesh.faces.customDataInterp(f, fs, ws);

    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.next.next, l3);
    mesh.copyElemData(l.prev, l4);

    mesh.killEdge(e, lctx);
  }
}

export function recalcWindings(mesh, faces=mesh.faces) {
  faces = new Set(faces);

  let shells = [];

  let stack = [];

  let flag = MeshFlags.TEMP3;

  for (let f of faces) {
    f.flag &= ~flag;
  }

  for (let f of faces) {
    if (f.flag & flag) {
      continue;
    }

    stack.length = 0;
    stack.push(f);
    f.flag |= flag;

    let shell = [];

    while (stack.length > 0) {
      let f2 = stack.pop();

      shell.push(f2);
      f2.flag |= flag;

      for (let l of f2.loops) {
        let lr = l.radial_next;
        let _i = 0;

        while (lr !== l) {
          if (!(lr.f.flag & flag) && faces.has(lr.f)) {
            stack.push(lr.f);
            lr.f.flag |= flag;
          }

          lr = lr.radial_next;

          if (_i++ > 100) {
            console.error("Infinite loop error");
            break;
          }
        }
      }
    }

    shell = new Set(shell);
    shells.push(shell);
  }

  console.log("shells:", shells);

  for (let shell of shells) {
    let cent = new Vector3();
    let tot = 0.0;

    for (let f of shell) {
      cent.add(f.cent);

      tot++;
    }

    if (!tot) {
      continue;
    }

    cent.mulScalar(1.0 / tot);
    let maxdis = undefined;
    let maxf = undefined;

    for (let f of shell) {
      let dis = f.cent.vectorDistance(cent);

      if (maxdis === undefined || dis > maxdis) {
        maxf = f;
        maxdis = dis;
      }

      f.flag &= ~flag;
    }

    stack.length = 0;

    maxf.calcNormal();
    let n = new Vector3(maxf.cent).sub(cent).normalize();

    if (maxf.no.dot(n) < 0) {
      mesh.reverseWinding(maxf);
    }

    stack.push(maxf);
    maxf.flag |= flag;

    while (stack.length > 0) {
      let f = stack.pop();

      for (let l of f.loops) {
        let lr = l.radial_next;

        let _i = 0;

        while (lr !== l) {
          let ok = lr !== l && shell.has(lr.f);
          ok = ok && !(lr.f.flag & flag);

          let next = lr.radial_next;

          if (ok) {
            lr.f.flag |= flag;
            stack.push(lr.f);

            if (lr.v === l.v) {
              mesh.reverseWinding(lr.f);
            }
          }

          if (_i++ > 100) {
            console.error("Infinite loop error", lr, l.eid);
            break;
          }

          lr = next;
        }
      }
    }
  }
}

//XXX untested
export function splitNonManifoldEdge(mesh, e, l1, l2, lctx) {
  if (!e.l || e.l === e.l.radial_next || e.l === e.l.radial_next.radial_next) {
    return;
  }

  let count = 0;
  for (let l of e.loops) {
    count++;
  }

  let v1 = mesh.makeVertex(e.v1);
  let v2 = mesh.makeVertex(e.v2);

  if (lctx) {
    lctx.newVertex(v1);
    lctx.newVertex(v2);
  }

  v1.no.load(e.v1.no);
  v2.no.load(e.v2.no);

  mesh.copyElemData(v1, e.v1);
  mesh.copyElemData(v2, e.v2);

  let e2 = mesh.makeEdge(v1, v2);
  mesh.copyElemData(e2, e);

  if (lctx) {
    lctx.newEdge(e2);
  }

  let minl = l2;
  let f2;

  for (let i=0; i<count-2; i++) {
    let minl = e.l, _i = 0;

    do {
      if (_i++ > 100) {
        console.warn("infinite loop error");
        break;
      }

      if (minl !== l1 && minl !== l2) {
        break;
      }

      minl = minl.radial_next;
    } while (minl !== e.l);

    if (minl === l1 || minl === l2) {
      break;
    }

    let f = minl.f;

    for (let list of f.lists) {
      let vs = [];

      for (let l of list) {
        if (l.v === e.v1) {
          vs.push(v1);
        } else if (l.v === e.v2) {
          vs.push(v2);
        } else {
          vs.push(l.v);
        }
      }

      if (list === f.lists[0]) {
        f2 = mesh.makeFace(vs, undefined, undefined, lctx);
        mesh.copyElemData(f2, f);
        f2.index = f.index;
      } else {
        mesh.makeHole(f2, vs);
      }
    }

    for (let i=0; i<f.lists.length; i++) {
      let list1 = f.lists[i];
      let list2 = f2.lists[i];

      let l1 = list1.l;
      let l2 = list2.l;
      let _i = 0;

      do {
        mesh.copyElemData(l2, l1);

        l1 = l1.next;
        l2 = l2.next;
        if (_i++ > 100000) {
          console.error("Infinite loop error");
          break;
        }
      } while (l1 !== list1.l);
    }

    //make sure we nuke any wire edges
    let es2 = [];
    for (let l of f.loops) {
      if (l.radial_next === l) {
        es2.push(l.e);
      }
    }

    if (f.eid >= 0) {
      mesh.killFace(f, lctx);
    }

    for (let e of es2) {
      mesh.killEdge(e, lctx);
    }
  }
}

export function fixManifold(mesh, lctx) {
  mesh.fixLoops(lctx);

  let es = new Set();

  for (let e of mesh.edges) {
    let c = 0;
    for (let l of e.loops) {
      c++;
    }

    if (c > 2) {
      es.add(e);
    }
  }

  let stack = [];
  let flag = MeshFlags.TEMP3;
  for (let f of mesh.faces) {
    f.flag &= ~flag;
  }

  let shells = [];

  for (let f of mesh.faces) {
    if (f.flag & flag) {
      continue;
    }

    let shell = [];

    stack.length = 0;
    stack.push(f);
    shell.push(f);

    f.flag |= flag;

    while (stack.length > 0) {
      let f2 = stack.pop();
      shell.push(f2);

      for (let l of f2.loops) {
        let count = 0;
        for (let l2 of l.e.loops) {
          count++;
        }

        let ok = count === 2;
        ok = ok && !(l.radial_next.f.flag & flag);

        if (ok) {
          stack.push(l.radial_next.f);
          l.radial_next.f.flag |= flag;
        }
      }
    }

    shells.push(shell);
  }

  for (let shell of shells) {
    for (let f of shell) {
      f.index = shell.length;
    }
  }

  console.log("shells", shells);
  console.log("non-manifold edges:", es);

  if (es.size === 0) {
    return false;
  }

  for (let e of es) {
    let count = 0;
    for (let l of e.loops) {
      count++;
    }

    let v1 = mesh.makeVertex(e.v1);
    let v2 = mesh.makeVertex(e.v2);

    v1.no.load(e.v1.no);
    v2.no.load(e.v2.no);

    mesh.copyElemData(v1, e.v1);
    mesh.copyElemData(v2, e.v2);

    let e2 = mesh.getEdge(v1, v2);

    if (!e2) {
      e2 = mesh.makeEdge(v1, v2);

      if (lctx) {
        lctx.newEdge(e2);
      }
    }

    mesh.copyElemData(e2, e);

    let minl, minw;

    for (let i=0; i<count-2; i++) {
      for (let l of e.loops) {
        console.log(l.f.index);

        if (minl === undefined || l.f.index < minw) {
          minl = l;
          minw = l.f.index;
        }
      }

      let f2;
      let f = minl.f;

      for (let list of f.lists) {
        let vs = [];

        for (let l of list) {
          if (l.v === e.v1) {
            vs.push(v1);
          } else if (l.v === e.v2) {
            vs.push(v2);
          } else {
            vs.push(l.v);
          }
        }

        if (list === f.lists[0]) {
          f2 = mesh.makeFace(vs);
          mesh.copyElemData(f2, f);
          f2.index = f.index;
        } else {
          mesh.makeHole(f2, vs);
        }
      }

      for (let i=0; i<f.lists.length; i++) {
        let list1 = f.lists[i];
        let list2 = f2.lists[i];

        let l1 = list1.l;
        let l2 = list2.l;
        let _i = 0;

        do {
          mesh.copyElemData(l2, l1);

          l1 = l1.next;
          l2 = l2.next;
          if (_i++ > 100000) {
            console.error("Infinite loop error");
            break;
          }
        } while (l1 !== list1.l);
      }

      if (f2 && lctx) {
        lctx.newFace(f2);
      }

      //make sure we nuke any wire edges
      let es2 = [];
      for (let l of f.loops) {
        if (l.radial_next === l) {
          es2.push(l.e);
        }
      }

      if (f.eid >= 0) {
        mesh.killFace(f, lctx);
      }

      for (let e of es2) {
        mesh.killEdge(e, lctx);
      }
    }
  }

  mesh.regenTesellation();
  mesh.recalcNormals();

  return true;
}

let ftmp = [];
export function connectVerts(mesh, v1, v2) {
  let fs = ftmp;
  fs.length = 0;

  for (let f of v1.faces) {
    fs.push(f);
  }

  for (let f of fs) {
    outer: for (let list of f.lists) {
      for (let l of list) {
        if (l.v === v2) {
          mesh.splitFaceAtVerts(f, v1, v2);
          break outer;
        }
      }
    }
  }
  //let heap = new util.MinHeapQueue();
}

let tmp1 = new Vector3();
let tmp2 = new Vector3();
let tmp3 = new Vector3();

export function vertexSmooth(mesh, verts=mesh.verts, fac=0.5, proj=0.0) {
  verts = ReusableIter.getSafeIter(verts);

  for (let v of verts) {
    let co = tmp1.zero();
    let totw = 0;

    for (let v2 of v.neighbors) {
      let co2 = tmp2.load(v2);
      let w = 0.0;

      if (proj !== 0.0) {
        let w2 = 1.0 - proj;
        w = v2.vectorDistance(v);

        w += (1.0 - w)*w2;

        co2.sub(v);
        let d = co2.dot(v.no);

        co2.addFac(v.no, -d).add(v);
      } else {
        w = 1.0;
      }

      co.addFac(co2, w);
      totw += w;
    }

    if (totw > 0.0) {
      co.mulScalar(1.0 / totw);
      v.interp(co, fac);
      v.flag |= MeshFlags.UPDATE;
    }
  }
}

let smat = new Matrix4();
let stmp1 = new Vector3();
let stmp2 = new Vector3();
let stmp3 = new Vector3();

export function sortVertEdges(v, edges=util.list(v.edges), matout=undefined) {
  if (!Array.isArray(edges)) {
    edges = util.list(edges);
  }

  let d = v.no.dot(v.no);
  if (d === 0.0 || isNaN(d) || !isFinite(d)) {
    v.calcNormal(true);
  }

  let ok = false;

  for (let v2 of v.neighbors) {
    stmp1.load(v2).sub(v);

    if (stmp1.dot(stmp1) > 0.0) {
      stmp1.cross(v.no).normalize();
      ok = true;
    }
  }

  let tan = ok ? stmp1 : undefined;

  smat.makeIdentity();
  smat.makeNormalMatrix(v.no, tan);
  smat.invert();

  let co1 = stmp1.load(v);
  co1.multVecMatrix(smat);

  let ths = getArrayTemp(edges.length);
  let idxs = getArrayTemp(edges.length);

  let thi = 0;

  for (let v2 of v.neighbors) {
    let co2 = stmp2.load(v2);
    co2.multVecMatrix(smat);

    co2.sub(co1);
    let th = Math.atan2(co2[1], co2[0]);

    ths[thi++] = th;
  }

  //if (Math.random() > 0.99) {
    //console.log(""+ths, ths);
  //}

  let i = 0;
  for (let e of edges) {
    idxs[i] = e.index;
    e.index = i++;
  }

  edges.sort((a, b) => ths[a.index] - ths[b.index]);

  for (let i=0; i<idxs.length; i++) {
    edges[i].index = idxs[i];
  }

  if (matout) {
    matout.load(smat);
  }

  return edges;
}

/*
        /|\
      /  | \
    / \--|  \
  /      |   \
/ -------|----\

vdata entries are:

number of edges
for each edge:
  x/y/z     : vertex coordinates
  area  : area of triangle formed with cotangent rules
  angle : cot weight
  w     : final weight
 */
const ctmp1 = new Vector3();
const ctmp2 = new Vector3();
const ctmp3 = new Vector3();
const ctmp4 = new Vector3();
const ctmp5 = new Vector3();
const ctmp6 = new Vector3();
const ctmp7 = new Vector3();
const ctmp8 = new Vector3();
const ctmp9 = new Vector3();
const ctmp10 = new Vector3();
const ctmp11 = new Vector3();
const ctmp12 = new Vector3();
const ctmp13 = new Vector3();
const ctmp14 = new Vector3();
const smat2 = new Matrix4();

const VAREA=0, VCTAN1=1, VCTAN2=2, VW=3, VETOT = 4;

export function getCotanData(v, _edges=undefined, _vdata=[]) {
  let vdata = _vdata;
  let edges = _edges;
  let te;

  if (edges === undefined) {
    edges = te = getArrayTemp(v.valence);

    edges.length = 0;
    for (let e of v.edges) {
      edges.push(e);
    }
  }

  let vi = vdata.length;

  vdata.push(v[0]);
  vdata.push(v[1]);
  vdata.push(v[2]);
  vdata.push(edges.length);

  //try to make sane values for pathological 1 and 2-valence cases
  if (edges.length === 1) {
    vi = vdata.length;
    vdata.length += VETOT;

    vdata[vi] = Math.PI;
    vdata[vi+1] = 0.00001;
    vdata[vi+2] = 0.5;
    vdata[vi+3] = 0.00001;
  } else if (edges.length === 2) {
    vi = vdata.length;
    vdata.length += VETOT*2;

    for (let i=0; i<2; i++) {
      vdata[vi] = Math.PI;
      vdata[vi+1] = 0.00001;
      vdata[vi+2] = 0.5;
      vdata[vi+3] = 0.00001;

      vi += VETOT;
    }
  } else {
    let mat = smat2;
    mat.makeIdentity();

    sortVertEdges(v, edges, mat);

    let i = 0;
    for (let e of v.edges) {
      e.index = i++;
    }

    vdata.length += edges.length*VETOT;
    let totw = 0.0;
    let totarea = 0.0;

    for (let i = 0; i < edges.length; i++) {
      let i1 = i, i2 = (i + 1)%edges.length;
      let i3 = (i + 2) % edges.length;

      let e1 = edges[i1], e2 = edges[i2];
      let e3 = edges[i3];

      let v1 = ctmp1.load(v);
      let v2 = ctmp2.load(e1.otherVertex(v));
      let v3 = ctmp3.load(e2.otherVertex(v));
      let v4 = ctmp4.load(e3.otherVertex(v));

      let t1 = ctmp6.load(v2).sub(v).normalize();
      let t2 = ctmp7.load(v3).sub(v).normalize();

      let angle = Math.acos(t1.dot(t2)*0.99999);
      let area = math.tri_area(v1, v2, v3);

      v1.multVecMatrix(mat);
      v2.multVecMatrix(mat);
      v3.multVecMatrix(mat);
      v4.multVecMatrix(mat);

      //v1[2] = v2[2] = v3[2] = v4[2] = 0.0;

      let angle1 = Vector3.normalizedDot3(v1, v2, v3);
      let angle2 = Vector3.normalizedDot3(v1, v4, v3);

      //build voronoi area
      if (1) { //angle < Math.PI*0.5) {
        let l1 = ctmp8.load(v2).sub(v1);
        let l2 = ctmp9.load(v3).sub(v1);

        let c1 = ctmp10.load(v2).interp(v1, 0.5);
        let c2 = ctmp11.load(v3).interp(v1, 0.5);

        l1.load(c1).sub(v1).swapAxes(0, 1);
        l2.load(c2).sub(v1).swapAxes(0, 1);
        l1[1] = -l1[1];
        l2[1] = -l2[1];

        l1.add(c1);
        l2.add(c2);

        let oldarea = area;
        area = 0;
        let ok = false;

        let p = math.line_line_isect(c1, l1, c2, l2);
        if (p && p !== math.COLINEAR_ISECT) {
          p[2] = v1[2] = v2[2] = v3[2] = 0.0;

          ok = true;
          area += math.tri_area(v1, p, v2);
          area += math.tri_area(v1, p, v3);
        }

        c1.load(v3).interp(v1, 0.5);
        c2.load(v4).interp(v1, 0.5);

        l1.load(c1).sub(v1).swapAxes(0, 1);
        l2.load(c2).sub(v1).swapAxes(0, 1);
        l1[1] = -l1[1];
        l2[1] = -l2[1];

        p = math.line_line_isect(c1, l1, c2, l2);
        if (p && p !== math.COLINEAR_ISECT) {
          p[2] = v1[2] = v2[2] = v3[2] = 0.0;

          ok = true;
          area += math.tri_area(v1, p, v3);
          area += math.tri_area(v1, p, v4);
        }

        if (!ok) {
          area = oldarea;
        }
      }// else {

      //}

      if (area === 0.0) {
        area = 0.000001;
      }

      let vi2 = vi + 4 + e1.index*VETOT;
      vdata[vi2+VAREA] = area;

      let cot1 = (Math.cos(angle1)/Math.sin(angle1));
      let cot2 = (Math.cos(angle2)/Math.sin(angle2));

      if (isNaN(cot1) || !isFinite(cot1)) {
        cot1 = 1000000.0;
      }
      if (isNaN(cot2) || !isFinite(cot2)) {
        cot2 = 100000.0;
      }

      let cot =cot1 + cot2;

      if (cot < 0) {
        //cot = Math.abs(cot)*1.5;
      }

      vdata[vi2+VCTAN1] = cot1;
      vdata[vi2+VCTAN2] = cot2;
      vdata[vi2+VW] = cot;

      totarea += area*area;

      totw += vdata[vi2+3] * area;
    }

    if (totarea !== 0.0) {
      totarea = 1.0 / totarea;
    }

    totw = 0.0;
    for (let i=0; i<edges.length; i++) {
      let e1 = edges[i];
      let vi2 = vi + 4 + e1.index*VETOT;

      //vdata[vi2+3] *= totarea;

      totw += vdata[vi2+3];
    }

    if (totw !== 0.0) {
      totw = 1.0 / totw;
    }

    for (let i=0; i<edges.length; i++) {
      let e1 = edges[i];
      let vi2 = vi + 4 + e1.index*VETOT;

      vdata[vi2+3] *= totw;
    }
  }

  //avoid reference leaks
  if (te) {
    for (let i=0; i<te.length; i++) {
      te[i] = undefined;
    }
  }

  return vdata;
}

export function buildCotanVerts(mesh, verts) {
  verts = ReusableIter.getSafeIter(verts);

  let i = 0;
  let vdata = [];

  let edges = [];

  let vs = new Set();
  for (let v of verts) {
    vs.add(v);
    for (let v2 of v.neighbors) {
      vs.add(v2);
    }
  }

  for (let v of vs) {
    let edges = getArrayTemp(v.valence);

    let j = 0;
    for (let e of v.edges) {
      edges[j++] = e;
    }

    v.index = vdata.length;
    getCotanData(v, edges, vdata);

    //avoid reference leaks
    for (let i=0; i<edges.length; i++) {
      edges[i] = undefined;
    }
    i++;
  }

  return {vertexData : vdata, allVerts : vs};
}

let cvtmp1 = new Vector3();
let cvtmp2 = new Vector3();
let cvtmp3 = new Vector3();
let ccrets = util.cachering.fromConstructor(Vector3, 512);
let cctmps = util.cachering.fromConstructor(Vector3, 16);

export function cotanMeanCurvature(v, vdata, vi) {
  if (!vdata) {
    vdata = getCotanData(v);
    vi = 0;
  }

  vi += 4;

  let sum1 = 0, sum2 = 0;
  let totarea = 0;
  let totw = 0.0;

  sum1 = ccrets.next().zero();

  for (let v2 of v.neighbors) {
    let cot1 = vdata[vi + VCTAN1];
    let cot2 = vdata[vi + VCTAN2];
    let area = vdata[vi + VAREA];

    totarea += area*area;
  }

  let n = cctmps.next();

  let i = 0;
  for (let v2 of v.neighbors) {
    let cot1 = vdata[vi+VCTAN1];
    let cot2 = vdata[vi+VCTAN2];
    let area = vdata[vi+VAREA];

    let w = cot1 + cot2;
    //w = Math.abs(w);

    n.load(v.no).add(v2.no).normalize();

    sum1.addFac(n, w*area);

    //sum1 += w*area;
    sum2 += w*totarea;

    vi += VETOT;
    i++;
  }

  //let sum = sum2 !== 0.0 ? sum1 / sum2 : 10000000.0;
  if (sum2 !== 0.0) {
    sum1.mulScalar(2.0 / sum2);
  }

  return sum1;
}

export function cotanVertexSmooth(mesh, verts=mesh.verts, fac=0.5, proj=0.0) {
  let ret = buildCotanVerts(mesh, verts);

  let vdata = ret.vertexData;
  let vs = ret.allVerts;

  console.log(vs, vdata);

  for (let v of verts) {
    let totw = 0.0;
    let co1 = cvtmp1.zero();

    let vi = v.index + 4;
    //let etot = vdata[vi];

    let report = Math.random() > 0.99;
    if (report) {
      console.log("start");
    }

    for (let v2 of v.neighbors) {
      let cot = vdata[vi + VW];
      let area = vdata[vi + VAREA];

      let w = cot*0.5 + 0.5;

      if (w < 0) {
        w = Math.abs(w);
      }

      let co2 = cvtmp2;
      let vi2 = v2.index;

      co2[0] = vdata[vi2];
      co2[1] = vdata[vi2+1];
      co2[2] = vdata[vi2+2];

      if (proj > 0.0) {
        co2.sub(v);

        let d = co2.dot(v.no);
        co2.addFac(v.no, -d).add(v);
      }

      if (report) {
        console.log("  " + w.toFixed(5));
      }

      co1.addFac(co2, w);
      totw += w;

      vi += VETOT;
    }

    if (totw !== 0.0) {
      co1.mulScalar(1.0 / totw);
      v.interp(co1, fac);
      v.flag |= MeshFlags.UPDATE;
    }
  }
}
