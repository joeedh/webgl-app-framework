// var _mesh = undefined;

import {NodeFlags} from '../core/graph.js';

import {Shaders} from '../shaders/shaders.js';

import * as simplemesh from '../core/simplemesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {DataBlock, DataRef} from '../core/lib_api.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';

import '../path.ux/scripts/util/struct.js';

let STRUCT = nstructjs.STRUCT;

import {CustomDataElem} from './customdata.js';
import {LayerTypes, ChunkedSimpleMesh, SimpleMesh} from "../core/simplemesh.js";

import {MeshTools} from './mesh_stdtools.js';
import {
  MeshFeatures, MeshFeatureError, MeshError,
  MeshTypes, MeshSymFlags, MeshSymMap, MeshFlags, RecalcFlags, MeshDrawFlags
} from './mesh_base.js';

export * from "./mesh_base.js";
export * from "./mesh_types.js";
export * from "./mesh_customdata.js";
export * from "./mesh_element_list.js";

import {UVLayerElem, OrigIndexElem, NormalLayerElem} from "./mesh_customdata.js";
import {Element, Vertex, Edge, Handle, Loop, LoopList, Face} from "./mesh_types.js";
import {SelectionSet, ElementList} from "./mesh_element_list.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {PrimitiveTypes} from "../core/simplemesh.js";
import {Node} from '../core/graph.js';
import {Colors} from '../sceneobject/sceneobject.js';
import {BVH} from "../util/bvh.js";
import {drawMeshElements, genRenderMesh} from "./mesh_draw.js";
import {GridBase} from "./mesh_grids.js";

let split_temp = new Array(512);
split_temp.used = 0;

let _quad = new Array(4);
let _tri = new Array(3);
let _cdtemp1 = new Array(1);
let _cdtemp2 = new Array(2);
let _cdwtemp1 = new Array(1);
let _cdwtemp2 = new Array(2);

let _collapsetemp = new Array(256);
let _collapsetemp2 = new Array(256);
let _collapsetemp3 = new Array(256);

let splitcd_ls = [0, 0];
let splitcd_ws = [0.5, 0.5];

let _idgen = 0;

let debuglog = false;

import {CustomData} from './customdata.js';
import {UVWrangler} from './unwrapping.js';

const VEID=0, VFLAG=1, VX=1, VY=2, VZ=3, VNX=4, VNY=5, VNZ=6, VTOT=7;
const EEID=0, EFLAG=1, EV1=2, EV2=3, ETOT=4;
const LEID=0, LFLAG=1, LV=2, LE=3, LTOT=4;
const LISTFACE=0, LISTSTART=1, LISTLEN=2, LISTTOT=3;
const FEID=0, FFLAG=1, FLISTSTART=3, FTOTLIST=4, FTOT=5;
const HEID=0, HFLAG=1, HX=2, HY=3, HZ=4, HTOT=5;

export class CompressMeshElemList extends Array {
  constructor(type) {
    super();

    this.type = type;
    this.customData = new CustomData();
    this.cdLayers = [];
  }

  loadCustomData(cd) {
    this.customData = cd.copy();
    for (let layer of this.customData.flatlist) {
      this.cdLayers.push([]);
    }
  }
}
CompressMeshElemList.STRUCT = `
mesh.CompressMeshElemList {
  data          : array(float) | this;
  customData    : mesh.CustomData;
  cdLayers      : array(array(abstract(mesh.CustomDataElem)));  
}
`;
nstructjs.register(CompressMeshElemList);

export class CompressedMesh {
  constructor() {
    this.verts = new CompressMeshElemList(MeshTypes.VERTEX);
    this.edges = new CompressMeshElemList(MeshTypes.EDGE);
    this.loops = new CompressMeshElemList(MeshTypes.LOOP);
    this.handles = new CompressMeshElemList(MeshTypes.HANDLE);
    this.faces = new CompressMeshElemList(MeshTypes.FACE);

    this.lists = [];

    this.eidmax = -1;
  }

  reset() {
    this.verts = new CompressMeshElemList(MeshTypes.VERTEX);
    this.edges = new CompressMeshElemList(MeshTypes.EDGE);
    this.loops = new CompressMeshElemList(MeshTypes.LOOP);
    this.handles = new CompressMeshElemList(MeshTypes.HANDLE);
    this.faces = new CompressMeshElemList(MeshTypes.FACE);

    this.lists = [];

    this.eidmax = -1;
  }

  loadMesh(mesh) {
    let vs = this.verts, ls = this.loops, fs = this.faces, es = this.edges;
    let lists = this.lists;

    mesh.updateIndices();

    let ListIdxMap = new Map();

    let listi = 0, loopi = 0;

    for (let f of mesh.faces) {
      for (let list of f.lists) {
        ListIdxMap.set(list, listi++);

        for (let l of list) {
          l.index = loopi++;
        }
      }
    }

    vs.loadCustomData(this.verts.customData);
    es.loadCustomData(this.edges.customData);
    ls.loadCustomData(this.loops.customData);
    fs.loadCustomData(this.faces.customData);

    vs.length = VTOT*mesh.verts.length;
    es.length = ETOT*mesh.edges.length;
    ls.length = LTOT*loopi;
    fs.length = FTOT*mesh.faces.length;
    lists.length = listi*LISTLEN;

    let vi = 0;
    for (let v of mesh.verts) {
      vs[vi+VEID] = v.eid;
      vs[vi+VFLAG] = v.flag;
      vs[vi+VX] = v[0];
      vs[vi+VY] = v[1];
      vs[vi+VZ] = v[2];
      vs[vi+VNX] = v.no[0];
      vs[vi+VNY] = v.no[1];
      vs[vi+VNZ] = v.no[2];

      let di = 0;
      for (let data of v.customData) {
        vs.cdLayers[di++].push(data);
      }

      vi += VTOT;
    }

    let ei = 0;
    for (let e of mesh.verts) {
      es[ei+EEID] = e.eid;
      es[ei+EFLAG] = e.flag;

      let di = 0;
      for (let data of e.customData) {
        es.cdLayers[di++].push(data);
      }

      ei += ETOT;
    }

    for (let l of mesh.loops) {
      let li = l.index*LTOT;

      es[li+LEID] = l.eid;
      es[li+LFLAG] = l.flag;
      es[li+LE] = l.e.index;
      es[li+LV] = l.v.index;
    }

    return this;
  }

