import {Matrix4, nstructjs, Vector2, Vector3, Vector4} from "../path.ux/scripts/pathux.js";
import * as util from "../util/util.js";
import {MeshFlags, MeshTypes} from "./mesh_base.js";
import * as math from "../util/math.js";
import {CustomDataElem} from "./customdata.js";
import {ChunkedSimpleMesh} from "../core/simplemesh.js";
import {BLink, GridBase, GridSettingFlags, GridSettings, gridSides, GridVert, QRecalcFlags} from "./mesh_grids.js";

export const OldQuadTreeFields = {
  QFLAG: 0,
  QCHILD1: 1,
  QCHILD2: 2,
  QCHILD3: 3,
  QCHILD4: 4,
  QMINU: 5,
  QMINV: 6,
  QMAXU: 7,
  QMAXV: 8,
  QCENTU: 9,
  QCENTV: 10,
  QDEPTH: 11,
  QLEFT: 12,
  QRIGHT: 13,
  QUP: 14,
  QDOWN: 15,
  QPOINT1: 16,
  QPOINT2: 17,
  QPOINT3: 18,
  QPOINT4: 19,
  //QPOINT5: 20,
  QID: 21,
  QPARENT: 22,
  QSUBTREE_DEPTH: 23,
  QQUADIDX: 24,
  QPOLYSTART: 25,
  QPOLYEND: 26,
  QTOT: 32 //reserve some space for future expansion
};

export const QuadTreeFields = {
  QFLAG: 0,
  QCHILD1: 1,
  QCHILD2: 2,
  QCHILD3: 3,
  QCHILD4: 4,
  QMINU: 5,
  QMINV: 6,
  QMAXU: 7,
  QMAXV: 8,
  QCENTU: 9,
  QCENTV: 10,
  QDEPTH: 11,
  QLEFT: 12,
  QRIGHT: 13,
  QUP: 14,
  QDOWN: 15,
  QPOINT1: 16,
  QPOINT2: 17,
  QPOINT3: 18,
  QPOINT4: 19,
  QPOINT5: 20,
  QID: 21,
  QPARENT: 22,
  QSUBTREE_DEPTH: 23,
  QQUADIDX: 24,
  QPOLYSTART: 25,
  QPOLYEND: 26,
  QNX: 27,
  QNY: 28,
  QNZ: 29,
  QTOT: 32 //reserve some space for future expansion
};


const QFLAG = QuadTreeFields.QFLAG,
  QCHILD1 = QuadTreeFields.QCHILD1,
  QCHILD2 = QuadTreeFields.QCHILD2,
  QCHILD3 = QuadTreeFields.QCHILD3,
  QCHILD4 = QuadTreeFields.QCHILD4,
  QMINU = QuadTreeFields.QMINU,
  QMAXU = QuadTreeFields.QMAXU,
  QMINV = QuadTreeFields.QMINV,
  QCENTU = QuadTreeFields.QCENTU,
  QCENTV = QuadTreeFields.QCENTV,
  QMAXV = QuadTreeFields.QMAXV,
  QDEPTH = QuadTreeFields.QDEPTH,
  QLEFT = QuadTreeFields.QLEFT,
  QRIGHT = QuadTreeFields.QRIGHT,
  QUP = QuadTreeFields.QUP,
  QDOWN = QuadTreeFields.QDOWN,
  QPOINT1 = QuadTreeFields.QPOINT1,
  QPOINT2 = QuadTreeFields.QPOINT2,
  QPOINT3 = QuadTreeFields.QPOINT3,
  QPOINT4 = QuadTreeFields.QPOINT4,
  //QPOINT5 = QuadTreeFields.QPOINT5,
  QID = QuadTreeFields.QID,
  QPARENT = QuadTreeFields.QPARENT,
  QSUBTREE_DEPTH = QuadTreeFields.QSUBTREE_DEPTH,
  QQUADIDX = QuadTreeFields.QQUADIDX,
  QPOLYSTART = QuadTreeFields.QPOLYSTART,
  QPOLYEND = QuadTreeFields.QPOLYEND,
  QNX = QuadTreeFields.QNX,
  QNY = QuadTreeFields.QNY,
  QNZ = QuadTreeFields.QNZ,
  QTOT = QuadTreeFields.QTOT;


let _quad_node_idgen = 0;

function makeCompressedNodeStruct() {
  const CompressFields = [
    QFLAG, QCHILD1, QCHILD2, QCHILD3, QCHILD4,
    QPOINT1, QPOINT2, QPOINT3, QPOINT4, QID
  ]

  let revmap = {};
  for (let k in QuadTreeFields) {
    revmap[QuadTreeFields[k]] = k;
  }

  let fields = {};

  let types = {
    QFLAG: "int",
    QDEPTH: "int",
    QCHILD1: "int",
    QCHILD2: "int",
    QCHILD3: "int",
    QCHILD4: "int",
    QPOINT1: "int",
    QPOINT2: "int",
    QPOINT3: "int",
    QPOINT4: "int",
  }

  let s = `mesh_grid.CompressedQuadNode {\n`
  for (let i of CompressFields) {
    let k = revmap[i];
    fields[k] = i;

    let type = k in types ? types[k] : 'float'

    s += `  ${k} : ${type};\n`;
  }

  s += '}';

  return {nstruct: s, fields: fields};
}

window.makeCompressedNodeStruct = makeCompressedNodeStruct;

let _btm_temp1 = new Vector3();
let _btm_temp2 = new Vector3();
let _btm_temp3 = new Vector3();
let _btm_temp4 = new Vector3();
let _btm_temp5 = new Vector3();
let _btm_temp6 = new Vector3();
let _btm_temp7 = new Vector3();
let _btm_temp8 = new Vector3();
let _btm_temp9 = new Vector3();
let imattemp = new Matrix4();
let imattemp2 = new Matrix4();

export class CompressedQuadNode {
  constructor() {
    for (let k in CompressedQuadNode.fields) {
      this[k] = 0;
    }
  }

  static fromNodes(ns) {
    let fields = CompressedQuadNode.fields;
    let ret = [];

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      let n = new CompressedQuadNode();
      ret.push(n);

      for (let k in fields) {
        let i = fields[k];

        n[k] = ns[ni + i];
      }

      let parent = ns[ni + QPARENT];

      //n.QCHILD1 = Math.max(n.QCHILD1 - ni, 0);
      //n.QCHILD2 = Math.max(n.QCHILD2 - ni, 0);
      //n.QCHILD3 = Math.max(n.QCHILD3 - ni, 0);
      //n.QCHILD4 = Math.max(n.QCHILD4 - ni, 0);
    }

    return ret;
  }
}

CompressedQuadNode.fields = makeCompressedNodeStruct().fields;
CompressedQuadNode.STRUCT = makeCompressedNodeStruct().nstruct;
nstructjs.register(CompressedQuadNode);

let blink_rets = util.cachering.fromConstructor(Vector3, 64);
let blink_rets4 = util.cachering.fromConstructor(Vector4, 64);
let tmptanmat = new Matrix4();
let uvstmp = new Array(4);
for (let i = 0; i < 4; i++) {
  uvstmp[i] = new Vector2();
}

let stmp1 = new Vector3(), stmp2 = new Vector3();
let recttemps = new util.cachering(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], 64);
let interptemp1 = [];

export const QuadTreeFlags = {
  SELECT: 1,
  LEAF: 2,
  DEAD: 4,
  TEMP: 8
};

const {SELECT, LEAF, DEAD, TEMP} = QuadTreeFlags;

let _getuv_rets = util.cachering.fromConstructor(Vector2, 32);

export class QuadTreeGrid extends GridBase {
  constructor() {
    super();

    this.leafPoints = [];
    this.leafNodes = [];

    //these two are copied from GridSettings
    this.depthLimit = 0;
    this.depthLimitEnabled = false;

    this.normalQuad = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

    this.loopEid = -1;

    this.dimen = 1;
    this.pmap = {};
    this.nodes = [];
    this.freelist = []; //for freeds nodes
    this.polys = [];

    this.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.MIRROR | QRecalcFlags.CHECK_CUSTOMDATA;

    this.nodeFieldSize = QTOT;
    this.subdtemps = util.cachering.fromConstructor(Vector3, 32);
  }

  /*
  set nodes(ns) {
    let ns2 = {};

    //ns2.length = 0;
    ns2.length = ns.length;

    for (let i=0; i<ns.length; i++) {
      ns2[i] = ns[i];
    }

    ns2.remove = function(item) {
      Array.prototype.remove.call(this, item);
    }

    ns2.indexOf = function(item) {
      for (let i=0; i<this.length; i++) {
        if (this[i] === item) {
          return i;
        }
      }

      return -1;
    }
    ns2.push = function(item) {
      this[this.length++] = item;
    }

    ns2.concat = function(b) {
      let ns3 = {};
      for (let k in ns2) {
        ns3[k] = ns2[k];
      }

      for (let i=0; i<b.length; i++) {
        ns3.push(b[i]);
      }

      return ns3;
    }

    //Object.defineProperty()
    this._nodes = ns2;
  }

  get nodes() {
    return this._nodes;
  }*/

  _saveNodes() {
    return CompressedQuadNode.fromNodes(this.nodes);
  }

