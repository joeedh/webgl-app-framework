import {TriMeshFlags, TriMeshTypes} from './trimesh_base.js';
import {FaceFields, HalfEdgeFields, FieldSizes, EdgeFields, VertexFields} from './trimesh_types.js';
import {Vector3, Vector4, Matrix4, Vector2} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';

let {FEID, FFLAG, FINDEX, FL1, FL2, FL3, FV1, FV2, FV3, FE1, FE2, FE3, FNX, FNY, FNZ,
      FCX, FCY, FCZ, FAREA, FTOT} = FaceFields;
let {LEID, LFLAG, LINDEX, LFACE, LVERT, LEDGE, LPAIR, LNEXT, LPREV} = HalfEdgeFields;
let {EEID, EFLAG, EINDEX, EV1, EV2, EL1, EL2, ETOT} = EdgeFields;
let {VEID, VFLAG, VINDEX, VX, VY, VZ, VNX, VNY, VNZ, VEDGE, VTOT} = VertexFields;

let EID=0, FLAG=1, INDEX=2;
let {DEAD, SELECT, SMOOTH, HIDE} = TriMeshFlags;

import {CustomData} from '../mesh/customdata.js';

let calcnortemps = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

export class ElementArray {
  contructor(type) {
    this.freelist = [];
    this.list = [];
    this.type = type;

    if (type !== undefined) {
      this.esize = FieldSizes[type];
    } else {
      this.esize = -1;
    }

    this.active = -1;
    this.highlight = -1;
    this.length = 0;

    this.customData = new CustomData();
  }

  alloc() {
    if (this.freelist.length > 0) {
      let i = this.freelist.pop();
      this.list[i+FLAG] &= ~DEAD;
      this.length++;

      return i;
    }

    let i = this.list.length;
    this.list.length += this.esize;

    this.list[i+FLAG] = 0;
    this.length++;

    return i;
  }

  [Symbol.iterator]() {
    let this2 = this;
    let list = this.list;
    let esize = this.esize;

    return (function*() {
      for (let i=0; i<list.length; i += esize) {
        if (list[i].flag & DEAD) {
          continue;
        }

        yield i;
      }
    })();
  }
  free(i) {
    this.list[i+FLAG] |= DEAD;
    this.freelist.push(i);
    this.length--;
  }

  clear() {
    this.freelist.length = 0;
    this.list.length = 0;
    this.length = 0;

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    if (FieldSizes[this.type] !== this.esize) {
      let old = this.list;
      let ratio = (FieldSizes[this.type] / this.esize);
      let list = this.list = [];

      let old_esize = this.esize;
      let new_esize = FieldSizes[this.type];

      for (let i=0; i<old.length; i += old_esize) {
        for (let j=0; j<old_esize; j++) {
          list.push(old[i+j]);
        }

        for (let j=0; j<new_esize-old_esize; j++) {
          list.push(0);
        }
      }

      for (let i=0; i<this.freelist.length; i++) {
        let f = this.freelist[i];

        f = ~~(f*ratio + 0.0001);
        this.freelist[i] = f;
      }
    }
  }
}

function ekey(v1, v2) {
  v1 /= VTOT;
  v2 /= VTOT;

  return Math.min(v1, v2) | (Math.max(v1, v2)<<24);
}

ElementArray.STRUCT = `
trimesh.ElementArray {
  list      : array(float);
  freelist  : array(int);
  esize     : int;
  type      : int;
  active    : int;
  highlight : int;
  length    : int;
}
`;
export class TriMesh {
  constructor() {
    this.elists = {};

    this.idgen = 1;

    this.edgeMap = new Map();

    this.verts = this.elists[TriMeshTypes.VERTEX] = new ElementArray(TriMeshTypes.VERTEX);
    this.edges = this.elists[TriMeshTypes.EDGE] = new ElementArray(TriMeshTypes.EDGE);
    this.loops = this.elists[TriMeshTypes.LOOP] = new ElementArray(TriMeshTypes.LOOP);
    this.faces = this.elists[TriMeshTypes.FACE] = new ElementArray(TriMeshTypes.FACE);
  }

