import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';

import {MeshFlags, MeshTypes, RecalcFlags} from "./mesh_base.js";
import {CDFlags, CustomData, CustomDataElem, LayerSettingsBase} from "./customdata.js";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {ChunkedSimpleMesh} from "../core/simplemesh.js";
import {FloatElem} from "./mesh_customdata.js";
import {PatchBuilder} from "./mesh_grids_subsurf.js";

let blink_rets = util.cachering.fromConstructor(Vector3, 64);
let blink_rets4 = util.cachering.fromConstructor(Vector4, 64);
let tmptanmat = new Matrix4();
let uvstmp = new Array(4);
for (let i = 0; i < 4; i++) {
  uvstmp[i] = new Vector2();
}

let stmp1 = new Vector3(), stmp2 = new Vector3();

export const QRecalcFlags = {
  POLYS           : 1<<0,
  TOPO            : 1<<1,
  POINT_PRUNE     : 1<<2,
  NEIGHBORS       : 1<<3,
  MIRROR          : 1<<4,
  CHECK_CUSTOMDATA: 1<<5,
  POINTHASH       : 1<<6,
  VERT_NORMALS    : 1<<7,
  NODE_NORMALS    : 1<<8,
  NORMALS         : (1<<7) | (1<<8),
  INDICES         : 1<<9,
  LEAF_POINTS     : 1<<10,
  LEAF_NODES      : 1<<11,
  LEAVES          : (1<<10) | (1<<11),
  PATCH_UVS       : 1<<12, //not part of ALL
  REGEN_IDS       : 1<<13, //most definitely not part of ALL
  REGEN_EIDMAP    : 1<<14, //not part of ALL
  FIX_NEIGHBORS   : 1<<15,
  NODE_DEPTH_DELTA: 1<<16,
  ALL             : 1 | 2 | 4 | 8 | 64 | 128 | 256 | (1<<9) | (1<<10) | (1<<11),
  EVERYTHING      : (1<<16)-1
};

export const GridSettingFlags = {
  SELECT            : 1,
  ENABLE_DEPTH_LIMIT: 2,
}

export class GridSettings extends LayerSettingsBase {
  constructor() {
    super();

    this.flag = 0;
    this.depthLimit = 2;

    this._last_subsurf_key = "";
    this._last_coords_hash = undefined;
  }

  static apiDefine(api) {
    let st = api.mapStruct(GridSettings, true);

    st.flags("flag", "flag", GridSettingFlags, "Flag", "Flags");
    let lvl = st.int("depthLimit", "depthLimit", "Limit", "Maximum subdivision level");

    lvl.range(0, 10);
  }

  copyTo(b) {
    b.flag = this.flag;
    b.depthLimit = this.depthLimit;
  }
}

GridSettings.STRUCT = nstructjs.inherit(GridSettings, LayerSettingsBase, "mesh.GridSettings") + `
  flag       : int;
  depthLimit : int;
}`;
nstructjs.register(GridSettings);

export class BLink {
  constructor(a, b = undefined, t = 0.5) {
    this.v1 = a;
    this.v2 = b;
    this.t = t;
  }

  get() {
    let ret = blink_rets.next();

    if (this.v2) {
      ret.load(this.v1).interp(this.v2, this.t);
    } else {
      ret.load(this.v1);
    }

    return ret;
  }

  getColor(cd_color) {
    let ret = blink_rets4.next();

    let c1 = this.v1.customData[cd_color].color;
    if (this.v2) {
      let c2 = this.v2.customData[cd_color].color;

      ret.load(c1).interp(c2, this.t);
    } else {
      ret.load(c1);
    }

    return ret;
  }
}

/*
okay, so turned out my idea of having grids
overlap on two edges is problematic, as it requires
non-quads for joining corners on extroidinary vertices
*/
let interptemp1 = [];

const IDX = -1, IDXINV = -2;

export const NeighborKeys = {
  L  : 1, //loop
  LP : 2, //loop.prev
  LN : 4, //loop.next
  LR : 8, //loop.radial_next
  LRP: 16, //loop.radial_next.prev
  LRN: 32, //loop.radial_next.prev
  LPR: 64, //loop.prev.radial_next
  LNR: 128, //loop.next.radial_next
};

export class ResolveValue {
  constructor() {
    this.x1 = 0;
    this.y1 = 0;
    this.x2 = 0;
    this.y2 = 0;
  }
}

let resolve_rets = util.cachering.fromConstructor(ResolveValue, 512);

export class NeighborMap {
  constructor(dimen) {
    this.dimen = dimen;

    let masks = {
      l  : 1,
      lp : 2,
      ln : 4,
      lr : 8,
      lrp: 16,
      lrn: 32,
      lpr: 64,
      lnr: 128
    };

    function lmask(a, b) {
      return masks[a] | masks[b];
    }

    /*
        let maps = {
    //      [bitmask, [
      //        [x1, y1], l1.v==l2.v([x2, y2]), l1.v!=l2.v([x2, y2])
        //    ]
          //]

          [lmask("l", "lp")] : [[IDX, dimen-1], [undefined,undefined], [0, IDXINV]],
          [lmask("l", "ln")] : [[0, IDX], [undefined,undefined], [IDXINV, dimen-1]],
          [lmask("l", "lrn")] : [[IDX, 0], [dimen-1, IDXINV], [undefined, IDX]],
          [lmask("l", "lpr")] : [[dimen-1, IDX], [IDXINV, 0], [undefined, IDX]],
        }

        let cases = [
          {mask : lmask("l", "lp"), l1 : masks.l, l2 : masks.lp},
          {mask : lmask("l", "ln"), l1 : masks.l, l2 : masks.ln},
          {mask : lmask("l", "lrn"),  l1 : masks.l, l2 : masks.lrn},
          {mask : lmask("l", "lpr"),  l1 : masks.l, l2 : masks.lpr},
        ];
    */

    let maps = {
      /*
      [bitmask, [
          [x1, y1], l1.v==l2.v([x2, y2]), l1.v!=l2.v([x2, y2])
        ]
      ]

      */

      [lmask("l", "lp")] : [[0, IDX], [undefined, undefined], [IDX, 0]],
      [lmask("l", "lpr")]: [[IDX, dimen - 1], [dimen - 1, IDX], [undefined, IDX]],
    }

    let cases = [
      {mask: lmask("l", "lp"), l1: masks.l, l2: masks.lp},
      {mask: lmask("l", "lpr"), l1: masks.l, l2: masks.lpr},
    ];

    this.maps = maps;
    this.cases = cases;
  }