  save() {
    let data = [];
    nstructjs.manager.writeObject(data, this);
    return data;
  }
}

CompressedMesh.STRUCT = `
mesh.CompressedMesh {
  verts : mesh.CompressMeshElemList;
  edges : mesh.CompressMeshElemList;
  faces : mesh.CompressMeshElemList;
  loops : mesh.CompressMeshElemList;
}
`
nstructjs.register(CompressedMesh);


export class Mesh extends SceneObjectData {
  constructor(features = MeshFeatures.BASIC) {
    super();

    this.symFlag = 0; //symmetry flag;
    this.uvRecalcGen = 0;

    this._last_bvh_key = "";
    this._last_wr_key = "";
    this._last_wr_loophash = undefined;

    this._debug_id1 = _idgen++;

    this.features = features;

    this.materials = [];
    this.usesMaterial = true;

    this.bvh = undefined;
    this.uvWrangler = undefined;

    this._ltris = undefined;
    this._ltrimap_start = {}; //maps face eid to first loop index
    this._ltrimap_len = {}; //maps face eid to first loop index

    this._fancyMeshes = {};

    this.updatelist = {};
    this.lastUpdateList = {};

    //used to signal rebuilds of viewport meshes,
    //current mesh data generation
    this.updateGen = 0;
    this.partialUpdateGen = 0;

    this.drawflag = MeshDrawFlags.USE_LOOP_NORMALS;

    this.eidgen = this._makeEIDGen(new util.IDGen());

    this.eidmap = {};
    this.recalc = RecalcFlags.RENDER | RecalcFlags.TESSELATE;
    this.smesh = undefined;
    this.program = undefined;
    //this.uniforms = {
    //  uColor : [1, 1, 1, 1]
    //};

    this.elists = {};

    this.verts = this.getElemList(MeshTypes.VERTEX);
    this.loops = this.getElemList(MeshTypes.LOOP);
    this.edges = this.getElemList(MeshTypes.EDGE);
    this.faces = this.getElemList(MeshTypes.FACE);
    this.handles = this.getElemList(MeshTypes.HANDLE);

    //used ex
    this.uiTriangleCount = 0;

    if (debuglog) {
      this.debuglog = [];
    }
  }

  compress2() {
    return new CompressedMesh().loadMesh(this);
  }

  compress() {
    let data = [];

    nstructjs.manager.writeObject(data, this);

    console.log((data.length/1024/1024).toFixed(2) + "mb");
    return data;
  }

  _makeEIDGen(eidgen2 = new util.IDGen()) {
    let this2 = this;

    eidgen2.next = function() {
      if (this2._debug_id1 !== -1) {
        //console.warn(this2._debug_id1, this2.eidgen._cur);
      }

      return util.IDGen.prototype.next.apply(this, arguments);
    }

    return eidgen2;
  }

  hasHandles() {
    return this.features & MeshFeatures.EDGE_HANDLES;
  }

  get uniforms() {
    throw new Error("no longer supported: Mesh.prototype.uniforms property!");
  }

  getElemLists() {
    let ret = [];

    for (let k in this.elists) {
      ret.push(this.elists[k]);
    }

    return ret;
  }

  updateIndices() {
    this.verts.updateIndices();
    this.edges.updateIndices();
    this.faces.updateIndices();
    //don't do loops, that doesn't really make sense

    return this;
  }

  get loopTris() {
    if (this._ltris === undefined || (this.recalc & RecalcFlags.TESSELATE)) {
      this.tessellate();
    }

    return this._ltris;
  }

  getElemList(type) {
    if (!(type in this.elists)) {
      this.elists[type] = new ElementList(type);
      this.elists[type].customData.on_layeradd = this._on_cdlayer_add.bind(this);
      this.elists[type].customData.on_layerremove = this._on_cdlayer_rem.bind(this);
    }

    return this.elists[type];
  }

