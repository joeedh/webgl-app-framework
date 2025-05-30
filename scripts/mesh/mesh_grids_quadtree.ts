import {
  Matrix4, nstructjs, Vector2, Vector3, Vector4,
  util, math, Number2
} from "../path.ux/scripts/pathux.js";

import {CDElemArray, MeshFlags, MeshTypes} from "./mesh_base.js";
import {AttrRef, CustomDataElem} from "./customdata";
import {ChunkedSimpleMesh} from "../core/simplemesh.js";
import {
  BLink,
  GridBase,
  GridSettingFlags,
  GridSettings,
  gridSides,
  GridVert,
  GridVertBase,
  QRecalcFlags
} from "./mesh_grids.js";
import '../util/numeric.js';
import {Loop} from "./mesh_types";
import {ColorLayerElem, Mesh, UVLayerElem} from "./mesh";

export const OldQuadTreeFields = {
  QFLAG  : 0,
  QCHILD1: 1,
  QCHILD2: 2,
  QCHILD3: 3,
  QCHILD4: 4,
  QMINU  : 5,
  QMINV  : 6,
  QMAXU  : 7,
  QMAXV  : 8,
  QCENTU : 9,
  QCENTV : 10,
  QDEPTH : 11,
  QLEFT  : 12,
  QRIGHT : 13,
  QUP    : 14,
  QDOWN  : 15,
  QPOINT1: 16,
  QPOINT2: 17,
  QPOINT3: 18,
  QPOINT4: 19,
  //QPOINT5: 20,
  QID           : 21,
  QPARENT       : 22,
  QSUBTREE_DEPTH: 23,
  QQUADIDX      : 24,
  QPOLYSTART    : 25,
  QPOLYEND      : 26,
  QTOT          : 32 //reserve some space for future expansion
};

export const QuadTreeFields = {
  QFLAG         : 0,
  QCHILD1       : 1,
  QCHILD2       : 2,
  QCHILD3       : 3,
  QCHILD4       : 4,
  QMINU         : 5,
  QMINV         : 6,
  QMAXU         : 7,
  QMAXV         : 8,
  QCENTU        : 9,
  QCENTV        : 10,
  QDEPTH        : 11,
  QLEFT         : 12,
  QRIGHT        : 13,
  QUP           : 14,
  QDOWN         : 15,
  QPOINT1       : 16,
  QPOINT2       : 17,
  QPOINT3       : 18,
  QPOINT4       : 19,
  QPOINT5       : 20,
  QID           : 21,
  QPARENT       : 22,
  QSUBTREE_DEPTH: 23,
  QQUADIDX      : 24,
  QPOLYSTART    : 25,
  QPOLYEND      : 26,
  QNX           : 27,
  QNY           : 28,
  QNZ           : 29,
  QTX           : 30,
  QTY           : 31,
  QTZ           : 32,
  QBX           : 33,
  QBY           : 34,
  QBZ           : 35,
  QCENTX        : 36,
  QCENTY        : 37,
  QCENTZ        : 38,
  QTOT          : 39 //reserve some space for future expansion
};


const QFLAG          = QuadTreeFields.QFLAG,
      QCHILD1        = QuadTreeFields.QCHILD1,
      QCHILD2        = QuadTreeFields.QCHILD2,
      QCHILD3        = QuadTreeFields.QCHILD3,
      QCHILD4        = QuadTreeFields.QCHILD4,
      QMINU          = QuadTreeFields.QMINU,
      QMAXU          = QuadTreeFields.QMAXU,
      QMINV          = QuadTreeFields.QMINV,
      QCENTU         = QuadTreeFields.QCENTU,
      QCENTV         = QuadTreeFields.QCENTV,
      QMAXV          = QuadTreeFields.QMAXV,
      QDEPTH         = QuadTreeFields.QDEPTH,
      QLEFT          = QuadTreeFields.QLEFT,
      QRIGHT         = QuadTreeFields.QRIGHT,
      QUP            = QuadTreeFields.QUP,
      QDOWN          = QuadTreeFields.QDOWN,
      QPOINT1        = QuadTreeFields.QPOINT1,
      QPOINT2        = QuadTreeFields.QPOINT2,
      QPOINT3        = QuadTreeFields.QPOINT3,
      QPOINT4        = QuadTreeFields.QPOINT4,
      //QPOINT5 = QuadTreeFields.QPOINT5,
      QID            = QuadTreeFields.QID,
      QPARENT        = QuadTreeFields.QPARENT,
      QSUBTREE_DEPTH = QuadTreeFields.QSUBTREE_DEPTH,
      QQUADIDX       = QuadTreeFields.QQUADIDX,
      QPOLYSTART     = QuadTreeFields.QPOLYSTART,
      QPOLYEND       = QuadTreeFields.QPOLYEND,
      QNX            = QuadTreeFields.QNX,
      QNY            = QuadTreeFields.QNY,
      QNZ            = QuadTreeFields.QNZ,
      QTX            = QuadTreeFields.QTX,
      QTY            = QuadTreeFields.QTY,
      QTZ            = QuadTreeFields.QTZ,
      QBX            = QuadTreeFields.QBX,
      QBY            = QuadTreeFields.QBY,
      QBZ            = QuadTreeFields.QBZ,
      QCENTX         = QuadTreeFields.QCENTX,
      QCENTY         = QuadTreeFields.QCENTY,
      QCENTZ         = QuadTreeFields.QCENTZ,
      QTOT           = QuadTreeFields.QTOT;


let _quad_node_idgen = 0;

let eval_rets = util.cachering.fromConstructor(Vector3, 1024);

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
    QFLAG  : "byte",
    QDEPTH : "byte",
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

let _btm_temp1 = new Vector3();
let _btm_temp2 = new Vector3();
let _btm_temp3 = new Vector3();
let _btm_temp4 = new Vector3();
let _btm_temp5 = new Vector3();
let _btm_temp6 = new Vector3();
let _btm_temp7 = new Vector3();
let _btm_temp8 = new Vector3();
let _btm_temp9 = new Vector3();
let _btm_temp10 = new Vector3();
let _btm_temp11 = new Vector3();
let _btm_temp12 = new Vector3();
let _btm_temp13 = new Vector3();
let imattemp = new Matrix4();
let imattemp2 = new Matrix4();

const staroffs = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1]
]

const staroffs_origin = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1],
  [0, 0],
]

let boxoffs = [];

for (let ix = -1; ix <= 1; ix++) {
  for (let iy = -1; iy <= 1; iy++) {
    boxoffs.push([ix, iy]);
  }
}

export class CompressedQuadNode {
  static fields = makeCompressedNodeStruct().fields;
  static STRUCT = makeCompressedNodeStruct().nstruct;

  constructor() {
    for (let k in CompressedQuadNode.fields) {
      this[k] = 0;
    }
  }

  static fromNodes(ns: number[]): number[] {
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

let tanmats = util.cachering.fromConstructor(Matrix4, 64);
let tanvecs4 = util.cachering.fromConstructor(Vector4, 64);
let tanvecs3 = util.cachering.fromConstructor(Vector3, 64);

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
  LEAF  : 2,
  DEAD  : 4,
  TEMP  : 8
};

const {SELECT, LEAF, DEAD, TEMP} = QuadTreeFlags;

let _getuv_rets = util.cachering.fromConstructor(Vector2, 32);

export class QTGridVert extends GridVertBase<Set<QTGridVert>> {
  orig: Vector3 | undefined = undefined;

  createNeighborList() {
    return new Set();
  }
}

export class QuadTreeGrid extends GridBase<QTGridVert> {
  leafPoints: Set<number>;
  leafNodes: number[];
  depthLimit: number;
  depthLimitEnabled: boolean;
  normalQuad: Vector3[];
  loopEid: number;
  dimen: number;
  nodes: number[];
  freelist: number[];
  pmap: { [k: number]: number };
  polys: number[];
  nodeFieldSize: number;
  subdtemps: util.cachering<Vector3>;
  topo: any;
  idmul: number = 1.0;

