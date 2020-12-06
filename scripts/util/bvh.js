import {Vector2, Vector3, Vector4, Matrix4, Quat} from './vectormath.js';
import * as math from './math.js';
import * as util from './util.js';
import {triBoxOverlap, aabb_ray_isect, ray_tri_isect} from './isect.js';

import {CDFlags, CustomDataElem} from "../mesh/customdata.js";
import {MeshTypes} from "../mesh/mesh_base.js";
import {GridBase} from "../mesh/mesh_grids.js";

import {QRecalcFlags} from "../mesh/mesh_grids.js";

let _triverts = [new Vector3(), new Vector3(), new Vector3()];

export const BVHFlags = {
  UPDATE_DRAW: 1,
  TEMP_TAG: 2,
  UPDATE_UNIQUE_VERTS: 4,
  UPDATE_NORMALS: 8,
  UPDATE_TOTTRI : 16
};


export class FakeSetIter {
  constructor() {
    this.ret = {done : false, value : undefined};
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

    this.i = i+1;

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
    this.id = id;
    this._id1 = _tri_idgen++;
    this.tri_idx = tri_idx;
    this.node = undefined;
    this.removed = false;

    this.no = new Vector3();

    this.f = f;

    this.vs = new Array(3);
    this.nodes = [];
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

export class CDNodeInfo extends CustomDataElem {
  constructor() {
    super();
    this.node = undefined;
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX, //see MeshTypes in mesh.js
      typeName: "bvh",
      uiTypeName: "bvh",
      defaultName: "bvh",
      flag: 0
    }
  }

  interp() {
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
    b.node = this.node;
  }
}

CDNodeInfo.STRUCT = nstructjs.inherit(CDNodeInfo, CustomDataElem) + `
}`;
nstructjs.register(CDNodeInfo);
CustomDataElem.register(CDNodeInfo);

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

export class BVHNode {
  constructor(bvh, min, max) {
    this.min = new Vector3(min);
    this.max = new Vector3(max);
    this.axis = 0;
    this.depth = 0;
    this.leaf = true;
    this.parent = undefined;
    this.bvh = bvh;
    this.index = -1;

    this.flag = BVHFlags.UPDATE_DRAW;

    this.tottri = 0;

    this.drawData = undefined;

    this.id = -1;
    this._id = _bvh_idgen++;

    this.uniqueVerts = new Set();
    this.uniqueTris = new Set(); //new Set();
    this.otherVerts = new Set();
    this.otherTris = new Set();

    this.allTris = new Set();
    this.children = [];

    this.subtreeDepth = 0;

    this.nodePad = 0.00001;

    this._castRayRets = util.cachering.fromConstructor(IsectRet, 64, true);

    this.cent = new Vector3(min).interp(max, 0.5);
    this.halfsize = new Vector3(max).sub(min).mulScalar(0.5);
  }

