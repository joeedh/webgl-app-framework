import {PaintOpBase} from '../editors/view3d/tools/pbvh_base.js';

import {nstructjs} from '../path.ux/scripts/pathux.js';

const DYNAMIC_SHUFFLE_NODES = false; //attempt fast debalancing of tree dynamically

import {Vector2, Vector3, Vector4, Matrix4, Quat} from './vectormath.js';
import * as math from './math.js';
import * as util from './util.js';
import {triBoxOverlap, aabb_ray_isect, ray_tri_isect, aabb_cone_isect, tri_cone_isect} from './isect.js';

import {Vertex, Handle, Edge, Loop, LoopList, Face} from '../mesh/mesh_types.js';

import {CDFlags, CustomDataElem} from "../mesh/customdata.js";
import {MeshTypes, MeshFlags, WITH_EIDMAP_MAP, ENABLE_CACHING} from "../mesh/mesh_base.js";
import {GridBase} from "../mesh/mesh_grids.js";

import {QRecalcFlags} from "../mesh/mesh_grids.js";
import {EDGE_LINKED_LISTS} from '../core/const.js';
import {aabb_sphere_dist, closest_point_on_tri, dist_to_tri_v3} from './math.js';
import {MinHeapQueue} from './util.js';
import {getFaceSets} from '../mesh/mesh_facesets.js';

let safetimes = new Array(32).map(f => 0);
function safeprint() {
  let id = arguments[0];

  if (util.time_ms() - safetimes[id] < 200) {
    return;
  }

  console.warn(...arguments);
  safetimes[id] = util.time_ms();
}

let _triverts = [new Vector3(), new Vector3(), new Vector3()];

let _ntmptmp = new Vector3();

const HIGH_QUAL_SPLIT = true;

let _fictmp1 = new Vector3();
let _fictmp2 = new Vector3();
let _fictmp3 = new Vector3();
let _fictmp4 = new Vector3();
let _fictmpco = new Vector3();

export class BVHSettings {
  constructor(leafLimit = 256, drawLevelOffset = 3, depthLimit = 18) {
    this.leafLimit = leafLimit;
    this.drawLevelOffset = drawLevelOffset;
    this.depthLimit = depthLimit;

    this._last_key = "";
  }

  copyTo(b) {
    b.leafLimit = this.leafLimit;
    b.drawLevelOffset = this.drawLevelOffset;
    b.depthLimit = this.depthLimit;
  }

  calcUpdateKey() {
    return "" + this.leafLimit + ":" + this.drawLevelOffset + ":" + this.depthLimit;
  }

  load(b) {
    b.copyTo(this);
    return this;
  }

  copy(b) {
    return new BVHSettings().load(this);
  }
};
BVHSettings.STRUCT = `
bvh.BVHSettings {
  leafLimit       : int;
  drawLevelOffset : int;
  depthLimit      : int;
}
`;
nstructjs.register(BVHSettings);

export const BVHFlags = {
  UPDATE_DRAW          : 1,
  TEMP_TAG             : 2,
  UPDATE_UNIQUE_VERTS  : 4,
  UPDATE_UNIQUE_VERTS_2: 8,
  UPDATE_NORMALS       : 16,
  UPDATE_TOTTRI        : 32,
  UPDATE_OTHER_VERTS   : 64,
  UPDATE_INDEX_VERTS   : 128,
  UPDATE_COLORS        : 256,
  UPDATE_MASK          : 512,
  UPDATE_BOUNDS        : 1024,
  UPDATE_ORIGCO_VERTS  : 2048
};

export const BVHTriFlags = {
  LOOPTRI_INVALID: 1
};

export class FakeSetIter {
  constructor() {
    this.ret = {done: false, value: undefined};
    this.fset = null;
    this.i = -1;
  }

  init(fset) {
    this.i = 0;
    this.ret.done = false;
    this.ret.value = undefined;
    this.fset = fset;

    return this;
  }

  next() {
    let fset = this.fset;
    let i = this.i;

    while (i < fset.length && fset[i] === undefined) {
      i++;
    }

    let ret = this.ret;

    if (i >= fset.length) {
      ret.done = true;
      ret.value = undefined;
    } else {
      ret.done = false;
      ret.value = fset[i];
    }

    this.i = i + 1;

    return ret;
  }
}

export class FakeSet1 extends Array {
  constructor() {
    super();
    this.itercache = util.cachering.fromConstructor(FakeSetIter, 8, true);
    this.length = 0;
  }

  add(item) {
    if (item.seti < this.length && this[item.seti] === item) {
      return;
    }

    item.seti = this.length;
    this.push(item);

    this.size++;
  }

  [Symbol.iterator]() {
    return this.itercache.next().init(this);
  }

  remove() {
    throw new Error("Set interface uses .delete not .remove");
  }

  delete(item) {
    if (this[item.seti] !== item) {
      return;
    }

    this[item.seti] = undefined;
    item.seti = 0;

    this.size--;

    return this;
  }
}

const FakeSet = Set; //util.set; //FakeSet1;

let _tri_idgen = 0;

export class BVHTri {
  constructor(id, tri_idx, f) {
    this.seti = 0;

    this.node = undefined;

    this.v1 = undefined;
    this.v2 = undefined;
    this.v3 = undefined;

    //only used in non grids mode
    this.l1 = this.l2 = this.l3 = undefined;

    this.id = id;
    this._id1 = _tri_idgen++;
    this.tri_idx = tri_idx;
    this.node = undefined;
    this.removed = false;

    this.flag = 0;

    this.no = new Vector3();
    this.area = 0.0;

    this.f = f;

    this.vs = new Array(3);
    this.nodes = [];

    Object.seal(this);
  }

  [Symbol.keystr]() {
    return this._id1;
  }
}

let addtri_tempco1 = new Vector3();
let addtri_tempco2 = new Vector3();
let addtri_tempco3 = new Vector3();
let addtri_tempco4 = new Vector3();
let addtri_tempco5 = new Vector3();
let addtri_stack = new Array(2048);

let lastt = util.time_ms();

export const BVHVertFlags = {
  BOUNDARY_MESH: 1<<1,
  BOUNDARY_FSET: 1<<2,
  CORNER_MESH  : 1<<3,
  CORNER_FSET  : 1<<4,
  NEED_BOUNDARY: 1<<5,
  NEED_VALENCE : 1<<6,
  NEED_ALL     : (1<<5) | (1<<6),
  BOUNDARY_ALL : (1<<1) | (1<<2),
  CORNER_ALL   : (1<<3) | (1<<4),
};

export class MDynVert extends CustomDataElem {
  constructor() {
    super();

    this.flag = BVHVertFlags.NEED_BOUNDARY | BVHVertFlags.NEED_VALENCE;
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX,
      typeName    : "dynvert",
      uiTypeName  : "dynvert",
      defaultName : "dynvert",
      flag        : 0
    }
  }

  updateBoundary(v, cd_fset) {
    this.flag &= ~(BVHVertFlags.BOUNDARY_FSET | BVHVertFlags.BOUNDARY_MESH |
      BVHVertFlags.CORNER_FSET | BVHVertFlags.CORNER_MESH);

    let flag = 0;
    let fsets = new Set()

    for (let e of v.edges) {
      if (!e.l || e.l.radial_next === e.l) {
        flag |= BVHVertFlags.BOUNDARY_MESH;
      }

      if (!e.l || cd_fset < 0) {
        continue;
      }

      let l = e.l;
      let _i = 0;
      do {
        let fset = Math.abs(l.f.customData[cd_fset].value);
        fsets.add(fset);

        if (_i++ > 100) {
          console.error("infinite loop");
          break;
        }
        l = l.radial_next;
      } while (l !== e.l);
    }

    if (fsets.size > 1) {
      flag |= BVHVertFlags.BOUNDARY_FSET;
    }

    if (fsets.size > 2) {
      flag |= BVHVertFlags.CORNER_FSET;
    }

    this.flag |= flag;
  }

  check(v, cd_fset) {
    let ret = false;

    if (this.flag & BVHVertFlags.NEED_BOUNDARY) {
      this.updateBoundary(v, cd_fset);
      ret = true;
    }

    if (this.flag & BVHVertFlags.NEED_VALENCE) {
      let i = 0;

      for (let v2 of v.neighbors) {
        i++;
      }

      this.valence = i;
      ret = true;
    }

    return ret;
  }

  copyTo(b) {
    b.flag = this.flag | BVHVertFlags.NEED_BOUNDARY | BVHVertFlags.NEED_VALENCE;
  }

  interp(dest, blocks, weights) {
    dest.flag |= BVHVertFlags.NEED_BOUNDARY | BVHVertFlags.NEED_VALENCE;
  }

  calcMemSize() {
    return 8;
  }

  getValue() {
    return this.flag;
  }

  setValue(v) {
    this.flag = v;
  }
}

MDynVert.STRUCT = nstructjs.inherit(MDynVert, CustomDataElem) + `
  flag : int;
}`;

nstructjs.register(MDynVert);
CustomDataElem.register(MDynVert);

export function getDynVerts(mesh) {
  let cd_dyn_vert = mesh.verts.customData.getLayerIndex("dynvert");

  if (cd_dyn_vert < 0) {
    mesh.verts.addCustomDataLayer("dynvert");
    cd_dyn_vert = mesh.verts.customData.getLayerIndex("dynvert");
  }

  return cd_dyn_vert;
}

export class CDNodeInfo extends CustomDataElem {
  constructor() {
    super();
    this.node = undefined;
    this.vel = new Vector3(); //for smoothing
    this.flag = BVHVertFlags.NEED_ALL;
    this.valence = 0;
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX, //see MeshTypes in mesh.js
      typeName    : "bvh",
      uiTypeName  : "bvh",
      defaultName : "bvh",
      flag        : CDFlags.TEMPORARY | CDFlags.IGNORE_FOR_INDEXBUF
    }
  }


  /*
  get node() {
    return this._node;
  }

  set node(v) {
    if (v === undefined && this._node !== undefined) {
      if (util.time_ms() - lastt > 10) {
        console.warn("clear node ref");
        lastt = util.time_ms();
      }
    }

    this._node = v;
  }
  //*/

  clear() {
    //this.node = undefined;
    this.vel.zero();
    return this;
  }

  calcMemSize() {
    return 32;
  }

  getValue() {
    return this.node;
  }

  setValue(node) {
    this.node = node;
  }

  interp(dest, srcs, ws) {
    return;
  }

  /*
    set node(v) {
      if (typeof v === "number") {
        throw new Error("eek");
      }

      this._node = v;
    }

    get node() {
      return this._node;
    }
  */
  copyTo(b) {
    //b.node = this.node;
    //b.node = undefined;
    b.vel.load(this.vel);
  }
}

CDNodeInfo.STRUCT = nstructjs.inherit(CDNodeInfo, CustomDataElem) + `
  flag : int;
}`;
nstructjs.register(CDNodeInfo);
CustomDataElem.register(CDNodeInfo);

let cvstmps = util.cachering.fromConstructor(Vector3, 64);
let cvstmps2 = util.cachering.fromConstructor(Vector3, 64);
let vttmp1 = new Vector3();
let vttmp2 = new Vector3();
let vttmp3 = new Vector3();
let vttmp4 = new Vector3();

export class IsectRet {
  constructor() {
    this.id = 0;
    this.p = new Vector3();
    this.uv = new Vector2();
    this.dist = 0;

    this.tri = undefined;
  }

  load(b) {
    this.id = b.id;
    this.p.load(b.p);
    this.uv.load(b.uv);
    this.dist = b.dist;

    this.tri = b.tri;

    return this;
  }

  copy() {
    return new IsectRet().load(this);
  }
}

let _bvh_idgen = 0;

export class BVHNodeVertex extends Vector3 {
  constructor(arg) {
    super(arg);

    this.origco = new Vector3(arg);

    this.id = -1;
    this.nodes = [];
    this.edges = [];
  }
}

export class BVHNodeEdge {
  constructor(v1, v2) {
    this.id = -1;

    this.v1 = v1;
    this.v2 = v2;

    this.nodes = [];
  }

  otherVertex(v) {
    if (v === this.v1) {
      return this.v2;
    } else if (v === this.v2) {
      return this.v1;
    } else {
      throw new Error("vertex not in edge (BVHNodeEdge)");
    }
  }
}

export const DEFORM_BRIDGE_TRIS = false;

export class BVHNode {
  constructor(bvh, min, max) {
    this.__id2 = undefined; //used by pbvh.js

    this.min = new Vector3(min);
    this.max = new Vector3(max);

    this.omin = new Vector3(min);
    this.omax = new Vector3(max);

    this.leafIndex = -1;
    this.leafTexUV = new Vector2();
    this.boxverts = undefined;
    this.boxedges = undefined;
    this.boxvdata = undefined;

    if (DEFORM_BRIDGE_TRIS) {
      //cross-node triangle buffer
      this.boxbridgetris = undefined;
    }

    this.ocent = undefined;
    this.ohalfsize = undefined;
    this.origGen = 0;

    this.axis = 0;
    this.depth = 0;
    this.leaf = true;
    this.parent = undefined;
    this.bvh = bvh;
    this.index = -1;

    this.flag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_OTHER_VERTS;

    this.tottri = 0;

    this.drawData = undefined;

    this.id = -1;
    this._id = _bvh_idgen++;

    this.uniqueVerts = new Set();
    this.uniqueTris = new Set(); //new Set();
    this.otherVerts = new Set();
    this.wireVerts = undefined; //is created on demand

    this.indexVerts = [];
    this.indexLoops = [];
    this.indexTris = [];
    this.indexEdges = [];

    this.otherTris = new Set();

    this.allTris = new Set();
    this.children = [];

    this.subtreeDepth = 0;

    this.nodePad = 0.00001;

    this._castRayRets = util.cachering.fromConstructor(IsectRet, 64, true);
    this._closestRets = util.cachering.fromConstructor(IsectRet, 64, true);

    this.cent = new Vector3(min).interp(max, 0.5);
    this.halfsize = new Vector3(max).sub(min).mulScalar(0.5);

    if (this.constructor === BVHNode) {
      Object.seal(this);
    }
  }

  get flag() {
    return this._flag;
  }

  set flag(f) {
    this._flag = f;
    if (f & BVHFlags.UPDATE_DRAW) {
      //console.warn("UPDATE_DRAW");
    }
  }

  calcBoxVerts() {
    let min = this.min, max = this.max;

    this.boxedges = [];

    let boxverts = this.boxverts = [
      [min[0], min[1], min[2]],
      [min[0], max[1], min[2]],
      [max[0], max[1], min[2]],
      [max[0], min[1], min[2]],

      [min[0], min[1], max[2]],
      [min[0], max[1], max[2]],
      [max[0], max[1], max[2]],
      [max[0], min[1], max[2]],
    ];

    for (let i = 0; i < boxverts.length; i++) {
      let v = this.bvh.getNodeVertex(boxverts[i]);
      boxverts[i] = v;
    }

    for (let i = 0; i < 4; i++) {
      let i2 = (i + 1)%4;
      this.bvh.getNodeEdge(this, boxverts[i], boxverts[i2]);
      this.bvh.getNodeEdge(this, boxverts[i + 4], boxverts[i2 + 4]);
      this.bvh.getNodeEdge(this, boxverts[i], boxverts[i + 4]);
    }

    for (let e of this.boxedges) {
      e.nodes.push(this);
      if (e.v1.nodes.indexOf(this) < 0) {
        e.v1.nodes.push(this);
      }

      if (e.v2.nodes.indexOf(this) < 0) {
        e.v2.nodes.push(this);
      }
    }
  }

