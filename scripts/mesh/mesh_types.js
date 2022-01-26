export const SEAL = true;

import {
  MeshError, MeshFlags, MeshTypes, HandleTypes,
  MAX_EDGE_FACES, MAX_FACE_VERTS, MAX_VERT_EDGES,
  ReusableIter, MeshIterFlags, STORE_DELAY_CACHE_INDEX, DEBUG_FREE_STACKS
} from "./mesh_base.js";
import {Vector3, Vector4, Quat, Matrix4} from "../util/vectormath.js";
import * as util from "../util/util.js";
import {UVLayerElem} from "./mesh_customdata.js";
import {nstructjs} from '../path.ux/pathux.js';
let STRUCT = nstructjs.STRUCT;

import {EDGE_LINKED_LISTS} from '../core/const.js';
export {EDGE_LINKED_LISTS} from '../core/const.js';

let quat_temps = util.cachering.fromConstructor(Quat, 512);
let mat_temps = util.cachering.fromConstructor(Matrix4, 256);
let vec3_temps = util.cachering.fromConstructor(Vector3, 1024);

let vertiters_l = new Array(1024);
window._vertiters_l = vertiters_l;

export class VertLoopIter {
  constructor(v) {
    this.v = v;
    this.ret = {done : true, value : undefined};
    this.l = undefined;
    this.i = 0;
    this.done = true;
    this.count = 0;
  }

  finish() {
    if (!this.done) {
      this.done = true;

      this.ret.value = undefined;
      this.ret.done = true;

      vertiters_l.cur--;
      vertiters_l.cur = Math.max(vertiters_l.cur, 0);

      this.v = undefined;
      this.l = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }

  reset(v, preserve_loop_mode=false) {
    this.v = v;
    this.preserve_loop_mode = preserve_loop_mode;
    this.done = false;
    this.l = undefined;
    this.i = 0;
    this.count = 0;
    this.ret.value = undefined;
    this.ret.done = false;

    let flag = MeshFlags.ITER_TEMP2a;

    //clear temp flag

    for (let i=0; i<v.edges.length; i++) {
      let e = v.edges[i];

      if (!e.l) {
        continue;
      }

      let l = e.l;
      let _i = 0;

      do {
        l.f.flag &= ~flag;

        l = l.radial_next;
      } while (l !== e.l && _i++ <10);
    }

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    this.count++;

    if (this.count > MAX_VERT_EDGES) {
      console.warn("infinite loop detected");
      return this.finish();
    }

    let ret = this.ret;
    ret.done = false;

    let v = this.v;

    while (this.i < v.edges.length && !v.edges[this.i].l) {
      this.l = undefined;
      this.i++;
    }

    if (this.i >= v.edges.length) {
      if (this.l && !(this.l.f & flag)) {
        ret.done = false;
        ret.value = this.l;

        this.l = undefined;

        return ret;
      }

      return this.finish();
    }

    let e = this.v.edges[this.i];

    if (this.l === undefined) {
      this.l = e.l;
    }

    let l = this.l;

    let skip = l.f.flag & MeshFlags.ITER_TEMP2a;
    l.f.flag |= MeshFlags.ITER_TEMP2a;

    if (this.l === e.l.radial_prev || this.l === this.l.radial_next) {
      this.i++;
      this.l = undefined;
    } else {
      this.l = this.l.radial_next;
    }

    if (skip) {
      return this.next();
    }

    if (!this.preserve_loop_mode && l.v !== this.v) {
      l = l.next.v === this.v ? l.next : l.prev;
    }

    ret.value = l;
    ret.done = false;

    return ret;
  }
}
for (let i=0; i<vertiters_l.length; i++) {
  vertiters_l[i] = new VertLoopIter();
}
vertiters_l.cur = 0;

let vnistack = new Array(512);
vnistack.cur = 0;

export class VertNeighborIterR extends ReusableIter {
  constructor() {
    super();
    this.v = undefined;
  }

  reset(v) {
    this.v = v;
    return this;
  }

  [Symbol.iterator]() {
    return vnistack[vnistack.cur++].reset(this.v);
  }
}

let vniring = util.cachering.fromConstructor(VertNeighborIterR, 512);

export class VertNeighborIter {
  constructor() {
    this.ret = {done : false, value : undefined};
    this.done = true;
    this.v = undefined;
    this.i = 0;
  }

  reset(v) {
    this.v = v;
    this.i = 0;
    this.done = false
    this.ret.done = false;

    return this;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      vnistack.cur--;
      this.v = undefined;
      this.ret.value = undefined;
      this.ret.done = true;
    }

    return this;
  }

  return() {
    this.finish();

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    let ret = this.ret;
    let v = this.v;

    if (this.i >= v.valence) {
      this.finish();
      return this.ret;
    }

    let e = v.edges[this.i];
    this.i++;

    ret.value = e.otherVertex(v);
    return ret;
  }
}

export class VertNeighborIterLinkedList {
  constructor() {
    this.ret = {done : false, value : undefined};
    this.done = true;
    this.e = undefined;
    this.v = undefined;
    this.i = 0;
  }

  reset(v) {
    this.v = v;
    this.i = 0;
    this.e = undefined;
    this.done = false
    this.ret.done = false;

    return this;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      vnistack.cur--;
      this.e = undefined;
      this.v = undefined;
      this.ret.value = undefined;
      this.ret.done = true;
    }

    return this;
  }

  return() {
    this.finish();

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    let ret = this.ret;
    let v = this.v;

    if (this.i > 0 && this.e === v.e) {
      this.finish();
      return this.ret;
    }

    let e = this.e;

    this.e = this.e.v1 === v ? this.e.v1next : this.e.v2next;
    this.i++;

    ret.value = e.otherVertex(v);
    return ret;
  }
}

for (let i=0; i<vnistack.length; i++) {
  vnistack[i] = EDGE_LINKED_LISTS ? new VertNeighborIterLinkedList() : new VertNeighborIter();
}

import {EmptyCDArray} from './mesh_base.js';

export class Element {
  constructor(type) {
    this._initElement(type);
  }

  _initElement(type) {
    if (STORE_DELAY_CACHE_INDEX) {
      this._didx = 0;
    }

    if (DEBUG_FREE_STACKS) {
      this._freeStack = "";
      this._allocStack = "";
    }

    this._old_eid = -1;
    this.type = type;
    this.flag = this.index = 0;
    this.eid = -1;
    this._eid = -1;
    this.customData = EmptyCDArray;
    //CD this.cd = this.customData;

    return this;
  }

  /*
  set eid(v) {
    if (isNaN(v)) {
      console.error("Got NaN eid", v);
    }

    this._eid = v;
  }

  get eid() {
    return this._eid;
  }*/

  static isElement(obj) {
    return obj instanceof Element || obj instanceof Vertex;
  }

  valueOf() {
    return this.eid;
  }

  [Symbol.keystr]() {
    return this.eid;
  }

