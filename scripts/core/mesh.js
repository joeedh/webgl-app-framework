// var _mesh = undefined;


import * as simplemesh from './simplemesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {DependSocket} from './graphsockets.js';
import {DataBlock, DataRef} from './lib_api.js';

import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

import {CustomDataElem} from './customdata.js';

export const MeshTypes = {
  VERTEX : 1,
  EDGE   : 2,
  FACE   : 4,
  LOOP   : 8
};

export const MeshFlags = {
  SELECT     : 1,
  HIDE       : 2,
  FLAT       : 4,
  ITER_TEMP1 : 8 //temporary flag used by faces-around-edge iterators
};

export const RecalcFlags = {
  RENDER : 1
};

export class UVLayerElem extends CustomDataElem {
  constructor() {
    super();
    
    this.uv = new Vector2();
  }
  
  copyTo(b) {
    b.uv.load(this.uv);
  }
  
  copy() {
    let ret = new UVLayer();
    this.copyTo(ret);
    return ret;
  }
    
  interp(dest, ws, datas) {
    dest.uv.zero();
    
    if (datas.length == 0) {
      return;
    }
    
    for (let i=0; i<datas.length; i++) {
      dest.uv[0] += ws[i]*datas[i].uv[0];
      dest.uv[1] += ws[i]*datas[i].uv[1];
    }
  }
  
  validate() {
    return true;
  }
  
  static define() {return {
    elemTypeMask: MeshTypes.LOOP,
    typeName    : "uv",
    uiTypeName  : "UV",
    defaultName : "UV Layer",
    //elemSize : 3,
    flag     : 0
  }};

  static fromSTRUCT(reader) {
    let ret = new UVLayerElem();
    reader(ret);

    return ret;
  }
}
UVLayerElem.STRUCT = STRUCT.inherit(UVLayerElem, CustomDataElem, "mesh.UVLayerElem") + `
  uv : vec2;
`;

CustomDataElem.register(UVLayerElem);

export class Element {
  constructor(type) {
    this.type = type;
    this.flag = this.index = 0;
    this.eid = -1;
    this.customData = [];
  }
  
  valueOf() {
    return this.eid;
  }
  
  [Symbol.keystr]() {
    return this.eid;
  }
  
  toJSON() {
    return {
      type  : this.type,
      flag  : this.flag,
      index : this.index,
      eid   : this.eid
    };
  }
  
  loadJSON(obj) {
    this.type = obj.type;
    this.flag = obj.flag;
    this.index = obj.index;
    this.eid = obj.eid;
    
    return this;
  }
}

Element.STRUCT = `
mesh.Element {
  type        : int;
  flag        : int;
  index       : int;
  eid         : int;
  customData  : array(abstract(mesh.CustomDataElem));
}
`;

/*
class VertFaceIter {
}
let _vficache = new Array(256);
for (let i=0; i<_vficache.length; i++) {
  
}//*/

//has Vector3 mixin
export class Vertex extends Element {
  constructor(co) {
    super(MeshTypes.VERTEX);
    this.initVector3();
    
    if (co !== undefined) {
      this.load(co);
    }
    
    this.no = new Vector3();
    this.no[2] = 1.0;
    this.edges = [];
  }
  
  toJSON() {
    var edges = [];
    for (var e of this.edges) {
      edges.push(e.eid);
    }
    
    return util.merge(super.toJSON(), {
      0 : this[0],
      1 : this[1],
      2 : this[2],
      edges : edges,
      no : this.no
    });
  }

  otherEdge(e) {
    if (this.edges.length != 2) {
      throw new Error ("otherEdge only works on 2-valence vertices");
    }

    if (e === this.edges[0])
      return this.edges[1];
    else if (e === this.edges[1])
      return this.edges[0];
  }
  
  static fromSTRUCT(reader) {
    let ret = new Vertex();
    
    reader(ret);
    
    return ret;
  }
}
util.mixin(Vertex, Vector3);