  origUpdate(force = false, updateOrigVerts = false) {
    let ok = this.origGen !== this.bvh.origGen;
    ok = ok || !this.omin;
    ok = ok || force

    ok = ok && this.bvh.cd_orig >= 0;

    if (!ok) {
      return false;
    }

    if (this.flag & BVHFlags.UPDATE_ORIGCO_VERTS) {
      this.flag &= ~BVHFlags.UPDATE_ORIGCO_VERTS;
      updateOrigVerts = true;
    }

    if (!this.omin) {
      this.omin = new Vector3();
      this.omax = new Vector3();
      this.ocent = new Vector3();
      this.ohalfsize = new Vector3();
    }

    console.warn("updating node origco bounds", this.id);
    this.origGen = this.bvh.origGen;

    this.omin.zero().addScalar(1e17);
    this.omax.zero().addScalar(-1e17);

    let cd_orig = this.bvh.cd_orig;

    if (!this.leaf) {
      for (let c of this.children) {
        c.origUpdate(force, updateOrigVerts);

        this.omin.min(c.min);
        this.omax.max(c.max);
      }
    } else {
      let omin = this.omin;
      let omax = this.omax;

      if (updateOrigVerts) {
        for (let i = 0; i < 2; i++) {
          let list = i ? this.otherVerts : this.uniqueVerts;

          for (let v of list) {
            v.customData[cd_orig].value.load(v);
          }
        }
      }

      for (let t of this.uniqueTris) {
        omin.min(t.v1);
        omin.min(t.v2);
        omin.min(t.v3);

        omax.max(t.v1);
        omax.max(t.v2);
        omax.max(t.v3);
      }
    }

    this.ocent.load(this.omin).interp(this.omax, 0.5);
    this.ohalfsize.load(this.omax).sub(this.omin).mulScalar(0.5);

    return true;
  }

  setUpdateFlag(flag) {
    if (!this.bvh || this.bvh.dead) {
      console.warn("Dead BVH!");
      return;
    }

    if ((this.flag & flag) !== flag) {
      this.bvh.updateNodes.add(this);
      this.flag |= flag;
    }

    return this;
  }

  split(test) {
    if (test === undefined) {
      throw new Error("test was undefined");
    }
    if (test === 3) {
      console.warn("joining node from split()");
      this.bvh.joinNode(this.parent, true);
      //abort;
      return;
    }

    let addToRoot = test > 1;

    if (!this.leaf) {
      console.error("bvh split called on non-leaf node", this);
      return;
    }
    if (this.allTris.size === 0 && !this.bvh.isDeforming && this.wireVerts.size === 0) {
      console.error("split called on empty node");
      return;
    }

    //this.update();

    let n = this;
    while (n) {
      n.subtreeDepth = Math.max(n.subtreeDepth, this.depth + 1);
      n = n.parent;
    }

    let uniqueVerts = this.uniqueVerts;
    let otherVerts = this.otherVerts;
    let wireVerts = this.wireVerts;
    let uniqueTris = this.uniqueTris;
    let allTris = this.allTris;

    this.wireVerts = undefined;
    this.indexVerts = undefined;
    this.indexLoops = undefined;
    this.uniqueVerts = undefined;
    this.otherVerts = undefined;
    this.uniqueTris = undefined;
    this.allTris = undefined;

    this.tottri = 0; //will be regenerated later
    this.leaf = false;

    let axis = (this.axis + 1)%3;

    let min, max;
    if (!this.bvh.isDeforming) {
      min = new Vector3(this.min);
      max = new Vector3(this.max);
    } else {
      min = new Vector3(this.omin);
      max = new Vector3(this.omax);
    }

    let split = 0;
    let tot = 0;

    if (!this.bvh.isDeforming) {// || this === this.bvh.root) {
      let ax = Math.abs(max[0] - min[0]);
      let ay = Math.abs(max[1] - min[1]);
      let az = Math.abs(max[2] - min[2]);

      if (ax > ay && ax > az) {
        axis = 0;
      } else if (ay > ax && ay > az) {
        axis = 1;
      } else if (az > ax && az > ay) {
        axis = 2;
      }
    }

    let min2 = new Vector3(min);
    let max2 = new Vector3(max);

    if (!this.bvh.isDeforming) {
      let smin = 1e17, smax = -1e17;

      if (wireVerts) {
        for (let v of wireVerts) {
          split += v[axis];
          smin = Math.min(smin, v[axis]);
          smax = Math.min(smax, v[axis]);
        }
      }

      for (let tri of uniqueTris) {
        tri.nodes.remove(this);

        split += tri.v1[axis];
        split += tri.v2[axis];
        split += tri.v3[axis];

        smin = Math.min(smin, tri.v1[axis]);
        smin = Math.min(smin, tri.v2[axis]);
        smin = Math.min(smin, tri.v3[axis]);

        smax = Math.max(smax, tri.v1[axis]);
        smax = Math.max(smax, tri.v2[axis]);
        smax = Math.max(smax, tri.v3[axis]);

        tot += 3;
      }

      if (!tot) {
        split = max[axis]*0.5 + min[axis]*0.5;
      } else {
        split /= tot;
      }

      //try to handle teapot in a stadium situations

      split = (min[axis] + max[axis])*0.5;
      let mid = (smin + smax)*0.5;

      split = (split + mid)*0.5;

      let dd = Math.abs(max[axis] - min[axis])*0.1;

      if (split < min[axis] + dd) {
        split = min[axis] + dd;
      }
      if (split > max[axis] - dd) {
        split = max[axis] - dd;
      }
    } else {
      for (let tri of allTris) {
        tri.nodes.remove(this);
      }

      split = (min[axis] + max[axis])*0.5;
    }

    for (let i = 0; i < 2; i++) {
      min2.load(min);
      max2.load(max);

      if (!i) {
        max2[axis] = split;
      } else {
        min2[axis] = split;
      }

      let c = this.bvh._newNode(min2, max2);
      c.omin.load(min2);
      c.omax.load(max2);

      if (!this.bvh.isDeforming) {
        c.min.subScalar(this.nodePad);
        c.max.addScalar(this.nodePad);
      } else {
        c.calcBoxVerts();
      }

      c.axis = axis;
      c.parent = this;
      c.depth = this.depth + 1;

      this.children.push(c);
    }

    for (let tri of uniqueTris) {
      tri.node = undefined;
    }

    let cd_node = this.bvh.cd_node;

    for (let v of uniqueVerts) {
      v.customData[cd_node].node = undefined;
    }

    if (addToRoot) {
      for (let tri of allTris) {
        this.bvh.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3, undefined, tri.l1, tri.l2, tri.l3, this.bvh.addPass + 1);
      }

      if (wireVerts) {
        for (let v of wireVerts) {
          this.bvh.addWireVert(v);
        }
      }
    } else {
      for (let tri of allTris) {
        this.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3, undefined, tri.l1, tri.l2, tri.l3);
      }

