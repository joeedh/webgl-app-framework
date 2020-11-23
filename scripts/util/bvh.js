import {Vector2, Vector3, Vector4, Matrix4, Quat} from './vectormath.js';
import * as math from './math.js';
import * as util from './util.js';
import {triBoxOverlap, aabb_ray_isect, ray_tri_isect} from './isect.js';

import {CustomDataElem} from "../mesh/customdata.js";
import {MeshTypes} from "../mesh/mesh_base.js";
import {GridBase} from "../mesh/mesh_grids.js";

let _triverts = new Array(3);

export const BVHFlags = {
  UPDATE_DRAW         : 1,
  TEMP_TAG            : 2,
  UPDATE_UNIQUE_VERTS : 4,
  UPDATE_NORMALS      : 8
};

export class BVHTri {
  constructor(id, tri_idx, f) {
    this.node = undefined;
    this.v1 = undefined;
    this.v2 = undefined;
    this.v3 = undefined;
    this.id = id;
    this.tri_idx = tri_idx;
    this.node = undefined;
    this.removed = false;

    this.no = new Vector3();

    this.f = f;

    this.vs = new Array(3);
    this.nodes = [];
  }
}

export class CDNodeInfo extends CustomDataElem {
  constructor() {
    super();
    this.node = undefined;
  }

  static define() {return {
    elemTypeMask : MeshTypes.VERTEX, //see MeshTypes in mesh.js
    typeName     : "bvh",
    uiTypeName   : "bvh",
    defaultName  : "bvh",
    flag         : 0
  }}

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
}

export class BVHNode {
  constructor(bvh, min, max) {
    this.min = new Vector3(min);
    this.max = new Vector3(max);
    this.axis = 0;
    this.depth = 0;
    this.leaf = true;
    this.parent = undefined;
    this.bvh = bvh;

    this.flag = BVHFlags.UPDATE_DRAW;

    this.tottri = 0;

    this.drawData = undefined;

    this.id = -1;

    this.uniqueVerts = new Set();
    this.uniqueTris = new Set();
    this.otherVerts = new Set();
    this.otherTris = new Set();

    this.allTris = new Set();
    this.children = [];

    this.subtreeDepth = 0;

    this._castRayRets = util.cachering.fromConstructor(IsectRet, 64);

    this.cent = new Vector3(min).interp(max, 0.5);
    this.halfsize = new Vector3(max).sub(min).mulScalar(0.5);
  }