  getmap(f, i) {
    if (f === IDX) {
      return i;
    } else if (f === IDXINV) {
      return this.dimen - 1 - i;
    } else {
      return f;
    }
  }

  resolve(i1, l1, l2, l1mask, l2mask, i2 = i1) {
    let mask = l1mask | l2mask;
    let dimen = this.dimen;

    let map = this.maps[mask];
    let x1, y1, x2, y2;

    x1 = this.getmap(map[0][0], i1);
    y1 = this.getmap(map[0][1], i1);

    if (l1.v === l2.v) {
      //i2 = Math.max(i2-1, 0);
      x2 = this.getmap(map[1][0], i2);
      y2 = this.getmap(map[1][1], i2);
    } else {
      x2 = this.getmap(map[2][0], i2);
      y2 = this.getmap(map[2][1], i2);
    }

    let ret = resolve_rets.next();

    ret.x1 = x1;
    ret.y1 = y1;
    ret.x2 = x2;
    ret.y2 = y2;

    return ret;
  }
}

let maps = {};
let shortNormalRet = [0, 0, 0];

export function getNeighborMap(dimen) {
  if (!(dimen in maps)) {
    maps[dimen] = new NeighborMap(dimen);
  }

  return maps[dimen];
}

let _instruct = false;

export class GridVert extends Vector3 {
  constructor(index = 0, loopEid = -1, eid = -1) {
    _instruct = true;
    super();
    _instruct = false;

    //this.co = new Vector3();

    this.no = new Vector3();
    this.tan = new Vector3(); //not saved
    this.bin = new Vector3(); //not saved
    this.sco = new Vector3(); //not saved
    this.totsco = 1; //internal
    this.tot = 0;
    this.uv = new Vector2();  //not saved

    this.flag = 0;

    //not a subclass of mesh_types.Element but we still use
    //the main mesh's id generator
    this.eid = eid;

    this.index = index;
    this.index2 = index;

    this.loopEid = loopEid;
    this.customData = this.cd = [];
    this.neighbors = []; //is not saved

    this.bRingSet = new Set();

    this.bLink = undefined;
    this.bNext = this.bPrev = undefined; //boundary next/prev
  }

  get co() {
    return this;
  }

  set co(c) {
    this[0] = c[0];
    this[1] = c[1];
    this[2] = c[2];

    if (!_instruct) {
      console.warn("this.co set");
    }
  }
  /*
  get 0() {
    //throw new Error("gridvert access");
    if (!this.co) return;
    return this.co[0];
  }
  set 0(f) {
    if (!_instruct) {
     // throw new Error("gridvert access");
    }

    if (!this.co) return;
    this.co[0] = f;
  }
  get 1() {
    //throw new Error("gridvert access");
    return this.co[1];
  }
  set 1(f) {
    if (!_instruct) {
    //  throw new Error("gridvert access");
    }
    if (!this.co) return;
    this.co[1] = f;
  }
  get 2() {
    //throw new Error("gridvert access");
    return this.co[2];
  }
  set 2(f) {
    if (!_instruct) {
    //  throw new Error("gridvert access");
    }

    if (!this.co) return;
    this.co[2] = f;
  } //*/

  get bRing() {
    return this.bRingSet;
    let this2 = this;

    return (function* () {
      if (this2.bNext === undefined) {
        yield this2;
        return;
      }

      let _i = 0;
      let v = this2;
      do {
        if (_i++ > 20) {
          util.console.log("infinite loop error!");
          break;
        }

        yield v;
        v = v.bNext;
      } while (v !== this2);
    })();
  }

  static getMemSize(p) {
    let tot = 21*8;

    tot += 4*3*8 + 2*8;
    if (p) {
      tot += p.neighbors.length*8 + p.bRingSet.size*8;
    }

    return tot;
  }

  startTan() {
    this.tot = 0;
    this.tan.zero();
    this.bin.zero();
  }

  tanMulFac(depth) {
    let dimen = gridSides[depth] - 1;

    return Math.pow(2.0, depth);
  }

  finishTan() {
    if (this.tot > 0) {
      this.tan.mulScalar(1.0/this.tot);
      this.bin.mulScalar(1.0/this.tot);
    }

    //this.tan.normalize();
    //this.bin.normalize();
  }

  addTan(ns, ni, pidx) {
    //this.tot++;
  }

  bRingInsert(v) {
    if (!v) {
      throw new Error("bRingInsert called with undefined v parameter");
      console.warn("bRingInsert called in error");
      return;
    }

    this.bRingSet.add(v);
    v.bRingSet.add(this);

    return;
    if (v === this || v.loopEid === this.loopEid) {
      return;
    }

    if (!v.bNext && !this.bNext) {
      this.bNext = this.bPrev = v;
      v.bNext = v.bPrev = this;
    } else if ((!v.bNext) ^ (!this.bNext)) {
      let v1 = v.bNext ? this : v;
      let v2 = v.bNext ? v : this;

      v1.bPrev = v2.bPrev;
      v2.bPrev.bNext = v1;

      v1.bNext = v2;
      v2.bPrev = v1;
    } else if (1) {
      let list = [];
      for (let v2 of v.bRing) {
        list.push(v2);
      }

      for (let v2 of list) {
        if (v2 === this) {
          continue;
        }
        if (v2.bNext)
          v2.bNext.bPrev = v2.bPrev;
        if (v2.bPrev)
          v2.bPrev.bNext = v2.bNext;

        v2.bNext = v2.bPrev = undefined;
        this.bRingInsert(v2);
      }
    } else if (0) {
      let list1 = [];

      for (let v2 of this.bRing) {
        list1.push(v2);
      }

      for (let v2 of v.bRing) {
        list1.push(v2);
      }

      let prev = undefined;
      for (let v of list1) {
        if (prev) {
          prev.bNext = v;
          v.bPrev = prev;
        }
        prev = v;
      }
      prev.bNext = list1[0];
      list1[0].bPrev = prev;
    }
  }