  createPoint(): QTGridVert {
    return new QTGridVert();
  }

  constructor() {
    super();

    this.leafPoints = new Set();
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

  calcMemSize() {
    let tot = super.calcMemSize() + this.nodes.length*8;
    tot += this.freelist.length*8 + this.subdtemps.length*8*32;
    tot += this.polys.length*8;

    return tot;
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

  copyTo(b: QuadTreeGrid, copy_eids = false): void {
    b.topo = undefined;
    b.dimen = this.dimen;
    b.nodes = this.nodes.concat([]);
    b.points.length = 0;
    b.freelist = this.freelist.concat([]);

    if (!copy_eids) {
      this.recalcFlag |= QRecalcFlags.REGEN_IDS;
    }

    for (let p of this.points) {
      let p2 = new QTGridVert(p.index);

      if (copy_eids) {
        p2.eid = p.eid;
        p2.loopEid = p.loopEid;
      }

      p2.load(p);

      p2.sco.load(p.sco);
      p2.tan.load(p.tan);
      p2.bin.load(p.bin);

      p2.flag = p.flag;
      p2.no.load(p.no);

      b.points.push(p2);
    }

    b.customDataLayout = this.customDataLayout.concat([]);
    b.customDatas = [];

    for (let i = 0; i < this.customDatas.length; i++) {
      let cd1 = this.customDatas[i];
      let cd2 = new CDElemArray;
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

  getNormalQuad(loop: Loop): Vector3[] {
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

  getQuad(loop: Loop): Vector3[] {
    let ret = recttemps.next();

    //XXX todo: handle symmetry flags for this branch
    if (0 && this.subsurf) {
      let p = this.subsurf;
      ret[0].load(p.evaluate(0, 0));
      ret[1].load(p.evaluate(0, 1));
      ret[2].load(p.evaluate(1, 1));
      ret[3].load(p.evaluate(1, 0));
    } else {
      ret[0].zero();
      let tot = 0.0;

      for (let l of loop.f.lists[0]) {
        ret[0].add(l.v.co);
        tot++;
      }

      if (tot) {
        ret[0].mulScalar(1.0/tot);
      }

      ret[1].load(loop.v.co).interp(loop.prev.v.co, 0.5);
      ret[2].load(loop.v.co);
      ret[3].load(loop.v.co).interp(loop.next.v.co, 0.5);
    }

    let i = 0;
    for (let l of loop.list) {
      if (l === loop) {
        break;
      }
      i++;
    }

    if (i%2 === 0) {
      //return [ret[3], ret[0], ret[1], ret[2]];
    }

    //return [ret[0], ret[1], ret[2], ret[3]];
    return ret;
  }

  smoothPoint(v: QTGridVert, fac = 1.0): void {
    let _tmp = stmp1;

    _tmp.zero();
    let w = 0.0;

    for (let vr of v.bRing) {//v.neighbors) {
      vr.co.interp(v.co, 0.5);
      v.co.load(vr.co);
    }

    for (let vr of v.bRing) {
      for (let v2 of vr.neighbors) {
        if (v2 === vr || v2.loopEid !== vr.loopEid) {
          continue;
        }

        let w2 = 1.0;
        _tmp.addFac(v2.co, w2);
        w += w2;
      }
    }

    for (let v2 of v.neighbors) {
      if (v2.loopEid !== v.loopEid) {
        continue;
      }

      _tmp.add(v2.co);
      w++;
    }

    if (w !== 0.0) {
      _tmp.mulScalar(1.0/w);
      v.co.interp(_tmp, fac);
    }

    /*
    for (let v2 of v.bRing) {
      v2[0] = v[0];
      v2[1] = v[1];
      v2[2] = v[2];
    }//*/
  }

  stitchBoundaries(): void {
    for (let p of this.points) {
      let w = 1.0;

      for (let pr of p.bRing) {
        p.co.add(pr.co);
        w++;
      }

      p.co.mulScalar(1.0/w);

      for (let pr of p.bRing) {
        pr.co.load(p.co);
      }
    }
  }

  _hashPoint(u: number, v: number): number {
    let dimen = 1024*1024;
    u = ~~(u*dimen + 0.000001);
    v = ~~(v*dimen + 0.000001);

    return v*dimen + u;
  }


  _getPoint(u: number, v: number, loopEid: number, mesh: Mesh, isNewOut?: boolean[]): QTGridVert {
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
    let p = new QTGridVert(this.points.length, loopEid);

    p.neighbors = new Set();
    p.eid = mesh.eidgen.next();

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

  _getUV(ni: number, pidx: number): Vector2 {
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

  _rebuildHash(): void {
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

  _freeNode(ni: number): void {
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

  _newNode(): number {
    let ns = this.nodes;
    let ni: number;

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

  _ensureNodePoint(ni: number, pidx: number, loopEid: number | undefined, mesh: Mesh,
                   isNewOut?: boolean[]): QTGridVert {
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

    let p = this._getPoint(u, v, loopEid, mesh, isNewOut);

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

  init(dimen: number, mesh: Mesh, loop: Loop): void {
    //console.log("grid init!");

    this.depthLimitEnabled = false;
    this.depthLimit = 0;

    this.dimen = gridSides[1];
    this.polys.length = 0;
    this.points.length = 0;
    this.freelist.length = 0;
    this.nodes.length = 0;
    this.topo = undefined;

    this.recalcFlag = QRecalcFlags.ALL | QRecalcFlags.MIRROR;

    this.pmap = {};
    this.leafNodes.length = 0;
    this.leafPoints = new Set();

    if (loop !== undefined) {
      let nodes = this.nodes;

      let ni = this._newNode();

      if (ni !== 0) {
        throw new Error("root must be zero");
      }

      nodes[ni + QMINU] = nodes[ni + QMINV] = 0.0;
      nodes[ni + QMAXU] = nodes[ni + QMAXV] = 1.0;
      nodes[ni + QCENTU] = nodes[ni + QCENTV] = 0.5;
      nodes[ni + QFLAG] = LEAF;

      let p1 = this._ensureNodePoint(ni, 0, loop.eid, mesh);
      let p2 = this._ensureNodePoint(ni, 1, loop.eid, mesh);
      let p3 = this._ensureNodePoint(ni, 2, loop.eid, mesh);
      let p4 = this._ensureNodePoint(ni, 3, loop.eid, mesh);

      let quad = this.getQuad(loop);

      p1.load(quad[0]);
      p2.load(quad[1]);
      p3.load(quad[2]);
      p4.load(quad[3]);

      //console.log(this.subsurf);

      let rand = new util.MersenneRandom(loop.eid);

      let rec = (ni, depth) => {
        if (depth === 0) {
          return;
        }

        this.subdivide(ni, loop.eid, mesh);

        for (let i = 0; i < 4; i++) {
          if (rand.random() > 0.75) {
            //continue;
          }
          rec(nodes[ni + QCHILD1 + i], depth - 1);
        }
      }

      //rec(ni, 2);

      this.rebuildNodePolys();
      this.flagNeighborRecalc();

      this.initCDLayoutFromLoop(loop);
    }

    this.relinkCustomData();

    this.recalcFlag |= QRecalcFlags.ALL;
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

  flagTopoRecalc() {
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
        uv   : [-1, -1],
        p    : ps[i]
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

      return min | (max<<21);
      //return Math.min(a, b) + ":" + Math.max(a, b);
    }

    function getedge(a, b) {
      let key = ekey(a, b);

      if (!emap.has(key)) {
        let e = {
          v1   : a,
          v2   : b,
          p1   : ps[a],
          p2   : ps[b],
          id   : idgen++,
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
      let dimen2 = dimen*16;

      u = ~~(u*dimen2 + 0.0001);
      v = ~~(v*dimen2 + 0.0001);
      return v*dimen2 + u;
    }

    function setuv(v1: UVLayerElem, u: number, v: number): void {
      let was_set = v1.uv[0] >= 0;

      let eps = 0.0000001;

      if (was_set && (Math.abs(u - v1.uv[0]) > eps || Math.abs(v - v1.uv[1]) > eps)) {
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

      let isleaf = !!(ns[ni + QFLAG] & LEAF);
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
    this.leafPoints = new Set();
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
      if (!(sym & (1<<i))) {
        continue;
      }

      if (Math.abs(p[i]) < threshold) {
        p.flag |= MeshFlags.MIRROREDX<<i;

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

  evaluate(u, v, startNi = 0, depthLimit = undefined) {
    let ni = this.findNode(u, v, startNi, depthLimit);

    let ns = this.nodes, ps = this.points;
    let p1 = ps[ns[ni + QPOINT1]];
    let p2 = ps[ns[ni + QPOINT2]];
    let p3 = ps[ns[ni + QPOINT3]];
    let p4 = ps[ns[ni + QPOINT4]];

    let u2 = (u - ns[ni + QMINU])/(ns[ni + QMAXU] - ns[ni + QMINU]);
    let v2 = (v - ns[ni + QMINV])/(ns[ni + QMAXV] - ns[ni + QMINV]);

    let a = eval_rets.next();
    let b = eval_rets.next();

    a.load(p1.co).interp(p2.co, v2);
    b.load(p4.co).interp(p3.co, v2);
    a.interp(b, u2);

    return a;
  }

  findNode(u: number, v: number, startNi = 0, depthLimit?: number): number {
    let ni = startNi;
    let ns = this.nodes;

    if (depthLimit === undefined) {
      depthLimit = this.depthLimitEnabled ? this.depthLimit : 1000;
    }

    while (ni && ns[ni + QDEPTH] > depthLimit) {
      ni = ns[ni + QPARENT];
    }

    while (ni) {
      let ok = u >= ns[ni + QMINU] && u < ns[ni + QMAXU];
      ok = ok && v >= ns[ni + QMINV] && v < ns[ni + QMAXV];

      if (ok) {
        break;
      }
      ni = ns[ni + QPARENT];
    }

    let maxdepth = ns[QSUBTREE_DEPTH] + 1;

    for (let i = 0; i < maxdepth; i++) {
      let isleaf = !!(ns[ni + QFLAG] & LEAF);
      isleaf = isleaf || ns[ni + QDEPTH] === depthLimit;

      if (isleaf) {
        break;
      }

      let found = false;

      for (let j = 0; j < 4; j++) {
        let ni2 = ns[ni + QCHILD1 + j];

        let ok = u >= ns[ni2 + QMINU] && u < ns[ni2 + QMAXU];
        ok = ok && v >= ns[ni2 + QMINV] && v < ns[ni2 + QMAXV];

        if (ok) {
          ni = ni2;
          found = true;
          break;
        }
      }

      if (!found) {
        break;
      }
    }

    return ni;
  }

  buildTangentMatrix(ni: number, u1: number, v1: number, matOut: Matrix4): void {
    return this.buildTangentMatrix1(ni, u1, v1, matOut);
    /*
    let mat = tanmats.next().makeIdentity();
    let ns = this.nodes, ps = this.points;

    let t1 = tanvecs3.next().zero();
    let t2 = tanvecs3.next().zero();
    let t3 = tanvecs3.next().zero();
    let t4 = tanvecs3.next();
    let t5 = tanvecs3.next();
    let t6 = tanvecs3.next();

    let depth = ns[ni + QDEPTH];
    let dimen = gridSides[depth] - 1;

    let dt = 0.5 / dimen;

    let mat2 = tanmats.next().makeIdentity();
    let tot = 0.0;
    let sx = 0, sy = 0, sz = 0;

    let tx = 0, ty = 0, tz = 0;

    //const offs = staroffs;
    const offs = boxoffs;

    for (let off of offs) {
      let x = off[0], y = off[1];

      let u2 = u1 + x * dt;
      let v2 = v1 + y * dt;

      let eps = 0.00001;
      if (u2 < -eps || v2 < -eps || u2 > 1.0 + eps || v2 > 1.0 + eps) {
        //continue;
      }

      let w = 1.0;

      if (x === 0 & y === 0) {
        w = offs.length;
      } else {
        w = 1.0 - Math.sqrt(x * x + y * y) / Math.sqrt(2.0);
        w = -w * 3.0;
      }

      u2 = Math.min(Math.max(u2, eps), 1.0 - eps);
      v2 = Math.min(Math.max(v2, eps), 1.0 - eps);

      let ni2 = this.findNode(u2, v2, ni, depth);

      this.buildTangentMatrix1(ni2, u2, v2, mat2);

      mat2.copyColumnTo(0, t4);
      mat2.copyColumnTo(1, t5);
      mat2.copyColumnTo(2, t6);

      let m = mat2.$matrix;

      tx += m.m41 * w;
      ty += m.m42 * w;
      tz += m.m43 * w;

      sx += t4.vectorLength() * w;
      sy += t5.vectorLength() * w;
      sz += t6.vectorLength() * w;

      t4.normalize();
      t5.normalize();
      t6.normalize();

      t1.addFac(t4, w);
      t2.addFac(t5, w);
      t3.addFac(t6, w);

      tot += w;
    }

    tot = 1.0 / tot;
    t1.normalize().mulScalar(tot * sx);
    t2.normalize().mulScalar(tot * sy);
    t3.normalize().mulScalar(tot * sz);

    tx *= tot;
    ty *= tot;
    tz *= tot;

    let m = mat.$matrix;

    mat.loadColumn(0, t1);
    mat.loadColumn(1, t2);
    mat.loadColumn(2, t3);

    m.m41 = tx;
    m.m42 = ty;
    m.m43 = tz;
    m.m44 = 1.0;

    matOut.load(mat);
    */
  }

  buildTangentMatrix1(ni: number, u1: number, v1: number, matOut: Matrix4): void {
    let m = matOut.$matrix;

    matOut.makeIdentity();

    let ns = this.nodes;
    let ps = this.points;

    let u = (u1 - ns[ni + QMINU])/(ns[ni + QMAXU] - ns[ni + QMINU]);
    let v = (v1 - ns[ni + QMINV])/(ns[ni + QMAXV] - ns[ni + QMINV]);

    let p1 = ps[ns[ni + QPOINT1]];
    let p2 = ps[ns[ni + QPOINT2]];
    let p3 = ps[ns[ni + QPOINT3]];
    let p4 = ps[ns[ni + QPOINT4]];

    let quadco = _btm_temp9;
    let a = _btm_temp1;
    let b = _btm_temp2;

    let vx = _btm_temp3;
    let vy = _btm_temp4;

    let calcsco = (p) => {
      p.sco.zero();

      let tot = 0.0;
      let dimen = gridSides[ns[ni + QDEPTH]] - 1;
      let dt = 1.0/dimen;

      for (let off of staroffs) {
        let u = off[0]*dt + p.uv[0];
        let v = off[1]*dt + p.uv[1];

        u = Math.min(Math.max(u, 0.0), 1.0);
        v = Math.min(Math.max(v, 0.0), 1.0);

        let co = this.evaluate(u, v, undefined, ns[ni + QDEPTH]);
        p.sco.add(co);
        tot++;
      }

      if (tot) {
        a.load(p.sco).mulScalar(1.0/tot);
        p.sco.load(p).interp(a, -1.0/3.0);
      } else {
        p.sco.load(p);
      }

      return p.sco;
    }

    //*
    calcsco(p1);
    calcsco(p2);
    calcsco(p3);
    calcsco(p4);
    //*/

    if (0 && this.subsurf) {
      let m1 = this.subsurf.buildTangentMatrix(ns[ni + QMINU], ns[ni + QMINV]);
      let m2 = this.subsurf.buildTangentMatrix(ns[ni + QMINU], ns[ni + QMAXV]);
      let m3 = this.subsurf.buildTangentMatrix(ns[ni + QMAXU], ns[ni + QMAXV]);
      let m4 = this.subsurf.buildTangentMatrix(ns[ni + QMAXU], ns[ni + QMINV]);

      //this.subsurf.buildTangentMatrix(u1, v1, matOut);
      //return matOut;
      /*

       */
      m1.invert();
      m2.invert();
      m3.invert();
      m4.invert();

      quadco.load(this.subsurf.evaluate(u1, v1));

      a.load(p1.co).interp(p2.co, v);
      b.load(p4.co).interp(p3.co, v);
      quadco.load(a).interp(b, u);
    } else {
      let sco;

      /*
      -1,1======0,1=====1,1
        |        |       |
        |        |       |
        |        |       |
      -1,0======0,0==== 1,0
        |        |       |
        |        |       |
        |        |       |
      -1,-1=====0,-1====1,-1


      on factor;

      operator p;
      operator known;
      operator final;

      let p(-1, -1) = known(-1, -1);
      let p(-1, 1) = known(-1, 1);
      let p(1, 1) = known(1, 1);
      let p(1, -1) = known(1, -1);

      let p(-2, 0) = known(-2, 0);
      let p(2, 0) = known(2, 0);
      let p(0, 2) = known(0, 2);
      let p(0, -2) = known(0, -2);


      w1 := wa;
      w2 := wa;
      w3 := wa;
      w4 := wa;
      w5 := wa;
      w6 := wa;
      w7 := wa;
      w8 := wa;
      w9 := wb;

      wa := 8.0/2.0;
      wb := 1.0;

      procedure calc(x, y, n);
        if n = 0 then p(x, y) else
          (
          calc(x-1, y-1, n-1)*w1 +
          calc(x-1, y  , n-1)*w2 +
          calc(x-1, y+1, n-1)*w3 +
          calc(x  , y+1, n-1)*w4 +
          calc(x+1, y+1, n-1)*w5 +
          calc(x+1, y  , n-1)*w6 +
          calc(x+1, y-1, n-1)*w7 +
          calc(x  , y-1, n-1)*w8 +
          calc(x  , y  , n-1)*w9
          ) / (w1+w2+w3+w4+w5+w6+w7+w8+w9);


      f1 := calc(x, y, 2);


      procedure row(x, y);
        {
          p(x, y)*wb, p(x, y+1)*wa, p(x+1, y)*wa, p(x, y-1)*wa, p(x-1, y)*wa
        };

      procedure r(a, b);
        part(a, b);

      r1 := row(x,   y);
      r2 := row(x,   y+1);
      r3 := row(x+1, y);
      r4 := row(x,   y-1);
      r5 := row(x-1, y);

      smat := mat(
        (part(r1, 1), part(r1, 2), part(r1, 3), part(r1, 4), part(r1, 5)),
        (part(r2, 1), part(r2, 2), part(r2, 3), part(r2, 4), part(r2, 5)),
        (part(r3, 1), part(r3, 2), part(r3, 3), part(r3, 4), part(r3, 5)),
        (part(r4, 1), part(r4, 2), part(r4, 3), part(r4, 4), part(r4, 5)),
        (part(r5, 1), part(r5, 2), part(r5, 3), part(r5, 4), part(r5, 5))
      );

      bmat := mat(
        (p(x,  x)),
        (p(x,  y+1)),
        (p(x+1,  y)),
        (p(x, y-1)),
        (p(y-1, y))
      );

      ff := smat*bmat;

      f1 := ff(1, 1);
      f2 := ff(2, 1);
      f3 := ff(3, 1);
      f4 := ff(4, 1);
      f5 := ff(5, 1);

      f1 := r(r1, 1) + r(r1, 2) + r(r1, 3) + r(r1, 4) + r(r1, 5) - known(x, y);
      f2 := r(r2, 1) + r(r2, 2) + r(r2, 3) + r(r2, 4) + r(r2, 5) - known(x, y+1);
      f3 := r(r3, 1) + r(r3, 2) + r(r3, 3) + r(r3, 4) + r(r3, 5) - known(x+1, y);
      f4 := r(r4, 1) + r(r4, 2) + r(r4, 3) + r(r4, 4) + r(r4, 5) - known(x, y-1);
      f5 := r(r5, 1) + r(r5, 2) + r(r5, 3) + r(r5, 4) + r(r5, 5) - known(x-1, y);

      ff2 := solve({f1, f2, f3, f4, f5}, {p(x, y), p(x-1, y), p(x+1, y), p(x, y+1), p(x, y-1)});

      ff3 := part(ff2, 1, 1, 2);

      ff4 := p(x, y)*d1 + p(x-1, y)*d2 + p(x+1, y)*d3 + p(x, y-1)*d4 + p(x, y+1)*d5;

      f1 := ff4-ff3;

      comment: sub(x=0, y=0, ff3) should have no p(x, y) operators;

      ff4 := sub(p=known, ff3);

      k1 := sub(x=0, y=0, ff4);
      k2 := sub(x=0, y=1, ff4);
      k3 := sub(x=1, y=1, ff4);
      k4 := sub(x=1, y=0, ff4);

      d1 := (u*v - u - v + 1.0)*n1;
      d2 := (-u*v + v)*n2;
      d3 := (u*v)*n3;
      d4 := (u - u*v)*n4;

      fp := k1*d1 + k2*d2 + k3*d3 + k4*d4;

      f1 := fp - goal;
      f2 := d1+d2+d3+d4 - 1.0;
      f3 := df(fp, u);
      f4 := df(fp, v);

      */


      if (0 && this.subsurf) {
        let r1 = ps[ns[QPOINT1]];
        let r2 = ps[ns[QPOINT2]];
        let r3 = ps[ns[QPOINT3]];
        let r4 = ps[ns[QPOINT4]];

        a.load(r1.co).interp(r2.co, v1);
        b.load(r4.co).interp(r3.co, v1);
        a.interp(b, u1);

        sco = this.subsurf.evaluate(v1, u1);
        sco.sub(a).mulScalar(-0.125);
        if (isNaN(sco.dot(sco))) {
          throw new Error("NaN!");
        }
      }

      /*
      sco = new Vector3();
      a.load(p1.sco).interp(p2.sco, v);
      b.load(p4.sco).interp(p3.sco, v);
      sco.load(a).interp(b, u);

      a.load(p1).interp(p2, v);
      b.load(p4).interp(p3, v);
      quadco.load(a).interp(b, u);

      let f1 = 1.0 - Math.abs(u1-0.5);
      let f2 = 1.0 - Math.abs(v1-0.5);
      let f = Math.sqrt(f1*f1 + f2*f2) / Math.sqrt(2.0);

      quadco.interp(sco, f);

      if (isNaN(quadco.dot(quadco)) || quadco.dot(quadco) === 0) {
        throw new Error("NaN!");
      }*/

      a.load(p1.co).interp(p2.co, v);
      b.load(p4.co).interp(p3.co, v);
      quadco.load(a).interp(b, u);
    }

    if (1) {
      let b1 = _btm_temp10.load(p1.co);
      let b2 = _btm_temp11.load(p2.co);
      let b3 = _btm_temp12.load(p3.co);
      let b4 = _btm_temp13.load(p4.co);

      let f = 1.5;
      b1.interp(p1.sco, f);
      b2.interp(p2.sco, f);
      b3.interp(p3.sco, f);
      b4.interp(p4.sco, f);

      a.load(b1).interp(b2, v);
      b.load(b4).interp(b3, v);
      quadco.load(a).interp(b, u);

      vx.load(b4).sub(b1);
      vy.load(b2).sub(b1);
    } else {
      a.load(p1.sco).interp(p2.sco, v);
      b.load(p4.sco).interp(p3.sco, v);
      quadco.load(a).interp(b, u);

      vx.load(p4.sco).sub(p1.sco);
      vy.load(p2.sco).sub(p1.sco);
    }

    let lx = vx.vectorLength();
    let ly = vy.vectorLength();

    if (lx === 0.0 || ly === 0.0) {
      return;
    }

    let n = _btm_temp5;
    let n2 = _btm_temp7;

    let scale = (lx + ly)*0.5;
    scale = Math.max(scale, 0.0001);
    //lx = ly = scale;

    vx.normalize();
    vy.normalize();

    if (0) {
      a.load(p1.tan).interp(p2.tan, v);
      b.load(p4.tan).interp(p3.tan, v);
      a.interp(b, u);
      if (a.dot(a) > 0.0005) {
        vx.load(a).normalize();
      }

      a.load(p1.bin).interp(p2.bin, v);
      b.load(p4.bin).interp(p3.bin, v);
      a.interp(b, u);
      if (a.dot(a) > 0.0005) {
        vy.load(a).normalize();
      }

//*
      a.load(p1.no).interp(p2.no, v);
      b.load(p4.no).interp(p3.no, v);
      n.load(a).interp(b, u);
      n.normalize();
      //*/
    } else {
      n.load(vx).cross(vy).normalize();
    }

    if (0) {
      a.load(p1.no).interp(p2.no, v);
      b.load(p4.no).interp(p3.no, v);
      n.load(a).interp(b, u);
      n.normalize();
    }

    //bad normal?
    if (n.dot(n) < 0.00001) {
      //n.load(p1.no).add(p2.no).add(p3.no).add(p4.no).normalize().mulScalar(scale);
      n.load(vx).cross(vy).normalize();
    }

    //if (n.dot(n2) < 0) {
    //  n.negate();
    //}

    n.mulScalar(scale);

    let tmat = tmptanmat;
    tmat.makeIdentity();
    tmat.translate(quadco[0], quadco[1], quadco[2]);

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

    let lx = m.m11*m.m11 + m.m21*m.m21 + m.m31*m.m31;
    let ly = m.m12*m.m12 + m.m22*m.m22 + m.m32*m.m32;
    let lz = m.m13*m.m13 + m.m23*m.m23 + m.m33*m.m33;

    //console.log("LENS", lx.toFixed(4), ly.toFixed(4), lz.toFixed(4));
    //console.log("MT", "" + mat);

    if (lx > 0.0) {
      lx = 1.0/lx;
      m.m11 *= lx;
      m.m21 *= lx;
      m.m31 *= lx;
    }
    if (ly > 0.0) {
      ly = 1.0/ly;
      m.m12 *= ly;
      m.m22 *= ly;
      m.m32 *= ly;
    }
    if (lz > 0.0) {
      lz = 1.0/lz;
      m.m13 *= lz;
      m.m23 *= lz;
      m.m33 *= lz;
    }

    mat.transpose();
    mat.multiply(tmat);

    //start.multiply(mat);
    //console.log(""+start);
  }

  tangentToGlobalSS(inverse = false): void {
    let mat = new Matrix4();

    if (!this.subsurf) {
      return;
    }

    let ns = this.nodes, ps = this.points;
    let doneset = new Array(ps.length);
    let subsurf = this.subsurf;

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      for (let i = 0; i < 4; i++) {
        let pi = ns[ni + QPOINT1 + i];

        if (doneset[pi]) {
          continue;
        }

        doneset[pi] = 1;

        let uv = this._getUV(ni, i);
        let p = ps[pi];

        subsurf.buildTangentMatrix(uv[0], uv[1], mat);
        if (inverse) {
          //this.invertTangentMatrix(mat);
          mat.invert();
        }

        //p.load(subsurf.evaluate(uv[0], uv[1]));
        p.co.multVecMatrix(mat);
      }
    }
  }

  globalToTangentSS(): void {
    this.tangentToGlobalSS(true)
  }

  subdivideAll(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>) {
    if (this.depthLimitEnabled) {
      this.tangentToGlobal();
    }

    //this.globalToTangentSS();
    this.subdivideAll_intern(mesh, loop, cd_grid);
    //this.tangentToGlobalSS();

    if (this.depthLimitEnabled) {
      this.globalToTangent();
    }
  }

  subdivideAll_intern(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
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
      this.subdivide(ni, loopEid, mesh);
    }

    this.recalcFlag |= QRecalcFlags.TOPO | QRecalcFlags.MIRROR | QRecalcFlags.NORMALS;
    this.recalcFlag |= QRecalcFlags.MIRROR | QRecalcFlags.POLYS;
  }

  tangentToGlobal(level = this.depthLimit, inverse = false) {
    let tmp1 = new Vector3();
    let tmp2 = new Vector3();
    let tmp3 = new Vector3();
    let tmp4 = new Vector3();
    let tmp5 = new Vector3();

    let ns = this.nodes, ps = this.points;

    let doneset = new WeakSet();
    let plvls = new Map();
    for (let p of this.points) {
      plvls.set(p, 100000);
      p.flag |= MeshFlags.GRID_MRES_HIDDEN;
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

    let depthLimit = this.depthLimitEnabled ? level : 10000;

    for (let p of this.points) {
      let lvl = plvls.get(p);
      if (lvl <= depthLimit) {
        p.flag &= ~MeshFlags.GRID_MRES_HIDDEN;
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

        let co = tmpco.load(p.co);

        //console.log(ni, ""+tanMat);
        p.co.multVecMatrix(tanMat);

        if (isNaN(p.co.dot(p.co))) {
          console.error("NaN!");
          p.load(co);
        }
      }

      if (!inverse) {
        let p1 = ps[ns[ni + QPOINT1]];
        let p2 = ps[ns[ni + QPOINT2]];
        let p3 = ps[ns[ni + QPOINT3]];
        let p4 = ps[ns[ni + QPOINT4]];

        let n = math.normal_quad(p1.co, p2.co, p3.co, p4.co);

        for (let i = 0; i < 4; i++) {
          let p = ps[ns[ni + QPOINT1 + i]];
          //let lvl = plvls.get(p);

          //if (lvl === ns[ni + QDEPTH]) {
          p.no.add(n);
          //}
        }
      }
    }

    this.recalcFlag |= QRecalcFlags.NORMALS | QRecalcFlags.TOPO | QRecalcFlags.POLYS;
    this.recalcFlag |= QRecalcFlags.LEAF_NODES | QRecalcFlags.LEAF_POINTS | QRecalcFlags.NEIGHBORS;
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

  mresUp() {

  }

  mresDown() {

  }

  checkMultiRes(mesh, loop, cd_grid) {
    let mres = mesh.loops.customData.flatlist[cd_grid].getTypeSettings();
    let limitDepth = !!(mres.flag & GridSettingFlags.ENABLE_DEPTH_LIMIT);
    let changed = (limitDepth !== !!this.depthLimitEnabled || mres.depthLimit !== this.depthLimit);

    if (!changed) {
      return;
    }

    //do all grids at once

    //util.console.warn("grid settings change detected");
    console.warn("Grid settings changed!");

    let maxdepth = 0;
    for (let l of mesh.loops) {
      let grid2 = l.customData[cd_grid];
      let ns = grid2.nodes;

      for (let ni = 0; ni < ns.length; ni += QTOT) {
        if (ns[ni + QFLAG] & DEAD) {
          continue;
        }

        maxdepth = Math.max(maxdepth, ns[ni + QDEPTH]);
      }
    }
    let oldlevel = this.depthLimitEnabled ? this.depthLimit : maxdepth;
    let newlevel = limitDepth ? mres.depthLimit : maxdepth;

    let dl = newlevel > oldlevel ? 1 : -1;
    let level = oldlevel + dl;

    let diff = Math.abs(oldlevel - newlevel);

    diff = Math.min(diff, 10);

    for (let i = 0; i < diff; i++, level += dl) {
      let last = i === diff - 1;

      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];

        grid2.updateNormalQuad(l);
        grid2._changeMresSettings(level, limitDepth || !last);
      }

      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];

        //update topology for all grids first
        grid2.getLeafNodes();
        grid2.getLeafPoints();
        grid2.getTopo();
      }

      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];

        //first general update
        grid2.update(mesh, l, cd_grid, true);
      }

      //stitch boundaries
      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];
        grid2.stitchBoundaries();
      }

      //now do node normals
      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];
        grid2.checkNodeNormals();
      }

      //smooth if going down a level
      if (dl > 0) {
        for (let l of mesh.loops) {
          let grid2 = l.customData[cd_grid];
          for (let pi of grid2.getLeafPoints()) {
            let p = grid2.points[pi];
            //grid2.smoothPoint(p, 0.25);
            p.interp(p.sco, 0.5);
          }
        }
      }

      //boundaries again
      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];
        grid2.stitchBoundaries();
      }

      //and final update
      for (let l of mesh.loops) {
        let grid2 = l.customData[cd_grid];
        grid2.update(mesh, l, cd_grid, true);
      }
    }

    for (let l of mesh.loops) {
      let grid2 = l.customData[cd_grid];
      grid2.depthLimit = mres.depthLimit;
    }
  }

  update(mesh, loop, cd_grid, _ignore_mres = false) {
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

    if (this.recalcFlag & QRecalcFlags.REGEN_IDS) {
      this.regenIds(mesh, loop, cd_grid);
    }

    if (this.recalcFlag & QRecalcFlags.INDICES) {
      this.recalcPointIndices();
    }

    if (!_ignore_mres) {
      this.checkMultiRes(mesh, loop, cd_grid);
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

    let du = 1.0/dimen;
    let dv = 1.0/dimen;

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
        let ip2 = ns[ni + QPOINT1 + ((i + 1)%4)];
        let v1 = vmap[ip1];
        let v2 = vmap[ip2];

        duv1.load(v2.uv).sub(v1.uv);

        let axis = ((i & 1) ^ 1) as Number2;

        let steps = Math.abs(duv1[axis]/duv[axis]) + 0.00001;
        steps += 1;

        let sign1 = Math.sign(duv1[0]);
        let sign2 = Math.sign(duv1[1]);

        steps = ~~steps;

        uv2[0] = v1.uv[0];
        uv2[1] = v1.uv[1];

        let dt = duv[axis]*Math.sign(duv1[axis]);

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
      vmap : vmap,
      emap : emap,
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
      let cd2 = new CDElemArray();
      cd2.length = newps.length;

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

  subdivide(ni, loopEid, mesh) {
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

    let du = (nodes[ni + QMAXU] - nodes[ni + QMINU])*0.5;
    let dv = (nodes[ni + QMAXV] - nodes[ni + QMINV])*0.5;

    let ps = this.points;

    let np1 = ps[nodes[ni + QPOINT1]];
    let np2 = ps[nodes[ni + QPOINT2]];
    let np3 = ps[nodes[ni + QPOINT3]];
    let np4 = ps[nodes[ni + QPOINT4]];

    let cdps = new Array<any>(4);
    let cdws = new Array<any>(4);

    let news = [[false], [false], [false], [false], [false]];
    let bs = new Array(5);

    let p1 = this.subdtemps.next().load(np1.co);
    let p2 = this.subdtemps.next().load(np2.co);
    let p3 = this.subdtemps.next().load(np3.co);
    let p4 = this.subdtemps.next().load(np4.co);

    let tmp1 = this.subdtemps.next(), tmp2 = this.subdtemps.next();

    let uvs = uvstmp;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        let u = i*0.5, v = j*0.5;

        let ni2 = this._newNode();

        nodes[ni + QCHILD1 + (j*2 + i)] = ni2;

        nodes[ni2 + QPARENT] = ni;
        nodes[ni2 + QQUADIDX] = j*2 + i;

        nodes[ni2 + QMINU] = nodes[ni + QMINU] + du*i;
        nodes[ni2 + QMINV] = nodes[ni + QMINV] + dv*j;

        nodes[ni2 + QMAXU] = nodes[ni2 + QMINU] + du;
        nodes[ni2 + QMAXV] = nodes[ni2 + QMINV] + dv;

        nodes[ni2 + QCENTU] = nodes[ni2 + QMINU]*0.5 + nodes[ni2 + QMAXU]*0.5;
        nodes[ni2 + QCENTV] = nodes[ni2 + QMINV]*0.5 + nodes[ni2 + QMAXV]*0.5;

        nodes[ni2 + QFLAG] = LEAF;
        nodes[ni2 + QDEPTH] = depth + 1;

        let b1 = this._ensureNodePoint(ni2, 0, loopEid, mesh, news[0]);
        let b2 = this._ensureNodePoint(ni2, 1, loopEid, mesh, news[1]);
        let b3 = this._ensureNodePoint(ni2, 2, loopEid, mesh, news[2]);
        let b4 = this._ensureNodePoint(ni2, 3, loopEid, mesh, news[3]);

        bs[0] = b1;
        bs[1] = b2;
        bs[2] = b3;
        bs[3] = b4;

        u = i*0.5;
        v = j*0.5;

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

          cdws[0] = u2*v2 - u2 - v2 + 1.0;
          cdws[1] = v2*(1.0 - u2);
          cdws[2] = u2*v2;
          cdws[3] = u2*(1.0 - v2);

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
      elemTypeMask : MeshTypes.LOOP, //see MeshTypes in mesh.js
      typeName     : "QuadTreeGrid",
      settingsClass: GridSettings,
      uiTypeName   : "QuadTreeGrid",
      defaultName  : "QuadTreeGrid",
      //needsSubSurf : true,
      valueSize: undefined,
      flag     : 0
    }
  };

  _ensure(mesh, loop, cd_grid) {
    if (this.points.length === 0) {
      this.init(this.dimen, mesh, loop);
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

    this.totTris = 0;

    if (this.points.length === 0) {
      this.init(this.dimen, mesh, loop);
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

    let idmul = this.dimen*this.dimen;
    idmul = Math.max(idmul, this.polys.length);

    let tc1 = new Vector4();
    let tc2 = new Vector4();
    let tc3 = new Vector4();
    tc1[3] = tc2[3] = tc3[3] = 1.0;

    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 10000;
    let depthLimitEnabled = this.depthLimitEnabled;

    let co1 = new Vector3();
    let co2 = new Vector3();
    let white = new Vector4([1, 1, 1, 1]);

    //buildTangentMatrix

    let lidgen = loop.eid*idmul*8;

    function line(v1, v2, color) {
      let id = lidgen++;
      let line2;

      if (ischunk) {
        line2 = smesh.line(id, v1, v2);
      } else {
        line2 = smesh.line(v1, v2);
      }

      if (color) {
        line2.colors(color, color);
      }

      line2.ids(loop.eid, loop.eid);

      return line2;
    }

    let doneset = new WeakSet();

    let greyFac = 0.25;
    let grey = [greyFac, greyFac, greyFac, 1.0];
    let mat = new Matrix4();
    let n1 = new Vector3();


    let ff = 1.0;
    let colors = [
      [ff, 0.0, 0.0, 1],
      [0.0, ff, 0.0, 1],
      [0.0, 0.0, ff, 1]
    ];

    for (let ni of this.getLeafNodes()) {
      let depth = nodes[ni + QDEPTH];

      for (let i = 0; i < 4; i++) {
        let p1 = ps[nodes[ni + QPOINT1 + i]];
        let p2 = ps[nodes[ni + QPOINT1 + ((i + 1) & 3)]];

        co1.load(p1.co);
        co2.load(p2.co);
        //line(co1, co2, grey);

        let uv = this._getUV(ni, i);
        let ni2 = ni ? nodes[ni + QPARENT] : 0;

        co1.addFac(p1.no, p1.co.vectorDistance(p2.co)*0.1);

        let disfac = p1.co.vectorDistance(p2.co)*0.5;
        disfac = 0.0625;

        //*
        co2.load(co1).addFac(p1.tan, disfac);
        line(co1, co2, colors[0]);

        co2.load(co1).addFac(p1.bin, disfac);
        line(co1, co2, colors[1]);
        //*/

        //co2.load(p1.tan).cross(p1.no).normalize().mulScalar(disfac);
        //co2.add(co1);

        //line(co1, co2, colors[1]);

        continue;
        //n.load(p1.no);
        this.buildTangentMatrix(ni2, uv[0], uv[1], mat)
        for (let j = 0; j < 3; j++) {
          mat.copyColumnTo(j, n1);
          n1.normalize();

          let color = colors[j];

          co2.load(co1).addFac(n1, disfac);
          line(co1, co2, color);
        }
      }
    }

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

      smesh.primflag |= 2;

      for (let i = start + 1; i < end - 1; i++) {
        let p2 = ps[polys[i]];
        let p3 = ps[polys[i + 1]];

        let id = loop.eid*idmul + i;

        let tri;

        //let id = Math.random();

        if (ischunk) {
          tri = smesh.tri(id, p1, p2, p3);
        } else {
          tri = smesh.tri(p1, p2, p3);
        }

        this.totTris++;

        if (have_color) {
          let c1 = p1.customData.get<ColorLayerElem>(cd_color).color;
          let c2 = p2.customData.get<ColorLayerElem>(cd_color).color;
          let c3 = p3.customData.get<ColorLayerElem>(cd_color).color;
          tri.colors(c1, c2, c3);
        }

        tri.normals(p1.no, p2.no, p3.no);
        tri.ids(feid, feid, feid);
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

    n = math.normal_tri(p1.co, p2.co, p3.co);
    p1.no.add(n);
    p2.no.add(n);
    p3.no.add(n);
    p4.no.add(n);

    n = math.normal_tri(p1.co, p3.co, p4.co);
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

    for (let p of this.points) {
      if (!p.orig) {
        p.orig = new Vector3();
      }

      p.orig.load(p.co);
    }

    this.recalcFlag &= ~QRecalcFlags.NODE_NORMALS;

    let ns = this.nodes, ps = this.points;

    for (let pi of this.getLeafPoints()) {
      let p = ps[pi];

      p.sco.load(p.co);
      p.totsco = 1;
    }

    let t1 = new Vector3();
    let t2 = new Vector3();

    //update centers
    let depthLimit = this.depthLimitEnabled ? this.depthLimit : 1000;
    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (ns[ni + QDEPTH] > depthLimit) {
        continue;
      }

      if (ns[ni + QFLAG] & DEAD) {
        continue;
      }

      let p1 = ps[ns[ni + QPOINT1]];
      let p2 = ps[ns[ni + QPOINT2]];
      let p3 = ps[ns[ni + QPOINT3]];
      let p4 = ps[ns[ni + QPOINT4]];

      p1.uv.load(this._getUV(ni, 0));
      p2.uv.load(this._getUV(ni, 1));
      p3.uv.load(this._getUV(ni, 2));
      p4.uv.load(this._getUV(ni, 3));

      ns[ni + QCENTX] = (p1[0] + p2[0] + p3[0] + p4[0])*0.25;
      ns[ni + QCENTY] = (p1[1] + p2[1] + p3[1] + p4[1])*0.25;
      ns[ni + QCENTZ] = (p1[2] + p2[2] + p3[2] + p4[2])*0.25;
    }

    //update normals;
    for (let ni of this.getLeafNodes()) {
      let p1 = ps[ns[ni + QPOINT1]];
      let p2 = ps[ns[ni + QPOINT2]];
      let p3 = ps[ns[ni + QPOINT3]];
      let p4 = ps[ns[ni + QPOINT4]];

      let n = math.normal_quad(p1.co, p2.co, p3.co, p4.co);

      t1.load(p4.co).sub(p1.co);//.normalize();
      t2.load(p3.co).sub(p2.co);//.normalize();

      t1.interp(t2, 0.5);//.normalize();

      ns[ni + QTX] = t1[0];
      ns[ni + QTY] = t1[1];
      ns[ni + QTZ] = t1[2];

      for (let i = 0; i < 4; i++) {
        let p = ps[ns[ni + QPOINT1 + i]];
        p.sco[0] += ns[ni + QCENTX];
        p.sco[1] += ns[ni + QCENTY];
        p.sco[2] += ns[ni + QCENTZ];
        p.totsco++;
        break;

        let i1 = (i + 3) & 3;
        let i2 = i;
        let i3 = (i + 1) & 3;

        let a = ps[ns[ni + QPOINT1 + i1]];
        let b = ps[ns[ni + QPOINT1 + i2]];
        let c = ps[ns[ni + QPOINT1 + i3]];

        b.sco.add(a.co);
        b.sco.add(c.co);
        b.totsco += 2.0;
      }
      //t1.cross(n);

      //*
      t1.load(p2.co).sub(p1.co);//.normalize();
      t2.load(p3.co).sub(p4.co);//.normalize();
      t1.interp(t2, 0.5);//.normalize();
      //*/

      ns[ni + QBX] = t1[0];
      ns[ni + QBY] = t1[1];
      ns[ni + QBZ] = t1[2];

      ns[ni + QNX] = n[0];
      ns[ni + QNY] = n[1];
      ns[ni + QNZ] = n[2];
    }

    for (let pi of this.getLeafPoints()) {
      let p = ps[pi];

      p.sco.mulScalar(1.0/p.totsco);
      p.totsco = 1.0;
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
    if (!(this.recalcFlag & QRecalcFlags.NORMALS)) {
      return;
    }

    this.checkNodeNormals();

    this.recalcFlag &= ~QRecalcFlags.VERT_NORMALS;

    let ns = this.nodes, ps = this.points;

    let ps2 = new Set<QTGridVert>();

    for (let ni of this.getLeafNodes()) {
      for (let i = 0; i < 4; i++) {
        let p = ps[ns[ni + QPOINT1 + i]];

        if (!ps2.has(p)) {
          ps2.add(p);

          p.sco.load(p.co);
          p.totsco = 1;

          p.no.zero();
          p.startTan();
        }
      }
    }

    //let temp = new Array(256);

    if (!mesh) {
      this.recalcFlag |= QRecalcFlags.VERT_NORMALS;

      for (let p of ps2) {
        let topo = this.getTopo();

        p.no.zero();
        p.startTan();

        let w = 1.0;

        let v = topo.vmap[p.index];
        for (let ni of v.nodes) {
          let tf = p.tanMulFac(ns[ni + QDEPTH]);

          p.no[0] += ns[ni + QNX];
          p.no[1] += ns[ni + QNY];
          p.no[2] += ns[ni + QNZ];

          p.tot++;

          p.tan[0] += ns[ni + QTX]*tf;
          p.tan[1] += ns[ni + QTY]*tf;
          p.tan[2] += ns[ni + QTZ]*tf;

          p.bin[0] += ns[ni + QBX]*tf;
          p.bin[1] += ns[ni + QBY]*tf;
          p.bin[2] += ns[ni + QBZ]*tf;

          p.sco[0] += ns[ni + QCENTX];
          p.sco[1] += ns[ni + QCENTY];
          p.sco[2] += ns[ni + QCENTZ];
          p.totsco++;
        }

        p.no.normalize();

        p.finishTan();

        p.sco.mulScalar(1.0/p.totsco);
        p.totsco = 1.0;
      }

      return;
    }

    let scotmp = new Vector3();
    let scotmp2 = new Vector3();
    let scotmp3 = new Vector3();
    let scotmp4 = new Vector3();

    for (let p of ps2) {
      let topo = this.getTopo();

      p.no.zero();
      p.startTan();

      let v = topo.vmap[p.index];
      for (let ni of v.nodes) {
        let depth = ns[ni + QDEPTH];

        p.no[0] += ns[ni + QNX];
        p.no[1] += ns[ni + QNY];
        p.no[2] += ns[ni + QNZ];

        let tf = p.tanMulFac(depth);

        p.tan[0] += ns[ni + QTX]*tf;
        p.tan[1] += ns[ni + QTY]*tf;
        p.tan[2] += ns[ni + QTZ]*tf;

        p.bin[0] += ns[ni + QBX]*tf;
        p.bin[1] += ns[ni + QBY]*tf;
        p.bin[2] += ns[ni + QBZ]*tf;

        p.tot++;

        p.sco[0] += ns[ni + QCENTX];
        p.sco[1] += ns[ni + QCENTY];
        p.sco[2] += ns[ni + QCENTZ];
        p.totsco++;
      }

      if (!p.bLink) {
        p.no.normalize();
        p.finishTan();

        p.sco.mulScalar(1.0/p.totsco);
        p.totsco = 1.0;
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

        let l2 = mesh.eidMap.get(p2.loopEid);
        if (!l2) {
          continue;
        }

        let grid2 = l2.customData[cd_grid];

        grid2.checkNodeNormals();

        if (grid2.recalcFlag & QRecalcFlags.INDICES) {
          grid2.recalcPointIndices();
        }

        let topo2 = grid2.getTopo();

        let ns2 = grid2.nodes, ps2 = grid2.points;
        let vm = topo2.vmap[p2.index];
        if (!vm) {
          continue;
        }

        for (let ni of vm.nodes) {
          p.no[0] += ns2[ni + QNX];
          p.no[1] += ns2[ni + QNY];
          p.no[2] += ns2[ni + QNZ];

          //*
          if (l2 === l.radial_next.next) {
            let tf = p2.tanMulFac(ns2[ni + QDEPTH]);

            p.tan[0] = -ns2[ni + QBX]*tf;
            p.tan[1] = -ns2[ni + QBY]*tf;
            p.tan[2] = -ns2[ni + QBZ]*tf;

            p.bin[0] = ns2[ni + QTX]*tf;
            p.bin[1] = ns2[ni + QTY]*tf;
            p.bin[2] = ns2[ni + QTZ]*tf;

            p.tot++;
          }

          p.sco[0] += ns2[ni + QCENTX];
          p.sco[1] += ns2[ni + QCENTY];
          p.sco[2] += ns2[ni + QCENTZ];
          p.totsco++;
          //*/
        }
      }

      p.no.normalize();
      p.finishTan();

      p.sco.mulScalar(1.0/p.totsco);
      p.totsco = 1.0;

      if (p.index < 4) {
        scotmp.zero();
        let tot = 0.0;

        for (let p2 of p.bRing) {
          scotmp2.load(p2.co);
          let tot2 = 1.0;

          for (let p3 of p2.neighbors) {
            if (p3 === p2) {//p3.loopEid !== p2.loopEid || p3 === p2) {
              continue;
            }

            scotmp2.add(p3.co);
            tot2++;
          }

          scotmp2.mulScalar(1.0/tot2);

          scotmp.add(scotmp2);
          tot++;
        }

        if (tot > 0) {
          scotmp.mulScalar(1.0/tot);
          p.sco.load(scotmp);
        }
      }
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
    ].map(uv => new Vector2(uv));

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

    function findNeighborEdge(p, l, ltopo, lps, side: number, u: number, v: number, axis: Number2) {
      let dimen2 = ltopo.dimen;

      let uv = uv3;
      uv[0] = u;
      uv[1] = v;

      let goal = uv[axis];
      uv[axis] = 0.0;

      let v1, v2;

      let dt = 1.0/dimen2;
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
          t = (goal - f1)/(f2 - f1);
        }

        p.bLink = new BLink(v1, v2, t);
      }

    }

    for (let i = 0; i < 4; i++) {
      let uv1 = uvs[i], uv2 = uvs[(i + 1)%4];
      let axis = ((i + 1) & 1) as Number2;

      uv.load(uv1);
      duv.load(uv2).sub(uv1);

      let dt = duv[axis]/dimen;

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
            findNeighborEdge(p1, lpr, lprtopo, lprps, i, u, v, (axis ^ 1) as Number2);
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
            findNeighborEdge(p1, lrn, lrntopo, lrnps, i, u, v, (axis ^ 1) as Number2);
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

  uvColorTest(mesh, loop, cd_grid) {
    let cd_col = mesh.loops.customData.getLayerIndex("color");

    if (cd_col < 0) {
      return;
    }

    let ns = this.nodes, ps = this.points;

    for (let ni of this.getLeafNodes()) {
      for (let i = 0; i < 4; i++) {
        let p = ps[ns[ni + QPOINT1 + i]];

        let color = p.customData.get<ColorLayerElem>(cd_col).color;

        let uv = this._getUV(ni, i);

        color[0] = uv[0];
        color[1] = uv[1];
        color[2] = 0.0;
        color[3] = 1.0;
      }
    }
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {
    this.updateNormalQuad(loop);

    this.totTris = 0;

    //this.uvColorTest(mesh, loop, cd_grid);

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

    let idmul = (this.dimen + 2)*(this.dimen + 2)*16;
    idmul = this.idmul = Math.max(idmul, this.polys.length*2);

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
        let id = loop.eid*idmul + i;

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
        this.totTris++;
      }
    }
  }

  _loadCompressedNodes(ns1 = this.nodes as unknown as any) {
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

    let leaves = [];

    let qtot_mul = QTOT/this.nodeFieldSize;

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

      if (this.nodeFieldSize !== QTOT) {
        for (let i = 0; i < 4; i++) {
          let ci = ~~(qtot_mul*ns2[ni + QCHILD1 + i] + 0.00001);

          ns2[ni + QCHILD1 + i] = ci;
        }
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

      ns2[ni + QCENTU] = ns2[ni + QMINU]*0.5 + ns2[ni + QMAXU]*0.5;
      ns2[ni + QCENTV] = ns2[ni + QMINV]*0.5 + ns2[ni + QMAXV]*0.5;

      //console.log(`ni: ${ni / QTOT} flag: ${ns2[ni + QFLAG]}`);
      //console.log(`  ${ns2[ni+QMINU]} ${ns2[ni+QMINV]} ${ns2[ni+QMAXU]} ${ns2[ni+QMAXV]}`);

      ns2[ni + QDEPTH] = depth;

      if (ns2[ni + QFLAG] & DEAD) {
        return;
      }

      if (!(ns2[ni + QFLAG] & LEAF)) {
        for (let i = 0; i < 4; i++) {
          let ni2 = ns2[ni + QCHILD1 + i];

          if (!ni2) {
            continue;
          }

          let du = (ns2[ni + QMAXU] - ns2[ni + QMINU])*0.5;
          let dv = (ns2[ni + QMAXV] - ns2[ni + QMINV])*0.5;

          let x = i & 1;
          let y = i>>1;

          //console.log(`  a: ${ns2[ni2+QMINU]} ${ns2[ni2+QMINV]} ${ns2[ni2+QMAXU]} ${ns2[ni2+QMAXV]}`);

          ns2[ni2 + QMINU] = ns2[ni + QMINU] + du*x;
          ns2[ni2 + QMINV] = ns2[ni + QMINV] + dv*y;
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
        //console.error("Unmarked dead quad tree node detected", ni, this);
      }

      ns2[ni + QCENTU] = ns2[ni + QMINU]*0.5 + ns2[ni + QMAXU]*0.5;
      ns2[ni + QCENTV] = ns2[ni + QMINV]*0.5 + ns2[ni + QMAXV]*0.5;
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
    //deal with old files
    this.nodeFieldSize = undefined;

    reader(this);
    super.loadSTRUCT(reader);

    //deal with old files
    if (this.nodeFieldSize === undefined) {
      this.nodeFieldSize = 32;
    }

    this.recalcFlag |= QRecalcFlags.MIRROR;

    for (let p of this.points) {
      p.loopEid = this.loopEid;
      p.orig = new Vector3(p.orig);
    }

    if (typeof this.nodes[0] !== "number") {
      this._loadCompressedNodes();
    } else if (this.nodes.length > 0 && this.nodeFieldSize !== QTOT) {
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

        let idx = ni/QTOT;

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

    this.nodeFieldSize = QTOT;
    this._rebuildHash();
  }
}

QuadTreeGrid.STRUCT = nstructjs.inherit(QuadTreeGrid, GridBase, "mesh.QuadTreeGrid") + `
  nodes               : array(mesh_grid.CompressedQuadNode) | this._saveNodes();
  depthLimitEnabled   : bool;
  depthLimit          : int;
  normalQuad          : array(vec3);
  loopEid             : int;
  nodeFieldSize       : int;
}`;
nstructjs.register(QuadTreeGrid);
CustomDataElem.register(QuadTreeGrid);