      if (wireVerts) {
        for (let v of wireVerts) {
          this.addWireVert(v);
        }
      }
    }
  }

  /*gets tris based on distances to verts, instead of true tri distance*/
  closestTrisSimple(co, radius, out) {
    let radius_sqr = radius*radius;

    if (!this.leaf) {
      for (let c of this.children) {
        if (!math.aabb_sphere_isect(co, radius, c.min, c.max)) {
          continue;
        }

        c.closestTris(co, radius, out);
      }

      return;
    }

    for (let t of this.allTris) {
      if (out.has(t)) {
        continue;
      }

      let dis = co.vectorDistanceSqr(t.v1);
      dis = dis > radius ? Math.min(dis, co.vectorDistanceSqr(t.v2)) : dis;
      dis = dis > radius ? Math.min(dis, dis = co.vectorDistanceSqr(t.v3)) : dis;

      if (dis < radius_sqr) {
        out.add(t);
      }
    }
  }


  closestTris(co, radius, out) {
    if (!this.leaf) {
      for (let c of this.children) {
        if (!math.aabb_sphere_isect(co, radius, c.min, c.max)) {
          continue;
        }

        c.closestTris(co, radius, out);
      }

      return;
    }

    for (let t of this.allTris) {
      if (out.has(t)) {
        continue;
      }

      if (t.no.dot(t.no) < 0.999) {
        t.no.load(math.normal_tri(t.v1, t.v2, t.v3));
      }

      let dis = math.dist_to_tri_v3(co, t.v1, t.v2, t.v3, t.no);
      if (dis < radius) {
        out.add(t);
      }
    }
  }

  closestOrigVerts(co, radius, out) {
    let radius2 = radius*radius;

    this.origUpdate();

    if (!this.leaf) {
      for (let c of this.children) {
        c.origUpdate();

        if (!math.aabb_sphere_isect(co, radius, c.omin, c.omax)) {
          continue;
        }

        c.closestOrigVerts(co, radius, out);
      }

      return;
    }

    let cd_orig = this.bvh.cd_orig;

    for (let v of this.uniqueVerts) {
      if (v.customData[cd_orig].value.vectorDistanceSqr(co) < radius2) {
        out.add(v);
      }
    }
  }

  nearestVertsN(co, n, heap, mindis) {
    if (!this.leaf) {
      let mindis2, minc;

      if (this.children.length === 1) {
        return this.children[0].nearestVertsN(co, n, heap, mindis);
      }

      let i = 0;
      let mina, minb;

      for (let c of this.children) {
        let dis = math.aabb_sphere_dist(co, c.min, c.max)

        if (mindis2 === undefined || dis < mindis2) {
          mindis2 = dis;
          minc = c;
        }

        if (i) {
          minb = dis;
        } else {
          mina = dis;
        }
        i++;
      }

      let a = 0, b = 1;

      if (minc === this.children[1]) {
        a = 1;
        b = 0;
        let t = mina;
        mina = minb;
        minb = t;
      }

      mina /= 5.0;
      minb /= 5.0;

      if (heap.length >= n*5 && mindis[0] !== undefined && mina >= mindis[0]) {
        return;
      }

      this.children[a].nearestVertsN(co, n, heap, mindis);

      if (heap.length >= n*5 && mindis[0] !== undefined && minb >= mindis[0]) {
        return;
      }

      this.children[b].nearestVertsN(co, n, heap, mindis);

      //while (heap.length > n) {
      //  heap.pop();
      //}
      return;
    }

    const flag = MeshFlags.MAKE_FACE_TEMP;

    for (let j = 0; j < n; j++) {
      let mindis2, minv;

      for (let i = 0; i < 2; i++) {
        let set = i ? this.wireVerts : this.uniqueVerts;
        this.bvh._i++;

        if (!set) {
          continue;
        }

        for (let v of set) {
          if (j === 0) {
            v.flag &= ~flag;
          } else {
            if (v.flag & flag) {
              continue;
            }
          }

          let dis = v.vectorDistanceSqr(co);

          if (mindis2 === undefined || dis <= mindis2) {
            mindis2 = dis;
            minv = v;
          }
        }
      }

      if (!minv) {
        return;
      }

      minv.flag |= flag;

      if (mindis[0] === undefined || mindis2 < mindis[0]) {
        mindis[0] = mindis2;
      }

      heap.push(minv, mindis2);
      //out.add(minv);
    }
  }

  closestVerts(co, radius, out) {
    let radius2 = radius*radius;

    if (!this.leaf) {
      for (let c of this.children) {
        if (!math.aabb_sphere_isect(co, radius, c.min, c.max)) {
          continue;
        }

        c.closestVerts(co, radius, out);
      }

      return;
    }

    for (let v of this.uniqueVerts) {
      if (v.vectorDistanceSqr(co) < radius2) {
        out.add(v);
      }
    }
  }

  closestVertsSquare(co, origco, radius, matrix, min, max, out) {
    //let radius2 = radius*radius;

    if (!this.leaf) {
      for (let c of this.children) {
        /*
        let a = cvstmps.next().load(c.min);
        let b = cvstmps.next().load(c.max);
        let cmin = cvstmps.next().zero().addScalar(1e17);
        let cmax = cvstmps.next().zero().addScalar(-1e17);

        a.multVecMatrix(matrix);
        b.multVecMatrix(matrix);

        cmin.min(a);
        cmin.min(b);
        cmax.max(a);
        cmax.max(b);

        cmin.load(c.cent).multVecMatrix(matrix);
        cmax.load(cmin);

        cmin.addFac(c.halfsize, -4.0);
        cmax.addFac(c.halfsize, 4.0);

        if (!math.aabb_isect_3d(min, max, cmin, cmax)) {
          continue;
        }
        //*/

        //use 1.5 instead of sqrt(2) to add a bit of error margin
        if (!math.aabb_sphere_isect(origco, radius*1.5, c.min, c.max)) {
          continue;
        }


        c.closestVertsSquare(co, origco, radius, matrix, min, max, out);
      }

      return;
    }

    let co2 = cvstmps.next();

    for (let v of this.uniqueVerts) {
      co2.load(v).multVecMatrix(matrix);

      let dx = co2[0] - co[0];
      let dy = co2[1] - co[1];

      dx = dx < 0 ? -dx : dx;
      dy = dy < 0 ? -dy : dy;

      //let dis = (dx+dy)*0.5;
      let dis = Math.max(dx, dy);

      if (dis < radius) {
        out.add(v);
      }
    }
  }

  vertsInTube(co, ray, radius, clip, isSquare, out) {
    if (!this.leaf) {
      for (let c of this.children) {
        if (!aabb_ray_isect(co, ray, c.min, c.max)) {
          continue;
        }

        c.vertsInTube(co, ray, radius, clip, isSquare, out);
      }

      return;
    }

    let co2 = vttmp1.load(co).add(ray);
    let t1 = vttmp2;
    let t2 = vttmp3;
    let t3 = vttmp4;
    let rsqr = radius*radius;
    let raylen = clip ? ray.vectorLength() : 0.0;
    let nray = ray;

    if (clip) {
      nray = new Vector3(nray).normalize();
    }

    for (let i = 0; i < 2; i++) {
      let set = i ? this.wireVerts : this.uniqueVerts;

      if (!set) {
        continue;
      }

      for (let v of set) {
        t1.load(v).sub(co);
        let t = t1.dot(nray);

        if (t < 0) {
          continue;
        }

        if (clip && t > raylen) {
          continue;
        }

        co2.load(co).addFac(nray, t);
        let dis = co2.vectorDistanceSqr(v);

        if (dis < rsqr) {
          out.add(v);
        }
      }
    }
  }

  /** length of ray vector is length of cone*/
  facesInCone(co, ray, radius1, radius2, visibleOnly = true, isSquare, out, tris) {
    if (!this.leaf) {
      for (let c of this.children) {
        if (!aabb_cone_isect(co, ray, radius1, radius2, c.min, c.max)) {
          continue;
        }

        c.facesInCone(co, ray, radius1, radius2, visibleOnly, isSquare, out, tris);
      }

      return;
    }

    let co2 = _fictmp1.load(co).add(ray);
    let ray2 = _fictmp2;

    for (let t of this.allTris) {
      let v1 = t.v1;
      let v2 = t.v2;
      let v3 = t.v3;

      let ok = tri_cone_isect(co, co2, radius1, radius2, v1, v2, v3, false);
      if (visibleOnly) {
        ok = false;

        for (let i = 0; i < 2; i++) {
          let u = Math.random();
          let v = Math.random();
          let w = Math.random();
          let sum = (u + v + w);

          if (sum > 0.0) {
            sum = 1.0/sum;
            u *= sum;
            v *= sum;
            w *= sum;
          }

          co2.load(t.v1).mulScalar(u);
          co2.addFac(t.v2, v);
          co2.addFac(t.v3, w);

          ray2.load(ray).negate();
          co2.addFac(ray2, 0.0001);

          let maxdis = co2.vectorDistance(origin);
          let isect = this.bvh.castRay(co2, ray2);

          if (Math.random() > 0.9975) {
            console.log(co2, ray2, maxdis, isect, t, isect ? isect.dist : undefined);
          }

          //intersected behind origin?
          if (isect && isect.dist >= maxdis) {
            ok = true;
            break;
          } else if (!isect) { //did we not intersect at all?
            ok = true;
            break;
          }
        }
      }

      if (ok) {
        if (tris) {
          tris.add(t);
        }

        if (t.l1) {
          out.add(t.l1.f);
        } else if (t.f) {
          out.add(t.f);
        }
      }
    }
  }

  vertsInCone(co, ray, radius1, radius2, isSquare, out) {
    if (!this.leaf) {
      for (let c of this.children) {
        if (!aabb_cone_isect(co, ray, radius1, radius2, c.min, c.max)) {
          continue;
        }

        c.vertsInTube(co, ray, radius1, radius2, isSquare, out);
      }

      return;
    }

    let co2 = vttmp1;
    let t1 = vttmp2;
    let t2 = vttmp3;
    let t3 = vttmp4;
    let raylen = ray.vectorLength();

    let report = Math.random() > 0.9995;

    let nray = new Vector3(ray);
    nray.normalize();

    for (let i = 0; i < 2; i++) {
      let set = i ? this.wireVerts : this.uniqueVerts;

      if (!set) {
        continue;
      }

      for (let v of set) {
        t1.load(v).sub(co);
        let t = t1.dot(nray);

        if (t < 0 || t >= raylen) {
          continue;
        }

        co2.load(co).addFac(nray, t);

        t /= raylen;
        let r = radius1*(1.0 - t) + radius2*t;
        let rsqr = r*r;

        let dis;

        if (!isSquare) {
          dis = co2.vectorDistanceSqr(v);
        } else {
          co2.sub(v);
          dis = (Math.abs(co2[0]) + Math.abs(co2[1]) + Math.abs(co2[2]))/3.0;
          dis *= dis;
        }

        if (report) {
          //console.log("r", r, "t", t, "dis", Math.sqrt(dis), "rsqr", rsqr);
        }

        if (dis < rsqr) {
          out.add(v);
        }
      }
    }
  }

  closestPoint(p, mindis = 1e17) {
    if (!this.leaf) {
      if (this.children.length === 2) {
        let [c1, c2] = this.children;
        let d1 = aabb_sphere_dist(p, c1.min, c1.max);
        let d2 = aabb_sphere_dist(p, c2.min, c2.max);

        if (c1 > c2) {
          let t = c1;
          c1 = c2;
          c2 = t;
        }

        let r1, r2;

        if (d1 < mindis) {
          r1 = c1.closestPoint(p, mindis);
          if (r1) {
            mindis = r1.dist;
          }
        }

        if (d2 < mindis) {
          r2 = c2.closestPoint(p, mindis);
          if (r2) {
            mindis = r2.dist;
          }
        }

        if (r1 && r2) {
          return r1.dist <= r2.dist ? r1 : r2;
        } else if (r1) {
          return r1;
        } else if (r2) {
          return r2;
        } else {
          return undefined;
        }
      } else if (this.children.length === 1) {
        return this.children[0].closestPoint(p, mindis);
      }
    }

    let ret = this._closestRets.next();
    let ok = false;

    for (let tri of this.allTris) {
      let cp = closest_point_on_tri(p, tri.v1, tri.v2, tri.v3, tri.no);

      let dis = cp.dist;

      if (dis < mindis) {
        ok = true;
        mindis = dis;

        ret.dist = Math.sqrt(dis);
        ret.uv.load(cp.uv);
        ret.p.load(cp.co);
        ret.tri = tri;
        ret.id = tri.id;
      }
    }

    if (ok) {
      return ret;
    }
  }

  castRay(origin, dir) {
    let ret = this._castRayRets.next();
    let found = false;

    if (!this.leaf) {
      for (let c of this.children) {
        if (!aabb_ray_isect(origin, dir, c.min, c.max)) {
          continue;
        }

        let ret2 = c.castRay(origin, dir);
        if (ret2 && (!found || ret2.dist < ret.dist)) {
          found = true;
          ret.load(ret2);
        }
      }

      if (found) {
        return ret;
      } else {
        return undefined;
      }
    }

    for (let t of this.allTris) {
      let isect = ray_tri_isect(origin, dir, t.v1, t.v2, t.v3);

      if (!isect || isect[2] < 0.0) {
        continue;
      }

      if (!found || isect[2] >= 0 && isect[2] < ret.dist) {
        found = true;

        ret.dist = isect[2];
        ret.uv[0] = isect[0];
        ret.uv[1] = isect[1];
        ret.id = t.id;
        ret.tri_idx = t.tri_idx;
        ret.p.load(origin).addFac(dir, ret.dist);
        ret.tri = t;
      }
    }

    if (found) {
      return ret;
    }
  }

  addTri_new(id, tri_idx, v1, v2, v3, noSplit = false, l1, l2, l3) {
    let stack = addtri_stack;
    let si = 0;

    stack[si++] = this;

    let leafLimit = this.bvh.leafLimit;
    let depthLimit = this.bvh.depthLimit;

    let centx = (v1[0] + v2[0] + v3[0])/3.0;
    let centy = (v1[1] + v2[1] + v3[1])/3.0;
    let centz = (v1[2] + v2[2] + v3[2])/3.0;

    let tri = this.bvh._getTri(id, tri_idx, v1, v2, v3);
    let cd_node = this.bvh.cd_node;

    tri.l1 = l1;
    tri.l2 = l2;
    tri.l3 = l3;

    while (si > 0) {
      let node = stack[--si];

      if (!node) {
        break;
      }
      node.tottri++;

      if (!node.leaf) {
        let mindis = 1e17, closest;

        for (let i = 0; i < node.children.length; i++) {
          let c = node.children[i];

          let dx = centx - c.cent[0];
          let dy = centy - c.cent[1];
          let dz = centz - c.cent[2];

          let dis = dx*dx + dy*dy + dz*dz;
          if (dis < mindis) {
            closest = c;
            mindis = dis;
          }
        }

        if (closest) {
          stack[si++] = closest;
        }
      } else {
        let test;

        if (!noSplit && (test = node.splitTest())) {
          node.split(test);

          if (test > 1) {
            return this.bvh.addTri(id, tri_idx, v1, v2, v3, noSplit, l1, l2, l3, this.bvh.addPass + 1);
          }

          //push node back onto stack if split was successful
          if (!node.leaf) {
            stack[si++] = test > 1 ? this.bvh.root : node;
            continue;
          }
        }

        if (!tri.node) {
          tri.node = node;
          node.uniqueTris.add(tri);
        }

        node._pushTri(tri);
      }
    }

    return tri;
  }

  addWireVert(v) {
    if (!this.leaf) {
      for (let c of this.children) {
        if (math.point_in_aabb(v, c.min, c.max)) {
          c.addWireVert(v);
        }
      }
    } else {
      if (!this.wireVerts) {
        this.wireVerts = new Set();
      }

      this.wireVerts.add(v);

      if (this.otherVerts) {
        this.otherVerts.add(v);
      }

      if (this.wireVerts.size >= this.bvh.leafLimit) {
        this.split(1);
      }
    }
  }

  addTri() {
    //return this.addTri_old(...arguments);
    return this.addTri_new(...arguments);
  }

  //try to detect severely deformed nodes and split them
  shapeTest(report = true) {
    let split = false;

    if (!this.parent) {
      return 0;
    }

    let p = this.parent;
    if (p.tottri < this.bvh.leafLimit*1.75) {
      return 0;
    }

    if (this.halfsize[0] === 0.0 || this.halfsize[1] === 0.0 || this.halfsize[2] === 0.0) {
      if (1 || report) {
        console.warn("Malformed node detected", this.halfsize);
      }
      return 0;
    }

    if (1) {
      //aspect ratio test
      let ax = this.halfsize[0]/this.halfsize[1];
      let ay = this.halfsize[1]/this.halfsize[2];
      let az = this.halfsize[2]/this.halfsize[0];

      const l2 = 2.0, l1 = 1.0/l2;

      split = ax < l1 || ax > l2;
      split = split || (ay < l1 || ay > l2);
      split = split || (az < l1 || az > l2);

      if (split) {
        if (report) {
          console.warn("Splitting node due to large aspect ratio");
        }

        return 3;
      }
    }

    //XXX
    return 0;

    if (0) {
      //area test
      let area1 = (this.halfsize[0]*2)*(this.halfsize[1]*2)*(this.halfsize[2]*2);
      let side = 2.25;
      let limit = area1*side*side;

      let p = this.parent;
      for (let c of p.children) {
        if (c.tottri < this.bvh.leafLimit>>2) {
          continue;
        }

        let area2 = (c.halfsize[0]*2)**2 + (c.halfsize[1]*2)**2 + (c.halfsize[2]*2)**2;
        if (area2 >= limit) {
          split = true;

          if (report) {
            console.log("Splitting due to sibling node");
          }
          break;
        }

      }
    }

    return split ? 2 : 0;
  }

  splitTest(depth = 0) {
    if (!this.leaf) {
      return 0;
    }

    let split = this.leaf && this.uniqueTris.size >= this.bvh.leafLimit && this.depth <= this.bvh.depthLimit;

    if (split) {
      return 1;
    } else if (this.bvh.addPass > 2 || this.depth >= this.bvh.depthLimit || this.uniqueTris.size < 1) {
      return 0;
    }

    return 0;
  }

  addTri_old(id, tri_idx, v1, v2, v3, noSplit = false, l1, l2, l3) {
    if (isNaN(v1.dot(v2)*v2.dot(v3))) {
      console.log(id, tri_idx, v1, v2, v3, noSplit);
      throw new Error("nan!");
    }

    let test = this.splitTest();

    if (this.leaf && !noSplit && test) {
      //console.log(this.depth, this.id, this.allTris.size, this.uniqueTris.size);
      this.split(test);

      if (test > 1) {
        return this.bvh.addTri(id, tri_idx, v1, v2, v3, noSplit, l1, l2, l3, this.bvh.addPass + 1);
      }
    }

    this.tottri++;

    if (0 && !this.leaf) {
      let tritmp = _triverts;

      /*tritmp[0] = v1;
      tritmp[1] = v2;
      tritmp[2] = v3;
      */

      tritmp[0].load(v1);
      tritmp[1].load(v2);
      tritmp[2].load(v3);

      let found = false;
      let tri;

      for (let c of this.children) {
        if (triBoxOverlap(c.cent, c.halfsize, tritmp)) {
          tri = c.addTri(id, tri_idx, v1, v2, v3, noSplit);
          found = true;
        }
      }

      return tri;
    }

    if (!this.leaf) {
      let tritmp = _triverts;

      /*tritmp[0] = v1;
      tritmp[1] = v2;
      tritmp[2] = v3;
      */

      //tritmp[0].load(v1);
      //tritmp[1].load(v2);
      //tritmp[2].load(v3);

      let found = 0;

      let cs = this.children;
      let ci = 0;

      for (let c of cs) {
        break;
        if (0) {
          let tmin = addtri_tempco1.zero().addScalar(-1e17);
          let tmax = addtri_tempco2.zero().addScalar(1e17);

          tmin.min(v1);
          tmin.min(v2);
          tmin.min(v3);
          tmax.max(v1);
          tmax.max(v2);
          tmax.max(v3);

          if (math.aabb_intersect_3d(tmin, tmax, c.min, c.max)) {
            found |= 1<<ci;
          }
        } else {
          if (triBoxOverlap(c.cent, c.halfsize, tritmp)) {
            found |= 1<<ci;
          }
        }

        ci++;
      }

      found = 0;

      let tri;

      if (found === 1) {
        tri = cs[0].addTri(id, tri_idx, v1, v2, v3, noSplit);
      } else if (found === 2) {
        tri = cs[1].addTri(id, tri_idx, v1, v2, v3, noSplit);
      }

      let closest, mindis = 1e17, closesti;

      let ci2 = 0;
      for (let c of cs) {
        /*
        let dis = Math.abs(c.cent[c.axis] - v1[c.axis]);
        dis = Math.abs(c.cent[c.axis] - v2[c.axis]);
        dis = Math.abs(c.cent[c.axis] - v3[c.axis]);
        //*/

        let co = addtri_tempco1.zero();
        co.load(v1).add(v2).add(v3).mulScalar(1.0/3.0);
        let dis = c.cent.vectorDistanceSqr(co);

        /*
        let dis = math.aabb_sphere_dist(v1, c.min, c.max);
        dis = Math.min(dis, math.aabb_sphere_dist(v2, c.min, c.max));
        dis = Math.min(dis, math.aabb_sphere_dist(v3, c.min, c.max));
        //*/
        //console.log("DIS", dis);

        if (dis < mindis) {
          closest = c;
          closesti = ci2;
          mindis = dis;
        }

        ci2++;
      }

      if (closest === undefined) {
        return;
      }

      //max sure we pick at least one branch
      if (!found || found === 3) {
        if (!found) {
          //console.warn("triBoxOverlap failure");
        }

        tri = closest.addTri(id, tri_idx, v1, v2, v3, noSplit);

        if (found === 3) {
          closesti = (closesti + 1)%cs.length;
          let c = cs[closesti];

          let tri2 = c.addTri(id, tri_idx, v1, v2, v3, noSplit);

          if (!tri2 && tri === undefined) {
            tri = tri2;
          }
        } else {
          //this.update(true);

          //this.bvh.updateNodes.add(this);
          //this.bvh.updateNodes.add(closest);
        }
      }

      if (found === 3 && closest.leaf) {
        if (tri.node && tri.node.uniqueTris) {
          tri.node.uniqueTris.delete(tri);
          //XXX tri.node.otherTris.add(tri);
        }

        tri.node = closest;
        closest.uniqueTris.add(tri);
        //XXX closest.otherTris.delete(tri);
      }

      return tri;
    }

    let tri = this.bvh._getTri(id, tri_idx, v1, v2, v3);

    tri.l1 = l1;
    tri.l2 = l2;
    tri.l3 = l3;

    return this._pushTri(tri);
  }

  _addVert(v, cd_node, isDeforming) {
    let n = v.customData[cd_node];

    if (isDeforming) {
      if (!n.node && math.point_in_hex(v, this.boxverts)) {
        this.uniqueVerts.add(v);
        n.node = this;
      } else {
        this.otherVerts.add(v);
      }
    } else {
      if (!n.node) {
        this.uniqueVerts.add(v);
        n.node = this;
      } else {
        this.otherVerts.add(v);
      }
    }
  }

  _pushTri(tri) {
    const cd_node = this.bvh.cd_node;
    const isDef = this.bvh.isDeforming;

    this._addVert(tri.v1, cd_node, isDef);
    this._addVert(tri.v2, cd_node, isDef);
    this._addVert(tri.v3, cd_node, isDef);

    if (!tri.node) {
      tri.node = this;
      this.uniqueTris.add(tri);
    } else {
      this.otherTris.add(tri);
      //this.uniqueTris.add(tri);
    }

    tri.nodes.push(this);

    this.allTris.add(tri);

    let updateflag = BVHFlags.UPDATE_INDEX_VERTS;
    updateflag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_BOUNDS
    updateflag |= BVHFlags.UPDATE_TOTTRI;

    this.setUpdateFlag(updateflag);

    return tri;
  }

  updateUniqueVerts() {
    //console.error("update unique verts");

    this.flag &= ~BVHFlags.UPDATE_UNIQUE_VERTS_2;

    if (!this.leaf) {
      for (let c of this.children) {
        c.updateUniqueVerts();
      }

      return;
    }

    this.uniqueVerts = new Set();
    this.otherVerts = new Set();

    const cd_node = this.bvh.cd_node;
    const isDeforming = this.bvh.isDeforming;

    for (let tri of this.allTris) {
      for (let i = 0; i < 3; i++) {
        let v = tri.vs[i];

        if (!v) {
          console.warn("Tri error!");
          this.allTris.delete(tri);
          break;
        }

        let cdn = v.customData[cd_node];

        if (cdn.node === this) {
          cdn.node = undefined;
        }

        this._addVert(v, cd_node, isDeforming);
      }
    }
  }

  updateNormalsGrids() {
    let mesh = this.bvh.mesh;
    let cd_grid = this.bvh.cd_grid;

    let ls = new Set();

    let hasBoundary = false;
    for (let v of this.uniqueVerts) {
      let l = v.loopEid;
      l = l !== undefined ? mesh.eidMap.get(l) : undefined;

      hasBoundary = hasBoundary || v.bLink !== undefined;

      if (!l) {
        continue;
      }

      ls.add(l);
    }

    if (0 && hasBoundary) {
      for (let l of new Set(ls)) {
        ls.add(l);
        ls.add(l.radial_next);
        ls.add(l.radial_next.next)
        ls.add(l.radial_next.prev)
        ls.add(l.prev.radial_next);
        ls.add(l.prev.radial_next.next);
        ls.add(l.prev);
        ls.add(l.next);
      }
    }

    for (let tri of this.uniqueTris) {
      tri.no.load(math.normal_tri(tri.v1, tri.v2, tri.v3));
      tri.area = math.tri_area(tri.v1, tri.v2, tri.v3);
    }

    for (let l of ls) {
      let grid = l.customData[cd_grid];

      grid.flagNormalsUpdate();
      this.bvh.updateGridLoops.add(l);
    }

    /*
    for (let v of this.uniqueVerts) {
      for (let v2 of v.neighbors) {
        if (v2.loopEid !== v.loopEid) {
         for (let v3 of v2.neighbors) {
           if (v3.loopEid !== v2.loopEid) {
             continue;
           }

           v.no.add(v3.no);
         }
        } else {
          v.no.add(v2.no);
        }
      }

      v.no.normalize();
    }
    //*/

    return;
    let vs = new Set();
    let fs = new Set();


    for (let tri of this.uniqueTris) {
      //stupid hack to get better normals along grid seams
      /*
      let d = 4;
      tri.v1.no.mulScalar(d);
      tri.v2.no.mulScalar(d);
      tri.v3.no.mulScalar(d);
      //*/

      //*
      tri.v1.no.zero();
      tri.v2.no.zero();
      tri.v3.no.zero();
      //*/

      let l1 = mesh.eidMap.get(tri.v1.loopEid);
      let l2 = mesh.eidMap.get(tri.v2.loopEid);
      let l3 = mesh.eidMap.get(tri.v3.loopEid);

      if (l1) {
        vs.add(l1.v);
        fs.add(l1.f);
      }
      if (l2) {
        vs.add(l1.v);
        fs.add(l1.f);
      }
      if (l3) {
        vs.add(l1.v);
        fs.add(l1.f);
      }
    }

    for (let v of vs) {
      v.no.zero();
    }

    for (let f of fs) {
      f.calcNormal();
      for (let v of f.verts) {
        v.no.add(f.no);
      }
    }

    for (let v of vs) {
      v.no.normalize();
    }

    let n = new Vector3();

    for (let tri of this.uniqueTris) {
      let n2 = math.normal_tri(tri.v1, tri.v2, tri.v3);

      tri.no.load(n2);
      tri.v1.no.add(n2);
      tri.v2.no.add(n2);
      tri.v3.no.add(n2);
    }

    function doBoundary(v) {
      if (!v.bLink) {
        return;
      }

      if (v.bLink.v2) {
        n.load(v.bLink.v1.no).interp(v.bLink.v2.no, v.bLink.t)
        n.normalize();
        n.interp(v.no, 0.5);
        v.no.load(n).normalize();
      } else {
        n.load(v.bLink.v1.no).interp(v.no, 0.5);
        n.normalize();

        v.no.load(n);
        v.bLink.v1.no.load(n);
      }
    }

    for (let tri of this.uniqueTris) {
      tri.v1.no.normalize();
      tri.v2.no.normalize();
      tri.v3.no.normalize();

      doBoundary(tri.v1);
      doBoundary(tri.v2);
      doBoundary(tri.v3);
    }

    /*
    for (let p1 of this.uniqueVerts) {
      for (let p2 of p1.neighbors) {
        p1.no.add(p2.no);
      }
      p1.no.normalize();
    }*/
  }

  updateNormals() {
    this.flag &= ~BVHFlags.UPDATE_NORMALS;

    //for (let tri of this.uniqueTris) {
    //  tri.area = math.tri_area(tri.v1, tri.v2, tri.v3) + 0.00001;
    //}

    if (this.bvh.cd_grid >= 0) {
      this.updateNormalsGrids();
      return;
    }

    let eidMap = this.bvh.mesh.eidMap;

    for (let t of this.uniqueTris) {
      let bad = !t.v1 || !t.v2 || !t.v3 || t.v1.eid < 0 || t.v2.eid < 0 || t.v3.eid < 0;

      bad = bad || isNaN(t.v1.dot(t.v1));
      bad = bad || isNaN(t.v2.dot(t.v2));
      bad = bad || isNaN(t.v3.dot(t.v3));

      if (bad) {
        safeprint(0, "corrupted tri", t);

        this.uniqueTris.delete(t);
        continue;
      }


      let no = math.normal_tri(t.v1, t.v2, t.v3);

      t.no[0] = no[0];
      t.no[1] = no[1];
      t.no[2] = no[2];

      t.area = math.tri_area(t.v1, t.v2, t.v3) + 0.00001;

      //let d = t.no.dot(t.no);

      //let ok = Math.abs(t.area) > 0.00001 && !isNaN(t.area);
      //ok = ok && isFinite(t.area) && d > 0.0001;
      //ok = ok && !isNaN(d) && isFinite(d);

      //ensure non-zero t.area
      //t.area = Math.max(Math.abs(t.area), 0.00001) * Math.sign(t.area);

      //if (!ok) {
      //continue;
      //}

      let f;

      if (t.l1) {
        f = t.l1.f;
      } else {
        f = eidMap.get(t.id);
      }

      if (f) {
        if (!f.no) {
          //eek!

          f.no = new Vector3();

          console.warn(f, f.no);
          throw new Error("eek!");
        }

        f.no[0] = t.no[0];
        f.no[1] = t.no[1];
        f.no[2] = t.no[2];
      }
    }


    for (let v of this.uniqueVerts) {
      let no = v.no;

      let ox = no[0], oy = no[1], oz = no[2];
      let x = 0, y = 0, z = 0;
      let ok = false;

      for (let e of v.edges) {
        if (!e.l) {
          continue;
        }

        let l = e.l;
        let _i = 0;

        do {
          //if (!doneset.has(l.f)) {
          //  doneset.add(l.f);
          //  l.f.calcNormal();
          //}

          let fno = l.f.no;
          let fx = fno[0], fy = fno[1], fz = fno[2];

          if (fx*fx + fy*fy + fz*fz < 0.0001) {
            l.f.calcNormal();
          }

          x += fx;
          y += fy;
          z += fz;

          ok = true;

          if (_i++ > 32) {
            console.warn("Infinite loop detected");
            break;
          }

          l = l.radial_next;
        } while (l !== e.l);
      }

      if (ok) {
        no[0] = x;
        no[1] = y;
        no[2] = z;

        no.normalize();
      }
    }
  }

  updateIndexVertsGrids() {
    let list = this.indexVerts = [];
    let list2 = this.indexLoops = [];
    let map = this.indexTris = [];
    let emap = this.indexEdges = [];

    let computeValidEdges = this.bvh.computeValidEdges;

    let edgeExists = (v1, v2) => {
      if (!computeValidEdges) {
        return true;
      }

      for (let v3 of v1.neighbors) {
        if (v3 === v2) {
          return true;
        }
      }

      for (let v3 of v2.neighbors) {
        if (v3 === v1) {
          console.warn("Neighbor error!");
          for (let i = 0; i < 2; i++) {
            let v = i ? v2 : v1;
            if (v.loopEid === undefined) {
              console.warn("Missing loop!", v.loopEid, v);
              continue;
            }

            let l = this.bvh.mesh.eidMap.get(v.loopEid);
            if (!l || l.type !== MeshTypes.LOOP) {
              console.warn("Missing loop", v.loopEid, v);
              continue;
            }

            let cd_grid = this.bvh.cd_grid;
            let grid = l.customData[cd_grid];

            grid.flagFixNeighbors();
          }
          return true;
        }
      }

      return false;
    }

    for (let v of this.uniqueVerts) {
      v.index = list.length;

      list.push(v);
      list2.push(v);
    }

    for (let v of this.otherVerts) {
      v.index = list.length;
      list.push(v);
      list2.push(v);
    }

    for (let tri of this.uniqueTris) {
      map.push(tri.v1.index);
      map.push(tri.v2.index);
      map.push(tri.v3.index);


      if (edgeExists(tri.v1, tri.v2)) {
        emap.push(tri.v1.index);
        emap.push(tri.v2.index);
      }


      if (edgeExists(tri.v2, tri.v3)) {
        emap.push(tri.v2.index);
        emap.push(tri.v3.index);
      }

      if (edgeExists(tri.v3, tri.v1)) {
        emap.push(tri.v3.index);
        emap.push(tri.v1.index);
      }
    }
  }

  updateIndexVerts() {
    if (this.bvh.cd_grid >= 0) {
      return this.updateIndexVertsGrids();
    }

    const computeValidEdges = this.bvh.computeValidEdges;
    const hideQuadEdges = this.bvh.hideQuadEdges;
    const quadflag = MeshFlags.QUAD_EDGE;
    const isDef = this.bvh.isDeforming;

    this.indexVerts = [];
    this.indexLoops = [];

    this.indexTris = [];
    this.indexEdges = [];

    let mesh = this.bvh.mesh;

    for (let tri of this.uniqueTris) {
      tri.v1.index = tri.v2.index = tri.v3.index = -1;
      tri.l1.index = tri.l2.index = tri.l3.index = -1;
    }

    let cd_fset = getFaceSets(mesh, false);

    let cdlayers = mesh.loops.customData.flatlist;
    cdlayers = cdlayers.filter(cdl => !(cdl.flag & (CDFlags.TEMPORARY | CDFlags.IGNORE_FOR_INDEXBUF)));

    let bridgeTris;
    let dflag = MeshFlags.MAKE_FACE_TEMP;
    let bridgeIdxMap;

    if (isDef && DEFORM_BRIDGE_TRIS) {
      bridgeTris = new Set();
      bridgeIdxMap = new Map();

      this.boxbridgetris = {
        indexVerts: [],
        indexLoops: [],
        indexTris : [],
        indexEdges: []
      };

      for (let v of this.uniqueVerts) {
        v.flag &= ~dflag;
        v.index = -1;
      }

      for (let v of this.otherVerts) {
        v.flag |= dflag;
        v.index = -1;
      }
    } else {
      for (let v of this.uniqueVerts) {
        v.flag &= ~dflag;
      }
      for (let v of this.otherVerts) {
        v.flag &= ~dflag;
      }
    }


    //simple code path for if there's no cd layer to build islands out of
    if (cd_fset < 0 && cdlayers.length === 0) {
      let vi = 0;

      if (!isDef || !DEFORM_BRIDGE_TRIS) {
        for (let step = 0; step < 2; step++) {
          let indexVerts = this.indexVerts, indexLoops = this.indexLoops;
          for (let tri of this.uniqueTris) {
            tri.v1.index = tri.v2.index = tri.v3.index = -1;
          }
          for (let tri of this.uniqueTris) {
            for (let i = 0; i < 3; i++) {
              let v = tri.vs[i];

              if (v.index !== -1) {
                continue;
              }

              for (let e of v.edges) {
                if (e.l) {
                  indexLoops.push(e.l);
                  break;
                }
              }

              v.index = vi++;
              indexVerts.push(v);
            }
          }

          if (0) {
            let list = step ? this.otherVerts : this.uniqueVerts;

            for (let v of list) {
              let ok = false;

              for (let e of v.edges) {
                if (e.l) {
                  ok = true;
                  indexLoops.push(e.l);
                  break;
                }
              }

              if (ok) {
                v.index = vi++;
                indexVerts.push(v);
              }
            }
          }
        }
      } else {
        for (let v of this.uniqueVerts) {
          if (v.eid < 0) {
            console.warn("Bad vertex in bvh node", v);
            continue;
          }

          let ok = false;

          for (let e of v.edges) {
            if (e.l) {
              ok = true;
              this.indexLoops.push(e.l);
              break;
            }
          }

          if (ok) {
            v.index = this.indexVerts.length;
            this.indexVerts.push(v);
          }
        }

        //deal with deform bridge tris
        for (let tri of this.allTris) {
          let ok = false;

          for (let i = 0; i < 3; i++) {
            if (tri.vs[i].eid < 0) {
              console.warn("Bad tri in bvh node", tri, tri.vs[i]);
              ok = false;
              break;
            }

            if (tri.vs[i].flag & dflag) {
              ok = true;
            }
          }

          if (!ok) {
            continue;
          }

          for (let i = 0; i < 3; i++) {
            let v = tri.vs[i];
            let l;

            switch (i) {
              case 0:
                l = tri.l1;
                break;
              case 1:
                l = tri.l2;
                break;
              case 2:
                l = tri.l3;
                break;
            }

            let indexLoops, indexVerts;

            if (v.flag & dflag) {
              if (v.index < 0) {
                v.index = this.boxbridgetris.indexVerts.length;
                this.boxbridgetris.indexVerts.push(v);
                this.boxbridgetris.indexLoops.push(l);
              }
            } else if (!bridgeIdxMap.has(v)) {
              let idx = this.boxbridgetris.indexVerts.length;
              this.boxbridgetris.indexVerts.push(v);
              this.boxbridgetris.indexLoops.push(l);

              bridgeIdxMap.set(v, idx);
            }
          }
        }
      }

      let deadtris = new Set();

      /*
      this.indexTris.length = 0;
      this.indexVerts.length = 0;
      this.indexLoops.length = 0;
      this.indexEdges.length = 0;
      //*/

      for (let tri of this.uniqueTris) {
        let indexVerts, indexLoops, indexTris, indexEdges;

        let i1, i2, i3;

        if (this.boxbridgetris && ((tri.v1.flag | tri.v2.flag | tri.v3.flag) & dflag)) {
          if (bridgeIdxMap) {
            i1 = !(tri.v1.flag & dflag) ? bridgeIdxMap.get(tri.v1) : tri.v1.index;
            i2 = !(tri.v2.flag & dflag) ? bridgeIdxMap.get(tri.v2) : tri.v2.index;
            i3 = !(tri.v3.flag & dflag) ? bridgeIdxMap.get(tri.v3) : tri.v3.index;
          } else {
            i1 = tri.v1.index;
            i2 = tri.v2.index;
            i3 = tri.v3.index;
          }

          if (bridgeTris) {
            bridgeTris.add(tri);
          }

          indexVerts = this.boxbridgetris.indexVerts;
          indexLoops = this.boxbridgetris.indexLoops;
          indexTris = this.boxbridgetris.indexTris;
          indexEdges = this.boxbridgetris.indexEdges;
        } else {
          i1 = tri.v1.index;
          i2 = tri.v2.index;
          i3 = tri.v3.index;

          indexVerts = this.indexVerts;
          indexLoops = this.indexLoops;
          indexTris = this.indexTris;
          indexEdges = this.indexEdges;
        }

        if (tri.v1.index < 0 || tri.v2.index < 0 || tri.v3.index < 0) {
          if (tri.v1.eid < 0 || tri.v2.eid < 0 || tri.v3.eid < 0) {
            util.console.warn("Tri index buffer error", tri);
            deadtris.add(tri);
            continue;
          }

          console.warn("Missing vertex in tri index buffer!", tri.v1.index, tri.v2.index, tri.v3.index);

          if (tri.l1.eid < 0 || tri.l2.eid < 0 || tri.l3.eid < 0) {
            util.console.warn("Tri index buffer error 2");
            deadtris.add(tri);
            continue;
          }

          if (tri.v1.index < 0) {
            i1 = tri.v1.index = vi++;
            indexVerts.push(tri.v1);
            indexLoops.push(tri.l1);
            this.otherVerts.add(tri.v1);
          }

          if (tri.v2.index < 0) {
            i2 = tri.v2.index = vi++;
            indexVerts.push(tri.v2);
            indexLoops.push(tri.l2);
            this.otherVerts.add(tri.v2);
          }

          if (tri.v3.index < 0) {
            i3 = tri.v3.index = vi++;
            indexVerts.push(tri.v3);
            indexLoops.push(tri.l3);
            this.otherVerts.add(tri.v3);
          }
          //continue;
        }

        indexTris.push(i1);
        indexTris.push(i2);
        indexTris.push(i3);

        if (validEdge(tri.v1, tri.v2)) {
          indexEdges.push(i1);
          indexEdges.push(i2);
        }

        if (validEdge(tri.v2, tri.v3)) {
          indexEdges.push(i2);
          indexEdges.push(i3);
        }

        if (validEdge(tri.v3, tri.v1)) {
          indexEdges.push(i3);
          indexEdges.push(i1);
        }
      }

      if (deadtris.size > 0) {
        for (let v of this.uniqueVerts) {
          if (v.eid < 0) {
            this.uniqueVerts.delete(v);
          }
        }

        for (let v of this.otherVerts) {
          if (v.eid < 0) {
            this.otherVerts.delete(v);
          }
        }
      }

      for (let tri of deadtris) {
        this.uniqueTris.delete(tri);
        this.bvh.removeTri(tri);
      }

      return;
    }

    let ls = new Set();
    let vs = new Set();

    function validEdge(v1, v2) {
      if (v1.eid < 0 || v2.eid < 0) {
        return false;
      }

      if (!computeValidEdges) {
        return true;
      }

      let e = mesh.getEdge(v1, v2);
      if (!e) {
        return false;
      }

      if (hideQuadEdges && (e.flag & quadflag)) {
        return false;
      }

      return true;
    }

    for (let tri of this.uniqueTris) {
      if (tri.l1.eid >= 0 && tri.l2.eid >= 0 && tri.l3.eid >= 0) {
        vs.add(tri.v1);
        vs.add(tri.v2);
        vs.add(tri.v3);

        ls.add(tri.l1);
        ls.add(tri.l2);
        ls.add(tri.l3);
      }
    }

    let lmap = new Map();
    let lmap2 = new Map();

    let idxbase = 0;

    for (let v of vs) {
      let hash, cdata;

      for (let e of v.edges) {
        for (let l of e.loops) {
          if (l.eid < 0 || l.v.eid < 0) {
            console.warn("bvh corruption", l);
            continue;
          }

          if (l.v !== v) {
            l = l.next.v === v ? l.next : l.prev;
          }

          //let key = "" + v.eid;
          let key = v.eid;

          for (let layer of cdlayers) {
            let data = l.customData[layer.index];
            let hash2 = data.hash(layer.islandSnapLimit);

            key = ~~(key ^ hash2);

            //key += ":" + hash2;
          }

          if (cd_fset >= 0) {
            let fset = l.f.customData[cd_fset].value;
            fset = (fset*2343 + 234234)%65535;

            key = ~~(key ^ fset);
          }

          let idx;
          if (!lmap.has(key)) {
            idx = idxbase++;

            if (!isDef || !DEFORM_BRIDGE_TRIS || this.uniqueVerts.has(l.v)) {
              this.indexVerts.push(l.v);
              this.indexLoops.push(l);
            } else {
              this.boxbridgetris.indexVerts.push(l.v);
              this.boxbridgetris.indexLoops.push(l);
            }

            lmap.set(key, l);
          } else {
            idx = lmap.get(key).index;
          }

          l.index = idx;
        }
      }
    }

    for (let l of ls) {
      if (l.eid < 0 || l.v.eid < 0) {
        console.error("BVH loop corruption", l, l.eid, l.v.eid);
        continue;
      }

      if (l.index < 0) {
        l.index = idxbase++;

        if (!isDef || !DEFORM_BRIDGE_TRIS || this.uniqueVerts.has(l.v)) {
          this.indexVerts.push(l.v);
          this.indexLoops.push(l);
        } else {
          this.boxbridgetris.indexVerts.push(l.v);
          this.boxbridgetris.indexLoops.push(l);
        }
      }
    }

    //make sure indices are correct in deform mode,
    //which builds two seperate sets of triangles
    if (isDef && DEFORM_BRIDGE_TRIS) {
      let i = 0;

      i = 0;
      for (let l of this.indexLoops) {
        l.index = i++;
      }

      i = 0;
      for (let l of this.boxbridgetris.indexLoops) {
        l.index = i++;
      }
    }

    let idxmap = this.indexTris = [];
    let eidxmap = this.indexEdges = [];

    for (let tri of this.uniqueTris) {
      let bad = tri.l1.index < 0 || tri.l2.index < 0 || tri.l3.index < 0;
      bad = bad || tri.l1.eid < 0 || tri.l2.eid < 0 || tri.l3.eid < 0;
      bad = bad || tri.v1.eid < 0 || tri.v2.eid < 0 || tri.v3.eid < 0;

      if (bad) {
        console.warn("Tri index buffer error");
        continue;
      }

      if ((tri.v1.flag | tri.v2.flag & tri.v3.flag) & dflag) {
        idxmap = this.boxbridgetris.indexTris;
        eidxmap = this.boxbridgetris.indexEdges;
      } else {
        idxmap = this.indexTris;
        eidxmap = this.indexEdges;
      }

      idxmap.push(tri.l1.index);
      idxmap.push(tri.l2.index);
      idxmap.push(tri.l3.index);

      if (validEdge(tri.v1, tri.v2)) {
        eidxmap.push(tri.l1.index);
        eidxmap.push(tri.l2.index);
      }

      if (validEdge(tri.v2, tri.v3)) {
        eidxmap.push(tri.l2.index);
        eidxmap.push(tri.l3.index);
      }

      if (validEdge(tri.v3, tri.v1)) {
        eidxmap.push(tri.l3.index);
        eidxmap.push(tri.l1.index);
      }
    }

    //console.log("lmap", lmap, vs.size);
  }

  updateOtherVerts() {
    this.flag &= ~BVHFlags.UPDATE_OTHER_VERTS;

    let othervs = this.otherVerts = new Set();

    //just do uniqueTris, otherVerts is used to calculate index
    //buffers for gl
    for (let tri of this.uniqueTris) {
      if (!this.uniqueVerts.has(tri.v1)) {
        othervs.add(tri.v1);
      }

      if (!this.uniqueVerts.has(tri.v2)) {
        othervs.add(tri.v2);
      }

      if (!this.uniqueVerts.has(tri.v3)) {
        othervs.add(tri.v3);
      }
    }
  }

  update(boundsOnly = false) {
    this.flag &= ~BVHFlags.UPDATE_BOUNDS;

    if (this.leaf && (this.flag & BVHFlags.UPDATE_INDEX_VERTS)) {
      for (let tri of this.uniqueTris) {
        if (!tri.v1 || !tri.v2 || !tri.v3) {
          util.console.warn("Corrupted tri in bvh", tri);
          this.uniqueTris.delete(tri);
        }
      }
    }

    if (isNaN(this.min.dot(this.max))) {
      //throw new Error("eek!");
      console.error("NAN!", this, this.min, this.max);
      this.min.zero().subScalar(0.01);
      this.max.zero().addScalar(0.01);
    }

    if (!boundsOnly && this.leaf) {
      let doidx = this.flag & BVHFlags.UPDATE_INDEX_VERTS;
      doidx = doidx && !(this.flag & (BVHFlags.UPDATE_UNIQUE_VERTS));

      if (this.flag & BVHFlags.UPDATE_UNIQUE_VERTS) {
        this.flag |= BVHFlags.UPDATE_INDEX_VERTS;

        for (let v of this.uniqueVerts) {
          let node = v.customData[this.bvh.cd_node];

          node.node = undefined;
        }

        this.flag &= ~BVHFlags.UPDATE_UNIQUE_VERTS;
        this.flag |= BVHFlags.UPDATE_UNIQUE_VERTS_2;
      } else if (this.flag & BVHFlags.UPDATE_UNIQUE_VERTS_2) {
        this.flag &= ~BVHFlags.UPDATE_UNIQUE_VERTS_2;
        this.updateUniqueVerts();
      }

      if (this.flag & BVHFlags.UPDATE_OTHER_VERTS) {
        this.flag &= ~BVHFlags.UPDATE_OTHER_VERTS;
        this.updateOtherVerts();
      }

      if (this.flag & BVHFlags.UPDATE_NORMALS) {
        this.updateNormals();
      }

      if (doidx) {
        if (this.bvh.isDeforming && !this.boxvdata) {
          //no bind data? delay update.
          if (Math.random() > 0.8) {
            console.warn("No bind data; delaying construction of gpu index buffers");
          }
        } else {
          this.flag &= ~BVHFlags.UPDATE_INDEX_VERTS;
          this.updateIndexVerts();
        }
      }
    }

    //return;
    //if (!boundsOnly) {
    //  return;
    //}

    if (!this.leaf && this.children.length > 0) {
      for (let c of this.children) {
        c.update();

        this.min.min(c.min);
        this.max.max(c.max);
      }

      //let pad = this.min.vectorDistance(this.max)*0.00001;
      //let pad = 0.00001;
      //this.min.subScalar(pad);
      //this.max.addScalar(pad);

      this.cent.load(this.min).interp(this.max, 0.5);
      this.halfsize.load(this.max).sub(this.min).mulScalar(0.5);
    } else if (this.leaf) {
      let min = this.min;
      let max = this.max;

      let omin = new Vector3(min);
      let omax = new Vector3(max);
      let size = (max[0] - min[0]) + (max[1] - min[1]) + (max[2] - min[2]);
      size /= 3.0;

      min.zero().addScalar(1e17);
      max.zero().addScalar(-1e17);

      let tot = 0;

      if (this.wireVerts) {
        for (let v of this.wireVerts) {
          min.min(v);
          max.max(v);
          tot++;
        }
      }

      for (let tri of this.uniqueTris) {
        if (!tri.v1) {
          this.uniqueTris.delete(tri);
          continue;
        }

        min.min(tri.v1);
        max.max(tri.v1);

        min.min(tri.v2);
        max.max(tri.v2);

        min.min(tri.v3);
        max.max(tri.v3);

        tot++;
      }

      if (tot === 0) {
        size = 0.01;
        min.zero().addScalar(-size*0.5);
        max.zero().addScalar(size*0.5);
        //min.load(omin);
        //max.load(omax);
      } else {
        //let pad = this.nodePad;

        //let pad = min.vectorDistance(max) * 0.001;
        //this.min.subScalar(pad);
        //this.max.addScalar(pad);
      }

      if (this.max.vectorDistance(this.min) < 0.00001) {
        //XXX
        this.min.subScalar(0.0001);
        this.max.addScalar(0.0001);
      }

      this.cent.load(this.min).interp(this.max, 0.5);
      this.halfsize.load(this.max).sub(this.min).mulScalar(0.5);
    }
  }

  remTri(id) {

  }
}