  bRingRemove() {
    for (let v2 of this.bRingSet) {
      v2.bRingSet.delete(this);
    }
    this.bRingSet = new Set();

    return;
    if (this.bNext === this) {
      this.bNext = this.bPrev = undefined;
      return;
    }

    if (this.bNext) {
      this.bNext.bPrev = this.bPrev;
      this.bPrev.bNext = this.bNext;
    }

    this.bNext = this.bPrev = undefined;
  }

  load(b, coOnly = true) {
    if (!b) {
      return;
    }

    super.load(b);
    //this.co.load(b);

    if (!coOnly && b instanceof GridVert) {
      b.no.load(this.no);
      b.flag = this.flag;
    }

    return this;
  }

  _saveShortNormal() {
    let n1 = this.no;
    let n2 = shortNormalRet;

    n2[0] = ~~(n1[0]*32765);
    n2[1] = ~~(n1[1]*32765);
    n2[2] = ~~(n1[2]*32765);

    return n2;
  }

  loadSTRUCT(reader) {
    _instruct = true;
    reader(this);
    _instruct = false;

    super.loadSTRUCT(reader);

    this.no = new Vector3(this.no);
    this.no.mulScalar(1.0/32765);
  }
}

GridVert.STRUCT = nstructjs.inherit(GridVert, Vector3, "mesh.GridVert") + `
  no         : array(short) | this._saveShortNormal();
  co         : vec3;
  flag       : int;
  eid        : int;
}`;
nstructjs.register(GridVert);

export function genGridDimens(depth = 32) {
  let dimen = 2;
  let ret = [2];

  for (let i = 0; i < depth; i++) {
    dimen = (dimen - 1)*2 + 1;
    ret.push(dimen);
  }

  return ret;
}

export const gridSides = genGridDimens();


export class GridBase extends CustomDataElem {
  constructor() {
    super();

    this.cdmap = new Array(64);
    this.cdmap_reverse = new Array(64);
    this._max_cd_i = 0;

    this.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS;

    this.totTris = 0;

    this.dimen = 0;
    this.customDataLayout = [];
    this.points = [];
    this.customDatas = [];

    this.eidmap = undefined;

    this.needsSubSurf = false;
    this.subsurf = undefined; //subsurf patch
  }

  static updateSubSurf(mesh, cd_grid, check_coords = false) {
    if (!this.define().needsSubSurf) {
      return;
    }

    let mres = mesh.loops.customData.flatlist[cd_grid].getTypeSettings();
    let key = "" + mesh.eidgen._cur;

    key += ":" + mesh.verts.length + ":" + mesh.edges.length + ":" + mesh.faces.length;

    if (check_coords || !mres._last_coords_hash) {
      let hash = new util.HashDigest();
      for (let v of mesh.verts) {
        hash.add(v[0]);
        hash.add(v[1]);
        hash.add(v[2]);
      }

      hash = "" + hash.get();
      mres._last_coords_hash = hash;

    }

    key += ":" + mres._last_coords_hash;

    if (key !== mres._last_subsurf_key) {
      mres._last_subsurf_key = key;
      console.error("Subsurf update!", key);

      this.recalcSubSurf(mesh, cd_grid);
    }
  }

