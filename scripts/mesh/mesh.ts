// let _mesh = undefined;

import {
  DEBUG_BAD_LOOPS,
  DEBUG_DISK_INSERT,
  DEBUG_DUPLICATE_FACES,
  DEBUG_MANIFOLD_EDGES,
  getArrayTemp, LogContext,
  REUSE_EIDS,
  SAVE_DEAD_EDGES,
  SAVE_DEAD_FACES,
  SAVE_DEAD_LOOPS,
  SAVE_DEAD_VERTS,
} from './mesh_base';

import {INodeDef, Node, NodeFlags} from '../core/graph';

import {Shaders} from '../shaders/shaders.js';

import {ChunkedSimpleMesh, LayerTypes, SimpleMesh} from '../core/simplemesh';

import {DataBlock} from '../core/lib_api';
import {IDataDefine, SceneObjectData} from '../sceneobject/sceneobject_base';
import {math, Matrix4, nstructjs, util, Vector3, Vector4} from '../path.ux/pathux.js';

import {CDFlags, CDRef, CustomData, CustomDataElem, ICustomDataElemConstructor} from './customdata';

import {MeshTools} from './mesh_stdtools';
import {
  LogTags,
  MAX_EDGE_FACES,
  MAX_FACE_VERTS,
  MeshDrawFlags,
  MeshError,
  MeshFeatureError,
  MeshFeatures,
  MeshFlags,
  MeshTypes,
  reallocArrayTemp,
  RecalcFlags,
  ReusableIter
} from './mesh_base';
import {EDGE_LINKED_LISTS} from '../core/const.js';

import {NormalLayerElem, OrigIndexElem, UVLayerElem} from "./mesh_customdata.js";
import {Edge, Element, Face, Handle, Loop, LoopList, Vertex} from "./mesh_types.js";
import {ElementList, ElementListIter} from "./mesh_element_list.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {BVH, BVHSettings} from "../util/bvh.js";
import {drawMeshElements, genRenderMesh} from "./mesh_draw.js";
import {GridBase} from "./mesh_grids.js";
import {UVWrangler} from './unwrapping.js';
import {setMeshClass, triangulateFace} from './mesh_tess.js';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import {
  checkDispLayers,
  DispLayerFlags,
  DispLayerVert,
  onFileLoadDispVert,
  updateDispLayers
} from "./mesh_displacement";
import {IGridConstructor} from "./mesh_grids.js";
import {View3D} from "../../types/scripts/editors/view3d/view3d";
import {ShaderProgram} from "../../types/scripts/core/webgl";
import {SceneObject} from "../sceneobject/sceneobject";

export interface IBVHArgs {
  leafLimit?: number,
  autoUpdate: boolean,
  force: boolean,
  wireVerts: boolean,
  deformMode: boolean,
  useGrids: boolean,
  onCreate: () => void,
}

declare global {
  interface IDEBUG {
    simplemesh: boolean;
  }

  interface WindowOrWorkerGlobalScope {
    redraw_all(): void;

    redraw_viewport(reset?: boolean): void;

    _gl: WebGL2RenderingContext;

    DEBUG: IDEBUG
  }
}

export * from "./mesh_base";
export * from "./mesh_types";
export * from "./mesh_customdata";
export * from "./mesh_element_list.js";

let split_temp = new Array(512);

let _quad = new Array(4);
let _tri = new Array(3);
let _cdtemp1 = new Array<Vertex>(1);
let _cdtemp2 = new Array<Vertex>(2);
let _cdwtemp1 = new Array<number>(1);
let _cdwtemp2 = new Array<number>(2);

let _collapsetemp = new Array<Face>(4192);
let _collapsetemp2 = new Array<Edge>(4192);
let _collapsetemp3 = new Array(4192);
let _collapsecd_ls = new Array(2);
let _collapsecd_ws = [0.5, 0.5];

let splitcd_ls: Loop[] = [undefined, undefined];
let splitcd_ws = [0.5, 0.5];

let _idgen = 0;

let debuglog = false;

const VEID = 0, VFLAG = 1, VX = 1, VY = 2, VZ = 3, VNX = 4, VNY = 5, VNZ = 6, VTOT = 7;
const EEID = 0, EFLAG = 1, EV1 = 2, EV2 = 3, ETOT = 4;
const LEID = 0, LFLAG = 1, LV = 2, LE = 3, LTOT = 4;
const LISTFACE = 0, LISTSTART = 1, LISTLEN = 2, LISTTOT = 3;
const FEID = 0, FFLAG = 1, FLISTSTART = 3, FTOTLIST = 4, FTOT = 5;
const HEID = 0, HFLAG = 1, HX = 2, HY = 3, HZ = 4, HTOT = 5;