  static nodedef() {
    return {
      name: "mesh",
      uiname: "Mesh",
      flag: NodeFlags.SAVE_PROXY,
      inputs: Node.inherit({}),
      outputs: Node.inherit({})
    }
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

    for (let i=0; i<len; i++) {
      let l1 = log1[i], l2 = log2[i];

      let line = `${pad(l1.e.constructor.name)} ${l1.eid} ${pad(l2.e.constructor.name)} ${l2.eid}\n`;
      lines.push(line);

      buf += line;
    }

    buf += "\n\n";

    for (let i=0; i<len; i++) {
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

  _element_init(e, set_eid=true) {
    let list = this.getElemList(e.type);

    list.customData.initElement(e);

    if (set_eid) {
      e.eid = this.eidgen.next();
      this.eidmap[e.eid] = e;
    }

    if (this.debuglog) {
      this.debuglog.push({
        e, eid : e.eid, type : e.type
      });
    }
  }

  makeVertex(co) {
    if (!(this.features & MeshFeatures.MAKE_VERT))
      throw new MeshFeatureError("makeVertex not supported");

    var v = new Vertex(co);

    this._element_init(v);
    this.verts.push(v);

    v.flag |= MeshFlags.UPDATE;

    return v;
  }

  getEdge(v1, v2) {
    for (var e of v1.edges) {
      if (e.otherVertex(v1) === v2)
        return e;
    }

    return undefined;
  }

  ensureEdge(v1, v2) {
    let e = this.getEdge(v1, v2);

    if (e === undefined) {
      e = this.makeEdge(v1, v2);
    }

    return e;
  }

  _makeHandle(e) {
    let h = new Handle();
    h.owner = e;

    this._element_init(h);
    this.handles.push(h);

    return h;
  }

  makeEdge(v1, v2, checkExist = false) {
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

    var e = new Edge();

    e.v1 = v1;
    e.v2 = v2;

    v1.edges.push(e);
    v2.edges.push(e);

    this._element_init(e);
    this.edges.push(e);

    if (this.features & MeshFeatures.EDGE_HANDLES) {
      e.h1 = this._makeHandle(e);
      e.h2 = this._makeHandle(e);

      e.h1.load(e.v1).interp(e.v2, 1.0 / 3.0);
      e.h2.load(e.v1).interp(e.v2, 2.0 / 3.0);
    }

    e.flag |= MeshFlags.UPDATE;

    return e;
  }

  minMax() {
    this.min = new Vector3();
    this.max = new Vector3();

    if (this.verts.length === 0) {
      return;
    }

    this.min[0] = this.min[1] = this.min[2] = 1e17;
    this.max[0] = this.max[1] = this.max[2] = -1e17;

    for (let v of this.verts) {
      this.min.min(v);
      this.max.max(v);
    }

    return this;
  }

  _makeLoop() {
    let loop = new Loop();

    loop.radial_next = loop.radial_prev = loop;

    this._element_init(loop);
    this.loops.push(loop);

    return loop;
  }

  _killLoop(loop) {
    this._radialRemove(loop.e, loop);

    this.loops.remove(loop);
    delete this.eidmap[loop.eid];
    loop.eid = -1;
  }

  //new_vmap is an object mapping old vertex eid's to new vertices
  copyFace(f, new_vmap) {
    let f2 = new Face();

    this._element_init(f2);
    this.faces.push(f2);
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

    this.regenTesellation();

    return f2;
  }

  makeQuad(v1, v2, v3, v4) {
    _quad[0] = v1;
    _quad[1] = v2;
    _quad[2] = v3;
    _quad[3] = v4;

    return this.makeFace(_quad);
  }

  makeTri(v1, v2, v3) {
    if (!v1 || !v2 || !v3) {
      console.log("missing verts", v1, v2, v3);
      throw new MeshError("Missing verts in makeTri");
    }

    if (v1 === v2 || v1 === v3 || v2 === v3) {
      console.log("duplicate verts", v1, v2, v3);
      throw new MeshError("Duplicate verts in makeTri");
    }

    _tri[0] = v1;
    _tri[1] = v2;
    _tri[2] = v3;

    return this.makeFace(_tri);
  }

  makeFace(verts) {
    if (!(this.features & MeshFeatures.MAKE_FACE))
      throw new MeshFeatureError("makeFace not supported");

    if (verts.length < 2) {
      throw new Error("need at least two verts");
    }

    let f = new Face();

    f.flag |= MeshFlags.UPDATE;

    let firstl, prevl;

    let list = new LoopList();
    f.lists.push(list);

    list.length = verts.length;

    for (let v of verts) {
      let l = this._makeLoop();

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
    }

    list.l = firstl;
    firstl.prev = prevl;
    prevl.next = firstl;

    for (let l of list) {
      l.e = this.ensureEdge(l.v, l.next.v);
      this._radialInsert(l.e, l);
    }

    f.calcCent();
    f.calcNormal();

    this._element_init(f);
    this.faces.push(f);

    return f;
  }

  get hasCustomNormals() {
    let ret = this.loops.customData.hasLayer(NormalLayerElem);
    return ret || this.verts.customData.hasLayer(NormalLayerElem);
    return ret;
  }

  _recalcNormals_intern() {
    for (let f of this.faces) {
      f.calcNormal();
    }

    this._recalcVertexNormals();
  }

  _recalcVertexNormals() {
    let i = 0;
    let vtots = new Array(this.verts.length);

    for (let v of this.verts) {
      v.index = i++;
      v.no.zero();
      vtots[v.index] = 0;
    }

    for (let e of this.edges) {
      e.updateLength();
    }

    let ltris = this.loopTris;

    for (let i=0; i<ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];

      let n = math.normal_tri(l1.v, l2.v, l3.v);
      let w = math.tri_area(l1.v, l2.v, l3.v);

      l1.v.no.addFac(n, w);
      l2.v.no.addFac(n, w);
      l3.v.no.addFac(n, w);

      vtots[l1.v.index] += w;
      vtots[l2.v.index] += w;
      vtots[l3.v.index] += w;
    }

    for (let v of this.verts) {
      if (vtots[v.index] > 0) {
        v.no.normalize();
      }
    }
  }

  recalcNormalsCustom() {
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

      this._recalcVertexNormals();
      return;
    }

    if (!this.faces.customData.hasLayer(NormalLayerElem)) {
      if (this.loops.customData.hasLayer(NormalLayerElem)) {
        let cd_nor = this.loops.customData.getLayerIndex(NormalLayerElem);
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
            let no = l.customData[cd_nor].no;
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
        let cd_nor = this.verts.customData.getLayerIndex(NormalLayerElem);

        //copy vert normals to faces
        for (let f of this.faces) {
          f.no.zero();

          for (let l of f.loops) {
            let no = l.v.customData[cd_nor].no;
            no.normalize();

            f.no.add(no);
          }

          f.no.normalize();
        }
      }
    } else {
      let cd_no = this.faces.customData.getLayerIndex(NormalLayerElem);

      for (let f of this.faces) {
        f.no.load(f.customData[cd_no].no).normalize();
      }

      this._recalcVertexNormals();
    }
  }

  recalcNormals() {
    for (let f of this.faces) {
      f.calcCent();
    }

    if (this.hasCustomNormals) {
      this.recalcNormalsCustom();
    } else {
      this._recalcNormals_intern();
    }
  }

