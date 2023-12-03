import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {nstructjs, math, graphPack, PackNode, PackNodeVertex} from '../path.ux/scripts/pathux.js';
import {Constraint, Solver} from '../path.ux/scripts/util/solver.js'
import '../util/numeric.js';

import {MeshTypes, MeshFlags, MeshSymFlags, MeshModifierFlags, MAX_FACE_VERTS} from './mesh_base.js';
import {UVFlags, UVLayerElem} from './mesh_customdata.js';
import {BVH, BVHNode} from '../util/bvh.js';
import {CustomDataElem} from './customdata.js';

let chp_rets = util.cachering.fromConstructor(Vector2, 64);

export class CVElem extends CustomDataElem {
  constructor() {
    super();
    this.hasPins = false;
    this.corner = false;
    this.orig = new Vector3();
    this.vel = new Vector2();
    this.oldco = new Vector2();
    this.oldvel = new Vector2();
    this.tris = undefined;
    this.area = undefined;
    this.wind = undefined;

    //boundary tangent;
    this.bTangent = new Vector3();
  }

  static define() {
    return {
      typeName   : "uvcorner",
      uiTypeName : "uvcorner",
      defaultName: "uvcorner",
    }
  };

  calcMemSize() {
    return 8*5;
  }

  copyTo(b) {
    b.hasPins = this.hasPins;
    b.corner = this.corner;
    b.orig = this.orig;
    b.vel.load(this.vel);
    b.oldco.load(this.oldco);
    b.oldvel.load(this.oldvel);
  }

  setValue(b) {
    b.copyTo(this);
  }

  getValue() {
    return this;
  }

  clear() {
    this.hasPins = this.corner = false;
    this.orig.zero();
  }
}

CVElem.STRUCT = nstructjs.inherit(CVElem, CustomDataElem) + `
  hasPins : int;
  corner  : int;
  orig    : vec3;
}`;
nstructjs.register(CVElem);
CustomDataElem.register(CVElem);

export class UVIsland extends Set {
  constructor() {
    super();

    this.hasPins = false;
    this.hasSelLoops = false;

    this.boxcenter = new Vector2();
    this.area = 0.0;
    this.min = new Vector2();
    this.max = new Vector2();
  }
}

export class UVWrangler {
  constructor(mesh, faces, cd_uv) {
    this.mesh = mesh;

    this.needTopo = true;

    if (cd_uv === undefined) {
      cd_uv = mesh.loops.customData.getLayerIndex("uv");
    }

    this.cd_uv = cd_uv;
    this.faces = new Set(faces);

    this._makeUVMesh();

    this.loopMap = new Map(); //maps loops in this.mesh to verts in this.uvmesh
    this.edgeMap = new Map(); //maps loops in this.mesh to uvmesh edges
    this.vertMap = new Map();

    this.islandLoopMap = new Map();
    this.islandFaceMap = new Map();
    this.islandVertMap = new Map();

    this.cellDimen = 1;
    this.hashBounds = [-4, 4];
    this.hashWidth = this.hashBounds[1] - this.hashBounds[0];
    this.hashWidthMul = 1.0/this.hashWidth;
    this.cellSizeMul = this.cellDimen*this.hashWidthMul;
    this.snapLimit = 0.001;
    this.shash = new Map();

    this.saved = false;
  }

  static _calcSeamHash(mesh, faces) {
    let digest = new util.HashDigest();
    let es = new Set();

    for (let f of faces) {
      for (let e of f.edges) {
        es.add(e);
      }
    }

    for (let e of es) {
      digest.add(e.eid);
      digest.add(e.flag & MeshFlags.SEAM);
    }

    return digest.get();
  }

  static restoreOrRebuild(mesh, faces, wrangler, buildSeams) {
    let bad = false;


    if (wrangler && wrangler.saved) {
      for (let f of faces) {
        if (!(f.eid in wrangler.faces)) {
          bad = true;
          break;
        }
      }
    }

    try {
      bad = bad || (!wrangler || !wrangler.saved || !wrangler.restore(mesh));
    } catch (error) {
      util.print_stack(error);
      bad = true;
    }

    if (bad) {
      console.warn("UVWrangler.restoreOrRebuild(): making new uv wrangler. . .");
      let ret = new UVWrangler(mesh, faces);

      ret.buildIslands(buildSeams);
      return ret;
    }

    return wrangler;
  }

  _makeUVMesh() {
    this.uvMesh = new Mesh();
    this.cd_corner = this.uvMesh.verts.addCustomDataLayer("uvcorner").index;
    this.cd_edge_seam = this.uvMesh.edges.addCustomDataLayer("int").index;

    return this.uvMesh;
  }