  static recalcSubSurf(mesh, cd_grid) {
    let builder = new PatchBuilder(mesh, cd_grid);
    builder.build();

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];
      grid.subsurf = builder.patches.get(l);
    }
  }

  static patchUVLayerName(mesh, cd_grid) {
    return "_" + cd_grid + "_patch_uv";
  }

  static hasPatchUVLayer(mesh, cd_grid) {
    return mesh.loops.customData.hasNamedLayer(this.patchUVLayerName(mesh, cd_grid), "uv");
  }

  static getPatchUVLayer(mesh, cd_grid) {
    let name = this.patchUVLayerName(mesh, cd_grid);

    if (mesh.loops.customData.hasNamedLayer(name), "uv") {
      return mesh.loops.customData.getNamedLayer(name, "uv").index;
    }

    let layer = mesh.loops.addCustomDataLayer("uv", name);
    layer.flag |= CDFlags.TEMPORARY;

    let cd_uv = layer.index;
    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.initPatchUVLayer(mesh, l, cd_grid, cd_uv);
    }
  }

  static isGridClass(cls) {
    //return new cls() instanceof GridBase;
    let p = cls;

    while (p && p !== Object) {
      if (p === GridBase) {
        return true;
      }
      p = p.__proto__;
    }

    return false;
  }

  static syncVertexLayers(mesh) {
    if (this.meshGridOffset(mesh) < 0) {
      return; //no grid data
    }

    let validtypes = new Set(["normal", "color"]);

    for (let layer of mesh.verts.customData.flatlist) {
      if (!validtypes.has(layer.typeName)) {
        continue;
      }

      let name2 = "_v_" + layer.name;
      if (!mesh.loops.customData.hasNamedLayer(name2, layer.typeName)) {
        console.log("Adding grid data layer", name2);
        mesh.loops.addCustomDataLayer(layer.typeName, name2);
      }

      let layer2 = mesh.loops.customData.getNamedLayer(name2, layer.typeName);
      if (layer === mesh.verts.customData.getActiveLayer(layer.typeName)) {
        mesh.loops.customData.setActiveLayer(layer2.index);
      }
    }
  }

  static meshGridOffset(mesh) {
    let i = 0;

    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);

      if (GridBase.isGridClass(cls)) {
        return i;
      }

      i++;
    }

    return -1;
  }

  static calcCDLayout(mesh) {
    let cdlayers = [];
    let i = 0;

    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      let ok = cls;

      ok = ok && !(GridBase.isGridClass(cls));

      if (ok) {
        cdlayers.push([i, cls]);
      }

      i++;
    }

    return cdlayers;
  }

  static initMesh(mesh, dimen, cd_grid = mesh.loop.customData.getLayerIndex(this)) {
    if (cd_grid === -1) {
      mesh.loops.addCustomDataLayer(this, this.define().typeName);
      cd_grid = mesh.loops.customData.getLayerIndex(this);
    }

    //static updateSubSurf(mesh, cd_grid, check_coords=false) {

    this.updateSubSurf(mesh, cd_grid, true);

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.init(dimen, mesh, l, cd_grid);
    }

    mesh.regenRender();
    mesh.regenElementsDraw();
  }

  regenEIDMap() {
    this.recalcFlag |= QRecalcFlags.REGEN_EIDMAP;
  }

  getEIDMap(mesh) {
    if (this.eidmap && !(this.recalcFlag & QRecalcFlags.REGEN_EIDMAP)) {
      return this.eidmap;
    }

    this.recalcFlag &= ~QRecalcFlags.REGEN_EIDMAP;
    let eidmap = this.eidmap = {};

    for (let p of this.points) {
      if (p.eid < 0) {
        p.eid = mesh.eidgen.next();
      }

      eidmap[p.eid] = p;
    }

    return eidmap;
  }

  calcMemSize() {
    let tot = 128*8 + 10*8;

    if (this.points.length === 0) {
      return tot;
    }

    let p = this.points[0];
    for (let cd of p.customData) {
      tot += cd.calcMemSize()*this.points.length;
    }

    for (let p of this.points) {
      tot += GridVert.getMemSize(p);
    }

    return tot;
  }

  copyTo(b, copyPointEids = false) {
    if (!copyPointEids) {
      this.recalcFlag |= QRecalcFlags.REGEN_IDS;
    }
  }

  regenIds(mesh, loop, cd_grid) {
    this.recalcFlag &= ~QRecalcFlags.REGEN_IDS;

    for (let p of this.points) {
      p.eid = mesh.eidgen.next();
    }
  }

  flagIdsRegen() {
    this.recalcFlag |= QRecalcFlags.REGEN_IDS;
  }

  subdivideAll() {
    console.warn(this.constructor.name + ".prototype.subdivideAll(): implement me!");
  }

  tangentToGlobal(depthLimit, inverse = false) {

  }

  globalToTangent(depthLimit) {
    return this.tangentToGlobal(depthLimit, true);
  }

  initPatchUVLayer(mesh, l, cd_grid, cd_uv) {
    console.warn("initPatchUVLayer: implement me!");
  }

  recalcPointIndices() {
    this.recalcFlag &= ~QRecalcFlags.INDICES;

    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
      ps[i].index2 = i;
    }

    return this;
  }

  recalcNormals(mesh, l, cd_grid) {
    throw new Error("implement me");
  }

  applyBase(mesh, l, cd_grid) {
    console.error("GridBase.applyBase: Implement me");
  }

  updateMirrorFlags(mesh, loop, cd_grid) {
    console.warn(this.constructor.name + ".updateMirrorFlags: Implement me!");
  }

  initCDLayoutFromLoop(loop) {
    this.customDataLayout.length = 0;
    this.customDatas.length = 0;
    this._max_cd_i = 0;

    for (let i = 0; i < this.cdmap.length; i++) {
      this.cdmap[i] = undefined;
    }

    for (let i = 0; i < this.cdmap_reverse.length; i++) {
      this.cdmap_reverse[i] = undefined;
    }

    let i = 0;

    for (let cd of loop.customData) {
      let cls = cd.constructor;

      this.onNewLayer(cls, i);
      i++;
    }
  }

  /**
   strip any extra temporary data not needed
   in most situations
   */
  stripExtraData() {

  }

  flagNormalsUpdate() {
    this.recalcFlag |= QRecalcFlags.NORMALS;
  }

  flagFixNeighbors() {
    this.recalcFlag |= QRecalcFlags.FIX_NEIGHBORS | QRecalcFlags.NEIGHBORS;
  }

  update(mesh, loop, cd_grid) {
    this.constructor.updateSubSurf(mesh, cd_grid);

    if (this.recalcFlag & QRecalcFlags.REGEN_IDS) {
      this.regenIds(mesh, loop, cd_grid);
    }

    if (GridBase.hasPatchUVLayer(mesh, cd_grid) && (this.recalcFlag & QRecalcFlags.PATCH_UVS)) {
      let cd_uv = GridBase.getPatchUVLayer(mesh, cd_grid);
      this.initPatchUVLayer(mesh, loop, cd_grid, cd_uv);
    }

    if (this.recalcFlag & QRecalcFlags.INDICES) {
      this.recalcFlag &= ~QRecalcFlags.INDICES;

      let ps = this.points;

      for (let i = 0; i < ps.length; i++) {
        ps[i].index = i;
        ps[i].index2 = i;
      }
    }

    if (this.recalcFlag & QRecalcFlags.NEIGHBORS) {
      this.recalcFlag &= ~QRecalcFlags.NEIGHBORS;
      this.recalcNeighbors(mesh, loop, cd_grid);
    }

    if (this.recalcFlag & QRecalcFlags.FIX_NEIGHBORS) {
      this.fixNeighbors(mesh, loop, cd_grid);
    }

    if (this.recalcFlag & QRecalcFlags.NORMALS) {
      this.recalcFlag &= ~QRecalcFlags.NORMALS;
      this.recalcNormals(mesh, loop, cd_grid);
    }
  }

  /** loop is allowed to be undefined, if not is used to init point positions */
  init(dimen, mesh, loop = undefined, cd_grid) {
    throw new Error("implement me");
  }

  onRemoveLayer(layercls, layer_i) {
    let i = this.cdmap[layer_i];

    let i2 = i;
    while (i2 < this.customDatas.length - 1) {
      this.customDatas[i2] = this.customDatas[i2 + 1];
      this.customDataLayout[i2] = this.customDataLayout[i2 + 1];

      i2++;
    }

    this.customDataLayout.length--;
    this.customDatas[i2] = undefined;
    this.customDatas.length--;

    for (let p of this.points) {
      let i2 = i;

      while (i2 < p.customData.length - 1) {
        p.customData[i2] = p.customData[i2 + 1];
        let li = this.cdmap_reverse[i2 + 1];

        if (li !== undefined) {
          this.cdmap[li] = i2;
          this.cdmap_reverse[i2] = li;
        }

        i2++;
      }

      p.customData.length--;
    }
  }

  onNewLayer(layercls, layer_i = undefined) {
    let totpoint = this.points.length;

    if (layer_i !== undefined) {
      this._max_cd_i = Math.max(this._max_cd_i, layer_i);
    } else {
      layer_i = this._max_cd_i;
    }

    if (GridBase.isGridClass(layercls)) {
      return;
    }

    this.cdmap[layer_i] = this.customDatas.length;
    this.cdmap_reverse[this.customDatas.length] = layer_i;

    let cd = [];
    this.customDatas.push(cd);
    this.customDataLayout.push(layercls);

    let ps = this.points;
    for (let i = 0; i < totpoint; i++) {
      let data = new layercls();

      cd.push(data);

      ps[i].customData.length = this._max_cd_i + 1;
      ps[i].customData[layer_i] = data;
    }
  }

  setValue(b) {
    this.copyTo(b);
  }

  copyTo(b, copy_eids = false) {
    let totpoint = this.points.length;

    if (b.points.length === 0) {
      for (let p of this.points) {
        b.points.push(new GridVert());
      }
    }

    this.recalcPointIndices();

    if (!copy_eids) {
      b.recalcFlag = this.recalcFlag | QRecalcFlags.REGEN_IDS;
    }

    //copy customdata layers
    if (b.customDatas.length !== this.customDatas.length) {
      b.cdmap = this.cdmap.concat([]);
      b.cdmap_reverse = this.cdmap_reverse.concat([]);
      b.customDatas.length = 0;

      b.customDataLayout = this.customDataLayout.concat([]);

      let i = 0;
      for (let cl of this.customDatas) {
        let cls = this.customDataLayout[i];
        let cl2 = [];

        if (!cls) {
          cls = this.customDataLayout[i] = cl[0].constructor;
        }

        b.customDatas.push(cl2);

        for (let j = 0; j < cl.length; j++) {
          let data = new cls();

          cl2.push(data);
          cl[i].copyTo(data);
        }

        i++;
      }

      b.relinkCustomData();
    }

    let ps1 = this.points, ps2 = b.points;

    for (let i = 0; i < totpoint; i++) {
      let p1 = ps1[i];
      let p2 = ps2[i];

      p2.load(p1, false);

      if (copy_eids) {
        p2.eid = p1.eid;
        p2.loopEid = p1.loopEid;
      }
    }

    let cd1 = this.customDatas, cd2 = b.customDatas;
    for (let i = 0; i < cd1.length; i++) {
      let c1 = cd1[i];
      let c2 = cd2[i];

      for (let j = 0; j < cd1.length; j++) {
        c1[j].copyTo(c2[j]);
      }
    }

    return this;
  }

  getValue() {
    return this;
  }

  makeDrawTris(mesh, smesh, loop, cd_grid) {
    throw new Error("implement me");
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {//, randmap, bridgeEdges = false) {
    throw new Error("implement me");
  }

  fixNeighbors(mesh, loop, cd_grid) {
    this.recalcFlag &= ~QRecalcFlags.FIX_NEIGHBORS;

    for (let p1 of this.points) {
      for (let p2 of p1.neighbors) {
        let ok = false;

        for (let p3 of p2.neighbors) {
          if (p3 === p1) {
            ok = true;
            break;
          }
        }

        if (!ok) {
          if (p2.neighbors instanceof Set) {
            p2.neighbors.add(p1);
          } else {
            p2.neighbors.push(p1);
          }
        }
      }
    }
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    throw new Error("implement me");
  }

  checkCustomDataLayout(mesh) {
    let namemap = {};

    let layeri = 0, i = 0;
    let bad = false;

    let buckets = new Map();

    i = 0;
    let i2 = 0;

    for (let cls of this.customDataLayout.concat([])) {
      if (GridBase.isGridClass(cls)) {
        console.log("eek, grid class was included in itself");
        bad = true;
      }
      i++;
    }

    let newcds = [];

    for (let cd of this.customDatas) {
      if (!cd || cd.length === 0) {
        continue;
      }
      let cls = cd[0].constructor;

      if (GridBase.isGridClass(cls)) {
        bad = true;
        continue;
      }

      if (!buckets.has(cls)) {
        buckets.set(cls, []);
      }

      buckets.get(cls).push(newcds.length);
      newcds.push(cd);
    }

    let layout = [];
    this.customDataLayout = layout;

    i = 0;
    layeri = 0;
    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);

      if (!GridBase.isGridClass(cls)) {
        this.cdmap_reverse[layout.length] = layeri;
        this.cdmap[layeri] = layout.length;

        layout.push(cls);
        i++;
      }

      layeri++;
    }

    let newcds2 = new Array(layout.length);

    i = 0;
    layeri = 0;
    for (let cls of this.customDataLayout) {
      let bucket = buckets.get(cls);

      if (!bucket || !bucket.length) {
        let cds = [];
        bad = true;

        for (let j = 0; j < this.points.length; j++) {
          cds.push(new cls());
        }

        newcds2[i] = cds;
        i++;
        continue;
      }

      let bi = bucket.shift();

      newcds2[i] = newcds[bi];
      i++;
    }

    this.customDatas = newcds2;

    if (bad) {
      this.relinkCustomData();
    }
  }

  relinkCustomData() {
    let pi = 0;

    for (let p of this.points) {
      p.customData.length = this._max_cd_i;
      for (let i = 0; i < p.customData.length; i++) {
        p.customData[i] = undefined;
      }

      let i = 0;
      for (let cd of this.customDatas) {
        let li = this.cdmap_reverse[i];

        p.customData[li] = cd[pi];
        i++;
      }

      pi++;
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    let ps = this.points;
    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
      ps[i].index2 = i;
    }

    for (let i = 0; i < this.cdmap.length; i++) {
      if (this.cdmap[i] === -1) {
        this.cdmap[i] = undefined;
      }
    }

    for (let i = 0; i < this.cdmap_reverse.length; i++) {
      if (this.cdmap_reverse[i] === -1) {
        this.cdmap_reverse[i] = undefined;
      }
    }

    this._max_cd_i = 0;
    for (let idx of this.cdmap) {
      if (idx !== undefined && idx >= 0) {
        this._max_cd_i = Math.max(this._max_cd_i, idx + 1);
      }
    }

    let layout = [];
    let i = 0;

    for (let i = 0; i < this.customDatas.length; i++) {
      let name = this.customDataLayout[i];

      let cls = name ? CustomDataElem.getTypeClass(name) : undefined;

      if (!cls) {
        cls = this.customDatas[i][0].constructor;
      }

      if (!cls) { //add a dummy class to maintain data structure integrity
        console.error("Warning: unknown customdata type", name, "in multires grids code");
        cls = FloatElem;
      }

      layout.push(cls);
      i++;
    }

    this.customDataLayout = layout;

    this.relinkCustomData();
  }
};