  killVertex(v, _nocheck = false) {
    if (!_nocheck) {
      if (!(this.features & MeshFeatures.KILL_VERT))
        throw new MeshFeatureError("killVertex not supported");
    }

    if (v.eid === -1) {
      console.trace("Warning: vertex", v.eid, "already freed", v);
      return;
    }

    let _i = 0;
    while (v.edges.length > 0 && _i++ < 10000) {
      this.killEdge(v.edges[0]);
    }

    if (_i >= 10000) {
      console.trace("mesh integrity warning, infinite loop detected in killVertex");
    }

    delete this.eidmap[v.eid];
    this.verts.remove(v);
    v.eid = -1;
  }

  killEdge(e) {
    if (!(this.features & MeshFeatures.KILL_EDGE))
      throw new MeshFeatureError("killEdge not supported");

    if (e.eid == -1) {
      console.trace("Warning: edge", e.eid, "already freed", e);
      return;
    }

    let _i = 0;
    while (e.l !== undefined && _i++ < 10000) {
      this.killFace(e.l.f);
    }

    delete this.eidmap[e.eid];
    this.edges.remove(e);

    e.eid = -1;

    e.v1.edges.remove(e);
    e.v2.edges.remove(e);

    if (e.h1) {
      this.handles.remove(e.h1);
      e.h1.eid = -1;
    }

    if (e.h2) {
      this.handles.remove(e.h2);
      e.h2.eid = -1;
    }
  }

  killFace(f) {
    if (!(this.features & MeshFeatures.KILL_FACE))
      throw new MeshFeatureError("killEdge not supported");

    if (f.eid == -1) {
      console.trace("Warning: face", f.eid, "already freed", f);
      return;
    }

    for (let list of f.lists) {
      for (let l of list) {
        this._killLoop(l);
      }
    }

    delete this.eidmap[f.eid];
    this.faces.remove(f);

    f.eid = -1;
  }

  setActive(e) {
    this.getElemList(e.type).active = e;
  }

  clearHighlight() {
    for (let list of this.getElemLists()) {
      list.highlight = undefined;
    }
  }

  setHighlight(e) {
    this.getElemList(e.type).highlight = e;
  }