  destroy(mesh) {
    return this;
  }

  save() {
    if (this.saved) {
      console.error("UVWrangler was already saved");
      return;
    }

    this._seamHash = this.constructor._calcSeamHash(this.mesh, this.faces);

    this.faces = this.faces.map(f => f.eid);

    let loopMap = new Map();

    for (let l of this.loopMap.keys()) {
      loopMap.set(l.eid, this.loopMap.get(l));
    }

    let edgeMap = new Map();
    for (let l of this.edgeMap.keys()) {
      edgeMap.set(l.eid, this.edgeMap.get(l));
    }

    let vertMap = new Map();

    for (let [v, ls] of this.vertMap) {
      ls = ls.map(l => l.eid);
      vertMap.set(v, ls);
    }

    this.islandVertMap = undefined;
    this.islandLoopMap = undefined;
    this.islandFaceMap = undefined;

    this.shash = undefined;

    this.loopMap = loopMap;
    this.edgeMap = edgeMap;
    this.vertMap = vertMap;

    this.mesh = this.mesh.lib_id;
    this.saved = true;
  }

  /*returns true if restore succeeded*/
  restore(mesh) {
    if (!this.saved) {
      console.error("UVWrangler is not saved");
      return false;
    }

    this.mesh = mesh;
    this.saved = false;

    let faces = new Set();

    for (let eid of this.faces) {
      let f = mesh.eidMap.get(eid);
      if (!f || f.type !== MeshTypes.FACE) {
        console.warn("Missing face " + eid);
        return false;
      }

      faces.add(f);
    }

    this.faces = faces;

    let loopMap = new Map();
    for (let [leid, v] of this.loopMap) {
      let l = mesh.eidMap.get(leid);

      if (!l || l.type !== MeshTypes.LOOP) {
        console.warn("Missing loop " + leid, l);
        return false;
      }

      loopMap.set(l, v);
    }

    let edgeMap = new Map();
    for (let [leid, e] of this.edgeMap) {
      let l = mesh.eidMap.get(leid);

      if (!l || l.type !== MeshTypes.LOOP) {
        console.warn("Missing loop " + leid, l);
        return false;
      }

      edgeMap.set(l, e);
    }

    let vertMap = new Map();
    for (let [v, ls] of this.vertMap) {
      let ls2 = new Set();

      for (let leid of ls) {
        let l = mesh.eidMap.get(leid);
        if (!l) {
          if (!l || l.type !== MeshTypes.LOOP) {
            console.warn("Missing loop " + leid, l);
            return false;
          }
        } else {
          ls2.add(l);
        }
      }

      vertMap.set(v, ls2);
    }

    this.loopMap = loopMap;
    this.edgeMap = edgeMap;
    this.vertMap = vertMap;
    this.needTopo = false;

    let seamhash = this.constructor._calcSeamHash(mesh, this.faces);
    console.warn("Seam hash:", seamhash);

    if (seamhash !== this._seamHash) {
      return false;
    }

    this.islandLoopMap = new Map();
    this.islandFaceMap = new Map();
    this.islandVertMap = new Map();

    this.buildIslands();
    return true;
  }

  setCornerTags() {
    const cd_corner = this.cd_corner;
    const cd_edge_seam = this.cd_edge_seam

    for (let l of this.mesh.loops) {
      let seam = false; //(l.e.flag & MeshFlags.SEAM); //seam
      seam = seam || l === l.radial_next; //mesh boundary
      seam = seam || this.islandLoopMap.get(l) !== this.islandLoopMap.get(l.radial_next);

      if (seam) {
        let v1 = this.loopMap.get(l);
        let v2 = this.loopMap.get(l.next);

        if (!v1 || !v2) {
          console.error("error in setCornerTags, missing vertices", v1, v2);
          continue;
        }

        let uve = this.uvMesh.getEdge(v1, v2);

        if (uve) {
          uve.customData[cd_edge_seam].value = true;
        }

        this.loopMap.get(l).customData[cd_corner].corner = true;
        this.loopMap.get(l.next).customData[cd_corner].corner = true;
      }
    }

    return;

    let islandmap = new Map();

    for (let island of this.islands) {
      for (let v of island) {
        islandmap.set(v, island);

        for (let l of this.vertMap.get(v)) {
          islandmap.set(l, island);
        }
      }
    }

    for (let v of this.uvMesh.verts) {
      v.customData[cd_corner].corner = false;
    }

    for (let l of this.mesh.loops) {
      let seam = false; //(l.e.flag & MeshFlags.SEAM); //seam
      seam = seam || l === l.radial_next; //mesh boundary
      seam = seam || this.islandLoopMap.get(l) !== this.islandLoopMap.get(l.radial_next);

      if (seam) {
        this.loopMap.get(l).customData[cd_corner].corner = true;
        this.loopMap.get(l.next).customData[cd_corner].corner = true;
      }
    }

    for (let island of this.islands) {
      for (let v of island) {
        for (let l of this.vertMap.get(v)) {
          let seam = false; //(l.e.flag & MeshFlags.SEAM); //seam
          seam = seam || l === l.radial_next; //mesh boundary
          seam = seam || (islandmap.get(l) !== island); //island boundary

          if (seam) {
            v.customData[cd_corner].corner = true;
            break;
          }
        }
      }
    }
  }