  findLayer(typeName) {
    for (let data of this.customData) {
      if (data.typeName === typeName) {
        return data;
      }
    }
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
    this.eid = this._old_eid = obj.eid;

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    this._old_eid = this.eid;
    if (this.customData.length === 0) {
      this.customData = EmptyCDArray;
    }

    //CD this.cd = this.customData;
  }
}

Element.STRUCT = `
mesh.Element {
  type        : byte;
  flag        : int;
  eid         : int;
  customData  : array(abstract(mesh.CustomDataElem));
}
`;
nstructjs.register(Element);

let vertiters_f;

export class VertFaceIter {
  constructor(v) {
    this.v = v;
    this.ret = {done : true, value : undefined};
    this.l = undefined;
    this.i = 0;
    this.done = true;
    this.count = 0;
  }

  finish() {
    if (!this.done) {
      this.done = true;

      this.ret.value = undefined;
      this.ret.done = true;

      vertiters_f.cur--;
      vertiters_f.cur = Math.max(vertiters_f.cur, 0);

      this.v = undefined;
      this.l = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }

  reset(v) {
    this.v = v;
    this.done = false;
    this.l = undefined;
    this.i = 0;
    this.count = 0;
    this.ret.value = undefined;
    this.ret.done = false;

    let flag = MeshFlags.ITER_TEMP2a;

    //clear temp flag

    for (let i=0; i<v.edges.length; i++) {
      let e = v.edges[i];

      if (!e.l) {
        continue;
      }

      let l = e.l;
      let _i = 0;

      do {
        l.f.flag &= ~flag;

        l = l.radial_next;
      } while (l !== e.l && _i++ <10);
    }

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    this.count++;

    if (this.count > MAX_VERT_EDGES) {
      console.warn("infinite loop detected");
      return this.finish();
    }

    let ret = this.ret;
    ret.done = false;

    let v = this.v;

    while (this.i < v.edges.length && !v.edges[this.i].l) {
      this.l = undefined;
      this.i++;
    }

    if (this.i >= v.edges.length) {
      if (this.l && !(this.l.f & flag)) {
        ret.done = false;
        ret.value = this.l;

        this.l = undefined;

        return ret;
      }

      return this.finish();
    }

    let e = this.v.edges[this.i];

    if (this.l === undefined) {
      this.l = e.l;
    }

    let l = this.l;

    let skip = l.f.flag & MeshFlags.ITER_TEMP2a;
    l.f.flag |= MeshFlags.ITER_TEMP2a;

    if (this.l === e.l.radial_prev || this.l === this.l.radial_next) {
      this.i++;
      this.l = undefined;
    } else {
      this.l = this.l.radial_next;
    }

    if (skip) {
      return this.next();
    }

    ret.value = l.f;
    ret.done = false;

    return ret;
  }
}

export class VertFaceIterLinkedList {
  constructor(v) {
    this.v = v;
    this.ret = {done : true, value : undefined};
    this.l = undefined;
    this.i = 0;
    this.done = true;
    this.count = 0;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      this.ret.value = undefined;
      this.ret.done = true;

      vertiters_f.cur--;
      vertiters_f.cur = Math.max(vertiters_f.cur, 0);

      this.v = undefined;
      this.e = undefined;
      this.l = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }

  reset(v) {
    this.v = v;
    this.done = false;
    this.l = undefined;
    this.e = v.e;
    this.i = 0;
    this.count = 0;
    this.ret.value = undefined;
    this.ret.done = false;

    let flag = MeshFlags.ITER_TEMP2a;

    //clear temp flag

    for (let e of v.edges) {
      if (!e.l) {
        continue;
      }

      let l = e.l;
      let _i = 0;

      do {
        l.f.flag &= ~flag;

        l = l.radial_next;
      } while (l !== e.l && _i++ <10);
    }

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    this.count++;

    if (this.count > MAX_VERT_EDGES) {
      console.warn("infinite loop detected");
      return this.finish();
    }

    let ret = this.ret;
    ret.done = false;

    let v = this.v;

    if (!v.e) {
      ret.done = true;
      ret.value = undefined;

      return this.finish();
    }

    while (!this.e.l && this.e !== v.e) {
      this.l = undefined;
      this.e = this.e.v1 === v ? this.e.v1next : this.e.v2next;
    }

    if (this.e === v.e && this.i > 0) {
      if (this.l && !(this.l.f & flag)) {
        ret.done = false;
        ret.value = this.l;

        this.l = undefined;

        return ret;
      }

      return this.finish();
    }

    this.i++;

    let e = this.e;

    if (this.l === undefined) {
      this.l = e.l;
    }

    let l = this.l;

    let skip = l.f.flag & MeshFlags.ITER_TEMP2a;
    l.f.flag |= MeshFlags.ITER_TEMP2a;

    if (this.l === e.l.radial_prev || this.l === this.l.radial_next) {
      this.i++;
      this.l = undefined;
    } else {
      this.l = this.l.radial_next;
    }

    if (skip) {
      return this.next();
    }

    ret.value = l.f;
    ret.done = false;

    return ret;
  }
}

vertiters_f = new Array(256);
for (let i=0; i<vertiters_f.length; i++) {
  vertiters_f[i] = EDGE_LINKED_LISTS ? new VertFaceIterLinkedList() : new VertFaceIter();
}
vertiters_f.cur = 0;

let vedgeiters = new Array(512);

let IN_VERTEX_STRUCT = false;
export class VEdgeIter {
  constructor() {
    this.v = undefined;
    this.e = undefined;
    this.i = 0;
    this.ret = {done : false, value : undefined};
    this.done = false;
  }

  reset(v) {
    this.v = v;
    this.e = v.e;
    this.i = 0;
    this.ret.done = false;
    this.ret.value = undefined;
    this.done = false;

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    let ret = this.ret;

    let e = this.e;
    let v = this.v;

    if (e === v.e && this.i > 0) {
      return this.finish();
    }

    if (this.i > MAX_VERT_EDGES) {
      console.warn("Infinite loop detected!");
      return this.finish();
    }

    ret.value = e;
    ret.done = false;

    if (v === e.v1) {
      this.e = e.v1next;
    } else {
      this.e = e.v2next;
    }

    this.i++;

    return ret;
  }

  get length() {
    return undefined;
  }

  finish() {
    if (!this.done) {
      this.done = true;

      this.ret.value = undefined;
      this.ret.done = true;

      this.e = undefined;
      this.v = undefined;

      vedgeiters.cur--;
    }

    return this.ret;
  }

  return() {
    this.finish();

    return this.ret;
  }
}

for (let i=0; i<vedgeiters.length; i++) {
  vedgeiters[i] = new VEdgeIter();
}
vedgeiters.cur = 0;

class VertexReader {
  constructor() {
    this.v = undefined;
  }

  get no() {
    return this.v.no;
  }

  set no(no) {
    this.v.no = no;
  }