let bvhidgen = 0;

export class BVH {
  constructor(mesh, min, max, tottri = 0) {
    this.min = new Vector3(min);
    this.max = new Vector3(max);

    this.glLeafTex = undefined;

    this._id = bvhidgen++;

    this.nodeVerts = [];
    this.nodeEdges = [];
    this.nodeVertHash = new Map();
    this.nodeEdgeHash = new Map();
    this._node_elem_idgen = 0;

    this.isDeforming = false;

    this.totTriAlloc = 0;
    this.totTriFreed = 0;

    this.cd_orig = -1;
    this.origGen = 0;

    this.dead = false;

    this.freelist = [];

    this.needsIndexRebuild = false;
    this.hideQuadEdges = false;
    this.computeValidEdges = false; //when building indexed draw buffers, only add edges that really exist in mesh

    this.tottri = 0;
    this.addPass = 0;

    this.flag = 0;
    this.updateNodes = new Set();
    this.updateGridLoops = new Set();

    this.mesh = mesh;

    this.node_idgen = 1;

    this.forceUniqueTris = false;
    this.storeVerts = false;

    this._leafLimit = 256;
    this.drawLevelOffset = 1;
    this.depthLimit = 18;

    this.nodes = [];
    this.node_idmap = new Map();
    this.root = this._newNode(min, max);

    //note that ids are initially just the indices within mesh.loopTris
    this.tri_idgen = 0;

    this.cd_node = -1;
    this.cd_grid = -1;

    //this.cd_face_node = -1;
    this.tris = new Map();
    this.fmap = new Map();

    this.verts = new Set();
    this.mesh = mesh;
    this.dirtemp = new Vector3();

    this._i = 0;

    if (this.constructor === BVH) {
      Object.seal(this);
    }
  }