  split() {
    if (!this.leaf) {
      console.error("bvh split called on non-leaf node", this);
      return;
    }
    if (this.allTris.size === 0) {
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
    let uniqueTris = this.uniqueTris;
    let allTris = this.allTris;

    this.uniqueVerts = undefined;
    this.otherVerts = undefined;
    this.uniqueTris = undefined;
    this.allTris = undefined;

    this.tottri = 0; //will be regenerated later
    this.leaf = false;

    let axis = (this.axis + 1) % 3;

    let min = new Vector3(this.min), max = new Vector3(this.max);
    let split = 0;
    let tot = 0;

    if (1||this === this.bvh.root) {
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

    if (0) {
      for (let tri of allTris) {
        tri.nodes.remove(this);

        split += tri.v1[axis];
        split += tri.v2[axis];
        split += tri.v3[axis];

        tot += 3;
      }

      if (!tot) {
        split = max[axis] * 0.5 + min[axis] * 0.5;
      } else {
        split /= tot;
      }

      let dd = Math.abs(max[axis] - min[axis]) * 0.1;

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

      split = (min[axis]+max[axis])*0.5;
    }

    for (let i = 0; i < 2; i++) {
      if (!i) {
        max[axis] = split;
      } else {
        min.load(this.min);
        min[axis] = split;
        max.load(this.max);
      }

      let c = this.bvh._newNode(min, max);

      c.min.subScalar(this.nodePad);
      c.max.addScalar(this.nodePad);

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

    for (let tri of allTris) {
      this.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3);
    }
  }

  closestVerts(co, radius, out) {
    let radius2 = radius * radius;

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

    for (let v of this.otherVerts) {
      if (v.vectorDistanceSqr(co) < radius2) {
        //out.add(v);
      }
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

      if (!isect) {
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

  addTri_new(id, tri_idx, v1, v2, v3, noSplit=false) {
    let stack = addtri_stack;
    let si = 0;

    stack[si++] = this;

    let leafLimit = this.bvh.leafLimit;
    let depthLimit = this.bvh.depthLimit;

    let centx = (v1[0] + v2[0] + v3[0]) / 3.0;
    let centy = (v1[1] + v2[1] + v3[1]) / 3.0;
    let centz = (v1[2] + v2[2] + v3[2]) / 3.0;

    let tri = this.bvh._getTri(id, tri_idx, v1, v2, v3);
    let cd_node = this.bvh.cd_node;

    while (si > 0) {
      let node = stack[--si];

      if (!node) {
        break;
      }
      node.tottri++;

      if (!node.leaf) {
        let mindis = 1e17, closest;

        for (let i=0; i<2; i++) {
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
        if (!noSplit && node.uniqueTris.size >= leafLimit && node.depth <= depthLimit) {
          node.split();

          //push node back onto stack if split was successful
          if (!node.leaf) {
            stack[si++] = node;
            continue;
          }
        }

        if (!tri.node) {
          tri.node = node;
          node.uniqueTris.add(tri);
        }

        tri.nodes.push(node);

        node.allTris.add(tri);
        node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;

        let n1 = v1.customData[cd_node];
        if (!n1.node) {
          n1.node = node;
          node.uniqueVerts.add(v1);
        }

        let n2 = v2.customData[cd_node];
        if (!n2.node) {
          n2.node = node;
          node.uniqueVerts.add(v2);
        }

        let n3 = v3.customData[cd_node];
        if (!n3.node) {
          n3.node = node;
          node.uniqueVerts.add(v3);
        }

      }
    }
  }

  addTri() {
    //return this.addTri_old(...arguments);
    return this.addTri_new(...arguments);
  }

  addTri_old(id, tri_idx, v1, v2, v3, noSplit = false) {
    if (isNaN(v1.dot(v2)*v2.dot(v3))) {
      console.log(id, tri_idx, v1, v2, v3, noSplit);
      throw new Error("nan!");
    }

    if (!noSplit && this.leaf && this.uniqueTris.size >= this.bvh.leafLimit &&
        this.depth <= this.bvh.depthLimit) {
      //console.log(this.depth, this.id, this.allTris.size, this.uniqueTris.size);
      this.split();
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
            found |= 1 << ci;
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

      let closest, mindis=1e17, closesti;

      let ci2 = 0;
      for (let c of cs) {
        /*
        let dis = Math.abs(c.cent[c.axis] - v1[c.axis]);
        dis = Math.abs(c.cent[c.axis] - v2[c.axis]);
        dis = Math.abs(c.cent[c.axis] - v3[c.axis]);
        //*/

        let co = addtri_tempco1.zero();
        co.load(v1).add(v2).add(v3).mulScalar(1.0 / 3.0);
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
          closesti = (closesti+1) % cs.length;
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

    if (!tri.node) {
      tri.node = this;
      this.uniqueTris.add(tri);
    } else {
      this.otherTris.add(tri);
      //this.uniqueTris.add(tri);
    }

    tri.nodes.push(this);

    if (this.bvh.storeVerts) {
      this._addVert(v1);
      this._addVert(v2);
      this._addVert(v3);
    }

    this.allTris.add(tri);

    this.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
    //this.bvh.updateNodes.add(this);

    return tri;
  }

  _addVert(v) {
    let n = v.customData[this.bvh.cd_node];

    if (n.node === undefined) {
      n.node = this;
      this.uniqueVerts.add(v);
    } else {
      //XXX this.otherVerts.add(v);
    }
  }

  updateUniqueVerts() {
    this.flag &= ~BVHFlags.UPDATE_UNIQUE_VERTS;

    if (!this.leaf) {
      for (let c of this.children) {
        c.updateUniqueVerts();
      }

      return;
    }

    this.uniqueVerts = new Set();
    this.otherVerts = new Set();

    let cd_node = this.bvh.cd_node;

    for (let tri of this.allTris) {
      for (let i = 0; i < 3; i++) {
        let v = tri.vs[i];

        let cdn = v.customData[cd_node];

        if (cdn.node === undefined || cdn.node === this) {
          cdn.node = this;
          this.uniqueVerts.add(v);
        } else {
          //XXX this.otherVerts.add(v);
        }
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
      l = l !== undefined ? mesh.eidmap[l] : undefined;

      hasBoundary = hasBoundary || v.bLink !== undefined;

      if (!l) {
        continue;
      }

      ls.add(l);
    }

    if (0&&hasBoundary) {
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

      let l1 = mesh.eidmap[tri.v1.loopEid];
      let l2 = mesh.eidmap[tri.v2.loopEid];
      let l3 = mesh.eidmap[tri.v3.loopEid];

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

    if (this.bvh.cd_grid >= 0) {
      this.updateNormalsGrids();
      return;
    }

    let doneset = new WeakSet();

    for (let v of this.uniqueVerts) {
      v.no.zero();

      for (let e of v.edges) {
        if (!e.l) {
          continue;
        }

        let l = e.l;
        let _i = 0;

        do {
          if (!doneset.has(l.f)) {
            doneset.add(l.f);
            l.f.calcNormal();
          }

          v.no.add(l.f.no);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);
      }

      v.no.normalize();
    }
  }

  update(boundsOnly=false) {
    if (isNaN(this.min.dot(this.max))) {
      //throw new Error("eek!");
      console.error("NAN!", this, this.min, this.max);
      this.min.zero().subScalar(0.01);
      this.max.zero().addScalar(0.01);
    }

    if (!boundsOnly && this.leaf) {
      if (this.flag & BVHFlags.UPDATE_UNIQUE_VERTS) {
        this.updateUniqueVerts();
      } else if (this.flag & BVHFlags.UPDATE_NORMALS) {
        this.updateNormals();
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
    } else {
      if (this.flag & BVHFlags.UPDATE_UNIQUE_VERTS) {
        this.updateUniqueVerts();
      } else if (this.flag & BVHFlags.UPDATE_NORMALS) {
        this.updateNormals();
      }

      let min = this.min;
      let max = this.max;

      let omin = new Vector3(min);
      let omax = new Vector3(max);
      let size = (max[0]-min[0]) + (max[1]-min[1]) + (max[2]-min[2]);
      size /= 3.0;

      min.zero().addScalar(1e17);
      max.zero().addScalar(-1e17);

      for (let tri of this.uniqueTris) {
        min.min(tri.v1);
        max.max(tri.v1);

        min.min(tri.v2);
        max.max(tri.v2);

        min.min(tri.v3);
        max.max(tri.v3);
      }

      if (this.uniqueTris.size === 0) {
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

      this.cent.load(this.min).interp(this.max, 0.5);
      this.halfsize.load(this.max).sub(this.min).mulScalar(0.5);
    }
  }

  remTri(id) {

  }
}

export class BVH {
  constructor(mesh, min, max) {
    this.min = new Vector3(min);
    this.max = new Vector3(max);

    this.needsIndexRebuild = false;

    this.flag = 0;
    this.updateNodes = new Set();
    this.updateGridLoops = new Set();

    this.mesh = mesh;

    this.node_idgen = 1;

    this.forceUniqueTris = false;
    this.storeVerts = false;

    this.leafLimit = 256;
    this.drawLevelOffset = 0;
    this.depthLimit = 17;

    this.nodes = [];
    this.node_idmap = {};
    this.root = this._newNode(min, max);

    //note that ids are initially just the indices within mesh.loopTris
    this.tri_idgen = 0;

    this.cd_node = -1;
    //this.cd_face_node = -1;
    this.tris = new Map();
    this.fmap = new Map();

    this.verts = new Set();
    this.mesh = mesh;
    this.dirtemp = new Vector3();
  }

  destroy(mesh) {
    let cd_node = this.cd_node;
    //let cd_face_node = this.cd_face_node;

    //cd_face_node = mesh.faces.customData.getLayerIndex("bvh");
    cd_node = mesh.verts.customData.getLayerIndex("bvh");

    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid >= 0 && mesh.loops.customData.hasLayer(CDNodeInfo)) {
      cd_node = mesh.loops.customData.getLayerIndex("bvh");

      if (cd_node >= 0) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          grid.relinkCustomData();

          for (let p of grid.points) {
            //console.log(p.customData, cd_node);
            p.customData[cd_node].node = undefined;
          }
        }
      }
    }

    if (mesh.verts.customData.hasLayer(CDNodeInfo)) {
      cd_node = mesh.verts.customData.getLayerIndex(CDNodeInfo);

      for (let v of mesh.verts) {
        v.customData[cd_node].node = undefined;
      }
    }

    if (mesh.faces.customData.hasLayer(CDNodeInfo)) {
      cd_node = mesh.faces.customData.getLayerIndex(CDNodeInfo);

      for (let f of mesh.faces) {
        f.customData[cd_node].node = undefined;
      }
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

    //for (let f of mesh.faces) {
    //  f.customData[cd_face_node].node = undefined;
    //}
  }

  closestVerts(co, radius) {
    let ret = new Set();

    this.root.closestVerts(co, radius, ret);

    return ret;
  }

  castRay(origin, dir) {
    dir = this.dirtemp.load(dir);
    dir.normalize();

    return this.root.castRay(origin, dir);
  }

  removeFace(id, unlinkVerts=false, joinNodes=false) {
    if (!this.fmap.has(id)) {
      return;
    }

    let tris = this.fmap.get(id);

    for (let t of tris) {
      this._removeTri(t, true, unlinkVerts, joinNodes);
      this.tris.delete(t.tri_idx);
    }

    this.fmap.delete(id);
  }

  _nextTriIdx() {
    this.tri_idgen++;

    return this.tri_idgen;
  }

  checkJoin(node) {
    //return;
    if (!node.parent || node.parent === this.root) {
      return;
    }

    let p = node;
    let join = false;
    let lastp;

    while (p) {
      if (p.tottri > this.leafLimit/1.5) {
        break;
      }

      node = lastp;
      lastp  = p;
      p = p.parent;
    }
    let tot = 0;

    if (lastp && !lastp.leaf && lastp.tottri < this.leafLimit/1.5) {
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

      for (let tri of allTris) {
        p.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3);
      }

      p.flag |= BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_TOTTRI;
      this.updateNodes.add(p);
    }
  }

  _removeTri(tri, partial = false, unlinkVerts, joinNodes=false) {
    if (tri.removed) {
      return;
    }

    let cd_node = this.cd_node;

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
      //for (let node of tri.nodes) {
        //XXX node.otherVerts.delete(tri.v1);
        //XXX node.otherVerts.delete(tri.v2);
        //XXX node.otherVerts.delete(tri.v3);
      //}
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
        node.uniqueTris.delete(tri);
      //XXX node.otherTris.delete(tri);
      //}
      node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;

      this.updateNodes.add(node);

      node.tottri--;
    }

    if (joinNodes) {
      for (let node of tri.nodes) {
        this.checkJoin(node);
      }
    }

    this.flag |= BVHFlags.UPDATE_TOTTRI;

    tri.nodes.length = 0;
    tri.node = undefined;

    if (!partial) {
      let tris = this.fmap.get(tri.id);
      tris.remove(tri);
      this.tris.delete(tri);
    }
  }

  hasTri(id, tri_idx) {//, v1, v2, v3) {
    let tri = this.tris.get(tri_idx);
    return tri && !tri.removed;
  }

  _getTri1(id, tri_idx, v1, v2, v3) {
    let tri = new BVHTri(id, tri_idx);
    tri.v1 = v1;
    tri.v2 = v2;
    tri.v3 = v3;

    return tri;
  }

  _getTri(id, tri_idx, v1, v2, v3) {
    this.tri_idgen = Math.max(this.tri_idgen, tri_idx + 1);

    if (!this.tris.has(tri_idx)) {
      this.tris.set(tri_idx, new BVHTri(id, tri_idx));
    }

    if (!this.fmap.has(id)) {
      this.fmap.set(id, []);
    }

    let tri = this.tris.get(tri_idx);

    tri.removed = false;
    if (tri.node && tri.node.uniqueTris) {
      tri.node.uniqueTris.delete(tri);
      tri.node = undefined;
    }

    tri.v1 = tri.vs[0] = v1;
    tri.v2 = tri.vs[1] = v2;
    tri.v3 = tri.vs[2] = v3;

    //tri.no.load(math.normal_tri(v1, v2, v3));

    //tri.f = this.mesh.eidmap[id];

    this.fmap.get(id).push(tri);

    return tri;
  }

  _newNode(min, max) {
    let node = new BVHNode(this, min, max);

    node.index = this.nodes.length;
    node.id = this.node_idgen++;

    this.updateNodes.add(node);

    this.node_idmap[node.id] = node;
    this.nodes.push(node);

    return node;
  }

  ensureIndices() {
    if (!this.needsIndexRebuild) {
      return;
    }

    this.needsIndexRebuild = false;
    let nodes = this.nodes;

    for (let i=0; i<nodes.length; i++) {
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

    delete this.node_idmap[node.id];
    node.id = -1;

    let ni = this.nodes.indexOf(node);
    let last = this.nodes.length-1;

    if (ni >= 0) {
      this.nodes[ni] = this.nodes[last];
      this.nodes[last] = undefined;
      this.nodes.length--;
    }
  }

  static create(mesh, storeVerts = true, useGrids = true) {
    let times = [util.time_ms()]; //0

    mesh.updateMirrorTags();

    times.push(util.time_ms()); //1

    if (!mesh.verts.customData.hasLayer(CDNodeInfo)) {
      mesh.verts.addCustomDataLayer(CDNodeInfo, "bvh").flag |= CDFlags.TEMPORARY;
    }

    if (useGrids && GridBase.meshGridOffset(mesh) >= 0) {
      if (!mesh.loops.customData.hasLayer(CDNodeInfo)) {
        mesh.loops.addCustomDataLayer(CDNodeInfo, "bvh").flag |= CDFlags.TEMPORARY;
      }
    }

    if (!mesh.faces.customData.hasLayer(CDNodeInfo)) {
      mesh.faces.addCustomDataLayer(CDNodeInfo, "bvh").flag |= CDFlags.TEMPORARY;
    }

    times.push(util.time_ms()); //2

    let aabb = mesh.getBoundingBox(useGrids);

    times.push(util.time_ms()); //3

    aabb[0] = new Vector3(aabb[0]);
    aabb[1] = new Vector3(aabb[1]);

    let pad = Math.max(aabb[0].vectorDistance(aabb[1]) * 0.001, 0.001);

    aabb[0].subScalar(pad);
    aabb[1].addScalar(pad);

    let bvh = new BVH(mesh, aabb[0], aabb[1]);

    let cd_grid = bvh.cd_grid = useGrids ? GridBase.meshGridOffset(mesh) : -1;

    if (useGrids && cd_grid >= 0) {
      bvh.cd_node = mesh.loops.customData.getLayerIndex(CDNodeInfo);
    } else {
      bvh.cd_node = mesh.verts.customData.getLayerIndex(CDNodeInfo);
    }

    //bvh.cd_face_node = mesh.faces.customData.getLayerIndex(CDNodeInfo);
    bvh.storeVerts = storeVerts;

    if (cd_grid >= 0) {
      let rand = new util.MersenneRandom(0);
      let cd_node = bvh.cd_node;

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

        for (let p of grid.points) {
          p.customData[cd_node].node = undefined;

          p.bLink = undefined;
          p.bNext = p.bPrev = undefined;
        }

        grid.recalcFlag |= QRecalcFlags.TOPO|QRecalcFlags.NORMALS;
        grid.update(mesh, l, cd_grid);
        grid.recalcNeighbors(mesh, l, cd_grid);

        let a = tris.length;
        grid.makeBVHTris(mesh, bvh, l, cd_grid, tris);
        grid.updateMirrorFlags(mesh, l, cd_grid);
      }

      times.push(util.time_ms()); //4

      while (tris.length > 0) {
        let i = (~~(rand.random() * tris.length / 5 * 0.99999)) * 5;
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

      for (let i = 0; i < ltris.length; i += 3) {
        let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

        bvh.addTri(l1.f.eid, i, l1.v, l2.v, l3.v);
      }
    }

    times.push(util.time_ms());

    //update aabbs
    bvh.update();

    times.push(util.time_ms());
    for (let i=1; i<times.length; i++) {
      times[i] -= times[0];
      times[i] = (times[i]/1000).toFixed(3);
    }

    times[0] = 0.0;

    console.log("times", times);
    return bvh;
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
    if (this.updateNodes === undefined) {
      console.warn("Dead bvh!");
      return;
    }

    if (this.flag & BVHFlags.UPDATE_TOTTRI) {
      this.updateTriCounts();
    }

    for (let node of this.updateNodes) {
      node.update();
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

  addTri(id, tri_idx, v1, v2, v3, noSplit = false) {
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

    this.root.addTri(id, tri_idx, v1, v2, v3, noSplit);
  }

  //remTri(id) {

  //}
}