  set customData(f) {
    this.v.customData = f;
  }
  get customData() {
    return this.v.customData;
  }

  set flag(f) {
    this.v.flag = f;
  }
  set type(f) {
    this.v.type = f;
  }
  set index(f) {
    this.v.index = f;
  }
  set eid(f) {
    this.v.eid = f;
  }
  set 0(f) {
    this.v[0] = f;
  }
  set 1(f) {
    this.v[1] = f;
  }
  set 2(f) {
    this.v[2] = f;
  }
}

const vertexReader = new VertexReader();

//has Element mixin
export class Vertex extends Vector3 {
  constructor(co) {
    super();

    this._initElement(MeshTypes.VERTEX);
    //this.initVector3();

    if (co !== undefined) {
      this.load(co);
    }

    this.no = new Vector3();
    this.no[2] = 1.0;

    if (EDGE_LINKED_LISTS) {
      this.e = undefined;
    } else {
      this.edges = [];
    }

    if (SEAL) {
      Object.seal(this);
    }
  }

  _free() {
    if (EDGE_LINKED_LISTS) {
      this.e = undefined;
    } else {
      this.edges.length = 0;
    }
  }

  /*try to avoid using this,
   it duplicates lots of work
   compared to other methods
   */
  calcNormal(doFaces=true) {
    if (doFaces) {
      for (let f of this.faces) {
        f.calcNormal();
      }
    }

    let tot = 0.0;
    this.no.zero();

    for (let e of this.edges) {
      for (let l of e.loops) {
        this.no.addFac(l.f.no, l.f.area);
        tot += l.f.area;
      }
    }

    if (tot) {
      this.no.mulScalar(1.0 / tot).normalize();
    } else {
      this.no[2] = 1.0; //just have normal point upwards
    }

    return this;
  }

  /*to avoid messing up v8's optimizer
    we have to inherit from Vector3 (and thus Array),
    not Element.  However util.mixin won't pull in valueOf and [Symbol.keystr]
    from Element because they exist in Vector3.
  */
  valueOf() {
    return this.eid;
  }

  /*
  get edges() {
    if (EDGE_LINKED_LISTS && !IN_VERTEX_STRUCT) {
      return vedgeiters[vedgeiters.cur++].reset(this);
    } else {
      return this._edges;
    }
  }

  set edges(val) {
    if (!EDGE_LINKED_LISTS || IN_VERTEX_STRUCT) {
      this._edges = val;
    } else {
      throw new Error("cannot set .edges");
    }
  }//*/

  [Symbol.keystr]() {
    return this.eid;
  }

  get neighbors() {
    return vniring.next().reset(this);
    //return vnistack[vnistack.cur++].reset(this);
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

  get loops() {
    return vertiters_l[vertiters_l.cur++].reset(this, true);
  }

  get faces() {
    //return this.faces2;
    let i = vertiters_f.cur;
    let stack = vertiters_f;

    for (let j=0; j<stack.length; j++) {
      let i2 = (i + j) % stack.length;

      if (stack[i2].done) {
        stack.cur++;
        return stack[i2].reset(this);
      }
    }

    stack.cur++;
    stack.push(new VertFaceIter(this));

    return stack[stack.length-1].reset(this);
  }

  get faces2() {
    let this2 = this;

    return (function*() {
      let flag = MeshFlags.ITER_TEMP2a;

      for (let state=0; state<4; state++) {
        for (let e of this2.edges) {
          let l = e.l;

          if (l === undefined)
            continue;

          //do dumb trickery to avoid returning the same face twice

          let _i = 0;

          do {
            if (_i++ > MAX_EDGE_FACES) {
              console.warn("infinite loop detected");
              break;
            }

            switch (state) {
              case 0:
                if (l.f.flag & flag) {
                  flag = flag << 1;
                }
                break;
              case 1:
                l.f.flag = l.f.flag & ~flag;
                break;
              case 2:
                if (!(l.f.flag & flag)) {
                  l.f.flag |= flag;
                  yield l.f;
                }
                break;
              case 3:
                l.f.flag &= ~flag;
                break;
            }

            l = l.radial_next;
          } while (l !== e.l);
        }

        if (state === 0 && flag > MeshFlags.ITER_TEMP2c) {
          //*sigh* just used the first one
          flag = MeshFlags.ITER_TEMP2a;
        }
      }
    })();
  }

  isBoundary(includeWire=false) {
    for (let e of this.edges) {
      if (!e.l) {
        if (includeWire) {
          return true;
        }

        continue;
      }

      if (e.l.radial_next === e.l) {
        return true;
      }
    }

    return false;
  }

  get valence() {
    if (!EDGE_LINKED_LISTS) {
      return this.edges.length;
    } else {
      let count = 0;

      for (let e of this.edges) {
        count++;
      }

      return count;
    }
  }

  otherEdge(e) {
    if (this.valence !== 2) {
      throw new MeshError("otherEdge only works on 2-valence vertices");
    }

    if (EDGE_LINKED_LISTS) {
      if (e === this.e) {
        return this === e.v1 ? e.v1next : e.v1prev;
      } else {
        return this.e;
      }
    } else {
      if (e === this.edges[0])
        return this.edges[1];
      else if (e === this.edges[1])
        return this.edges[0];
    }
  }

  loadSTRUCT(reader) {
    IN_VERTEX_STRUCT = true;
    vertexReader.v = this;
    reader(vertexReader);
    vertexReader.v = undefined;
    IN_VERTEX_STRUCT = false;

    //we mixed in Element instead of inheriting from it
    Element.prototype.loadSTRUCT.call(this, reader);
  }
}
util.mixin(Vertex, Element);

Vertex.STRUCT = STRUCT.inherit(Vertex, Element, 'mesh.Vertex') + `
  0       : float;
  1       : float;
  2       : float;
  no      : vec3 | obj.no;
}
`;
/*
save space by deriving these on file load:
  edges   : array(e, int) | (e.eid);
*/

nstructjs.register(Vertex);

export class Handle extends Element {
  constructor(co) {
    super(MeshTypes.HANDLE);
    this.initVector3();

    if (co !== undefined) {
      this.load(co);
    }

    this.owner = undefined;
    this.mode = HandleTypes.AUTO;
    this.roll = 0;

    if (SEAL) {
      Object.seal(this);
    }
  }