  makeVertex(co) {
    let vs = this.verts.list;

    let vi = this.verts.alloc();

    vs[vi+VEID] = this.idgen++;
    vs[vi+VINDEX] = ~~(vi / VTOT);
    vs[vi+VFLAG] = 0;
    vs[vi+VX] = co[0];
    vs[vi+VY] = co[1];
    vs[vi+VZ] = co[2];
    vs[vi+VNX] = 0;
    vs[vi+VNY] = 0;
    vs[vi+VNZ] = 1;
    vs[vi+VEDGE] = -1;

    return vi;
  }

  makeEdge(v1, v2) {
    let es = this.edges.list;
    let vs = this.verts.list;

    let ei = es.alloc();
    es[ei+EEID] = this.idgen++;
    es[ei+EFLAG] = 0;
    es[ei+EINDEX] = ~~(ei / ETOT);

    es[ei+EV1] = v1;
    es[ei+EV2] = v2;
    es[ei+EL1] = -1;
    es[ei+EL2] = -1;

    this.edgeMap.set(ekey(v1, v2), ei);
  }

  ensureEdge(v1, v2) {
    let key = ekey(v1, v2);
    let e = this.edgeMap.get(key);

    if (e === undefined) {
      e = this.makeEdge(v1, v2);
    }

    return e;
  }

  makeLoop(f, e, v) {
    let l = this.loops.alloc();
    let ls = this.loops.list;

    ls[l+LEID] = this.idgen++;
    ls[l+LFLAG] = 0;
    ls[l+LINDEX] = l;
    ls[l+LFACE] = f;
    ls[l+LVERT] = v;
    ls[l+LPAIR] = -1;

    this.radialInsert(l, e);


    return l;
  }

  error(msg) {
    console.error(msg);
  }

  radialInsert(l, e) {
    let es = this.edges.list;
    let ls = this.loops.list;

    ls[l+LEDGE] = e;

    if (es[e+EL1] < 0) {
      es[e+EL1] = l;
    } else if (es[e+EL2] < 0) {
      es[e+EL2] = l;
      ls[l+LPAIR] = es[e+EL2];

      let l2 = es[e+EL1];
      ls[l2+LPAIR] = l;
    } else {
      this.error("Non-manifold mesh");
    }
  }

  makeFace(v1, v2, v3, e1, e2, e3) {
    if (!e1) {
      e1 = this.ensureEdge(v1, v2);
      e2 = this.ensureEdge(v2, v3);
      e3 = this.ensureEdge(v3, v1);
    }

    let f = this.faces.alloc();
    let fs = this.faces.list;
    let ls = this.loops.list;
    let vs = this.verts.list;
    let es = this.edges.list;

    let l1 = this.makeLoop(f, e1, v1);
    let l2 = this.makeLoop(f, e2, v2);
    let l3 = this.makeLoop(f, e3, v3);

    ls[l1+LNEXT] = l2;
    ls[l1+LPREV] = l3;
    ls[l2+LNEXT] = l3;
    ls[l2+LPREV] = l1;
    ls[l3+LNEXT] = l1;
    ls[l3+LPREV] = l2;

    fs[f+EID] = this.idgen++;
    fs[f+FLAG] = 0;
    fs[f+INDEX] = f;
    fs[f+FV1] = v1;
    fs[f+FV2] = v2;
    fs[f+FV3] = v3;
    fs[f+FE1] = e1;
    fs[f+FE2] = e2;
    fs[f+FE3] = e3;
    fs[f+FL1] = l1;
    fs[f+FL2] = l2;
    fs[f+FL3] = l3;

    this.calcNormal(f);
  }

  calcNormal(f) {
    let v1 = calcnortemps[0], v2 = calcnortemps[1], v3 = calcnortemps[2];
    let n = calcnortemps[4];

    let vs = this.verts.list, fs = this.faces.list;
    let i1 = fs[f+FV1];
    let i2 = fs[f+FV2];
    let i3 = fs[f+FV3];

    for (let i=0; i<3; i++) {
      v1[i] = vs[i1+VX+i];
      v2[i] = vs[i2+VX+i];
      v3[i] = vs[i3+VX+i];
    }

    n.load(math.normal_tri(v1, v2, v3));

    fs[f+FNX] = n[0];
    fs[f+FNY] = n[1];
    fs[f+FNZ] = n[2];

    return n;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}
TriMesh.STRUCT = `
trimesh.TriMesh {
  verts : trimesh.ElementArray;
  edges : trimesh.ElementArray;
  loops : trimesh.ElementArray;
  faces : trimesh.ElementArray;
  idgen : int;
}
`;