  get leaves() {
    let this2 = this;

    return (function* () {
      for (let n of this2.nodes) {
        if (n.leaf) {
          yield n;
        }
      }
    })();
  }

  get leafLimit() {
    return this._leafLimit;
  }

  set leafLimit(v) {
    console.error("leafLimit set", v);
    this._leafLimit = v;
  }

  static create(mesh, storeVerts_or_args = true, useGrids = true,
                leafLimit                                 = undefined,
                depthLimit                                = undefined,
                freelist                                  = undefined,
                addWireVerts                              = false,
                deformMode                                = false) {
    let times = [util.time_ms()]; //0
    let storeVerts = storeVerts_or_args;
    let onCreate;

    if (typeof storeVerts == "object") {
      let args = storeVerts;

      storeVerts = args.storeVerts ?? true;
      leafLimit = args.leafLimit;
      depthLimit = args.depthLimit;
      addWireVerts = args.addWireVerts;
      deformMode = args.deformMode;
      useGrids = args.useGrids ?? true;
      freelist = args.freelist;
      onCreate = args.onCreate;
    }

    mesh.updateMirrorTags();

    times.push(util.time_ms()); //1

    let cdname = this.name;

    if (!mesh.verts.customData.hasNamedLayer(cdname, CDNodeInfo)) {
      mesh.verts.addCustomDataLayer(CDNodeInfo, cdname).flag |= CDFlags.TEMPORARY;
    }

    if (useGrids && GridBase.meshGridOffset(mesh) >= 0) {
      if (!mesh.loops.customData.hasNamedLayer(cdname, CDNodeInfo)) {
        mesh.loops.addCustomDataLayer(CDNodeInfo, cdname).flag |= CDFlags.TEMPORARY;
      }
    }

    /*
    if (!mesh.faces.customData.hasNamedLayer(cdname, CDNodeInfo)) {
      mesh.faces.addCustomDataLayer(CDNodeInfo, cdname).flag |= CDFlags.TEMPORARY;
    }*/

    times.push(util.time_ms()); //2

    let aabb = mesh.getBoundingBox(useGrids);

    times.push(util.time_ms()); //3

    if (!aabb) {
      let d = 1;
      aabb = [new Vector3([-d, -d, -d]), new Vector3([d, d, d])];
    }

    aabb[0] = new Vector3(aabb[0]);
    aabb[1] = new Vector3(aabb[1]);

    let pad = Math.max(aabb[0].vectorDistance(aabb[1])*0.001, 0.001);

    aabb[0].subScalar(pad);
    aabb[1].addScalar(pad);

    let cd_grid = useGrids ? GridBase.meshGridOffset(mesh) : -1;
    let tottri = 0;

    if (cd_grid >= 0) {
      //estimate tottri from number of grid points
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        tottri += grid.points.length*2;
      }
    } else {
      tottri = ~~(mesh.loopTris.length/3);
    }

    //tottri is used by the SpatialHash subclass
    let bvh = new this(mesh, aabb[0], aabb[1], tottri);
    //console.log("Saved tri freelist:", freelist);

    console.log("isDeforming", deformMode);

    bvh.isDeforming = deformMode;
    bvh.cd_grid = cd_grid;

    if (deformMode) {
      bvh.root.calcBoxVerts();
    }

    if (freelist) {
      bvh.freelist = freelist;
    }

    if (leafLimit !== undefined) {
      bvh.leafLimit = leafLimit;
    } else {
      bvh.leafLimit = mesh.bvhSettings.leafLimit;
    }

    if (depthLimit !== undefined) {
      bvh.depthLimit = depthLimit;
    } else {
      bvh.depthLimit = mesh.bvhSettings.depthLimit;
    }

    bvh.drawLevelOffset = mesh.bvhSettings.drawLevelOffset;