Vertex.STRUCT = STRUCT.inherit(Vertex, Element, 'mesh.Vertex') + `
  co      : vec3 | obj;
  no      : vec3 | obj.no;
  edges   : array(e, int) | (e.eid);
}
`;
nstructjs.manager.add_class(Vertex);


var _evaluate_vs = util.cachering.fromConstructor(Vector3, 64);

export class Edge extends Element {
  constructor() {
    super(MeshTypes.EDGE);
    
    this.loop = undefined;
    this.v1 = this.v2 = undefined;
  }
  
  get loops() {
    let this2 = this;
    
    return (function*() {
      let l = this2.loop;
      let i = 0;
      
      do {
        if (i++ > 10000) {
          console.warn("infinite loop detected in Edge.prototype.[get loops]()");
          break;
        }
        
        yield l;
        
        l = l.radial_next;
      } while (l !== this2.loop);
    })();
  }
  
  /**
  be careful of this iterator, it sets ITER_TEMP1 in face flags,
  so it won't work with nested loops on the same element
  */
  get faces() {
    let this2 = this;
    
    return (function*() {
      let l = this2.loop;
      let i = 0;
      
      do {
        if (i++ > 10000) {
          console.warn("infinite loop detected in Edge.prototype.[get faces]()");
        }
        
        l.f.flag &= ~MeshFlags.ITER_TEMP1;
        l = l.radial_next;
      } while (l !== this2.loop);
      
      do {
        if (i++ > 10000) {
          console.warn("infinite loop detected in Edge.prototype.[get faces]()");
          break;
        }
        
        if (!(MeshFlags.ITER_TEMP1)) {
          yield l.f;
        }
        
        l.f.flag |= MeshFlags.ITER_TEMP1;
        
        l = l.radial_next;
      } while (l !== this2.loop);
    })();
  }
  
  evaluate(t) {
    return _evaluate_vs.next().load(this.v1).interp(this.v2, t);
  }
  
  derivative(t) {
    var df = 0.0001;
    var a = this.evaluate(t-df);
    var b = this.evaluate(t+df);
    
    return b.sub(a).mulScalar(0.5/df);
  }
  
  derivative2(t) {
    var df = 0.0001;
    var a = this.derivative(t-df);
    var b = this.derivative(t+df);
    
    return b.sub(a).mulScalar(0.5/df);
  }
  
  curvature(t) {
    let dv1 = this.derivative(t);
    let dv2 = this.derivative2(t);
    
    let ret = (dv1[0]*dv2[1] - dv1[1]*dv2[0]) / Math.pow(dv1.dot(dv1), 3.0/2.0);
     
    return ret;
  }
  
  has(v) {
    return v === this.v1 || v === this.v2;
  }
  
  otherVertex(v) {
    if (v === undefined)
      throw new Error("v cannot be undefined in Edge.prototype.otherVertex()");
    
    if (v === this.v1)
      return this.v2;
    if (v === this.v2)
      return this.v1;
    
    throw new Error("vertex " + v.eid + " not in edge");
  }
  static fromSTRUCT(reader) {
    let ret = new Edge();
    
    reader(ret);
    
    return ret;
  }
}
Edge.STRUCT = STRUCT.inherit(Edge, Element, 'mesh.Edge') + `
  v1     : int | obj.v1.eid;
  v2     : int | obj.v2.eid;
  faces  : array(f, int) | f.eid;
}
`;
nstructjs.manager.add_class(Edge);

let calc_normal_temps = util.cachering.fromConstructor(Vector3, 32);

export class Loop extends Element {
  constructor() {
    super(MeshTypes.LOOP);
    
    this.radial_next = this.radial_prev = undefined;
    
    this.e = undefined;
    this.f = undefined;
    this.v = undefined;
    this.list = undefined;
  }
  
  get uv() {
    for (let layer of this.customData) {
      if (layer instanceof UVLayerElem)
        return layer.uv;
    }
  }
  