  get visible() {
    let hide = this.flag & MeshFlags.HIDE;

    hide = hide || this.mode === HandleTypes.AUTO;
    hide = hide || this.mode === HandleTypes.STRAIGHT;

    return !hide;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}
util.mixin(Handle, Vector3);

Handle.STRUCT = STRUCT.inherit(Handle, Element, "mesh.Handle") + `
  0        : float;
  1        : float;
  2        : float; 
  mode     : byte;
  owner    : int | obj.owner !== undefined ? obj.owner.eid : -1;
  roll     : float;
}
`;

nstructjs.register(Handle);

var _evaluate_tmp_vs = util.cachering.fromConstructor(Vector3, 512);
var _evaluate_vs = util.cachering.fromConstructor(Vector3, 512);
var _arc_evaluate_vs = util.cachering.fromConstructor(Vector3, 512);

let PS=0, PNUM=2, PTOT=3;

/* arc length derivatives
on factor;
off period;

x := -(x1*t**3-3*x1*t**2+3*x1*t-x1-3*x2*t**3+6*x2*t**2-3*x2*t+3*
                  x3*t**3-3*x3*t**2-x4*t**3);
y := -(y1*t**3-3*y1*t**2+3*y1*t-y1-3*y2*t**3+6*y2*t**2-3*y2*t+3*
                  y3*t**3-3*y3*t**2-y4*t**3);
z := -(z1*t**3-3*z1*t**2+3*z1*t-z1-3*z2*t**3+6*z2*t**2-3*z2*t+3*
                  z3*t**3-3*z3*t**2-z4*t**3);

dx := df(x, t);
dy := df(y, t);
dz := df(z, t);

ds := sqrt(dx*dx + dy*dy + dz*dz);
ds2 := df(ds, t);

dstep := ds*dt + 0.5*df(ds, t)*dt**2;
on fort;

ds;
ds2;
dstep;

off fort;

*/
class ArcLengthCache {
  constructor(size=512, e) {
    this.size = size;
    this.e = e;
    this.length = 0;
    this.table = new Array(size);
    this.regen = 1;
  }

  _calcS(t, steps=512) {
    let dt = t / steps;
    let e = this.e;

    let x1 = e.v1[0], x2 = e.h1[0], x3 = e.h2[0], x4 = e.v2[0];
    let y1 = e.v1[1], y2 = e.h1[1], y3 = e.h2[1], y4 = e.v2[1];
    let z1 = e.v1[2], z2 = e.h1[2], z3 = e.h2[2], z4 = e.v2[2];
    let sqrt = Math.sqrt;

    let sum = 0.0;
    t = 0.0;

    for (let i=0; i<steps; i++, t += dt) {
      let ds = 3*sqrt((2*(2*x2-x3-x1)*t+x1-x2+(3*x3-x4-3*x2+x1)*t**2)**2+(
        2*(2*y2-y3-y1)*t+y1-y2+(3*y3-y4-3*y2+y1)*t**2)**2+(2*(2*z2-z3-
        z1)*t+z1-z2+(3*z3-z4-3*z2+z1)*t**2)**2);

      let ds2 =(6*((2*(2*y2-y3-y1)*t+y1-y2+(3*y3-y4-3*y2+y1)*t**2)*((3*y3-
        y4-3*y2+y1)*t+2*y2-y3-y1)+(2*(2*z2-z3-z1)*t+z1-z2+(3*z3-z4-3*
        z2+z1)*t**2)*((3*z3-z4-3*z2+z1)*t+2*z2-z3-z1)+(2*(2*x2-x3-x1)*
        t+x1-x2+(3*x3-x4-3*x2+x1)*t**2)*((3*x3-x4-3*x2+x1)*t+2*x2-x3-
        x1)))/sqrt((2*(2*x2-x3-x1)*t+x1-x2+(3*x3-x4-3*x2+x1)*t**2)**2+
        (2*(2*y2-y3-y1)*t+y1-y2+(3*y3-y4-3*y2+y1)*t**2)**2+(2*(2*z2-z3
          -z1)*t+z1-z2+(3*z3-z4-3*z2+z1)*t**2)**2);

      sum += ds*dt + 0.5*ds2*dt*dt;
    }

    return sum;
  }

  update() {
    this.regen = 0;

    let e = this.e;
    e._length = this.length = this._calcS(1.0);

    let steps = this.size*4;
    let t = 0.0, dt = 1.0 / steps;

    let x1 = e.v1[0], x2 = e.h1[0], x3 = e.h2[0], x4 = e.v2[0];
    let y1 = e.v1[1], y2 = e.h1[1], y3 = e.h2[1], y4 = e.v2[1];
    let z1 = e.v1[2], z2 = e.h1[2], z3 = e.h2[2], z4 = e.v2[2];
    let length = 0.0;
    let sqrt = Math.sqrt;
    let table = this.table;

    table.length = PTOT*this.size;

    for (let i=0; i<table.length; i++) {
      table[i] = 0.0;
    }

    let real_length = 0;

    for (let i=0; i<steps; i++, t += dt) {
      let ds = 3*sqrt((2*(2*x2-x3-x1)*t+x1-x2+(3*x3-x4-3*x2+x1)*t**2)**2+(
        2*(2*y2-y3-y1)*t+y1-y2+(3*y3-y4-3*y2+y1)*t**2)**2+(2*(2*z2-z3-
        z1)*t+z1-z2+(3*z3-z4-3*z2+z1)*t**2)**2);

      let ds2 =(6*((2*(2*y2-y3-y1)*t+y1-y2+(3*y3-y4-3*y2+y1)*t**2)*((3*y3-
        y4-3*y2+y1)*t+2*y2-y3-y1)+(2*(2*z2-z3-z1)*t+z1-z2+(3*z3-z4-3*
        z2+z1)*t**2)*((3*z3-z4-3*z2+z1)*t+2*z2-z3-z1)+(2*(2*x2-x3-x1)*
        t+x1-x2+(3*x3-x4-3*x2+x1)*t**2)*((3*x3-x4-3*x2+x1)*t+2*x2-x3-
        x1)))/sqrt((2*(2*x2-x3-x1)*t+x1-x2+(3*x3-x4-3*x2+x1)*t**2)**2+
        (2*(2*y2-y3-y1)*t+y1-y2+(3*y3-y4-3*y2+y1)*t**2)**2+(2*(2*z2-z3
          -z1)*t+z1-z2+(3*z3-z4-3*z2+z1)*t**2)**2);

      let df = dt;

      let ti = Math.floor((length / this.length) * (this.size) * 0.9999);
      ti = Math.min(Math.max(ti, 0), this.size-1)*PTOT;

      table[ti+PS] += t;
      table[ti+PNUM]++;

      if (i !== steps-1) {
        length += ds*dt + 0.5*ds2*dt*dt;
      }
    }

    for (let ti=0; ti<table.length; ti += PTOT) {
      if (table[ti+PNUM] == 0.0) {
        table[ti] = ti / steps / PTOT;
        table[ti+1] = table[ti+2] = 0.0;
      } else {
        table[ti] /= table[ti+PNUM];
      }
    }

    return this;
  }

  arcConvert(s) {
    if (this.e.length === 0) {
      return 0.0;
    }

    if (this.regen || this.length === 0.0) {
      this.update();
    }

    let ti = (this.size-1)*s/this.e.length*0.99999;
    ti = Math.min(Math.max(ti, 0.0), this.size-1);

    let u = Math.fract(ti);
    ti = Math.floor(ti)*PTOT;
    let t;

    if (ti < 0) {
      return 0.0;
    } else if (ti/PTOT >= this.size-1) {
      return 1.0;
    } else {
      let dt = 50;
      let t1 = this.table[ti];
      let t2 = this.table[ti+PTOT];

      return t1 + (t2 - t1) * u;
    }
  }