GridBase.STRUCT = nstructjs.inherit(GridBase, CustomDataElem, "mesh.GridBase") + `
  dimen            : int;
  points           : array(mesh.GridVert);
  customDatas      : array(array(abstract(mesh.CustomDataElem)));
  cdmap            : array(e, int) | e !== undefined ? e : -1;
  cdmap_reverse    : array(e, int) | e !== undefined ? e : -1;
  customDataLayout : array(e, string) | e.define().typeName;
}`;
nstructjs.register(GridBase);

let recttemps = new util.cachering(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], 64);

export class Grid extends GridBase {
  constructor() {
    super();

    this.dimen = gridSides[2];
  }

  static define() {
    return {
      elemTypeMask : MeshTypes.LOOP, //see MeshTypes in mesh.js
      typeName     : "grid",
      uiTypeName   : "Grid",
      defaultName  : "grid",
      settingsClass: GridSettings,
      //needsSubSurf : true,
      valueSize    : undefined,
      flag         : 0
    }
  };

  applyBase(mesh, l, cd_grid) {
    let dimen = this.dimen;
    let x = dimen - 1, y = dimen - 1;

    let idx = y*dimen + x;
    l.v.load(this.points[idx]);
  }

  updateMirrorFlags(mesh, loop, cd_grid) {
  }