  /*checks if a uv edge is a seam*/
  seamUVEdge(e) {
    return e.customData[this.cd_edge_seam].value;
  }

  /*checks if an edge in the base mesh is a seam*/
  seamEdge(e) {
    let l = e.l;

    if (!l) {
      return false; //no faces
    }

    if (l === l.radial_next) {
      return true;
    }

    return this.islandFaceMap.get(l.f) !== this.islandFaceMap.get(l.radial_next.f);
  }

  _getHashPoint(x, y) {
    let p = chp_rets.next();

    p[0] = Math.floor((x - this.hashBounds[0])*this.cellSizeMul);
    p[1] = Math.floor((y - this.hashBounds[1])*this.cellSizeMul);

    return p;
  }

  hashPoint(x, y) {
    x = Math.floor((x - this.hashBounds[0])*this.cellSizeMul);
    y = Math.floor((y - this.hashBounds[1])*this.cellSizeMul);

    return y*this.cellDimen + x;
  }

  loadSnapLimit(limit) {
    limit = Math.max(limit, 0.00005);

    let cell = Math.ceil(this.hashWidth/limit)>>2;

    this.snapLimit = limit;
    this.cellDimen = cell;
    this.cellSizeMul = this.cellDimen*this.hashWidthMul;

    return;
    console.log(JSON.stringify({
      cellDimen   : this.cellDimen,
      hashWidth   : this.hashWidth,
      hashWidthMul: this.hashWidthMul,
      cellSizeMul : this.cellSizeMul,
      snapLimit   : this.snapLimit,
      hashBounds  : this.hashBounds
    }, undefined, 2));

  }

  finish() {
    let cd_uv = this.cd_uv;

    for (let v of this.uvMesh.verts) {
      for (let l of this.vertMap.get(v)) {
        let uv = l.customData[cd_uv].uv;
        uv.load(v.co);
      }
    }
  }

  resetSpatialHash(limit = this.snapLimit) {
    this.shash = new Map();
    this.loadSnapLimit(limit);
  }

  shashAdd(l, uv) {
    let key = this.hashPoint(uv[0], uv[1]);

    if (!this.shash.has(key)) {
      this.shash.set(key, []);
    }

    return this.shash.get(key).push(l);
  }

  buildIslands(buildSeams = false) {
    if (this.needTopo) {
      if (buildSeams) {
        this.buildTopologySeam();
      } else {
        this.buildTopology();
      }
    }

    let cd_uv = this.cd_uv;
    let cd_corner = this.cd_corner;

    for (let v of this.uvMesh.verts) {
      v.customData[cd_corner].hasPins = false;

      for (let l of this.vertMap.get(v)) {
        if (l.customData[cd_uv].flag & UVFlags.PIN) {
          v.customData[cd_corner].hasPins = true;
          break;
        }
      }
    }

    this.islands = [];
    let doneset = new Set();

    for (let v of this.uvMesh.verts) {
      if (doneset.has(v)) {
        continue;
      }

      doneset.add(v);
      let stack = [v];

      let island = new UVIsland();
      island.hasPins = false;

      while (stack.length > 0) {
        let v2 = stack.pop();

        this.islandVertMap.set(v2, island);

        for (let l of this.vertMap.get(v2)) {
          if (l.customData[cd_uv].flag & UVFlags.PIN) {
            island.hasPins = true;
          }

          if ((l.flag & MeshFlags.SELECT) && !(l.flag & MeshFlags.HIDE)) {
            island.hasSelLoops = true;
          }

          this.islandFaceMap.set(l.f, island);
          this.islandLoopMap.set(l, island);
        }

        island.add(v2);

        for (let e of v2.edges) {
          let v3 = e.otherVertex(v2);

          if (!doneset.has(v3)) {
            doneset.add(v3);
            stack.push(v3);
          }
        }
      }

      /*
      for (let v of island) {
        for (let l of this.vertMap.get(v)) {
          //this.islandLoopMap.set(l, island);
        }
      }//*/

      this.islands.push(island);
    }

    for (let island of this.islands) {
      this.updateAABB(island);
    }

    this.setCornerTags();
    this.buildBoundaryTangents();

    return this;
  }

