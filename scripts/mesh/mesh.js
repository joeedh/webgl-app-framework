// var _mesh = undefined;

import {NodeFlags} from '../core/graph.js';

import * as simplemesh from '../core/simplemesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {DependSocket} from '../core/graphsockets.js';
import {DataBlock, DataRef} from '../core/lib_api.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';

import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

import {CustomDataElem} from './customdata.js';
import {LayerTypes, ChunkedSimpleMesh, SimpleMesh} from "../core/simplemesh.js";

import {MeshError, MeshTypes, MeshFlags, RecalcFlags} from './mesh_base.js';
export * from "./mesh_base.js";
export * from "./mesh_types.js";
export * from "./mesh_customdata.js";
export * from "./mesh_element_list.js";

import {UVLayerElem, OrigIndexElem} from "./mesh_customdata.js";
import {Element, Vertex, Edge, Loop, LoopList, Face} from "./mesh_types.js";
import {SelectionSet, ElementList} from "./mesh_element_list.js";

let split_temp = new Array(512);
split_temp.used = 0;

let _quad = new Array(4);
let _tri = new Array(4);
let _cdtemp1 = new Array(1);
let _cdtemp2 = new Array(2);
let _cdwtemp1 = new Array(1);
let _cdwtemp2 = new Array(2);

export class Mesh extends SceneObjectData {
  constructor() {
    super();

    this.materials = [];

    this._ltris = undefined;
    this._ltrimap_start = {}; //maps face eid to first loop index
    this._ltrimap_len = {}; //maps face eid to first loop index

    this.updatelist = {};
    this.lastUpdateList = {};

    //used to signal rebuilds of viewport meshes,
    //current mesh data generation
    this.updateGen = 0;
    this.partialUpdateGen = 0;

    this.eidgen = new util.IDGen();
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
      this.elists[type].on_layeradd = this._on_cdlayer_add.bind(this);
      this.elists[type].on_layerremove = this._on_cdlayer_rem.bind(this);
    }
    