  evaluate(s) {
    let t = this.arcConvert(s);

    //avoid flipping twice, we already flipped in Edge.arcEvaluate
    if (this.e.flag & MeshFlags.CURVE_FLIP) {
      t = 1.0 - t;
    }

    return this.e.evaluate(t);
  }
}

let eliter_stack = new Array(1024);
eliter_stack.cur = 0;

class EdgeLoopIter {
  constructor() {
    this.ret = {done : true, value : undefined};
    this.done = true;
    this.e = undefined;
    this.l = undefined;
    this.i = 0;
  }

  reset(e) {
    this.i = 0;
    this.done = false;
    this.ret.done = false;

    this.e = e;
    this.l = e.l;

    return this;
  }

  finish() {
    if (!this.done) {
      this.ret.done = true;
      this.ret.value = undefined;

      this.e = undefined;
      this.l = undefined;

      this.done = true;
      eliter_stack.cur--;
    }

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    if (!this.l) {
      return this.finish();
    }

    this.i++;

    if (this.i >= MAX_EDGE_FACES) {
      console.warn("infinite loop error in radial list");
      return this.finish();
    }

    let l = this.l;

    this.l = this.l.radial_next;
    if (this.l === this.e.l) {
      this.l = undefined; //terminate iterator at next run
    }

    this.ret.value = l;
    this.ret.done = false;

    return this.ret;
  }

  return() {
    return this.finish();
  }
}

for (let i=0; i<eliter_stack.length; i++) {
  eliter_stack[i] = new EdgeLoopIter();
}

let eviter_stack = new Array(4192);
eviter_stack.cur = 0;

class EdgeVertIter {
  constructor() {
    this.e = undefined;
    this.i = 0;
    this.ret = {done : false, value : undefined};
    this.done = true;
  }

  reset(e) {
    this.e = e;
    this.i = 0;
    this.done = false;
    this.ret.done = false;
    eviter_stack.cur--;

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    if (this.i === 2) {
      return this.finish();
    }

    let v;
    v = this.i ? this.e.v2 : this.e.v1;

    this.i++;

    let ret = this.ret;
    ret.value = v;

    return ret;
  }

  finish() {
    if (!this.done) {
      this.ret.value = undefined;
      this.ret.done = true;
      this.done = true;
      this.e = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }
}
for (let i=0; i<eviter_stack.length; i++) {
  eviter_stack[i] = new EdgeVertIter();
}

let efiter_stack = new Array(2048);
efiter_stack.cur = 0;
let efiter_ring;

export class EdgeFaceIterR extends ReusableIter {
  constructor() {
    super();
    this.e = undefined;
  }

  reset(e) {
    this.e = e;
    return this;
  }

  [Symbol.iterator]() {
    return efiter_stack[efiter_stack.cur++].reset(this.e);
  }
}

efiter_ring = util.cachering.fromConstructor(EdgeFaceIterR, 4196);

//flag in MeshIterFlags to use, is like a stack
let efiter_flag = 0;

window._get_efiter_flag = () => efiter_flag;

export class EdgeFaceIter {
  constructor() {
    this.e = undefined;
    this.l = undefined;
    this.done = true;
    this.i = 0;
    this.ret = {done : true, value : undefined};
  }

  reset(e) {
    this.e = e;
    this.l = e.l;
    this.i = 0;
    this.done = false;

    if (!e.l) {
      return this;
    }

    this.ret.done = false;
    this.ret.value = undefined;

    let flag = this.flag = efiter_flag;

    let l = e.l;
    let _i = 0;

    do {
      if (_i++ > MAX_EDGE_FACES) {
        console.warn("infinite loop error");
        break;
      }

      l.f.flag &= ~flag;
      l = l.radial_next;
    } while (l !== e.l);

    //XXX overflow possibility
    efiter_flag = Math.min(efiter_flag+1, MeshIterFlags.EDGE_FACES_TOT);

    return this;
  }

  next() {
    if (!this.l) {
      return this.finish();
    }

    let flag = this.flag;
    let l = this.l;
    let e = this.e;

    while ((l.f.flag & flag) && this.i < MAX_EDGE_FACES && l !== e.l) {
      l = l.radial_next;

      if (l === e.l) {
        return this.finish();
      }
      this.i++;
    }

    if (l.f.flag & flag) {
      return this.finish();
    }

    l.f.flag |= flag;

    this.ret.value = l.f;
    this.l = l.radial_next;

    if (this.l === this.e.l) {
      this.l = undefined; //stop iterator
    }

    if (this.i++ > MAX_EDGE_FACES) {
      console.warn("Infinite loop error in radial list", this.e, this.l);
      this.l = undefined;

      return this.finish();
    }

    return this.ret;
  }

  finish() {
    if (!this.done) {
      this.done = true;

      efiter_stack.cur = Math.max(efiter_stack.cur-1, 0);
      efiter_flag = Math.max(efiter_flag-1, 0);

      this.ret.done = true;
      this.ret.value = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }
}
for (let i=0; i<efiter_stack.length; i++) {
  efiter_stack[i] = new EdgeFaceIter();
}

export class Edge extends Element {
  constructor() {
    super(MeshTypes.EDGE);

    this._arcCache = undefined;
    this._length = undefined;

    this.l = undefined;

    this.v1 = this.v2 = undefined;
    this.h1 = this.h2 = undefined;

    this.length = 0.0;

    if (EDGE_LINKED_LISTS) {
      this.v1next = this.v1prev = undefined;
      this.v2next = this.v2prev = undefined;
    }

    if (SEAL) {
      Object.seal(this);
    }
  }

  _free() {
    this.l = undefined;

    this.v1 = undefined;
    this.v2 = undefined;

    this.h1 = undefined;
    this.h2 = undefined;

    if (EDGE_LINKED_LISTS) {
      this.v1next = this.v1prev = undefined;
      this.v2next = this.v2prev = undefined;
    }
  }

  get verts() {
    return eviter_stack[eviter_stack.cur++].reset(this);
  }

  get loopCount() {
    if (!this.l) {
      return 0;
    }

    let l = this.l;
    let count = 0;

    do {
      if (count > MAX_EDGE_FACES) {
        console.warn("Infinite loop error");
        break;
      }

      l = l.radial_next;
      count++;
    } while (l !== this.l);

    return count;
  }