  buildTopologySeam() {
    let mesh = this.mesh;
    let uvmesh = this._makeUVMesh();
    let cd_uv = this.cd_uv;

    this.loopMap = new Map();
    this.vertMap = new Map();
    this.islandLoopMap = new Map();
    this.islandVertMap = new Map();
    this.islandFaceMap = new Map();

    let cd_corner = this.cd_corner;

    let doneset = new WeakSet();

    function hasSeam(v) {
      for (let e of v.edges) {
        if (e.flag & MeshFlags.SEAM) {
          return true;
        }
      }

      return false;
    }

    let islands = [];

    let faces = this.faces;

    for (let f of faces) {
      if (doneset.has(f)) {
        continue;
      }

      let island = new Set();
      let stack = [f];

      islands.push(island);
      doneset.add(f);

      while (stack.length > 0) {
        let f2 = stack.pop();

        island.add(f2);

        for (let l of f2.loops) {
          if (l === l.radial_next || (l.e.flag & MeshFlags.SEAM)) {
            continue;
          }

          let l2 = l.radial_next;

          if ((l2.f.flag & MeshFlags.HIDE) || doneset.has(l2.f)) {
            continue;
          }

          doneset.add(l2.f);
          stack.push(l2.f);
        }
      }
    }

    function nextl(startl, cb, reverse = false) {
      let _i = 0;
      let l = startl;

      //do {
      for (let i = 0; i < 1; i++) {
        if (cb) {
          cb(l);
        }

        if (reverse) {
          let lr = l.prev.radial_next;

          if (lr === l.prev) {
            l = lr;
            break;
          }

          //don't allow bad winding
          if (l.v === lr.v) {
            l = lr;
          } else {
            l = lr;
            break; //l = lr.next;
          }

        } else {
          let lr = l.radial_next;

          if (lr === l) {
            break;
          }

          //don't allow bad winding
          if (lr.v !== l.v) {
            l = lr.next;
          } else {
            l = lr;
            break;
            //l = lr.prev;
          }
        }

        if (_i++ > 100) {
          console.error("infinite loop detected");
          break;
        }
      }
      //} while (l !== startl && !(l.e.flag & MeshFlags.SEAM));

      //if (l.radial_next !== l && !(l.e.flag & MeshFlags.SEAM)) {
      //  return undefined;
      //}

      //if (cb) {
      //  cb(l);
      //}

      return l;
    }

    function prevl(startl, cb) {
      return nextl(startl, cb, true);
    }

    console.log("Islands length b:", islands.length);

    let imap = new Map();

    let li2 = 0;
    let islandindex = 0;
    for (let island of islands) {
      for (let f of island) {
        f.index = islandindex;

        for (let l of f.loops) {
          l.index = li2++;
        }
      }

      islandindex++;
    }

    for (let island of islands) {
      let ls = new Set();
      let doneset = new WeakSet();

      for (let f of island) {

        for (let l of f.loops) {
          ls.add(l);
        }
      }

      for (let l of ls) {
        if (doneset.has(l)) {
          continue;
        }

        for (let e of l.v.edges) {
          if (!e.l) {
            continue;
          }

          let l2 = e.l;
          let _i = 0;
          do {
            if (l2.v === l.v && l2.f.index === l.f.index) {
              l2.index = l.index;
              doneset.add(l2);
            }
            if (_i++ > MAX_FACE_VERTS) {
              console.error("infinite loop error");
              break;
            }
          } while ((l2 = l2.radial_next) !== e.l);
        }
      }

      let iset = new Set();

      for (let l of ls) {
        if (!imap.has(l.index)) {
          let v = uvmesh.makeVertex(l.customData[cd_uv].uv);
          v.co[2] = 0.0;

          this.vertMap.set(v, new Set([l]));
          this.loopMap.set(l, v);

          imap.set(l.index, v);
          doneset.add(l);
        } else {
          let v = imap.get(l.index);
          this.loopMap.set(l, v);
          this.vertMap.get(v).add(l);
        }
        iset.add(l.index);
      }

      for (let l of ls) {
        let v1 = this.loopMap.get(l);
        let v2 = this.loopMap.get(l.next);

        if (v1 !== v2) {
          let e = uvmesh.ensureEdge(v1, v2);
          this.edgeMap.set(l, e);
        }
      }
      //console.log(iset, ls);
    }

    for (let v of uvmesh.verts) {
      v.customData[cd_corner].corner = false;

      for (let l of this.vertMap.get(v)) {
        if (l.e.flag & MeshFlags.SEAM) {
          v.customData[cd_corner].corner = true;
        }
      }
    }
  }