    if (useGrids && cd_grid >= 0) {
      bvh.cd_node = mesh.loops.customData.getNamedLayerIndex(cdname, CDNodeInfo);
    } else {
      bvh.cd_node = mesh.verts.customData.getNamedLayerIndex(cdname, CDNodeInfo);
    }

    const cd_node = bvh.cd_node;

    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        for (let v of grid.points) {
          v.customData[cd_node].vel.zero();
          v.customData[cd_node].node = undefined;
        }
      }
    } else {
      for (let v of mesh.verts) {
        v.customData[cd_node].vel.zero();
        v.customData[cd_node].node = undefined;
      }
    }

    //bvh.cd_face_node = mesh.faces.customData.getLayerIndex(CDNodeInfo);
    bvh.storeVerts = storeVerts;

    if (cd_grid >= 0) {
      let rand = new util.MersenneRandom(0);
      const cd_node = bvh.cd_node;

      //we carefully randomize insertion order
      let tris = [];

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        //reset any temporary data
        //we do this to prevent convergent behavior
        //across bvh builds
        //grid.stripExtraData();
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.recalcFlag = QRecalcFlags.EVERYTHING;
        //grid.recalcFlag |= QRecalcFlags.TOPO | QRecalcFlags.NORMALS | QRecalcFlags.NEIGHBORS;
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        for (let p of grid.points) {
          p.customData[cd_node].node = undefined;
        }

        grid.update(mesh, l, cd_grid);
        //grid.recalcNeighbors(mesh, l, cd_grid);

        let a = tris.length;
        grid.makeBVHTris(mesh, bvh, l, cd_grid, tris);
        grid.updateMirrorFlags(mesh, l, cd_grid);
      }

      times.push(util.time_ms()); //4

      while (tris.length > 0) {
        let i = (~~(rand.random()*tris.length/5*0.99999))*5;
        let i2 = tris.length - 5;

        bvh.addTri(tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4]);

        for (let j = 0; j < 5; j++) {
          tris[i + j] = tris[i2 + j];
        }

        tris.length -= 5;
      }

      times.push(util.time_ms()); //5

      for (let node of bvh.nodes) {
        if (node.leaf) {
          node.flag |= BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW;
          bvh.updateNodes.add(node);
        }
      }

      times.push(util.time_ms()); //6

      bvh.root.update();

      times.push(util.time_ms()); //7
    } else {
      let ltris = mesh.loopTris;

      let order = new Array(ltris.length/3);

      for (let i = 0; i < ltris.length; i += 3) {
        order[~~(i/3)] = i;
      }

      for (let i = 0; i < order.length>>1; i++) {
        let ri = ~~(util.random()*order.length*0.99999);
        let t = order[ri];

        order[ri] = order[i];
        order[i] = t;
      }

      /*
      order.sort((a, b) => {
        a = ltris[a];
        b = ltris[b];

        let f = a.v[0] - b.v[0];
        let eps = 0.001;

        if (Math.abs(f) < eps) {
          f = a.v[1] - b.v[1];
        }

        if (Math.abs(f) < eps) {
          f = a.v[2] - b.v[2];
        }

        return f;
      }) //*/

      for (let ri of order) {
        let i = ri;
        let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

        bvh.addTri(l1.f.eid, i, l1.v, l2.v, l3.v, undefined, l1, l2, l3);
      }

      if (addWireVerts) {
        for (let v of mesh.verts) {
          let wire = true;

          for (let e of v.edges) {
            if (e.l) {
              wire = false;
              break;
            }
          }

          if (!wire) {
            continue;
          }

          bvh.addWireVert(v);
        }
      }
    }


    times.push(util.time_ms());

    //deform mode assigns verts to nodes only if they
    //lie within the node's hexahedron. fix any orphans.
    if (bvh.isDeforming) {
      bvh._fixOrphanDefVerts(mesh.verts);
    }
    //update aabbs
    bvh.update();

    if (onCreate) {
      onCreate(bvh);
    }

    times.push(util.time_ms());

    for (let i = 1; i < times.length; i++) {
      times[i] -= times[0];
      times[i] = (times[i]/1000).toFixed(3);
    }

    times[0] = 0.0;

    console.log("times", times);
    return bvh;
  }

  makeNodeDefTexture() {
    let leaves = util.list(this.leaves);

    let size = Math.ceil(leaves.length*8*3/4);
    size = Math.max(size, 16);

    let dimen = Math.ceil(Math.sqrt(size));
    let f = Math.ceil(Math.log(dimen)/Math.log(2.0));
    dimen = Math.pow(2.0, f);

    let tex = new Float32Array(dimen*dimen*4);
    console.log("dimen", dimen);

    tex.fill(0);

    let li = 0;
    let i = 0;

    let elemSize = 8*4;

    //since dimen is a multiply of 8, we should be able
    //to get away with assuming each entry lies within
    //only one row of the texture

    for (let node of this.leaves) {
      node.leafIndex = li;

      let idx = i/4;
      let u = idx%dimen;
      let v = ~~(idx/dimen);

      //v = dimen - 1 - v;

      u = (u/dimen) + 0.00001;
      v = (v/dimen) + 0.00001;

      node.leafTexUV[0] = u;
      node.leafTexUV[1] = v;

      for (let v of node.boxverts) {
        tex[i++] = v[0];
        tex[i++] = v[1];
        tex[i++] = v[2];
        tex[i++] = 0.0;
      }

      li++;
    }

    return {
      data: tex,
      dimen
    };
  }

  _fixOrphanDefVerts(vs) {
    const cd_node = this.cd_node;
    let ret = false;

    `
    for (let v of vs) {
      let ok = false;

      for (let e of v.edges) {
        if (e.l) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        continue;
      }

      if (!v.customData[cd_node].node) {
        console.warn("Orphaned vertex!", v);
      }
    }`;

    for (let n of this.leaves) {
      for (let tri of n.allTris) {
        for (let i = 0; i < 3; i++) {
          let v = tri.vs[i];
          let cdn = v.customData[cd_node];

          if (!cdn.node) {
            //console.warn("Orphaned deform vert", v);

            cdn.node = n;

            n.otherVerts.delete(v);
            n.uniqueVerts.add(v);
            n.setUpdateFlag(BVHFlags.UPDATE_BOUNDS | BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_DRAW);

            ret = true;
          }
        }
      }
    }

    return ret;
  }

  splitToUniformDepth() {
    let maxdepth = 0;

    let vs = new Set();

    for (let n of this.leaves) {
      for (let tri of n.allTris) {
        for (let v of tri.vs) {
          vs.add(v);
        }
      }
      maxdepth = Math.max(n.depth, maxdepth);
    }

    console.log("maxdepth:", maxdepth);
    let rec = (n) => {
      if (n.depth >= maxdepth) {
        return;
      }

      if (n.leaf) {
        n.split(2);

        for (let child of n.children) {
          //child.update();
        }
      }

      for (let child of util.list(n.children)) {
        if (child.leaf && child.allTris.size === 0) {
          n.children.remove(child);
          this.nodes.remove(child);

          child.leaf = false;
          continue;
        }

        rec(child);
      }

      n.children = n.children.filter(f => f);
    }

    let leaves = util.list(this.leaves);
    for (let node of leaves) {
      if (!node.leaf) { //node was destroyed for being empty?
        continue;
      }

      rec(node);
    }

    this._fixOrphanDefVerts(vs);
  }

  getNodeVertex(co) {
    let prec = 1000;
    let x = ~~(co[0]*prec);
    let y = ~~(co[1]*prec);
    let z = ~~(co[2]*prec);

    let key = x + ":" + y + ":" + z;
    let v = this.nodeVertHash.get(key);

    if (v) {
      return v;
    }

    v = new BVHNodeVertex(co);
    v.id = this._node_elem_idgen++;

    this.nodeVerts.push(v);
    this.nodeVertHash.set(key, v);

    return v;
  }

  getNodeEdge(node, v1, v2) {
    let key = Math.min(v1.id, v2.id) + ":" + Math.max(v1.id, v2.id);
    let e = this.nodeEdgeHash.get(key);

    if (e) {
      node.boxedges.push(e);
      return e;
    }

    e = new BVHNodeEdge(v1, v2);
    e.id = this._node_elem_idgen++;

    v1.edges.push(e);
    v2.edges.push(e);


    this.nodeEdges.push(e);
    this.nodeEdgeHash.set(key, e);
    node.boxedges.push(e);

    return e;
  }

  origCoStart(cd_orig) {
    this.cd_orig = cd_orig;
    this.origGen++;

    for (let node of this.nodes) {
      if (node.leaf) {
        node.flag |= BVHFlags.UPDATE_ORIGCO_VERTS;
      }
    }
  }

  //attempt to sort mesh spatially within memory

  _checkCD() {
    if (this.cd_grid >= 0) {
      this.cd_grid = GridBase.meshGridOffset(this.mesh);
    }

    let cdata;

    if (this.cd_grid >= 0) {
      cdata = this.mesh.loops.customData;
    } else {
      cdata = this.mesh.verts.customData;
    }

    let layer = cdata.flatlist[this.cd_node];

    if (!layer || layer.typeName !== "bvh") {
      this.cd_node = cdata.getLayerIndex("bvh");
    }
  }

  checkCD() {
    this._checkCD();
  }

  //in an attempt to improve cpu cache performance
  spatiallySortMesh() {
    let mesh = this.mesh;

    console.error("spatiallySortMesh called");

    //first destroy node references
    let elist;
    let cd_node = this.cd_node;

    if (this.cd_grid >= 0) {
      let cd_grid = this.cd_grid;
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        for (let p of grid.points) {
          p.customData[cd_node].node = undefined;
        }
      }
    } else {
      for (let v of mesh.verts) {
        v.customData[cd_node].node = undefined;
      }
    }

    let doneflag = MeshFlags.TEMP2;
    let updateflag = MeshFlags.UPDATE;
    let allflags = doneflag;


    for (let elist of mesh.getElemLists()) {
      let i = 0;

      for (let elem of elist) {
        elem.flag &= ~allflags;
        elem.index = i++;
      }
    }

    let verts = util.list(mesh.verts);
    let edges = util.list(mesh.edges);
    let faces = util.list(mesh.faces);
    let loops = util.list(mesh.loops);
    let handles = util.list(mesh.handles);

    let newvs = new Array(verts.length);
    let newhs = new Array(handles.length);
    let newes = new Array(edges.length);
    let newls = new Array(loops.length);
    let newfs = new Array(faces.length);

    let elists = mesh.elists;

    mesh.elists = {};
    mesh.verts = mesh.getElemList(MeshTypes.VERTEX);
    mesh.edges = mesh.getElemList(MeshTypes.EDGE);
    mesh.handles = mesh.getElemList(MeshTypes.HANDLE);
    mesh.loops = mesh.getElemList(MeshTypes.LOOP);
    mesh.faces = mesh.getElemList(MeshTypes.FACE);

    for (let k in mesh.elists) {
      let elist1 = mesh.elists[k];
      let elist2 = elists[k];

      elist1.customData = elist2.customData;
    }

    if (WITH_EIDMAP_MAP) {
      mesh.eidMap = new Map();
      mesh._recalcEidMap = true;
    } else {
      mesh.eidmap = {};
    }

    let visit = new WeakSet();
    let fleaves = [];

    for (let n of this.nodes) {
      if (!n.leaf) {
        continue;
      }

      let fs = [];

      for (let t of n.uniqueTris) {
        let f = mesh.eidMap.get(t.id) || t.f || (t.l1 ? t.l1.f : undefined);

        if (f === undefined) {
          continue;
        }

        if (!visit.has(f) && f.type === MeshTypes.FACE) {
          fs.push(f);
          visit.add(f);
        }
      }

      if (fs.length > 0) {
        fleaves.push(fs);
      }
    }

    console.log(fleaves);

    function copyCustomData(cd) {
      let ret = new Array(cd.length);
      for (let i = 0; i < ret.length; i++) {
        ret[i] = cd[i].copy();
      }

      return ret;
    }

    for (let fs of fleaves) {
      for (let f of fs) {
        for (let l of f.loops) {
          let v = l.v;

          if (newvs[v.index]) {
            continue;
          }

          let v2 = newvs[v.index] = new Vertex(v);

          v2.eid = v.eid;
          mesh.eidMap.set(v2.eid, v2);
          mesh.eidmap[v2.eid] = v2;

          v2.customData = copyCustomData(v.customData);

          v2.no.load(v.no);
          v2.flag = v.flag | updateflag;

          mesh.verts.push(v2);
        }

        for (let l of f.loops) {
          let e = l.e;

          if (newes[e.index]) {
            continue;
          }

          let e2 = newes[e.index] = new Edge();

          if (EDGE_LINKED_LISTS) {
            e.v1next = e.v1prev = e;
            e.v2next = e.v2prev = e;
          }

          e2.eid = e.eid;
          e2.customData = copyCustomData(e.customData);
          e2.flag = e.flag | updateflag;

          e2.length = e.length;
          e2.v1 = newvs[e.v1.index];
          e2.v2 = newvs[e.v2.index];

          if (e.h1 && !e2.h1) {
            for (let step = 0; step < 2; step++) {
              let h1 = step ? e.h2 : e.h1;
              let h2 = new Handle(h1);

              h2.owner = e2;
              h2.roll = h1.roll;
              h2.mode = h1.mode;
              h2.flag = h1.flag | updateflag;
              h2.index = h1.index;

              if (step) {
                e.h2 = h2;
              } else {
                e.h1 = h2;
              }

              h2.eid = h1.eid;
              mesh.eidMap.set(h2.eid, h2);
              mesh.handles.push(h2);
            }
          }

          mesh.edges.push(e2);
          mesh.eidMap.set(e2.eid, e2);
          mesh.eidmap[e2.eid] = e2;

          mesh._diskInsert(e2.v1, e2);
          mesh._diskInsert(e2.v2, e2);
        }

        let f2 = newfs[f.index] = new Face();

        f2.eid = f.eid;
        f2.flag = f.flag | updateflag;
        f2.customData = copyCustomData(f.customData);
        f2.no.load(f.no);
        f2.area = f.area;
        f2.cent.load(f.cent);

        mesh.eidMap.set(f2.eid, f2);
        mesh.eidmap[f2.eid] = f2;
        mesh.faces.push(f2);

        for (let list1 of f.lists) {
          let list2 = new LoopList();
          list2.flag = list1.flag;

          f2.lists.push(list2);

          let l1 = list1.l;
          let prevl = undefined;
          let _i = 0;

          do {
            let l2 = new Loop();

            l2.customData = copyCustomData(l1.customData);
            l2.eid = l1.eid;
            l2.flag = l1.flag;
            l2.index = l1.index;

            l2.v = newvs[l1.v.index];
            l2.e = newes[l1.e.index];
            l2.list = list2;
            l2.f = f2;

            mesh.eidMap.set(l2.eid, l2);
            mesh.eidmap[l2.eid] = l2;
            mesh.loops.push(l2);

            if (prevl) {
              l2.prev = prevl;
              prevl.next = l2;
            } else {
              list2.l = l2;
            }

            prevl = l2;

            if (_i++ > 1000000) {
              console.error("infinite loop error");
              break;
            }
            l1 = l1.next
          } while (l1 !== list1.l);

          list2.l.prev = prevl;
          prevl.next = list2.l;
          list2._recount();
        }

        for (let l of f2.loops) {
          mesh._radialInsert(l.e, l);
        }
      }
    }

    for (let elist of mesh.getElemLists()) {
      let oelist = elists[elist.type];

      let i = 0;
      let act = oelist.active;

      for (let elem of elist) {
        if (elem.flag & MeshFlags.SELECT) {
          elist.setSelect(elem, true);
        }

        if (act && i === act.index) {
          elist.setActive(elem);
        }
        i++;
      }
    }

    //don't allow this.destroy to be called
    mesh.bvh = undefined;

    //ensure ltris are dead
    mesh._ltris = [];

    mesh.regenAll();
    mesh.recalcNormals();
    mesh.graphUpdate();

    this.nodes = [];
  }

  oldspatiallySortMesh(mesh) {
    let verts = mesh.verts;
    let edges = mesh.edges;
    let faces = mesh.faces;
    let loops = mesh.loops;
    let handles = mesh.handles;
    let eidMap = mesh.eidMap;

    mesh.elists = {};
    mesh.verts = mesh.getElemList(MeshTypes.VERTEX);
    mesh.edges = mesh.getElemList(MeshTypes.EDGE);
    mesh.handles = mesh.getElemList(MeshTypes.HANDLE);
    mesh.loops = mesh.getElemList(MeshTypes.LOOP);
    mesh.faces = mesh.getElemList(MeshTypes.FACE);

    mesh.eidMap = {};
    let idcur = mesh.eidgen._cur;

    verts = util.list(verts);
    faces = util.list(faces);
    edges = util.list(edges);

    let cd_node = this.cd_node;

    for (let f of faces) {
      f.index = -1;
    }

    for (let e of edges) {
      e.index = -1;
    }

    for (let v of verts) {
      let node = v.customData[cd_node].node;

      if (!node) {
        v.index = -1;
        continue;
      }

      v.index = node.id;

      if (Math.random() > 0.999) {
        console.log(v, node.id);
      }

      for (let e of v.edges) {
        if (e.index === -1) {
          e.index = v.index;
        }

        for (let l of e.loops) {
          if (l.f.index === -1) {
            l.f.index = v.index;
          }
        }
      }
    }

    verts.sort((a, b) => a.index - b.index);
    edges.sort((a, b) => a.index - b.index);
    faces.sort((a, b) => a.index - b.index);

    for (let v1 of verts) {
      let v2 = mesh.makeVertex(v1, v1.eid);
      mesh.copyElemData(v2, v1);
    }

    for (let e1 of edges) {
      let eid = e1.eid;

      let e2 = mesh.makeEdge(mesh.eidMap[e1.v1.eid], mesh.eidMap[e1.v2.eid], undefined, eid);
      mesh.copyElemData(e2, e1);
    }

    let vs = [];
    for (let f1 of faces) {
      let f2;

      for (let list of f1.lists) {
        vs.length = 0;

        for (let l of list) {
          vs.push(mesh.eidMap[l.v.eid]);
        }

        if (list === f1.lists[0]) {
          f2 = mesh.makeFace(vs, f1.eid);
          mesh.copyElemData(f2, f1);
        } else {
          mesh.makeHole(f2, vs);
        }
      }

      for (let i = 0; i < f1.lists.length; i++) {
        let list1 = f1.lists[i], list2 = f2.lists[i];

        let l1 = list1.l, l2 = list2.l;
        let _i = 0;
        do {
          mesh.copyElemData(l2, l1);

          if (_i++ > 100000) {
            console.warn("Infinite loop error");
            break;
          }

          l1 = l1.next;
          l2 = l2.next;
        } while (l1 !== list1.l);
      }
    }

    mesh.regenAll();
    mesh.regenBVH();
    mesh.recalcNormals();
    mesh.graphUpdate();
  }

  destroy(mesh) {
    console.error("BVH.destroy called");

    if (this.dead) {
      return;
    }

    this.dead = true;

    let freelist = this.freelist;

    this.freelist = undefined;
    for (let tri of this.tris.values()) {
      tri.v1 = tri.v2 = tri.v3 = tri.l1 = tri.l2 = tri.l3 = tri.f = undefined;
      tri.vs[0] = tri.vs[1] = tri.vs[2] = undefined;

      freelist.push(tri);
    }

    this._checkCD();

    let cd_node = this.cd_node;
    let cd_grid = this.cd_grid;

    //let cd_face_node = this.cd_face_node;

    if (cd_node < 0) {
      return freelist;
    }

    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.relinkCustomData();

        for (let p of grid.points) {
          //console.log(p.customData, cd_node);
          p.customData[cd_node].node = undefined;
        }
      }
    } else {
      for (let v of mesh.verts) {
        v.customData[cd_node].node = undefined;
      }
    }

    if (this.glLeafTex && window._gl) { //XXX evil global ref
      this.glLeafTex.destroy(window._gl);
      this.glLeafTex = undefined;
    }

    for (let n of this.nodes) {
      if (n.drawData) {
        n.drawData.destroy();
        n.drawData = undefined;
      }
    }

    this.root = undefined;
    this.nodes = undefined;
    this.mesh = undefined;
    this.node_idmap = undefined;
    this.verts = undefined;
    this.updateNodes = undefined;
    this.tris = undefined;
    this.fmap = undefined;

    this.cd_node = -1;
    this.cd_grid = -1;

    //for (let f of mesh.faces) {
    //  f.customData[cd_face_node].node = undefined;
    //}

    return freelist;
  }

  preallocTris(count = 1024*128) {
    for (let i = 0; i < count; i++) {
      this.freelist.push(new BVHTri());
    }
  }

  closestOrigVerts(co, radius) {
    let ret = new Set();

    this.root.closestOrigVerts(co, radius, ret);

    return ret;
  }

  facesInCone(origin, ray, radius1, radius2, visibleOnly = true, isSquare = false) {
    origin = _fictmpco.load(origin);

    let ret = new Set();

    if (!this.root) {
      return ret;
    }

    this.root.facesInCone(origin, ray, radius1, radius2, visibleOnly, isSquare, ret);

    return ret;
  }

  vertsInCone(origin, ray, radius1, radius2, isSquare = false) {
    let ret = new Set();

    if (!this.root) {
      return new Set();
    }

    this.root.vertsInCone(origin, ray, radius1, radius2, isSquare, ret);

    return ret;
  }

  vertsInTube(origin, ray, radius, clip = false) {
    let ret = new Set();

    if (!clip) {
      ray = new Vector3(ray);
      ray.normalize();
    }

    this.root.vertsInTube(origin, ray, radius, clip, ret);

    return ret;
  }

  nearestVertsN(co, n) {
    let ret = new Set();
    let heap = new util.MinHeapQueue();
    let visit = new WeakSet();
    let mindis = [undefined];

    this._i = 0;
    this.root.nearestVertsN(co, n, heap, mindis);

    n = Math.min(n, heap.length);
    console.log("HEAP LEN", heap.length);

    //while (heap.length > n) {
//      heap.pop();
    // }

    for (let i = 0; i < n; i++) {
      let item = heap.pop();

      if (item) {
        //console.log(item.eid);
        ret.add(item);
      }
    }

    return ret;
  }

  closestVerts(co, radius) {
    let ret = new Set();

    this.root.closestVerts(co, radius, ret);

    return ret;
  }

  closestVertsSquare(co, radius, matrix) {
    let ret = new Set();

    let origco = co;

    co = cvstmps2.next().load(co);
    co.multVecMatrix(matrix);

    let min = cvstmps2.next();
    let max = cvstmps2.next();

    min.load(co).addScalar(-radius);
    max.load(co).addScalar(radius);

    this.root.closestVertsSquare(co, origco, radius, matrix, min, max, ret);

    return ret;
  }

  closestTris(co, radius) {
    let ret = new Set();

    this.root.closestTris(co, radius, ret);

    return ret;
  }

  closestTrisSimple(co, radius) {
    let ret = new Set();

    this.root.closestTrisSimple(co, radius, ret);

    return ret;
  }

  closestPoint(co) {
    return this.root.closestPoint(co);
  }

  castRay(origin, dir) {
    if (!this.root) {
      return undefined;
    }

    dir = this.dirtemp.load(dir);
    dir.normalize();

    return this.root.castRay(origin, dir);
  }

  getFaceTris(id) {
    return this.fmap.get(id);
  }

  removeFace(id, unlinkVerts = false, joinNodes = false) {
    if (!this.fmap.has(id)) {
      return;
    }

    let tris = this.fmap.get(id);

    for (let t of tris) {
      if (t.node) {
        t.node.flag |= BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_TOTTRI | BVHFlags.UPDATE_INDEX_VERTS;
      }

      this._removeTri(t, true, unlinkVerts, joinNodes);
      this.tris.delete(t.tri_idx);
    }

    this.fmap.delete(id);
  }

  _nextTriIdx() {
    //XXX
    return ~~(Math.random()*1024*1024*32);
    this.tri_idgen++;

    return this.tri_idgen;
  }

  checkJoin(node) {
    //return;
    if (this.isDeforming) {
      return;
    }

    if (!node.parent || node.parent === this.root) {
      return;
    }

    let p = node;
    let join = false;
    let lastp;
    let lastp2;

    while (p) {
      if (p.tottri > this.leafLimit/1.5 || p.shapeTest(false)) {
        break;
      }

      node = lastp;
      lastp2 = lastp;
      lastp = p;
      p = p.parent;
    }
    let tot = 0;

    if (lastp && !lastp.leaf && !lastp.shapeTest(false) && lastp.tottri < this.leafLimit/1.5) {
      join = true;
      p = lastp;
    }

    if (join) {
      let cd_node = this.cd_node;

      //console.log("EMPTY node!", p.children);
      let allTris = new Set();

      let rec = (n) => {
        if (n.id >= 0) {
          this._remNode(n);
        }

        if (!n.leaf) {
          for (let c of n.children) {
            rec(c);
          }

          return;
        }

        for (let v of n.uniqueVerts) {
          let node = v.customData[cd_node];
          if (node.node === n) {
            node.node = undefined;
          }
        }

        for (let tri of n.allTris) {
          if (tri.nodes.indexOf(n) >= 0) {
            tri.nodes.remove(n);
          }
          if (tri.node === n) {
            tri.node = undefined;
          }
          allTris.add(tri);
        }
      }

      for (let n2 of p.children) {
        rec(n2);
      }

      p.tottri = 0;
      p.children = [];

      p.leaf = true;

      p.allTris = new Set();
      p.uniqueTris = new FakeSet(); //new Set();
      p.otherTris = new Set();
      p.uniqueVerts = new Set();
      p.otherVerts = new Set();
      p.indexVerts = [];
      p.indexLoops = [];
      p.indexTris = [];
      p.indexEdges = [];

      for (let tri of allTris) {
        p.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3, undefined, tri.l1, tri.l2, tri.l3);
      }

      p.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_TOTTRI | BVHFlags.UPDATE_OTHER_VERTS;
      p.flag |= BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_UNIQUE_VERTS;

      this.updateNodes.add(p);
    }
  }

  joinNode(node, addToRoot = false) {
    let p = node;

    if (this.isDeforming) {
      console.warn("joinNode called in deforming mode");
      return;
    }

    if (!node.parent || node.parent === this.root || node.leaf) {
      return;
    }

    let cd_node = this.cd_node;

    //console.log("EMPTY node!", p.children);
    let allTris = new Set();

    let rec = (n) => {
      if (n.id >= 0) {
        this._remNode(n);
      }

      if (!n.leaf) {
        for (let c of n.children) {
          rec(c);
        }

        return;
      }

      for (let v of n.uniqueVerts) {
        let node = v.customData[cd_node];
        if (node.node === n) {
          node.node = undefined;
        }
      }

      for (let tri of n.allTris) {
        if (tri.nodes.indexOf(n) >= 0) {
          tri.nodes.remove(n);
        }
        if (tri.node === n) {
          tri.node = undefined;
        }
        allTris.add(tri);
      }
    }

    for (let n2 of p.children) {
      rec(n2);
    }

    p.tottri = 0;
    p.children = [];

    p.leaf = true;

    p.allTris = new Set();
    p.uniqueTris = new FakeSet(); //new Set();
    p.otherTris = new Set();
    p.uniqueVerts = new Set();
    p.otherVerts = new Set();
    p.indexVerts = [];
    p.indexLoops = [];
    p.indexTris = [];
    p.indexEdges = [];

    let addp = addToRoot ? this.root : p;

    for (let tri of allTris) {
      addp.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3, undefined, tri.l1, tri.l2, tri.l3);
    }

    p.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_TOTTRI | BVHFlags.UPDATE_OTHER_VERTS;
    p.flag |= BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_UNIQUE_VERTS;

    this.updateNodes.add(p);

  }

  removeTri(tri) {
    this._removeTri(tri, false, false);
    this.tris.delete(tri.tri_idx);
  }

  getDebugCounts() {
    return {
      totAlloc: this.totTriAlloc,
      totFreed: this.totTriFreed
    }
  }

  _removeTri(tri, partial = false, unlinkVerts, joinNodes = false) {
    if (tri.removed) {
      return;
    }

    this.totTriFreed++;
    this.tottri--;

    let cd_node = this.cd_node;

    let updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
    updateflag |= BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_UNIQUE_VERTS;
    updateflag |= BVHFlags.UPDATE_OTHER_VERTS | BVHFlags.UPDATE_COLORS;

    if (unlinkVerts) {
      let n1 = tri.v1.customData[cd_node];
      let n2 = tri.v2.customData[cd_node];
      let n3 = tri.v3.customData[cd_node];

      if (n1.node && n1.node.uniqueVerts) {
        n1.node.uniqueVerts.delete(tri.v1);
        n1.node = undefined;
      }

      if (n2.node && n2.node.uniqueVerts) {
        n2.node.uniqueVerts.delete(tri.v2);
        n2.node = undefined;
      }

      if (n3.node && n3.node.uniqueVerts) {
        n3.node.uniqueVerts.delete(tri.v3);
        n3.node = undefined;
      }

      for (let node of tri.nodes) {
        node.otherVerts.delete(tri.v1);
        node.otherVerts.delete(tri.v2);
        node.otherVerts.delete(tri.v3);

        node.flag |= updateflag;
        this.updateNodes.add(node);
      }
    }

    tri.removed = true;

    //console.log("tri.nodes", tri.nodes.concat([]));

    for (let node of tri.nodes) {
      if (!node.allTris || !node.allTris.has(tri)) {
        //throw new Error("bvh error");
        console.warn("bvh error");
        continue;
      }

      node.allTris.delete(tri);
      //if (node.uniqueTris.has(tri)) {
      //XXX node.otherTris.delete(tri);
      //} else {
      node.uniqueTris.delete(tri);
      //}

      node.flag |= updateflag;

      this.updateNodes.add(node);

      node.tottri--;
    }

    if (joinNodes) {
      for (let node of tri.nodes) {
        this.checkJoin(node);
      }
    }

    this.flag |= BVHFlags.UPDATE_TOTTRI;

    tri.node = undefined;

    if (!partial) {
      let tris = this.fmap.get(tri.id);
      tris.remove(tri);
      this.tris.delete(tri);
    }

    for (let i = 0; i < tri.nodes.length; i++) {
      tri.nodes[i] = undefined;
    }

    tri.v1 = tri.v2 = tri.v3 = undefined;
    tri.l1 = tri.l2 = tri.l3 = undefined;
    tri.vs[0] = tri.vs[1] = tri.vs[2] = undefined;
    tri.f = undefined;

    if (ENABLE_CACHING) {
      this.freelist.push(tri);
    }
  }

  hasTri(id, tri_idx) {//, v1, v2, v3) {
    let tri = this.tris.get(tri_idx);
    return tri && !tri.removed;
  }

  _getTri1(id, tri_idx, v1, v2, v3) {
    let tri = new BVHTri(id, tri_idx);

    tri.area = math.tri_area(v1, v2, v3) + 0.00001;

    tri.v1 = v1;
    tri.v2 = v2;
    tri.v3 = v3;

    return tri;
  }

  _getTri(id, tri_idx, v1, v2, v3) {
    this.tri_idgen = Math.max(this.tri_idgen, tri_idx + 1);

    let tri = this.tris.get(tri_idx);

    if (!tri) {
      if (this.freelist.length > 0) {
        tri = this.freelist.pop();
        tri.id = id;
        tri.tri_idx = tri_idx;
        tri.nodes = [];
      } else {
        tri = new BVHTri(id, tri_idx);
      }

      this.totTriAlloc++;

      this.tottri++;
      this.tris.set(tri_idx, tri);
    }

    let trilist = this.fmap.get(id);
    if (!trilist) {
      trilist = [];
      this.fmap.set(id, trilist);
    }

    trilist.push(tri);

    tri.removed = false;

    if (tri.node && tri.node.uniqueTris) {
      tri.node.uniqueTris.delete(tri);
      tri.node = undefined;
    }

    tri.v1 = tri.vs[0] = v1;
    tri.v2 = tri.vs[1] = v2;
    tri.v3 = tri.vs[2] = v3;

    tri.no.load(v2).sub(v1);
    _ntmptmp.load(v3).sub(v1);
    tri.no.cross(_ntmptmp);

    if (isNaN(tri.no.dot(tri.no))) {
      console.error("NaN in bvh tri", tri, tri.v1, tri.v2, tri.v3);
      console.error("  vertex eids:", tri.v1.eid, tri.v2.eid, tri.v3.eid);
      tri.no.zero();
      tri.area = 0.0;
    } else {
      tri.no.normalize();
      tri.area = math.tri_area(v1, v2, v3) + 0.00001;
    }

    //tri.f = this.mesh.eidMap.get(id);

    return tri;
  }

  _newNode(min, max) {
    let node = new this.constructor.nodeClass(this, min, max);

    node.flag |= BVHFlags.UPDATE_OTHER_VERTS | BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_COLORS;

    node.index = this.nodes.length;
    node.id = this.node_idgen++;

    this.updateNodes.add(node);

    this.node_idmap.set(node.id, node);
    this.nodes.push(node);

    return node;
  }

  ensureIndices() {
    if (!this.needsIndexRebuild) {
      return;
    }

    this.needsIndexRebuild = false;
    let nodes = this.nodes;

    for (let i = 0; i < nodes.length; i++) {
      nodes[i].index = i;
    }
  }

  _remNode(node) {
    if (node.id < 0) {
      console.error("node already removed", node);
      return;
    }

    if (node.drawData) {
      node.drawData.destroy();
      node.drawData = undefined;
    }

    this.needsIndexRebuild = true;

    this.node_idmap.delete(node.id);
    node.id = -1;

    let ni = this.nodes.indexOf(node);
    let last = this.nodes.length - 1;

    if (ni >= 0) {
      this.nodes[ni] = this.nodes[last];
      this.nodes[last] = undefined;
      this.nodes.length--;
    }
  }

  updateTriCounts() {
    this.flag &= ~BVHFlags.UPDATE_TOTTRI;

    let rec = (n) => {
      if (!n.leaf) {
        n.tottri = 0;

        for (let c of n.children) {
          n.tottri += rec(c);
        }

        return n.tottri;
      } else {
        n.tottri = n.uniqueTris.size;

        return n.tottri;
      }
    }

    rec(this.root);
  }

  update() {
    if (this.dead) {
      console.error("BVH is dead!");
      return;
    }

    if (DYNAMIC_SHUFFLE_NODES) {
      let prune = false;
      for (let node of this.updateNodes) {
        if (node.id < 0) {
          continue;
        }

        if (Math.random() > 0.2) {
          continue;
        }

        let test = node.shapeTest(true);
        if (test === 2) {
          node.split(test);
        } else if (test === 3) {
          this.joinNode(node.parent);
        }
      }

      if (prune) {
        this.updateNodes = this.updateNodes.filter(n => n.id >= 0);
      }
    }

    if (this.updateNodes === undefined) {
      console.warn("Dead bvh!");
      return;
    }

    if (this.flag & BVHFlags.UPDATE_TOTTRI) {
      this.updateTriCounts();
    }

    let run_again = false;

    if (this.cd_grid >= 0) {
      for (let l of this.updateGridLoops) {
        let grid = l.customData[this.cd_grid];
        grid.update(this.mesh, l, this.cd_grid);
      }
    }

    let check_verts = false;

    for (let node of this.updateNodes) {
      if (node.flag & BVHFlags.UPDATE_UNIQUE_VERTS) {
        run_again = true;
        check_verts = true;
      }

      node.update();
    }

    if (run_again) {
      for (let node of this.updateNodes) {
        node.update();
      }
    }

    if (check_verts) {
      let this2 = this;

      let vs = (function* () {
        let visit = new WeakSet();

        for (let node of this2.leaves) {
          for (let v of node.otherVerts) {
            if (!visit.has(v)) {
              yield v;
            }
            visit.add(v);
          }
        }
      })();

      if (this._fixOrphanDefVerts(vs)) {
        for (let node of this.updateNodes) {
          node.update();
        }
      }
    }

    if (this.cd_grid >= 0) {
      let cd_grid = this.cd_grid;

      for (let l of this.updateGridLoops) {
        let grid = l.customData[cd_grid];

        grid.update(this.mesh, l, cd_grid);
      }

      this.updateGridLoops = new Set();
    } else if (this.updateGridLoops.size > 0) {
      this.updateGridLoops = new Set();
    }

    for (let node of this.updateNodes) {
      let p = node.parent;

      while (p) {
        p.min.zero().addScalar(1e17);
        p.max.zero().addScalar(-1e17);

        for (let c of p.children) {
          p.min.min(c.min);
          p.max.max(c.max);
        }

        p.cent.load(p.min).interp(p.max, 0.5);
        p.halfsize.load(p.max).sub(p.min).mulScalar(0.5);

        p = p.parent;
      }
    }

    this.updateNodes = new Set();
  }

  addWireVert(v) {
    return this.root.addWireVert(v);
  }

  addTri(id, tri_idx, v1, v2, v3, noSplit = false, l1 = undefined, l2 = undefined, l3 = undefined, addPass = 0) {
    /*
    this.root.min.min(v1);
    this.root.max.max(v1);
    this.root.min.min(v2);
    this.root.max.max(v2);
    this.root.min.min(v3);
    this.root.max.max(v3);

    this.root.cent.load(this.root.min).interp(this.root.max, 0.5);
    this.root.halfsize.load(this.root.max).sub(this.root.min);
    */

    let old = this.addPass;
    let ret = this.root.addTri(id, tri_idx, v1, v2, v3, noSplit, l1, l2, l3);
    this.addPass = addPass;

    return ret;
  }
}