  getQuad(loop) {
    let ret = recttemps.next();

    ret[0].load(loop.f.cent);
    ret[1].load(loop.v).interp(loop.prev.v, 0.5);
    ret[2].load(loop.v);
    ret[3].load(loop.v).interp(loop.next.v, 0.5);

    return ret;
  }

  init(dimen, mesh, loop, cd_grid) {
    if (dimen !== this.dimen) {
      this.points.length = 0;
      this.dimen = dimen;
    }
    let totpoint = dimen*dimen;

    if (loop !== undefined) {
      if (this.points.length === 0) {
        for (let i = 0; i < totpoint; i++) {
          this.points.push(new GridVert(i, loop.eid, mesh.eidgen.next()));
        }
      }

      let quad = this.getQuad(loop);

      let a = new Vector3();
      let b = new Vector3();

      for (let iu = 0; iu < dimen; iu++) {
        let u = (iu)/(dimen - 1);

        for (let iv = 0; iv < dimen; iv++) {
          let v = (iv)/(dimen - 1);
          let idx = iv*dimen + iu;

          let p = this.points[idx];

          a.load(quad[0]).interp(quad[1], v);
          b.load(quad[3]).interp(quad[2], v);

          p.load(a).interp(b, u);
        }
      }

      if (this.customDataLayout.length === 0) {
        this.initCDLayoutFromLoop(loop);
      }

      this.flagNormalsUpdate();
    }

    this.relinkCustomData();

    return this;
  }

  _ensure(mesh, loop, cd_grid) {
    if (this.points.length === 0) {
      //try to get grid dimen
      for (let l of mesh.loops) {
        if (l !== loop) {
          let grid = l.customData[cd_grid];
          this.dimen = grid.dimen;
          break;
        }
      }

      this.init(this.dimen, mesh, loop, cd_grid);

      let layeri = 0;

      console.log("INIT", this);

      this.customDatas.length = 0;

      for (let layer of mesh.loops.customData.flatlist) {
        let cls = CustomDataElem.getTypeClass(layer.typeName);

        this.onNewLayer(cls, layeri++);
      }
    }
  }