  copyTo(b) {
    b.topo = undefined;
    b.dimen = this.dimen;
    b.nodes = this.nodes.concat([]);
    b.points.length = 0;
    b.freelist = this.freelist.concat([]);

    for (let p of this.points) {
      let p2 = new GridVert(p.index, -1);

      p2.loopEid = p.loopEid;

      p2.load(p);
      p2.flag = p.flag;
      p2.no.load(p.no);

      b.points.push(p2);
    }

    b.customDataLayout = this.customDataLayout.concat([]);
    b.customDatas = [];

    for (let i = 0; i < this.customDatas.length; i++) {
      let cd1 = this.customDatas[i];
      let cd2 = [];
      b.customDatas.push(cd2);

      for (let c of cd1) {
        cd2.push(c.copy());
      }
    }

    b.cdmap = this.cdmap.concat([]);
    b.cdmap_reverse = this.cdmap_reverse.concat([]);

    b.recalcFlag = QRecalcFlags.ALL;

    b.relinkCustomData();
    b._rebuildHash();
  }

  getNormalQuad(loop) {
    let ret = recttemps.next();

    ret[0].load(loop.f.no);
    ret[2].load(loop.v.no);

    ret[1].zero();
    for (let l of loop.prev.e.loops) {
      ret[1].add(l.f.no);
    }
    ret[1].normalize();

    ret[3].zero();
    for (let l of loop.e.loops) {
      ret[3].add(l.f.no);
    }
    ret[3].normalize();

    return ret;
  }

  getQuad(loop) {
    let ret = recttemps.next();

    ret[0].load(loop.f.cent);
    ret[1].load(loop.v).interp(loop.prev.v, 0.5);
    ret[2].load(loop.v);
    ret[3].load(loop.v).interp(loop.next.v, 0.5);

    return ret;
  }

  smoothPoint(v, fac=1.0) {
    let _tmp = stmp1;

    _tmp.zero();
    let w = 0.0;

    for (let vr of v.bRing) {//v.neighbors) {
      vr.interp(v, 0.5);
      v.load(vr, true);
    }

    for (let vr of v.bRing) {
      for (let v2 of vr.neighbors) {
        if (v2 === vr || v2.loopEid !== vr.loopEid) {
          continue;
        }

        let w2 = 1.0;
        _tmp.addFac(v2, w2);
        w += w2;
      }
    }

    for (let v2 of v.neighbors) {
      if (v2.loopEid !== v.loopEid) {
        continue;
      }

      _tmp.add(v2);
      w++;
    }

    if (w !== 0.0) {
      _tmp.mulScalar(1.0 / w);
      v.interp(_tmp, fac);
    }

    /*
    for (let v2 of v.bRing) {
      v2[0] = v[0];
      v2[1] = v[1];
      v2[2] = v[2];
    }//*/
  }

  stitchBoundaries() {
    for (let p of this.points) {
      let w = 1.0;

      for (let pr of p.bRing) {
        p.add(pr);
        w++;
      }

      p.mulScalar(1.0 / w);

      for (let pr of p.bRing) {
        pr.load(p, true);
      }
    }
  }

  _hashPoint(u, v) {
    let dimen = 1024 * 1024;
    u = ~~(u * dimen);
    v = ~~(v * dimen);

    return v * dimen + u;
  }


  _getPoint(u, v, loopEid, isNewOut) {
    if (this.pmap === undefined) {// || (this.recalcFlag & QRecalcFlags.POINTHASH)) {
      this._rebuildHash();
    }

    let key = this._hashPoint(u, v);

    if (key in this.pmap) {
      if (isNewOut) {
        isNewOut[0] = false;
      }
      return this.points[this.pmap[key]];
    }

    if (isNewOut) {
      isNewOut[0] = true;
    }

    this.pmap[key] = this.points.length;
    let p = new GridVert(this.points.length, loopEid);

    p.neighbors = new Set();

    for (let i = 0; i < this.customDataLayout.length; i++) {
      let cls = this.customDataLayout[i];
      let cd = new cls();

      p.customData.length = this._max_cd_i;
      p.customData[this.cdmap_reverse[i]] = cd;

      this.customDatas[i].push(cd);
    }

    this.points.push(p);

    return p;
  }

  _getUV(ni, pidx) {
    let uv = _getuv_rets.next();
    let ns = this.nodes;

    if (pidx === 5) {
      throw new Error("_getUV");
    }

    switch (pidx) {
      case 0:
        uv[0] = ns[ni + QMINU];
        uv[1] = ns[ni + QMINV];
        break;
      case 1:
        uv[0] = ns[ni + QMINU];
        uv[1] = ns[ni + QMAXV];
        break;
      case 2:
        uv[0] = ns[ni + QMAXU];
        uv[1] = ns[ni + QMAXV];
        break;
      case 3:
        uv[0] = ns[ni + QMAXU];
        uv[1] = ns[ni + QMINV];
        break;
      default:
        throw new Error("bad pidx passed to _getUV");
    }

    return uv;
  }

  _rebuildHash() {
    this.recalcFlag &= ~QRecalcFlags.POINTHASH;

    let nodes = this.nodes;

    this.pmap = {};

    let donode = (ni, a, b, pi) => {
      let u, v;

      u = nodes[ni + a];
      v = nodes[ni + b];

      let key = this._hashPoint(u, v);
      this.pmap[key] = nodes[ni + QPOINT1 + pi];
    }

    for (let ni = 0; ni < nodes.length; ni += QTOT) {
      if (nodes[ni + QFLAG] & DEAD) {
        continue;
      }

      donode(ni, QMINU, QMINV, 0);
      donode(ni, QMINU, QMAXV, 1);
      donode(ni, QMAXU, QMAXV, 2);
      donode(ni, QMAXU, QMINV, 3);
    }
  }

  _freeNode(ni) {
    if (!ni) {
      console.error("Cannot free root node");
      return;
    }

    let ns = this.nodes;

    if (ns[ni + QFLAG] & DEAD) {
      console.warn("Tried to free same quadtree node twice", ni);
      return;
    }

    let pi = ns[ni + QPARENT];
    let ok = true;

    for (let i = 0; i < 4; i++) {
      if (ns[pi + QCHILD1 + i]) {
        ok = false;
      }
    }

    if (ok) {
      ns[pi + QFLAG] |= LEAF;
    }

    ns[ni + QPARENT] = 0;
    ns[ni + QFLAG] = DEAD;

    this.freelist.push(ni);
  }

  _newNode() {
    let ns = this.nodes;
    let ni;

    if (this.freelist.length > 0) {
      ni = this.freelist.pop();
    } else {
      ni = ns.length;
      ns.length += QTOT;
    }

    for (let i = 0; i < QTOT; i++) {
      ns[ni + i] = 0.0;
    }

    ns[ni + QID] = _quad_node_idgen++; //Math.random();
    ns[ni + QFLAG] = LEAF;

    return ni;
  }

  _ensureNodePoint(ni, pidx, loopEid = undefined, isNewOut) {
    let nodes = this.nodes;

    let u, v;
    switch (pidx) {
      case 0:
        u = nodes[ni + QMINU];
        v = nodes[ni + QMINV];
        break;
      case 1:
        u = nodes[ni + QMINU];
        v = nodes[ni + QMAXV];
        break;
      case 2:
        u = nodes[ni + QMAXU];
        v = nodes[ni + QMAXV];
        break;
      case 3:
        u = nodes[ni + QMAXU];
        v = nodes[ni + QMINV];
        break;
    }

    let p = this._getPoint(u, v, loopEid, isNewOut);

    this.nodes[ni + QPOINT1 + pidx] = p.index;

    return p;
  }

  /*
  set recalcFlag(val) {
    let was_set = this._recalcFlag & QRecalcFlags.NEIGHBORS;

    this._recalcFlag = val;

    if (!was_set && (val & QRecalcFlags.NEIGHBORS)) {
      console.warn("Neighbors recalc");
    }
  }

  get recalcFlag() {
    return this._recalcFlag;
  }//*/

  init(dimen, loop) {
    //console.log("grid init!");

    this.depthLimitEnabled = false;
    this.depthLimit = 0;

    this.dimen = dimen;
    this.polys.length = 0;
    this.points.length = 0;
    this.freelist.length = 0;
    this.nodes.length = 0;

    this.recalcFlag = QRecalcFlags.ALL | QRecalcFlags.MIRROR;

    this.pmap = {};

    if (loop !== undefined) {
      let quad = this.getQuad(loop);
      let nodes = this.nodes;

      let ni = this._newNode();

      if (ni !== 0) {
        throw new Error("root must be zero");
      }

      nodes[ni + QMINU] = nodes[ni + QMINV] = 0.0;
      nodes[ni + QMAXU] = nodes[ni + QMAXV] = 1.0;
      nodes[ni + QCENTU] = nodes[ni + QCENTV] = 0.5;
      nodes[ni + QFLAG] = LEAF;

      let p1 = this._ensureNodePoint(ni, 0, loop.eid);
      let p2 = this._ensureNodePoint(ni, 1, loop.eid);
      let p3 = this._ensureNodePoint(ni, 2, loop.eid);
      let p4 = this._ensureNodePoint(ni, 3, loop.eid);

      p1.load(quad[0]);
      p2.load(quad[1]);
      p3.load(quad[2]);
      p4.load(quad[3]);

      let rand = new util.MersenneRandom(loop.eid);

      let rec = (ni, depth) => {
        if (depth === 0) {
          return;
        }

        this.subdivide(ni);

        for (let i = 0; i < 4; i++) {
          if (rand.random() > 0.75) {
            //continue;
          }
          rec(nodes[ni + QCHILD1 + i], depth - 1);
        }
      }

      //rec(ni, 2);

      let ps = this.points;
      for (let i = 0; i < ps.length; i++) {
        break;
        ps[i][0] += Math.random() * 0.09;
        ps[i][1] += Math.random() * 0.09;
        ps[i][2] += Math.random() * 0.09;
      }

      this.rebuildNodePolys();
      this.flagNeighborRecalc();

      this.initCDLayoutFromLoop(loop);
    }

    this.relinkCustomData();

    this.recalcFlag |= QRecalcFlags.ALL;

    return this;
  }