BVH.nodeClass = BVHNode;

window._profileBVH = function (count = 4) {
  let mesh = _appstate.ctx.mesh;

  console.profile("bvh");
  for (let i = 0; i < count; i++) {
    mesh.regenBVH();
    mesh.getBVH();
  }
  console.profileEnd("bvh");
}

const hashsizes = [
  /*2, 5, 11, 19, 37, 67, 127, 223, 383, 653, 1117,*/ 1901, 3251,
                                                      5527, 9397, 15991, 27191, 46229, 78593, 133631, 227177, 38619,
                                                      656587, 1116209, 1897561, 3225883, 5484019, 9322861, 15848867,
                                                      26943089, 45803279, 77865577, 132371489, 225031553
];

let HNODE = 0, HKEY = 1, HTOT = 2;

let addmin = new Vector3();
let addmax = new Vector3();

export class SpatialHash extends BVH {
  constructor(mesh, min, max, tottri = 0) {
    super(mesh, min, max);

    this.dimen = this._calcDimen(tottri);
    this.hsize = 0;
    this.hused = 0;
    this.htable = new Array(hashsizes[this.hsize]*HTOT);

    this.depthLimit = 0;
    this.leafLimit = 1000000;

    this.hmul = new Vector3(max).sub(min);
    this.hmul = new Vector3().addScalar(1.0).div(this.hmul);

    Object.seal(this);
  }