  get faceCount() {
    if (!this.l) {
      return 0;
    }

    let flag = MeshFlags.ITER_TEMP3;

    let l = this.l;
    let _i = 0;

    do {
      if (_i++ > MAX_EDGE_FACES) {
        console.warn("Infinite loop error");
        break;
      }

      l.f.flag &= ~flag;
      l = l.radial_next;
    } while (l !== this.l);

    l = this.l;
    _i = 0;

    let count = 0;

    do {
      if (_i++ > MAX_EDGE_FACES) {
        console.warn("Infinite loop error");
        break;
      }

      if (!(l.f.flag & flag)) {
        count++;
        l.f.flag |= flag;
      }

      l = l.radial_next;
    } while (l !== this.l);

    return count;
  }

  loopForFace(face) {
    if (!this.l) {
      return undefined;
    }

    let l = this.l;
    let _i = 0;
    do {
      if (l.f === face) {
        return l;
      }

      if (_i++ > MAX_EDGE_FACES) {
        console.warn("Infinite loop error");
        break;
      }
      l = l.radial_next;
    } while (l !== this.l);

    return undefined;
  }

  /*
  set flag(v) {
    //if (!v) {
    //  console.error("flag set");
    //}

    this._flag = v;
  }

  get flag() {
    return this._flag;
  }//*/

  get arcCache() {
    if (!this._arcCache) {
      this._arcCache = new ArcLengthCache(undefined, this);
      this._arcCache.update();
    }

    return this._arcCache;
  }

  set arcCache(val) {
    this._arcCache = val;
  }

  calcScreenLength(view3d) {
    let steps = 32;
    let s=0, ds = 1.0 / (steps-1);
    let lastco = undefined;
    let sum = 0.0;

    let camera = view3d.camera;

    for (let i=0; i<steps; i++, s += ds) {
      let co = this.evaluate(s);
      view3d.project(co);

      if (i > 0) {
        sum += lastco.vectorDistance(co);
      }

      lastco = co;
    }

    this.length = sum;
    return sum;
  }

  update(force=true) {
    if (force) {
      this.updateHandles();
      this.updateLength();
    }

    this.flag |= MeshFlags.UPDATE;
  }

  updateLength() {
    if (this._arcCache !== undefined) {
      this._arcCache.update();
      this.length = this._arcCache._calcS(1.0);
    } else {
      this.length = this.v1.vectorDistance(this.v2);
    }

    return this.length;
  }

  commonVertex(e) {
    if (e.v1 === this.v1 || e.v1 === this.v2)
      return e.v1;

    if (e.v2 === this.v1 || e.v2 === this.v2)
      return e.v2;
  }

  vertex(h) {
    if (h === this.h1) {
      return this.v1;
    } else if (h === this.h2) {
      return this.v2;
    } else {
      throw new Error("invalid handle" + h);
    }
  }

  handle(v) {
    if (v === this.v1) {
      return this.h1;
    } else if (v === this.v2) {
      return this.h2;
    } else {
      throw new Error("invalid vertex" + v);
    }
  }

  otherHandle(v_or_h) {
    let h = v_or_h instanceof Vertex ? this.handle(v_or_h) : v_or_h;
    if (h === this.h1) {
      return this.h2;
    } else if (h === this.h2) {
      return this.h1;
    } else {
      throw new Error("invalid handle " + h);
    }
  }

  updateHandles() {
    if (this.h1 === undefined) {
      return;
    }

    let dohandle = (h) => {
      let v = this.vertex(h);
      //v = this.otherVertex(v);

      if (h.mode === HandleTypes.AUTO && v.valence === 2) {
        let e2 = v.otherEdge(this);
        let v2 = e2.otherVertex(v);

        h.load(this.otherVertex(v)).sub(v2).mulScalar(1.0/4.0);
        h.add(v);

      } else if (h.mode === HandleTypes.STRAIGHT) {
        h.load(v).interp(this.otherVertex(v), 1.0/3.0);
      }
    };

    dohandle(this.h1);
    dohandle(this.h2);
  }

  arcEvaluate(s) {
    if (this.flag & MeshFlags.CURVE_FLIP) {
      s = this.length - s;
    }

    if (this.h1) {
      if (!this.arcCache) {
        this.arcCache = new ArcLengthCache(undefined, this);
        this.arcCache.update();
      }

      return this.arcCache.evaluate(s);
    } else {
      let p = _evaluate_vs.next().load(this.v1);

      return p.interp(this.v2, s / this.length);
    }
  }

  arcDerivative(s) {
    let df = 0.001;

    if (s < 1.0-df && s > df) {
      let a = this.arcEvaluate(s-df);
      let b = this.arcEvaluate(s+df);
      return a.sub(b).mulScalar(0.5 / df);
    } else if (s < 1.0-df) {
      let a = this.arcEvaluate(s);
      let b = this.arcEvaluate(s+df);
      return a.sub(b).mulScalar(1.0 / df);
    } else {
      let a = this.arcEvaluate(s-df);
      let b = this.arcEvaluate(s);
      return a.sub(b).mulScalar(1.0 / df);
    }
  }

  arcDerivative2(s) {
    let df = 0.001;

    if (s < 1.0-df && s > df) {
      let a = this.arcDerivative(s-df);
      let b = this.arcDerivative(s+df);
      return a.sub(b).mulScalar(0.5 / df);
    } else if (s < 1.0-df) {
      let a = this.arcDerivative(s);
      let b = this.arcDerivative(s+df);
      return a.sub(b).mulScalar(1.0 / df);
    } else {
      let a = this.arcDerivative(s-df);
      let b = this.arcDerivative(s);
      return a.sub(b).mulScalar(1.0 / df);
    }
  }

  twist(t) {
    if (this.flag & MeshFlags.CURVE_FLIP) {
      t = 1.0 - t;
    }

    let k1 = this.v1.findLayer("knot");
    let k2 = this.v2.findLayer("knot");

    if (k1) {
      let t1 = k1.tilt;
      let t2 = k2.tilt;
      return t1 + (t2 - t1)*t;
    } else {
      return 0.0;
    }
  }

  arcTwist(s) {
    return this.twist(s / this.length);
  }

  arcNormal(s) {
    //return this.arcDerivative2(s).normalize();

    let flag = this.flag;
    function getUp(dv) {
      dv.normalize();
      let x = Math.abs(dv[0]), y = Math.abs(dv[1]), z = Math.abs(dv[2]);
      let axis;

      if (x < y && x < z)
        axis = 0;
      else if (y < x && y < z)
        axis = 1;
      else
        axis = 2;

      let up = _evaluate_tmp_vs.next().zero();
      up[axis] = 1.0;

      //if (flag & MeshFlags.CURVE_FLIP) {
      //  up.negate();
      //}
      return up;
    }

    let t = flag & MeshFlags.CURVE_FLIP ? 1.0 : 0.0;

    let up1 = getUp(this.derivative(0));
    let up2 = getUp(this.derivative(1));
    let up = up1.interp(up2, s / this.length).normalize();

    let dv = this.arcDerivative(s);
    let nor = vec3_temps.next().load(dv);

    nor.cross(up).normalize();

    let twist = this.arcTwist(s);
    if (twist !== 0.0) {
      let q = quat_temps.next();
      let mat = mat_temps.next();

      mat.makeIdentity();

      q.axisAngleToQuat(dv, twist);

      q.toMatrix(mat);

      nor.multVecMatrix(mat);
      nor.normalize();
    }

    return nor;
    return this.arcDerivative2(s).normalize();
  }