  buildBoundaryTangents() {
    const cd_corner = this.cd_corner;
    const cd_uv = this.cd_uv;

    let t1 = new Vector2();
    let t2 = new Vector2();
    let t3 = new Vector2();
    let t4 = new Vector2();
    let t5 = new Vector2();

    for (let v of this.uvMesh.verts) {
      let c = v.customData[cd_corner];

      if (!c.corner) {
        continue;
      }

      let v1, v2, vcent;

      for (let e2 of v.edges) {
        let v3 = e2.otherVertex(v);

        if (!this.seamUVEdge(e2)) {
          vcent = v3;
          continue;
        }

        if (!v1) {
          v1 = v3
        } else {
          v2 = v3;
          break;
        }
      }

      if (!v1 || !v2) {
        console.error("Orphaned UV corner!");
        continue;
      }

      t1.load(v1.co).sub(v.co).normalize();
      t2.load(v2.co).sub(v.co).normalize().negate();

      t3.load(t1).add(t2).normalize();

      let th = Math.acos(t1.dot(t3));

      let shellth = th < 0.0001 ? 1.0 : 1.0 / Math.abs(Math.cos(th));

      t1.interp(t2, 0.5).normalize();
      t1.mulScalar(shellth);

      if (isNaN(t1.dot(t2))) {
        throw new Error("NaN!");
      }

      let ok = false;

      let tmp = t1[0];
      t1[0] = -t1[1];
      t1[1] = tmp;

      if (!vcent) {
        for (let l of this.vertMap.get(v)) {
          if (this.seamEdge(l.e)) {
            let uv1 = l.customData[cd_uv].uv;
            let uv2 = l.next.customData[cd_uv].uv;

            t3.zero();
            let tot = 0.0;
            for (let l3 of l.list) {
              let uv3 = l3.customData[cd_uv].uv;
              t3.add(uv3);
              tot++;
            }

            t3.mulScalar(1.0/tot);
            t3.sub(v.co).negate();

            //console.log("TT4", t3, t3.dot(t1));

            if (t3.dot(t1) < 0.0) {
              t1.negate();
            }
          }
        }
      }

      if (vcent) {
        t2.load(v.co).sub(vcent.co);

        if (t1.dot(t2) < 0) {
          t1.negate();
        }
      }

      c.bTangent[0] = t1[0];
      c.bTangent[1] = t1[1];
      c.bTangent[2] = 0.0;
    }
  }

  isCorner(l) {
    return this.loopMap.get(l).customData[this.cd_corner].corner;
  }

  buildTopology(snap_threshold = 0.0001) {
    if (this.cd_uv === undefined || this.cd_uv < 0) {
      console.warn("No uvs");
      return;
    }

    let cd_uv = this.cd_uv;
    this.resetSpatialHash(snap_threshold);

    this._makeUVMesh();

    let mesh = this.mesh;
    let faces = this.faces;
    let uvmesh = this.uvMesh;

    let shash = this.shash;

    for (let f of faces) {
      for (let l of f.loops) {
        let uv = l.customData[cd_uv].uv;
        this.shashAdd(l, uv);
      }
    }

    let tmp = new Vector3();

    let offs = [
      [0, 0],
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
      [1, 0],
      [1, -1],
      [0, -1],
    ];

    let celldimen = this.cellDimen;
    let hp = new Vector2();
    let uvsum = new Vector2();

    let vmap = new Set();
    let doneset = new WeakSet();
    let limit = this.snapLimit;
    let limitsqr = limit*limit;

    let loops = new Set();

    for (let f of this.faces) {
      for (let l of f.loops) {
        loops.add(l);

        if (doneset.has(l)) {
          continue;
        }

        let uv = l.customData[cd_uv].uv;
        let tot = 1;

        uvsum.load(uv);
        hp.load(this._getHashPoint(uv[0], uv[1]));

        let lset = new Set([l]);
        let v = uvmesh.makeVertex();

        this.loopMap.set(l, v);
        this.vertMap.set(v, lset);

        for (let off of offs) {
          let x2 = hp[0] + off[0];
          let y2 = hp[1] + off[1];
          let key = y2*celldimen + x2;

          let list = this.shash.get(key);

          if (!list) {
            continue;
          }

          for (let l2 of list) {
            if (doneset.has(l2)) {
              continue
            }

            let uv2 = l2.customData[cd_uv].uv;

            if (uv2.vectorDistanceSqr(uv) < limitsqr) {
              doneset.add(l2);
              lset.add(l2);
              uvsum.add(uv2);
              tot++;
              this.loopMap.set(l2, v);
            }
          }
        }

        uvsum.mulScalar(1.0/tot);
        v.co.load(uvsum);
        v.co[2] = 0.0;
      }
    }

    let loopmap = this.loopMap;

    for (let l of loops) {
      let v1 = loopmap.get(l);

      if (doneset.has(l.next)) {
        let v2 = loopmap.get(l.next);
        if (v2 !== v1) {
          this.edgeMap.set(l.next, uvmesh.ensureEdge(v1, v2));
        }
      }

      if (doneset.has(l.prev)) {
        let v2 = loopmap.get(l.prev);
        if (v2 !== v1) {
          this.edgeMap.set(l.prev, uvmesh.ensureEdge(v1, v2));
        }
      }
    }
  }