  /** flushes MeshFlags.UPDATE from faces/edges to vertices*/
  flushUpdateFlags(typemask=MeshFlags.EDGE|MeshFlags.FACE) {
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

  selectFlush(selmode) {
    if (selmode & MeshTypes.VERTEX) {
      this.edges.selectNone();

      var set_active = this.edges.active === undefined;
      set_active = set_active || !((this.edges.active.v1.flag | this.edges.active.v2.flag) & MeshFlags.SELECT);

      for (var e of this.edges) {
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

        let sel = 1;

        for (let e of f.edges) {
          if (!(e.flag & MeshFlags.SELECT)) {
            sel = 0;
            break;
          }
        }

        this.faces.setSelect(f, sel);
      }
    } else if (selmode & MeshTypes.EDGE) {
      this.verts.selectNone();

      for (var v of this.verts) {
        for (var e of v.edges) {
          if (e.flag & MeshFlags.SELECT) {
            this.verts.setSelect(v, true);
            break;
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

  setOrigIndex() {
    this.ensureOrigIndexLayer();

    for (let k in this.elists) {
      let elist = this.elists[k];

      if (elist.type == MeshTypes.LOOP) {
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
  ensureOrigIndexLayer() {
    for (let k in this.elists) {
      let elist = this.elists[k];

      if (elist.type == MeshTypes.LOOP) {
        continue;
      }

      if (elist.customData.hasLayerType("origindex")) {
        continue;
      }

      elist.customData.addLayer(OrigIndexElem);
    }
  }

  _splitEdgeNoFace(e, t = 0.5) {
    let v1 = e.v1, v2 = e.v2;

    t = t === undefined ? 0.5 : t;

    var nv = this.makeVertex(e.v1).interp(e.v2, t);
    var ne = this.makeEdge(nv, e.v2);

    this.copyElemData(ne, e);

    e.v2.edges.remove(e);

    e.v2 = nv;
    nv.edges.push(e);

    if (e.flag & MeshFlags.SELECT) {
      this.edges.setSelect(ne, true);
    }

    if ((e.v1 & MeshFlags.SELECT) && (e.v2 & MeshFlags.SELECT)) {
      this.verts.setSelect(nv, true);
    }

    _cdtemp1[0] = e;
    _cdwtemp1[0] = 1.0;

    this.edges.customDataInterp(ne, _cdtemp1, _cdwtemp1);

    _cdtemp2[0] = v1;
    _cdtemp2[1] = v2;

    _cdwtemp2[0] = 1.0 - t;
    _cdwtemp2[1] = t;

    this.verts.customDataInterp(nv, _cdtemp2, _cdwtemp2);

    return [ne, nv];
  }

  collapseEdge(e) {
    if (!e.l) {
      this.killEdge(e);
      return;
    }

    let temp = _collapsetemp;
    let temp2 = _collapsetemp2;
    let temp3 = _collapsetemp3;

    let v1 = e.v1, v2 = e.v2;

    e.v1.flag |= MeshFlags.UPDATE;
    e.v2.flag |= MeshFlags.UPDATE;

    //e.v2.interp(e.v1, 0.5);
    e.v1.interp(e.v2, 0.5);
    temp.length = 0;
    temp3.length = 0;

    for (let e2 of v2.edges) {
      temp3.push(e2);

      for (let l of e2.loops) {
        temp.push(l);
      }
    }

    for (let l of temp) {
      let f = l.f;

      for (let l2 of f.lists[0]) {
        if (!l2.e) {
          continue;
        }

        this._radialRemove(l2.e, l2);
        l2.e = undefined;

        if (l2.v === v2) {
          l2.v = v1;
        }
      }
    }

    temp2.length = 0;

    for (let l of temp) {
      let f = l.f;

      if (f.eid < 0) {
        continue;
      }

      let l2 = f.lists[0].l;
      let _i = 0;
      do {
        while (l2.list.length > 2 && l2.next !== l2 && l2.v === l2.next.v && _i++ < 1000) {
          if (f.lists[0].l === l2) {
            f.lists[0].l = l2.next;
            f.lists[0].length--;
          }

          if (l2.eid >= 0) {
            this.loops.remove(l2);
            delete this.eidmap[l2.eid];
            l2.eid = -1;
          }

          l2.prev.next = l2.next;
          l2.next.prev = l2.prev;
          l2 = l2.next;
        }

        l2 = l2.next;
      } while (l2 !== f.lists[0].l && _i++ < 1000);

      f.lists[0]._recount();

      if (f.lists[0].length < 3) {
        for (let list of f.lists) {
          for (let l3 of list) {
            if (l3.eid >= 0) {
              delete this.eidmap[l3.eid];
              this.loops.remove(l3);
              l3.eid = -1;
            }
          }
        }
        delete this.eidmap[f.eid];
        this.faces.remove(f);
        f.eid = -1;
      } else {
        temp2.push(f);
      }
    }

    for (let e2 of temp3) {
      e2.l = undefined;
      this.killEdge(e2);
    }

    for (let f of temp2) {
      for (let l2 of f.lists[0]) {
        if (l2.e) {
          //console.log("twice");
          continue;
        }

        if (l2.v === l2.next.v) {
          if (f.lists[0].l === l2.next) {
            f.lists[0].l = l2;
          }

          let l3 = l2.next;

          l3.next.prev = l2;
          l2.next = l3.next;

          delete this.eidmap[l3.eid];
          this.loops.remove(l3);
          l3.eid = -1;
        }
        l2.list._recount();
        //console.log("LEN", l2.list.length);

        l2.e = this.makeEdge(l2.v, l2.next.v, true);
        this._radialInsert(l2.e, l2);
      }

    }

    this.killVertex(v2);
  }

  reverseWinding(f) {
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
  }

  makeHole(f, vs) {
    throw new Error("makeHole: implement me!");
    console.error("makeHole: IMPLEMENT ME!");

  }

  /** trys to connect two verts through exactly
   *  one face, which is split.  returns loop of new split edge*/
  connectVerts(v1, v2) {
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
        console.log("found face");

        return this.splitFaceAtVerts(f, v1, v2);
      }
    }
  }

  splitFaceAtVerts(f, v1, v2) {
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
        return this.splitFace(f, l1, l2);
      }
    }

    console.warn("Failed to split face", f, v1, v2);
  }

  splitFace(f, l1, l2) {
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
      console.log(l2 === l1.next, l2 === l1.prev, l1.f !== f, l2.f !== f, l1 === l2);
      throw new MeshError("splitFace: l1 and l2 are bad");
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

    let f2 = new Face();
    this._element_init(f2);
    this.faces.push(f2);

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

    //this._radialRemove(l1.e, l1);
    //this._radialRemove(l2.e, l2);

    let el1 = new Loop();
    this._element_init(el1);
    this.loops.push(el1);
    el1.radial_next = el1.radial_prev = undefined;

    let el2 = new Loop();
    this._element_init(el2);
    this.loops.push(el2);
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

    return el2;
  }

  splitEdge(e, t = 0.5) {
    if (!(this.features & MeshFeatures.SPLIT_EDGE))
      throw new MeshFeatureError("splitEdge not supported");

    let ret = this._splitEdgeNoFace(e, t);

    if (e.l === undefined) {
      return ret;
    }

    let ne = ret[0], nv = ret[1];
    let v1 = e.v1, v2 = ne.v2;

    let l = e.l;

    let _i = 0;

    do {
      if (_i > 1000) {
        console.warn("infinite loop detected in splitEdge");
        break;
      }

      split_temp[_i++] = l;

      l = l.radial_next;
    } while (l !== e.l);

    split_temp.used = _i;


    for (let i = 0; i < split_temp.used; i++) {
      let l = split_temp[i];

      let lnext = l.next;

      let l2 = this._makeLoop();

      l2.list = l.list;
      l2.f = l.f;

      if (l.v === v1) {
        l2.v = nv;
        l2.e = ne;

        this._radialInsert(ne, l2);

        l.next.prev = l2;
        l2.next = l.next;
        l2.prev = l;
        l.next = l2;
      } else {
        l.v = v2;
        l.e = ne;

        this._radialRemove(e, l);
        this._radialInsert(ne, l);

        l2.v = nv;
        l2.e = e;

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

  _radialRemove(e, l) {
    if (e.l === l) {
      e.l = l === l.radial_next ? undefined : l.radial_next;
    }

    l.radial_next.radial_prev = l.radial_prev;
    l.radial_prev.radial_next = l.radial_next;
  }

  //XXX untested!
  dissolveVertex(v) {
    if (!(this.features & MeshFeatures.JOIN_EDGE))
      throw new MeshFeatureError("dissolveVertex not supported");

    //handle case of two-valence vert with no surrounding faces
    if (v.edges.length === 2 && v.edges[0].l === undefined && v.edges[1].l === undefined) {
      let v1 = v.edges[0].otherVertex(v);
      let v2 = v.edges[1].otherVertex(v);

      this.ensureEdge(v1, v2);
      return;
    }

    let faces = new util.set();

    if (v.edges.length === 0) {
      this.killVertex(v, true);
      return;
    }

    for (let f of v.faces) {
      faces.add(f);
    }

    let vset = new set();
    let verts = [];

    //scan in both directions
    for (let step = 0; step < 2; step++) {
      let startv = v, _i = 0;
      let verts2 = step ? [] : verts;

      let v1 = v.edges[0].otherVertex(v);
      let l = v.edges[0].l;
      let e;

      if (l.v === v1) {
        e = l.next.e;
      } else {
        e = l.prev.e;
      }

      if (step) {
        v = e.otherVertex(v);
      }

      do {
        verts2.push(v);
        v = e2.otherVertex(v);
        let ok = false;

        for (let e2 of v1.edges) {
          if (e === e2)
            break;

          for (let f of e2.faces) {
            if (fset.has(f) && !e2.has(v)) {
              ok = true;
              e = e2;
              break;
            }
          }
        }

        if (!ok) {
          break;
        }

        if (_i++ > 10000) {
          console.warn("infinite loop detected in dissolve vert");
          break;
        }
      } while (v1 !== startv);

      if (step) {
        verts2.reverse();
        verts = verts2.concat(verts);
      }
    }

    return this.makeFace(verts);
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

  setShadeSmooth(smooth) {
    for (let f of this.faces) {
      if (smooth)
        f.flag &= ~MeshFlags.FLAT;
      else
        f.flag |= MeshFlags.FLAT;
    }

    this.regenRender();
  }

  updateGrids() {
    let cd_grid = GridBase.meshGridOffset(this);

    if (cd_grid < 0) {
      return;
    }

    let cls = this.loops.customData.flatlist[cd_grid].typeName;
    cls = CustomDataElem.getTypeClass(cls);

    cls.updateSubSurf(this, cd_grid, true);

    for (let l of this.loops) {
      let grid = l.customData[cd_grid];

      grid.update(this, l, cd_grid);
    }
  }

  exec(ctx) {
    super.exec();

    this.updateGrids();
  }

  tessellate() {
    if (DEBUG.simplemesh) {
      console.warn("Mesh tesselation");
    }

    this.recalc &= ~RecalcFlags.TESSELATE;
    let ltris = this._ltris = [];

    this._ltrimap_start = {};
    this._ltrimap_len = {};

    let lstart = this._ltrimap_start;
    let llen = this._ltrimap_len;

    for (let f of this.faces) {
      let first = f.lists[0].l;
      let l = f.lists[0].l.next;
      let _i = 0;

      lstart[f.eid] = ltris.length;

      do {
        ltris.push(first);
        ltris.push(l);
        ltris.push(l.next);

        if (_i++ > 100000) {
          console.warn("infinite loop detected!");
          break;
        }

        l = l.next;
      } while (l.next !== f.lists[0].l);

      llen[f.eid] = _i;
    }

    let haveGrid = GridBase.meshGridOffset(this) >= 0;

    if (!haveGrid) {
      this.uiTriangleCount = ltris.length/3;
    }
  }

  compact() {
    for (let k in this.elists) {
      this.elists[k].compact();
    }
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

        if (layers & LayerTypes.COLOR) {
          color1.load(e.v1.color).interp(e.v2.color, t);
          color2.load(e.v1.color).interp(e.v2.color, t + dt);
        }

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
      return this.genRender_full(gl, combinedWireframe, view3d);
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

  destroy(gl) {
    super.destroy();

    if (gl === undefined) {
      //we inherit destroy() from DataBlock,
      //so we might not be called with gl
      //I guess rely on GC?
      return;
    }

    if (this.smesh !== undefined) {
      this.smesh.destroy(gl);
      this.smesh = undefined;
    }
  }

  getUVWrangler(check=true, checkUvs=false) {
    let update = !this.uvWrangler || (this.recalc & RecalcFlags.UVWRANGLER);

    if (!check && this.uvWrangler) {
      return this.uvWrangler;
    }

    if (this._last_wr_loophash === undefined) {
      checkUvs = true;
    }

    let cd_uv = this.loops.customData.getLayerIndex("uv");

    let key = "" + this.loops.length + ":" + this.edges.length + ":" + this.faces.length;
    key += ":" + this.verts.length + ":" + cd_uv;

    if (checkUvs && cd_uv >= 0) {
      let hash = new util.HashDigest();

      for (let l of this.loops) {
        let uv = l.customData[cd_uv].uv;

        hash.add(uv[0]*8196);
        hash.add(uv[1]*8196);
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

      this.uvWrangler = new UVWrangler(this, this.faces, cd_uv);
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

  getBVH(auto_update = true, useGrids = true) {
    let key = this.verts.length + ":" + this.faces.length + ":" + this.edges.length + ":" + this.loops.length;
    key += ":" + this.eidgen._cur + ":" + useGrids;

    if (useGrids) {
      key += ":" + GridBase.meshGridOffset(this);
    }

    if (!this.bvh || key !== this._last_bvh_key) {
      this._last_bvh_key = key;

      if (auto_update || !this.bvh) {
        console.error("BVH rebuild!");

        this.bvh = BVH.create(this, true, useGrids);
        if (useGrids) {
          this.uiTriangleCount = this.bvh.root.tottri;
        }
      }
    }

    return this.bvh;
  }

  genRenderBasic(combinedWireframe = false) {
    let ltris = this.loopTris;
    let lf = LayerTypes;

    let sm = new SimpleMesh(lf.LOC | lf.NORMAL | lf.UV | lf.COLOR | lf.ID);

    let haveuv = this.loops.customData.hasLayer("uv");
    let cd_uv = this.loops.customData.getLayerIndex("uv");

    for (let i = 0; i < ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];
      let f = l1.f;

      let tri = sm.tri(l1.v, l2.v, l3.v);

      if (f.flag & MeshFlags.SMOOTH_DRAW) {
        tri.normals(l1.v.no, l2.v.no, l3.v.no);
      } else {
        tri.normals(f.no, f.no, f.no);
      }

      tri.ids(f.eid, f.eid, f.eid);

      if (haveuv) {
        tri.uvs(l1.customData[cd_uv].uv, l2.customData[cd_uv].uv, l3.customData[cd_uv].uv);
      }
    }

    if (combinedWireframe) {
      for (let e of this.edges) {
        let line = sm.line(e.v1, e.v2);

        line.ids(e.eid, e.eid);
        line.uvs([0, 0], [1, 0]);
        line.colors(e.v1.color, e.v2.color);
        line.normals(e.v1.no, e.v2.no);
      }
    }

    return sm;
  }

  _genRender_full(gl, combinedWireframe = false) {
    this.recalc &= ~RecalcFlags.RENDER;
    this.updateGen = ~~(Math.random() * 1024 * 1024 * 1024);

    //if (this.recalc & RecalcFlags.ELEMENTS) {
    this._genRenderElements(gl, {});
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

          let uvidx = -1;
          let j = 0;

          for (let data of l1.customData) {
            if (data instanceof UVLayerElem) {
              uvidx = j;
              break;
            }

            j++;
          }

          if (uvidx >= 0) {
            tri.uvs(l1.customData[uvidx].uv, l2.customData[uvidx].uv, l3.customData[uvidx].uv);
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
    if (program !== undefined && this.wmesh !== undefined && this.wmesh.island !== undefined) {
      this.wmesh.program = program;
      this.wmesh.island.program = program;

      program.bind(gl);
    }

    if (this.wmesh) {
      this.wmesh.draw(gl, uniforms);
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
      v[0] = 0;
    }

    if (v.flag & MeshFlags.MIRROREDY) {
      v[1] = 0;
    }

    if (v.flag & MeshFlags.MIRROREDZ) {
      v[2] = 0;
    }
  }

  updateMirrorTags(threshold = 0.0001) {
    for (let v of this.verts) {
      this.updateMirrorTag(v, threshold);
    }
  }

  _genRenderElements(gl, uniforms) {
    genRenderMesh(gl, this, uniforms);
    this.updateGen = ~~(Math.random() * 1024 * 1024 * 1024);
  }

  clearUpdateFlags(typemask) {
    for (let k in this.elists) {
      let list = this.elists[k];

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

  drawElements(view3d, gl, selmask, uniforms, program, object, drawTransFaces = false) {
    return drawMeshElements(this, ...arguments);
  }

  draw(view3d, gl, uniforms, program, object) {
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

  swapDataBlockContents(mesh) {
    return super.swapDataBlockContents(...arguments);
  }

  get elements() {
    var this2 = this;

    return (function* () {
      for (var k in this2.eidmap) {
        yield this2.eidmap[k];
      }
    })()
  }

  clearCustomData() {
    for (let k in this.elists) {
      let elist = this.elists[k];
      elist.clearCustomData();
    }
  }

  regenBVH() {
    if (this.bvh) {
      this.bvh.destroy(this);
      this.bvh = undefined;
    }

    return this;
  }

  regenTesellation() {
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
    this.recalc |= RecalcFlacs.UVWRANGLER;
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

  regenPartial() {
    this.recalc |= RecalcFlags.PARTIAL | RecalcFlags.ELEMENTS;
    return this;
  }

  _getArrays() {
    let ret = [];
    for (let k in this.elists) {
      ret.push(this.elists[k]);
    }

    return ret;
  }

  copyElemData(dst, src) {
    if (dst.type !== src.type) {
      throw new Error("mismatched between element types in Mesh.prototype.copyElemData()");
    }

    for (let i = 0; i < dst.customData.length; i++) {
      dst.customData[i].load(src.customData[i]);
    }

    dst.flag = src.flag;

    switch (dst.type) {
      case MeshTypes.HANDLE:
        dst.load(src);
        dst.mode = src.mode;
        dst.color.load(src.color);
        dst.roll = src.roll;
        break;
      case MeshTypes.VERTEX:
        dst.load(src);
        dst.no.load(src.no);
        break
      case MeshTypes.FACE:
        dst.cent.load(src.cent);
        dst.no.load(src.no);
        break
    }
  }

  copy(addLibUsers = false, clearCustomData=false) {
    let ret = new this.constructor();

    ret.materials = [];
    for (let mat of this.materials) {
      ret.materials.push(mat);

      if (addLibUsers) {
        mat.lib_addUser(this);
      }
    }

    for (let elist of ret.getElemLists()) {
      if (this.elists[elist.type].customData === undefined) {
        continue;
      }

      if (!clearCustomData) {
        elist.customData = this.elists[elist.type].customData.copy();
        elist.customData.on_layeradd = ret._on_cdlayer_add.bind(ret);
        elist.customData.on_layerremove = ret._on_cdlayer_rem.bind(ret);
      }
    }

    ret.eidgen = ret._makeEIDGen(this.eidgen.copy());
    let eidmap = ret.eidmap = {};

    for (let v of this.verts) {
      let v2 = new Vertex(v);

      v2.no.load(v.no);

      v2.flag = v.flag;
      v2.index = v.index;
      v2.eid = v.eid;

      eidmap[v2.eid] = v2;
      ret.verts.push(v2);
      ret.verts.customData.initElement(v2);

      if (!clearCustomData) {
        ret.copyElemData(v2, v);
      }
    }

    for (let h of this.handles) {
      let h2 = new Handle(h);

      h2.flag = h.flag;
      h2.index = h.index;
      h2.eid = h.eid;

      eidmap[h2.eid] = h2;
      ret.handles.push(h2);
      ret.handles.customData.initElement(h2);

      h2.mode = h.mode;
      h2.roll = h.roll;
      h2.color.load(h.color);

      if (!clearCustomData) {
        ret.copyElemData(h2, h);
      }
    }

    for (let e of this.edges) {
      let v1 = eidmap[e.v1.eid];
      let v2 = eidmap[e.v2.eid];

      let e2 = new Edge();

      e2.eid = e.eid;
      e2.flag = e.flag;
      e2.index = e.index;

      eidmap[e2.eid] = e2;
      ret.edges.push(e2);
      ret.edges.customData.initElement(e2);

      e2.v1 = v1;
      e2.v2 = v2;

      v1.edges.push(e2);
      v2.edges.push(e2);

      if (e.h1) {
        e2.h1 = eidmap[e.h1.eid];
        e2.h2 = eidmap[e.h2.eid];

        e2.h1.owner = e2;
        e2.h2.owner = e2;
      }

      if (!clearCustomData) {
        ret.copyElemData(e2, e);
      }
    }

    for (let l of this.loops) {
      let l2 = new Loop();

      l2.flag = l.flag;
      l2.eid = l.eid;
      l2.index = l.index;

      eidmap[l2.eid] = l2;
      ret.loops.push(l2);
      ret.loops.customData.initElement(l2);

      l2.e = eidmap[l.e.eid];
      l2.v = eidmap[l.v.eid];

      l2.radial_next = l.radial_next.eid;
      l2.radial_prev = l.radial_prev.eid;
      l2.next = l.next.eid;
      l2.prev = l.prev.eid;

      l2.f = l.f.eid;

      if (!clearCustomData) {
        ret.copyElemData(l2, l);
      }
    }

    for (let e of this.edges) {
      let e2 = eidmap[e.eid];

      if (e.l !== undefined) {
        e2.l = eidmap[e.l.eid];
      }
    }

    for (let l2 of ret.loops) {
      l2.radial_next = eidmap[l2.radial_next];
      l2.radial_prev = eidmap[l2.radial_prev];
      l2.next = eidmap[l2.next];
      l2.prev = eidmap[l2.prev];
    }

    for (let f of this.faces) {
      let f2 = new Face();

      f2.lists = [];

      f2.eid = f.eid;
      f2.index = f.index;
      f2.flag = f.flag;

      eidmap[f2.eid] = f2;
      ret.faces.push(f2);
      ret.faces.customData.initElement(f2);

      f2.cent.load(f.cent);
      f2.no.load(f.no);

      for (let list of f.lists) {
        let list2 = new LoopList();

        list2.flag = list.flag;
        list2.l = eidmap[list.l.eid];

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
        delete ret.eidmap[l2.eid];
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

  validateMesh(msg_out = [0]) {
    let fix = false;

    let visit = new util.set();
    let totshell = 0;

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

    for (let f of this.faces) {
      for (let list of f.lists) {
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

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.eidgen = this._makeEIDGen(this.eidgen);

    this.elists = {};

    for (let elist of this._elists) {
      this.elists[elist.type] = elist;
    }

    delete this._elists;

    this.verts = this.getElemList(MeshTypes.VERTEX);
    this.loops = this.getElemList(MeshTypes.LOOP);
    this.edges = this.getElemList(MeshTypes.EDGE);
    this.faces = this.getElemList(MeshTypes.FACE);
    this.handles = this.getElemList(MeshTypes.HANDLE);

    for (let k in this.elists) {
      let elist = this.elists[k];

      elist.customData.on_layeradd = this._on_cdlayer_add.bind(this);
      elist.customData.on_layerremove = this._on_cdlayer_rem.bind(this);
    }

    this.regenRender();

    let eidmap = this.eidmap;

    for (let vert of this.verts) {
      eidmap[vert.eid] = vert;
    }

    for (let h of this.handles) {
      eidmap[h.eid] = h;
    }

    for (let e of this.edges) {
      eidmap[e.eid] = e;

      e.v1 = eidmap[e.v1];
      e.v2 = eidmap[e.v2];

      e.h1 = eidmap[e.h1];
      e.h2 = eidmap[e.h2];
    }

    for (let h of this.handles) {
      h.owner = eidmap[h.owner];
    }
    for (let l of this.loops) {
      eidmap[l.eid] = l;
    }

    for (let e of this.edges) {
      e.l = eidmap[e.l];
    }

    for (let face of this.faces) {
      eidmap[face.eid] = face;

      for (let list of face.lists) {
        list.l = eidmap[list.l];
      }
    }

    for (let l of this.loops) {
      l.radial_next = eidmap[l.radial_next];
      l.radial_prev = eidmap[l.radial_prev];

      l.next = eidmap[l.next];
      l.prev = eidmap[l.prev];

      l.f = eidmap[l.f];
      l.e = eidmap[l.e];
      l.v = eidmap[l.v];

      //detected old corrupted files
      if (l.e.l === undefined) {
        l.e.l = l;
      }
    }

    for (let v of this.verts) {
      for (let i = 0; i < v.edges.length; i++) {
        v.edges[i] = eidmap[v.edges[i]];
      }
    }

    for (let e of this.edges) {
      e.updateLength();
    }

    for (let f of this.faces) {
      for (let list of f.lists) {
        list.length = 0;

        for (let l of list) {
          l.list = list;
          list.length++;
        }
      }
    }

    for (let k in this.elists) {
      this.elists[k].fixCustomData();
    }

    this.validateMesh();
  }

  getBoundingBox(useGrids = true) {
    let ret = undefined;

    for (let v of this.verts) {
      if (ret === undefined) {
        ret = [new Vector3(v), new Vector3(v)]
      } else {
        ret[0].min(v);
        ret[1].max(v);
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

        let grid = l.customData[cd_grid];

        for (let p of grid.points) {
          ret[0].min(p);
          ret[1].max(p);
        }
      }
    }

    return ret;
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

  static dataDefine() {
    return {
      name: "Mesh",
      selectMask: SelMask.MESH,
      tools: MeshTools
    }
  }
};

Mesh.STRUCT = STRUCT.inherit(Mesh, SceneObjectData, "mesh.Mesh") + `
  _elists   : array(mesh.ElementList) | obj._getArrays();
  eidgen    : IDGen;
  flag      : int;
  symFlag   : int;
  features  : int;
  uiTriangleCount : int;
}
`;

nstructjs.manager.add_class(Mesh);
DataBlock.register(Mesh);
SceneObjectData.register(Mesh);

window._debug_recalc_all_normals = function (force = false) {
  let scene = CTX.scene;
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
      window.updateDataGraph();
      window.redraw_viewport();
    }
  }
}

window.Mesh = Mesh