  get loops() {
    return eliter_stack[eliter_stack.cur++].reset(this);
  }

  get loops2() {
    let this2 = this;

    return (function*() {
      let l = this2.l;
      let i = 0;

      if (!l) {
        return;
      }

      do {
        if (i++ > MAX_EDGE_FACES) {
          console.warn("infinite loop detected in Edge.prototype.[get loops]()");
          break;
        }

        yield l;

        l = l.radial_next;
      } while (l !== this2.l);
    })();
  }

  /** iterates over faces surrounding this edge;
      each face is guaranteed to only be returned once.

      Note that edges can have the same face twice when
      they intrude into the face.

      Iteration can be up to ten levels deep.  Never, ever
      do recursion from within a for loop over this iterator.
   */
  get faces() {
    return efiter_ring.next().reset(this);
  }

  /**
   be careful of this iterator, it sets ITER_TEMP1 in face flags,
   so it won't work with nested loops on the same element
   */
  get faces_old() {
    let this2 = this;

    return (function*() {
      let l = this2.l;
      let i = 0;
      
      if (l === undefined) {
        return;
      }
      
      do {
        if (i++ > MAX_EDGE_FACES) {
          console.warn("infinite loop detected in Edge.prototype.[get faces]()");
          throw new Error("infinite loop detected in Edge.prototype.[get faces]()");
        }

        l.f.flag &= ~MeshFlags.ITER_TEMP1;
        l = l.radial_next;
      } while (l !== this2.l);

      do {
        if (i++ > MAX_EDGE_FACES) {
          console.warn("infinite loop detected in Edge.prototype.[get faces]()");
          throw new Error("infinite loop detected in Edge.prototype.[get faces]()");
          break;
        }

        if (!(l.f.flag & MeshFlags.ITER_TEMP1)) {
          yield l.f;
        }

        l.f.flag |= MeshFlags.ITER_TEMP1;

        l = l.radial_next;
      } while (l !== this2.l);
    })();
  }

  evaluate(t) {
    if (this.flag & MeshFlags.CURVE_FLIP) {
      t = 1.0 - t;
    }

    /*
    on factor;
    off period;

    procedure bez(a, b);
      a + (b - a)*s;

    lin   := bez(k1, k2);
    quad  := bez(lin, sub(k2=k3, k1=k2, lin));
    cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));

    on fort;
    df(cubc, s, 2);
    df(cubic, s);
    cubic;
    off fort;
    */

    if (this.h1) {
      let ret = _evaluate_vs.next().zero();

      for (let i=0; i<3; i++) {
        let k1 = this.v1[i], k2 = this.h1[i], k3 = this.h2[i], k4 = this.v2[i];
        ret[i] = -(k1*t**3-3*k1*t**2+3*k1*t-k1-3*k2*t**3+6*k2*t**2-3*k2*t+3*
                  k3*t**3-3*k3*t**2-k4*t**3);

      }

      return ret;
    } else {
      return _evaluate_vs.next().load(this.v1).interp(this.v2, t);
    }
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
      throw new MeshError("v cannot be undefined in Edge.prototype.otherVertex()");

    if (v === this.v1)
      return this.v2;
    if (v === this.v2)
      return this.v1;

    throw new MeshError("vertex " + v.eid + " not in edge");
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.flag &= ~(MeshFlags.DRAW_DEBUG|MeshFlags.DRAW_DEBUG2);
  }
}
Edge.STRUCT = STRUCT.inherit(Edge, Element, 'mesh.Edge') + `
  v1      : int | obj.v1.eid;
  v2      : int | obj.v2.eid;
  h1      : int | obj.h1 !== undefined ? obj.h1.eid : -1;
  h2      : int | obj.h2 !== undefined ? obj.h2.eid : -1;
  length  : float; 
}
`;
nstructjs.register(Edge);

let calc_normal_temps = util.cachering.fromConstructor(Vector3, 32);

export class Loop extends Element {
  constructor() {
    super(MeshTypes.LOOP);

    this.next = undefined;
    this.prev = undefined;
    this.radial_next = undefined;
    this.radial_prev = undefined;

    this.e = undefined;
    this.f = undefined;
    this.v = undefined;

    this.list = undefined;

    if (SEAL) {
      Object.seal(this);
    }
  }
  /*
    get f() {
      return this._f;
    }

    set f(val) {
      console.warn("loop.f was set", val);
      this._f = val;
    }
  //*/

  _free() {
    this.e = this.f = this.v = this.list = this.next = this.prev = undefined;
    this.radial_next = this.radial_prev = undefined;

    return this;
  }