  updateAABB(island) {
    let l = island;
    l.min = new Vector2().addScalar(1e17);
    l.max = new Vector2().addScalar(-1e17);

    for (let v of l) {
      v.co[2] = 0.0;

      l.min.min(v.co);
      l.max.max(v.co);
    }

    l.boxsize = new Vector2(l.max).sub(l.min);

    l.boxsize[0] = Math.max(l.boxsize[0], 0.00001);
    l.boxsize[1] = Math.max(l.boxsize[1], 0.00001);

    l.area = l.boxsize[0]*l.boxsize[1];
  }

  packIslands(ignorePinnedIslands = false, islandsWithSelLoops = false) {
    let uve = _appstate.ctx.editors.imageEditor;
    if (uve) {
      uve = uve.uvEditor;
      uve.resetDrawLines();
      uve.flagRedraw();
    }

    function drawline(v1, v2, color = "red") {
      if (uve) {
        return;
        uve.addDrawLine(v1, v2, color);
        uve.flagRedraw();
      }
    }

    let cd_corner = this.cd_corner;

    let islands = [];
    for (let l of this.islands) {
      if (ignorePinnedIslands && l.hasPins) {
        continue;
      }
      if (islandsWithSelLoops && !l.hasSelLoops) {
        continue;
      }

      this.updateAABB(l);

      for (let v of l) {
        v.customData[cd_corner].orig = new Vector3(v.co);
      }

      let cent = new Vector2(l.min).interp(l.max, 0.5);
      let steps = 16;
      let th = 0.0, dth = Math.PI*0.5/steps;

      let min = 1e17, minth = 0.0;
      for (let i = 0; i < steps; i++, th += dth) {
        //th += (Math.random()-0.5)*dth;

        for (let v of l) {
          v.co.load(v.customData[cd_corner].orig).sub(cent).rot2d(th).add(cent);
        }

        this.updateAABB(l);
        let size = (l.max[0] - l.min[0])*(l.max[1] - l.min[1]);
        if (size < min) {
          min = size;
          minth = th;
        }
      }

      for (let v of l) {
        v.co.load(v.customData[cd_corner].orig).sub(cent).rot2d(minth).add(cent);
      }

      this.updateAABB(l);
    }

    let totarea = 0.0;

    islands = [];
    for (let island of this.islands) {
      if (ignorePinnedIslands && island.hasPins) {
        continue;
      }
      if (islandsWithSelLoops && !island.hasSelLoops) {
        continue;
      }

      this.updateAABB(island);
      islands.push(island);
      totarea += island.area;
    }

    if (totarea === 0.0 || isNaN(totarea)) {
      if (isNaN(totarea)) {
        throw new Error("NaN!");
      }
      return;
    }

    for (let island of islands) {
      this.updateAABB(island);

      let ratio = 0.75/Math.sqrt(totarea);


      for (let v of island) {
        v.co.sub(island.min).mulScalar(ratio).add(island.min);
        v.co[2] = 0.0;
      }

      this.updateAABB(island);
    }

    islands.sort((a, b) => {
      return b.area - a.area;
    });

    let rec = (uv1, uv2, axis, depth = 0) => {
      drawline([uv1[0], uv1[1]], [uv1[0], uv2[1]]);
      drawline([uv1[0], uv2[1]], [uv2[0], uv2[1]]);
      drawline([uv2[0], uv2[1]], [uv2[0], uv1[1]]);
      drawline([uv2[0], uv1[1]], [uv1[0], uv1[1]]);

      if (islands.length === 0) {
        return;
      }

      let size = new Vector2(uv2).sub(uv1);
      let area = size[0]*size[1];
      let axis2 = axis ^ 1;

      let margin = 0.001;

      let min = 1e17, island;
      for (let island2 of islands) {
        this.updateAABB(island2);

        let pass = Math.random() > 0.85;

        if (!pass && (island2.area < area && Math.abs(area - island2.area) < min)) {
          min = Math.abs(area - island2.area);
          island = island2;
        }
      }

      if (!island && islands.length === 0) {
        return;
      }

      let maxdepth = 10;

      if (depth > maxdepth) {
        return;
      }

      //console.log("min", min);

      let dis = new Vector2(uv2).sub(uv1);
      dis = dis[0]*dis[1];

      if ((min > dis*0.5 && depth < maxdepth - 1) || !island) {
        let split = 0.5;

        let uv3 = new Vector2(uv1);
        let uv4 = new Vector2(uv2);
        let t = uv1[axis] + (uv2[axis] - uv1[axis])*split;

        uv3[axis] = t;
        uv4[axis] = t;

        rec(uv1, uv4, axis2, depth + 1);
        rec(uv3, uv2, axis2, depth + 1);
        return;
      }

      let axis3 = island.boxsize[1] > island.boxsize[0] ? 1 : 0;
      if (axis3 !== axis) {
        let cent = island.min.interp(island.max, 0.5);

        for (let v of island) {
          v.co.sub(cent).rot2d(Math.PI*0.5).add(cent);
        }

        this.updateAABB(island);
      }

      islands.remove(island);
      let ratio = island.boxsize[0]/island.boxsize[1];
      let cent = new Vector2(island.min).interp(island.max, 0.5);
      size.subScalar(margin*2.0);

      let ratio2 = size[0]/size[1];
      ratio = ratio/ratio2;

      for (let v of island) {
        v.co.sub(island.min).div(island.boxsize).mul(size);
        v.co.addScalar(margin);

        if (ratio > 1.0) {
          v.co[1] /= ratio;
        } else {
          v.co[0] *= ratio;
        }

        v.co.add(uv1);
      }

      this.updateAABB(island);
      return;

      let split = 0.5;
      split = uv1[axis] + (uv2[axis] - uv1[axis])*split;
      let mid = new Vector2();

      mid[axis] = split;
      mid[axis2] = uv1[axis2];

      rec(mid, uv2, axis2, depth + 1);

      //mid[axis2] = uv2[axis2];
      //rec(mid, uv2, axis2, depth+1);
    }

    let minuv = new Vector2([0, 0]);
    let maxuv = new Vector2([1, 1]);

    rec(minuv, maxuv, 0);
  }
}