    return this.elists[type];
  }
  
  static nodedef() {return {
    name   : "mesh",
    uiname : "Mesh",
    flag   : NodeFlags.SAVE_PROXY,
    inputs : {}, //can inherit from parent class by wrapping in Node.inherit({})
    outputs : {}
  }}
    
  _element_init(e) {
    e.eid = this.eidgen.next();
    this.eidmap[e.eid] = e;
  }
  
  makeVertex(co) {
    var v = new Vertex(co);
    
    this._element_init(v);
    this.verts.push(v);
    
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
  
  makeEdge(v1, v2) {
    var e = new Edge();
    
    e.v1 = v1;
    e.v2 = v2;
    
    v1.edges.push(e);
    v2.edges.push(e);
    
    this._element_init(e);
    this.edges.push(e);
    
    return e;
  }
  
  minMax() {
    this.min = new Vector3();
    this.max = new Vector3();
    
    if (this.verts.length == 0) {
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

    for (let list of f.lists) {
      let list2 = new LoopList();
      list2.flag = list.flag;

      let l1 = list.l;
      let l2 = list2.l = this._makeLoop();
      let _i = 0;
      let startl = l2;

      do {
        let prevl2 = l2;

        if (l1 !== list.l) {
          l2 = this._makeLoop();
        }
        this.copyElemData(l2, l1);

        l2.list = list2;
        l2.v = new_vmap[l1.v.eid];

        if (l2.v === undefined) {
          throw new MeshError("copyFace's new_vmap parameter didn't have vertex " + l1.v.eid + " for loop " + l1.eid);
        }
        l2.f = f2;

        prevl2.next = l2;
        l2.prev = prevl2;

        if (_i++ > 10000) {
          console.warn("infinite loop detected");
          break;
        }

        l1 = l1.next;
      } while (l1 !== list.l);

      l2.next = startl;
      startl.prev = l2;

      for (let l of list2) {
        l.e = this.ensureEdge(l.v, l.next.v);
        l.f = f2;

        this._radialInsert(l.e, l);
      }

      f2.lists.push(list2);
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
    _tri[0] = v1;
    _tri[1] = v2;
    _tri[2] = v3;

    return this.makeFace(_tri);
  }

  makeFace(verts) {
    if (verts.length < 2) {
      throw new Error("need at least two verts");
    }
    
    let f = new Face();
    
    let firstl, prevl;
    
    let list = new LoopList();
    f.lists.push(list);
    
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

    for (let i=0; i<f.verts.length; i++) {
      let v1 = f.verts[i], v2 = f.verts[(i+1) % f.verts.length];
      
      this.edges.push(this.ensureEdge(v1, v2));
    }
    
    f.calcCent();
    f.calcNormal();
    
    this._element_init(f);
    this.faces.push(f);
    
    return f;
  }
  
  recalcNormals() {
    for (let f of this.faces) {
      f.calcNormal();
    }
    
    let i = 0;
    let vtots = new Array(this.verts.length);
    for (let v of this.verts) {
      v.index = i++;
      v.no.zero();
      vtots[v.index] = 0;
    }
    
    for (let f of this.faces) {
      for (let v of f.verts) {
        v.no.add(f.no);
        vtots[v.index]++;
      }
    }
    
    for (let v of this.verts) {
      if (vtots[v.index] > 0) {
        v.no.normalize();
      }
    }
  }
  
  killVertex(v) {
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
  }
  
  killFace(f) {
    if (f.eid == -1) {
      console.trace("Warning: edge", e.eid, "already freed", e);
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

  selectFlush(selmode) {
    if (selmode & MeshTypes.VERTEX) {
      this.edges.selectNone();

      var set_active = this.edges.active === undefined;
      set_active = set_active || !((this.edges.active.v1.flag|this.edges.active.v2.flag) & MeshFlags.SELECT);
      
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

  _splitEdgeNoFace(e, t=0.5) {
    let v1 = e.v1, v2 = e.v2;

    t = t === undefined ? 0.5 : t;
    
    var nv = this.makeVertex(e.v1).interp(e.v2, t);
    var ne = this.makeEdge(nv, e.v2);

    e.v2.edges.remove(e);

    e.v2 = nv;
    nv.edges.push(e);
    
    if (e.flag & MeshFlags.SELECT) {
      this.edges.setSelect(ne, true);
    }
    
    if ((e.v1 & MeshFlags.SELECT) && (e.v2 & MeshFlags.SELECT)) {
      this.verts.setSelect(nv, true);
    }

    _cdtemp1[0] = [e];
    _cdwtemp1[0] = 1.0;

    this.edges.customDataInterp(ne, _cdtemp1, _cdwtemp1);

    _cdtemp2[0] = v1;
    _cdtemp2[1] = v2;
    _cdwtemp2[0] = 1.0-t;
    _cdwtemp2[1] = t;

    this.verts.customDataInterp(nv, _cdtemp2, _cdwtemp2);

    return [ne, nv];
  }
  
  splitEdge(e, t=0.5) {
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

    for (let i=0; i<split_temp.used; i++) {
      let l = split_temp[i];

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
    //handle case of two-valence vert with no surrounding faces
    if (v.edges.length == 2 && v.edges[0].l === undefined && v.edges[1].l === undefined) {
      let v1 = v.edges[0].otherVertex(v);
      let v2 = v.edges[1].otherVertex(v);
      
      this.ensureEdge(v1, v2);
      return;
    }
    
    let faces = new util.set();
    
    if (v.edges.length == 0) {
      this.killVertex(v);
      return;
    }
    
    for (let f of v.faces) {
      faces.add(f);
    }
    
    let vset = new set();
    let verts = [];
    
    //scan in both directions
    for (let step=0; step<2; step++) {
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

  tessellate() {
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
  }

  genRender(gl) {
    try {
      return this._genRender(gl);
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

  _genRender(gl) {
    this.recalc &= ~RecalcFlags.RENDER;
    this.updateGen = ~~(Math.random()*1024*1024*1024);

    this.tessellate();
    let ltris = this._ltris;

    if (this.smesh !== undefined) {
      this.smesh.destroy(gl);
    }

    let sm = this.smesh = new ChunkedSimpleMesh(LayerTypes.LOC|LayerTypes.NORMAL|LayerTypes.UV);
    let wm = this.wmesh = new ChunkedSimpleMesh(LayerTypes.LOC|LayerTypes.NORMAL|LayerTypes.UV);

    let zero2 = [0, 0];
    let w = [1, 1, 1, 1];

    for (let e of this.edges) {
      let line;
      line = wm.line(e.eid, e.v1, e.v2); line.ids(e.eid, e.eid);
      //line = wm.line(i, l2.v, l3.v); line.ids(i, i);
      //line = wm.line(i, l3.v, l1.v); line.ids(i, i);
    }

    //triangle fan
    for (let i=0; i<ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];

      let tri = sm.tri(i, l1.v, l2.v, l3.v);
      tri.colors(w, w, w);

      if (l1.f.flag & MeshFlags.FLAT) {
        tri.normals(l1.f.no, l2.f.no, l3.f.no);
      } else {
        tri.normals(l1.v.no, l2.v.no, l3.v.no);
      }

      tri.ids(l1.f.eid, l1.f.eid, l1.f.eid);

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
        tri.uvs(l1.data[uvidx].uv, l2.data[uvidx].uv, l3.data[uvidx].uv);
      }
    }

    return sm;
  }
  
  rescale() {
    this.minMax();
    let min = this.min, max = this.max;
    
    for (let v of this.verts) {
      for (let i=0; i<3; i++) {
        v[i] = ((v[i] - min[i]) / (max[i] - min[i]) - 0.5) * 2.0;
      }
    }
  }

  flagElemUpdate(e) {
    if (!(e.eid in this.updatelist)) {
      this.updatelist[e.eid] = e;
    }
  }

  partialUpdate(gl) {
    console.warn("partial update");
    
    let sm = this.smesh;
    this.recalc &= ~RecalcFlags.PARTIAL;

    let w = [1, 1, 1, 1];

    let ltris = this._ltris;
    for (let eid in this.updatelist) {
      let e = this.updatelist[eid];
      if (e.type == MeshTypes.FACE) {
        let f = e;
        let li = this._ltrimap_start[f.eid];
        let len = this._ltrimap_len[f.eid];

        for (let i=0; i<len; i++) {
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
            tri.uvs(l1.data[uvidx].uv, l2.data[uvidx].uv, l3.data[uvidx].uv);
          }
        }

      }
    }

    this.partialUpdateGen = ~~(Math.random()*1024*1024*1024);

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
      this.genRender(gl);
      this.lastUpdateList = {};
      this.updatelist = {};
    }

    this.checkPartialUpdate(gl);
    if (program !== undefined) {
      this.wmesh.program = program;
      this.wmesh.island.program = program;

      program.bind(gl);
    }

    this.wmesh.draw(gl, uniforms);
  }

  draw(view3d, gl, uniforms, program, object) {
    if (this.recalc & RecalcFlags.TESSELATE) {
      this.tessellate();
    }

    if (this.recalc & RecalcFlags.RENDER) {
      this.recalc &= RecalcFlags.PARTIAL;
      this.genRender(gl);
      this.lastUpdateList = {};
      this.updatelist = {};
    }

    this.checkPartialUpdate(gl);

    if (program !== undefined) {
      this.smesh.program = program;
      this.smesh.island.program = program;

      program.bind(gl);
    }
    this.smesh.draw(gl, uniforms);
  }
  
  get elements() {
    var this2 = this;
    
    return (function*() {
      for (var k in this2.eidmap) {
        yield this2.eidmap[k];
      }
    })()
  }

  regenTesellation() {
    this.recalc |= RecalcFlags.TESSELATE;
  }
  regenRender() {
    this.recalc |= RecalcFlags.RENDER;
  }
  regenPartial() {
    this.recalc |= RecalcFlags.PARTIAL;
  }

  _getArrays() {
    let ret = [];
    for (let k in this.elists) {
      ret.push(this.elists[k]);
    }
    
    return ret;
  }

  copyElemData(dst, src) {
    if (dst.type != src.type) {
      throw new Error("mismatched between element types in Mesh.prototype.copyElemData()");
    }

    for (let i=0; i<dst.customData.length; i++) {
      dst.customData[i].load(src.customData[i]);
    }

    dst.flag = src.flag;

    switch (dst.type) {
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

  copy() {
    let ret = new Mesh();

    for (let elist of ret.getElemLists()) {
      if (this.elists[elist.type].customData === undefined) {
        continue;
      }

      elist.customData = this.elists[elist.type].customData.copy();
      elist.customData.on_layeradd = ret._on_cdlayer_add.bind(ret);
      elist.customData.on_layerremove = ret._on_cdlayer_rem.bind(ret);
    }

    ret.eidgen = this.eidgen.copy();
    let eidmap = ret.eidmap;

    for (let v of this.verts) {
      let v2 = ret.makeVertex(v);

      v2.no.load(v.no);

      v2.flag = v.flag;
      v2.index = v.index;
      v2.eid = v.eid;

      eidmap[v2.eid] = v2;
      ret.verts.push(v);
    }

    for (let e of this.edges) {
      let v1 = eidmap[e.v1.eid];
      let v2 = eidmap[e.v2.eid];

      let e2 = ret.makeEdge(v1, v2);

      e2.eid = e.eid;
      e2.flag = e.flag;
      e2.index = e.index;

      eidmap[e2.eid] = e2;
      ret.edges.push(e2);
    }

    for (let l of this.loops) {
      let l2 = new Loop();

      l2.flag = l.flag;
      l2.eid = l.eid;
      l2.index = l.index;

      l2.e = eidmap[l.e.eid];
      l2.v = eidmap[l.v.eid];

      l2.radial_next = l.radial_next;
      l2.radial_prev = l.radial_prev;
      l2.next = l.next;
      l2.prev = l.prev;

      l2.f = l.f.eid;

      eidmap[l2.eid] = l2;
      ret.loops.push(l2);
    }

    for (let e of this.edges) {
      let e2 = eidmap[e.eid];

      if (e.l !== undefined) {
        e2.l = eidmap[e.l.eid];
      }
    }

    for (let l2 of ret.loops) {
      l2.radial_next = eidmap[l2.radial_next.eid];
      l2.radial_prev = eidmap[l2.radial_prev.eid];
      l2.next = eidmap[l2.next.eid];
      l2.prev = eidmap[l2.prev.eid];
    }

    for (let f of this.faces) {
      let f2 = new Face();

      f2.lists = [];

      f2.eid = f.eid;
      f2.index = f.index;
      f2.flag = f.flag;

      f2.cent.load(f.cent);
      f2.no.load(f.no);

      for (let list of f.lists) {
        let list2 = new LoopList();

        list2.flag = list.flag;
        list2.l = eidmap[list.l.eid];

        f2.lists.push(list2);
      }

      eidmap[f2.eid] = f2;
      ret.faces.push(f2);
    }

    for (let l2 of ret.loops) {
      l2.f = eidmap[l2.f];
    }

    return ret;
  }

  _on_cdlayer_add(layer, set) {
    let cls = CustomDataElem.getTypeClass(set.typeName);
    let mask = layer.elemTypeMask;
    let index = layer.index;
    
    for (let k in MeshTypes) {
      let flag = MeshTypes[k];
      //let elist = this.getElem
      if (mask & flag) {
        let elist = this.getElemList(flag);
        for (let e of elist) {
          e.customData.push(new cls());
        }
      }
    }
  }
  
  _on_cdlayer_rem(layer, set) {
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
  }

  validateMesh() {
    let fix = false;

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
      return fix;
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

    return fix;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.elists = {};
    
    for (let elist of this._elists) {
      this.elists[elist.type] = elist;
    }

    delete this._elists;

    this.verts = this.getElemList(MeshTypes.VERTEX);
    this.loops = this.getElemList(MeshTypes.LOOP);
    this.edges = this.getElemList(MeshTypes.EDGE);
    this.faces = this.getElemList(MeshTypes.FACE);
    
    for (let k in this.elists) {
      let elist = this.elists[k];
      
      elist.on_layeradd = this._on_cdlayer_add.bind(this);
      elist.on_layerremove = this._on_cdlayer_rem.bind(this);
    }

    this.regenRender();
    
    let eidmap = this.eidmap;
    
    for (let vert of this.verts) {
      eidmap[vert.eid] = vert;
    }
    
    for (let edge of this.edges) {
      eidmap[edge.eid] = edge;
      edge.v1 = eidmap[edge.v1];
      edge.v2 = eidmap[edge.v2];
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
      for (let i=0; i<v.edges.length; i++) {
        v.edges[i] = eidmap[v.edges[i]];
      }
    }

    for (let f of this.faces) {
      for (let list of f.lists) {
        for (let l of list) {
          l.list = list;
        }
      }
    }

    this.validateMesh();
  }

  dataLink(getblock, getblock_us) {
    for (let i=0; i<this.materials.length; i++) {
      this.materials[i] = getblock_us(this.materials[i]);
    }
  }

  static blockDefine() { return {
    typeName    : "mesh",
    defaultName : "Mesh",
    uiName      : "Mesh",
    flag        : 0,
    icon        : -1
  }}
};

Mesh.STRUCT = STRUCT.inherit(Mesh, SceneObjectData, "mesh.Mesh") + `
  _elists   : array(mesh.ElementList) | obj._getArrays();
  eidgen    : IDGen;
  flag      : int;
  materials : array(e, DataRef) | DataRef.fromBlock(e);
}
`;

nstructjs.manager.add_class(Mesh);
DataBlock.register(Mesh);
