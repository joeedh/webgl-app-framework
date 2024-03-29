import {CDElemArray, MeshFlags, MeshTypes, RecalcFlags} from "./mesh_base.js";
import {
  CDFlags,
  CustomData,
  CustomDataElem,
  CustomDataLayer,
  ICustomDataElemConstructor,
  LayerSettingsBase
} from "./customdata";
import {ChunkedSimpleMesh, LayerTypes, SimpleMesh} from "../core/simplemesh.js";
import {AttrRef, ColorLayerElem, FloatElem, UVLayerElem} from "./mesh_customdata.js";
import {PatchBuilder} from "./mesh_grids_subsurf.js";
import {BasicLineShader, Shaders} from '../shaders/shaders.js';
import {Handle, Loop, traceget, traceset, Vertex} from './mesh_types.js';

import {
  Vector2, Vector3, Vector4, Quat, Matrix4, util,
  math, nstructjs
} from '../path.ux/scripts/pathux.js';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import {Mesh} from "./mesh";
import type {SceneObject} from "../sceneobject/sceneobject";
import {BVH, IBVHVertex} from "../util/bvh";

let blink_rets = util.cachering.fromConstructor(Vector3, 64);
let blink_rets4 = util.cachering.fromConstructor(Vector4, 64);
let tmptanmat = new Matrix4();
let uvstmp = new Array(4);
for (let i = 0; i < 4; i++) {
  uvstmp[i] = new Vector2();
}
import '../util/polyfill.d.ts';
import {WebGLUniforms} from "../../types/scripts/core/webgl";

let stmp1 = new Vector3(), stmp2 = new Vector3();

export enum QRecalcFlags {
  NONE = 0,
  POLYS = 1 << 0,
  TOPO = 1 << 1,
  POINT_PRUNE = 1 << 2,
  NEIGHBORS = 1 << 3,
  MIRROR = 1 << 4,
  CHECK_CUSTOMDATA = 1 << 5,
  POINTHASH = 1 << 6,
  VERT_NORMALS = 1 << 7,
  NODE_NORMALS = 1 << 8,
  NORMALS = (1 << 7) | (1 << 8),
  INDICES = 1 << 9,
  LEAF_POINTS = 1 << 10,
  LEAF_NODES = 1 << 11,
  LEAVES = (1 << 10) | (1 << 11),
  PATCH_UVS = 1 << 12, //not part of ALL
  REGEN_IDS = 1 << 13, //most definitely not part of ALL
  REGEN_EIDMAP = 1 << 14, //not part of ALL
  FIX_NEIGHBORS = 1 << 15,
  NODE_DEPTH_DELTA = 1 << 16,
  ALL = 1 | 2 | 4 | 8 | 64 | 128 | 256 | (1 << 9) | (1 << 10) | (1 << 11),
  EVERYTHING = (1 << 16) - 1
};

export enum GridSettingFlags {
  SELECT = 1,
  ENABLE_DEPTH_LIMIT = 2,
}