let splitTemps = util.cachering.fromConstructor(Vector3, 32);

export class VoxelNode extends BVHNode {
  constructor() {
    super(...arguments);

    this.avgNo = new Vector3();
    this.avgNoTot = 0.0;

    this.splitVar = 0.16;

    if (this.constructor === VoxelNode) {
      Object.seal(this);
    }
  }

  _pushTri(tri) {
    let no = math.normal_tri(tri.v1.co, tri.v2.co, tri.v3.co);
    tri.no.load(no);

    let w = tri.area = math.tri_area(tri.v1.co, tri.v2.co, tri.v3.co);

    this.avgNo.addFac(no, w);
    this.avgNoTot += w;

    return super._pushTri(tri);
  }

  splitTest() {
    if (this.depth >= this.bvh.depthLimit) {
      return false;
    }

    let avg = splitTemps.next().zero();

    if (this.avgNoTot === 0) {
      return false;
    }

    avg.load(this.avgNo).normalize();

    //did normals cancel each other out?
    if (avg.vectorLength() < 0.00001) {
      return true;
    }

    avg.normalize();

    let variance = 0.0;
    let tot = 0.0;
    for (let t of this.uniqueTris) {
      let th = Math.acos(t.no.dot(avg)*0.999999)/Math.PI;

      let w = t.area;
      //w = math.tri_area(t.v1, t.v2, t.v3);

      th *= th;
      //th = Math.abs(th);

      variance += th*w;
      tot += w;
    }

    variance = variance/tot;

    if (variance > this.splitVar) {
      return true;
    }

    return false;
  }
}

export class VoxelBVH extends BVH {
  constructor() {
    super(...arguments);

    this.leafLimit = 15;

  }
}