  static fromSTRUCT(reader) {
    let ret = new Loop();
    reader(ret);
    return ret;
  }
}
Loop.STRUCT = STRUCT.inherit(Loop, Element, "mesh.Loop") + `
  v           : int | obj.v.eid;
  e           : int | obj.e.eid;
  f           : int | obj.f.eid;
  radial_next : int | obj.radial_next.eid;
  radial_prev : int | obj.radial_prev.eid;
  next        : int | obj.next.eid;
  prev        : int | obj.prev.ied;
}
`;
nstructjs.manager.add_class(Loop);

class LoopIter {
  constructor() {
    this.list = undefined;
    this.l = undefined;
    this.done = false;
    this.first = undefined;
    
    this.ret = {
      done  : true,
      value : undefined
    };
    
    this.onreturn = undefined;
  }
  
  init(list) {
    this.done = false;
    this.first = true;
    this.list = list;
    this.l = list.l;
    return this;
  }
  
  next() {
    let ret = this.ret;
    let l = this.l;
    
    if (l === this.list.l && !this.first) {
      ret.done = true;
      ret.value = undefined;
      
      this.list.iterstack.cur--;
      this.done = true;
      return ret;
    }
    
    this.first = false;
    this.l = l.next;
    
    ret.done = false;
    ret.value = l;
    
    return ret;
  }
  
  return() {
    console.log("iterator return");
    
    if (!this.done) {
      list.iterstack.cur--;
      this.done = true;
    }
  }
}

export class LoopList extends Array {
  constructor() {
    super();
    
    this.flag = 0;
    this.l = undefined;
    
    this.iterstack = new Array(4);
    for (let i=0; i<this.iterstack.length; i++) {
      this.iterstack[i] = new LoopIter();
    }
    
    this.iterstack.cur = 0;
  }
  
  [Symbol.iterator]() {
    let stack = this.iterstack;
    
    stack.cur++;

    if (stack.cur < 0 || stack.cur >= stack.length) {
      let cur =  stack.cur;
      stack.cur = 0;
      throw new Error("iteration depth was too deep: " + cur);
    }
    
    return stack[stack.cur].init(this);
  }
  
  static fromSTRUCT(reader) {
    let ret = new LoopList();
    
    reader(ret);
    
    for (let eid of ret._loops) {
      ret.push(eid);
    }
    
    delete ret._loops;
    
    return ret;
  }
  
  //used by STRUCT script
  get _loops() {
    return this;
  }
}

LoopList.STRUCT = `
mesh.LoopList {
  l : int | obj.l.eid;
}
`;

export class Face extends Element {
  constructor() {
    super(MeshTypes.FACE);
    
    this.lists = [];
    
    this.flag |= MeshFlags.FLAT;
    
    this.no = new Vector3();
    this.cent = new Vector3();
  }
  
  get verts() {
    let this2 = this;
    return (function*() {
      for (let loop of this2.loops) {
        yield loop.v;
      }
    })();
  }
  
  get loops() {
    return this.lists[0];
  }
  
  get edges() {
    let this2 = this;
    return (function*() {
      for (let loop of this.loops) {
        yield loop.e;
      }
    })();
  }
  
  get uvs() {
    let this2 = this;
    return (function*() {
      for (let loop of this.loops) {
        yield loop.uv;
      }
    })();
  }

  calcNormal() {
    let t1 = calc_normal_temps.next(), t2 = calc_normal_temps.next();
    let t3 = calc_normal_temps.next(), sum = calc_normal_temps.next();
    
    sum.zero();
    
    this.calcCent();
    let c = this.cent;
    
    let _i = 0;
    let l = this.lists[0].l;
    do {
      let v1 = l.v, v2 = l.next.v;
      
      t1.load(v1).sub(c);
      t2.load(v2).sub(c);
      
      t1.cross(t2).normalize();
      sum.add(t1);
      
      if (_i++ > 100000) {
        console.warn("infinite loop detected");
        break;
      }
      l = l.next;
    } while (l !== this.lists[0].l);
    
    sum.normalize();
    this.no.load(sum);
    return this.no;
  }
  