  split() {
    if (!this.leaf) {
      console.error("bvh split called on non-leaf node", this);
      return;
    }

    let n = this;
    while (n) {
      n.subtreeDepth = Math.max(n.subtreeDepth, this.depth+1);
      n = n.parent;
    }

    this.tottri = 0;

    this.leaf = false;
    let axis = (this.axis + 1) % 3;

    let min = new Vector3(this.min), max = new Vector3(this.max);
    let split = 0;
    let tot = 0;

    for (let tri of this.allTris) {
      tri.nodes.remove(this);

      split += tri.v1[axis];
      split += tri.v2[axis];
      split += tri.v3[axis];
      tot += 3;
    }

    if (!tot) {
      split = max[axis]*0.5 + min[axis]*0.5;
    } else {
      split /= tot;
    }

    for (let i=0; i<2; i++) {
      if (!i) {
        max[axis] = split;
      } else {
        min.load(this.min);
        min[axis] = split;
        max.load(this.max);
      }

      let c = this.bvh._newNode(min, max);

      c.axis = axis;
      c.parent = this;
      c.depth = this.depth + 1;

      this.children.push(c);
    }

    let uniqueVerts = this.uniqueVerts;
    let otherVerts = this.otherVerts;
    let uniqueTris = this.uniqueTris;
    let allTris = this.allTris;

    for (let tri of uniqueTris) {
      tri.node = undefined;
    }

    let cd_node = this.bvh.cd_node;

    for (let v of uniqueVerts) {
      v.customData[cd_node].node = undefined;
    }

    this.uniqueVerts = undefined;
    this.otherVerts = undefined;
    this.uniqueTris = undefined;
    this.allTris = undefined;

    for (let tri of allTris) {
      this.addTri(tri.id, tri.tri_idx, tri.v1, tri.v2, tri.v3);
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

    for (let v of this.otherVerts) {
      if (v.vectorDistanceSqr(co) < radius2) {
        out.add(v);
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

  addTri(id, tri_idx, v1, v2, v3) {
    if (this.leaf && this.allTris.size >= this.bvh.leafLimit && this.depth <= this.bvh.depthLimit) {
      this.split();
    }

    this.tottri++;

    if (!this.leaf) {
      let tri = _triverts;

      tri[0] = v1;
      tri[1] = v2;
      tri[2] = v3;

      for (let c of this.children) {
        if (triBoxOverlap(c.cent, c.halfsize, tri)) {
          c.addTri(id, tri_idx, v1, v2, v3);
        }
      }

      return;
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
  }

  _addVert(v) {
    let n = v.customData[this.bvh.cd_node];

    if (n.node === undefined) {
      n.node = this;
      this.uniqueVerts.add(v);
    } else {
      this.otherVerts.add(v);
    }
  }

  updateUniqueVerts() {
    this.flag &= ~BVHFlags.UPDATE_UNIQUE_VERTS;

    this.uniqueVerts = new Set();
    this.otherVerts = new Set();

    let cd_node = this.bvh.cd_node;

    for (let tri of this.allTris) {
      for (let i=0; i<3; i++) {
        let v = tri.vs[i];

        let cdn = v.customData[cd_node];

        if (cdn.node === undefined || cdn.node === this) {
          cdn.node = this;
          this.uniqueVerts.add(v);
        } else {
          this.otherVerts.add(v);
        }
      }
    }
  }

  updateNormalsGrids() {
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
    }

    for (let tri of this.allTris) {
      let n = math.normal_tri(tri.v1, tri.v2, tri.v3);

      tri.no.load(n);

      tri.v1.no.add(n);
      tri.v2.no.add(n);
      tri.v3.no.add(n);
    }

    for (let tri of this.uniqueTris) {
      tri.v1.no.normalize();
      tri.v2.no.normalize();
      tri.v3.no.normalize();
    }
  }

  updateNormals() {
    this.flag &= ~BVHFlags.UPDATE_NORMALS;

    if (this.bvh.cd_grid >= 0) {
      this.updateNormalsGrids();
      return;
    }

    for (let tri of this.uniqueTris) {
      if (tri.f) {
        tri.no.load(tri.f.no);
        tri.f.calcNormal();
      } else {
        tri.no.load(math.normal_tri(tri.v1, tri.v2, tri.v3));
      }
    }

    for (let v of this.uniqueVerts) {
      v.no.zero();

      for (let e of v.edges) {
        if (!e.l) {
          continue;
        }

        let l = e.l;
        let _i = 0;

        do {
          v.no.add(l.f.no);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);
      }

      v.no.normalize();
    }
  }

  update() {
    if (!this.leaf && this.children.length > 0) {
      this.min[0] = this.min[1] = this.min[2] = 1e17;
      this.max[0] = this.max[1] = this.max[2] = -1e17;

      for (let c of this.children) {
        c.update();

        this.min.min(c.min);
        this.max.max(c.max);
      }

      //let pad = this.min.vectorDistance(this.max)*0.0001;
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

      this.min[0] = this.min[1] = this.min[2] = 1e17;
      this.max[0] = this.max[1] = this.max[2] = -1e17;

      let min = this.min;
      let max = this.max;
      let found = this.allTris.size > 0;

      for (let tri of this.allTris) {
        min.min(tri.v1);
        max.max(tri.v1);
        min.min(tri.v2);
        max.max(tri.v2);
        min.min(tri.v3);
        max.max(tri.v3);
      }

      if (!found) {
        min.zero().addScalar(-0.0001);
        max.zero().addScalar(0.0001);
      } else {
        let pad = min.vectorDistance(max)*0.0001;
        this.min.subScalar(pad);
        this.max.addScalar(pad);
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

    this.updateNodes = new Set();

    this.mesh = mesh;

    this.node_idgen = 0;

    this.forceUniqueTris = false;
    this.storeVerts = false;

    this.leafLimit = 64;
    this.drawLevelOffset = 3;
    this.depthLimit = 12;

    this.nodes = [];
    this.node_idmap = {};
    this.root = this._newNode(min, max);

    //note that ids are initially just the indices within mesh.loopTris
    this.tri_idgen = 0;

    this.cd_node = -1;
    this.cd_face_node = -1;
    this.tris = new Map();
    this.fmap = new Map();

    this.verts = new Set();
    this.mesh = mesh;
    this.dirtemp = new Vector3();
  }

  destroy(mesh) {
    let cd_node = this.cd_node;
    let cd_face_node = this.cd_face_node;

    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        for (let p of grid.points) {
          p.customData[cd_node].node = undefined;
        }
      }
    } else if (mesh.verts.customData.hasLayer(CDNodeInfo)) {
      cd_node = mesh.verts.customData.getLayerIndex(CDNodeInfo);

      for (let v of mesh.verts) {
        v.customData[cd_node].node = undefined;
      }
    }

    for (let f of mesh.faces) {
      f.customData[cd_face_node].node = undefined;
    }
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

  removeFace(id) {
    if (!this.fmap.has(id)) {
      return;
    }

    let tris = this.fmap.get(id);

    for (let t of tris) {
      this._removeTri(t, true);
      this.tris.delete(t.tri_idx);
    }

    this.fmap.delete(id);
  }

  _nextTriIdx() {
    this.tri_idgen++;

    return this.tri_idgen;
  }

  _removeTri(tri, partial=false) {
    if (tri.removed) {
      return;
    }

    tri.removed = true;

    for (let node of tri.nodes) {
      node.allTris.delete(tri);
      node.tottri--;
      node.flag |= BVHFlags.UPDATE_UNIQUE_VERTS|BVHFlags.UPDATE_DRAW;

      //if (node.uniqueTris.has(tri)) {
        node.uniqueTris.delete(tri);
      //}
    }

    if (!partial) {
      let tris = this.fmap.get(tri.id);
      tris.remove(tri);
      this.tris.delete(tri);
    }
  }

  _getTri(id, tri_idx, v1, v2, v3) {
    this.tri_idgen = Math.max(this.tri_idgen, tri_idx+1);

    if (!this.tris.has(tri_idx)) {
      this.tris.set(tri_idx, new BVHTri(id, tri_idx));
    }

    if (!this.fmap.has(id)) {
      this.fmap.set(id, []);
    }

    let tri = this.tris.get(tri_idx);

    tri.v1 = tri.vs[0] = v1;
    tri.v2 = tri.vs[1] = v2;
    tri.v3 = tri.vs[2] = v3;

    tri.f = this.mesh.eidmap[id];

    this.fmap.get(id).push(tri);

    return tri;
  }

  _newNode(min, max) {
    let node = new BVHNode(this, min, max);

    node.id = this.node_idgen++;

    this.updateNodes.add(node);

    this.node_idmap[node.id] = node;
    this.nodes.push(node);

    return node;
  }

  _remNode(node) {
    if (node.id < 0) {
      console.error("node already removed", node);
      return;
    }

    delete this.nodes[node.id];
    this.nodes.remove(node);
    node.id = -1;
  }

  static create(mesh, storeVerts=true, useGrids=true) {
    if (!mesh.verts.customData.hasLayer(CDNodeInfo)) {
      mesh.verts.addCustomDataLayer(CDNodeInfo, "bvh");
    }

    if (useGrids && GridBase.meshGridOffset(mesh) >= 0) {
      if (!mesh.loops.customData.hasLayer(CDNodeInfo)) {
        mesh.loops.addCustomDataLayer(CDNodeInfo, "bvh");
      }
    }

    if (!mesh.faces.customData.hasLayer(CDNodeInfo)) {
      mesh.faces.addCustomDataLayer(CDNodeInfo, "bvh");
    }

    let aabb = mesh.getBoundingBox(useGrids);

    aabb[0] = new Vector3(aabb[0]);
    aabb[1] = new Vector3(aabb[1]);

    let pad = Math.max(aabb[0].vectorDistance(aabb[1])*0.001, 0.001);

    aabb[0].subScalar(pad);
    aabb[1].addScalar(pad);

    let bvh = new BVH(mesh, aabb[0], aabb[1]);

    let cd_grid = bvh.cd_grid = useGrids ? GridBase.meshGridOffset(mesh) : -1;

    if (useGrids && cd_grid >= 0) {
      bvh.cd_node = mesh.loops.customData.getLayerIndex(CDNodeInfo);
    } else {
      bvh.cd_node = mesh.verts.customData.getLayerIndex(CDNodeInfo);
    }

    bvh.cd_face_node = mesh.faces.customData.getLayerIndex(CDNodeInfo);
    bvh.storeVerts = storeVerts;

    if (cd_grid >= 0) {
      let rand = new util.MersenneRandom(0);

      //we carefully randomize insertion order
      let ls = [];
      for (let l of mesh.loops) {
        ls.push(l);
      }

      let dimen = 3;
      for (let l of ls) {
        let grid = l.customData[cd_grid];
        dimen = grid.dimen;
        break;
      }

      let map2 = [];
      let li = 0;
      for (let l of ls) {
        for (let i=0; i<(dimen-1)*(dimen-1); i++) {
          map2.push(li);
          map2.push(i);
        }

        li++;
      }

      for (let i=0; i<map2.length/4; i++) {
        let i2 = i*2;
        let ri = (~~(Math.random()*map2.length*0.499999))*2;

        let t = map2[i2];
        let t2 = map2[i2+1];

        map2[i2] = map2[ri];
        map2[i2+1] = map2[ri+1];

        map2[ri] = t;
        map2[ri+1] = t2;
      }

      let map = [1];

      for (let i=0; i<map2.length; i += 2) {
        let l = ls[map2[i]];
        let idx = map2[i+1];

        let grid = l.customData[cd_grid];

        map[0] = idx;

        grid.recalcNormals();
        grid.makeBVHTris(mesh, bvh, l, cd_grid, map);
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        for (let p of grid.points) {
          p.bNext = p.bPrev = undefined;
        }
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.recalcNeighbors(mesh, l, cd_grid);
      }

      for (let node of bvh.nodes) {
        if (node.leaf) {
          node.flag |= BVHFlags.UPDATE_NORMALS|BVHFlags.UPDATE_DRAW;
          bvh.updateNodes.add(node);
        }
      }

      bvh.root.update();
    } else {
      let ltris = mesh.loopTris;

      for (let i = 0; i < ltris.length; i += 3) {
        let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

        bvh.addTri(l1.f.eid, i, l1.v, l2.v, l3.v);
      }
    }

    //update aabbs
    bvh.update();

    return bvh;
  }

  update() {
    for (let node of this.updateNodes) {
      node.update();
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

  addTri(id, tri_idx, v1, v2, v3) {
    this.root.addTri(id, tri_idx, v1, v2, v3);
  }

  remTri(id) {

  }
}