  printNodes() {
    let s = "";
    let ns = this.nodes;

    let alignlen = 0;
    for (let k in QuadTreeFields) {
      alignlen = Math.max(alignlen, k.length + 1);
    }

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      s += `==========${ni}=========\n`;

      for (let k in QuadTreeFields) {
        let k2 = k;
        let v = QuadTreeFields[k];

        while (k2.length < alignlen) {
          k2 = " " + k2;
        }

        s += `  ${k2} : ${ns[ni + v]}\n`;
      }

      s += "\n";
    }

    return s;
  }

  flagfRecalc() {
    this.recalcFlag |= QRecalcFlags.TOPO;
  }

  flagNeighborRecalc() {
    this.recalcFlag |= QRecalcFlags.NEIGHBORS;
  }

  applyBase(mesh, l, cd_grid) {
    if (this.points.length === 0) {
      return;
    }

    //let p1 = this._getPoint(0, 0, l.eid);
    //let p2 = this._getPoint(0, 1, l.eid);
    //let p3 = this._getPoint(1, 1, l.eid);
    //let p4 = this._getPoint(1, 0, l.eid);
    let ni = 0, ns = this.nodes, ps = this.points;
    let p3 = ps[ns[ni + QPOINT3]];

    l.v.load(p3);
    mesh.doMirrorSnap(l.v);
  }

  getTopo() {
    if (this.recalcFlag & QRecalcFlags.INDICES) {
      this.recalcPointIndices();
    }

    if (this.topo && !(this.recalcFlag & QRecalcFlags.TOPO)) {
      return this.topo;
    }

    this.topo = undefined;
    this.recalcFlag &= ~QRecalcFlags.TOPO;

    let ns = this.nodes;
    let ps = this.points;

    let vmap = [];

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;

      vmap.push({
        edges: [],
        nodes: [],
        index: i,
        uv: [-1, -1],
        p: ps[i]
      });
    }

    //get dimen of grid fine enough for deepest node

    let maxdepth = 0;
    for (let ni = 0; ni < ns.length; ni += QTOT) {
      maxdepth = Math.max(maxdepth, ns[ni + QDEPTH]);
    }

    if (this.depthLimitEnabled) {
      maxdepth = Math.min(maxdepth, this.depthLimit);
    }

    let dimen = this.dimen = gridSides[maxdepth] - 1;

    let emap = new Map();
    let idgen = 0;

    function ekey(a, b) {
      let min = Math.min(a, b);
      let max = Math.max(a, b);

      return min | (max << 21);
      //return Math.min(a, b) + ":" + Math.max(a, b);
    }

    function getedge(a, b) {
      let key = ekey(a, b);

      if (!emap.has(key)) {
        let e = {
          v1: a,
          v2: b,
          p1: ps[a],
          p2: ps[b],
          id: idgen++,
          nodes: []
        }

        vmap[a].edges.push(e);
        vmap[b].edges.push(e);

        emap.set(key, e);
        return e;
      }

      return emap.get(key);
    }

    let uvmap = {};

    function uvkey(u, v) {
      let dimen2 = dimen * 16;

      u = ~~(u * dimen2 + 0.0001);
      v = ~~(v * dimen2 + 0.0001);
      return v * dimen2 + u;
    }

    function setuv(v1, u, v) {
      let was_set = v1.uv[0] >= 0;

      let eps = 0.0000001;

      if (was_set && (Math.abs(u - v1.uv[0]) > eps || Math.abs(v - v1.uv[1])) > eps) {
        //console.log(v1, v1.uv[0], v1.uv[1], u, v);
        //throw new Error("u, v differ");
      }

      v1.uv[0] = u;
      v1.uv[1] = v;
    }

    function addedge(ni, a, b, u, v) {
      let v1 = vmap[a], v2 = vmap[b];

      setuv(v1, u, v);

      let e = getedge(a, b);
      e.nodes.push(ni);
    }

    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      let depth = ns[ni + QDEPTH];

      if ((ns[ni + QFLAG] & LEAF) && depth > depthLimit) {
        continue;
      }

      let isleaf = ns[ni + QFLAG] & LEAF;
      isleaf = isleaf || depth === depthLimit;

      if (!isleaf || (ns[ni + QFLAG] & DEAD)) {
        continue;
      }

      let ip1 = ns[ni + QPOINT1];
      let ip2 = ns[ni + QPOINT2];
      let ip3 = ns[ni + QPOINT3];
      let ip4 = ns[ni + QPOINT4];

      let minu = ns[ni + QMINU];
      let minv = ns[ni + QMINV];
      let maxu = ns[ni + QMAXU];
      let maxv = ns[ni + QMAXV];

      let du = maxu - minu;
      let dv = maxv - minv;

      for (let j = 0; j < 4; j++) {
        let ip = ns[ni + QPOINT1 + j];

        vmap[ip].nodes.push(ni);
      }

      addedge(ni, ip1, ip2, minu, minv);
      addedge(ni, ip2, ip3, minu, minv + dv);
      addedge(ni, ip3, ip4, minu + du, minv + dv);
      addedge(ni, ip4, ip1, minu + du, minv);
    }

    for (let i = 0; i < ps.length; i++) {
      let v = vmap[i];
      let key = uvkey(v.uv[0], v.uv[1]);

      uvmap[key] = i;
    }

    this.topo = {
      maxdepth, vmap, emap, uvmap, dimen, uvkey
    };

    return this.topo;
  }

  stripExtraData() {
    this.topo = undefined;

    for (let p of this.points) {
      p.bRingRemove();
      p.bLink = undefined;
    }

    this.leafNodes = [];
    this.leafPoints = [];
    this.pmap = undefined;

    this.recalcFlag |= QRecalcFlags.NEIGHBORS | QRecalcFlags.TOPO | QRecalcFlags.POLYS
      | QRecalcFlags.POINTHASH | QRecalcFlags.LEAVES | QRecalcFlags.INDICES;

  }

  updateMirrorFlag(mesh, p, isboundary = false) {
    let threshold = 0.001;
    let sym = mesh.symFlag;

    p.flag &= ~(MeshFlags.MIRRORED | MeshFlags.MIRROR_BOUNDARY);

    if (!sym) {
      return;
    }

    for (let i = 0; i < 3; i++) {
      if (!(sym & (1 << i))) {
        continue;
      }

      if (Math.abs(p[i]) < threshold) {
        p.flag |= MeshFlags.MIRROREDX << i;

        if (isboundary) {
          p.flag |= MeshFlags.MIRROR_BOUNDARY;
        }
      }
    }
  }

  compactNodes() {
    this.recalcFlag |= QRecalcFlags.POLYS | QRecalcFlags.NEIGHBORS | QRecalcFlags.TOPO;

    this.topo = undefined;

    let ns = this.nodes;
    let nmap = new Array(ns.length);
    let ns2 = [];

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      nmap[ni] = ns2.length;

      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      for (let i = 0; i < QTOT; i++) {
        ns2.push(ns[ni + i]);
      }
    }

    for (let ni = 0; ni < ns2.length; ni += QTOT) {
      for (let i = 0; i < 4; i++) {
        if (ns2[ni + QCHILD1 + i]) {
          ns2[ni + QCHILD1 + i] = nmap[ns2[ni + QCHILD1 + i]];
        }
      }

      if (ns2[ni + QPARENT]) {
        ns2[ni + QPARENT] = nmap[ns2[ni + QPARENT]];
      }
    }

    this.nodes = ns2;
    this.freelist.length = 0;
  }

  updateMirrorFlags(mesh, loop, cd_grid) {
    this.recalcFlag &= ~QRecalcFlags.MIRROR;

    let doneset = new Array(this.points.length);

    let ns = this.nodes, ps = this.points;

    let bound1 = loop.prev.e.l === loop.prev.e.l.radial_next;
    let bound2 = loop.e.l === loop.e.l.radial_next;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if ((ns[ni + QFLAG] & DEAD)) {// || !(ns[ni+QFLAG] & LEAF)) {
        continue;
      }

      for (let i = 0; i < 4; i++) {
        let ip = ns[ni + QPOINT1 + i];
        if (!doneset[ip]) {
          doneset[ip] = true;

          let p = ps[ip];
          let uv = this._getUV(ni, i);

          let eps = 0.00001;
          let mask = 0;

          if (uv[0] <= eps) {
            mask |= 1;
          } else if (uv[0] > 1.0 - eps) {
            mask |= 2;
          }

          if (uv[1] <= eps) {
            mask |= 4;
          } else if (uv[1] > 1.0 - eps) {
            mask |= 8;
          }
          /*
          *     prev  u   l.v (1, 1)
          *
          *     v          v
          *
          *(0,0)cent  u   next
          */
          let boundary = false;
          if (mask === (8 | 2)) {
            boundary = bound1 || bound2;
          } else if (mask & 2) {
            boundary = bound2;
          } else if (mask & (8)) {
            boundary = bound1;
          }

          //if (p) {
          this.updateMirrorFlag(mesh, p, boundary);
          //}
        }
      }
    }
  }

  buildTangentMatrix(ni, u, v, matOut) {
    let m = matOut.$matrix;

    matOut.makeIdentity();

    let ns = this.nodes;
    let ps = this.points;

    u = (u - ns[ni + QMINU]) / (ns[ni + QMAXU] - ns[ni + QMINU]);
    v = (v - ns[ni + QMINV]) / (ns[ni + QMAXV] - ns[ni + QMINV]);

    let p1 = ps[ns[ni + QPOINT1]];
    let p2 = ps[ns[ni + QPOINT2]];
    let p3 = ps[ns[ni + QPOINT3]];
    let p4 = ps[ns[ni + QPOINT4]];

    let quadco = _btm_temp9;
    let a = _btm_temp1;
    let b = _btm_temp2;

    a.load(p1).interp(p2, v);
    b.load(p4).interp(p3, v);
    quadco.load(a).interp(b, u);

    let tmat = tmptanmat;
    tmat.makeIdentity();
    tmat.translate(quadco[0], quadco[1], quadco[2]);

    let vx = _btm_temp3;
    let vy = _btm_temp4;

    vx.load(p2).sub(p1);
    vy.load(p4).sub(p1);

    let lx = vx.vectorLength();
    let ly = vy.vectorLength();

    if (lx === 0.0 || ly === 0.0) {
      return;
    }

    let n = _btm_temp5;
    let n2 = _btm_temp7;

    let scale = (lx + ly) * 0.5;
    scale = Math.max(scale, 0.0001);

    vx.normalize();
    vy.normalize();

    /*
    a.load(p1.no).interp(p2.no, v);
    b.load(p4.no).interp(p3.no, v);
    n.load(a).interp(b, u);
    n.normalize();
    */

    //bad normal?
    //if (n.dot(n) < 0.00001) {
    //n.load(p1.no).add(p2.no).add(p3.no).add(p4.no).normalize().mulScalar(scale);
    n.load(vx).cross(vy).normalize();
    //}

    //if (n.dot(n2) < 0) {
    //  n.negate();
    //}

    n.mulScalar(scale);

    //lx = ly = scale;
    //vx.mulScalar(lx);
    //vy.mulScalar(ly);

    vy.load(n).cross(vx).normalize().mulScalar(lx);
    vx.load(vy).cross(n).normalize().mulScalar(ly);

    m.m11 = vx[0];
    m.m21 = vx[1];
    m.m31 = vx[2];

    m.m12 = vy[0];
    m.m22 = vy[1];
    m.m32 = vy[2];

    m.m13 = n[0];
    m.m23 = n[1];
    m.m33 = n[2];

    matOut.preMultiply(tmat);
  }

  invertTangentMatrix(mat) {
    let tmat = imattemp;

    tmat.makeIdentity();

    //let start = imattemp2;
    //start.load(mat);

    let m = mat.$matrix;
    let x = m.m41;
    let y = m.m42;
    let z = m.m43;

    let tm = tmat.$matrix;
    tm.m41 = -x;
    tm.m42 = -y;
    tm.m43 = -z;

    m.m41 = 0;
    m.m42 = 0;
    m.m43 = 0;
    m.m44 = 1;

    let lx = m.m11 * m.m11 + m.m21 * m.m21 + m.m31 * m.m31;
    let ly = m.m12 * m.m12 + m.m22 * m.m22 + m.m32 * m.m32;
    let lz = m.m13 * m.m13 + m.m23 * m.m23 + m.m33 * m.m33;

    //console.log("LENS", lx.toFixed(4), ly.toFixed(4), lz.toFixed(4));
    //console.log("MT", "" + mat);

    if (lx > 0.0) {
      lx = 1.0 / lx;
      m.m11 *= lx;
      m.m21 *= lx;
      m.m31 *= lx;
    }
    if (ly > 0.0) {
      ly = 1.0 / ly;
      m.m12 *= ly;
      m.m22 *= ly;
      m.m32 *= ly;
    }
    if (lz > 0.0) {
      lz = 1.0 / lz;
      m.m13 *= lz;
      m.m23 *= lz;
      m.m33 *= lz;
    }

    mat.transpose();
    mat.multiply(tmat);

    //start.multiply(mat);
    //console.log(""+start);
  }

  subdivideAll(mesh, loop, cd_grid) {
    if (this.depthLimitEnabled) {
      this.tangentToGlobal(this.depthLimit, false);
    }

    let ns = this.nodes;
    let nodes = [];
    let loopEid = loop.eid;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (!(ns[ni + QFLAG] & LEAF) || (ns[ni + QFLAG] & DEAD)) {
        continue;
      }

      nodes.push(ni);
    }

    this.dimen++;
    this._rebuildHash();

    for (let ni of nodes) {
      this.subdivide(ni, loopEid);
    }

    this.recalcFlag |= QRecalcFlags.TOPO | QRecalcFlags.MIRROR | QRecalcFlags.NORMALS;
    this.recalcFlag |= QRecalcFlags.MIRROR | QRecalcFlags.POLYS;

    if (this.depthLimitEnabled) {
      this.tangentToGlobal(this.depthLimit, true);
    }
  }

  tangentToGlobal(level = this.depthLimit, inverse = false) {
    let ns = this.nodes, ps = this.points;

    let doneset = new WeakSet();
    let plvls = new Map();
    for (let p of this.points) {
      plvls.set(p, 100000);
    }

    let levelps = new Map();

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      let depth = ns[ni + QDEPTH];

      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      for (let i = 0; i < 4; i++) {
        let p = ps[ns[ni + QPOINT1 + i]];

        let lvl = plvls.get(p);
        lvl = Math.min(lvl, depth);

        plvls.set(p, lvl);
      }
    }

    for (let p of this.points) {
      let lvl = plvls.get(p);

      if (!levelps.has(lvl)) {
        levelps.set(lvl, []);
      }

      levelps.get(lvl).push(p);
    }

    let tanMat = new Matrix4();
    let mat2 = new Matrix4();

    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;
    let tmp1 = new Vector3();
    let tmp2 = new Vector3();
    let tmp3 = new Vector3();
    let tmp4 = new Vector3();
    let tmp5 = new Vector3();

    for (let p of this.points) {
      let lvl = plvls.get(p);
      if (lvl <= depthLimit) {
        doneset.add(p);
      }

      if (!inverse) {
        p.no.zero();
      }
    }

    //update root level normals
    let nq = this.normalQuad;

    for (let i = 0; i < 4; i++) {
      let p = ps[ns[QPOINT1 + i]];
      p.no.load(nq[i]);
    }

    let si = 1;
    let cur = 0;

    const STACKSIZE = 256;
    let stack = new Array(STACKSIZE);
    stack[0] = 0;

    //console.log("Level", level, "Inverse", inverse);

    let nodes = [];
    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }
      nodes.push(ni);
    }

    if (inverse) {
      nodes.sort((a, b) => ns[b + QDEPTH] - ns[a + QDEPTH]);
    } else {
      nodes.sort((a, b) => ns[a + QDEPTH] - ns[b + QDEPTH]);
    }

    //console.log(nodes);
    let lastdepth = 0;
    let tmpco = new Vector3();

    for (let ni of nodes) {
      let depth = ns[ni + QDEPTH];

      if (!inverse && depth !== lastdepth) {
        for (let p of ps) {//levelps.get(lastdepth)) {
          if (plvls.get(p) > lastdepth) {
            continue;
          }

          p.no.normalize();
        }
      }
      lastdepth = depth;

      if (!ni || depth <= level) {
        continue;
      }

      let pi = ns[ni + QPARENT];
      //console.log("pi", pi, ni);

      for (let i = 0; i < 4; i++) {
        let p = ps[ns[ni + QPOINT1 + i]];
        let lvl = plvls.get(p);

        if (lvl !== ns[ni + QDEPTH] || doneset.has(p)) {
          continue;
        }

        //console.log(lvl);
        doneset.add(p);

        let uv = this._getUV(ni, i);

        tanMat.makeIdentity();
        this.buildTangentMatrix(pi, uv[0], uv[1], tanMat);


        if (inverse) {
          //this.invertTangentMatrix(tanMat);
          tanMat.invert();
        }

        let co = tmpco.load(p);

        //console.log(ni, ""+tanMat);
        p.multVecMatrix(tanMat);

        if (isNaN(p.dot(p))) {
          console.error("NaN!");
          p.load(co);
        }
      }

      if (!inverse) {
        let p1 = ps[ns[ni + QPOINT1]];
        let p2 = ps[ns[ni + QPOINT2]];
        let p3 = ps[ns[ni + QPOINT3]];
        let p4 = ps[ns[ni + QPOINT4]];

        let n = math.normal_quad(p1, p2, p3, p4);

        for (let i = 0; i < 4; i++) {
          let p = ps[ns[ni + QPOINT1 + i]];
          //let lvl = plvls.get(p);

          //if (lvl === ns[ni + QDEPTH]) {
          p.no.add(n);
          //}
        }
      }
    }
  }

  globalToTangent(level = this.depthLimit) {
    return this.tangentToGlobal(level, true);
  }

  _changeMresSettings(depthLimit, enabled) {
    if (!enabled && this.depthLimitEnabled) {
      this.tangentToGlobal();

      this.depthLimit = depthLimit;
      this.depthLimitEnabled = enabled;
      return;
    } else if (!enabled && !this.depthLimitEnabled) {
      //this.depthLimit = depthLimit;
      //this.depthLimitEnabled = false;
      //return;
    }

    if (depthLimit === this.depthLimit && enabled === this.depthLimitEnabled) {
      return;
    }

    if (this.depthLimitEnabled) {
      this.tangentToGlobal(this.depthLimit);
    }

    this.depthLimitEnabled = enabled;
    this.depthLimit = depthLimit;

    this.globalToTangent(depthLimit);
  }

  update(mesh, loop, cd_grid) {
    if (GridBase.hasPatchUVLayer(mesh, cd_grid) && (this.recalcFlag & QRecalcFlags.PATCH_UVS)) {
      let cd_uv = GridBase.getPatchUVLayer(mesh, cd_grid);
      this.initPatchUVLayer(mesh, loop, cd_grid, cd_uv);
    }

    if (this.loopEid !== loop.eid) {
      for (let p of this.points) {
        p.loopEid = loop.eid;
      }

      this.loopEid = loop.eid;
    }

    if (this.recalcFlag & QRecalcFlags.POINT_PRUNE) {
      //this.recalcFlag |= QRecalcFlags.TOPO | QRecalcFlags.POLYS;
      this.pruneDeadPoints();
    }

    if (this.recalcFlag & QRecalcFlags.INDICES) {
      this.recalcPointIndices();
    }

    let mres = mesh.loops.customData.flatlist[cd_grid].getTypeSettings();

    let limitDepth = !!(mres.flag & GridSettingFlags.ENABLE_DEPTH_LIMIT);

    if (limitDepth !== !!this.depthLimitEnabled || mres.depthLimit !== this.depthLimit) {
      if (this.recalcFlag & QRecalcFlags.NORMALS) {
        this.recalcNormals(mesh, loop, cd_grid);
      }

      util.console.warn("grid settings change detected");
      this.updateNormalQuad(loop);
      this._changeMresSettings(mres.depthLimit, limitDepth);

      this.recalcFlag |= QRecalcFlags.LEAVES | QRecalcFlags.TOPO | QRecalcFlags.POLYS | QRecalcFlags.NORMALS | QRecalcFlags.NEIGHBORS;
    }

    if (this.recalcFlag & QRecalcFlags.CHECK_CUSTOMDATA) {
      this.recalcFlag &= ~QRecalcFlags.CHECK_CUSTOMDATA;
      this.checkCustomDataLayout(mesh);
    }

    if (this.recalcFlag & QRecalcFlags.POINTHASH) {
      this._rebuildHash();
    }

    if (this.recalcFlag & QRecalcFlags.TOPO) {
      for (let p of this.points) {
        p.loopEid = loop.eid;
      }
      this.getTopo();
    }

    if (this.recalcFlag & QRecalcFlags.POLYS) {
      this.rebuildNodePolys();
    }

    if (this.recalcFlag & QRecalcFlags.NEIGHBORS) {
      this.recalcNeighbors(mesh, loop, cd_grid);
    }

    if (this.recalcFlag & QRecalcFlags.MIRROR) {
      this.updateMirrorFlags(mesh, loop, cd_grid);
    }

    if (this.recalcFlag & QRecalcFlags.NODE_NORMALS) {
      this.checkNodeNormals();
    }

    if (this.recalcFlag & QRecalcFlags.VERT_NORMALS) {
      this.recalcNormals(mesh, loop, cd_grid);
    }
  }

  rebuildNodePolys() {
    if (this.recalcFlag & QRecalcFlags.POINT_PRUNE) {
      this.pruneDeadPoints();
    }

    //console.log("Rebuilding polygon map for quadtree node");

    this.recalcFlag &= ~QRecalcFlags.POLYS;

    let ns = this.nodes, ps = this.points;
    let {maxdepth, vmap, emap, uvmap, dimen, uvkey} = this.getTopo();

    /*
    for (let ni = 0; ni < ns.length; ni += QTOT) {
      ns[ni + QLEFT] = ns[ni + QRIGHT] = 0;
      ns[ni + QUP] = ns[ni + QDOWN] = 0;
    }*/

    /*
    console.log("maxdepth", maxdepth);
    console.log("vmap", vmap);
    console.log("emap", emap);
    console.log("uvmap", uvmap);
    */

    let du = 1.0 / dimen;
    let dv = 1.0 / dimen;

    let duv = new Vector2();
    duv[0] = du;
    duv[1] = dv;

    let duv1 = new Vector2();
    let uv2 = new Vector2();

    this.polys.length = 0;
    let polys = this.polys;
    let poly = [];

    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;

    let rec = (ni) => {
      let isleaf = (ns[ni + QFLAG] & LEAF) || ns[ni + QDEPTH] === depthLimit;

      if (!isleaf) {
        if (!(ns[ni + QFLAG] & LEAF)) {
          for (let i = 0; i < 4; i++) {
            let ni2 = ns[ni + QCHILD1 + i];
            rec(ni2);
          }
        }

        return;
      }

      //let ip5 = ns[ni + QPOINT5];

      ns[ni + QPOLYSTART] = polys.length;

      poly.length = 0;
      //poly.push(ip5);

      for (let i = 0; i < 4; i++) {
        let ip1 = ns[ni + QPOINT1 + i];
        let ip2 = ns[ni + QPOINT1 + ((i + 1) % 4)];
        let v1 = vmap[ip1];
        let v2 = vmap[ip2];

        duv1.load(v2.uv).sub(v1.uv);

        let axis = (i & 1) ^ 1;

        let steps = Math.abs(duv1[axis] / duv[axis]) + 0.00001;
        steps += 1;

        let sign1 = Math.sign(duv1[0]);
        let sign2 = Math.sign(duv1[1]);

        steps = ~~steps;

        uv2[0] = v1.uv[0];
        uv2[1] = v1.uv[1];

        let dt = duv[axis] * Math.sign(duv1[axis]);

        for (let j = 0; j < steps; j++) {
          if (uv2[axis] < 0 || uv2[axis] > 1) {
            continue;
          }

          let key = uvkey(uv2[0], uv2[1]);
          let p = uvmap[key];

          if (p !== undefined && (poly.length === 0 || p !== poly[poly.length - 1])) {
            poly.push(uvmap[key]);
          }

          uv2[axis] += dt;
        }

      }

      poly.pop();

      if (poly.length > 2) {
        for (let p of poly) {
          polys.push(p);
        }
      }

      ns[ni + QPOLYEND] = polys.length;
    }

    rec(0);

    return {
      vmap: vmap,
      emap: emap,
      dimen: dimen,
      uvmap: uvmap
    };
    //rec2(0);
  }

  pruneDeadPoints() {
    let ps = this.points;
    let ns = this.nodes;
    let newps = [];
    let pmap = new Array(ps.length);

    this.recalcFlag &= ~QRecalcFlags.POINT_PRUNE;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      for (let i = 0; i < 4; i++) {
        let ip = ns[ni + QPOINT1 + i];
        let p = ps[ip];

        if (pmap[ip] === undefined) {
          pmap[ip] = p.index = newps.length;
          newps.push(p);
        }

        ns[ni + QPOINT1 + i] = pmap[ip];
      }
    }

    this.points = newps;

    for (let i = 0; i < this.customDatas.length; i++) {
      let cd1 = this.customDatas[i];
      let cd2 = new Array(newps.length);

      for (let j = 0; j < cd1.length; j++) {
        if (pmap[j] !== undefined) {
          cd2[pmap[j]] = cd1[j];
        }
      }

      this.customDatas[i] = cd2;
    }

    this.relinkCustomData();
    this._rebuildHash();
  }

  collapse(ni) {
    let ns = this.nodes;

    let rec2 = (ni2) => {
      for (let i = 0; i < 4; i++) {
        let ni3 = ns[ni2 + QCHILD1 + i];

        if (ni3) {
          rec2(ni3);
          this._freeNode(ni3);
        }

        ns[ni2 + QCHILD1 + i] = 0;
      }
    }

    rec2(ni);

    ns[ni + QFLAG] |= LEAF;

    this.recalcFlag |= QRecalcFlags.LEAVES | QRecalcFlags.ALL | QRecalcFlags.MIRROR | QRecalcFlags.NEIGHBORS;
  }

  subdivide(ni, loopEid) {
    let nodes = this.nodes;

    if (nodes[ni + QFLAG] & DEAD) {
      console.error("cannot subdivide a deleted node");
      return;
    }

    if (!(nodes[ni + QFLAG] & LEAF)) {
      console.error("cannot subdivide already subdivided node");
      return;
    }

    let ni2 = ni;
    while (ni2) {
      nodes[ni2 + QSUBTREE_DEPTH]++;
      ni2 = nodes[ni2 + QPARENT];
    }

    //increment root too
    nodes[ni2 + QSUBTREE_DEPTH]++;

    //not a leaf anymore
    nodes[ni + QFLAG] &= ~LEAF;

    let depth = nodes[ni + QDEPTH];

    let dimen2 = gridSides[depth + 1] - 1;
    this.dimen = Math.max(this.dimen, dimen2);

    let du = (nodes[ni + QMAXU] - nodes[ni + QMINU]) * 0.5;
    let dv = (nodes[ni + QMAXV] - nodes[ni + QMINV]) * 0.5;

    let ps = this.points;

    let np1 = ps[nodes[ni + QPOINT1]];
    let np2 = ps[nodes[ni + QPOINT2]];
    let np3 = ps[nodes[ni + QPOINT3]];
    let np4 = ps[nodes[ni + QPOINT4]];

    let cdps = [0, 0, 0, 0];
    let cdws = [0, 0, 0, 0];

    let news = [[0], [0], [0], [0], [0]];
    let bs = new Array(5);

    let p1 = this.subdtemps.next().load(np1);
    let p2 = this.subdtemps.next().load(np2);
    let p3 = this.subdtemps.next().load(np3);
    let p4 = this.subdtemps.next().load(np4);

    let tmp1 = this.subdtemps.next(), tmp2 = this.subdtemps.next();

    let uvs = uvstmp;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        let u = i * 0.5, v = j * 0.5;

        let ni2 = this._newNode();

        nodes[ni + QCHILD1 + (j * 2 + i)] = ni2;

        nodes[ni2 + QPARENT] = ni;
        nodes[ni2 + QQUADIDX] = j * 2 + i;

        nodes[ni2 + QMINU] = nodes[ni + QMINU] + du * i;
        nodes[ni2 + QMINV] = nodes[ni + QMINV] + dv * j;

        nodes[ni2 + QMAXU] = nodes[ni2 + QMINU] + du;
        nodes[ni2 + QMAXV] = nodes[ni2 + QMINV] + dv;

        nodes[ni2 + QCENTU] = nodes[ni2 + QMINU] * 0.5 + nodes[ni2 + QMAXU] * 0.5;
        nodes[ni2 + QCENTV] = nodes[ni2 + QMINV] * 0.5 + nodes[ni2 + QMAXV] * 0.5;

        nodes[ni2 + QFLAG] = LEAF;
        nodes[ni2 + QDEPTH] = depth + 1;

        let b1 = this._ensureNodePoint(ni2, 0, loopEid, news[0]);
        let b2 = this._ensureNodePoint(ni2, 1, loopEid, news[1]);
        let b3 = this._ensureNodePoint(ni2, 2, loopEid, news[2]);
        let b4 = this._ensureNodePoint(ni2, 3, loopEid, news[3]);

        bs[0] = b1;
        bs[1] = b2;
        bs[2] = b3;
        bs[3] = b4;

        u = i * 0.5;
        v = j * 0.5;

        uvs[0][0] = u;
        uvs[0][1] = v;

        uvs[1][0] = u;
        uvs[1][1] = v + 0.5;

        uvs[2][0] = u + 0.5;
        uvs[2][1] = v + 0.5;

        uvs[3][0] = u + 0.5;
        uvs[3][1] = v;

        for (let k = 0; k < 4; k++) {
          if (!news[k][0]) {
            continue;
          }

          /*blinear basis functions

           on factor;

           a := p1 + (p2 - p1)*v2;
           b := p4 + (p3 - p4)*v2;
           w := a + (b - a)*u2;

           fw1 := sub(p2=0, p3=0, p4=0, w)/p1;
           fw2 := sub(p1=0, p3=0, p4=0, w)/p2;
           fw3 := sub(p1=0, p2=0, p4=0, w)/p3;
           fw4 := sub(p1=0, p2=0, p3=0, w)/p4;


           fw1 := (u2*v2 - u2 - v2 + 1.0);
           fw2 := (-u2*v2 + v2);
           fw3 := (u2*v2);
           fw4 := (u2 - u2*v2);

           fpoly := fw1*p1 + fw2*p2 + fw3*p3 + fw4*p4;
           fpoly - w;

          */

          let u2 = uvs[k][0];
          let v2 = uvs[k][1];

          tmp1.load(p1).interp(p2, v2);
          tmp2.load(p4).interp(p3, v2);
          tmp1.interp(tmp2, u2);

          let pnew = bs[k];
          pnew.load(tmp1);

          cdws[0] = u2 * v2 - u2 - v2 + 1.0;
          cdws[1] = v2 * (1.0 - u2);
          cdws[2] = u2 * v2;
          cdws[3] = u2 * (1.0 - v2);

          let sum = cdws[0] + cdws[1] + cdws[2] + cdws[3];
          sum = sum === 0.0 ? 0.00001 : sum;

          for (let i1 = 0; i1 < 4; i1++) {
            cdws[i1] /= sum;
          }

          for (let ci = 0; ci < pnew.customData.length; ci++) {
            if (pnew.customData[ci]) {
              cdps[0] = np1.customData[ci];
              cdps[1] = np2.customData[ci];
              cdps[2] = np3.customData[ci];
              cdps[3] = np4.customData[ci];

              pnew.customData[ci].interp(pnew.customData[ci], cdps, cdws);
            }
          }
        }
      }
    }

    this.recalcFlag |= QRecalcFlags.LEAVES | QRecalcFlags.ALL | QRecalcFlags.MIRROR | QRecalcFlags.NORMALS;
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.LOOP, //see MeshTypes in mesh.js
      typeName: "QuadTreeGrid",
      settingsClass: GridSettings,
      uiTypeName: "QuadTreeGrid",
      defaultName: "QuadTreeGrid",
      valueSize: undefined,
      flag: 0
    }
  };

  _ensure(mesh, loop, cd_grid) {
    if (this.points.length === 0) {
      this.init(this.dimen, loop);
      let layeri = 0, i = 0;

      console.log("INIT", this);

      this.customDatas.length = 0;

      for (let layer of mesh.loops.customData.flatlist) {
        let cls = CustomDataElem.getTypeClass(layer.typeName);

        if (GridBase.isGridClass(cls)) {
          layeri++;
          continue;
        }

        this.onNewLayer(cls, layeri);
        i++;
      }
    }
  }

  makeDrawTris(mesh, smesh, loop, cd_grid) {
    this.updateNormalQuad(loop);

    if (this.points.length === 0) {
      this.init(this.dimen, loop);
    }

    this.update(mesh, loop, cd_grid);

    let nodes = this.nodes;
    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
    }

    let polys = this.polys;

    let ischunk = smesh instanceof ChunkedSimpleMesh;
    let feid = loop.f.eid;

    let cd_color = mesh.loops.customData.getLayerIndex("color");
    let have_color = cd_color >= 0;

    let cd_node = mesh.loops.customData.getLayerIndex("bvh");

    let idmul = this.dimen * this.dimen;
    idmul = Math.max(idmul, this.polys.length);

    let tc1 = new Vector4();
    let tc2 = new Vector4();
    let tc3 = new Vector4();
    tc1[3] = tc2[3] = tc3[3] = 1.0;

    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;
    let depthLimitEnabled = this.depthLimitEnabled;

    for (let ni = 0; ni < nodes.length; ni += QTOT) {
      let depth = nodes[ni + QDEPTH];
      let isleaf = (nodes[ni + QFLAG] & LEAF) || depth === depthLimit;

      if (!isleaf || depth > depthLimit || (nodes[ni + QFLAG] & DEAD)) {
        continue;
      }

      let start = nodes[ni + QPOLYSTART];
      let end = nodes[ni + QPOLYEND];

      let p1 = ps[polys[start]];

      if (end - start < 3) {
        continue;
      }
      //continue;

      for (let i = start + 1; i < end - 1; i++) {
        let p2 = ps[polys[i]];
        let p3 = ps[polys[i + 1]];

        let tri;
        //let id = Math.random();
        let id = loop.eid * idmul + i;

        if (ischunk) {
          tri = smesh.tri(id, p1, p2, p3);
        } else {
          tri = smesh.tri(p1, p2, p3);
        }

        if (have_color) {
          let c1 = p1.customData[cd_color].color;
          let c2 = p2.customData[cd_color].color;
          let c3 = p3.customData[cd_color].color;
          tri.colors(c1, c2, c3);
        }

        tri.normals(p1.no, p2.no, p3.no);
      }
    }
  }

  _updateNormal(ni) {
    let nodes = this.nodes, ps = this.points;
    let p1 = ps[nodes[ni + QPOINT1]];
    let p2 = ps[nodes[ni + QPOINT2]];
    let p3 = ps[nodes[ni + QPOINT3]];
    let p4 = ps[nodes[ni + QPOINT4]];

    let n;

    n = math.normal_tri(p1, p2, p3);
    p1.no.add(n);
    p2.no.add(n);
    p3.no.add(n);
    p4.no.add(n);

    n = math.normal_tri(p1, p3, p4);
    p1.no.add(n);
    p2.no.add(n);
    p3.no.add(n);
    p4.no.add(n);
  }

  checkVertNormals(mesh, loop, cd_grid) {
    if (this.recalcFlag & QRecalcFlags.VERT_NORMALS) {
      this.recalcNormals(mesh, loop, cd_grid);
      return true;
    }

    return false;
  }

  checkNodeNormals() {
    if (!(this.recalcFlag & QRecalcFlags.NODE_NORMALS)) {
      return;
    }

    this.recalcFlag &= ~QRecalcFlags.NODE_NORMALS;

    let ns = this.nodes, ps = this.points;

    for (let ni of this.getLeafNodes()) {
      let p1 = ps[ns[ni + QPOINT1]];
      let p2 = ps[ns[ni + QPOINT2]];
      let p3 = ps[ns[ni + QPOINT3]];
      let p4 = ps[ns[ni + QPOINT4]];

      let n = math.normal_quad(p1, p2, p3, p4);

      ns[ni + QNX] = n[0];
      ns[ni + QNY] = n[1];
      ns[ni + QNZ] = n[2];
    }
  }

  getLeafPoints() {
    if (this.leafPoints && !(this.recalcFlag & QRecalcFlags.LEAF_POINTS)) {
      return this.leafPoints;
    }

    let ret = this.leafPoints = new Set();
    let ns = this.nodes, ps = this.points;
    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      let depth = ns[ni + QDEPTH];
      let isleaf = depth <= depthLimit && ((ns[ni + QFLAG] & LEAF) || depth === depthLimit);

      if (isleaf) {
        for (let i = 0; i < 4; i++) {
          let pi = ns[ni + QPOINT1 + i];
          ret.add(pi);
        }
      }
    }

    return ret;
  }

  getLeafNodes() {
    if (this.leafNodes && !(this.recalcFlag & QRecalcFlags.LEAF_NODES)) {
      return this.leafNodes;
    }

    let ret = this.leafNodes = [];
    let ns = this.nodes, ps = this.points;
    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      let depth = ns[ni + QDEPTH];
      let isleaf = depth <= depthLimit && ((ns[ni + QFLAG] & LEAF) || depth === depthLimit);

      if (isleaf) {
        ret.push(ni);
      }
    }

    return ret;
  }

  recalcNormals(mesh, l, cd_grid) {
    this.checkNodeNormals();

    this.recalcFlag &= ~QRecalcFlags.VERT_NORMALS;

    let ns = this.nodes, ps = this.points;

    let ps2 = new Set();

    for (let ni of this.getLeafNodes()) {
      for (let i = 0; i < 4; i++) {
        let p = ps[ns[ni + QPOINT1 + i]];

        if (!ps2.has(p)) {
          ps2.add(p);
          p.no.zero();
        }
      }
    }

    let temp = new Array(256);

    if (!mesh) {
      this.recalcFlag |= QRecalcFlags.VERT_NORMALS;

      for (let p of ps2) {
        let topo = this.getTopo();

        p.no.zero();

        let w = 1.0;

        let v = topo.vmap[p.index];
        for (let ni of v.nodes) {
          p.no[0] += ns[ni + QNX] * w;
          p.no[1] += ns[ni + QNY] * w;
          p.no[2] += ns[ni + QNZ] * w;
        }
      }

      return;
    }

    for (let p of ps2) {
      let topo = this.getTopo();

      p.no.zero();

      let w = 1.0;

      let v = topo.vmap[p.index];
      for (let ni of v.nodes) {
        p.no[0] += ns[ni + QNX]*w;
        p.no[1] += ns[ni + QNY]*w;
        p.no[2] += ns[ni + QNZ]*w;
      }

      if (!p.bLink) {
        p.no.normalize();
        continue;
      }

      let ti = 0;

      for (let p2 of p.bRing) {
        //for (let p2 of p.neighbors) {
        //for (let step=0; step<1; step++) {
        //  let p2 = step ? p.bLink.v2 : p.bLink.v1;

        if (p2.loopEid === p.loopEid) {
          continue;
        }
        if (p2.loopEid === undefined) {
          continue;
        }

        let l2 = mesh.eidmap[p2.loopEid];
        if (!l2) {
          continue;
        }

        let grid2 = l2.customData[cd_grid];

        grid2.checkNodeNormals();

        if (grid2.recalcFlag & QRecalcFlags.INDICES) {
          grid2.recalcPointIndices();
        }

        let topo2 = grid2.getTopo();

        let w = 1.0;

        let ns2 = grid2.nodes, ps2 = grid2.points;
        for (let ni of topo2.vmap[p2.index].nodes) {
          p.no[0] += ns2[ni + QNX]*w;
          p.no[1] += ns2[ni + QNY]*w;
          p.no[2] += ns2[ni + QNZ]*w;
        }
      }

      p.no.normalize();
    }
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    this.recalcFlag &= ~QRecalcFlags.NEIGHBORS;

    let topo = this.getTopo();
    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
    }

    for (let v of topo.vmap) {
      let p = v.p;
      p.neighbors = new Set();

      for (let e of v.edges) {
        let v2 = e.v1 === v.index ? e.v2 : e.v1;
        v2 = topo.vmap[v2];

        p.neighbors.add(v2.p);
      }
    }

    let uvs = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ];

    let uv = new Vector2();
    let duv = new Vector2();

    let dimen = topo.dimen;
    let uvmap = topo.uvmap;
    let uvkey = topo.uvkey;

    let l = loop;
    let lr = loop.radial_next;
    let lrn = loop.radial_next.next;

    let lrtopo;
    let lrps = lr.customData[cd_grid].points;

    let lrntopo;
    let lrnps = lrn.customData[cd_grid].points;

    let lpr = l.prev.radial_next;
    let lprtopo, lprps;

    let lprbad = false;

    if (lpr.v !== l.v) {
      lpr = lpr.next;
      lprbad = true;
    }

    lprtopo = lpr.customData[cd_grid].getTopo();
    lprps = lpr.customData[cd_grid].points;


    if (lr !== l) {
      lrtopo = lr.customData[cd_grid].getTopo();
      lrntopo = lrn.customData[cd_grid].getTopo();
    }

    let ln = l.next, lp = l.prev;
    let lntopo = ln.customData[cd_grid].getTopo();
    let lptopo = lp.customData[cd_grid].getTopo();
    let lnps = ln.customData[cd_grid].points;
    let lpps = lp.customData[cd_grid].points;

    let uv3 = new Vector2();

    function findNeighborEdge(p, l, ltopo, lps, side, u, v, axis) {
      let dimen2 = ltopo.dimen;

      let uv = uv3;
      uv[0] = u;
      uv[1] = v;

      let goal = uv[axis];
      uv[axis] = 0.0;

      let v1, v2;

      let dt = 1.0 / dimen2;
      let f1, f2;

      for (let i = 0; i < dimen2 + 1; i++) {
        let key = ltopo.uvkey(uv[0], uv[1]);
        let v = ltopo.uvmap[key];

        if (v === undefined) {
          uv[axis] += dt;
          continue;
        }

        if (uv[axis] <= goal) {
          v1 = v;
          f1 = uv[axis];
        }

        if (v1 !== undefined && uv[axis] >= goal) {
          v2 = v;
          f2 = uv[axis];
          break;
        }

        uv[axis] += dt;
      }

      //console.log("V1, V2", v1, v2);
      //console.log(u, v, uv, "dt", dt, "goal", goal, "axis", axis);

      if (v1 === v2 && v1 !== undefined) {
        v1 = lps[v1];

        p.neighbors.add(v1);
        p.bLink = new BLink(v1);
        p.bRingInsert(v1);
      } else if (v1 !== undefined && v2 !== undefined) {
        v1 = lps[v1];
        v2 = lps[v2];

        p.neighbors.add(v1);
        p.neighbors.add(v2);

        let t;
        if (f2 === f1) {
          t = 1.0;
        } else {
          t = (goal - f1) / (f2 - f1);
        }

        p.bLink = new BLink(v1, v2, t);
      }

    }

    for (let i = 0; i < 4; i++) {
      let uv1 = uvs[i], uv2 = uvs[(i + 1) % 4];
      let axis = (i + 1) & 1;

      uv.load(uv1);
      duv.load(uv2).sub(uv1);

      let dt = duv[axis] / dimen;

      for (let j = 0; j < dimen; j++) {
        let val = uv[axis];
        let key = uvkey(uv[0], uv[1]);
        let p1 = uvmap[key];

        if (!(val < 0.00001 || val > 0.9999)) {
          //uv[axis] += dt;
          //continue;
        }

        if (p1 === undefined) {
          uv[axis] += dt;
          continue;
        }

        p1 = ps[p1];

        if (i === 1 && !lprbad) {
          let u = 1.0;
          let v = val;

          let key = lprtopo.uvkey(u, v);

          let p2 = lprtopo.uvmap[key];
          if (p2 !== undefined) {
            p2 = lprps[p2];

            //console.log("found", axis, uv[0], uv[1], u, v, key in lrntopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = new BLink(p2);
            p1.bRingInsert(p2);
          } else {
            findNeighborEdge(p1, lpr, lprtopo, lprps, i, u, v, axis ^ 1);
          }
        } else if (i === 2 && lr !== l && lr.v !== l.v) {
          let u = val;
          let v = 1.0;

          let key = lrntopo.uvkey(u, v);

          let p2 = lrntopo.uvmap[key];
          if (p2 !== undefined) {
            p2 = lrnps[p2];

            //console.log("found", axis, uv[0], uv[1], u, v, key in lrntopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = new BLink(p2);
            p1.bRingInsert(p2);
          } else {
            findNeighborEdge(p1, lrn, lrntopo, lrnps, i, u, v, axis ^ 1);
          }
        } else if (i === 3) {
          let u = 0.0;
          let v = val;

          let key = lntopo.uvkey(u, v);
          let p2 = lntopo.uvmap[key];

          if (p2 !== undefined) {
            p2 = lnps[p2];

            //console.log("found", axis, uv[0], uv[1], u, v, key in lntopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = new BLink(p2);
            p1.bRingInsert(p2);
          } else {
            findNeighborEdge(p1, ln, lntopo, lnps, i, u, v, 1);
          }
        } else if (i === 0) {
          let u = val;
          let v = 0;

          let key = lptopo.uvkey(u, v);
          let p2 = lptopo.uvmap[key];

          if (p2 !== undefined) {
            p2 = lpps[p2];

            //console.log("found", axis, uv[0], uv[1], u, v, key in lptopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = new BLink(p2);
            p1.bRingInsert(p2);
          } else {
            findNeighborEdge(p1, lp, lptopo, lpps, i, u, v, 0);
          }
        }

        uv[axis] += dt;
      }
    }
  }

  updateNormalQuad(loop) {
    let quad = this.getNormalQuad(loop);
    for (let i = 0; i < 4; i++) {
      this.normalQuad[i].load(quad[i]);
    }
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {
    this.updateNormalQuad(loop);

    for (let p of this.points) {
      p.loopEid = loop.eid;
    }

    this.update(mesh, loop, cd_grid);

    let ps = this.points;
    let nodes = this.nodes;
    let polys = this.polys;
    //let feid = loop.f.eid;
    let leid = loop.eid;

    //console.log("DIMEN", this.dimen);

    let idmul = (this.dimen + 2) * (this.dimen + 2) * 16;
    idmul = this.idmul = Math.max(idmul, this.polys.length * 2);

    let needsCDFix = false;

    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;
    let depthLimitEnabled = this.depthLimitEnabled;

    for (let ni = 0; ni < nodes.length; ni += QTOT) {
      let depth = nodes[ni + QDEPTH];

      let isleaf = (nodes[ni + QFLAG] & LEAF) || depth === depthLimit;

      if (!isleaf || depth > depthLimit || (nodes[ni + QFLAG] & DEAD)) {
        continue;
      }


      let start = nodes[ni + QPOLYSTART];
      let end = nodes[ni + QPOLYEND];

      let p1 = ps[polys[start]];

      if (end - start < 3) {
        continue;
      }
      //continue;
      //console.log("fan:", end-start);

      for (let i = start + 1; i < end - 1; i++) {
        let p2 = ps[polys[i]];
        let p3 = ps[polys[i + 1]];

        let tri;
        //let id = Math.random();
        let id = loop.eid * idmul + i;

        if (!p1 || !p2 || !p3) {
          //console.warn("missing points", p1, p2, p3);
          continue;
        }

        trisout.push(leid);
        //trisout.push(loop.eid*idmul + ni);

        trisout.push(id);
        trisout.push(p1);
        trisout.push(p2);
        trisout.push(p3);
      }
    }
  }

  _loadCompressedNodes(ns1 = this.nodes) {
    let ns2 = [];

    if (ns1.length === 0) {
      return;
    }
    this.nodes = ns2;

    let fields = {};
    for (let k in ns1[0]) {
      if (typeof k === "symbol" || !k.startsWith("Q")) {
        continue;
      }

      if (!(k in QuadTreeFields)) {
        console.error("Unknown quad tree field", k);
        continue;
      }

      fields[k] = QuadTreeFields[k];
    }

    //console.log("FIELDS", fields);

    let leaves = [];

    for (let n of ns1) {
      let ni = ns2.length;

      ns2.length += QTOT;

      for (let i = 0; i < QTOT; i++) {
        ns2[ni + i] = 0.0;
      }

      for (let k in fields) {
        let i = fields[k];

        ns2[ni + i] = n[k];
      }

      //console.log(n);
    }


    //initialize uvs for root node
    ns2[QMINU] = ns2[QMINV] = 0.0;
    ns2[QMAXU] = ns2[QMAXV] = 1.0;
    ns2[QCENTU] = ns2[QCENTV] = 0.5;

    for (let ni = 0; ni < ns2.length; ni += QTOT) {
      ns2[ni + QFLAG] |= TEMP;
    }

    let rec = (ni, depth = 0) => {
      ns2[ni + QFLAG] &= ~TEMP;

      ns2[ni + QCENTU] = ns2[ni + QMINU] * 0.5 + ns2[ni + QMAXU] * 0.5;
      ns2[ni + QCENTV] = ns2[ni + QMINV] * 0.5 + ns2[ni + QMAXV] * 0.5;

      //console.log(`ni: ${ni / QTOT} flag: ${ns2[ni + QFLAG]}`);
      //console.log(`  ${ns2[ni+QMINU]} ${ns2[ni+QMINV]} ${ns2[ni+QMAXU]} ${ns2[ni+QMAXV]}`);

      if (ns2[ni + QFLAG] & DEAD) {
        return;
      }

      ns2[ni + QDEPTH] = depth;

      if (!(ns2[ni + QFLAG] & LEAF)) {
        for (let i = 0; i < 4; i++) {
          let ni2 = ns2[ni + QCHILD1 + i];

          if (!ni2) {
            continue;
          }

          let du = (ns2[ni + QMAXU] - ns2[ni + QMINU]) * 0.5;
          let dv = (ns2[ni + QMAXV] - ns2[ni + QMINV]) * 0.5;

          let x = i & 1;
          let y = i >> 1;

          //console.log(`  a: ${ns2[ni2+QMINU]} ${ns2[ni2+QMINV]} ${ns2[ni2+QMAXU]} ${ns2[ni2+QMAXV]}`);

          ns2[ni2 + QMINU] = ns2[ni + QMINU] + du * x;
          ns2[ni2 + QMINV] = ns2[ni + QMINV] + dv * y;
          ns2[ni2 + QMAXU] = ns2[ni2 + QMINU] + du;
          ns2[ni2 + QMAXV] = ns2[ni2 + QMINV] + dv;

          //console.log(`  b: ${ns2[ni2+QMINU]} ${ns2[ni2+QMINV]} ${ns2[ni2+QMAXU]} ${ns2[ni2+QMAXV]}`);

          //ni2 = ns2[ni+QCHILD1+i] = ni2 + ni;

          ns2[ni2 + QPARENT] = ni;
          ns2[ni2 + QQUADIDX] = i;

          rec(ni2, depth + 1);
        }
      } else if (1) {
        leaves.push(ni);
      }
    }

    rec(0);

    for (let ni of leaves) {
      let p = ns2[ni + QPARENT];
      let depth = ns2[ni + QDEPTH];

      ns2[ni + QSUBTREE_DEPTH] = depth;

      while (p) {
        ns2[p + QSUBTREE_DEPTH] = Math.max(ns2[p + QSUBTREE_DEPTH], depth);
        p = ns2[p + QPARENT];
      }

      ns2[QSUBTREE_DEPTH] = Math.max(ns2[QSUBTREE_DEPTH], depth);
    }
    for (let ni = 0; ni < ns2.length; ni += QTOT) {
      if (!(ns2[ni + QFLAG] & DEAD) && (ns2[ni + QFLAG] & TEMP)) {
        console.error("Unmarked dead quad tree node detected", ni, this);
      }

      ns2[ni + QCENTU] = ns2[ni + QMINU] * 0.5 + ns2[ni + QMAXU] * 0.5;
      ns2[ni + QCENTV] = ns2[ni + QMINV] * 0.5 + ns2[ni + QMAXV] * 0.5;
    }
  }

  _testNodeCompression() {
    let ns = this._saveNodes();
    this._loadCompressedNodes(ns);

    this.polys.length = 0;
    this.topo = undefined;

    this.recalcFlag |= QRecalcFlags.TOPO | QRecalcFlags.POINTHASH
      | QRecalcFlags.POLYS | QRecalcFlags.NORMALS
      | QRecalcFlags.NEIGHBORS | QRecalcFlags.MIRROR;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.recalcFlag |= QRecalcFlags.MIRROR;

    for (let p of this.points) {
      p.loopEid = this.loopEid;
    }

    if (typeof this.nodes[0] !== "number") {
      this._loadCompressedNodes();
    } else if (this.nodeFieldSize !== QTOT) {
      console.warn("Old quadtree structure detected; converting. . .");

      let ns1 = this.nodes;
      let qtot_old = this.nodeFieldSize;
      let cpylen = Math.min(qtot_old, QTOT);
      let extra = Math.max(QTOT - cpylen, 0);
      let ns2 = [];
      let map = [], mapi = 0;

      for (let ni = 0; ni < ns1.length; ni += qtot_old) {
        for (let j = 0; j < cpylen; j++) {
          ns2.push(ns1[ni + j]);
        }

        for (let j = 0; j < extra; j++) {
          ns2.push(0);
        }

        map.push(mapi);
        mapi += QTOT;
      }

      for (let ni = 0; ni < ns2.length; ni += QTOT) {
        if (ns2[ni + QFLAG] & DEAD) {
          continue;
        }

        let idx = ni / QTOT;

        ns2[ni + QCHILD1] = map[ns2[ni + QCHILD1]];
        ns2[ni + QCHILD2] = map[ns2[ni + QCHILD2]];
        ns2[ni + QCHILD3] = map[ns2[ni + QCHILD3]];
        ns2[ni + QCHILD4] = map[ns2[ni + QCHILD4]];
        ns2[ni + QPARENT] = map[ns2[ni + QPARENT]];
      }

      this.nodes = ns2;
      this.freelist = [];
      this.nodeFieldSize = QTOT;
    }

    this._rebuildHash();
  }
}

QuadTreeGrid.STRUCT = nstructjs.inherit(QuadTreeGrid, GridBase, "mesh.QuadTreeGrid") + `
  nodes               : array(mesh_grid.CompressedQuadNode) | this._saveNodes();
  depthLimitEnabled   : bool;
  depthLimit          : int;
  normalQuad          : array(vec3);
  loopEid             : int;
}`;
nstructjs.register(QuadTreeGrid);
CustomDataElem.register(QuadTreeGrid);