  calcCent() {
    this.cent.zero();
    let tot = 0.0;
    
    for (let l of this.lists[0]) {
      this.cent.add(l.v);
      tot++;
    }
    
    this.cent.mulScalar(1.0 / tot);
    return this.cent;
  }
  
  static fromSTRUCT(reader) {
    let ret = new Face();
    reader(ret);
    return ret;
  }
}
Face.STRUCT = STRUCT.inherit(Face, Element, "mesh.Face") + `
  lists : mesh.LoopList;
  cent  : vec3;
  no    : vec3;
}
`;
nstructjs.manager.add_class(Face);

export class SelectionSet extends util.set {
  constructor() {
    super();
  }
  
  get editable() {
    let this2 = this;
    
    return (function*() {
      for (let item of this2) {
        if (!(item.flag & MeshFlags.HIDE)) {
          yield item;
        }
      }
    })();
  }
}

export class ElementList extends Array {
  constructor(type) {
    super();
    
    this.type = type;
    this.selected = new SelectionSet();
    this.on_selected = undefined;
    this.highlight = this.active = undefined;
  }
  
  get editable() {
    let this2 = this;
    
    return (function*() {
      for (let e of this2) {
        if (!(e.flag & MeshFlags.HIDE)) {
          yield e;
        }
      }
    })();
  }
  
  toJSON() {
    var arr = [];
    for (var i=0; i<this.length; i++) {
      arr.push(this[i]);
    }
    
    var sel = [];
    for (var v of this.selected) {
      sel.push(v.eid);
    }
    
    return {
      type      : this.type,
      array     : arr,
      selected  : sel,
      active    : this.active !== undefined ? this.active.eid : -1,
      highlight : this.highlight !== undefined ? this.highlight.eid : -1
    };
  }
  
  loadJSON(obj) {
    this.length = 0;
    this.selected = new SelectionSet();
    this.active = this.highlight = undefined;
    this.type = obj.type;
    
    for (var e of obj.array) {
      var e2 = undefined;
      
      switch (e.type) {
        case MeshTypes.VERTEX:
          e2 = new Vertex();
          break;
        case MeshTypes.EDGE:
          e2 = new Edge();
          break;
        default:
          console.log(e);
          throw new Error("bad element " + e);
      }
      
      e2.loadJSON(e);
      super.push(e2);
      if (e2.flag & MeshFlags.SELECT) {
        this.selected.add(e2);
      }
      
      if (e2.eid == obj.active) {
        this.active = e2;
      } else if (e2.eid == obj.highlight) {
        this.highlight = e2;
      }
    }
  }
  
  push(v) {
    super.push(v);
    
    if (v.flag & MeshFlags.SELECT) {
      this.selected.add(v);
    }
    
    return this;
  }
  
  remove(v) {
    if (this.selected.has(v)) {
      this.selected.remove(v);
    }
    
    if (this.active === v)
      this.active = undefined;
    if (this.highlight === v)
      this.highlight = undefined;
    
    super.remove(v);
    
    return this;
  }
  
  selectNone() {
    for (var e of this) {
      this.setSelect(e, false);
    }
  }
  
  selectAll() {
    for (var e of this) {
      this.setSelect(e, true);
    }
  }
  
  setSelect(v, state) {
    if (state) {
      v.flag |= MeshFlags.SELECT;
      
      this.selected.add(v);
    } else {
      v.flag &= ~MeshFlags.SELECT;
      
      this.selected.remove(v, true);
    }
    
    return this;
  }
  
  static fromSTRUCT(reader) {
    let ret = new ElementList();
    reader(ret);
    
    let act = ret.active;
    ret.active = undefined;
    
    for (let item of ret.array) {
      ret.push(item)
      
      if (item.eid == act) {
        ret.active = item;
      }
    }
    
    return ret;
  }
};
ElementList.STRUCT = `
mesh.ElementList {
  items   : array(abstract(Element)) | obj;
  active  : int | obj.active !== undefined ? obj.active.eid : -1;
  type    : int;
}
`;
nstructjs.manager.add_class(ElementList);