VoxelBVH.nodeClass = VoxelNode;

export function voxelUnwrap(mesh, faces, cd_uv = undefined, setSeams = true,
                            leafLimit                                = 255, depthLimit = 25,
                            splitVar                                 = 0.16) {
  if (cd_uv === undefined) {
    cd_uv = mesh.loops.customData.getLayerIndex("uv");
  }

  if (cd_uv < 0) {
    console.log("no uv layers");
    return;
  }

  let cd_color = mesh.verts.customData.getLayerIndex("color");

  //let bvh = mesh.getBVH();
  mesh.regenBVH();

  let bvh = VoxelBVH.create(mesh, true, false, leafLimit, depthLimit);
  bvh.splitVar = splitVar;

  let aabb = mesh.getBoundingBox();
  let p = new Vector3();
  let scale = new Vector3(aabb[1]).sub(aabb[0]);

  console.log(aabb, scale);
  let patches = new Map();

  let idgen = 0;
  let rand = new util.MersenneRandom();
  let doneset = new WeakSet();

  for (let node of bvh.nodes) {
    if (!node.leaf) {
      continue;
    }

    rand.seed(idgen);
    let c = new Vector4([rand.random(), rand.random(), rand.random(), 1.0]);
    idgen++;

    let patch = new Set();
    patch.color = c;

    for (let t of node.uniqueTris) {
      let f = mesh.eidmap[t.id];

      if (f && !doneset.has(f)) {
        doneset.add(f);
        patch.add(f);
      }
    }

    if (patch.size > 0) {
      //console.log(patch.color, cd_color)
      patches.set(node, patch);
    }
  }

  console.log("patches", patches);

  let graph = [];

  let totarea = 0.0;


  for (let patch of patches.values()) {
    let p = new Vector3();
    let no = new Vector3();

    let li = 0;
    let ls = new Set();

    for (let f of patch) {
      no.add(f.no);

      for (let l of f.loops) {
        ls.add(l);
        if (cd_color >= 0) {
          //l.v.customData[cd_color].color.load(patch.color);
        }
      }
    }

    for (let l of ls) {
      l.index = li++;
    }

    no.normalize();

    let mat = new Matrix4();
    mat.makeNormalMatrix(no);

    let min = new Vector2().addScalar(1e17);
    let max = new Vector2().addScalar(-1e17);

    for (let l of ls) {
      p.load(l.v.co).multVecMatrix(mat);

      min.min(p);
      max.max(p);

      l.customData[cd_uv].uv.load(p);
    }

    max.sub(min);
    totarea += max[0]*max[1];

    let pnode = new PackNode();
    pnode.pos.load(min).mulScalar(1000);
    pnode.size.load(max).mulScalar(1000);
    pnode.startpos = new Vector2(pnode.pos);
    pnode.ls = ls;

    for (let l of ls) {
      let uv = l.customData[cd_uv].uv;

      uv.sub(min).div(max);
    }

    graph.push(pnode);
  }

  console.log("totarea", totarea);

  totarea = Math.sqrt(totarea)*0.4;

  if (totarea === 0.0) {
    totarea = 1.0;
  }

  for (let patch of patches.values()) {
    let rx = rand.random();
    let ry = rand.random();

    for (let f of patch) {
      for (let l of f.loops) {
        let uv = l.customData[cd_uv].uv;

        uv.mulScalar(1.0/totarea);
        uv[0] += rx;
        uv[1] += ry;
      }
    }
  }

  for (let pn of graph) {

  }

  for (let pn of graph) {
    let off = new Vector2(pn.pos).sub(pn.startpos).mulScalar(1.0/1000);

    for (let l of pn.ls) {
      let uv = l.customData[cd_uv].uv;
      uv.add(off);
    }
  }

  let min = new Vector2().addScalar(1e17);
  let max = new Vector2().addScalar(-1e17);
  for (let patch of patches.values()) {
    for (let f of patch) {
      for (let l of f.loops) {
        let uv = l.customData[cd_uv].uv;
        min.min(uv);
        max.max(uv);
      }
    }
  }

  if (!setSeams) {
    return;
  }

  for (let patch of patches.values()) {
    for (let f of patch) {
      for (let l of f.loops) {
        if (!patch.has(l.radial_next.f)) {
          l.e.flag |= MeshFlags.SEAM;
        }
      }
    }
  }
  //bvh.destroy(mesh);

  let wn = new UVWrangler(mesh, faces);

  wn.buildIslands();
  wn.packIslands();
  wn.finish();
}