export class GridSettings extends LayerSettingsBase {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.GridSettings {
  flag       : int;
  depthLimit : int;
}
  `);

  flag: number;
  depthLimit: number;
  _last_subsurf_key: string;
  _last_coords_hash: string;

  constructor() {
    super();

    this.flag = 0;
    this.depthLimit = 2;

    this._last_subsurf_key = "";
    this._last_coords_hash = "";
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

export class BLink<GridVertType extends GridVertBase<any>> {
  v1: GridVertType;
  v2?: GridVertType;
  t: number;

  constructor(a: GridVertType, b?: GridVertType, t = 0.5) {
    this.v1 = a;
    this.v2 = b;
    this.t = t;
  }

  get() {
    let ret = blink_rets.next();

    if (this.v2) {
      ret.load(this.v1.co).interp(this.v2.co, this.t);
    } else {
      ret.load(this.v1.co);
    }

    return ret;
  }

  getColor(cd_color: number): Vector4 {
    let ret = blink_rets4.next();

    let c1 = this.v1.customData.get<ColorLayerElem>(cd_color).color;
    if (this.v2) {
      let c2 = this.v2.customData.get<ColorLayerElem>(cd_color).color;

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
  L: 1, //loop
  LP: 2, //loop.prev
  LN: 4, //loop.next
  LR: 8, //loop.radial_next
  LRP: 16, //loop.radial_next.prev
  LRN: 32, //loop.radial_next.prev
  LPR: 64, //loop.prev.radial_next
  LNR: 128, //loop.next.radial_next
};

export class ResolveValue {
  x1 = 0;
  y1 = 0;
  x2 = 0;
  y2 = 0;
}

let resolve_rets = util.cachering.fromConstructor(ResolveValue, 512);

export class NeighborMap {
  dimen: number;
  maps: {
    [p: number]: ((number | number)[] | undefined[] | (number | number)[])[] | ((number | number)[] | (number | number)[] | (undefined | number)[])[]
  };
  cases: ({ l1: number; l2: number; mask: number } | { l1: number; l2: number; mask: number })[];

  constructor(dimen) {
    this.dimen = dimen;

    let masks = {
      l: 1,
      lp: 2,
      ln: 4,
      lr: 8,
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

      [lmask("l", "lp")]: [[0, IDX], [undefined, undefined], [IDX, 0]],
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

export class GridVertBase<NeighborList> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.GridVert {
  no         : array(short) | this._saveShortNormal();
  co         : vec3;
  flag       : int;
  eid        : int;
  uv         : vec2;
}`);

  flag: number;
  eid: number;
  index: number;
  index2: number;
  loopEid: number;
  customData: CDElemArray;
  cd: CDElemArray; //alias to this.customData

  co: Vector3;
  no: Vector3;
  tan: Vector3;
  bin: Vector3;
  sco: Vector3;
  totsco: number;
  tot: number;
  uv: Vector2;

  neighbors: NeighborList;
  bRingSet: Set<GridVertBase<NeighborList>>;
  bLink?: BLink<this>;
  bNext?: GridVertBase<NeighborList>;
  bPrev?: GridVertBase<NeighborList>;

  constructor(index = 0, loopEid = -1, eid = -1) {
    //this.co = new Vector3();

    this.co = new Vector3();
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
    this.customData = this.cd = new CDElemArray();
    this.createNeighborList();

    this.bRingSet = new Set();

    this.bLink = undefined;
    this.bNext = this.bPrev = undefined; //boundary next/prev
  }

  createNeighborList() {
  }

  get bRing(): Iterable<GridVertBase<NeighborList>> {
    return this.bRingSet;
  }

  static getMemSize(p: GridVertBase<Array<any>>): number {
    let tot = 21 * 8;

    tot += 4 * 3 * 8 + 2 * 8;
    if (p) {
      tot += p.neighbors.length * 8 + p.bRingSet.size * 8;
    }

    return tot;
  }

  startTan(): void {
    this.tot = 0;
    this.tan.zero();
    this.bin.zero();
  }

  tanMulFac(depth: number): number {
    let dimen = gridSides[depth] - 1;

    return Math.pow(2.0, depth);
  }

  finishTan(): void {
    if (this.tot > 0) {
      this.tan.mulScalar(1.0 / this.tot);
      this.bin.mulScalar(1.0 / this.tot);
    }

    //this.tan.normalize();
    //this.bin.normalize();
  }

  addTan(ns, ni, pidx) {
    //this.tot++;
  }

  bRingInsert(v: GridVertBase<NeighborList>): void {
    if (!v) {
      console.warn("bRingInsert called in error; v:", v);
      throw new Error("bRingInsert called with undefined v parameter");
    }

    this.bRingSet.add(v);
    v.bRingSet.add(this);

    /*
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
    */
  }

  bRingRemove(): void {
    for (let v2 of this.bRingSet) {
      v2.bRingSet.delete(this);
    }
    this.bRingSet = new Set();

    /*
    if (this.bNext === this) {
      this.bNext = this.bPrev = undefined;
      return;
    }

    if (this.bNext) {
      this.bNext.bPrev = this.bPrev;
      this.bPrev.bNext = this.bNext;
    }

    this.bNext = this.bPrev = undefined;
    */
  }

  load(b: IBVHVertex | Vector3, coOnly = true) {
    if (!b) {
      return;
    }

    let bco: Vector3;

    /* XXX why do I have to erase the type for
       checking if b is an instance of Vertex/Handle but
       not GridVert or Vector3?
     */
    let erased = b as unknown as any;
    if (erased instanceof GridVertBase || erased instanceof Vertex || erased instanceof Handle) {
      bco = erased.co;
    } else if (b instanceof Vector3) {
      bco = b;
    }

    this.co.load(bco);

    if (!coOnly && b instanceof GridVertBase) {
      b.no.load(this.no);
      b.flag = this.flag;
    }

    return this;
  }

  _saveShortNormal(): number[] {
    let n1 = this.no;
    let n2 = shortNormalRet;

    n2[0] = ~~(n1[0] * 32765);
    n2[1] = ~~(n1[1] * 32765);
    n2[2] = ~~(n1[2] * 32765);

    return n2;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    this.no = new Vector3(this.no);
    this.no.mulScalar(1.0 / 32765);
  }
}