export class Mesh extends DataBlock {
  constructor() {
    super();

    //used to signal rebuilds of viewport meshes,
    //current mesh data generation
    this.updateGen = 0;

    this.eidgen = new util.IDGen();
    this.eidmap = {};
    this.recalc = RecalcFlags.RENDER;
    this.smesh = undefined;
    this.program = undefined;
    this.uniforms = {
      uColor : [1, 1, 1, 1]
    };
    
    this.elists = {};
    
    this.verts = this.getElemList(MeshTypes.VERTEX);
    this.loops = this.getElemList(MeshTypes.LOOP);
    this.edges = this.getElemList(MeshTypes.EDGE);
    this.faces = this.getElemList(MeshTypes.FACE);
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
    flag   : 0,
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
    this.loops.remove(loop);
    delete this.eidmap[loop.eid];
    loop.eid = -1;
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
        l.e = this.ensureEdge(prevl.v, l.v);
        
        l.prev = prevl;
        prevl.next = l;
      }
      
      prevl = l;
    }
    
    list.l = firstl;
    firstl.prev = prevl;
    prevl.next = firstl;
    firstl.e = this.ensureEdge(prevl.v, firstl.v);
    
    for (let l of list) {
      if (l.e.l === undefined) {
        l.e.l = l;
      } else { //insert into ring list
        let l2 = l.e.l;
        
        l.radial_next = l2.radial_next;
        l2.radial_next.radial_prev = l;
        l.radial_prev = l2;
        l2.radial_next = l;
      }
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
    
    _i = 0;
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
    if (e.eid == -1) {
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
  
  selectFlush(selmode) {
    if (selmode & MeshTypes.VERTEX) {
      this.edges.selectNone();
      var set_active = this.edges.active === undefined;
      set_active = set_active || !((this.edges.active.v1.flag|this.edges.active.v2.flag) & MeshFlags.SELECT);
      
      for (var e of this.edges) {
        if ((e.v1.flag & MeshFlags.SELECT) && (e.v2.flag & MeshFlags.SELECT)) {
          this.edges.setSelect(e, true);
          
          if (set_active) {
            this.edges.active = e;
          }
        }
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
    }
  }
  
  _splitEdgeNoFace(e, t=0.5) {
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
      this.edges.setSelect(nv, true);
    }
    
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
      let l2 = this._makeLoop();
      
      l2.list = l.list;
      l2.f = l.f;
      
      if (l.v === v1) {
        l2.v = nv;
        l2.e = ne;
        
        ne.l = l2;
        
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
        l2.e = e1;
        
        this._radialInsert(e1, l2);
        
        l.next.prev = l2;
        l2.next = l.next;
        l2.prev = l;
        l.next = l2;
      }
      
      if (_i++ > 10000) {
        console.warn("Infinite loop detected!");
        break;
      }
      
      l = l.radial_next;
    } while (l !== e.l);
  }
  
  _radialInsert(e, l) {
    if (e.l === undefined) {
      e.l = l;
    } else {
      l.prev = e.l;
      l.next = e.l.next;
      e.l.next.prev = l;
      e.l.next = l;
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
    if (e.type == MeshTypes.VERTEX)
      this.verts.setSelect(e, state);
    else if (e.type == MeshTypes.EDGE)
      this.edges.setSelect(e, state);
    else
      console.log("bad element", e);
  }
  
  selectNone() {
    this.verts.selectNone();
    this.edges.selectNone();
  }
  
  selectAll() {
    this.verts.selectAll();
    this.edges.selectAll();
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
    let ltris = this.ltris = [];

    for (let f of this.faces) {
      let first = f.lists[0].l;
      let l = f.lists[0].l.next;
      let _i = 0;

      do {
        ltris.push(first);
        ltris.push(l);
        ltris.push(l.next);

        if (_i++ > 100000) {
          console.warn("infinite loop detected!");
          break;
        }

        l = l.next;
      } while (l.next !== f.lists[0].l)
    }
  }

  genRender(gl) {
    this.recalc &= ~RecalcFlags.RENDER;
    this.updateGen++;

    this.tessellate();
    let ltris = this.ltris;

    let sm = this.smesh = new simplemesh.SimpleMesh();

    let zero2 = [0, 0];
    let w = [1, 1, 1, 1];

    //triangle fan
    for (let i=0; i<ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];

      let tri = sm.tri(l1.v, l2.v, l3.v);
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
  
  rescale() {
    this.minMax();
    let min = this.min, max = this.max;
    
    for (let v of this.verts) {
      for (let i=0; i<3; i++) {
        v[i] = ((v[i] - min[i]) / (max[i] - min[i]) - 0.5) * 2.0;
      }
    }
  }
  
  draw(gl, uniforms, program) {
    if (this.recalc & RecalcFlags.RENDER) {
      console.log("gen render");
      this.genRender(gl);
    }
    
    if (program !== undefined) {
      this.smesh.program = program;
      this.smesh.island.program = program;
      program.bind(gl);
    }
    
    let uniforms2 = {};
    
    for (let k in this.uniforms) {
      uniforms2[k] = this.uniforms[k];
    }
    
    for (let k in uniforms) {
      uniforms2[k] = uniforms[k];
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
  
  regenRender() {
    this.recalc |= RecalcFlags.RENDER;
  }
  
  _getArrays() {
    let ret = [];
    for (let k in this.elists) {
      ret.push(this.elists[k]);
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
  
  static fromSTRUCT(reader) {
    let ret = new Mesh();
    reader(ret);

    ret.afterSTRUCT();
    ret.elists = {};
    
    for (let elist of ret._elists) {
      ret.elists[elist.type] = elist;
    }
    
    ret.verts = ret.getElemList(MeshTypes.VERTEX);
    ret.loops = ret.getElemList(MeshTypes.LOOP);
    ret.edges = ret.getElemList(MeshTypes.EDGE);
    ret.faces = ret.getElemList(MeshTypes.FACE);
    
    for (let k in ret.elists) {
      let elist = ret.elists[k];
      
      elist.on_layeradd = ret._on_cdlayer_add.bind(ret);
      elist.on_layerremove = ret._on_cdlayer_rem.bind(ret);
    }
    
    ret.regenRender();
    
    let eidmap = ret.eidmap;
    
    for (let vert of ret.verts) {
      eidmap[vert.eid] = vert;
    }
    
    for (let edge of ret.edges) {
      eidmap[edge.eid] = edge;
      edge.v1 = eidmap[edge.v1];
      edge.v2 = eidmap[edge.v2];
    }
    
    for (let l of ret.loops) {
      eidmap[l.eid] = l;
    }
    
    
    for (let face of ret.faces) {
      eidmap[face.eid] = face;
      
      for (let list of face.lists) {
        list.l = eidmap[list.l];
      }
    }
    
    for (let l of ret.loops) {
      l.radial_next = eidmap[l.radial_next];
      l.radial_prev = eidmap[l.radial_prev];
      
      l.next = eidmap[l.next];
      l.prev = eidmap[l.prev];
      
      l.f = eidmap[l.f];
      l.e = eidmap[l.e];
      l.v = eidmap[l.v];
    }
    
    for (let f of ret.faces) {
      for (let list of f.lists) {
        for (let l of list) {
          l.list = list;
        }
      }
    }
    
    for (let v of ret.verts) {
      for (let i=0; i<v.edges.length; i++) {
        v.edges[i] = eidmap[v.edges[i]];
      }
    }
    
    for (let e of ret.edges) {
      e.l = eidmap[e.l];
    }
    
    delete ret._elists;
    
    return ret;
  }
  
  static blockDefine() { return {
    typeName    : "mesh",
    defaultName : "Mesh",
    uiName      : "Mesh",
    flag        : 0,
    icon        : -1
  }}
};

Mesh.STRUCT = STRUCT.inherit(Mesh, DataBlock, "mesh.Mesh") + `
  _elists : array(mesh.ElementList) | obj._getArrays;
  eidgen    : IDGen;
}
`;

nstructjs.manager.add_class(Mesh);
DataBlock.register(Mesh);