export class EIDGen {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.EIDGen {
  freelist : array(int);
  cur      : int;
}`);

  cur: number;
  freelist: number[]
  freemap: Map<number, number> | undefined = undefined;

  constructor() {
    this.cur = 1;

    this.freelist = [];
    //this.freemap = new Map();
    this.freemap = undefined; //make freemap as needed
  }

  static fromIDGen(idgen: util.IDGen): EIDGen {
    let ret = new EIDGen();

    ret.cur = idgen._cur;

    return ret;
  }

  max_cur(id = 0): void {
    this.cur = Math.max(this.cur, id);
  }

  copy(): EIDGen {
    let ret = new EIDGen();

    ret.cur = this.cur;
    ret.freelist = this.freelist.concat([]);

    return ret;
  }

  reserve(eid: number): void {
    if (eid >= this.cur) {
      this.cur = eid + 1;
    }

    //make freemap on demand
    if (!this.freemap) {
      this.makeFreeMap();
    }

    let freemap = this.freemap;
    let freelist = this.freelist;
    let i = freemap.get(eid);

    if (i === undefined) {
      //eid is not freed
      return;
    }

    freemap.delete(eid);

    //eid is last entry in freelist
    if (i === freelist.length - 1) {
      freelist.length--;
      return;
    }

    //swap in last value of freelist and update freemap

    let eid2 = freelist[freelist.length - 1];

    freelist[i] = eid2;
    freelist.length--;

    freemap.set(eid2, i);
  }

  makeFreeMap(): void {
    let freemap = this.freemap = new Map();
    let freelist = this.freelist;

    for (let i = 0; i < freelist.length; i++) {
      freemap.set(freelist[i], i);
    }
  }

  killFreeMap(): void {
    this.freemap = undefined;
  }

  free(eid: number): void {
    if (this.freemap) {
      if (this.freemap.has(eid)) {
        console.error("eid was already freed");
        return;
      }

      this.freemap.set(eid, this.freelist.length);
    }

    this.freelist.push(eid);
  }

  next(): number {
    if (this.freelist.length > 0) {
      let eid = this.freelist.pop();

      if (this.freemap) {
        this.freemap.delete(eid);
      }

      return eid;
    } else {
      return this.cur++;
    }
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    //filter any accidental duplicates
    this.freelist = Array.from(new Set(this.freelist));

    if (this.freemap) {
      this.makeFreeMap();
    }
  }
}

export class EidElemMap extends Map<number, Element> {
  get<type>(id: number): type {
    return super.get(id) as type;
  }
}

export class Mesh extends SceneObjectData {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Mesh {
  _elists         : array(mesh.ElementList) | obj._getArrays();
  eidgen          : mesh.EIDGen;
  flag            : int;
  symFlag         : int;
  features        : int;
  uiTriangleCount : int;
  bvhSettings     : bvh.BVHSettings;
  lastDispActive  : int;
}
`)

  min: Vector3 = new Vector3();
  max: Vector3 = new Vector3();

  //XXX
  smemo: any | undefined = undefined;

  lastDispActive = 0;
  haveNgons = false; //XXX test

  eidMap: EidElemMap;
  private _recalcEidMap: boolean;
  private _bvh_freelist: any | undefined = undefined;
  bvhSettings = new BVHSettings();
  symFlag = 0;
  uvRecalcGen = 0;
  _totLoopFreed = 0;
  _totLoopAlloc = 0;
  _totFaceFreed = 0;
  _totFaceAlloc = 0;
  _last_bvh_key = "";
  _last_elem_update_key = "";
  _last_wr_key = "";
  _last_wr_loophash: number | undefined;
  _debug_id1 = _idgen++;
  features: MeshFeatures;
  materials = []; //XXX
  usesMaterial = true;
  bvh: BVH | undefined = undefined;
  uvWrangler: UVWrangler | undefined = undefined;
  _ltris: Loop[] | undefined = undefined;
  _ltrimap_start: any = {}; //XXX
  _ltrimap_end: any = {}; //XXX
  _ltrimap_len: any = {};
  _fancyMeshes: any = {}; //XXX
  updatelist: any = {}; //XXX
  lastUpdateList: any = {}; //XXX
  updateGen = 0;
  partialUpdateGen = 0;
  eidgen: EIDGen;
  drawflag: MeshDrawFlags = MeshDrawFlags.USE_LOOP_NORMALS;
  recalc: RecalcFlags = RecalcFlags.RENDER | RecalcFlags.TESSELATE;
  smesh?: any = undefined; //XXX
  wmesh?: any = undefined; //XXX
  program: any | undefined = undefined; //XXX
  elists: Map<MeshTypes, ElementList<any>>;
  _elists: Array<ElementList<any>> | undefined = undefined; //used by STRUCT script
  verts: ElementList<Vertex>;
  edges: ElementList<Edge>;
  handles: ElementList<Handle>;
  loops: ElementList<Loop>;
  faces: ElementList<Face>;
  uiTriangleCount = 0;
  debuglog: any[] | undefined = undefined;

  constructor(features: MeshFeatures = MeshFeatures.BASIC) {
    super();

    this.eidMap = new EidElemMap();
    this._recalcEidMap = false;

    this.symFlag = 0; //symmetry flag;
    this.uvRecalcGen = 0;

    this.features = features;
    this._fancyMeshes = {};

    this.updatelist = {};
    this.lastUpdateList = {};

    //used to signal rebuilds of viewport meshes,
    //current mesh data generation
    this.updateGen = 0;
    this.partialUpdateGen = 0;

    this.drawflag = MeshDrawFlags.USE_LOOP_NORMALS;

    this.eidgen = this._makeEIDGen(new EIDGen());

    this.elists = new Map();

    this.makeElistAliases();
  }

  get eidmap(): any {
    throw new Error("get eidmap");
  }

  get uniforms() {
    throw new Error("no longer supported: Mesh.prototype.uniforms property!");
  }

  get loopTris() {
    if (this._ltris === undefined || (this.recalc & RecalcFlags.TESSELATE)) {
      this.tessellate();
    }

    return this._ltris;
  }

  get hasCustomNormals() {
    let ret = this.loops.customData.hasLayer(NormalLayerElem);
    return ret || this.verts.customData.hasLayer(NormalLayerElem);
  }

  get elements() {
    return this.eidMap.values();
  }

  static nodedef(): INodeDef {
    return {
      name: "mesh",
      uiname: "Mesh",
      flag: NodeFlags.SAVE_PROXY,
      inputs: Node.inherit({}),
      outputs: Node.inherit({})
    }
  }

  static blockDefine() {
    return {
      typeName: "mesh",
      defaultName: "Mesh",
      uiName: "Mesh",
      flag: 0,
      icon: -1
    }
  }

  static dataDefine(): IDataDefine {
    return {
      name: "Mesh",
      selectMask: SelMask.MESH,
      tools: MeshTools
    }
  }

  makeElistAliases() {
    this.verts = this.getElemList<Vertex>(MeshTypes.VERTEX, SAVE_DEAD_VERTS);
    this.handles = this.getElemList<Handle>(MeshTypes.HANDLE, false);
    this.edges = this.getElemList<Edge>(MeshTypes.EDGE, SAVE_DEAD_EDGES);
    this.loops = this.getElemList<Loop>(MeshTypes.LOOP, SAVE_DEAD_LOOPS);
    this.faces = this.getElemList<Face>(MeshTypes.FACE, SAVE_DEAD_FACES);
  }

  compress(): number[] {
    let data: number[] = [];

    nstructjs.writeObject(data, this);

    console.log((data.length / 1024 / 1024).toFixed(2) + "mb");
    return data;
  }

  _makeEIDGen(eidgen?: any | number): EIDGen {
    if (eidgen === undefined) {
      return new EIDGen();
    }

    if (typeof eidgen === "object") {
      if (eidgen instanceof EIDGen) {
        return eidgen;
      }

      if (eidgen instanceof util.IDGen) {
        return EIDGen.fromIDGen(eidgen);
      }
    } else if (typeof eidgen === "number") {
      let eidgen2 = new EIDGen();
      eidgen2.cur = eidgen;
      return eidgen2;
    }

    console.warn("eidgen:", eidgen);
    throw new Error("Invalid eidgen to copy");
  }

  hasHandles() {
    return this.features & MeshFeatures.EDGE_HANDLES;
  }

  addHandles() {
    this.features |= MeshFeatures.EDGE_HANDLES;

    if (this.handles.customData.getLayerIndex("handle") < 0) {
      this.handles.addCustomDataLayer("handle");
    }
  }

  getElemLists() {
    return Array.from(this.elists.values());
  }

  updateIndices() {
    this.verts.updateIndices();
    this.edges.updateIndices();
    this.faces.updateIndices();
    //don't do loops, that doesn't really make sense

    return this;
  }

  getElemList<type extends Element>(type, enableFree = undefined): ElementList<type> {
    let elist = this.elists.get(type);
    if (elist === undefined) {
      elist = new ElementList<type>(type, enableFree);
      elist.customData.on_layeradd = this._on_cdlayer_add.bind(this);
      elist.customData.on_layerremove = this._on_cdlayer_rem.bind(this);

      this.elists.set(type, elist);
    }

    if (enableFree !== undefined) {
      elist.storeFreedElems = enableFree;
    }

    return elist as ElementList<type>;
  }

  debugLogClear() {
    if (this.debuglog) {
      this.debuglog.length = 0;
    }
  }

  debugLogCompare(mesh2) {
    let log1 = this.debuglog;
    let log2 = mesh2.debuglog;

    function pad(s) {
      while (s.length < 10) {
        s = " " + s;
      }

      return s;
    }

    let buf = '';
    let buf2 = '';

    let len = Math.min(log1.length, log2.length);
    let lines = [];

    for (let i = 0; i < len; i++) {
      let l1 = log1[i], l2 = log2[i];

      let line = `${pad(l1.e.constructor.name)} ${l1.eid} ${pad(l2.e.constructor.name)} ${l2.eid}\n`;
      lines.push(line);

      buf += line;
    }

    buf += "\n\n";

    for (let i = 0; i < len; i++) {
      let l1 = log1[i], l2 = log2[i];

      if (l1.e.constructor !== l2.e.constructor || l1.eid !== l2.eid) {
        buf += `Entry ${i} differ\n`;
        buf += "  " + lines[i];
      }
    }

    if (log1.length !== log2.length) {
      buf2 += `\nDebug log sizes differ ${log1.length} ${log2.length}\n`
    } else {
      buf2 += `\nDebug log sizes: ${log1.length} ${log2.length}\n`;
    }

    console.log(buf);

    for (let l of buf2.split("\n")) {
      console.log(l);
      buf = l + '\n' + buf2;
    }
    //return buf;
  }

  _element_init(e: Element, customEid = undefined) {
    let list = this.getElemList<Element>(e.type);

    list.customData.initElement(e);

    if (customEid !== undefined) {
      this.eidgen.reserve(customEid);
    }

    e.eid = customEid !== undefined ? customEid : this.eidgen.next();
    e._old_eid = e.eid;

    this.eidMap.set(e.eid, e);
    this._recalcEidMap = true;

    if (this.debuglog) {
      this.debuglog.push({
        e, eid: e.eid, type: e.type
      });
    }
  }

  /* TODO: make _co soley an optional Vector3 parameter. */
  makeVertex(_co?: any, customEid?: number, lctx?: LogContext) {
    let co: Vector3 | undefined;

    if (_co && _co instanceof Vertex) {
      co = (_co as Vertex).co;
    } else if (_co instanceof Vector3) {
      co = (_co as Vector3);
    }

    if (!(this.features & MeshFeatures.MAKE_VERT))
      throw new MeshFeatureError("makeVertex not supported");
    let v;

    if (SAVE_DEAD_VERTS) {
      v = this.verts.alloc(Vertex);

      if (co) {
        v.co.load(co);
      }

      if (customEid !== undefined) {
        this.eidgen.reserve(customEid);
      }

      v.eid = customEid !== undefined ? customEid : this.eidgen.next();
      v._old_eid = v.eid;

      this.eidMap.set(v.eid, v);
    } else {
      v = new Vertex(co);
      this._element_init(v, customEid);
    }

    this.verts.push(v);

    v.flag |= MeshFlags.UPDATE;

    if (lctx) {
      lctx.newVertex(v);
    }

    return v;
  }

  getEdge(v1, v2): Edge | undefined {
    for (let e of v1.edges) {
      if (e.otherVertex(v1) === v2)
        return e;
    }

    return undefined;
  }

  ensureEdge(v1: Vertex, v2: Vertex, lctx?: LogContext): Edge {
    if (v1 === v2) {
      throw new MeshError("mesh.ensureEdge: v1 and v2 were the same");
    }

    let e = this.getEdge(v1, v2);

    if (e === undefined) {
      e = this.makeEdge(v1, v2);

      if (lctx) {
        lctx.newEdge(e);
      }
    }

    return e;
  }

  private _makeHandle(e: Edge): Handle {
    let h = new Handle();
    h.owner = e;

    this._element_init(h);
    this.handles.push(h);

    return h;
  }

  _diskInsert(v: Vertex, e: Edge) {
    if (DEBUG_DISK_INSERT) {
      if (v.edges.indexOf(e) >= 0) {
        throw new MeshError("edge already in vertex .edges list");
      }
    }

    v.edges.push(e);

    /*
    if (!v.e) {
      v.e = e;
      return;
    }

    if (e.v1 === v) {
      v.e.v1next.v1prev = e;
      e.v1prev = v.e;
      e.v1next = v.e.v1next;
      v.e.v1next = e;
    } else {
      v.e.v2next.v2prev = e;
      e.v2prev = v.e;
      e.v2next = v.e.v2next;
      v.e.v2next = e;
    }
     */
  }

  _diskRemove(v: Vertex, e: Edge): void {
    //if (!EDGE_LINKED_LISTS) {
    v.edges.remove(e);
    //  return;
    //  }

    /*
    if (e === v.e) {
      v.e = v === e.v1 ? e.v1next : e.v2next;

      if (v.e === e) {
        v.e = undefined;

        return;
      }
    }

    if (e.v1 === v) {
      e.v1prev.v1next = e.v1next;
      e.v1next.v1prev = e.v1prev;
    } else {
      e.v2prev.v2next = e.v2next;
      e.v2next.v2prev = e.v2prev;
    }
    */
  }

  makeEdge(v1: Vertex, v2: Vertex, checkExist = false, customEid = undefined) {
    if (v1 === v2) {
      throw new MeshError("mesh.makeEdge: v1 and v2 were the same");
    }

    if (checkExist) {
      let e = this.getEdge(v1, v2);
      if (e) {
        return e;
      }
    }

    if (!(this.features & MeshFeatures.MAKE_EDGE))
      throw new MeshFeatureError("makeEdge not supported");

    let e;

    if (SAVE_DEAD_EDGES) {
      if (customEid !== undefined) {
        this.eidgen.reserve(customEid);
      }

      e = this.edges.alloc(Edge);
      e.eid = customEid !== undefined ? customEid : this.eidgen.next();
      e._old_eid = e.eid;

      this.eidMap.set(e.eid, e);
      this._recalcEidMap = true;
    } else {
      e = new Edge();
      this._element_init(e, customEid);
    }

    e.v1 = v1;
    e.v2 = v2;

    if (EDGE_LINKED_LISTS) {
      e.v1next = e.v1prev = e;
      e.v2next = e.v2prev = e;
    }

    this._diskInsert(e.v1, e);
    this._diskInsert(e.v2, e);

    this.edges.push(e);

    if (this.features & MeshFeatures.EDGE_HANDLES) {
      e.h1 = this._makeHandle(e);
      e.h2 = this._makeHandle(e);

      e.h1.co.load(e.v1.co).interp(e.v2.co, 1.0 / 3.0);
      e.h2.co.load(e.v1.co).interp(e.v2.co, 2.0 / 3.0);
    }

    e.flag |= MeshFlags.UPDATE;

    return e;
  }

  minMax(): this {
    this.min = new Vector3();
    this.max = new Vector3();

    if (this.verts.length === 0) {
      return;
    }

    this.min[0] = this.min[1] = this.min[2] = 1e17;
    this.max[0] = this.max[1] = this.max[2] = -1e17;

    for (let v of this.verts) {
      this.min.min(v.co);
      this.max.max(v.co);
    }

    return this;
  }

  _makeLoop(customEid: number | undefined = undefined): Loop {
    this._totLoopAlloc++;

    if (!SAVE_DEAD_LOOPS) {
      let loop = new Loop();

      loop.radial_next = loop.radial_prev = loop;

      this._element_init(loop, customEid);
      this.loops.push(loop);

      return loop;
    } else {
      let l = this.loops.alloc(Loop);

      if (customEid !== undefined) {
        this.eidgen.reserve(customEid);
      }

      //for some reason we have to call getElemList here,
      //probably code is being executed in wrong order somewhere
      this.getElemList(l.type);

      l.eid = customEid !== undefined ? customEid : this.eidgen.next();
      l._old_eid = l.eid;

      this.eidMap.set(l.eid, l);
      this._recalcEidMap = true;

      this.loops.push(l);

      return l;
    }
  }

  _allocFace(totlist = 0, customEid: number | undefined = undefined): Face {
    let f;

    if (SAVE_DEAD_FACES) {
      f = this.faces.alloc(Face);

      f.no.zero();
      f.cent.zero();

      this._totFaceAlloc++;
    } else {
      f = new Face();
      this.faces.customData.initElement(f);
    }

    if (f.lists.length !== totlist) {
      f.lists.length = 0;

      for (let i = 0; i < totlist; i++) {
        f.lists.push(new LoopList());
      }
    }

    if (customEid !== undefined) {
      this.eidgen.reserve(customEid);
    }

    f.eid = customEid !== undefined ? customEid : this.eidgen.next();
    f._old_eid = f.eid;

    this.eidMap.set(f.eid, f);
    this._recalcEidMap = true;

    this.faces.push(f);

    return f;
  }

  _freeFace(f: Face): void {
    if (f.eid < 0) {
      throw new Error("f was already freed");
    }

    if (DEBUG_BAD_LOOPS) {
      for (let list of f.lists) {
        if (!list.l) {
          continue;
        }

        let l = list.l;
        let _i = 0;

        do {
          if (!l.e) {
            continue;
          }

          for (let l2 of l.e.loops) {
            if (l2 === l) {
              throw new MeshError("_freeFace called on face that still has loops linked to edges");
            }
          }

          if (_i++ > MAX_FACE_VERTS) {
            break;
          }

          l = l.next;
        } while (l !== list.l);
      }
    }

    this._elemRemove(f);

    this.faces.remove(f);
    this._totFaceFreed++;
  }

  _killLoop(loop: Loop): void {
    if (loop.eid < 0) {
      console.error("Loop was already freed");
      return;
      //throw new Error("loop was already freed");
    }

    this._elemRemove(loop);

    this.loops.remove(loop);
    this._totLoopFreed++;
  }

  _elemRemove(elem) {
    this.eidMap.delete(elem.eid);
    this._recalcEidMap = true;
    if (REUSE_EIDS) {
      this.eidgen.free(elem.eid);
    }
  }

  countDuplicateFaces(vs) {
    let flag = MeshFlags.FACE_EXIST_FLAG;
    let retcount = 0;

    vs = ReusableIter.getSafeIter(vs);

    let vlen = 0;
    for (let v of vs) {
      vlen++;
    }

    for (let v of vs) {
      v.flag &= ~flag;

      for (let e of v.edges) {
        e.flag &= ~flag;

        for (let l of e.loops) {
          let bad = l.f.lists.length > 1;
          bad = bad || l.f.lists[0].length !== vlen;

          if (bad) {
            l.f.flag |= flag;
          } else {
            l.f.flag &= ~flag;
          }
        }
      }
    }

    for (let v of vs) {
      for (let e of v.edges) {
        if (e.flag & flag) {
          continue;
        }

        e.flag |= flag;

        for (let l of e.loops) {
          if (l.f.flag & flag) {
            continue;
          }

          l.f.flag |= flag;

          for (let v of vs) {
            v.flag &= ~flag;
          }

          for (let v2 of l.f.verts) {
            v2.flag |= flag;
          }

          let count = 0;
          for (let v of vs) {
            if (v.flag & flag) {
              count++;
            }
          }

          //console.log(count, vlen);

          if (count === vlen) {
            retcount++;
          }
        }
      }
    }

    return retcount;
  }


  //new_vmap is an object mapping old vertex eid's to new vertices
  copyFace(f, new_vmap) {
    let f2 = this._allocFace(0);
    this.copyElemData(f2, f);

    for (let l of f.loops) {
      this._radialRemove(l.e, l);
    }

    for (let list of f.lists) {
      let list2 = new LoopList();

      list2.flag = list.flag;
      list2.length = list.length;

      let l1 = list.l;
      let l2;
      let _i = 0;
      let startl2, prevl2;

      do {
        l2 = this._makeLoop();
        this.copyElemData(l2, l1);

        l2.list = list2;
        l2.v = new_vmap[l1.v.eid];
        l2.f = f2;

        if (l1 === list.l) {
          list2.l = l2;
          startl2 = l2;
        }

        if (l2.v === undefined) {
          throw new MeshError("copyFace's new_vmap parameter didn't have vertex " + l1.v.eid + " for loop " + l1.eid);
        }

        if (prevl2) {
          prevl2.next = l2;
          l2.prev = prevl2;
        }

        if (_i++ > 10000) {
          console.warn("infinite loop detected");
          break;
        }

        prevl2 = l2;
        l1 = l1.next;
      } while (l1 !== list.l);

      l2.next = startl2;
      startl2.prev = l2;

      for (let l of list2) {
        l.e = this.ensureEdge(l.v, l.next.v);
        l.f = f2;

        this._radialInsert(l.e, l);
      }

      f2.lists.push(list2);
    }

    for (let l of f.loops) {
      this._radialInsert(l.e, l);
    }

    this.regenTessellation();

    return f2;
  }

  makeQuad(v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex, lctx: LogContext | undefined = undefined) {
    _quad[0] = v1;
    _quad[1] = v2;
    _quad[2] = v3;
    _quad[3] = v4;

    return this.makeFace(_quad, undefined, undefined, lctx);
  }

  makeTri(v1: Vertex, v2: Vertex, v3: Vertex, lctx: LogContext | undefined = undefined,
          ignoreDuplicates = false) {
    if (!v1 || !v2 || !v3) {
      console.log("missing verts", v1, v2, v3);
      throw new MeshError("Missing verts in makeTri");
    }

    if (v1 === v2 || v1 === v3 || v2 === v3) {
      console.log("duplicate verts", v1, v2, v3);
      if (!ignoreDuplicates) {
        throw new MeshError("Duplicate verts in makeTri");
      } else {
        return undefined;
      }
    }

    _tri[0] = v1;
    _tri[1] = v2;
    _tri[2] = v3;

    return this.makeFace(_tri, undefined, undefined, lctx);
  }

  makeFace(verts: Vertex[], customEid: number | undefined = undefined,
           customLoopEids: number[] | undefined = undefined,
           lctx: LogContext | undefined = undefined, logtag = 0) {
    if (DEBUG_DUPLICATE_FACES) {
      let f = this.getFace(verts);

      if (f) {
        console.log(verts, f);
        throw new Error("face already exists");
      }
    }

    let flag = MeshFlags.MAKE_FACE_TEMP;
    for (let v of verts) {
      v.flag &= ~flag;
    }

    for (let v of verts) {
      if (v.flag & flag) {
        throw new MeshError("duplicate vert passed to makeFace");
      }

      v.flag |= flag;
    }

    if (!(this.features & MeshFeatures.MAKE_FACE))
      throw new MeshFeatureError("makeFace not supported");

    if (verts.length < 2) {
      throw new MeshError("need at least two verts");
    }

    let f = this._allocFace(0, customEid);

    f.flag |= MeshFlags.UPDATE;

    let firstl, prevl;

    let list = new LoopList();
    f.lists.push(list);

    list.length = verts.length;

    let i = 0;

    for (let v of verts) {
      let eid = customLoopEids !== undefined ? customLoopEids[i] : undefined;

      let l = this._makeLoop(eid);

      l.list = list;
      l.v = v;
      l.f = f;

      if (firstl === undefined) {
        firstl = l;
      } else {
        l.prev = prevl;
        prevl.next = l;
      }

      prevl = l;
      i++;
    }

    list.l = firstl;
    firstl.prev = prevl;
    prevl.next = firstl;

    for (let l of list) {
      l.e = this.getEdge(l.v, l.next.v);
      let wasnew = false;

      if (!l.e) {
        l.e = this.makeEdge(l.v, l.next.v);
        wasnew = true;
      }

      this._radialInsert(l.e, l);

      if (wasnew && lctx) {
        lctx.newEdge(l.e, logtag);
      }
    }

    f.calcCent();
    f.calcNormal();

    if (lctx) {
      lctx.newFace(f, logtag);
    }

    return f;
  }

  _recalcNormals_intern(cd_disp: CDRef<DispLayerVert> = -1): void {
    for (let f of this.faces) {
      f.calcNormal(cd_disp);
    }

    this._recalcVertexNormals(cd_disp);
  }

  _recalcVertexNormals(cd_disp: CDRef<DispLayerVert> = -1) {
    let i = 0;
    let vtots = new Array<number>(this.verts.length);

    for (let v of this.verts) {
      v.index = i++;
      v.no.zero();
      vtots[v.index] = 0;
    }

    for (let e of this.edges) {
      e.updateLength();
    }

    for (let f of this.faces) {
      f.area = 0;
    }

    let ltris = this.loopTris;

    for (let i = 0; i < ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];
      let v1 = l1.v, v2 = l2.v, v3 = l3.v;
      let p1: Vector3, p2: Vector3, p3: Vector3;

      if (cd_disp >= 0) {
        p1 = v1.customData.get<DispLayerVert>(cd_disp).worldco;
        p2 = v2.customData.get<DispLayerVert>(cd_disp).worldco;
        p3 = v3.customData.get<DispLayerVert>(cd_disp).worldco;
      } else {
        p1 = v1.co;
        p2 = v2.co;
        p3 = v3.co;
      }

      let n = math.normal_tri(p1, p2, p3);
      let w = math.tri_area(p1, p2, p3);

      if (isNaN(n.dot(n))) {
        console.error("NaN in normal calc!", w, v1, v2, v3, l1, l2, l3);
        l1.v.co.zero();
        l2.v.co.zero();
        l3.v.co.zero();
        l1.v.co.addScalar(0.01);
        continue;
      }

      if (isNaN(w)) {
        l1.v.co.zero();
        l2.v.co.zero();
        l3.v.co.zero();
        l1.v.co.addScalar(0.01);
        console.error("NaN in normal area calc!", w, v1, v2, v3, l1, l2, l3);
        continue;
      }

      l1.v.no.addFac(n, w);
      l2.v.no.addFac(n, w);
      l3.v.no.addFac(n, w);

      l1.f.area += w;

      vtots[l1.v.index] += w;
      vtots[l2.v.index] += w;
      vtots[l3.v.index] += w;
    }

    for (let v of this.verts) {
      if (vtots[v.index] > 0 && v.no.dot(v.no) > 0) {
        v.no.normalize();
      }
    }
  }

  * allGeometry() {
    for (let v of this.verts) {
      yield v;
    }

    for (let e of this.edges) {
      yield e;
    }

    for (let f of this.faces) {
      yield f;
    }
  }

  recalcNormalsCustom(cd_disp: CDRef<DispLayerVert> = -1) {
    let ok = this.faces.customData.hasLayer(NormalLayerElem);
    ok = ok || this.loops.customData.hasLayer(NormalLayerElem);
    ok = ok || this.verts.customData.hasLayer(NormalLayerElem);

    for (let e of this.edges) {
      e.updateLength();
    }

    if (!ok) {
      for (let f of this.faces) {
        f.calcNormal();
      }

      this._recalcVertexNormals(cd_disp);
      return;
    }

    if (!this.faces.customData.hasLayer(NormalLayerElem)) {
      if (this.loops.customData.hasLayer(NormalLayerElem)) {
        let cd_nor = this.loops.customData.getLayerRef(NormalLayerElem);
        let have_vno = this.verts.customData.hasLayer(NormalLayerElem);

        let tots = [];

        if (!have_vno) {
          for (let v of this.verts) {
            v.index = tots.length;
            v.no.zero();
            tots.push(0);
          }
        }

        //copy loop normals to verts and faces
        for (let f of this.faces) {
          f.no.zero();

          for (let l of f.loops) {
            let no = cd_nor.get(l).no;
            no.normalize();

            if (!have_vno) {
              l.v.no.add(no);
              tots[l.v.index]++;
            }

            f.no.add(no);
          }

          f.no.normalize();
        }

        if (!have_vno) {
          for (let v of this.verts) {
            v.no.normalize();
          }
        }
      } else if (this.verts.customData.hasLayer(NormalLayerElem)) {
        let cd_nor = this.verts.customData.getLayerRef(NormalLayerElem);

        //copy vert normals to faces
        for (let f of this.faces) {
          f.no.zero();

          for (let l of f.loops) {
            let no = cd_nor.get(l.v).no;
            no.normalize();

            f.no.add(no);
          }

          f.no.normalize();
        }
      }
    } else {
      let cd_nor = this.faces.customData.getLayerRef(NormalLayerElem);

      for (let f of this.faces) {
        f.no.load(cd_nor.get(f).no).normalize();
      }

      this._recalcVertexNormals(cd_disp);
    }
  }

  recalcNormals(cd_disp: CDRef<DispLayerVert> = -1) {
    for (let f of this.faces) {
      f.calcCent();
    }

    if (this.hasCustomNormals) {
      this.recalcNormalsCustom(cd_disp);
    } else {
      this._recalcNormals_intern(cd_disp);
    }
  }

  killVertex(v: Vertex, _nocheck = false, lctx?: LogContext, logtag = 0) {
    if (!_nocheck) {
      if (!(this.features & MeshFeatures.KILL_VERT))
        throw new MeshFeatureError("killVertex not supported");
    }

    if (v.eid < 0) {
      console.trace("Warning: vertex", v.eid, "already freed", v);
      return;
    }

    let _i = 0;

    /*if (EDGE_LINKED_LISTS) {
      while (v.e !== undefined && _i++ < 10000) {
        this.killEdge(v.e, lctx, logtag);
      }
    } else { */
    while (v.edges.length > 0 && _i++ < 10000) {
      this.killEdge(v.edges[0], lctx, logtag);
    }
    //}

    if (_i >= 10000) {
      console.trace("mesh integrity warning, infinite loop detected in killVertex");
    }

    if (lctx) {
      lctx.killVertex(v, logtag);
    }

    this._elemRemove(v);
    this.verts.remove(v);
  }

  killEdge(e: Edge, lctx?: LogContext, logtag?: any) {
    if (!(this.features & MeshFeatures.KILL_EDGE))
      throw new MeshFeatureError("killEdge not supported");

    if (e.eid < 0) {
      console.trace("Warning: edge", e.eid, "already freed", e);
      return;
    }

    let _i = 0;
    while (e.l !== undefined && _i++ < 10000) {
      this.killFace(e.l.f, lctx, logtag);
    }

    if (lctx) {
      lctx.killEdge(e, logtag);
    }

    this._elemRemove(e);

    this._diskRemove(e.v1, e);
    this._diskRemove(e.v2, e);

    if (e.h1) {
      this.handles.remove(e.h1);
    }

    if (e.h2) {
      this.handles.remove(e.h2);
    }

    this.edges.remove(e);
  }

  replaceLoopEdge(l: Loop, newe: Edge): this {
    this._radialRemove(l.e, l);
    this._radialInsert(newe, l);
    l.e = newe;

    return this;
  }

  killFace(f: Face, lctx?: LogContext, logtag = 0) {
    let oldvs: Set<Vertex> | undefined;

    if (DEBUG_BAD_LOOPS) {
      for (let v of f.verts) {
        this._checkElemLoops(v, "killFace 1");
      }

      oldvs = new Set(f.verts);
    }

    if (!(this.features & MeshFeatures.KILL_FACE))
      throw new MeshFeatureError("killEdge not supported");

    if (f.eid < 0) {
      throw new MeshError(`Face ${f._old_eid} was already freed`);
      //console.trace("Warning: face", f.eid, "already freed", f);
      //return;
    }

    if (lctx) {
      lctx.killFace(f, logtag = 0);
    }

    for (let list of f.lists) {
      let l = list.l;
      let _i = 0;

      do {
        let next = l.next;

        if (l.e) {
          this._radialRemove(l.e, l);
        } else {
          throw new MeshError("l.e was undefined");
        }

        this._killLoop(l);

        if (_i++ > MAX_FACE_VERTS) {
          console.error("infinite loop error");
          break;
        }

        l = next;
      } while (l !== list.l);
    }

    this._freeFace(f);

    if (DEBUG_BAD_LOOPS) {
      for (let v of oldvs) {
        this._checkElemLoops(v, "killFace 2");
      }
    }
  }

  killElem(elem: Element, lctx?: LogContext, logtag = 0): void {
    switch (elem.type) {
      case MeshTypes.VERTEX:
        this.killVertex(elem as Vertex, undefined, lctx, logtag);
        break;
      case MeshTypes.EDGE:
        this.killEdge(elem as Edge, lctx, logtag);
        break;
      case MeshTypes.FACE:
        this.killFace(elem as Face, lctx, logtag);
        break;
      default:
        console.log(elem);
        throw new MeshError("invalid element " + elem);
    }
  }

  setActive(e: Element): void {
    this.getElemList(e.type).active = e;
  }

  clearHighlight(): void {
    for (let list of this.getElemLists()) {
      list.highlight = undefined;
    }
  }

  setHighlight(e: Element): void {
    this.getElemList(e.type).highlight = e;
  }

  /** flushes MeshFlags.UPDATE from faces/edges to vertices*/
  flushUpdateFlags(typemask: MeshTypes = MeshTypes.EDGE | MeshTypes.FACE): void {
    if (typemask & MeshTypes.EDGE) {
      for (let e of this.edges) {
        if (!(e.flag & MeshFlags.UPDATE)) {
          continue;
        }

        e.v1.flag |= MeshFlags.UPDATE;
        e.v2.flag |= MeshFlags.UPDATE;
      }
    }

    if (typemask & MeshTypes.FACE) {
      for (let f of this.faces) {
        if (!(f.flag & MeshFlags.UPDATE)) {
          continue;
        }

        for (let v of f.verts) {
          v.flag |= MeshFlags.UPDATE;
        }
      }
    }
  }

  selectFlush(selmode: MeshTypes): void {
    if (selmode & MeshTypes.VERTEX) {
      this.edges.selectNone();

      let set_active = this.edges.active === undefined;
      set_active = set_active || !((this.edges.active.v1.flag | this.edges.active.v2.flag) & MeshFlags.SELECT);

      for (let e of this.edges) {
        if (e.flag & MeshFlags.HIDE) {
          continue;
        }

        if ((e.v1.flag & MeshFlags.SELECT) && (e.v2.flag & MeshFlags.SELECT)) {
          this.edges.setSelect(e, true);

          if (set_active) {
            this.edges.active = e;
          }
        }
      }

      for (let f of this.faces) {
        if (f.flag & MeshFlags.HIDE) {
          continue;
        }

        let sel = true;

        for (let e of f.edges) {
          if (!(e.flag & MeshFlags.SELECT)) {
            sel = false;
            break;
          }
        }

        this.faces.setSelect(f, sel);
      }
    } else if (selmode & MeshTypes.EDGE) {
      this.verts.selectNone();
      this.faces.selectNone();

      for (let e of this.edges.selected) {
        this.verts.setSelect(e.v1, true);
        this.verts.setSelect(e.v2, true);

        for (let l of e.loops) {
          let f = l.f;

          let ok = true;

          for (let e of f.edges) {
            if (!(e.flag & MeshFlags.SELECT)) {
              ok = false;
              break;
            }
          }

          if (ok) {
            this.faces.setSelect(f, true);
          }
        }
      }
    } else if (selmode & MeshTypes.FACE) {
      this.verts.selectNone();
      this.edges.selectNone();

      for (let f of this.faces) {
        if (!(f.flag & MeshFlags.SELECT)) {
          continue;
        }

        for (let list of f.lists) {
          for (let l of list) {
            this.verts.setSelect(l.v, true);
            this.edges.setSelect(l.e, true);
          }
        }
      }
    }
  }

  setOrigIndex(): void {
    this.ensureOrigIndexLayer();

    for (const elist of this.elists.values()) {
      if (elist.type === MeshTypes.LOOP) {
        continue;
      }

      let i = 0;
      for (let e of elist) {
        for (let cd of e.customData) {
          if (cd instanceof OrigIndexElem) {
            cd.i = i;
          }
        }

        i++;
      }
    }
  }

  /**make sure we have an original index layer*/
  ensureOrigIndexLayer(): void {
    for (const elist of this.elists.values()) {
      if (elist.type === MeshTypes.LOOP) {
        continue;
      }

      if (elist.customData.hasLayer("origindex")) {
        continue;
      }

      elist.customData.addLayer(OrigIndexElem);
    }
  }

  _splitEdgeNoFace(e: Edge, t = 0.5, lctx: LogContext): [Edge, Vertex] {
    let v1 = e.v1, v2 = e.v2;

    t = t === undefined ? 0.5 : t;

    //pretend we're killing e
    if (lctx) {
      lctx.killEdge(e, LogTags.SPLIT_EDGE);
    }

    let nv = this.makeVertex(e.v1.co);
    nv.co.interp(e.v2.co, t);

    nv.no.load(e.v1.no).interp(e.v2.no, t);
    nv.no.normalize();

    let ne = this.makeEdge(nv, e.v2);

    this.copyElemData(ne, e);

    this._diskRemove(e.v2, e);
    e.v2 = nv;
    this._diskInsert(nv, e);

    if (e.flag & MeshFlags.SELECT) {
      this.edges.setSelect(ne, true);
    }

    if ((e.v1.flag & MeshFlags.SELECT) && (e.v2.flag & MeshFlags.SELECT)) {
      this.verts.setSelect(nv, true);
    }

    //_cdtemp1[0] = e;
    //_cdwtemp1[0] = 1.0;

    //this.edges.customDataInterp(ne, _cdtemp1, _cdwtemp1);

    _cdtemp2[0] = v1;
    _cdtemp2[1] = v2;

    _cdwtemp2[0] = 1.0 - t;
    _cdwtemp2[1] = t;

    this.verts.customDataInterp(nv, _cdtemp2, _cdwtemp2);

    if (lctx) {
      lctx.newVertex(nv, LogTags.SPLIT_EDGE);
      lctx.newEdge(e, LogTags.SPLIT_EDGE);
      lctx.newEdge(ne, LogTags.SPLIT_EDGE);
    }

    return [ne, nv];
  }

  _radialRemoveSafe(e: Edge, l: Loop): boolean {
    if (!e.l) {
      return;
    }

    let ok = false;

    for (let l2 of e.loops) {
      if (l2 === l) {
        ok = true;
        break;
      }
    }

    if (ok) {
      this._radialRemove(e, l);
    } else {
      console.error("could not remove loop from radial list");
    }

    return ok;
  }

  applyMatrix(matrix: Matrix4): this {
    for (let v of this.verts) {
      v.multVecMatrix(matrix);
      v.flag |= MeshFlags.UPDATE;
    }

    this.regenTessellation();
    this.regenRender();
    this.regenBVH();
    this.recalcNormals();

    return this;
  }

  collapseEdge(e: Edge, v_keep: Vertex = e.v1, lctx?: LogContext, snap = true, depth = 0) {
    let fi = 0, flen = 0;
    let ei = 0, elen = 0;

    if (v_keep === e.v2) {
      //swap v1/v2
      let tmp = e.v1;
      e.v1 = e.v2;
      e.v2 = tmp;
    }

    let v1 = e.v1;
    let v2 = e.v2;

    let flag = MeshFlags.COLLAPSE_TEMP;

    let cdls = _collapsecd_ls;
    let cdws = _collapsecd_ws;

    if (snap) {
      //snap loop customdata
      for (let l of e.loops) {
        cdls[0] = l;
        cdls[1] = l.next;

        cdws[0] = cdws[1] = 0.5;
        this.loops.customDataInterp(l, cdls, cdws);
        this.copyElemData(l.next, l);
      }

      //snap vertex customdata
      cdls[0] = v1;
      cdls[1] = v2;

      cdws[0] = cdws[1] = 0.5;

      this.verts.customDataInterp(v1, cdls, cdws);
    }

    //clear flags
    for (let v of e.verts) {
      for (let e2 of v.edges) {
        for (let l of e2.loops) {
          l.flag &= ~flag;
          l.e.flag &= ~flag;
          l.e.flag |= MeshFlags.UPDATE;
          l.v.flag &= ~flag;
          l.f.flag &= ~flag;
        }
      }
    }

    if (snap) {
      v1.co.interp(v2.co, 0.5);
    }

    v1.flag |= MeshFlags.UPDATE;

    let fs: Face[] = _collapsetemp;
    let es: Edge[] = _collapsetemp2;

    for (let v of e.verts) {
      for (let e2 of v.edges) {
        if (!(e2.flag & flag)) {
          es[elen++] = e2;
          e2.flag |= flag;
        }

        for (let l of e2.loops) {
          if (!(l.f.flag & flag)) {
            fs[flen++] = l.f;
            l.f.flag |= flag;
          }
        }
      }
    }

    for (let i = 0; i < flen; i++) {
      let f = fs[i];

      if (f.eid < 0) {
        continue;
      }

      if (lctx) {
        lctx.killFace(f, LogTags.SPLIT_EDGE);
      }

      for (let l of f.loops) {
        this._radialRemove(l.e, l);
      }
    }

    for (let i = 0; i < elen; i++) {
      let e = es[i];

      let ev1 = e.v1;
      let ev2 = e.v2;

      if (e.v1 === v2) {
        ev1 = v1;
      } else if (e.v2 === v2) {
        ev2 = v1;
      } else {
        continue;
      }

      if (e.l) {
        throw new Error("collapse error!");
      }

      if (lctx) {
        lctx.killEdge(e, LogTags.SPLIT_EDGE);
      }

      this._diskRemove(e.v1, e);
      this._diskRemove(e.v2, e);

      if (ev1 === ev2 || this.getEdge(ev1, ev2)) {
        this._elemRemove(e);
        this.edges.remove(e);
      } else {
        e.v1 = ev1;
        e.v2 = ev2;
        this._diskInsert(ev1, e);
        this._diskInsert(ev2, e);

        if (lctx) {
          lctx.newEdge(e, LogTags.SPLIT_EDGE);
        }
      }
    }

    for (let i = 0; i < flen; i++) {
      let f = fs[i];

      for (let list of f.lists) {
        for (let l of list) {
          if (l.v === v2) {
            l.v = v1;
          }
        }

        let count = 0;

        let startl = list.l;
        let l = list.l;
        let _i = 0;

        for (let l of list) {
          l.v.flag &= ~flag;
          l.flag &= ~flag;
        }

        do {
          let next = l.next;

          if (_i++ > MAX_FACE_VERTS) {
            console.error("Infinite loop error");
            break;
          }

          let bad = l.v === l.next.v;//l.v.flag & flag;
          l.v.flag |= flag;

          if (!bad) {
            l = next;
            continue;
          }

          l.next.prev = l.prev;
          l.prev.next = l.next;

          if (l === list.l) {
            list.l = l.next;
          }

          if (l === list.l) {
            list.l = undefined;
            list.length = 0;
            this._killLoop(l);

            break;
          }

          this._killLoop(l);

          l = next;
        } while (l !== list.l && l !== startl);

        list._recount();
      }

      let li = 0;
      let killface = false;

      for (let j = 0; j < f.lists.length; j++) {
        let list = f.lists[j];

        if (list.length > 2 && list.l) {
          f.lists[li++] = list;

          continue;
        } else if (list.l) {
          this._killLoopList(list, false);
        }

        if (j === 0) { //boundary loop?
          killface = true;
          break;
        }
      }

      if (li !== f.lists.length) {
        f.lists.length = li;
      }

      killface = killface || li === 0;

      if (killface) {
        for (let list of f.lists) {
          this._killLoopList(list, false);
        }

        this._freeFace(f);
      }
    }

    for (let i = 0; i < flen; i++) {
      let f = fs[i];

      if (f.eid < 0) {
        continue;
      }

      for (let l of f.loops) {
        l.e = this.ensureEdge(l.v, l.next.v, lctx);
        this._radialInsert(l.e, l);
      }

      if (this.countDuplicateFaces(f.verts) > 1) {
        this.killFace(f);
      } else {
        //this._fixFace(f, lctx);
        f.flag |= MeshFlags.UPDATE;

        if (lctx) {
          lctx.newFace(f, LogTags.SPLIT_EDGE);
        }
      }
    }

    this.killVertex(v2, undefined, lctx);

    //clear references
    for (let i = 0; i < elen; i++) {
      es[i] = undefined;
    }

    for (let i = 0; i < flen; i++) {
      fs[i] = undefined;
    }

    v1.flag |= MeshFlags.UPDATE;

    if (DEBUG_DUPLICATE_FACES) {
      for (let f of v1.faces) {
        this._checkFace(f, `collapseEdge(e=${e._old_eid}, v1=${v1.eid})`);
        /*
        if (!this._checkFace(f, f.verts, `collapseEdge(e=${e._old_eid}, v1=${v1.eid})`, REWIND_DEBUG)) {
          this._debugRewind(patch);

          if (depth < 1) {
            e = this.eidMap.get(eid);
            this.collapseEdge(e, v_keep, lctx, snap, depth + 1);
          }
        }//*/
      }
    }

    if (DEBUG_MANIFOLD_EDGES) {
      this._checkManifold(v1, "collapseEdge");
    }

    if (DEBUG_BAD_LOOPS) {
      this._checkElemLoops(v1, "collapseEdge");
    }

    return v1;
  }

  _checkElemLoops(v_or_e: Vertex | Edge, msg = "") {
    if (v_or_e.eid < 0) {
      console.warn(v_or_e, msg);
      throw new MeshError("" + msg + ": v_or_e.eid < 0");
    }

    for (let l of v_or_e.loops) {
      if (l.f.eid < 0) {
        console.warn(l.f);
        throw new MeshError("" + msg + ": l.f.eid < 0");
      }

      this._checkFaceLoops(l.f, msg);

      if (l.eid < 0) {
        console.warn(l);
        throw new MeshError("" + msg + ": bad loop");
      }
    }
  }

  _killLoopList(list: LoopList, unlink = false) {
    if (!list.l) {
      return;
    }

    let l = list.l;
    let _i = 0;

    do {
      let next = l.next;

      if (_i++ > MAX_FACE_VERTS) {
        console.error("infinite loop error");
        break;
      }

      if (unlink) {
        this._radialRemove(l.e, l);
      }

      this._killLoop(l);

      l = next;
    } while (l !== list.l);

    list.l = undefined;
  }

  reverseListWinding(list: LoopList) {
    for (let l of list) {
      this._radialRemove(l.e, l);
    }

    let l = list.l;
    let _i = 0;
    do {
      let next = l.next;

      l.next = l.prev;
      l.prev = next;

      if (_i++ > 10000) {
        console.warn("infinite loop error");
        break;
      }
      l = next;
    } while (l !== list.l);

    for (let l of list) {
      l.e = this.getEdge(l.v, l.next.v);
      this._radialInsert(l.e, l);
    }
  }

  reverseWinding(f: Face, lctx?: LogContext): void {
    if (lctx) {
      lctx.killFace(f);
    }

    for (let list of f.lists) {
      for (let l of list) {
        this._radialRemove(l.e, l);
      }

      let l = list.l;
      let _i = 0;
      do {
        let next = l.next;

        l.next = l.prev;
        l.prev = next;

        if (_i++ > 10000) {
          console.warn("infinite loop error");
          break;
        }
        l = next;
      } while (l !== list.l);

      for (let l of list) {
        l.e = this.getEdge(l.v, l.next.v);
        this._radialInsert(l.e, l);
      }
    }

    f.no.negate();
    f.flag |= MeshFlags.UPDATE;

    if (lctx) {
      lctx.newFace(f);
    }

    if (DEBUG_DUPLICATE_FACES) {
      this._checkFace(f, "reverseWinding");
    }

    if (DEBUG_MANIFOLD_EDGES) {
      //this._checkManifold(f, "reverseWinding");
    }
  }

  makeHole(f: Face, vs: Vertex[], customLoopEids?: number, lctx?: LogContext): LoopList {
    if (vs.length === 0) {
      throw new MeshError("makeFace: vs was empty");
    }

    let flag = MeshFlags.MAKE_FACE_TEMP;

    //check for duplicate verts
    for (let v of vs) {
      v.flag &= ~flag;
    }

    for (let v of vs) {
      if (v.flag & flag) {
        throw new MeshError("duplicate verts passed to makeHole");
      }

      v.flag |= flag;
    }

    //make new list

    let list = new LoopList();
    list.length = vs.length;

    f.lists.push(list);
    let lastl, firstl;

    for (let i = 0; i < vs.length; i++) {
      let l = this._makeLoop();

      l.v = vs[i];
      l.list = list;
      l.f = f;

      if (lastl) {
        lastl.next = l;
        l.prev = lastl;
      } else {
        firstl = l;
      }

      lastl = l;
    }

    firstl.prev = lastl;
    lastl.next = firstl;

    list.l = firstl;

    for (let l of list) {
      l.e = this.ensureEdge(l.v, l.next.v, lctx);
      this._radialInsert(l.e, l);
    }

    return list;
  }

  /** trys to connect two verts through exactly
   *  one face, which is split.  returns loop of new split edge*/
  connectVerts(v1, v2, lctx) {
    for (let f of v1.faces) {
      let tot = 0;

      for (let l of f.lists[0]) {
        if (l.v === v1) {
          tot++;
        } else if (l.v === v2) {
          tot++;
        }

        if (tot === 2) {
          break;
        }
      }

      if (tot === 2) {
        //console.log("found face");

        return this.splitFaceAtVerts(f, v1, v2, lctx);
      }
    }
  }

  splitFaceAtVerts(f, v1, v2, lctx) {
    for (let list of f.lists) {
      let l1, l2;

      for (let l of list) {
        if (l.v === v1 || l.v === v2) {
          if (!l1) {
            l1 = l;
          } else if (l !== l1.next && l !== l1.prev) {
            l2 = l;
            break;
          }
        }
      }

      if (l1 && l2) {
        return this.splitFace(f, l1, l2, lctx);
      }
    }

    console.error("Failed to split face", f, v1, v2);
  }

  splitFace(f, l1, l2, lctx, noerror = false) {
    //TODO: handle holes

    if (l1.eid < 0) {
      throw new MeshError("splitFace: l1 is dead");
    }
    if (l2.eid < 0) {
      throw new MeshError("splitFace: l2 is dead");
    }
    if (f.eid < 0) {
      throw new MeshError("splitFace: f is dead");
    }

    if (l1.f !== f || l2.f !== f || l1 === l2 || l2 === l1.next || l2 === l1.prev) {
      if (noerror) {
        return undefined;
      } else {
        console.log(l2 === l1.next, l2 === l1.prev, l1.f !== f, l2.f !== f, l1 === l2);
        throw new MeshError("splitFace: l1 and l2 are bad");
      }
    }

    if (l1.v === l2.v) {
      if (noerror) {
        return undefined;
      } else {
        console.log(l1, l2);
        throw new MeshError("splitFace: l1.v and l2.v were the same");
        return undefined;
      }
    }

    let l = l1;
    let _i = 0;

    do {
      if (_i++ > 1000) {
        throw new MeshError("mesh structure error");
      }

      this._radialRemove(l.e, l);

      l = l.next;
    } while (l !== l1);

    l = l1;
    do {
      if (_i++ > 1000) {
        throw new MeshError("loop l2 not in mesh");
      }
      l = l.next;
    } while (l !== l2);

    let f2 = this._allocFace(0);

    l = l1;
    _i = 0;

    do {
      if (_i++ > 1000) {
        throw new MeshError("loop l2 not in mesh");
      }

      l.f = f2;
      l = l.next;
    } while (l !== l2);

    let list1 = f.lists[0];
    let list2 = new LoopList();
    f2.lists.push(list2);

    list2.flag = list1.flag;

    _i = 0;
    while (list1.l.f === f2) {
      list1.l = list1.l.prev;

      if (_i++ > 1000) {
        throw new MeshError("mesh structure error");
      }
    }

    //l1 goes to new face, l2 stays behind

    let e = this.makeEdge(l1.v, l2.v);

    if (lctx) {
      lctx.newEdge(e, LogTags.SPLIT_FACE);
    }

    this.copyElemData(e, l1.e);

    //this._radialRemove(l1.e, l1);
    //this._radialRemove(l2.e, l2);

    let el1 = this._makeLoop();
    el1.radial_next = el1.radial_prev = undefined;

    let el2 = this._makeLoop();
    el2.radial_next = el2.radial_prev = undefined;

    el1.v = l1.v;
    el1.f = f;
    el1.e = e;

    let l1next = l1.next, l1prev = l1.prev;
    let l2next = l2.next, l2prev = l2.prev;

    l1.prev.next = el1;
    el1.next = l2;
    el1.prev = l1prev;
    el1.v = l1.v;
    el1.e = e;
    el1.list = list1;
    l2.prev = el1;

    this.copyElemData(el1, l1);
    this.copyElemData(el2, l2);
    this.copyElemData(f2, f);

    list2.l = l1;
    l1.prev = el2;
    l1.f = f2;

    el2.v = l2.v;
    el2.f = f2;
    el2.e = e;
    el2.list = list2;
    el2.next = l1;
    el2.prev = l2prev;
    l2prev.next = el2;

    l1.e = this.getEdge(l1.v, l1.next.v);
    l2.e = this.getEdge(l2.v, l2.next.v);

    //this._radialInsert(l1.e, l1);
    //this._radialInsert(l2.e, l2);

    //this._radialInsert(e, el1);
    //this._radialInsert(e, el2);

    for (let list of f.lists) {
      for (let l of list) {
        l.e = this.getEdge(l.v, l.next.v);
        this._radialInsert(l.e, l);
      }
      list._recount();
    }

    for (let list of f2.lists) {
      for (let l of list) {
        l.e = this.getEdge(l.v, l.next.v);
        this._radialInsert(l.e, l);
      }

      list._recount();
    }

    if (lctx) {
      lctx.newFace(f2, LogTags.SPLIT_FACE);
    }

    if (DEBUG_DUPLICATE_FACES) {
      for (let v of el2.e.verts) {
        for (let f of v.faces) {
          this._checkFace(f, "splitFace");
        }
      }
    }

    if (DEBUG_MANIFOLD_EDGES && el2) {
      this._checkManifold(el2.f, "splitFace");
    }

    if (DEBUG_BAD_LOOPS && el2) {
      this._checkElemLoops(el2.e, "splitFace");

      for (let v of el2.e.verts) {
        this._checkElemLoops(v, "splitFace");
      }
    }


    return el2;
  }

  __splitEdgeSimple(e, t = 0.5) {
    let nv = this.makeVertex(e.v1.co);
    nv.co.interp(e.v2.co, t);

    let e1 = this.makeEdge(e.v1, nv);
    let e2 = this.makeEdge(nv, e.v2);

    for (let l of e.loops) {
      let vs = [];
      let ls = [];

      for (let l2 of l.f.lists[0]) {
        vs.push(l2.v);
        ls.push(l2);

        if (l2.e === e) {
          vs.push(nv);
          ls.push(l2);
        }
      }

      this.makeFace(vs);
    }

    this.killEdge(e);

    return [e2, nv];
  }

  splitEdge(e: Edge, t = 0.5, lctx?: LogContext) {
    if (DEBUG_BAD_LOOPS) {
      this._checkElemLoops(e, "splitEdge 0");

      for (let v of e.verts) {
        this._checkElemLoops(v, "splitEdge 1");
      }
    }

    if (!(this.features & MeshFeatures.SPLIT_EDGE))
      throw new MeshFeatureError("splitEdge not supported");

    if (e.eid < 0) {
      throw new MeshError("tried to split deleted edge");
    }

    if (lctx) {
      for (let f of e.faces) {
        lctx.killFace(f, LogTags.SPLIT_EDGE);
      }
    }

    let ret = this._splitEdgeNoFace(e, t, lctx);

    if (e.l === undefined) {
      return ret;
    }

    let ne = ret[0], nv = ret[1];
    let v1 = e.v1, v2 = ne.v2;

    let l = e.l;
    let count = 0;

    do {
      if (count > MAX_EDGE_FACES) {
        console.warn("infinite loop detected in splitEdge");
        break;
      }

      split_temp[count++] = l;

      l = l.radial_next;
    } while (l !== e.l);

    for (let i = 0; i < count; i++) {
      let l = split_temp[i];
      this._radialRemove(l.e, l);
    }

    for (let i = 0; i < count; i++) {
      let l = split_temp[i];

      let lnext = l.next;

      let l2 = this._makeLoop();

      l2.list = l.list;
      l2.f = l.f;

      if (l.v === v1) {
        l2.v = nv;
        l2.e = ne;

        this._radialInsert(ne, l2);
        this._radialInsert(e, l);

        l.next.prev = l2;
        l2.next = l.next;
        l2.prev = l;
        l.next = l2;
      } else {
        l.v = v2;
        l.e = ne;

        l2.v = nv;
        l2.e = e;

        this._radialInsert(ne, l);
        this._radialInsert(e, l2);

        l.next.prev = l2;
        l2.next = l.next;
        l2.prev = l;
        l.next = l2;
      }

      let cdls = splitcd_ls;
      let cdws = splitcd_ws;

      cdws[0] = cdws[1] = 0.5;
      cdls[0] = l;
      cdls[1] = lnext;

      this.loops.customDataInterp(l2, cdls, cdws);

      if (l && l.list) {
        l.list._recount();
      }
    }

    if (lctx) {
      let flag = MeshFlags.MAKE_FACE_TEMP;

      for (let f of e.faces) {
        f.flag &= ~flag;
      }
      for (let f of ne.faces) {
        f.flag &= ~flag;
      }

      for (let f of e.faces) {
        if (!(f.flag & flag)) {
          f.flag |= flag;
          lctx.newFace(f, LogTags.SPLIT_EDGE);
        }
      }

      for (let f of ne.faces) {
        if (!(f.flag & flag)) {
          f.flag |= flag;
          lctx.newFace(f, LogTags.SPLIT_EDGE);
        }
      }
    }

    //prevent reference leaks
    for (let i = 0; i < count; i++) {
      split_temp[i] = undefined;
    }

    if (DEBUG_DUPLICATE_FACES) {
      for (let i = 0; i < 2; i++) {
        let e1 = i ? ne : e;
        for (let v of e1.verts) {
          for (let f of v.faces) {
            this._checkFace(f, "splitEdge");
          }
        }
      }
    }

    if (DEBUG_MANIFOLD_EDGES) {
      this._checkManifold(e, "splitEdge");
      this._checkManifold(ne, "splitEdge");
      this._checkManifold(v1, "splitEdge");
      this._checkManifold(nv, "splitEdge");
      this._checkManifold(v2, "splitEdge");
    }

    if (DEBUG_BAD_LOOPS) {
      this._checkElemLoops(e, "splitEdge 2");
      this._checkElemLoops(v1, "splitEdge 3");
      this._checkElemLoops(nv, "splitEdge 4");
      this._checkElemLoops(ne, "splitEdge 5");
      this._checkElemLoops(v2, "splitEdge 6");
    }

    return ret;
  }

  splitEdgeWhileSmoothing(e, t = 0.5, smoothFac = 0.5, lctx) {
    if (e.eid < 0) {
      throw new MeshError("tried to split deleted edge");
    }

    if (lctx) {
      for (let f of e.faces) {
        lctx.killFace(f, LogTags.SPLIT_EDGE);
      }
    }

    let ret = this._splitEdgeNoFace(e, t, lctx);

    for (let i = 0; i < 3; i++) {
      let v;

      if (i === 0) {
        v = e.v1;
      } else if (i === 1) {
        v = ret[1];
      } else {
        v = ret[0].v2;
      }

      let x = 0.0, y = 0.0, z = 0.0;
      let tot = 0.0;

      for (let e2 of v.edges) {
        let v2 = e2.otherVertex(v);

        x += v2[0];
        y += v2[1];
        z += v2[2];
        tot++;
      }

      if (tot) {
        tot = 1.0 / tot;
        x *= tot;
        y *= tot;
        z *= tot;

        v[0] += (x - v[0]) * smoothFac;
        v[1] += (y - v[1]) * smoothFac;
        v[2] += (z - v[2]) * smoothFac;
      }
    }

    if (e.l === undefined) {
      return ret;
    }

    let ne = ret[0], nv = ret[1];
    let v1 = e.v1, v2 = ne.v2;

    let l = e.l;
    let count = 0;

    do {
      if (count > MAX_EDGE_FACES) {
        console.warn("infinite loop detected in splitEdge");
        break;
      }

      split_temp[count++] = l;

      l = l.radial_next;
    } while (l !== e.l);

    for (let i = 0; i < count; i++) {
      let l = split_temp[i];
      this._radialRemove(l.e, l);
    }

    for (let i = 0; i < count; i++) {
      let l = split_temp[i];

      let lnext = l.next;

      let l2 = this._makeLoop();

      l2.list = l.list;
      l2.f = l.f;

      if (l.v === v1) {
        l2.v = nv;
        l2.e = ne;

        this._radialInsert(ne, l2);
        this._radialInsert(e, l);

        l.next.prev = l2;
        l2.next = l.next;
        l2.prev = l;
        l.next = l2;
      } else {
        l.v = v2;
        l.e = ne;

        l2.v = nv;
        l2.e = e;

        this._radialInsert(ne, l);
        this._radialInsert(e, l2);

        l.next.prev = l2;
        l2.next = l.next;
        l2.prev = l;
        l.next = l2;
      }

      let cdls = splitcd_ls;
      let cdws = splitcd_ws;

      cdws[0] = cdws[1] = 0.5;
      cdls[0] = l;
      cdls[1] = lnext;

      this.loops.customDataInterp(l2, cdls, cdws);

      if (l && l.list) {
        l.list._recount();
      }
    }

    if (lctx) {
      let flag = MeshFlags.MAKE_FACE_TEMP;

      for (let f of e.faces) {
        f.flag &= ~flag;
      }
      for (let f of ne.faces) {
        f.flag &= ~flag;
      }

      for (let f of e.faces) {
        if (!(f.flag & flag)) {
          f.flag |= flag;
          lctx.newFace(f, LogTags.SPLIT_EDGE);
        }
      }

      for (let f of ne.faces) {
        if (!(f.flag & flag)) {
          f.flag |= flag;
          lctx.newFace(f, LogTags.SPLIT_EDGE);
        }
      }
    }

    //prevent reference leaks
    for (let i = 0; i < count; i++) {
      split_temp[i] = undefined;
    }

    if (DEBUG_DUPLICATE_FACES) {
      for (let i = 0; i < 2; i++) {
        let e1 = i ? ne : e;
        for (let v of e1.verts) {
          for (let f of v.faces) {
            this._checkFace(f, "splitEdge");
          }
        }
      }
    }

    if (DEBUG_MANIFOLD_EDGES) {
      this._checkManifold(e, "splitEdge");
      this._checkManifold(ne, "splitEdge");
      this._checkManifold(v1, "splitEdge");
      this._checkManifold(nv, "splitEdge");
      this._checkManifold(v2, "splitEdge");
    }

    if (DEBUG_BAD_LOOPS) {
      this._checkElemLoops(e, "splitEdge 2");
      this._checkElemLoops(v1, "splitEdge 3");
      this._checkElemLoops(nv, "splitEdge 4");
      this._checkElemLoops(ne, "splitEdge 5");
      this._checkElemLoops(v2, "splitEdge 6");
    }

    return ret;
  }

  _radialInsert(e, l) {
    if (e.l === undefined) {
      e.l = l;
      l.radial_next = l.radial_prev = l;
    } else {
      l.radial_prev = e.l;
      l.radial_next = e.l.radial_next;
      e.l.radial_next.radial_prev = l;
      e.l.radial_next = l;
    }
  }

  pruneWireGeometry(vertices = this.verts, lctx) {
    let update = false;

    const verts = ReusableIter.getSafeIter<Vertex>(vertices);

    let edges = new Set<Edge>();
    for (let v of verts) {
      for (let e of v.edges) {
        edges.add(e);
      }
    }

    for (let e of edges) {
      if (!e.l) {
        this.killEdge(e, lctx);
        update = true;
      }
    }

    for (let v of verts) {
      if (v.valence === 0) {
        this.killVertex(v, undefined, lctx);
        update = true;
      }
    }

    if (update) {
      this.regenTessellation();
      this.regenRender();
    }

    return update;
  }

  _radialRemove(e, l) {
    if (e.l === l) {
      e.l = l === l.radial_next ? undefined : l.radial_next;
    }

    l.radial_next.radial_prev = l.radial_prev;
    l.radial_prev.radial_next = l.radial_next;
  }

  joinTwoEdges(v, lctx) {
    if (v.valence !== 2) {
      throw new MeshError("vertex valence must be 2");
    }

    let e1, e2;

    for (let e of v.edges) {
      if (!e1)
        e1 = e
      else if (!e2)
        e2 = e;
    }

    let v1 = e1.otherVertex(v), v2 = e2.otherVertex(v);

    v1.flag |= MeshFlags.UPDATE;
    v2.flag |= MeshFlags.UPDATE;

    if (!e1.l && !e2.l) {
      if (lctx) {
        lctx.killEdge(e1);
      }

      this._diskRemove(v, e1);

      if (e1.v1 === v) {
        e1.v1 = v2;
      } else {
        e1.v2 = v2;
      }

      this._diskInsert(v2, e1);

      if (lctx) {
        lctx.newEdge(e1);
      }

      this.killEdge(e2, lctx);

      if (DEBUG_MANIFOLD_EDGES) {
        this._checkManifold(e1, "joinTwoEdges");
      }

      if (DEBUG_BAD_LOOPS) {
        this._checkElemLoops(e1, "joinTwoEdges");

        for (let v of e1.verts) {
          this._checkElemLoops(v, "joinTwoEdges");
        }
      }

      return undefined;
    }

    let count = 0;
    let flag = MeshFlags.TEMP4;
    let flag2 = MeshFlags.TEMP5;

    for (let i = 0; i < 2; i++) {
      let e = i ? e2 : e1;
      for (let l of e.loops) {
        l.f.flag &= ~(flag | flag2);
      }
    }
    for (let i = 0; i < 2; i++) {
      let e = i ? e2 : e1;
      for (let l of e.loops) {
        if (!(l.f.flag & flag)) {
          l.f.flag |= flag;
          count++;
        }
      }
    }

    let fs = getArrayTemp<Face>(count);
    let fi = 0;

    for (let i = 0; i < 2; i++) {
      let e = i ? e2 : e1;
      for (let l of e.loops) {
        if (!(l.f.flag & flag2)) {
          l.f.flag |= flag2;
          fs[fi++] = l.f;
        }
      }
    }

    for (let f of fs) {
      if (f.isTri()) {
        this.killFace(f);
        continue;
      }

      f.flag |= MeshFlags.UPDATE;

      for (let l of f.loops) {
        l.v.flag |= MeshFlags.UPDATE;
        l.e.flag |= MeshFlags.UPDATE;

        this._radialRemove(l.e, l);
      }
    }

    for (let f of fs) {
      if (f.eid < 0) {
        continue;
      }

      for (let i = 0; i < f.lists.length; i++) {
        let list = f.lists[i];
        let l = list.l;
        let _i = 0;

        do {
          if (_i++ > 1000000) {
            console.warn("infinite loop error");
            break;
          }

          let next = l.next;

          if (l.v === v) {
            if (list.l === l) {
              list.l = l.next;

              if (list.l === l || list.l.next === l) {
                this._killLoop(l);

                f.lists.remove(list);
                i--;

                if (f.lists.length === 0) {
                  this.killFace(f, lctx);
                  break;
                }

                continue;
              }
            }

            l.next.prev = l.prev;
            l.prev.next = l.next;
            this._killLoop(l);
          }

          l = next;
        } while (l !== list.l);

        if (f.eid < 0) {
          break;
        }
      }
    }

    let e0 = this.getEdge(v1, v2);
    if (!e0) {
      e0 = e1;
      this._diskRemove(v, e1);

      if (e1.v1 === v) {
        e1.v1 = v2;
      } else {
        e1.v2 = v2;
      }

      this._diskInsert(v2, e1);
    } else {
      this.killEdge(e1, lctx);
    }

    this.killEdge(e2, lctx);

    for (let f of fs) {
      if (f.eid < 0) {
        continue;
      }

      this._fixFace(f, lctx, false, true);
    }

    for (let i = 0; i < fs.length; i++) {
      fs[i] = undefined; //prevent reference leak
    }

    this.killVertex(v);

    if (DEBUG_DUPLICATE_FACES) {
      for (let v of e0.verts) {
        for (let f of v.faces) {
          this._checkFace(f, "joinTwoVerts");
        }
      }
    }

    if (DEBUG_MANIFOLD_EDGES && e0) {
      this._checkManifold(e0, "joinTwoVerts");
    }

    return e0;
  }

  _fixFace2(f, lctx, is_linked = true) {
    for (let list of f.lists) {
      for (let l of list) {
        this._radialRemoveSafe(l.e, l);
      }
    }

    let tag = MeshFlags.FACE_EXIST_FLAG;

    for (let i = 0; i < f.lists.length; i++) {
      let list = f.lists[i];

      let l = list.l;

      let _i = 0;
      do {
        if (l.v === l.next.v) {
          console.warn("Duplicate verts in face 1");

          if (list.l === l) {
            list.l = l.next;
          }

          if (list.l === l) {
            break;
          }

          l.next.prev = l.prev;
          l.prev.next = l.next;

          this._killLoop(l);
        }

        l.v.flag |= tag;

        if (_i++ > 10000) {
          console.warn("Infinite loop error!");
          break;
        }
      } while ((l = l.next) !== list.l);

      if (list.length < 3) {
        f.lists.remove(list);
        i--;
      }
    }

    if (f.lists.length === 0) {
      this._freeFace(f);
      return undefined;
    }

    for (let list of f.lists) {
      for (let l of list) {
        let ok;

        if (l.e) {
          ok = (l.e.v1 === l.v && l.e.v2 === l.next.v);
          ok = ok || (l.e.v2 === l.v && l.e.v1 === l.next.v)
          ok = ok && (l.e.eid >= 0);
        } else {
          ok = false;
        }

        //if (!ok) {
        l.e = this.ensureEdge(l.v, l.next.v);
        //}

        this._radialInsert(l.e, l);
      }
    }

    return f;
  }

  _fixFace(f, lctx?: LogContext, f_is_linked = true, relink = true, warn = true) {
    return this._fixFace2(f, lctx, f_is_linked);

    let ret = false;

    let _unlink = !f_is_linked;
    let this2 = this;

    function unlink() {
      if (_unlink) {
        return;
      }

      _unlink = true;
      relink = true;

      for (let l of f.loops) {
        if (l.e) {
          this2._radialRemove(l.e, l);
        }
      }
    }

    for (let list of f.lists) {
      let l = list.l;
      let _i = 0;

      do {
        let next = l.next;

        if (_i++ > MAX_FACE_VERTS * 2) {
          console.warn("_fixFace: infinite loop error");
          break;
        }

        while (l.v === next.v) {
          if (warn) {
            console.warn("_fixFace: duplicate loop verts", l);
          }
          ret = true;

          unlink();

          if (_i++ > MAX_FACE_VERTS * 2) {
            console.warn("_fixFace: infinite loop error");
            break;
          }

          l.next.prev = l.prev;
          l.prev.next = l.next;

          if (l === l.list.l) {
            l.list.l = l.next;
          }

          if (l === l.list.l) {
            l.list.l = undefined;
            l.list.count = 0;

            this._killLoop(l);
            break;
          }

          this._killLoop(l);

          l = next;
          next = l.next;
        }

        l = next;
      } while (l !== list.l);
    }

    for (let i = 0; i < f.lists.length; i++) {
      if (!f.lists[i].l) {
        f.lists.remove(f.lists[i]);
        i--;
      }
    }

    if (f.lists.length === 0) {
      this.killFace(f);
      relink = false;
    }

    if (relink) {
      for (let l of f.loops) {
        l.e = this.ensureEdge(l.v, l.next.v, lctx);
        this._radialInsert(l.e, l);
      }
    }

    return ret;
  }

  dissolveVertex(v, lctx) {
    const dolog = false;

    if (!(this.features & MeshFeatures.JOIN_EDGE))
      throw new MeshFeatureError("dissolveVertex not supported");

    //handle case of two-valence vert with no surrounding faces
    let e1, e2;
    for (let e of v.edges) {
      if (!e1) {
        e1 = e;
      } else {
        e2 = e;
      }
    }

    if (v.valence === 2 && !e1.l && !e2.l) {
      let v1 = e1.otherVertex(v);
      let v2 = e2.otherVertex(v);


      let e = this.ensureEdge(v1, v2);
      this.copyElemData(e, e1);

      this.killVertex(v, undefined, lctx, LogTags.DISSOLVE_VERT);
      return;
    }

    let flag1 = MeshFlags.TEMP3;
    let flag2 = MeshFlags.TEMP4;
    let flag3 = MeshFlags.TEMP5;

    let allflags = flag1 | flag2 | flag3;

    for (let e of v.edges) {
      e.flag &= ~allflags;

      for (let l of e.loops) {
        l.f.flag &= ~allflags;

        for (let l2 of l.f.loops) {
          l2.v.flag &= ~allflags;
          l2.e.flag &= ~allflags;
          l2.flag &= ~allflags;

          for (let e2 of l2.v.edges) {
            e2.flag &= ~allflags;

            for (let l3 of e2.loops) {
              l3.flag &= ~allflags;
              l3.v.flag &= ~allflags;
              l3.f.flag &= ~allflags;
            }
          }
        }
      }
    }

    let startl = undefined;
    let boundary = false;

    for (let e of v.edges) {
      if (e.l && e.l.radial_next === e.l) {
        boundary = true;
        break;
      }
    }

    if (boundary && v.valence === 2) {
      let l;

      for (let e of v.edges) {
        for (let l2 of e.loops) {
          l = l2;
          break;
        }

        if (l) {
          break;
        }
      }

      if (!l || l.f.lists[0].length < 4) {
        //throw new MeshError("Cannot dissolve vertex");
        console.warn("Cannot dissolve vertex");
        return;
      }

      if (lctx) {
        lctx.killFace(l.f);
      }

      if (l.prev.v === v) {
        l = l.prev;
      } else if (l.next.v === v) {
        l = l.next;
      }

      let v1 = l.prev.v;
      let v2 = v;
      let v3 = l.next.v;
      let f = l.f;

      if (l === l.list.l) {
        l.list.l = l.next;
      }

      if (l === l.list.l) {
        l.list.l = undefined;
        this._freeFace(f);
        this._killLoop(l);
        return;
      }

      this._radialRemove(l.prev.e, l.prev);
      this._radialRemove(l.e, l);
      this._radialRemove(l.next.e, l.next);

      let e2 = this.ensureEdge(v1, v3, lctx);
      this.copyElemData(e2, l.e);

      this.killEdge(l.prev.e);
      this.killEdge(l.e);

      //unlink loop
      l.prev.next = l.next;
      l.next.prev = l.prev;

      let l1 = l.prev;
      let l2 = l.next;

      l1.e = this.ensureEdge(l1.v, l1.next.v);
      l2.e = this.ensureEdge(l2.v, l2.next.v);
      this._radialInsert(l1.e, l1);
      this._radialInsert(l2.e, l2);

      this._killLoop(l);

      this.killVertex(v, undefined, lctx);

      if (lctx) {
        lctx.newFace(f);
      }

      return;
    }


    if (boundary) {
      console.warn("Cannot dissolve boundary vertex");
      return;
    }

    v.flag |= flag3;

    let count = 0;
    //for (let f of v.faces) {
    for (let e1 of v.edges) {
      for (let l1 of e1.loops) {
        let f = l1.f;

        for (let l of f.loops) {
          if (!startl && l.e.v1 !== v && l.e.v2 !== v) {
            startl = l;
          }

          l.flag |= flag1;
          l.f.flag |= flag1;

          if (l.e.v1 !== v && l.e.v2 !== v) {
            l.e.flag |= flag1;
            l.e.flag &= ~flag2;
            //this.setSelect(l.e, true);
          } else {
            l.e.flag &= ~flag1;
            //this.setSelect(l.e, false);
          }

          if (!(l.v.flag & flag3)) {
            l.v.flag |= flag3;
            count++;
          }
        }
      }
    }

    //return;
    if (!startl) {
      this.killVertex(v, undefined, lctx, LogTags.DISSOLVE_VERT);
      return;
    }

    if (dolog) console.log("startl", startl);

    if (dolog) console.log("veid", v.eid, "count:", count, startl);
    let ls: Loop[] = getArrayTemp(count);


    let vi = 0;
    let l = startl;

    startl.e.flag |= flag2;

    for (let e of v.edges) {
      e.flag |= flag2;
    }

    for (let i = 0; i < count * 2; i++) {
      ls[vi++] = l;

      l.v.flag |= flag2;

      let nexte = undefined;

      for (let e of l.v.edges) {
        if (dolog) console.log("  " + l.e.eid, e.eid, "  ", !!e.l, e.flag & flag1, e.flag & flag2);

        if (!e.l) { //e === l.e || !e.l || e.v1 === v || e.v2 === v) {
          continue;
        }

        if (!(e.flag & flag1) || (e.flag & flag2)) {
          continue;
        }

        nexte = e;
        break;
      }

      if (dolog) console.log("nexte:", nexte ? nexte.eid : "undefined");

      if (!nexte) {
        break;
      }

      nexte.flag |= flag2;

      if (nexte.l.v === l.v) {
        l = nexte.l.next;
      } else {
        l = nexte.l;
      }

      if (nexte === startl.e) {
        if (l.v !== startl.v) {// && !(l.v.flag & flag2)) {
          ls[vi++] = l;
          l.v.flag |= flag2;
        }

        break;
      }
    }

    if (dolog) console.log("vi", vi, "count", count);

    if (ls.length !== vi) {
      ls = reallocArrayTemp(ls, vi);
    }

    for (let l of ls) {
      l.v.flag &= ~(flag1 | flag2);
    }

    let ls2: Loop[] = getArrayTemp<Loop>(ls.length);
    let li = 0;

    for (let l of ls) {
      if (!(l.v.flag & flag1)) {
        ls2[li++] = l;
      }

      l.v.flag |= flag1;
    }

    if (ls2.length !== li) {
      ls2 = reallocArrayTemp(ls2, li) as unknown as Loop[];
    }

    let vs = getArrayTemp<Vertex>(li);

    if (dolog) console.log("vs", vs.length);

    vi = 0;

    for (let l of ls2) {
      vs[vi++] = l.v;
    }

    let f;
    let ok = vs.length > 2;
    let flag = MeshFlags.COLLAPSE_TEMP;

    //set up flags to detect non-manifold error
    for (let i = 0; ok && i < vs.length; i++) {
      let v1 = vs[i], v2 = vs[(i + 1) % vs.length];
      let e = this.getEdge(v1, v2);

      if (!e) {
        continue;
      }

      for (let l of e.loops) {
        l.f.flag &= ~flag;
      }
    }

    //flag the faces we are going to delete with killVertex. . .
    for (let f of v.faces) {
      f.flag |= flag;
    }

    for (let i = 0; ok && i < vs.length; i++) {
      let v1 = vs[i], v2 = vs[(i + 1) % vs.length];
      let e = this.getEdge(v1, v2);

      if (!e) {
        continue;
      }

      let count = 0;
      for (let f of e.faces) {
        if (!(f.flag & flag)) {
          count++;
        }
      }

      if (count > 1) {
        console.error("NON-MANIFOLD IN DISSOLVE VERTEX!", count, v, Array.from(vs));
        ok = false;
      }
    }

    if (ok) {
      //let e = this.ensureEdge(vs[0], vs[1], lctx);
      //if (e.l && e.l.v === vs[0]) {
      //  vs.reverse();
      //}

      f = this.makeFace(vs, undefined, undefined, lctx, LogTags.DISSOLVE_VERT);
      li = 0;

      for (let l of f.loops) {
        if (li === 0) {
          this.copyElemData(f, ls[li].f);
        }

        this.copyElemData(l, ls[li]);
        li++;
      }

      if (DEBUG_BAD_LOOPS) {
        this._checkElemLoops(v, "dissolveVertex");
      }

      this.killVertex(v, undefined, lctx, LogTags.DISSOLVE_VERT);
    } else {
      return;
    }

    //prevent reference leaks
    for (let i = 0; i < vs.length; i++) {
      vs[i] = undefined;
    }
    for (let i = 0; i < ls.length; i++) {
      let l = ls[i];

      //make sure we deleted all faces
      //if (l.eid >= 0 && l.f && l.f.eid >= 0) {
      //  this.killFace(l.f, lctx);
      //}
      ls[i] = undefined;
    }

    for (let i = 0; i < ls2.length; i++) {
      ls2[i] = undefined;
    }

    if (f) {
      //check winding
      let totbad = 0;
      let checkexist = false;
      let deletef = false;

      let totm1 = 0, totm2 = 0, totm3 = 0;

      for (let l of f.loops) {
        if (l.radial_next === l) {
          totm1++;
        } else if (l.radial_next.radial_next === l) {
          totm2++;
        } else {
          totm3++;
        }

        //are we a non-manifold edge?
        if (l.radial_next !== l && l.radial_next.radial_next !== l) {
          checkexist = true;
        }

        totbad += l.radial_next !== l && l.radial_next.v === l.v ? 1 : -1;
      }

      if (0 && checkexist) {
        let f2 = this.getFace(f.verts);
        if (f2) {
          this.killFace(f, lctx, LogTags.DISSOLVE_VERT);
          f = f2;
        }
      } else if (totm3 > totm2) {
        this.killFace(f, lctx, LogTags.DISSOLVE_VERT);
        return undefined;
      } else if (totbad > 0) {
        this.reverseWinding(f, lctx);
      }

      if (DEBUG_DUPLICATE_FACES) {
        this._checkFace(f, "dissolveVertex");
      }

      if (DEBUG_MANIFOLD_EDGES) {
        this._checkManifold(f, "dissolveVertex");

        for (let v of f.verts) {
          this._checkManifold(v, "dissolveVertex");
        }
      }
    }

    if (DEBUG_BAD_LOOPS && f) {
      for (let v of f.verts) {
        this._checkElemLoops(v, "dissolveVertex");
      }

      this._checkFaceLoops(f, "dissolveVertex");
    }

    return f;
  }

  rotateEdge(e: Edge, dir = 1, lctx?: LogContext) {
    if (!e.l) {
      return;
    }

    let bad = e.l.radial_next === e.l || e.l.v === e.l.radial_next.v;
    bad = bad || e.l.radial_next.radial_next !== e.l;

    if (bad) {
      console.warn("cannot rotate edge " + e.eid);
      return;
    }

    let eid = e.eid;
    let flag = e.flag;
    let act = e === this.edges.active;

    let l1 = e.l, l2 = e.l.radial_next;
    let l1b = l1.prev, l2b = l2.prev;

    let customData = e.customData;

    if (l1b.v === l2b.v || l1b === l2b) {
      return;
    }

    if (this.getEdge(l1b.v, l2b.v)) {
      console.warn("cannot rotate edge: " + e.eid);
      return; //can't dissolve
    }

    let f1 = this.dissolveEdge(e, lctx);

    if (!f1) {
      return;
    }

    e = undefined;

    let el2 = this.splitFace(f1, l1b, l2b, lctx);
    let e2 = el2.e;

    if (e2) {
      e2.customData = customData;

      if (act) {
        this.edges.active = e2;
      }

      e2.flag = flag & ~MeshFlags.SELECT;

      if (lctx) {
        lctx.killEdge(e2);
      }

      //XXX this does not work, produces bug in eidgen's freelist
      //this.setEID(e2, eid);

      //logctx may have selected the edge
      flag = flag & ~MeshFlags.SELECT;
      e2.flag = flag | (e2.flag & MeshFlags.SELECT);

      if (!(e2.flag & MeshFlags.SELECT) || (flag & MeshFlags.SELECT)) {
        this.edges.setSelect(e2, true);
      }

      if (lctx) {
        lctx.newEdge(e2);
      }
    }

    if (DEBUG_DUPLICATE_FACES) {
      for (let f of e2.faces) {
        this._checkFace(f, "rotateEdge");
      }
    }
    if (DEBUG_MANIFOLD_EDGES) {
      this._checkManifold(e2, "rotateEdge");
    }

    if (DEBUG_BAD_LOOPS) {
      this._checkElemLoops(e2, "rotateEdge");
    }

    return e2;
  }

  setEID(elem, eid) {
    let elist = this.elists.get(elem.type);

    if (elem.eid >= 0) {
      this.eidgen.free(elem.eid);
    }

    this.eidgen.reserve(eid);

    this.eidMap.delete(elem.eid);
    elist.setEID(elem, eid);
    this.eidMap.set(eid, elem);

    this._recalcEidMap = true;

    return this;
  }

  _checkEdge(e, msg) {
    if (e.faceCount > 2) {
      throw new Error("Manifold error in " + e.eid + ": " + msg);
    }
  }

  _checkManifold(geom, msg) {
    let istmp = false;
    if (geom instanceof Element) {
      let tmp = getArrayTemp(1);
      tmp[0] = geom;
      geom = tmp;
      istmp = true;
    }

    for (let elem of geom) {
      switch (elem.type) {
        case MeshTypes.VERTEX:
          for (let e of (elem as Vertex).edges) {
            this._checkEdge(e, msg);
          }
          break;
        case MeshTypes.EDGE:
          this._checkEdge(elem as Edge, msg);
          break;
        case MeshTypes.LOOP:
          this._checkEdge((elem as Loop).e, msg);
          break;
        case MeshTypes.FACE:
          for (let e of (elem as Face).edges) {
            this._checkEdge(e, msg);
          }
          break;
      }
    }

    if (istmp) {
      geom[0] = undefined; //clear reference
    }
  }

  _checkFaceLoops(f, msg) {
    if (f.eid < 0) {
      throw new MeshError("f was freed?");
    }

    for (let list of f.lists) {
      for (let l of list) {
        if (l.eid < 0) {
          console.log(list, l);

          throw new MeshError(`face ${f.eid} had bad loops`);
        }
      }
    }
  }

  _checkFace(f_or_vs, msg, noerror = false) {
    if (f_or_vs !== undefined && f_or_vs instanceof Face && f_or_vs.eid < 0) {
      if (noerror) {
        return false;
      } else {
        throw new Error("_checkFace called with deleted face");
      }
    }

    let bad;

    let vs, f;
    if (f_or_vs instanceof Face) {
      f = f_or_vs;
      let count = 0;

      for (let v of f.verts) {
        count++;
      }

      vs = getArrayTemp(count);
      let i = 0;

      for (let v of f.verts) {
        vs[i++] = v;
      }
    } else {
      vs = Array.from(f_or_vs);
    }
    if (f !== undefined) {
      bad = this.countDuplicateFaces(vs) !== 1;
    } else {
      bad = this.countDuplicateFaces(vs) > 1;
    }

    function end() {
      if (f_or_vs instanceof Face) {
        for (let i = 0; i < vs.length; i++) {
          vs[i] = undefined;
        }
      }
    }

    if (bad) {
      let count = this.countDuplicateFaces(vs);

      if (noerror) {
        end();
        return false;
      } else {
        console.log(f, vs);
        end();
        throw new Error("Duplicate face error in " + msg + "; count was: " + count);
      }
    }

    end();
    return true;
  }


  dissolveEdge(e: Edge, lctx?: LogContext): Face | undefined {
    if (!e.l) {
      this.killEdge(e, undefined, lctx);
      return;
    }

    if (e.l === e.l.radial_next) {
      console.error("cannot dissolve boundary edges");
      return;
    }

    if (e.l.radial_prev !== e.l.radial_next) {
      console.error("splitting non-manifold radial cycle");

      /*split the radial cycle if we're non-manifold*/
      let es = [e];

      let _i = 0;
      while (e.l.radial_prev !== e.l.radial_next) {
        if (_i++ > 100) {
          console.error("infinite loop error");
          break;
        }

        let e2 = this.makeEdge(e.v1, e.v2, false);
        es.push(e2);

        let l1 = e.l;
        let l2 = e.l.radial_next;

        this._radialRemove(e, l1);
        this._radialRemove(e, l2);

        l1.e = e2;
        l2.e = e2;
        this._radialInsert(e2, l1);
        this._radialInsert(e2, l2);
      }

      let f = undefined;

      for (let e2 of es) {
        let f2 = this.dissolveEdge(e2);
        if (f2 && !f) {
          f = f2;
        }
      }

      return f;
    }

    let l1 = e.l;
    let l2 = e.l.radial_next;

    if (l1.f === l2.f && e.v1.valence === 1 || e.v2.valence === 1) {
      console.warn("Intruding edge!");

      let v = e.v1.valence > 1 ? e.v1 : e.v2;

      this.collapseEdge(e, v, lctx);
      return;
    }

    if (l2.v === l1.v) {
      console.error("dissolveEdge: fixing winding");
      this.reverseWinding(l2.f);

      l1 = e.l;
      l2 = e.l.radial_next;
    }

    let f1 = l1.f;
    let f2 = l2.f;

    let l2list = l2.list;

    if (f1.lists.length > 1 || f2.lists.length > 1) {
      //console.error("IMPLEMENT me: holes in dissolveEdge!");
      //return;
    }

    /*
    | |             ^
    | v             |
    | ------l2------>
    |=================
    | <-----l1-------
    | |             ^
    | v             |


     */

    for (let list of f1.lists) {
      for (let l of list) {
        this._radialRemove(l.e, l);
        l.radial_next = l.radial_prev = l;
      }
    }

    if (f2 !== f1) {
      for (let list of f2.lists) {
        for (let l of list) {
          this._radialRemove(l.e, l);
          l.radial_next = l.radial_prev = l;
        }
      }
    }

    if (l1 === l1.list.l) {
      l1.list.l = l1.next;
    }

    if (l1 === l1.list.l && f1 === f2) {
      l1.list.l = l1.next;
    }

    l1.prev.next = l2.next;
    l1.next.prev = l2.prev;

    l2.next.prev = l1.prev;
    l2.prev.next = l1.next;

    let l3 = l1.prev;
    let l4 = l2.prev;

    if (l1 === l1.list.l) {
      this._killLoop(l1);
      this._killLoop(l2);

      console.error("Emply face is dissolveEdge");
      this._freeFace(f1);
      return;
    }

    let _i = 0;

    let count1 = 0;
    let lc = l3;
    do {
      if (_i++ > 1000) {
        console.error("infinite loop error");
        break;
      }

      count1++;
    } while ((lc = lc.next) !== l3);

    let count2 = 0;
    lc = l4;
    do {
      if (_i++ > 1000) {
        console.error("infinite loop error");
        break;
      }

      count2++;
    } while ((lc = lc.next) !== l4);

    console.error("count1,2", count1, count2, l1.list.length, l2.list.length);

    if (count1 !== l1.list.length + l2.list.length - 2 || count1 !== count2) {
      console.error("Dissolving created a hole", count1, count2, l1.list.length, l2.list.length);

      let list = new LoopList();
      list.l = l4;

      f1.lists.push(list);
    }

    this._killLoop(l1);
    this._killLoop(l2);

    if (f2 !== f1) {
      for (let list of f2.lists) {
        if (list !== l2list) {
          f1.lists.push(list);
        }
      }

      f2.lists.length = 0;
      this._freeFace(f2);
    }

    for (let list of f1.lists) {
      let count = 0;
      let _i = 0;

      for (let l of list) {
        l.list = list;
        l.f = f1;

        if (_i++ > 100) {
          console.error("infinite loop error");
          debugger;

          this._freeFace(f1);
          return undefined;
        }

        count++;
      }

      list.length = count;
    }

    this.killEdge(e);

    for (let list of f1.lists) {
      for (let l of list) {
        l.list = list;
        l.f = f1;

        if (l.v !== l.next.v) {
          l.e = this.ensureEdge(l.v, l.next.v);
          this._radialInsert(l.e, l);
        }
      }
    }

    this._fixFace(f1);

    f1.ensureBoundaryFirst();
    return f1;
  }


  _dissolveEdge(e, lctx = undefined) {
    if (!e.l || e.l === e.l.radial_next) {
      this.killEdge(e, undefined, lctx);
      return;
    }

    let l1 = e.l;
    let l2 = e.l.radial_next;

    if (l2.radial_next !== l1) {
      //non-manifold face
      console.warn("Non-manifold face!", l1.e, l1.f, l2.f);
      return undefined;
    }

    if (l1.f === l2.f) {
      console.warn("Intruding edge!");

      let f = l1.f;

      for (let list of f.lists) {
        for (let l of list) {
          this._radialRemove(l.e, l);
          l.list = list;
        }
      }

      if (l1.list.l === l1) {
        l1.list.l = l1.list.l.next;
      }
      if (l2.list.l === l2) {
        l2.list.l = l2.list.l.next;
      }

      l1.list.length--;
      l2.list.length--;

      for (let i = 0; i < f.lists.length; i++) {
        let list = f.lists[i];
        if (list.length < 3) {
          f.lists.remove(list);
          i--;
        }
      }

      if (f.lists.length === 0) {
        this.killFace(f, lctx);
        if (DEBUG_MANIFOLD_EDGES) {
          this._checkManifold(e, "dissolveEdge");
        }
        return undefined;
      }

      if (l1.list.l !== l2.list.l) {
        console.warn("Tried to join holes in wrong way");
        return undefined;
      }

      l1.prev.next = l2.next;
      l1.next.prev = l2.prev;

      l2.next.prev = l1.prev;
      l2.prev.next = l1.next;

      if (l1.eid >= 0) {
        this._killLoop(l1);
      }
      if (l2.eid >= 0) {
        this._killLoop(l2);
      }

      //filter out any bad loops
      for (let list of f.lists) {
        let l = list.l;
        let _i = 0;

        do {
          if (_i++ > 100000) {
            console.warn("infinite loop error");
            break;
          }

          if (l.eid < 0 || l.next.v === l.v) {
            list.length--;

            l.prev.next = l.next;
            l.next.prev = l.prev;

            if (l === list.l && l.next === l) {
              list.length = 0;
              list.l = undefined;
            } else if (l === list.l) {
              list.l = l.next;
            }
          }

          l = l.next;
        } while (l !== list.l);
      }

      for (let i = 0; i < f.lists.length; i++) {
        if (f.lists[i].length < 3) {
          f.lists.remove(f.lists[i]);
          i--;
        }
      }

      if (f.lists.length === 0) {
        this.killFace(f, lctx);
        return undefined;
      }

      for (let l of f.loops) {
        if (l === l.next) {
          console.warn("Dissolve error", l);

          for (let list of l.f.lists) {
            if (list !== l.list) {
              for (let l2 of list) {
                if (l2.eid >= 0) {
                  this._killLoop(l2);
                }
              }
            }
          }

          if (l.eid >= 0) {
            this._killLoop(l);
          }
          if (f.eid >= 0) {
            this._freeFace(f);
          }

          if (lctx) {
            lctx.killFace(f);
          }

          return undefined;
        }
      }

      for (let l of f.loops) {
        l.e = this.ensureEdge(l.v, l.next.v, lctx);
        this._radialInsert(l.e, l);
      }

      this.killEdge(e, lctx);

      if (DEBUG_DUPLICATE_FACES) {
        this._checkFace(f, "dissolveEdge");
      }

      return;
    }

    if (l1.v === l2.v) {
      this.reverseWinding(l2.f);
      l1 = e.l;
      l2 = e.l.radial_next;
    }

    let f1 = l1.f;
    let f2 = l2.f;

    if (f1 === f2) {
      console.warn("Dissolve error");
      return;
    }

    for (let l of f1.loops) {
      this._radialRemove(l.e, l);
    }
    for (let l of f2.loops) {
      this._radialRemove(l.e, l);
    }

    for (let list of f1.lists) {
      if (list.l === l1) {
        list.l = list.l.next;
      }
    }

    //f1 is kept
    for (let list of f2.lists) {
      if (list.l === l2) {
        list.l = l2.next;
      }
      for (let l of list) {
        l.f = f1;
      }

      if (list === f2.lists[0]) {
        for (let l of list) {
          l.list = f1.lists[0];
        }

        continue;
      } else {
        f1.lists.push(list);
      }
    }

    /*
    | |             ^
    | v             |
    | ------l2------>
    |=================
    | <-----l1-------
    | |             ^
    | v             |


     */

    l1.prev.next = l2.next;
    l1.next.prev = l2.prev;

    l2.next.prev = l1.prev;
    l2.prev.next = l1.next;

    this._killLoop(l1);
    this._killLoop(l2);

    if (lctx) {
      lctx.killFace(f2);
    }

    this._freeFace(f2);

    //filter out any bad loops
    for (let list of f1.lists) {
      let l = list.l;
      let _i = 0;

      do {
        if (l.eid < 0 || l.next.v === l.v) {
          list.length--;

          l.prev.next = l.next;
          l.next.prev = l.prev;

          if (l === list.l && l.next === l) {
            list.length = 0;
            list.l = undefined;
          } else if (l === list.l) {
            list.l = l.next;
          }
        }

        if (_i++ > 100000) {
          console.warn("infinite loop error");
          break;
        }
      } while (l !== list.l);
    }

    for (let i = 0; i < f1.lists.length; i++) {
      let list = f1.lists[i];
      list._recount();

      if (list.length < 3) {
        f1.lists.remove(list);
        i--;
      }
    }

    if (f1.lists.length === 0) {
      console.log("Killing empty face");

      this.killFace(f1, lctx);
      return undefined;
    }

    let bad = false;

    for (let l of f1.loops) {
      if (l.next.v === l.v) {
        console.error("Dissolve error", l);
        continue;
      }

      l.e = this.ensureEdge(l.v, l.next.v, lctx);

      if (l.e === e) {
        console.warn("Dissolve error");
        bad = true;
      }

      this._radialInsert(l.e, l);
    }

    if (!bad) {
      this.killEdge(e, lctx);
    } else {
      return undefined;
    }

    if (DEBUG_BAD_LOOPS) {
      this._checkFaceLoops(f1, "dissolveEdge");
    }

    if (DEBUG_DUPLICATE_FACES) {
      this._checkFace(f1, "dissolveEdge");
    }
    if (DEBUG_MANIFOLD_EDGES) {
      this._checkManifold(f1, "dissolveEdge");
    }

    return f1;
  }

  setSelect(e, state) {
    this.getElemList(e.type).setSelect(e, state);
  }

  selectNone() {
    for (let e of this.getElemLists()) {
      e.selectNone();
    }
  }

  selectAll() {
    for (let e of this.getElemLists()) {
      e.selectAll();
    }
  }

  updateGrids() {
    let cd_grid = GridBase.meshGridRef(this);

    if (!cd_grid.exists) {
      return;
    }

    let cls = CustomDataElem.getTypeClass(this.loops.customData.flatlist[cd_grid.i].typeName);
    (cls as unknown as IGridConstructor).updateSubSurf(this, cd_grid, true);

    for (let l of this.loops) {
      let grid = cd_grid.get(l);

      grid.update(this, l, cd_grid);
    }
  }

  _updateElists() {
    for (const elist of this.elists.values()) {
      elist._runDelayedFreeQueue();
    }
  }

  resetDispLayers() {
    let layerset = this.verts.customData.getLayerSet("displace");
    for (let layer of layerset) {
      let st = layer.getTypeSettings();

      st.flag |= DispLayerFlags.NEEDS_INIT;
    }

    this.graphUpdate();
    window.redraw_viewport(true);
  }

  exec(ctx): void {
    super.exec(ctx);

    this._updateElists();
    this.updateGrids();

    checkDispLayers(this);
    updateDispLayers(this);

    //we don't need eidgen's freemap most of the time,
    //it's built for the eidgen.reserve method.
    this.eidgen.killFreeMap();
  }

  tessellate() {
    if (window.DEBUG.simplemesh) {
      console.warn("Mesh tesselation");
    }

    this.haveNgons = false;

    this.recalc &= ~RecalcFlags.TESSELATE;
    let ltris = this._ltris = [];

    this._ltrimap_start = {};
    this._ltrimap_len = {};

    let lstart = this._ltrimap_start;
    let llen = this._ltrimap_len;

    let visitflag = MeshFlags.MAKE_FACE_TEMP;

    let haveNgons = false;

    for (let f of this.faces) {
      if (f.isNgon()) {
        haveNgons = true;
      }

      f.area = 0;
      f.flag &= ~visitflag;
    }

    this.haveNgons = haveNgons;

    for (let f of this.faces) {
      lstart[f.eid] = ltris.length;

      triangulateFace(f, ltris);
      llen[f.eid] = ltris.length - lstart[f.eid];
    }

    for (let i = 0; i < ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];
      let f = l1.f;

      f.flag |= visitflag;
      f.area += math.tri_area(l1.v.co, l2.v.co, l3.v.co);
    }

    for (let f of this.faces) {
      if (f.area === 0) {
        //for the case of tesselation failure,
        //ensure we don't have zero area.  Otherwise
        //f really does have zero area.

        if (!(f.flag & visitflag)) {
          f.area = 1.0;
          console.warn("Tesselation failure for face", f.eid, f);
        }
      }
    }

    let haveGrid = GridBase.meshGridOffset(this) >= 0;

    if (!haveGrid) {
      this.uiTriangleCount = ltris.length / 3;
    }
  }

  prealloc(n) {
    this.verts.prealloc(n);
    this.edges.prealloc(n);
    this.loops.prealloc(n);
    this.faces.prealloc(n);
  }

  compact() {
    const lens1 = [];
    const lens2 = [];

    for (const elist of this.elists.values()) {
      lens1.push(elist.list.length);
      lens2.push(elist.length);

      elist.compact();
    }

    console.log(lens1);
    console.log(lens2);

    return this;
  }

  genRender_curves(gl, combinedWireframe, view3d,
                   layers = LayerTypes.LOC | LayerTypes.UV | LayerTypes.ID) {
    //let smesh

    let sm = new SimpleMesh(layers);

    for (let e of this.edges) {
      e.update();
      e.updateHandles();
    }

    let drawnormals = this.drawflag & MeshDrawFlags.SHOW_NORMALS;

    for (let e of this.edges) {
      if (e.flag & MeshFlags.HIDE) {
        continue;
      }

      let len;

      if (view3d !== undefined) {
        len = e.calcScreenLength(view3d);
      } else {
        len = e.length;
      }

      let steps = Math.max(Math.floor(len / 5), 8);
      let t = 0, dt = 1.0 / (steps - 1);
      let s = 0, ds = e.length / (steps - 1);
      let lastco = undefined;
      let black = [0, 0, 0, 1];
      let color1 = new Vector4();
      let color2 = new Vector4();

      for (let i = 0; i < steps; i++, t += dt, s += ds) {
        let co = e.arcEvaluate(s);

        if (drawnormals) {
          let line;

          let n = e.arcNormal(s);

          let co2 = new Vector3(co);
          co2.addFac(n, e.length * 0.05);

          line = sm.line(co, co2);
          if (layers & LayerTypes.COLOR) {
            if (e.flag & MeshFlags.CURVE_FLIP) {
              color1[0] = color1[1] = 1.0;
              color1[2] = 0.0;
              color1[3] = 1.0;
            }
            line.colors(color1, color1);
          }
          if (layers & LayerTypes.ID) {
            line.ids(e.eid, e.eid);
          }
        }

        if (i > 0) {
          let line = sm.line(lastco, co);

          if (layers & LayerTypes.COLOR) {
            line.colors(color1, color2);
          }

          if (layers & LayerTypes.UV) {
            line.uvs([t, t], [t, t]);
          }

          if (layers & LayerTypes.ID) {
            line.ids(e.eid, e.eid);
          }
        }

        lastco = co;
      }
    }

    return sm;
  }

  /**
   * @param gl: gl context, may be undefined
   * @param combinedWireframe: add wireframe layer (but unset simplemesh.PrimitiveTypes.LINES in primflag)
   * @param view3d: View3D instance, optional, used when drawing edges in curve mode
   * */
  genRender(gl, combinedWireframe = false, view3d = undefined) {
    this.recalc &= ~(RecalcFlags.RENDER | RecalcFlags.PARTIAL);

    if (this.features & MeshFeatures.EDGE_CURVES_ONLY) {
      this.smesh = this.genRender_curves(gl, combinedWireframe, view3d);
      return this.smesh;
    } else {
      return this.genRender_full(gl, combinedWireframe);
    }
  }

  genRender_full(gl, combinedWireframe) {
    try {
      return this._genRender_full(gl, combinedWireframe);
    } catch (error) {
      util.print_stack(error);
      throw error;
    }
  }

  destroy(gl?: WebGL2RenderingContext): void {
    super.destroy();

    if (!gl) {
      console.warn("You forgot to pass gl to mesh.destroy()");
      gl = window._gl;
    }

    if (this.bvh) {
      this.bvh.destroy(this);
      this.bvh = undefined;
    }

    for (let k in this._fancyMeshes) {
      this._fancyMeshes[k].destroy(gl);
    }

    this._fancyMeshes = {};
    this.smesh = this.wmesh = undefined;
  }

  getUVWrangler(check = true, checkUvs = false) {
    let update: boolean = !this.uvWrangler || !!(this.recalc & RecalcFlags.UVWRANGLER);

    if (!check && this.uvWrangler) {
      return this.uvWrangler;
    }

    if (this._last_wr_loophash === undefined) {
      checkUvs = true;
    }

    let cd_uv = this.loops.customData.getLayerRef(UVLayerElem);

    let key = "" + this.loops.length + ":" + this.edges.length + ":" + this.faces.length;
    key += ":" + this.verts.length + ":" + cd_uv;

    if (checkUvs && cd_uv.exists) {
      let hash = new util.HashDigest();

      for (let l of this.loops) {
        let uv = cd_uv.get(l).uv;

        hash.add(uv[0] * 8196);
        hash.add(uv[1] * 8196);
      }

      this._last_wr_loophash = hash.get();
    }

    key += ":" + this._last_wr_loophash;

    update = update || key !== this._last_wr_key;

    if (update) {
      this.recalc &= ~RecalcFlags.UVWRANGLER;
      this._last_wr_key = key;

      console.log("making new UVWrangler", key);

      if (this.uvWrangler) {
        this.uvWrangler.destroy(this);
      }

      this.uvWrangler = new UVWrangler(this, this.faces, cd_uv.i);
      this.uvWrangler.buildIslands();
    }

    return this.uvWrangler;
  }

  destroyUVWrangler() {
    if (this.uvWrangler) {
      this.uvWrangler.destroy(this);
    }

    this.uvWrangler = undefined;
    return this;
  }


  getLastBVH() {
    if (this.bvh && this.bvh.dead) {
      this.bvh = undefined;
    } else if (this.bvh) {
      return this.bvh;
    }

    return this.getBVH(...arguments);
  }

  getBVH(args?: IBVHArgs) {
    const autoUpdate = args?.autoUpdate ?? true;
    const deformMode = args?.deformMode ?? false;
    const leafLimit = args?.leafLimit;
    const onCreate = args?.onCreate;
    const wireVerts = args?.wireVerts ?? false;
    const useGrids = args?.useGrids ?? true;
    const force = args?.force ?? false;

    let key = this.verts.length + ":" + this.faces.length + ":" + this.edges.length + ":" + this.loops.length;
    key += ":" + this.eidgen.cur + ":" + !!useGrids;
    key += ":" + !!wireVerts + ":" + !!deformMode;

    if (useGrids) {
      key += ":" + GridBase.meshGridOffset(this);
    }

    let bkey = "" + !!deformMode + ":" + !!wireVerts + ":" + useGrids;
    bkey += ":" + this.bvhSettings.calcUpdateKey();

    key += ":" + this.bvhSettings.calcUpdateKey();

    if (force || !this.bvh || key !== this._last_bvh_key) {
      this._last_bvh_key = key;

      if (bkey !== this.bvhSettings._last_key || autoUpdate || !this.bvh || force) {
        this.bvhSettings._last_key = bkey;

        //console.warn("BVH rebuild!", this._last_bvh_key, key, "|", this.bvhSettings._last_key, bkey);

        if (this.bvh) {
          this._bvh_freelist = this.bvh.destroy(this);
        }

        let bvhcls = BVH;
        //bvhcls = SpatialHash;

        let args = {
          deformMode,
          leafLimit,
          addWireVerts: wireVerts,
          useGrids,
          freelist: this._bvh_freelist,
          storeVerts: true,
          onCreate
        }

        this.bvh = bvhcls.create(this, args);

        /*
        this.bvh = bvhcls.create(this,
          true,
          useGrids,
          undefined,
          undefined,
          this._bvh_freelist, wireVerts);
         //*/
      }
    }

    if (1 || useGrids) {
      this.uiTriangleCount = this.bvh.tottri;
    }

    return this.bvh;
  }

  genRenderBasic(combinedWireframe = true) {
    let ltris = this.loopTris;
    let lf = LayerTypes;

    let sm = new SimpleMesh(lf.LOC | lf.NORMAL | lf.UV | lf.COLOR | lf.ID);

    let haveuv = this.loops.customData.hasLayer("uv");
    let cd_uv = this.loops.customData.getLayerRef(UVLayerElem);

    for (let i = 0; i < ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];
      let f = l1.f;

      let tri = sm.tri(l1.v.co, l2.v.co, l3.v.co);

      if (f.flag & MeshFlags.SMOOTH_DRAW) {
        tri.normals(l1.v.no, l2.v.no, l3.v.no);
      } else {
        tri.normals(f.no, f.no, f.no);
      }

      tri.ids(f.eid, f.eid, f.eid);

      if (haveuv) {
        tri.uvs(
          cd_uv.get(l1).uv,
          cd_uv.get(l2).uv,
          cd_uv.get(l3).uv
        );
      }
    }

    let white = [1, 1, 1, 1];

    if (combinedWireframe) {
      for (let e of this.edges) {
        let line = sm.line(e.v1.co, e.v2.co);

        line.ids(e.eid, e.eid);
        line.uvs([0, 0], [1, 0]);
        line.colors(white, white);
        line.normals(e.v1.no, e.v2.no);
      }
    }

    return sm;
  }

  _genRender_full(gl, combinedWireframe = false) {
    this.recalc &= ~RecalcFlags.RENDER;
    this.updateGen = ~~(Math.random() * 1024 * 1024 * 1024);

    //if (this.recalc & RecalcFlags.ELEMENTS) {
    this._genRenderElements(gl, {}, combinedWireframe);
    //}

    let meshes = this._fancyMeshes;
    if (meshes.faces) {
      this.smesh = meshes.faces;
    } else {
      this.smesh = new ChunkedSimpleMesh(LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV);
    }
    if (meshes.edges) {
      this.wmesh = meshes.edges;
    } else {
      this.wmesh = new ChunkedSimpleMesh(LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV);
    }

    return this.smesh;
  }

  rescale() {
    this.minMax();
    let min = this.min, max = this.max;

    for (let v of this.verts) {
      for (let i = 0; i < 3; i++) {
        v[i] = ((v[i] - min[i]) / (max[i] - min[i]) - 0.5) * 2.0;
      }
    }
  }

  flagElemUpdate(e) {
    e.flag |= MeshFlags.UPDATE;

    //if (!(e.eid in this.updatelist)) {
    //  this.updatelist[e.eid] = e;
    //}
  }

  partialUpdate(gl) {
    //XXX
    return;

    if (this.features & MeshFeatures.EDGE_CURVES_ONLY) {
      return;
    }

    console.warn("partial update");

    let sm = this.smesh;
    this.recalc &= ~RecalcFlags.PARTIAL;

    let w = [1, 1, 1, 1];

    let ltris = this._ltris;
    for (let eid in this.updatelist) {
      let e = this.updatelist[eid];
      if (e.type === MeshTypes.FACE) {
        let f = e;
        let li = this._ltrimap_start[f.eid];
        let len = this._ltrimap_len[f.eid];

        for (let i = 0; i < len; i++) {
          let idx = li;

          let l1 = ltris[li++];
          let l2 = ltris[li++];
          let l3 = ltris[li++];

          let tri = sm.tri(idx, l1.v, l2.v, l3.v);
          tri.colors(w, w, w);

          if (l1.f.flag & MeshFlags.FLAT) {
            tri.normals(l1.f.no, l2.f.no, l3.f.no);
          } else {
            tri.normals(l1.v.no, l2.v.no, l3.v.no);
          }

          let uvidx: CDRef<UVLayerElem> = -1;
          let j = 0;

          for (let data of l1.customData) {
            if (data instanceof UVLayerElem) {
              uvidx = j;
              break;
            }

            j++;
          }

          if (uvidx >= 0) {
            tri.uvs(l1.customData.get<UVLayerElem>(uvidx).uv,
              l2.customData.get<UVLayerElem>(uvidx).uv,
              l3.customData.get<UVLayerElem>(uvidx).uv);
          }
        }

      }
    }

    this.partialUpdateGen = ~~(Math.random() * 1024 * 1024 * 1024);

    return sm;
  }

  checkPartialUpdate(gl) {
    if (this.recalc & RecalcFlags.PARTIAL) {
      this.partialUpdate(gl);
      this.lastUpdateList = this.updatelist;
      this.updatelist = {};
    }
  }

  drawWireframe(view3d, gl, uniforms, program, object) {
    if (this.recalc & RecalcFlags.TESSELATE) {
      this.tessellate();
    }

    if (this.recalc & RecalcFlags.RENDER) {
      this.recalc &= RecalcFlags.PARTIAL;
      this.genRender(gl, undefined, view3d);
      this.lastUpdateList = {};
      this.updatelist = {};
    }

    this.checkPartialUpdate(gl);

    uniforms.color = uniforms.color || [0, 0, 0, 1];
    uniforms.active_color = uniforms.highlight_color = uniforms.select_color = uniforms.color;

    if (this._fancyMeshes.edges) {
      this._fancyMeshes.edges.draw(gl, uniforms, program);
    } else if (this.smesh) {
      this.smesh.draw(gl, uniforms, program);
    }
  }

  onContextLost(e) {
    if (this.smesh !== undefined) {
      this.smesh.onContextLost(e);
    }
  }

  drawIds(view3d, gl, selectMask, uniforms, object) {
    let program = Shaders.MeshIDShader;
    uniforms.pointSize = 10;

    this.draw(view3d, gl, uniforms, program, object);
  }

  updateMirrorTag(v, threshold = 0.0001) {
    let sym = this.symFlag;

    v.flag &= ~(MeshFlags.MIRRORED | MeshFlags.MIRROR_BOUNDARY);

    if (!sym) {
      return;
    }

    for (let i = 0; i < 3; i++) {
      if (!(sym & (1 << i))) {
        continue;
      }

      if (Math.abs(v[i]) < threshold) {
        v.flag |= MeshFlags.MIRROREDX << i;

        for (let e of v.edges) {
          if (!e.l || e.l.radial_next === e.l) {

            v.flag |= MeshFlags.MIRROR_BOUNDARY;
            break;
          }
        }
      }
    }
  }

  doMirrorSnap(v, threshold = 0.0001) {
    if (v.flag & MeshFlags.MIRROREDX) {
      v.co[0] = 0;
    }

    if (v.flag & MeshFlags.MIRROREDY) {
      v.co[1] = 0;
    }

    if (v.flag & MeshFlags.MIRROREDZ) {
      v.co[2] = 0;
    }
  }

  updateMirrorTags(threshold = 0.0001) {
    for (let v of this.verts) {
      this.updateMirrorTag(v, threshold);
    }
  }

  _genRenderElements(gl, uniforms, combinedWireframe = false) {
    genRenderMesh(gl, this, uniforms, combinedWireframe);
    this.updateGen = ~~(Math.random() * 1024 * 1024 * 1024);
  }

  clearUpdateFlags(typemask) {
    for (let list of this.elists.values()) {
      if (typemask !== undefined && !(list.type & typemask)) {
        continue;
      }

      for (let e of list) {
        e.flag &= ~MeshFlags.UPDATE;
      }
    }
  }

  updateHandles() {
    for (let e of this.edges) {
      e.updateHandles();
    }
  }

  _regenEidMap() {
    let eidmap;

    eidmap = this.eidMap = new Map();
    this._recalcEidMap = true;

    let elists = this.elists;

    for (let elist of elists.values()) {
      for (let elem of elist) {
        eidmap.set(elem.eid, elem);
      }
    }
  }

  _updateEidgen() {
    let elists = this.elists;

    let max_eid = 0;
    let regenEidMap = false;

    for (const elist of elists.values()) {
      for (let elem of elist) {
        if (isNaN(elem.eid)) {
          console.error("Found NaN eid!", elem);
          elem.eid = this.eidgen.next();
          regenEidMap = true;
        }

        max_eid = Math.max(max_eid, elem.eid);
      }
    }

    if (regenEidMap) {
      this._regenEidMap();
    }

    max_eid++;

    let eidgen = this.eidgen;

    eidgen.freelist.length = 0;
    eidgen.cur = max_eid;
    let eidMap = this.eidMap;

    if (REUSE_EIDS) {
      for (let i = 0; i < max_eid; i++) {
        if (!eidMap.has(i)) {
          eidgen.freelist.push(i);
        }
      }
    }
  }

  compactEids() {
    let oldmax = 0;

    for (const elist of this.elists.values()) {
      elist.selected.clear();
      elist.local_eidMap = new Map();
      elist.idxmap = new Map();

      for (let e of elist) {
        oldmax = Math.max(oldmax, e.eid);
      }
    }

    let eidmap;
    let eidgen = this.eidgen = this._makeEIDGen(new EIDGen());

    for (const elist of this.elists.values()) {
      let eidmap2 = elist.local_eidMap = new Map();
      let i = 0;

      for (let e of elist) {
        e.eid = e._old_eid = eidgen.next();

        elist.idxmap.set(e.eid, i++);
        eidmap[e.eid] = e;
        eidmap2.set(e.eid, e);
      }
    }

    for (const elist of this.elists.values()) {
      for (let e of elist) {
        if (e.flag & MeshFlags.SELECT) {
          elist.selected.add(e);
        }
      }
    }

    for (let l of this.loops) {
      for (let cd of l.customData) {
        if (cd instanceof GridBase) {
          for (let p of cd.points) {
            p.loopEid = l.eid;
          }
        }
      }
    }

    let eidMap = this.eidMap = new Map();

    for (let elist of this.getElemLists()) {
      for (let elem of elist) {
        eidMap.set(elem.eid, elem);
      }
    }

    console.log(oldmax, this.eidgen.cur);

    this.eidgen.freelist.length = 0;

    if (REUSE_EIDS) {
      for (let i = 0; i < this.eidgen.cur; i++) {
        if (!this.eidMap.has(i)) {
          this.eidgen.freelist.push(i);
        }
      }
    }

    this._clearGPUMeshes(window._gl);
    this.regenAll();
    this.graphUpdate();

    window.redraw_viewport(true);
  }

  _clearGPUMeshes(gl?: WebGL2RenderingContext): void {
    let meshes = this._fancyMeshes;

    this._fancyMeshes = {};
    this.wmesh = this.smesh = undefined;

    if (gl) {
      for (let k in meshes) {
        meshes[k].destroy(gl);
      }
    }

    for (let v of this.verts) {
      v.flag |= MeshFlags.UPDATE;
    }

    for (let e of this.edges) {
      e.flag |= MeshFlags.UPDATE;
    }

    for (let f of this.faces) {
      f.flag |= MeshFlags.UPDATE;
    }
  }

  drawElements(view3d: View3D, gl: WebGL2RenderingContext, selmask: number,
               uniforms: any, program: ShaderProgram, object: SceneObject, drawTransFaces = false) {
    return drawMeshElements(this, ...arguments);
  }

  draw(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any,
       program: ShaderProgram, object: SceneObject): void {
    if (this.recalc & RecalcFlags.TESSELATE) {
      this.tessellate();
    }

    if (this.recalc & RecalcFlags.RENDER) {
      this.recalc &= ~RecalcFlags.PARTIAL;
      this.genRender(gl, undefined, view3d);
      this.lastUpdateList = {};
      this.updatelist = {};
    }

    this.checkPartialUpdate(gl);

    if (this.smesh === undefined) {
      return;
    }

    if (program !== undefined) {
      this.smesh.program = program;

      program.bind(gl);
    }

    this.smesh.draw(gl, uniforms);
  }

  swapDataBlockContents(mesh: this) {
    return super.swapDataBlockContents(mesh);
  }

  clearCustomData() {
    for (const elist of this.elists.values()) {
      elist.clearCustomData();
    }
  }

  regenBVH() {
    if (this.bvh) {
      this._bvh_freelist = this.bvh.destroy(this);
      this.bvh = undefined;
    }

    return this;
  }

  regenTessellation() {
    this.updateGen = ~~(Math.random() * 1024 * 1024 * 1024);
    this._last_elem_update_key = ""; //clear partial redraw
    this._last_bvh_key = ""; //flag bvh update
    this._last_wr_key = "";

    this.recalc |= RecalcFlags.TESSELATE | RecalcFlags.ELEMENTS | RecalcFlags.UVWRANGLER;
    return this;
  }

  regenUVEditor() {
    /*using this.recalc won't work if multiple UV editors are open,
      since they are the ones that would clear a hypothetical
      RecalcFlags.UV_EDITOR flag.

      instead just increment an update generation.
     */
    this.uvRecalcGen++;
    return this;
  }

  regenUVWrangler() {
    this.recalc |= RecalcFlags.UVWRANGLER;
    return this;
  }

  /** also calls this.regenElementsDraw and this.regenUVDraw */
  regenRender() {
    this.regenUVEditor();
    this.recalc |= RecalcFlags.RENDER | RecalcFlags.ELEMENTS;
    return this;
  }

  regenElementsDraw() {
    this.recalc |= RecalcFlags.ELEMENTS;
    return this;
  }

  regenAll() {
    this.recalc |= RecalcFlags.ALL;
    return this;
  }

  regenPartial() {
    this.recalc |= RecalcFlags.PARTIAL | RecalcFlags.ELEMENTS;
    return this;
  }

  _getArrays() {
    let ret = [];
    for (let k of this.elists.keys()) {
      //we no longer save this.loops in struct data directly, but we still
      //have to save customdata layout
      if (k === MeshTypes.LOOP) {
        let template = new ElementList(MeshTypes.LOOP);
        template.customData = this.loops.customData;

        ret.push(template);
        continue;
      }

      ret.push(this.elists.get(k));
    }

    return ret;
  }

  updateBoundaryFlags() {
    for (let v of this.verts) {
      v.flag &= ~MeshFlags.BOUNDARY;
    }

    for (let e of this.edges) {
      if (!e.l || e.l === e.l.radial_next) {
        e.flag |= MeshFlags.BOUNDARY;
        e.v1.flag |= MeshFlags.BOUNDARY;
        e.v2.flag |= MeshFlags.BOUNDARY;
      } else {
        e.flag &= ~MeshFlags.BOUNDARY;
      }
    }
  }

  copyElemData(dst, src, ignoreNoInterp = false) {
    let cdlayers;

    if (ignoreNoInterp) {
      let elist = this.getElemList(dst.type);
      cdlayers = elist.customData.flatlist;
    }

    if (dst.type !== src.type) {
      throw new Error("mismatched between element types in Mesh.prototype.copyElemData()");
    }

    for (let i = 0; i < dst.customData.length; i++) {
      if (cdlayers && (cdlayers[i].flag & CDFlags.NO_INTERP)) {
        continue;
      }

      dst.customData[i].load(src.customData[i]);
    }

    //make sure dst is actually in this mesh before selecting it
    if ((src.flag & MeshFlags.SELECT) && dst.eid >= 0 && this.eidMap.get(dst.eid) === dst) {
      this.setSelect(dst, true);
    }

    dst.flag = src.flag;

    switch (dst.type) {
      case MeshTypes.HANDLE:
        dst.co.load(src.co);
        dst.mode = src.mode;
        dst.color.load(src.color);
        dst.roll = src.roll;
        break;
      case MeshTypes.VERTEX:
        dst.co.load(src.co);
        dst.no.load(src.no);
        break
      case MeshTypes.FACE:
        dst.cent.load(src.cent);
        dst.no.load(src.no);
        break
    }
  }

  /** clear mesh */
  clear(clearCustomData = false) {
    let elists = this.elists;

    this.eidgen = this._makeEIDGen();
    this.elists = new Map();
    this.eidMap = new Map();
    this.makeElistAliases();

    if (!clearCustomData) {
      for (const k of this.elists.keys()) {
        let e1 = elists.get(k);
        let e2 = this.elists.get(k);

        e2.customData = e1.customData;
      }
    }

    return this;
  }

  copy(addLibUsers = false, owner ?: DataBlock, clearCustomData = false) {
    if (typeof owner === "boolean" || typeof owner === "number") {
      throw new Error("Invalid call to Mesh.prototype.copy!");
    }

    let ret = new (this.constructor as unknown as new() => this)();

    //derived types may have customdata set in constructors, still
    //clear in this case if requested
    if (clearCustomData) {
      for (let k in ret.elists.keys()) {
        ret.elists.get(parseInt(k) as MeshTypes).customData = new CustomData();
      }
    }

    ret.materials = [];
    for (let mat of this.materials) {
      ret.materials.push(mat);

      if (addLibUsers) {
        mat.lib_addUser(this);
      }
    }

    for (let elist of ret.getElemLists()) {
      if (this.elists.get(elist.type).customData === undefined) {
        continue;
      }

      if (!clearCustomData) {
        elist.customData = this.elists.get(elist.type).customData.copy();
        elist.customData.on_layeradd = ret._on_cdlayer_add.bind(ret);
        elist.customData.on_layerremove = ret._on_cdlayer_rem.bind(ret);
      }
    }

    ret.eidgen = this.eidgen.copy();
    let eidmap = ret.eidMap = new EidElemMap();

    for (let v of this.verts) {
      let v2 = new Vertex(v.co);

      v2.no.load(v.no);

      v2.flag = v.flag;
      v2.index = v.index;
      v2.eid = v2._old_eid = v.eid;

      eidmap.set(v2.eid, v2);
      ret.verts.push(v2);
      ret.verts.customData.initElement(v2);

      if (!clearCustomData) {
        ret.copyElemData(v2, v);
      }
    }

    for (let h of this.handles) {
      let h2 = new Handle(h.co);

      h2.flag = h.flag;
      h2.index = h.index;
      h2.eid = h2._old_eid = h.eid;

      eidmap.set(h2.eid, h2);
      ret.handles.push(h2);
      ret.handles.customData.initElement(h2);

      h2.mode = h.mode;
      h2.roll = h.roll;

      if (!clearCustomData) {
        ret.copyElemData(h2, h);
      }
    }

    for (let e of this.edges) {
      let v1 = eidmap.get<Vertex>(e.v1.eid);
      let v2 = eidmap.get<Vertex>(e.v2.eid);

      let e2 = new Edge();

      e2.eid = e2._old_eid = e.eid;
      e2.flag = e.flag;
      e2.index = e.index;

      eidmap.set(e2.eid, e2);

      ret.edges.push(e2);
      ret.edges.customData.initElement(e2);

      e2.v1 = v1;
      e2.v2 = v2;

      ret._diskInsert(v1, e2);
      ret._diskInsert(v2, e2);

      if (e.h1) {
        e2.h1 = eidmap.get<Handle>(e.h1.eid);
        e2.h2 = eidmap.get<Handle>(e.h2.eid);

        e2.h1.owner = e2;
        e2.h2.owner = e2;
      }

      if (!clearCustomData) {
        ret.copyElemData(e2, e);
      }
    }

    for (let l of this.loops) {
      let l2 = ret._makeLoop(l.eid);

      l2.flag = l.flag;
      l2.eid = l2._old_eid = l.eid;
      l2.index = l.index;

      eidmap.set(l2.eid, l2);

      l2.e = eidmap.get<Edge>(l.e.eid);
      l2.v = eidmap.get<Vertex>(l.v.eid);

      (l2.radial_next as unknown as number) = l.radial_next.eid;
      (l2.radial_prev as unknown as number) = l.radial_prev.eid;
      (l2.next as unknown as number) = l.next.eid;
      (l2.prev as unknown as number) = l.prev.eid;

      (l2.f as unknown as number) = l.f.eid;

      if (!clearCustomData) {
        ret.copyElemData(l2, l);
      }
    }

    for (let e of this.edges) {
      let e2 = eidmap.get<Edge>(e.eid);

      if (e.l !== undefined) {
        e2.l = eidmap.get<Loop>(e.l.eid);
      }
    }

    for (let l2 of ret.loops) {
      l2.radial_next = eidmap.get<Loop>(l2.radial_next as unknown as number);
      l2.radial_prev = eidmap.get<Loop>(l2.radial_prev as unknown as number);
      l2.next = eidmap.get<Loop>(l2.next as unknown as number);
      l2.prev = eidmap.get<Loop>(l2.prev as unknown as number);
    }

    for (let f of this.faces) {
      let f2 = ret._allocFace(0, f.eid);

      f2.eid = f2._old_eid = f.eid;
      f2.index = f.index;
      f2.flag = f.flag;

      eidmap.set(f2.eid, f2);

      f2.cent.load(f.cent);
      f2.no.load(f.no);

      for (let list of f.lists) {
        let list2 = new LoopList();

        list2.flag = list.flag;
        list2.l = eidmap.get<Loop>(list.l.eid);

        f2.lists.push(list2);
      }

      if (!clearCustomData) {
        ret.copyElemData(f2, f);
      }
    }

    for (let f2 of ret.faces) {
      for (let list of f2.lists) {
        let l = list.l;
        let _i = 0;

        do {
          if (_i++ > 10000) {
            console.warn("infinite loop detected");
            break;
          }

          l.f = f2;
          l.list = list;

          l = l.next;
        } while (l !== list.l);
      }
    }

    let delLoops = [];

    for (let l2 of ret.loops) {
      if (!l2.f || typeof l2.f === "number") {
        console.warn("Mesh error", l2);
        delLoops.push(l2);
      }
    }

    if (delLoops.length > 0) {
      //to ensure mesh integrity, first clear edge radial lists
      for (let l of ret.loops) {
        l.radial_next = l.radial_prev = undefined
      }

      for (let e of ret.edges) {
        e.l = undefined;
      }

      //kill offending loops
      for (let l2 of delLoops) {
        this._elemRemove(l2);
        ret.loops.remove(l2);
      }

      //rebuild radial lists
      for (let f of ret.faces) {
        for (let l of f.loops) {
          ret._radialInsert(l.e, l);
        }
      }
    }

    ret.validateMesh();
    ret.regenRender();
    ret.regenElementsDraw();

    return ret;
  }

  _on_cdlayer_add(layer, set) {
  }

  _on_cdlayer_rem(layer, set) {
    /*
    let cls = CustomDataElem.getTypeClass(set.typeName);
    let mask = layer.elemTypeMask;
    let index = layer.index;

    for (let k in MeshTypes) {
      let flag = MeshTypes[k];
      //let elist = this.getElem
      if (mask & flag) {
        let elist = this.getElemList(flag);
        for (let e of elist) {
          e.customData.pop_i(index);
        }
      }
    }
     */
  }

  getFace(verts: Iterable<Vertex>) {
    const vs: Iterable<Vertex> = ReusableIter.getSafeIter<Vertex>(verts);

    let flag = MeshFlags.FACE_EXIST_FLAG;

    let vslength = 0;
    if (Array.isArray(vs)) {
      vslength = vs.length;
    } else if (vs instanceof Set) {
      vslength = vs.size;
    } else {
      for (let v of vs) {
        vslength++;
      }
    }

    for (let v of vs) {
      v.flag &= ~flag;

      for (let e of v.edges) {
        e.flag &= ~flag;

        for (let l of e.loops) {
          let bad = l.f.lists.length > 0;
          bad = bad || l.f.lists[0].length !== vslength;

          if (bad) {
            l.f.flag |= flag;
          } else {
            l.f.flag &= ~flag;
          }
        }
      }
    }

    for (let v of vs) {
      for (let e of v.edges) {
        if (e.flag & flag) {
          continue;
        }

        e.flag |= flag;

        for (let l of e.loops) {
          if (l.f.flag & flag) {
            continue;
          }

          for (let v of vs) {
            v.flag &= ~flag;
          }

          l.f.flag |= flag;

          for (let v2 of l.f.verts) {
            v2.flag |= flag;
          }

          let count = 0;
          let vslength = 0;
          for (let v of vs) {
            if (v.flag & flag) {
              count++;
            }
            vslength++;
          }

          if (count === vslength) {
            return l.f;
          }
        }
      }
    }

    return undefined;
  }

  fixDuplicateFaces(report = true, lctx?: LogContext) {
    let flag = MeshFlags.TEMP3;

    let checkFace = (f1: Face, f2: Face): boolean => {
      for (let l of f1.loops) {
        l.v.flag &= ~flag;
        l.e.flag &= ~flag;
      }

      for (let l of f2.loops) {
        l.v.flag |= flag;
        l.e.flag |= flag;
      }

      let ok = true;

      for (let l of f1.loops) {
        if (!(l.v.flag & flag) || !(l.e.flag & flag)) {
          ok = false;
          break;
        }
      }

      return ok;
    }

    for (let f of this.faces) {
      outer: for (let l of f.loops) {
        if (l.radial_next === l) {
          continue;
        }

        for (let l2 of l.e.loops) {
          if (l2 === l) {
            continue;
          }

          if (checkFace(f, l2.f)) {
            if (report) {
              console.warn("Found a duplicate face", f, l2.f);
            }

            this.killFace(f, lctx);
            break outer;
          }
        }
      }
    }
  }

  fixLoops(lctx?: LogContext): void {
    this.fixDuplicateFaces(undefined, lctx);

    let flag = MeshFlags.TEMP3;

    for (let l of this.loops) {
      l.flag &= ~flag;
    }

    for (let f of this.faces) {
      for (let l of f.loops) {
        l.flag |= flag;
        this._radialRemove(l.e, l);
      }
    }

    for (let e of this.edges) {
      if (e.l) {
        console.error("Edge still had a loop assigned to it", e, e.l);

        e.l = undefined;
      }
    }

    for (let f of this.faces) {
      for (let l of f.loops) {
        this._radialInsert(l.e, l);
      }
    }

    for (let l of this.loops) {
      if (!(l.flag & flag)) {
        console.warn("Orphaned loop detected", l);

        if (l.eid >= 0) {
          this._elemRemove(l);
        }

        this.loops.remove(l);
      }
    }
  }

  fixMesh(report = true, noWire = false) {
    let eidMap = new EidElemMap();
    let elists = this.elists;

    //do a sanity check of eids
    for (const elist of elists.values()) {
      for (let elem of elist) {
        if (elem.eid < 0) {
          console.warn("Found dead eid tag");
          elem.eid = this.eidgen.next();
        } else if (eidMap.has(elem.eid)) {
          console.warn("Duplicate eid " + elem.eid, "for", elem);
          elem.eid = this.eidgen.next();
        }

        eidMap.set(elem.eid, elem);
      }
    }

    this.elists = new Map();
    this.makeElistAliases();

    for (let k of elists.keys()) {
      let e1 = elists.get(k);
      let e2 = this.elists.get(k);

      e2.customData = e1.customData.copy();
    }

    let eidMap2 = this.eidMap = new Map();
    let add = (elem) => {
      if (eidMap2.has(elem.eid)) {
        if (eidMap2.get(elem.eid) !== elem) {
          console.error("Duplicate element eid", elem);
          elem.eid = this.eidgen.next();
          eidMap2.set(elem.eid, elem);
          this.elists.get(elem.type).push(elem);
        }
      } else {
        eidMap2.set(elem.eid, elem);
        this.elists.get(elem.type).push(elem);
      }

      if (elem.type === MeshTypes.EDGE && elem.h1) {
        add(elem.h1);
        add(elem.h2);
      }
    }

    if (!noWire) {
      for (let v of elists.get(MeshTypes.VERTEX)) {
        if (v.valence === 0) {
          add(v);
        }
      }

      for (let e of elists.get(MeshTypes.EDGE)) {
        if (!e.l) {
          add(e);
        }
      }
    }

    for (let f of elists.get(MeshTypes.FACE)) {
      add(f);

      for (let list of f.lists) {
        for (let l of list) {
          add(l);
          add(l.e);
          add(l.v);
        }
      }
    }

    this.fixDuplicateFaces(true);

    this.regenAll();
    this.recalcNormals();
  }

  //fix e.g. obj files that store edges as colinear tris
  killColinearTris(report = true): void {
    let fs = new Set<Face>();
    let eps = 0.000001;

    this.fixDuplicateFaces(report);

    for (let f of this.faces) {
      if (!f.isTri) {
        continue;
      }

      let l1 = f.lists[0].l;
      let l2 = l1.next, l3 = l1.prev;

      let ok = math.colinear(l1.v.co, l2.v.co, l3.v.co);
      ok = ok || l1.v.co.vectorDistance(l2.v.co) < eps;
      ok = ok || l1.v.co.vectorDistance(l3.v.co) < eps;
      ok = ok || l2.v.co.vectorDistance(l3.v.co) < eps;

      if (ok) {
        fs.add(f);
      }
    }

    console.log("colinear tris:", fs);
    for (let f of fs) {
      this.killFace(f);
    }
  }

  validateMesh(msg_out: [string | undefined] = [undefined]) {
    let fix = false;

    let visit = new Set<Element>();
    let totshell = 0;

    for (let f of this.faces) {
      let bad = false;

      for (let list of f.lists) {
        if (!list.l) {
          bad = true;
        }
      }

      if (bad) {
        console.error("corrupted face " + f.eid);

        for (let list of f.lists) {
          if (list.l) {
            for (let l of new Set<Loop>(list)) {
              this._radialRemove(l.e, l);
              this._killLoop(l);
            }
          }
        }

        this._freeFace(f);
      }
    }

    for (let f of this.faces) {
      this._checkFaceLoops(f, "validateMesh");

      for (let i = 0; i < f.lists.length; i++) {
        let list = f.lists[i];

        let flag = MeshFlags.TEMP1;

        if (!list.l) {
          msg_out[0] = "Corrupted face";

          //try to delete face
          for (let list of f.lists) {
            if (list.l) {
              for (let l of list) {
                this._radialRemove(l.e, l);
              }
            }
          }

          for (let l of this.loops) {
            if (l.f === f) {
              this._killLoop(l);
            }
          }

          if (f.eid >= 0) {
            this._freeFace(f);
          }

          break;
        }

        for (let l of list) {
          l.v.flag &= ~flag;
        }

        for (let l of list) {
          if (l.v.flag & flag) {
            msg_out[0] = "Duplicate verts in face";
            this._fixFace(f);

            break;
          }

          l.v.flag |= flag;
        }
      }
    }

    for (let v of this.verts) {
      if (visit.has(v)) {//} || v.edges.length === 0) {
        continue;
      }

      let stack = [v];
      visit.add(v);

      while (stack.length > 0) {
        let v2 = stack.pop();

        for (let e of v2.edges) {
          let v3 = e.otherVertex(v2);

          if (!visit.has(v3)) {
            stack.push(v3);
            visit.add(v3);
          }
        }
      }

      totshell++;
    }

    if (totshell > 1 && (this.features & MeshFeatures.SINGLE_SHELL)) {
      msg_out[0] = "Can't split up mesh";
      return false;
    }

    function count_edges(v1, v2) {
      let count = 0;

      for (let e of v1.edges) {
        if (e.otherVertex(v1) === v2) {
          count++;
        }
      }

      return count;
    }

    for (let e of this.edges) {
      let count = count_edges(e.v1, e.v2);

      if (count !== 1) {
        console.warn("Edge corruption in edge", e.eid, count_edges(e.v1, e.v2));
        msg_out[0] = "Edge corruption in edge " + e.eid;

        if (count === 0) {
          return false;
        }

        console.warn("Fixing...");

        //fix
        for (let e2 of e.v1.edges) {
          if (e === e2 || e2.otherVertex(e.v1) !== e.v2) {
            continue;
          }

          let _i = 0;

          while (e2.l) {
            let l = e2.l;

            this._radialRemove(e2, l);
            this._radialInsert(e, l);

            if (_i++ > 100) {
              console.error("infinite loop error");
              break;
            }
          }

          e2.l = undefined;
          this.killEdge(e2);
        }

        //return true;
      }

      e.index = 0;
    }

    for (let f of this.faces) {
      for (let l of f.loops) {
        l.e.index++;
      }
    }

    for (let e of this.edges) {
      let count = 0;
      for (let l of e.loops) {
        count++;
      }

      if (count !== e.index) {
        console.warn("Edge radial list corruption", e.eid, count, e.index);
        fix = true;
      }
    }

    let ls = [];

    for (let f of this.faces) {
      for (let list of f.lists) {
        let l = list.l;
        let _i = 0;

        let flag = MeshFlags.MAKE_FACE_TEMP;
        ls.length = 0;

        for (let l of list) {
          l.v.flag &= ~flag;
          this._radialRemove(l.e, l);
          ls.push(l);
        }

        for (let l of ls) {
          if (l.next.v === l.v) {
            console.warn("Duplicate verts in face", f, l.v);
            msg_out[0] = "Duplicate verts in face";
            fix = true;

            l.prev.next = l.next;
            l.next.prev = l.prev;

            if (l === list.l) {
              list.l = l.next;
            }

            list.length--;

            this._killLoop(l);
            l.v.flag |= MeshFlags.UPDATE;

            continue;
          }

          l.v.flag |= flag;
        }

        for (let l of list) {
          this._radialInsert(l.e, l);
        }
      }
    }

    for (let f of this.faces) {
      for (let list of f.lists) {
        if (list.length < 3) {
          list._recount();
        }

        if (list.length < 3) {
          console.warn("1 or 2-vertex face detected", f.eid, f, list);
        }

        for (let l of list) {
          l.list = list;

          let v1 = l.v, v2 = l.next.v;
          let bad = !(v1 === l.e.v1 && v2 === l.e.v2);
          bad = bad && !(v2 === l.e.v1 && v1 === l.e.v2);

          if (bad) {
            console.warn("corrupted mesh data: wrong edge for loop", l.eid, l);
            l.e = this.ensureEdge(v1, v2);
            fix = true;
          }
        }
      }
    }

    if (!fix) {
      return true;
    }

    //fix edge->loop links
    for (let e of this.edges) {
      e.l = undefined;
    }

    for (let f of this.faces) {
      for (let list of f.lists) {
        for (let l of list) {
          this._radialInsert(l.e, l);
        }
      }
    }

    return false;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);

    this.eidgen = this._makeEIDGen(this.eidgen);

    this.elists = new Map();

    for (let elist of this._elists) {
      this.elists.set(elist.type, elist);
    }

    this._elists = undefined;

    this.verts = this.getElemList<Vertex>(MeshTypes.VERTEX, SAVE_DEAD_VERTS);
    this.edges = this.getElemList<Edge>(MeshTypes.EDGE, SAVE_DEAD_EDGES);
    this.handles = this.getElemList<Handle>(MeshTypes.HANDLE);
    this.loops = this.getElemList<Loop>(MeshTypes.LOOP, SAVE_DEAD_LOOPS);
    this.faces = this.getElemList<Face>(MeshTypes.FACE, SAVE_DEAD_FACES);

    this.verts.storeFreedElems = SAVE_DEAD_VERTS;
    this.edges.storeFreedElems = SAVE_DEAD_EDGES;
    this.loops.storeFreedElems = SAVE_DEAD_LOOPS;
    this.faces.storeFreedElems = SAVE_DEAD_FACES;

    for (let elist of this.elists.values()) {
      elist.customData.on_layeradd = this._on_cdlayer_add.bind(this);
      elist.customData.on_layerremove = this._on_cdlayer_rem.bind(this);
    }

    this.regenRender();

    let eidMap = new Map();

    this.eidMap = eidMap;
    this._recalcEidMap = true;

    for (let v of this.verts) {
      eidMap.set(v.eid, v);


      //old files might have data in vert.edges, clear it
      if (!EDGE_LINKED_LISTS) {
        v.edges.length = 0;
      }
    }

    for (let h of this.handles) {
      eidMap.set(h.eid, h);
    }

    for (let e of this.edges) {
      eidMap.set(e.eid, e);

      e.v1 = eidMap.get(e.v1);
      e.v2 = eidMap.get(e.v2);

      e.l = undefined;

      this._diskInsert(e.v1, e);
      this._diskInsert(e.v2, e);

      e.h1 = eidMap.get(e.h1);
      e.h2 = eidMap.get(e.h2);
    }

    for (let h of this.handles) {
      h.owner = eidMap.get(h.owner);
    }

    //are we an old file that stored this.loops directly?
    if (this.loops.length > 0) {
      for (let l of this.loops) {
        eidMap.set(l.eid, l);
      }

      for (let l of this.loops) {
        l.next = eidMap.get(l.next);
      }

      for (let f of this.faces) {
        let prev = undefined;

        for (let list of f.lists) {
          list.l = eidMap.get(list.l);

          for (let l of list) {
            if (prev) {
              l.prev = prev;
            }
            prev = l;
          }

          list.l.prev = prev;
        }
      }
    } else {
      for (let f of this.faces) {
        for (let list of f.lists) {
          for (let l of list) {
            if (l.eid < 0) {
              console.error("Loaded loop with invalid eid");
              l.eid = this.eidgen.next();
            }

            eidMap.set(l.eid, l);
            this.loops.push(l);
          }
        }
      }
    }

    for (let f of this.faces) {
      eidMap.set(f.eid, f);
    }

    for (let l of this.loops) {
      l.v = eidMap.get(l.v);
    }

    for (let e of this.edges) {
      e.updateLength();
    }

    for (let f of this.faces) {
      for (let i = 0; i < f.lists.length; i++) {
        let list = f.lists[i];
        list.length = 0;

        for (let l of list) {
          //old file?
          if (l.e === undefined) {
            l.e = this.getEdge(l.v, l.next.v);
          } else {
            l.e = this.eidMap.get<Edge>(l.e as unknown as number);
          }

          if (!l.e) {
            l.e = this.getEdge(l.v, l.next.v);

            console.warn("Mesh corruption error; fixing...", l);

            if (l.next.v === l.v) {
              //bad loop!
              l.prev.next = l.next;
              l.next.prev = l.prev;

              if (l === list.l) {
                list.l = l.next;
              }

              if (list.l === l) {
                list.length = 0;
                f.lists.remove(list);
                i--;
                break;
              }
            } else {
              l.e = this.makeEdge(l.v, l.next.v);
            }
          }

          l.list = list;
          l.f = f;
          list.length++;
        }

        if (list.length === 0) {
          continue;
        }

        for (let l of list) {
          l.radial_next = l.radial_prev = l;
          this._radialInsert(l.e, l);
        }
      }

      if (f.lists.length === 0) {
        console.warn("Removed dead face", f);
        this.killFace(f);
      }
    }

    for (let elist of this.elists.values()) {
      elist.fixCustomData();
      elist.stripTempLayers(false);

      let eidMap = this.eidMap;

      for (let elem of elist) {
        eidMap.set(elem.eid, elem);
      }
    }

    if (REUSE_EIDS) {
      this._updateEidgen();
    }

    onFileLoadDispVert(this);
    this.validateMesh();
  }

  getBoundingBox(useGrids = true) {
    let ret = undefined;

    for (let v of this.verts) {
      if (ret === undefined) {
        ret = [new Vector3(v.co), new Vector3(v.co)]
      } else {
        ret[0].min(v.co);
        ret[1].max(v.co);
      }
    }

    let cd_grid = GridBase.meshGridOffset(this);

    if (cd_grid >= 0) {
      for (let l of this.loops) {
        if (ret === undefined) {
          ret = [new Vector3(), new Vector3()];
          ret[0].addScalar(1e17);
          ret[1].addScalar(-1e17);
        }

        let grid = l.customData.get<GridBase>(cd_grid);

        for (let p of grid.points) {
          ret[0].min(p.co);
          ret[1].max(p.co);
        }
      }
    }

    return ret;
  }

  copyAddUsers() {
    let ret = this.copy();

    this.copyTo(ret);

    for (let mat of ret.materials) {
      if (mat === undefined) {
        continue;
      }

      mat.lib_addUser(ret);
    }

    return ret;
  }
};

DataBlock.register(Mesh);
SceneObjectData.register(Mesh);

window["_debug_recalc_all_normals"] = function (force = false) {
  let scene = window["_appstate"]["ctx"]["scene"];
  for (let ob of scene.objects) {
    if (ob.data instanceof Mesh) {
      if (force) {
        ob.data._recalcNormals_intern();
        ob.data.regenRender();
      } else {
        ob.data.recalcNormals();
        ob.data.regenRender();
      }

      ob.graphUpdate();
      ob.data.graphUpdate();
      window["updateDataGraph"]();
      window["redraw_viewport"]();
    }
  }
}

setMeshClass(Mesh);