  makeDrawTris(mesh, smesh, loop, cd_grid) {
    this._ensure(mesh, loop, cd_grid);

    this.update(mesh, loop, cd_grid);

    this.totTris = 0;

    let quad = this.getQuad(loop);
    let dimen = this.dimen;

    let chunkmode = smesh instanceof ChunkedSimpleMesh;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");
    let have_uvs = cd_uv >= 0;

    let ps = this.points;
    let uvs = have_uvs ? this.customDatas[this.cdmap[cd_uv]] : undefined;
    let eid = loop.f.eid;

    let id = loop.eid*dimen*dimen*2;

    let n = new Vector3();

    let dt = 1.0/(dimen - 1);

    for (let x = 0; x < dimen - 1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let u = x/(dimen - 1) + dt*0.5;
        let v = y/(dimen - 1) + dt*0.5;

        let i1 = y*dimen + x;
        let i2 = ((y + 1)*dimen + x);
        let i3 = ((y + 1)*dimen + x + 1);
        let i4 = (y*dimen + x + 1);

        let tri;

        if (chunkmode) {
          tri = smesh.tri(id + i1*2, ps[i1], ps[i2], ps[i3], ps[i4]);
        } else {
          tri = smesh.tri(ps[i1], ps[i2], ps[i3], ps[i4]);
        }

        this.totTris += 2;

        if (0 && this.subsurf) {
          this.subsurf.evaluate(u, v, undefined, undefined, n);
        } else {
          n.load(ps[i1].no).add(ps[i2].no).add(ps[i3].no).add(ps[i4].no).normalize();
        }

        //let n = math.normal_tri(ps[i1], ps[i2], ps[i3]);

        tri.normals(n, n, n);
        if (uvs) {
          tri.uvs(uvs[i1].uv, uvs[i2].uv, uvs[i3].uv);
        }
        tri.ids(eid, eid, eid);

        //*
        if (chunkmode) {
          tri = smesh.tri(id + i1*2 + 1, ps[i1], ps[i3], ps[i4]);
        } else {
          tri = smesh.tri(ps[i1], ps[i3], ps[i4]);
        }

        tri.normals(n, n, n);

        if (uvs) {
          tri.uvs(uvs[i1].uv, uvs[i3].uv, uvs[i4].uv);
        }
        tri.ids(eid, eid, eid);
        //*/
      }
    }
  }

  recalcNormals(mesh, loop, cd_grid) {
    //return;
    let dimen = this.dimen;
    let ps = this.points;
    let n = new Vector3();

    for (let p of this.points) {
      p.no.zero();
    }

    for (let x = 0; x < dimen - 1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y*dimen + x;
        let i2 = ((y + 1)*dimen + x);
        let i3 = ((y + 1)*dimen + x + 1);
        let i4 = (y*dimen + x + 1);

        let p1 = ps[i1];
        let p2 = ps[i2];
        let p3 = ps[i3];
        let p4 = ps[i4];

        let dx1 = p2[0] - p1[0];
        let dy1 = p2[1] - p1[1];
        let dz1 = p2[2] - p1[2];

        let dx2 = p3[0] - p1[0];
        let dy2 = p3[1] - p1[1];
        let dz2 = p3[2] - p1[2];

        let nx = dy1*dz2 - dz1*dy2;
        let ny = dz1*dx2 - dx1*dz2;
        let nz = dx1*dy2 - dy1*dx2;

        let l = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (l > 0.0001) {
          nx /= l;
          ny /= l;
          nz /= l;
        }
        //n.load(math.normal_tri(p1, p2, p3)).add(math.normal_tri(p1, p3, p4)).normalize();

        p1.no[0] += nx;
        p1.no[1] += ny;
        p1.no[2] += nz;

        p2.no[0] += nx;
        p2.no[1] += ny;
        p2.no[2] += nz;

        p3.no[0] += nx;
        p3.no[1] += ny;
        p3.no[2] += nz;

        p4.no[0] += nx;
        p4.no[1] += ny;
        p4.no[2] += nz;
      }
    }

    for (let p of this.points) {
      p.no.normalize();
    }
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    for (let p of this.points) {
      p.neighbors.length = 0;
      p.loopEid = loop.eid;

      p.bRingRemove();
    }

    let ps = this.points, dimen = this.dimen;

    let l = loop;
    let lp = l.prev, ln = l.next;
    let lr = l.radial_next;
    let lrp = lr.prev, lrn = lr.next;
    let lpr = l.prev.radial_next, lnr = l.next.radial_next;

    let lmap = {
      [NeighborKeys.L]  : l,
      [NeighborKeys.LP] : lp,
      [NeighborKeys.LN] : ln,
      [NeighborKeys.LR] : lr,
      [NeighborKeys.LRP]: lrp,
      [NeighborKeys.LRN]: lrn,
      [NeighborKeys.LPR]: lpr,
      [NeighborKeys.LNR]: lnr
    };

    let map = getNeighborMap(this.dimen);
    for (let i = 0; i < this.dimen; i++) {
      for (let c of map.cases) {
        let l1mask = c.l1, l2mask = c.l2;
        let l1 = lmap[l1mask];
        let l2 = lmap[l2mask];

        let ret = map.resolve(i, l1, l2, l1mask, l2mask);
        let x1 = ret.x1, y1 = ret.y1, x2 = ret.x2, y2 = ret.y2;

        let ps2 = l2.customData[cd_grid].points;

        let i1 = y1*dimen + x1;
        let i2 = y2*dimen + x2;

        if (!ps2 || !ps2[i2]) {
          continue;
        }

        //*
        ps[i1].bLink = new BLink(ps2[i2]);

        if (!ps2[i2].bLink) {
          ps2[i2].bLink = new BLink(ps[i1]);
        }

        //*/

        //ps2[i2] = ps[i1];
        //ps[i1] = ps2[i2];

        //ps[i1].neighbors.push(ps2[i2]);
      }
    }

    for (let i = 0; i < dimen; i++) {
      for (let j = 0; j < dimen; j++) {
        let i1 = j*dimen + i;

        if (j < dimen - 1) {
          let i2 = (j + 1)*dimen + i;
          ps[i1].neighbors.push(ps[i2]);
        }

        if (j > 0) {
          let i3 = (j - 1)*dimen + i;
          ps[i1].neighbors.push(ps[i3]);
        }

        if (i < dimen - 1) {
          let i4 = j*dimen + i + 1;
          ps[i1].neighbors.push(ps[i4]);
        }

        if (i > 0) {
          let i5 = j*dimen + i - 1;
          ps[i1].neighbors.push(ps[i5]);
        }
      }
    }
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {// randmap, bridgeEdges = false) {
    this._ensure(mesh, loop, cd_grid);

    this.totTris = 0;

    this.update(mesh, loop, cd_grid);

    let dimen = this.dimen;

    let id = loop.eid*((this.dimen + 1)*(this.dimen + 1))*2;//+4*this.dimen)*2;

    let feid = loop.f.eid;
    let ps = this.points;

    let map = getNeighborMap(this.dimen);

    let l = loop;
    let lp = l.prev, ln = l.next;
    let lr = l.radial_next;
    let lrp = lr.prev, lrn = lr.next;
    let lpr = l.prev.radial_next, lnr = l.next.radial_next;

    let lmap = {
      [NeighborKeys.L]  : l,
      [NeighborKeys.LP] : lp,
      [NeighborKeys.LN] : ln,
      [NeighborKeys.LR] : lr,
      [NeighborKeys.LRP]: lrp,
      [NeighborKeys.LRN]: lrn,
      [NeighborKeys.LPR]: lpr,
      [NeighborKeys.LNR]: lnr
    };

    //if (bridgeEdges) {
    //  return;
    //}
    if (0) { //bridgeEdges) {
      let cases = [
        {l1: NeighborKeys.L, l2: NeighborKeys.LP},
        {l1: NeighborKeys.L, l2: NeighborKeys.LPR}
      ];

      id += dimen*dimen*2;
      let ci = 0;

      for (let c of cases) {
        for (let i = 0; i < dimen - 1; i++) {
          let l1 = lmap[c.l1];
          let l2 = lmap[c.l2];

          let ps1 = l1.customData[cd_grid].points;
          let ps2 = l2.customData[cd_grid].points;

          let ret = map.resolve(i, l1, l2, c.l1, c.l2);
          let i1 = ret.y1*dimen + ret.x1;
          let i2 = ret.y2*dimen + ret.x2;

          ret = map.resolve(i + 1, l1, l2, c.l1, c.l2);
          let i3 = ret.y1*dimen + ret.x1;
          let i4 = ret.y2*dimen + ret.x2;

          let id2 = id + i*2;

          //id2 = Math.random();

          //bvh.addTri(feid, id2, ps1[i1], ps2[i2], ps2[i4]);
          //bvh.addTri(feid, id2+1, ps1[i1], ps2[i4], ps1[i3]);

          if (ci === 0) {
            //bvh.addTri(feid, id2, ps1[i1], ps2[i2], ps2[i4]);
            //bvh.addTri(feid, id2 + 1, ps1[i1], ps2[i4], ps1[i3]);

            /*
            trisout.push(feid);
            trisout.push(id2);
            trisout.push(ps1[i1]);
            trisout.push(ps2[i2]);
            trisout.push(ps2[i4]);

            trisout.push(feid);
            trisout.push(id2+1);
            trisout.push(ps1[i1]);
            trisout.push(ps2[i4]);
            trisout.push(ps1[i3]);

             //*/
          } else {
            //bvh.addTri(feid, id2, ps2[i4], ps2[i2], ps1[i1]);
            //bvh.addTri(feid, id2 + 1, ps1[i3], ps2[i4], ps1[i1]);
            /*
            trisout.push(feid);
            trisout.push(id2);
            trisout.push(ps2[i4]);
            trisout.push(ps2[i2]);
            trisout.push(ps1[i1]);
            //*/

            /*
            trisout.push(feid);
            trisout.push(id2+1);
            trisout.push(ps1[i3]);
            trisout.push(ps2[i4]);
            trisout.push(ps1[i1]);
            */
          }
        }

        id += dimen*2;
        ci++;
      }

      return;
    }

    //return;

    let rilen = (dimen - 1)*(dimen - 1);

    for (let ri = 0; ri < rilen; ri++) {
      let x = ri%(dimen - 1);
      let y = ~~(ri/(dimen - 1));

      let i1 = y*dimen + x;
      let i2 = ((y + 1)*dimen + x);
      let i3 = ((y + 1)*dimen + x + 1);
      let i4 = (y*dimen + x + 1);

      let id2 = id + i1*2;

      //id2 = Math.random();

      trisout.push(feid);
      trisout.push(id2);
      trisout.push(ps[i1]);
      trisout.push(ps[i2]);
      trisout.push(ps[i3]);

      trisout.push(feid);
      trisout.push(id2 + 1);
      trisout.push(ps[i1]);
      trisout.push(ps[i3]);
      trisout.push(ps[i4]);

      this.totTris += 2;

      //bvh.addTri(feid, id2, ps[i1], ps[i2], ps[i3]);
      //bvh.addTri(feid, id2 + 1, ps[i1], ps[i3], ps[i4]);
    }
    /*
    for (let x=0; x<dimen-1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

        let id2 = id + i1*2;

        bvh.addTri(feid, id2, ps[i1], ps[i2], ps[i3]);
        bvh.addTri(feid, id2+1, ps[i1], ps[i3], ps[i4]);
      }
    }

    //*/
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

Grid.STRUCT = nstructjs.inherit(Grid, GridBase, "mesh.Grid") + `
}`;
nstructjs.register(Grid);
CustomDataElem.register(Grid);