  hashkey(co) {
    let dimen = this.dimen;

    let hmul = this.hmul;

    let x = ~~((co[0] - this.min[0])*hmul[0]*dimen);
    let y = ~~((co[1] - this.min[1])*hmul[1]*dimen);
    let z = ~~((co[2] - this.min[2])*hmul[2]*dimen);

    return z*dimen*dimen + y*dimen + x;
  }

  _resize(hsize) {
    this.hsize = hsize;
    let ht = this.htable;

    this.htable = new Array(hashsizes[this.hsize]*HTOT);

    for (let i = 0; i < ht.length; i += HTOT) {
      if (ht[i] !== undefined) {
        this._addNode(ht[i]);
      }
    }
  }

  _calcDimen(tottri) {
    return 2 + ~~(Math.log(tottri)/Math.log(3.0));
  }

  _lookupNode(key) {
    let ht = this.htable;
    let size = ~~(ht.length/HTOT);
    let probe = 0;
    let _i = 0;
    let idx;

    while (_i++ < 100000) {
      idx = (key + probe)%size;
      idx *= HTOT;

      if (ht[idx] === undefined) {
        break;
      }

      if (ht[idx + 1] === key) {
        return ht[idx];
      }

      probe = (probe + 1)*2;
    }

    return undefined;
  }

  checkJoin() {
    return false;
  }

  addTri(id, tri_idx, v1, v2, v3, noSplit                        = false,
         l1 = undefined, l2 = undefined, l3 = undefined, addPass = 0) {

    let tottri = this.tottri;

    if (this._calcDimen(tottri) > this.dimen + 4) {
      console.log("Dimen update", this.dimen, this._calcDimen(tottri));

    }

    let tri = this._getTri(id, tri_idx, v1, v2, v3);

    if (l1) {
      tri.l1 = l1;
      tri.l2 = l2;
      tri.l3 = l3;
    }

    let min = this.min, max = this.max, dimen = this.dimen;
    let hmul = this.hmul;

    let minx = Math.min(Math.min(v1[0], v2[0]), v3[0]);
    let miny = Math.min(Math.min(v1[1], v2[1]), v3[1]);
    let minz = Math.min(Math.min(v1[2], v2[2]), v3[2]);

    let maxx = Math.max(Math.max(v1[0], v2[0]), v3[0]);
    let maxy = Math.max(Math.max(v1[1], v2[1]), v3[1]);
    let maxz = Math.max(Math.max(v1[2], v2[2]), v3[2]);

    let x1 = Math.floor((minx - min[0])*hmul[0]*dimen);
    let y1 = Math.floor((miny - min[1])*hmul[1]*dimen);
    let z1 = Math.floor((minz - min[2])*hmul[2]*dimen);

    let x2 = Math.floor((maxx - min[0])*hmul[0]*dimen);
    let y2 = Math.floor((maxy - min[1])*hmul[1]*dimen);
    let z2 = Math.floor((maxz - min[2])*hmul[2]*dimen);

    x1 = Math.min(Math.max(x1, 0), dimen - 1);
    y1 = Math.min(Math.max(y1, 0), dimen - 1);
    z1 = Math.min(Math.max(z1, 0), dimen - 1);

    x2 = Math.min(Math.max(x2, 0), dimen - 1);
    y2 = Math.min(Math.max(y2, 0), dimen - 1);
    z2 = Math.min(Math.max(z2, 0), dimen - 1);

    tri.node = undefined;

    const updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_INDEX_VERTS
      | BVHFlags.UPDATE_BOUNDS | BVHFlags.UPDATE_NORMALS
      | BVHFlags.UPDATE_TOTTRI;

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        for (let z = z1; z <= z2; z++) {
          let key = z*dimen*dimen + y*dimen + x;
          let node = this._lookupNode(key);

          if (!node) {
            let min = new Vector3();
            let max = new Vector3();

            let eps = 0.000001;

            min[0] = (x/dimen + eps)/hmul[0] + this.min[0];
            min[1] = (y/dimen + eps)/hmul[1] + this.min[1];
            min[2] = (z/dimen + eps)/hmul[2] + this.min[2];

            console.log("Adding node", key, this.hashkey(min), [x, y, z]);

            max.load(this.max).sub(this.min).mulScalar(1.0/dimen).add(min);

            node = this._newNode(min, max);
            node.leaf = true;

            if (this.bvh.isDeforming) {
              node.calcBoxVerts();
            }

            this.updateNodes.add(node);

            node.flag |= BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_TOTTRI;
            node.flag |= BVHFlags.UPDATE_COLORS | BVHFlags.UPDATE_NORMALS;

            this._addNode(node);
          }

          node._pushTri(tri);
          node.setUpdateFlag(updateflag);
        }
      }
    }

    return tri;
  }

  castRay(origin, dir) {
    dir = this.dirtemp.load(dir);
    dir.normalize();

    let x1 = origin[0];
    let y1 = origin[1];
    let z1 = origin[2];

    let sz = this.min.vectorDistance(this.max)*4.0;

    let x2 = x1 + dir[0]*sz;
    let y2 = y1 + dir[1]*sz;
    let z2 = z1 + dir[2]*sz;

    let minx = Math.min(x1, x2);
    let miny = Math.min(y1, y2);
    let minz = Math.min(z1, z2);

    let maxx = Math.max(x1, x2);
    let maxy = Math.max(y1, y2);
    let maxz = Math.max(z1, z2);

    let minret = undefined;

    let cb = (node) => {
      let ret = node.castRay(origin, dir);

      if (ret && (!minret || (ret.t >= 0 && ret.t < minret.t))) {
        minret = ret;
      }
    }

    this._forEachNode(cb, minx, miny, minz, maxx, maxy, maxz);

    //console.log("castRay ret:", minret);

    return minret;
  }

  _forEachNode(cb, minx, miny, minz, maxx, maxy, maxz) {
    let min = this.min, max = this.max, dimen = this.dimen;
    let hmul = this.hmul;

    let x1 = Math.floor((minx - min[0])*hmul[0]*dimen);
    let y1 = Math.floor((miny - min[1])*hmul[1]*dimen);
    let z1 = Math.floor((minz - min[2])*hmul[2]*dimen);

    let x2 = Math.ceil((maxx - min[0])*hmul[0]*dimen);
    let y2 = Math.ceil((maxy - min[1])*hmul[1]*dimen);
    let z2 = Math.ceil((maxz - min[2])*hmul[2]*dimen);

    x1 = Math.min(Math.max(x1, 0), dimen - 1);
    y1 = Math.min(Math.max(y1, 0), dimen - 1);
    z1 = Math.min(Math.max(z1, 0), dimen - 1);

    x2 = Math.min(Math.max(x2, 0), dimen - 1);
    y2 = Math.min(Math.max(y2, 0), dimen - 1);
    z2 = Math.min(Math.max(z2, 0), dimen - 1);

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        for (let z = z1; z <= z2; z++) {
          let key = z*dimen*dimen + y*dimen + x;
          let node = this._lookupNode(key);

          if (node) {
            cb(node);
          }
        }
      }
    }
  }

  closestVerts(co, radius) {
    let eps = radius*0.01;

    let minx = co[0] - radius - eps;
    let miny = co[1] - radius - eps;
    let minz = co[2] - radius - eps;

    let maxx = co[0] + radius + eps;
    let maxy = co[1] + radius + eps;
    let maxz = co[2] + radius + eps;

    let ret = new Set();
    let rsqr = radius*radius;

    let cb = (node) => {
      if (node.wireVerts) {
        for (let v of node.wireVerts) {
          if (v.vectorDistanceSqr(co) <= rsqr) {
            ret.add(v);
          }
        }
      }

      for (let t of node.allTris) {
        if (t.v1.vectorDistanceSqr(co) <= rsqr) {
          ret.add(t.v1);
        }

        if (t.v2.vectorDistanceSqr(co) <= rsqr) {
          ret.add(t.v2);
        }

        if (t.v3.vectorDistanceSqr(co) <= rsqr) {
          ret.add(t.v3);
        }
      }
    };

    this._forEachNode(cb, minx, miny, minz, maxx, maxy, maxz);

    return ret;
  }

  _addNode(node) {
    if (this.hused > this.htable.length/3) {
      this._resize(this.hsize + 1);
    }

    let key = this.hashkey(node.min);
    let ht = this.htable;
    let size = ~~(ht.length/HTOT);
    let probe = 0;
    let _i = 0;
    let idx;

    while (_i++ < 100000) {
      idx = (key + probe)%size;
      idx *= HTOT;

      if (ht[idx] === undefined) {
        break;
      }

      probe = (probe + 1)*2;
    }

    ht[idx] = node;
    ht[idx + 1] = key;

    this.hused++;
  }
}