export function genGridDimens(depth = 32) {
  let dimen = 2;
  let ret = [2];

  for (let i = 0; i < depth; i++) {
    dimen = (dimen - 1) * 2 + 1;
    ret.push(dimen);
  }

  return ret;
}

export const gridSides = genGridDimens();

export interface IGridDef {
  elemTypeMask: MeshTypes;
  typeName: string;
  uiTypeName?: string;
  defaultName?: string;
  settingsClass: new() => GridSettings;
  needsSubSurf?: boolean;
  valueSize?: number;
  flag: number;

}

export interface IGridConstructor<GridClass = any> {
  new(): GridClass;

  define(): IGridDef;

  updateSubSurf(mesh: Mesh, cd_grid: AttrRef<GridBase>, checkCoords?: boolean): void;
}

export class GridVert extends GridVertBase<GridVert[]> {
  createNeighborList() {
    this.neighbors = [];
  }
}

export class GridBase<GridVertType extends GridVertBase<any> = GridVert> extends CustomDataElem<any> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.GridBase {
  dimen            : int;
  points           : array(mesh.GridVert);
  customDatas      : array(array(abstract(mesh.CustomDataElem)));
  cdmap            : array(e, int) | e !== undefined ? e : -1;
  cdmap_reverse    : array(e, int) | e !== undefined ? e : -1;
  customDataLayout : array(e, string) | e.define().typeName;
}`);

  cdmap: number[];
  cdmap_reverse: number[];
  recalcFlag: QRecalcFlags;
  totTris: number;
  dimen: number;
  customDataLayout: ICustomDataElemConstructor[];
  points: GridVertType[];
  customDatas: CDElemArray[];
  eidMap: Map<number, GridVertType>;
  needsSubSurf: boolean;
  subsurf?: any;

  ['constructor']: IGridConstructor<this>;

  _max_cd_i: number = 0;

  constructor() {
    super();

    this.onNewLayer = this._onNewLayer.bind(this);
    this.onRemoveLayer = this._onRemoveLayer.bind(this);

    this.cdmap = new Array(64);
    this.cdmap_reverse = new Array(64);
    this._max_cd_i = 0;

    this.recalcFlag = QRecalcFlags.ALL | QRecalcFlags.NORMALS;

    this.totTris = 0;

    this.dimen = 0;
    this.customDataLayout = [];
    this.points = [];
    this.customDatas = [];

    this.eidMap = undefined;

    this.needsSubSurf = false;
    this.subsurf = undefined; //subsurf patch
  }

  static updateSubSurf(mesh: Mesh, cd_grid: AttrRef<GridBase>, check_coords = false) {
    if (!(this as IGridConstructor).define().needsSubSurf) {
      return;
    }

    let mres = cd_grid.layerInfo(mesh.loops.customData).getTypeSettings() as GridSettings;
    let key = "" + mesh.eidgen.cur;

    key += ":" + mesh.verts.length + ":" + mesh.edges.length + ":" + mesh.faces.length;

    if (check_coords || mres._last_coords_hash.length === 0) {
      let hash = new util.HashDigest();
      for (let v of mesh.verts) {
        hash.add(v[0]);
        hash.add(v[1]);
        hash.add(v[2]);
      }

      mres._last_coords_hash = "" + hash.get();
    }

    key += ":" + mres._last_coords_hash;

    if (key !== mres._last_subsurf_key) {
      mres._last_subsurf_key = key;
      console.error("Subsurf update!", key);

      this.recalcSubSurf(mesh, cd_grid);
    }
  }

  static recalcSubSurf(mesh: Mesh, cd_grid: AttrRef<GridBase>): void {
    let builder = new PatchBuilder(mesh, cd_grid);
    builder.build();

    for (let l of mesh.loops) {
      let grid = cd_grid.get(l);
      grid.subsurf = builder.patches.get(l);
    }
  }

  static patchUVLayerName(mesh: Mesh, cd_grid: AttrRef<GridBase>): string {
    return "_" + cd_grid.i + "_patch_uv";
  }

  static hasPatchUVLayer(mesh: Mesh, cd_grid: AttrRef<GridBase>): boolean {
    return mesh.loops.customData.hasNamedLayer(this.patchUVLayerName(mesh, cd_grid), "uv");
  }

  static getPatchUVLayer(mesh: Mesh, cd_grid: AttrRef<GridBase>): number {
    let name = this.patchUVLayerName(mesh, cd_grid);

    let layer = mesh.loops.customData.getNamedLayer(name, "uv");
    if (layer !== undefined) {
      return layer.index;
    }

    layer = mesh.loops.addCustomDataLayer("uv", name);
    layer.flag |= CDFlags.TEMPORARY;

    let cd_uv = layer.index;
    for (let l of mesh.loops) {
      let grid = cd_grid.get(l);

      grid.initPatchUVLayer(mesh, l, cd_grid, cd_uv);
    }
  }

  static isGridClass(cls: any): boolean {
    if (typeof cls !== "function") {
      console.warn("Invalid argument to isGridClass:", cls);
      throw new Error("Invalid argument to isGridClass: " + cls);
    }

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

  static syncVertexLayers(mesh: Mesh): void {
    if (this.meshGridRef(mesh).i === -1) {
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

  static meshGridRef<FinalType extends GridBase = GridBase>(mesh: Mesh): AttrRef<FinalType> {
    return new AttrRef<FinalType>(this.meshGridOffset(mesh));
  }

  static meshGridOffset(mesh: Mesh): number {
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

  static calcCDLayout(mesh: Mesh) {
    let cdlayers: [number, ICustomDataElemConstructor][] = [];
    let i = 0;

    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      let ok = cls !== undefined;

      ok = ok && !(GridBase.isGridClass(cls));

      if (ok) {
        cdlayers.push([i, cls]);
      }

      i++;
    }

    return cdlayers;
  }

  static initMesh(mesh: Mesh, dimen: number, cd_grid = this.meshGridRef(mesh)) {
    if (!cd_grid.exists) {
      mesh.loops.addCustomDataLayer(this, this.define().typeName);
      cd_grid = mesh.loops.customData.getLayerRef<GridBase>(this);
    }

    //static updateSubSurf(mesh, cd_grid, check_coords=false) {

    this.updateSubSurf(mesh, cd_grid, true);

    for (let l of mesh.loops) {
      let grid = cd_grid.get(l);

      grid.init(dimen, mesh, l, cd_grid);
    }

    mesh.regenRender();
    mesh.regenElementsDraw();
  }

  regenEIDMap(): void {
    this.recalcFlag |= QRecalcFlags.REGEN_EIDMAP;
  }

  getEIDMap(mesh: Mesh): Map<number, GridVertType> {
    if (this.eidMap && !(this.recalcFlag & QRecalcFlags.REGEN_EIDMAP)) {
      return this.eidMap;
    }

    this.recalcFlag &= ~QRecalcFlags.REGEN_EIDMAP;
    let eidMap = this.eidMap = new Map();

    for (let p of this.points) {
      if (p.eid < 0) {
        p.eid = mesh.eidgen.next();
      }

      eidMap.set(p.eid, p);
    }

    return eidMap;
  }

  calcMemSize(): number {
    let tot = 128 * 8 + 10 * 8;

    if (this.points.length === 0) {
      return tot;
    }

    let p = this.points[0];
    for (let cd of p.customData) {
      tot += cd.calcMemSize() * this.points.length;
    }

    for (let p of this.points) {
      tot += GridVert.getMemSize.call(p.constructor as unknown as any, p);
    }

    return tot;
  }

  regenIds(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
    this.recalcFlag &= ~QRecalcFlags.REGEN_IDS;

    for (let p of this.points) {
      p.eid = mesh.eidgen.next();
    }
  }

  flagIdsRegen(): void {
    this.recalcFlag |= QRecalcFlags.REGEN_IDS;
  }

  subdivideAll(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
    console.warn(this.constructor.name + ".prototype.subdivideAll(): implement me!");
  }

  tangentToGlobal(depthLimit: number, inverse = false): void {
    console.warn(this.constructor.name + ".prototype.tangentToGlobal(): implement me!");
  }

  globalToTangent(depthLimit: number) {
    return this.tangentToGlobal(depthLimit, true);
  }

  initPatchUVLayer(mesh: Mesh, l: Loop, cd_grid: AttrRef<this>, cd_uv: number) {
    console.warn("initPatchUVLayer: implement me!");
  }

  recalcPointIndices(): this {
    this.recalcFlag &= ~QRecalcFlags.INDICES;

    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
      ps[i].index2 = i;
    }

    return this;
  }

  recalcNormals(mesh: Mesh, l: Loop, cd_grid: AttrRef<this>): void {
    throw new Error("implement me");
  }

  applyBase(mesh: Mesh, l: Loop, cd_grid: AttrRef<this>): void {
    console.error("GridBase.applyBase: Implement me");
  }

  debugDraw(gl: WebGL2RenderingContext, uniforms: { [k: string]: any }, ob: SceneObject): void {

  }

  updateMirrorFlags(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
    console.warn(this.constructor.name + ".updateMirrorFlags: Implement me!");
  }

  initCDLayoutFromLoop(loop: Loop): void {
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
  stripExtraData(): void {

  }

  flagNormalsUpdate(): void {
    this.recalcFlag |= QRecalcFlags.NORMALS;
  }

  flagFixNeighbors(): void {
    this.recalcFlag |= QRecalcFlags.FIX_NEIGHBORS | QRecalcFlags.NEIGHBORS;
  }

  update(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
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
  init(dimen: number, mesh: Mesh, loop: Loop | undefined, cd_grid: AttrRef<this>): void {
    throw new Error("implement me");
  }

  private _onRemoveLayer(layercls: new() => this, layer_i: number): void {
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

  /* We kind of abuse the onNewLayer callback for non-grid attributes */
  private _onNewLayer(_layercls: new() => this, layer_i?: number) {
    let totpoint = this.points.length;

    if (layer_i !== undefined) {
      this._max_cd_i = Math.max(this._max_cd_i, layer_i);
    } else {
      layer_i = this._max_cd_i;
    }

    if (GridBase.isGridClass(_layercls)) {
      return;
    }

    const layercls = _layercls as unknown as ICustomDataElemConstructor;

    this.cdmap[layer_i] = this.customDatas.length;
    this.cdmap_reverse[this.customDatas.length] = layer_i;

    let cd = new CDElemArray();
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

  setValue(b: this) {
    this.copyTo(b);
  }

  createPoint(): GridVertType {
    return new GridVert() as unknown as GridVertType;
  }

  copyTo(b: this, copy_eids = false): void {
    let totpoint = this.points.length;

    if (b.points.length === 0) {
      for (let p of this.points) {
        b.points.push(this.createPoint());
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
        let cl2 = new CDElemArray();

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
  }

  getValue() {
    return this;
  }

  makeDrawTris(mesh: Mesh, smesh: SimpleMesh, loop: Loop, cd_grid: AttrRef<this>): void {
    throw new Error("implement me");
  }

  makeBVHTris(mesh: Mesh, bvh: BVH, loop: Loop, cd_grid: AttrRef<this>, trisout: any[]): void {//, randmap, bridgeEdges = false) {
    throw new Error("implement me");
  }

  fixNeighbors(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
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

  recalcNeighbors(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
    throw new Error("implement me");
  }

  checkCustomDataLayout(mesh: Mesh): void {
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

  relinkCustomData(): void {
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

  loadSTRUCT(reader: StructReader<this>): void {
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
      let name = this.customDataLayout[i] as unknown as string;

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
}


let recttemps = new util.cachering(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], 64);

export class Grid extends GridBase {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Grid {
}`);

  static define(): IGridDef {
    return {
      elemTypeMask: MeshTypes.LOOP, //see MeshTypes in mesh.js
      typeName: "grid",
      uiTypeName: "Grid",
      defaultName: "grid",
      settingsClass: GridSettings,
      needsSubSurf: true,
      valueSize: undefined,
      flag: 0
    }
  };

  constructor() {
    super();

    this.dimen = gridSides[7];
  }

  hash() {
    return 0;
  }

  debugDraw(gl: WebGL2RenderingContext, uniforms: WebGLUniforms, ob: SceneObject): void {
    let lt = LayerTypes;
    let smesh = new SimpleMesh(lt.LOC | lt.UV | lt.COLOR);

    let v1 = new Vector3();
    let v2 = new Vector3();
    let no = new Vector3();
    let du = new Vector3();
    let dv = new Vector3();
    let color1 = [0, 0, 1, 1];
    let color2 = [0, 1, 0, 1];
    let color3 = [1, 0, 0, 1];

    for (let p of this.points) {
      let co = p.co;
      //no.load(p.no);

      co = this.subsurf.evaluate(p.uv[0], p.uv[1], du, dv, no);

      if (window.DTST2) {
        let df = 0.4;
        let du2: Vector3, dv2: Vector3;
        let [u, v] = p.uv;
        let ss = this.subsurf;

        if (v < 1.0 - df) {
          dv2 = ss.evaluate(u, v + df, undefined, undefined, undefined);
          dv2.sub(ss.evaluate(u, v - df, undefined, undefined, undefined));
          dv2.mulScalar(1.0 / (df * 2.0));
        } else {
          dv2 = ss.evaluate(u, v, undefined, undefined, undefined);
          dv2.sub(ss.evaluate(u, v - df, undefined, undefined, undefined));
          dv2.mulScalar(1.0 / df);
        }

        dv.load(dv2);

        if (u < 1.0 - df) {
          du2 = ss.evaluate(u + df, v, undefined, undefined, undefined);
          du2.sub(ss.evaluate(u - df, v, undefined, undefined, undefined));
          du2.mulScalar(1.0 / (df * 2.0));
        } else {
          du2 = ss.evaluate(u, v, undefined, undefined, undefined);
          du2.sub(ss.evaluate(u - df, v, undefined, undefined, undefined));
          du2.mulScalar(1.0 / df);
        }

        du.load(du2);

        no.load(dv).cross(du).normalize();
      }

      v1.load(co).addFac(no, 0.0025);

      //no.load(du).cross(dv).normalize();

      v2.load(v1).addFac(no, 0.025);

      let line = smesh.line(v1, v2);
      line.uvs(p.uv, p.uv);
      line.colors(color1, color1);

      du.normalize();
      dv.normalize();

      let fac = 0.1;
      v2.load(v1).addFac(du, 0.025 * fac);
      line = smesh.line(v1, v2);
      line.uvs(p.uv, p.uv);
      line.colors(color2, color2);

      v2.load(v1).addFac(dv, 0.025 * fac);
      line = smesh.line(v1, v2);
      line.uvs(p.uv, p.uv);
      line.colors(color3, color3);

    }

    smesh.draw(gl, uniforms, Shaders.BasicLineShader);

    smesh.destroy(gl);
  }

  applyBase(mesh: Mesh, l: Loop, cd_grid: AttrRef<this>): void {
    let dimen = this.dimen;
    let x = dimen - 1, y = dimen - 1;

    let idx = y * dimen + x;
    l.v.load(this.points[idx].co);
  }

  updateMirrorFlags(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>) {
  }

  getQuad(loop: Loop): Vector3[] {
    let ret = recttemps.next();

    ret[0].load(loop.f.cent);
    ret[1].load(loop.v.co).interp(loop.prev.v.co, 0.5);
    ret[2].load(loop.v.co);
    ret[3].load(loop.v.co).interp(loop.next.v.co, 0.5);

    return ret;
  }

  clear() {
    this.dimen = 0;
    this.points.length = 0;
    this.recalcFlag = 0;
    this.customDataLayout.length = 0;
    this.customDatas.length = 0;

    return this;
  }

  init(dimen: number, mesh: Mesh, loop: Loop | undefined, cd_grid: AttrRef<this>): void {
    if (dimen !== this.dimen) {
      this.points.length = 0;
      this.dimen = dimen;
    }
    let totpoint = dimen * dimen;

    console.log("Grid init!");

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
        let u = (iu) / (dimen - 1);

        for (let iv = 0; iv < dimen; iv++) {
          let v = (iv) / (dimen - 1);
          let idx = iv * dimen + iu;

          let p = this.points[idx];
          p.uv[0] = u;
          p.uv[1] = v;

          if (0) {
            a.load(quad[0]).interp(quad[1], v);
            b.load(quad[3]).interp(quad[2], v);

            p.co.load(a).interp(b, u);
          } else {
            p.co.load(this.subsurf.evaluate(u, v))
          }
        }
      }

      if (this.customDataLayout.length === 0) {
        this.initCDLayoutFromLoop(loop);
      }

      this.flagNormalsUpdate();
    }

    this.relinkCustomData();
  }

  _ensure(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
    if (this.points.length === 0) {
      //try to get grid dimen
      for (let l of mesh.loops) {
        if (l !== loop) {
          let grid = cd_grid.get(l);
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

  makeDrawTris(mesh: Mesh, smesh: SimpleMesh, loop: Loop, cd_grid: AttrRef<this>): void {
    this._ensure(mesh, loop, cd_grid);

    this.update(mesh, loop, cd_grid);

    this.totTris = 0;

    let quad = this.getQuad(loop);
    let dimen = this.dimen;

    let chunkmode = smesh instanceof ChunkedSimpleMesh;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");
    let have_uvs = cd_uv >= 0;

    let ps = this.points;
    let uvs = have_uvs ? this.customDatas[this.cdmap[cd_uv]] as unknown as UVLayerElem[] : undefined;
    let eid = loop.f.eid;

    let id = loop.eid * dimen * dimen * 2;

    let n = new Vector3();

    let dt = 1.0 / (dimen - 1);

    for (let x = 0; x < dimen - 1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let u = x / (dimen - 1) + dt * 0.5;
        let v = y / (dimen - 1) + dt * 0.5;

        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

        let tri;

        if (chunkmode) {
          tri = (smesh as unknown as ChunkedSimpleMesh).tri(id + i1 * 2, ps[i1].co, ps[i2].co, ps[i3].co);
        } else {
          tri = smesh.tri(ps[i1].co, ps[i2].co, ps[i3].co);
        }

        this.totTris += 2;

        if (this.subsurf) {
          this.subsurf.evaluate(u, v, undefined, undefined, n);
        } else {
          n.load(ps[i1].no).add(ps[i2].no).add(ps[i3].no).add(ps[i4].no).normalize();
        }

        //let n = math.normal_tri(ps[i1], ps[i2], ps[i3]);

        tri.normals(n, n, n);
        if (uvs !== undefined) {
          tri.uvs(uvs[i1].uv, uvs[i2].uv, uvs[i3].uv);
        }
        tri.ids(eid, eid, eid);

        //*
        if (chunkmode) {
          tri = (smesh as unknown as ChunkedSimpleMesh).tri(id + i1 * 2 + 1, ps[i1].co, ps[i3].co, ps[i4].co);
        } else {
          tri = smesh.tri(ps[i1].co, ps[i3].co, ps[i4].co);
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

  recalcNormals(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
    let dimen = this.dimen;
    let ps = this.points;
    let n = new Vector3();

    for (let p of this.points) {
      p.no.zero();
    }

    for (let x = 0; x < dimen - 1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

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

        let nx = dy1 * dz2 - dz1 * dy2;
        let ny = dz1 * dx2 - dx1 * dz2;
        let nz = dx1 * dy2 - dy1 * dx2;

        let l = Math.sqrt(nx * nx + ny * ny + nz * nz);
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

  recalcNeighbors(mesh: Mesh, loop: Loop, cd_grid: AttrRef<this>): void {
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
      [NeighborKeys.L]: l,
      [NeighborKeys.LP]: lp,
      [NeighborKeys.LN]: ln,
      [NeighborKeys.LR]: lr,
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

        let ps2 = cd_grid.get(l2).points;

        let i1 = y1 * dimen + x1;
        let i2 = y2 * dimen + x2;

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
        let i1 = j * dimen + i;

        if (j < dimen - 1) {
          let i2 = (j + 1) * dimen + i;
          ps[i1].neighbors.push(ps[i2]);
        }

        if (j > 0) {
          let i3 = (j - 1) * dimen + i;
          ps[i1].neighbors.push(ps[i3]);
        }

        if (i < dimen - 1) {
          let i4 = j * dimen + i + 1;
          ps[i1].neighbors.push(ps[i4]);
        }

        if (i > 0) {
          let i5 = j * dimen + i - 1;
          ps[i1].neighbors.push(ps[i5]);
        }
      }
    }
  }

  makeBVHTris(mesh: Mesh, bvh: BVH, loop: Loop, cd_grid: AttrRef<this>, trisout: any[]): void {
    this._ensure(mesh, loop, cd_grid);

    this.totTris = 0;

    this.update(mesh, loop, cd_grid);

    let dimen = this.dimen;

    let id = loop.eid * ((this.dimen + 1) * (this.dimen + 1)) * 2;//+4*this.dimen)*2;

    let feid = loop.f.eid;
    let ps = this.points;

    let map = getNeighborMap(this.dimen);

    let l = loop;
    let lp = l.prev, ln = l.next;
    let lr = l.radial_next;
    let lrp = lr.prev, lrn = lr.next;
    let lpr = l.prev.radial_next, lnr = l.next.radial_next;

    let lmap = {
      [NeighborKeys.L]: l,
      [NeighborKeys.LP]: lp,
      [NeighborKeys.LN]: ln,
      [NeighborKeys.LR]: lr,
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

      id += dimen * dimen * 2;
      let ci = 0;

      for (let c of cases) {
        for (let i = 0; i < dimen - 1; i++) {
          let l1 = lmap[c.l1];
          let l2 = lmap[c.l2];

          let ps1 = cd_grid.get(l1).points;
          let ps2 = cd_grid.get(l2).points;

          let ret = map.resolve(i, l1, l2, c.l1, c.l2);
          let i1 = ret.y1 * dimen + ret.x1;
          let i2 = ret.y2 * dimen + ret.x2;

          ret = map.resolve(i + 1, l1, l2, c.l1, c.l2);
          let i3 = ret.y1 * dimen + ret.x1;
          let i4 = ret.y2 * dimen + ret.x2;

          let id2 = id + i * 2;

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

        id += dimen * 2;
        ci++;
      }

      return;
    }

    //return;

    let rilen = (dimen - 1) * (dimen - 1);

    for (let ri = 0; ri < rilen; ri++) {
      let x = ri % (dimen - 1);
      let y = ~~(ri / (dimen - 1));

      let i1 = y * dimen + x;
      let i2 = ((y + 1) * dimen + x);
      let i3 = ((y + 1) * dimen + x + 1);
      let i4 = (y * dimen + x + 1);

      let id2 = id + i1 * 2;

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

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

CustomDataElem.register(Grid);