  get uv() {
    for (let layer of this.customData) {
      if (layer instanceof UVLayerElem)
        return layer.uv;
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}
Loop.STRUCT = STRUCT.inherit(Loop, Element, "mesh.Loop") + `
  v           : int | obj.v.eid;
}
`;

/* save space by deriving these values on file load:
  e           : int | obj.e.eid;
  radial_next : int | obj.radial_next.eid;
  radial_prev : int | obj.radial_prev.eid;
  prev        : int | obj.prev.eid;
*/

nstructjs.register(Loop);

let loopiterstack;

class LoopIter {
  constructor() {
    this.list = undefined;
    this.l = undefined;
    this.done = false;
    this.first = undefined;
    this._i = 0;

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
    this._i = 0;

    return this;
  }

  next() {
    let ret = this.ret;
    let l = this.l;

    if (this._i++ > MAX_FACE_VERTS) {
      ret.done = true;
      ret.value = undefined;

      console.warn("infinite loop detected in LoopIter");

      loopiterstack.cur--;
      this.l = this.list = undefined;
      this.done = true;

      return ret;
    }

    if (l === this.list.l && !this.first) {
      ret.done = true;
      ret.value = undefined;

      loopiterstack.cur--;
      this.done = true;
      this.l = this.list = undefined;
      return ret;
    }

    this.first = false;
    this.l = l.next;

    ret.done = false;
    ret.value = l;

    return ret;
  }

  return() {
    //console.log("iterator return");

    if (!this.done) {
      this.done = true;
      loopiterstack.cur--;
      this.l = this.list = undefined;
    }

    this.ret.value = undefined;
    this.ret.done = true;

    return this.ret;
  }
}

loopiterstack = new Array(512);
for (let i=0; i<loopiterstack.length; i++) {
  loopiterstack[i] = new LoopIter();
}
loopiterstack.cur = 0;

export class LoopList {
  constructor() {
    this.flag = 0;
    this.l = undefined;
    this.length = 0;
    this.__loops = undefined; //used by STRUCT

    if (SEAL) {
      Object.seal(this);
    }
  }

  [Symbol.iterator]() {
    let stack = loopiterstack; //this.iterstack;

    stack.cur++;

    if (stack.cur < 0 || stack.cur >= stack.length) {
      let cur =  stack.cur;
      stack.cur = 0;
      throw new Error("iteration depth was too deep: " + cur);
    }

    return stack[stack.cur].init(this);
  }

  _recount() {
    this.length = 0;

    if (!this.l) {
      return;
    }

    for (let l of this) {
      this.length++;
    }

    return this.length;
  }

  //used by STRUCT script
  get _loops() {
    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    if (this.__loops !== undefined) {
      let ls = this.__loops;

      for (let i=0; i<ls.length; i++) {
        let i1 = (i - 1 + ls.length) % ls.length;
        let i2 = (i + 1) % ls.length;

        let l = ls[i];
        l.prev = ls[i1];
        l.next = ls[i2];
      }

      this.l = ls[0];

      this.__loops = undefined; //in theory it's faster to not delete this?
      //delete this.__loops;
    }
  }
}

LoopList.STRUCT = `
mesh.LoopList {
  __loops : iter(mesh.Loop) | this;  
  length : int;
}
`;
/*
store loops in LoopList to save having to store
next pointers
  l      : int | obj.l.eid;

*/
nstructjs.register(LoopList);

let fiter_stack_v;
let fiter_stack_l;
let fiter_stack_e;

let fiter_stack_v_ring;
let fiter_stack_l_ring;
let fiter_stack_e_ring;

let codegen = `
class $NAMEProxy extends ReusableIter {
  constructor() {
    super();
    
    this.f = undefined;
  }
  
  reset(f) {
    this.f = f;
    
    return this;
  }
  
  [Symbol.iterator]() {
    return $ITERSTACK[$ITERSTACK.cur++].reset(this.f);
  }
}

$ITERSTACK_ring = util.cachering.fromConstructor($NAMEProxy, 4196);

result = class $NAME {
  constructor() {
    this.ret = {done : true, value : undefined};
    this.done = true;
    this.f = undefined;
  }

  reset(face) {
    this.f = face;
    this.done = false;
    this.listi = 0;
    this.l = face.lists[0].l;

    return this;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      this.ret.value = undefined;
      this.ret.done = true;
      this.l = undefined;
      
      $ITERSTACK.cur = Math.max($ITERSTACK.cur-1, 0);
    }
  }

  next() {
    let ret = this.ret;

    if (this.listi >= this.f.lists.length) {
      ret.done = true;
      ret.value = undefined;
      this.finish();

      return ret;
    }

    let list = this.f.lists[this.listi];

    ret.value = this.$RET;
    ret.done = false;

    if (this.l === list.l.prev) {
      this.listi++;

      //fetch loop for next time
      if (this.listi < this.f.lists.length) {
        this.l = this.f.lists[this.listi].l;
      } else {
        this.l = undefined;
      }
    } else {
      this.l = this.l.next;
    }

    return ret;
  }

  return() {
    this.finish();
    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }
}

$ITERSTACK = new Array(1024);
for (let i=0; i<$ITERSTACK.length; i++) {
  $ITERSTACK[i] = new result();
}
$ITERSTACK.cur = 0;
`;

function makecls(name, stackname, ret) {
  let codegen2 = codegen;

  codegen2 = codegen2.replace(/\$NAME/g, name);
  codegen2 = codegen2.replace(/\$RET/g, ret);
  codegen2 = codegen2.replace(/\$ITERSTACK/g, stackname);

  var result;
  eval(codegen2);

  return result;
}

export let FaceVertIter = makecls("FaceVertIter", "fiter_stack_v", "l.v");
export let FaceEdgeIter = makecls("FaceEdgeIter", "fiter_stack_e", "l.e");
export let FaceLoopIter = makecls("FaceLoopIter", "fiter_stack_l", "l");

export class Face extends Element {
  constructor() {
    super(MeshTypes.FACE);

    this.lists = [];

    //used by various iterators
    this.iterflag = 0;

    this.area = 1.0; //not guaranteed to be correct, used for weighting normals
    this.no = new Vector3();
    this.cent = new Vector3();

    this.flag |= MeshFlags.FLAT;

    if (SEAL) {
      Object.seal(this);
    }
  }

  _free() {
    for (let list of this.lists) {
      list.l = undefined;
    }
  }

  get length() {
    let count = 0;

    for (let list of this.lists) {
      count += list.length;
    }

    return count;
  }

  isNgon() {
    if (this.lists.length === 0) {
      return false; //bad face
    }

    return this.lists.length > 1 || this.lists[0].length > 4;
  }

  isTri() {
    return this.lists.length === 1 && this.lists[0].length === 3;
  }

  isQuad() {
    return this.lists.length === 1 && this.lists[0].length === 4;
  }

  /*get flag() {
    return this._flag;
  }

  set flag(f) {
    if (f & MeshFlags.HIDE) {
      console.error("HIDE was set!");
    }

    this._flag = f;
  }//*/

  get verts() {
    return fiter_stack_v_ring.next().reset(this);

    //return fiter_stack_v[fiter_stack_v.cur++].reset(this);
  }

  get loops() {
    return fiter_stack_l[fiter_stack_l.cur++].reset(this);
  }

  get edges() {
    return fiter_stack_e[fiter_stack_e.cur++].reset(this);
  }

  calcNormal(cd_disp) {
    let t1 = calc_normal_temps.next(), t2 = calc_normal_temps.next();
    let t3 = calc_normal_temps.next(), sum = calc_normal_temps.next();

    sum.zero();

    this.calcCent(cd_disp);

    let c = this.cent;

    let _i = 0;
    let l = this.lists[0].l;
    do {
      let v1 = l.v, v2 = l.next.v;

      if (cd_disp >= 0) {
        v1 = v1.customData[cd_disp].worldco;
        v2 = v2.customData[cd_disp].worldco;
      }

      t1.load(v1).sub(c);
      t2.load(v2).sub(c);

      t1.cross(t2).normalize();
      sum.add(t1);

      if (_i++ > MAX_FACE_VERTS) {
        console.warn("infinite loop detected");
        break;
      }
      l = l.next;
    } while (l !== this.lists[0].l);

    sum.normalize();
    this.no.load(sum);

    return this.no;
  }

  calcCent(cd_disp) {
    this.cent.zero();
    let tot = 0.0;

    if (this.lists.length === 0) {
      return this.cent.zero();
    }

    for (let l of this.lists[0]) {
      let co = l.v;

      if (cd_disp >= 0) {
        co = co.customData[cd_disp].worldco;
      }

      this.cent.add(co);
      tot++;
    }

    this.cent.mulScalar(1.0 / tot);
    return this.cent;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}
Face.STRUCT = nstructjs.inherit(Face, Element, "mesh.Face") + `
  lists : array(mesh.LoopList);
  cent  : vec3;
  no    : vec3;
}
`;
nstructjs.register(Face);
