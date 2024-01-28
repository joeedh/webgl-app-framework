import {CDElemArray} from "./mesh_base";

export const SEAL = true;

import {
  MeshError, MeshFlags, MeshTypes, HandleTypes,
  MAX_EDGE_FACES, MAX_FACE_VERTS, MAX_VERT_EDGES,
  ReusableIter, MeshIterFlags, STORE_DELAY_CACHE_INDEX
} from "./mesh_base";
import {UVLayerElem} from "./mesh_customdata";
import {nstructjs, Vector3, Vector4, Quat, Matrix4, BaseVector, util, Vector2, Number3} from '../path.ux/pathux.js';

import {EDGE_LINKED_LISTS} from '../core/const.js';

export {EDGE_LINKED_LISTS} from '../core/const.js';

let quat_temps = util.cachering.fromConstructor(Quat, 512);
let mat_temps = util.cachering.fromConstructor(Matrix4, 256);
let vec3_temps = util.cachering.fromConstructor(Vector3, 1024);

export class MeshIterStack<type> extends Array<type> {
  cur: number;
}

const vertiters_l: MeshIterStack<VertLoopIter> = new MeshIterStack<VertLoopIter>(1024);

export class VertLoopIter {
  v: Vertex;
  ret: IteratorResult<Loop>;
  done: boolean;
  count: number;
  i: number;
  l: Loop | undefined;
  preserve_loop_mode = false;

  constructor(v?: Vertex) {
    this.v = v;
    this.ret = {done: true, value: undefined};
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

  reset(v: Vertex, preserve_loop_mode = false) {
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

    for (let i = 0; i < v.edges.length; i++) {
      let e = v.edges[i];

      if (!e.l) {
        continue;
      }

      let l = e.l;
      let _i = 0;

      do {
        l.f.flag &= ~flag;

        l = l.radial_next;
      } while (l !== e.l && _i++ < 10);
    }

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next(): IteratorResult<Loop> {
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

    let flag = MeshFlags.ITER_TEMP2a;

    if (this.i >= v.edges.length) {
      if (this.l && !(this.l.flag & flag)) {
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

for (let i = 0; i < vertiters_l.length; i++) {
  vertiters_l[i] = new VertLoopIter();
}
vertiters_l.cur = 0;

let vnistack = new MeshIterStack<VertNeighborIter>(512);
vnistack.cur = 0;

export class VertNeighborIterR extends ReusableIter<Vertex> {
  v: Vertex;

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
  ret: IteratorResult<Vertex>;
  done: boolean;
  v: Vertex;
  i: number;

  constructor() {
    this.ret = {done: false, value: undefined};
    this.done = true;
    this.v = undefined;
    this.i = 0;
  }

  reset(v: Vertex): this {
    this.v = v;
    this.i = 0;
    this.done = false
    this.ret.done = false;

    return this;
  }

  finish(): this {
    if (!this.done) {
      this.done = true;
      vnistack.cur--;
      this.v = undefined;
      this.ret.value = undefined;
      this.ret.done = true;
    }

    return this;
  }

  return(): IteratorResult<Vertex> {
    this.finish();

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next(): IteratorResult<Vertex> {
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

/*
export class VertNeighborIterLinkedList {
  constructor() {
    this.ret = {done: false, value: undefined};
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

for (let i = 0; i < vnistack.length; i++) {
  vnistack[i] = EDGE_LINKED_LISTS ? new VertNeighborIterLinkedList() : new VertNeighborIter();
}
*/

for (let i = 0; i < vnistack.length; i++) {
  vnistack[i] = new VertNeighborIter();
}

import {EmptyCDArray} from './mesh_base.js';
import {Mesh} from "./mesh";
import {undefinedForGC} from "../path.ux/scripts/path-controller/util/util";
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import {View3D} from "../editors/view3d/view3d";
import {KnotDataLayer} from "../curve/curve_knot";
import {DispLayerVert} from "./mesh_displacement";
import {CDRef} from "./customdata";

export class Element {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Element {
  type        : byte;
  flag        : int;
  eid         : int;
  customData  : mesh.CDElemArray;
}`);

  type: number;
  eid: number;
  index: number;
  flag: number;
  customData: CDElemArray;

  _old_eid: number;
  _eid: number;
  _didx: number;

  constructor(type) {
    this._initElement(type);
  }

  _free(): void {
  }

  _initElement(type) {
    if (STORE_DELAY_CACHE_INDEX) {
      this._didx = 0;
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

  static isElement(obj) {
    return obj instanceof Element || obj instanceof Vertex;
  }

  valueOf() {
    return this.eid;
  }

  [Symbol.keystr]() {
    return this.eid;
  }

  findLayer<type>(typeName): type | undefined {
    for (let data of this.customData) {
      if (data.typeName === typeName) {
        return data as type;
      }
    }
  }

  toJSON() {
    return {
      type: this.type,
      flag: this.flag,
      index: this.index,
      eid: this.eid
    };
  }

  loadJSON(obj) {
    this.type = obj.type;
    this.flag = obj.flag;
    this.index = obj.index;
    this.eid = this._old_eid = obj.eid;

    return this;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);

    if (!(this.customData instanceof CDElemArray)) {
      this.customData = new CDElemArray(this.customData);
    }

    this._old_eid = this.eid;
    if (this.customData.length === 0) {
      this.customData = EmptyCDArray;
    }
  }
}

let vertiters_f: MeshIterStack<VertFaceIter>;

//XXX test me!
export class VertFaceIter {
  v: Vertex;
  ret: IteratorResult<Face>
  l: Loop | undefined;
  i: number;
  done: boolean;
  count: number;

  constructor() {
    (this.v as Vertex | undefined) = undefined;
    this.ret = {done: true, value: undefined};
    this.l = undefined;
    this.i = 0;
    this.done = true;
    this.count = 0;
  }

  finish(): IteratorResult<Face> {
    if (!this.done) {
      this.done = true;

      this.ret.value = undefined;
      this.ret.done = true;

      vertiters_f.cur--;
      vertiters_f.cur = Math.max(vertiters_f.cur, 0);

      /* Be nice to GC. */
      (this.v as Vertex | undefined) = undefined;
      this.l = undefined;
    }

    return this.ret;
  }

  return(): IteratorResult<Face> {
    return this.finish();
  }

  reset(v: Vertex): this {
    this.v = v;
    this.done = false;
    this.l = undefined;
    this.i = 0;
    this.count = 0;
    this.ret.value = undefined;
    this.ret.done = false;

    let flag = MeshFlags.ITER_TEMP2a;

    //clear temp flag

    for (let i = 0; i < v.edges.length; i++) {
      let e = v.edges[i];

      if (!e.l) {
        continue;
      }

      let l = e.l;
      let _i = 0;

      do {
        l.f.flag &= ~flag;

        l = l.radial_next;
      } while (l !== e.l && _i++ < 10);
    }

    return this;
  }

  [Symbol.iterator](): this {
    return this;
  }

  next(): IteratorResult<Face> {
    this.count++;

    let flag = MeshFlags.ITER_TEMP2a;

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
      if (this.l && !(this.l.f.flag & flag)) {
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

/*
export class VertFaceIterLinkedList {
  v: Vertex;
  e: Edge;
  i: number;
  l: Loop | undefined
  done: boolean;
  count: number;
  ret: IteratorResult<Face>;

  constructor() {
    this.v = undefined;
    this.ret = {done: true, value: undefined};
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
      } while (l !== e.l && _i++ < 10);
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
for (let i = 0; i < vertiters_f.length; i++) {
  vertiters_f[i] = EDGE_LINKED_LISTS ? new VertFaceIterLinkedList() : new VertFaceIter();
}
vertiters_f.cur = 0;
*/

vertiters_f = new MeshIterStack<VertFaceIter>(256);
for (let i = 0; i < vertiters_f.length; i++) {
  vertiters_f[i] = new VertFaceIter();
}
vertiters_f.cur = 0;


/*
let vedgeiters = new Array(512);
export class VEdgeIter {
  v: Vertex;
  e: Edge | undefined;
  i: number;
  ret: IteratorResult<Edge>
  done: true;

  constructor() {
    this.v = undefined;
    this.e = undefined;
    this.i = 0;
    this.ret = {done: false, value: undefined};
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

for (let i = 0; i < vedgeiters.length; i++) {
  vedgeiters[i] = new VEdgeIter();
}
vedgeiters.cur = 0;
*/

/* Backwards compatibility reader. */
let IN_VERTEX_STRUCT = false;

class VertexReader {
  v: Vertex | undefined;

  constructor() {
    this.v = undefined;
  }

  get co(): Vector3 {
    return this.v.co;
  }

  set co(co: Vector3) {
    this.v.co = co;
  }

  get no(): Vector3 {
    return this.v.no;
  }

  set no(no: Vector3) {
    this.v.no = no;
  }

  set customData(f) {
    this.v.customData = f;
  }

  get customData() {
    return this.v.customData;
  }

  set flag(f: number) {
    this.v.flag = f;
  }

  set type(f: number) {
    this.v.type = f;
  }

  set index(f: number) {
    this.v.index = f;
  }

  set eid(f: number) {
    this.v.eid = f;
  }

  set 0(f: number) {
    this.v.co[0] = f;
  }

  set 1(f: number) {
    this.v.co[1] = f;
  }

  set 2(f: number) {
    this.v.co[2] = f;
  }
}

const vertexReader = new VertexReader();

let tracet = util.time_ms();
let tracei = 0;

export function tracetimer() {
  if (tracei < 15) {
    tracei++;
    return true;
  }

  if (util.time_ms() - tracet > 100) {
    tracet = util.time_ms();
    tracei = 0;
    return true;
  }

  return false;
}

export function traceget(i) {
  if (tracetimer()) {
    console.warn("VGET", i);
  }
}

export function traceset(i) {
  if (tracetimer()) {
    console.warn("VSET", i);
  }
}

export class _Vertex extends Element {
  co: Vector3;
  no: Vector3;
  edges: Edge[];

  /*
  save space by deriving these on file load:
    edges   : array(e, int) | (e.eid);
  */
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Vertex {
  co      : vec3;
  no      : vec3;
}
`);

  constructor(co: Vector3 | undefined = undefined) {
    super(MeshTypes.VERTEX);

    this.co = new Vector3();

    if (co !== undefined) {
      this.load(co);
    }

    this.no = new Vector3();
    this.no[2] = 1.0;

    this.edges = [];

    if (SEAL) {
      Object.seal(this);
    }
  }

  get length() {
    traceget("length");
    return 3;
  }

  get 0() {
    traceget(1);
    return this.co[0];
  }

  get 1() {
    traceget(1);
    return this.co[1];
  }

  get 2() {
    traceget(1);
    return this.co[2];
  }

  set 0(f) {
    traceset(0);
    this.co[0] = f;
  }

  set 1(f) {
    traceset(1);
    this.co[1] = f;
  }

  set 2(f) {
    traceset(2);
    this.co[2] = f;
  }

  load(co: Vector3): this {
    traceset("load");
    this.co.load(co);
    return this;
  }

  _free(): void {
    this.edges.length = 0;
  }

  /*try to avoid using this,
   it duplicates lots of work
   compared to other methods
   */
  calcNormal(doFaces = true): this {
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

  get neighbors(): VertNeighborIterR {
    return vniring.next().reset(this);
    //return vnistack[vnistack.cur++].reset(this);
  }

  toJSON(): any {
    let edges = [];
    for (let e of this.edges) {
      edges.push(e.eid);
    }

    return {
      0: this[0],
      1: this[1],
      2: this[2],
      edges: edges,
      no: this.no,
      ...super.toJSON()
    }
  }

  get loops(): VertLoopIter {
    return vertiters_l[vertiters_l.cur++].reset(this, true);
  }

  get faces(): VertFaceIter {
    //return this.faces2;
    let i = vertiters_f.cur;
    let stack = vertiters_f;

    for (let j = 0; j < stack.length; j++) {
      let i2 = (i + j) % stack.length;

      if (stack[i2].done) {
        stack.cur++;
        return stack[i2].reset(this);
      }
    }

    stack.cur++;
    stack.push(new VertFaceIter());

    return stack[stack.length - 1].reset(this);
  }

  isBoundary(includeWire = false): boolean {
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

  get valence(): number {
    return this.edges.length;
  }

  otherEdge(e): Edge {
    if (this.valence !== 2) {
      throw new MeshError("otherEdge only works on 2-valence vertices");
    }

    if (e === this.edges[0])
      return this.edges[1];
    else if (e === this.edges[1])
      return this.edges[0];
  }

  loadSTRUCT(reader: StructReader<this>): void {
    IN_VERTEX_STRUCT = true;
    vertexReader.v = this;
    reader(vertexReader as unknown as this);
    vertexReader.v = undefined;
    IN_VERTEX_STRUCT = false;

    super.loadSTRUCT(reader);
  }

  /* ======== XXX vector funcs, remove ======= */
  loadXYZ(x, y, z): this {
    traceget("loadXYZ");
    this[0] = x;
    this[1] = y;
    this[2] = z;

    return this;
  }

  loadXY(x, y): this {
    traceget("loadXY");
    this[0] = x;
    this[1] = y;

    return this;
  }

  dot(b): number {
    return this[0] * b[0] + this[1] * b[1] + this[2] * b[2];
  }

  multVecMatrix(matrix: Matrix4, ignore_w: boolean = false): number {
    let x = this[0];
    let y = this[1];
    let z = this[2];
    this[0] = matrix.$matrix.m41 + x * matrix.$matrix.m11 + y * matrix.$matrix.m21 + z * matrix.$matrix.m31;
    this[1] = matrix.$matrix.m42 + x * matrix.$matrix.m12 + y * matrix.$matrix.m22 + z * matrix.$matrix.m32;
    this[2] = matrix.$matrix.m43 + x * matrix.$matrix.m13 + y * matrix.$matrix.m23 + z * matrix.$matrix.m33;
    let w = matrix.$matrix.m44 + x * matrix.$matrix.m14 + y * matrix.$matrix.m24 + z * matrix.$matrix.m34;

    if (!ignore_w && w !== 1 && w !== 0 && matrix.isPersp) {
      this[0] /= w;
      this[1] /= w;
      this[2] /= w;
    }
    return w;
  }

  cross(v: Vector3): this {
    traceget("cross");
    let x = this[1] * v[2] - this[2] * v[1];
    let y = this[2] * v[0] - this[0] * v[2];
    let z = this[0] * v[1] - this[1] * v[0];

    this[0] = x;
    this[1] = y;
    this[2] = z;

    return this;
  }

  //axis is optional, 0
  rot2d(A: number, axis: number = 0): this {
    traceget("rot2d");

    let x = this[0];
    let y = this[1];

    const cos = Math.cos, sin = Math.sin;

    if (axis === 1) {
      this[0] = x * cos(A) + y * sin(A);
      this[1] = y * cos(A) - x * sin(A);
    } else {
      this[0] = x * cos(A) - y * sin(A);
      this[1] = y * cos(A) + x * sin(A);
    }

    return this;
  }

}


export interface IVertexConstructor {
  STRUCT: string;

  (...args: string[]): Function;

  readonly prototype: Function;
}

export interface PrivateVertexConstructor extends IVertexConstructor {
  new(co?: Vector3): _Vertex;
}

export type Vertex = _Vertex;
export const Vertex = _Vertex as unknown as IVertexConstructor;

export class Handle extends Element {
  co: Vector3;
  mode: HandleTypes;
  owner: Edge;
  roll: number;

  constructor(co: Vector3 | undefined = undefined) {
    super(MeshTypes.HANDLE);

    this.co = new Vector3();
    if (co !== undefined) {
      this.co.load(co);
    }

    this.owner = undefined;
    this.mode = HandleTypes.AUTO;
    this.roll = 0;

    if (SEAL) {
      Object.seal(this);
    }
  }

  get 0(): number {
    traceget(0);
    return this.co[0];
  }

  get 1(): number {
    traceget(1);
    return this.co[1];
  }

  get 2(): number {
    traceget(2);
    return this.co[2];
  }

  get visible(): boolean {
    let hide: boolean = (this.flag & MeshFlags.HIDE) !== 0;

    hide = hide || this.mode === HandleTypes.AUTO;
    hide = hide || this.mode === HandleTypes.STRAIGHT;

    return !hide;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    const arr = this as unknown as Array<number>;
    if (arr[0] !== undefined) {
      this.co[0] = arr[0];
      this.co[1] = arr[1];
      this.co[2] = arr[2];

      delete arr[0];
      delete arr[1];
      delete arr[2];
    }

    super.loadSTRUCT(reader);
  }
}

Handle.STRUCT = nstructjs.inherit(Handle, Element, "mesh.Handle") + `
  co       : vec3; 
  mode     : byte;
  owner    : int | obj.owner !== undefined ? obj.owner.eid : -1;
  roll     : float;
}
`;

nstructjs.register(Handle);

let _evaluate_tmp_vs = util.cachering.fromConstructor(Vector3, 512);
let _evaluate_vs = util.cachering.fromConstructor(Vector3, 512);
let _arc_evaluate_vs = util.cachering.fromConstructor(Vector3, 512);

let PS = 0, PNUM = 2, PTOT = 3;

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
  size: number;
  e: Edge;
  length: number;
  table: number[];
  regen: number;

  constructor(size = 512, e: Edge) {
    this.size = size;
    this.e = e;
    this.length = 0;
    this.table = new Array(size);
    this.regen = 1;
  }

  _calcS(t: number, steps = 512): number {
    let dt = t / steps;
    let e = this.e;

    const v1 = e.v1.co, v2 = e.v2.co, h1 = e.h1.co, h2 = e.h2.co;

    let x1 = v1[0], x2 = h1[0], x3 = h2[0], x4 = v2[0];
    let y1 = v1[1], y2 = h1[1], y3 = h2[1], y4 = v2[1];
    let z1 = v1[2], z2 = h1[2], z3 = h2[2], z4 = v2[2];
    let sqrt = Math.sqrt;

    let sum = 0.0;
    t = 0.0;

    for (let i = 0; i < steps; i++, t += dt) {
      let ds = 3 * sqrt((2 * (2 * x2 - x3 - x1) * t + x1 - x2 + (3 * x3 - x4 - 3 * x2 + x1) * t ** 2) ** 2 + (
        2 * (2 * y2 - y3 - y1) * t + y1 - y2 + (3 * y3 - y4 - 3 * y2 + y1) * t ** 2) ** 2 + (2 * (2 * z2 - z3 -
        z1) * t + z1 - z2 + (3 * z3 - z4 - 3 * z2 + z1) * t ** 2) ** 2);

      let ds2 = (6 * ((2 * (2 * y2 - y3 - y1) * t + y1 - y2 + (3 * y3 - y4 - 3 * y2 + y1) * t ** 2) * ((3 * y3 -
        y4 - 3 * y2 + y1) * t + 2 * y2 - y3 - y1) + (2 * (2 * z2 - z3 - z1) * t + z1 - z2 + (3 * z3 - z4 - 3 *
        z2 + z1) * t ** 2) * ((3 * z3 - z4 - 3 * z2 + z1) * t + 2 * z2 - z3 - z1) + (2 * (2 * x2 - x3 - x1) *
        t + x1 - x2 + (3 * x3 - x4 - 3 * x2 + x1) * t ** 2) * ((3 * x3 - x4 - 3 * x2 + x1) * t + 2 * x2 - x3 -
        x1))) / sqrt((2 * (2 * x2 - x3 - x1) * t + x1 - x2 + (3 * x3 - x4 - 3 * x2 + x1) * t ** 2) ** 2 +
        (2 * (2 * y2 - y3 - y1) * t + y1 - y2 + (3 * y3 - y4 - 3 * y2 + y1) * t ** 2) ** 2 + (2 * (2 * z2 - z3
          - z1) * t + z1 - z2 + (3 * z3 - z4 - 3 * z2 + z1) * t ** 2) ** 2);

      sum += ds * dt + 0.5 * ds2 * dt * dt;
    }

    return sum;
  }

  update() {
    this.regen = 0;

    let e = this.e;
    e._length = this.length = this._calcS(1.0);

    let steps = this.size * 4;
    let t = 0.0, dt = 1.0 / steps;

    const v1 = e.v1.co, v2 = e.v2.co, h1 = e.h1.co, h2 = e.h2.co;

    let x1 = v1[0], x2 = h1[0], x3 = h2[0], x4 = v2[0];
    let y1 = v1[1], y2 = h1[1], y3 = h2[1], y4 = v2[1];
    let z1 = v1[2], z2 = h1[2], z3 = h2[2], z4 = v2[2];
    let length = 0.0;
    let sqrt = Math.sqrt;
    let table = this.table;

    table.length = PTOT * this.size;

    for (let i = 0; i < table.length; i++) {
      table[i] = 0.0;
    }

    let real_length = 0;

    for (let i = 0; i < steps; i++, t += dt) {
      let ds = 3 * sqrt((2 * (2 * x2 - x3 - x1) * t + x1 - x2 + (3 * x3 - x4 - 3 * x2 + x1) * t ** 2) ** 2 + (
        2 * (2 * y2 - y3 - y1) * t + y1 - y2 + (3 * y3 - y4 - 3 * y2 + y1) * t ** 2) ** 2 + (2 * (2 * z2 - z3 -
        z1) * t + z1 - z2 + (3 * z3 - z4 - 3 * z2 + z1) * t ** 2) ** 2);

      let ds2 = (6 * ((2 * (2 * y2 - y3 - y1) * t + y1 - y2 + (3 * y3 - y4 - 3 * y2 + y1) * t ** 2) * ((3 * y3 -
        y4 - 3 * y2 + y1) * t + 2 * y2 - y3 - y1) + (2 * (2 * z2 - z3 - z1) * t + z1 - z2 + (3 * z3 - z4 - 3 *
        z2 + z1) * t ** 2) * ((3 * z3 - z4 - 3 * z2 + z1) * t + 2 * z2 - z3 - z1) + (2 * (2 * x2 - x3 - x1) *
        t + x1 - x2 + (3 * x3 - x4 - 3 * x2 + x1) * t ** 2) * ((3 * x3 - x4 - 3 * x2 + x1) * t + 2 * x2 - x3 -
        x1))) / sqrt((2 * (2 * x2 - x3 - x1) * t + x1 - x2 + (3 * x3 - x4 - 3 * x2 + x1) * t ** 2) ** 2 +
        (2 * (2 * y2 - y3 - y1) * t + y1 - y2 + (3 * y3 - y4 - 3 * y2 + y1) * t ** 2) ** 2 + (2 * (2 * z2 - z3
          - z1) * t + z1 - z2 + (3 * z3 - z4 - 3 * z2 + z1) * t ** 2) ** 2);

      let df = dt;

      let ti = Math.floor((length / this.length) * (this.size) * 0.9999);
      ti = Math.min(Math.max(ti, 0), this.size - 1) * PTOT;

      table[ti + PS] += t;
      table[ti + PNUM]++;

      if (i !== steps - 1) {
        length += ds * dt + 0.5 * ds2 * dt * dt;
      }
    }

    for (let ti = 0; ti < table.length; ti += PTOT) {
      if (table[ti + PNUM] == 0.0) {
        table[ti] = ti / steps / PTOT;
        table[ti + 1] = table[ti + 2] = 0.0;
      } else {
        table[ti] /= table[ti + PNUM];
      }
    }

    return this;
  }

  arcConvert(s: number): number {
    if (this.e.length === 0) {
      return 0.0;
    }

    if (this.regen || this.length === 0.0) {
      this.update();
    }

    let ti = (this.size - 1) * s / this.e.length * 0.99999;
    ti = Math.min(Math.max(ti, 0.0), this.size - 1);

    let u = Math.fract(ti);
    ti = Math.floor(ti) * PTOT;
    let t;

    if (ti < 0) {
      return 0.0;
    } else if (ti / PTOT >= this.size - 1) {
      return 1.0;
    } else {
      let dt = 50;
      let t1 = this.table[ti];
      let t2 = this.table[ti + PTOT];

      return t1 + (t2 - t1) * u;
    }
  }

  evaluate(s: number): Vector3 {
    let t = this.arcConvert(s);

    //avoid flipping twice, we already flipped in Edge.arcEvaluate
    if (this.e.flag & MeshFlags.CURVE_FLIP) {
      t = 1.0 - t;
    }

    return this.e.evaluate(t);
  }
}

let eliter_stack = new MeshIterStack<EdgeLoopIter>(1024);
eliter_stack.cur = 0;

class EdgeLoopIter {
  ret: IteratorResult<Loop> = {done: true, value: undefined};
  done: boolean;
  e: Edge;
  l: Loop;
  i: number;


  constructor() {
    this.ret = {done: true, value: undefined};
    this.done = true;
    this.e = undefined;
    this.l = undefined;
    this.i = 0;
  }

  reset(e): this {
    this.i = 0;
    this.done = false;
    this.ret.done = false;

    this.e = e;
    this.l = e.l;

    return this;
  }

  finish(): IteratorResult<Loop> {
    if (!this.done) {
      this.ret.done = true;
      this.ret.value = undefined;


      (this.e as Edge | undefined) = undefined;
      (this.l as Loop | undefined) = undefined;

      this.done = true;
      eliter_stack.cur--;
    }

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next(): IteratorResult<Loop> {
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

  return(): IteratorResult<Loop> {
    return this.finish();
  }
}

for (let i = 0; i < eliter_stack.length; i++) {
  eliter_stack[i] = new EdgeLoopIter();
}

let eviter_stack = new MeshIterStack<EdgeVertIter>(4192);
eviter_stack.cur = 0;

class EdgeVertIter {
  e: Edge;
  i: number;
  ret: IteratorResult<Vertex>
  done: boolean;

  constructor() {
    this.e = undefined;
    this.i = 0;
    this.ret = {done: false, value: undefined};
    this.done = true;
  }

  reset(e: Edge) {
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

  next(): IteratorResult<Vertex> {
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

  finish(): IteratorResult<Vertex> {
    if (!this.done) {
      this.ret.value = undefined;
      this.ret.done = true;
      this.done = true;
      this.e = undefined;
    }

    return this.ret;
  }

  return(): IteratorResult<Vertex> {
    return this.finish();
  }
}

for (let i = 0; i < eviter_stack.length; i++) {
  eviter_stack[i] = new EdgeVertIter();
}

let efiter_stack = new MeshIterStack<EdgeFaceIter>(2048);
efiter_stack.cur = 0;
let efiter_ring: util.cachering<EdgeFaceIterR>;

export class EdgeFaceIterR extends ReusableIter<Face> {
  e: Edge;

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

export class EdgeFaceIter implements Iterator<Face> {
  e: Edge | undefined;
  l: Loop | undefined;
  done: boolean;
  i: number;
  ret: IteratorResult<Face>;
  flag: number = 0;

  constructor() {
    this.e = undefined;
    this.l = undefined;
    this.done = true;
    this.i = 0;
    this.ret = {done: true, value: undefined};
  }

  reset(e: Edge): this {
    this.e = e;
    this.l = e.l;
    this.i = 0;
    this.done = false;

    if (!e.l) {
      return this;
    }

    this.ret.done = false;
    this.ret.value = undefined;

    let flag = this.flag = 1 << efiter_flag;

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

    efiter_flag = Math.min(efiter_flag + 1, MeshIterFlags.EDGE_FACES_TOT);

    return this;
  }

  next(): IteratorResult<Face> {
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

  finish(): IteratorResult<Face> {
    if (!this.done) {
      this.done = true;

      efiter_stack.cur = Math.max(efiter_stack.cur - 1, 0);
      efiter_flag = Math.max(efiter_flag - 1, 0);

      this.ret.done = true;
      this.ret.value = undefined;
    }

    return this.ret;
  }

  return(): IteratorResult<Face> {
    return this.finish();
  }
}

for (let i = 0; i < efiter_stack.length; i++) {
  efiter_stack[i] = new EdgeFaceIter();
}

export class Edge extends Element {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Edge {
  v1      : int | obj.v1.eid;
  v2      : int | obj.v2.eid;
  h1      : int | obj.h1 !== undefined ? obj.h1.eid : -1;
  h2      : int | obj.h2 !== undefined ? obj.h2.eid : -1;
  length  : float; 
}`);

  v1: Vertex = undefined;
  v2: Vertex = undefined;
  h1: Handle | undefined = undefined;
  h2: Handle | undefined = undefined;
  l: Loop | undefined;
  _arcCache: ArcLengthCache | undefined;
  _length: number = 0;

  length: number = 0;

  constructor() {
    super(MeshTypes.EDGE);

    this._arcCache = undefined;
    this._length = undefined;

    this.l = undefined;

    this.h1 = this.h2 = undefined;

    this.length = 0.0;

    if (SEAL) {
      Object.seal(this);
    }
  }

  _free() {
    this.l = undefined;

    (this.v1 as Vertex | undefined) = undefined;
    (this.v2 as Vertex | undefined) = undefined;

    this.h1 = undefined;
    this.h2 = undefined;
  }

  get verts(): EdgeVertIter {
    return eviter_stack[eviter_stack.cur++].reset(this);
  }

  get loopCount(): number {
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

  get faceCount(): number {
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

  loopForFace(face): Loop | undefined {
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

  get arcCache(): ArcLengthCache {
    if (!this._arcCache) {
      this._arcCache = new ArcLengthCache(undefined, this);
      this._arcCache.update();
    }

    return this._arcCache;
  }

  set arcCache(val: ArcLengthCache | undefined) {
    this._arcCache = val;
  }

  calcScreenLength(view3d: View3D): number {
    let steps = 32;
    let s = 0, ds = 1.0 / (steps - 1);
    let lastco = undefined;
    let sum = 0.0;

    for (let i = 0; i < steps; i++, s += ds) {
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

  update(force = true): void {
    if (force) {
      this.updateHandles();
      this.updateLength();
    }

    this.flag |= MeshFlags.UPDATE;
  }

  updateLength(): number {
    if (this._arcCache !== undefined) {
      this._arcCache.update();
      this.length = this._arcCache._calcS(1.0);
    } else {
      this.length = this.v1.co.vectorDistance(this.v2.co);
    }

    return this.length;
  }

  commonVertex(e): Vertex | undefined {
    if (e.v1 === this.v1 || e.v1 === this.v2)
      return e.v1;

    if (e.v2 === this.v1 || e.v2 === this.v2)
      return e.v2;
  }

  vertex(h): Vertex {
    if (h === this.h1) {
      return this.v1;
    } else if (h === this.h2) {
      return this.v2;
    } else {
      throw new Error("invalid handle" + h);
    }
  }

  handle(v): Handle {
    if (v === this.v1) {
      return this.h1 as Handle;
    } else if (v === this.v2) {
      return this.h2 as Handle;
    } else {
      throw new Error("invalid vertex" + v);
    }
  }

  otherHandle(v_or_h): Handle {
    let h = v_or_h instanceof Vertex ? this.handle(v_or_h) : v_or_h;
    if (h === this.h1) {
      return this.h2 as Handle;
    } else if (h === this.h2) {
      return this.h1 as Handle;
    } else {
      throw new Error("invalid handle " + h);
    }
  }

  updateHandles(): void {
    if (this.h1 === undefined) {
      return;
    }

    let dohandle = (h: Handle) => {
      let v = this.vertex(h);
      //v = this.otherVertex(v);

      if (h.mode === HandleTypes.AUTO && v.valence === 2) {
        let e2 = v.otherEdge(this);
        let v2 = e2.otherVertex(v);

        h.co.load(this.otherVertex(v).co).sub(v2.co).mulScalar(1.0 / 4.0);
        h.co.add(v.co);

      } else if (h.mode === HandleTypes.STRAIGHT) {
        h.co.load(v.co).interp(this.otherVertex(v).co, 1.0 / 3.0);
      }
    };

    /* We don't want to be too pedantic with undefined-checking handles */
    dohandle(this.h1 as Handle);
    dohandle(this.h2 as Handle);
  }

  arcEvaluate(s: number): Vector3 {
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
      let p = _evaluate_vs.next().load(this.v1.co);

      return p.interp(this.v2.co, s / this.length);
    }
  }

  arcDerivative(s: number): Vector3 {
    let df = 0.001;

    if (s < 1.0 - df && s > df) {
      let a = this.arcEvaluate(s - df);
      let b = this.arcEvaluate(s + df);
      return a.sub(b).mulScalar(0.5 / df);
    } else if (s < 1.0 - df) {
      let a = this.arcEvaluate(s);
      let b = this.arcEvaluate(s + df);
      return a.sub(b).mulScalar(1.0 / df);
    } else {
      let a = this.arcEvaluate(s - df);
      let b = this.arcEvaluate(s);
      return a.sub(b).mulScalar(1.0 / df);
    }
  }

  arcDerivative2(s) {
    let df = 0.001;

    if (s < 1.0 - df && s > df) {
      let a = this.arcDerivative(s - df);
      let b = this.arcDerivative(s + df);
      return a.sub(b).mulScalar(0.5 / df);
    } else if (s < 1.0 - df) {
      let a = this.arcDerivative(s);
      let b = this.arcDerivative(s + df);
      return a.sub(b).mulScalar(1.0 / df);
    } else {
      let a = this.arcDerivative(s - df);
      let b = this.arcDerivative(s);
      return a.sub(b).mulScalar(1.0 / df);
    }
  }

  twist(t) {
    if (this.flag & MeshFlags.CURVE_FLIP) {
      t = 1.0 - t;
    }

    let k1 = this.v1.findLayer<KnotDataLayer>("knot");
    let k2 = this.v2.findLayer<KnotDataLayer>("knot");

    if (k1) {
      let t1 = k1.tilt;
      let t2 = k2.tilt;
      return t1 + (t2 - t1) * t;
    } else {
      return 0.0;
    }
  }

  arcTwist(s: number): number {
    return this.twist(s / this.length);
  }

  arcNormal(s: number): Vector3 {
    //return this.arcDerivative2(s).normalize();

    let flag = this.flag;

    function getUp(dv) {
      dv.normalize();
      let x = Math.abs(dv[0]), y = Math.abs(dv[1]), z = Math.abs(dv[2]);
      let axis : Number3;

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
    //return this.arcDerivative2(s).normalize();
  }

  get loops(): EdgeLoopIter {
    return eliter_stack[eliter_stack.cur++].reset(this);
  }


  /** iterates over faces surrounding this edge;
   each face is guaranteed to only be returned once.

   Note that edges can have the same face twice when
   they intrude into the face.

   Iteration can be up to ten levels deep.  Never, ever
   do recursion from within a for loop over this iterator.
   */
  get faces(): EdgeFaceIterR {
    return efiter_ring.next().reset(this);
  }

  evaluate(t: number): Vector3 {
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

      for (let i = 0 as Number3; i < 3; i++) {
        let k1 = this.v1.co[i], k2 = this.h1.co[i], k3 = this.h2.co[i], k4 = this.v2.co[i];
        ret[i] = -(k1 * t ** 3 - 3 * k1 * t ** 2 + 3 * k1 * t - k1 - 3 * k2 * t ** 3 + 6 * k2 * t ** 2 - 3 * k2 * t + 3 *
          k3 * t ** 3 - 3 * k3 * t ** 2 - k4 * t ** 3);

      }

      return ret;
    } else {
      return _evaluate_vs.next().load(this.v1.co).interp(this.v2.co, t);
    }
  }

  derivative(t: number): Vector3 {
    let df = 0.0001;
    let a = this.evaluate(t - df);
    let b = this.evaluate(t + df);

    return b.sub(a).mulScalar(0.5 / df);
  }

  derivative2(t: number): Vector3 {
    let df = 0.0001;
    let a = this.derivative(t - df);
    let b = this.derivative(t + df);

    return b.sub(a).mulScalar(0.5 / df);
  }

  curvature(t: number): number {
    let dv1 = this.derivative(t);
    let dv2 = this.derivative2(t);

    return (dv1[0] * dv2[1] - dv1[1] * dv2[0]) / Math.pow(dv1.dot(dv1), 3.0 / 2.0);
  }

  has(v: Vertex): boolean {
    return v === this.v1 || v === this.v2;
  }

  otherVertex(v: Vertex): Vertex {
    if (v === undefined)
      throw new MeshError("v cannot be undefined in Edge.prototype.otherVertex()");

    if (v === this.v1)
      return this.v2;
    if (v === this.v2)
      return this.v1;

    throw new MeshError("vertex " + v.eid + " not in edge");
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);

    this.flag &= ~(MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2);
  }
}

let calc_normal_temps = util.cachering.fromConstructor(Vector3, 32);

export class Loop extends Element {
  /*  save space by deriving these values on file load:
    e           : int | obj.e.eid;
    radial_next : int | obj.radial_next.eid;
    radial_prev : int | obj.radial_prev.eid;
    prev        : int | obj.prev.eid;
  */

  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Loop {
  v           : int | obj.v.eid;
  e           : int | obj.e.eid;
}`);


  next: Loop;
  prev: Loop;
  radial_prev: Loop;
  radial_next: Loop;
  v: Vertex;
  e: Edge;
  f: Face;
  list: LoopList;

  constructor() {
    super(MeshTypes.LOOP);

    if (SEAL) {
      //XXX TODO: test this
      //Object.seal(this);
    }
  }

  _free() {
    this.e = util.undefinedForGC<Edge>();
    this.f = util.undefinedForGC<Face>();
    this.v = util.undefinedForGC<Vertex>();
    this.list = util.undefinedForGC<LoopList>();

    this.next = this.prev = this.radial_next = this.radial_prev = util.undefinedForGC<Loop>();

    return this;
  }

  get uv(): Vector2 {
    for (let layer of this.customData) {
      if (layer instanceof UVLayerElem)
        return layer.uv;
    }
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

let loopiterstack;

class LoopIter {
  list: LoopList;
  l: Loop;
  first: boolean;
  done: boolean;
  _i: number;
  ret: IteratorResult<Loop> = {done: true, value: undefined};

  constructor() {
  }

  init(list: LoopList): this {
    this.done = false;
    this.first = true;
    this.list = list;
    this.l = list.l;
    this._i = 0;

    return this;
  }

  next(): IteratorResult<Loop> {
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

  return(): IteratorResult<Loop> {
    //console.log("iterator return");

    if (!this.done) {
      this.done = true;
      loopiterstack.cur--;

      /* Be nice to GC. */
      (this.l as Loop | undefined) = undefined;
      (this.list as LoopList | undefined) = undefined;
    }

    this.ret.value = undefined;
    this.ret.done = true;

    return this.ret;
  }
}

loopiterstack = new MeshIterStack<LoopIter>(512);
for (let i = 0; i < loopiterstack.length; i++) {
  loopiterstack[i] = new LoopIter();
}
loopiterstack.cur = 0;

export class LoopList {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.LoopList {
  __loops : iter(mesh.Loop) | this;  
  length : int;
}`);

  flag: number;
  l: Loop;
  length: number;
  __loops: Loop[] | undefined; //used by STRUCT

  constructor() {
    this.flag = 0;
    (this.l as Loop | undefined) = undefined;
    this.length = 0;
    this.__loops = undefined; //used by STRUCT

    if (SEAL) {
      Object.seal(this);
    }
  }

  [Symbol.iterator](): LoopIter {
    let stack = loopiterstack; //this.iterstack;

    stack.cur++;

    if (stack.cur < 0 || stack.cur >= stack.length) {
      let cur = stack.cur;
      stack.cur = 0;
      throw new Error("iteration depth was too deep: " + cur);
    }

    return stack[stack.cur].init(this);
  }

  _recount(): number {
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
  get _loops(): LoopList {
    return this;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);

    if (this.__loops !== undefined) {
      let ls = this.__loops;

      for (let i = 0; i < ls.length; i++) {
        let i1 = (i - 1 + ls.length) % ls.length;
        let i2 = (i + 1) % ls.length;

        let l = ls[i];
        l.prev = ls[i1];
        l.next = ls[i2];
      }

      this.l = ls[0];
      this.__loops = undefined;
    }
  }
}

/*
store loops in LoopList to save having to store
next pointers
  l      : int | obj.l.eid;

*/
nstructjs.register(LoopList);

let fiter_stack_v: MeshIterStack<FaceVertIter>;
let fiter_stack_l: MeshIterStack<FaceLoopIter>;
let fiter_stack_e: MeshIterStack<FaceEdgeIter>;

let fiter_stack_v_ring: util.cachering<FaceVertIterProxy>;
let fiter_stack_l_ring: util.cachering<FaceLoopIterProxy>;
let fiter_stack_e_ring: util.cachering<FaceEdgeIterProxy>;

class FaceLoopIterProxy extends ReusableIter<Loop> {
  f: Face;

  constructor() {
    super();
  }

  reset(f: Face) {
    this.f = f;

    return this;
  }

  [Symbol.iterator]() {
    return fiter_stack_l[fiter_stack_l.cur++].reset(this.f);
  }
}

fiter_stack_l_ring = util.cachering.fromConstructor<FaceLoopIterProxy>(FaceLoopIterProxy, 4196);

class FaceLoopIter implements Iterable<Loop>, Iterator<Loop> {
  ret: IteratorResult<Loop>
  done: boolean;
  f: Face;
  l: Loop;
  listi: number = 0;

  constructor() {
    this.ret = {done: true, value: undefined};
    this.done = true;
    (this.f as Face | undefined) = undefined;
    (this.l as Loop | undefined) = undefined;
  }

  reset(face: Face): this {
    this.f = face;
    this.done = false;
    this.listi = 0;
    this.l = face.lists[0].l;

    return this;
  }

  finish(): void {
    if (!this.done) {
      this.done = true;
      this.ret.value = undefined;
      this.ret.done = true;

      /* Be nice to GC. */
      (this.f as Face | undefined) = undefined;
      (this.l as Loop | undefined) = undefined;

      fiter_stack_l.cur = Math.max(fiter_stack_l.cur - 1, 0);
    }
  }

  next(): IteratorResult<Loop> {
    let ret = this.ret;

    if (this.listi >= this.f.lists.length) {
      ret.done = true;
      ret.value = undefined;
      this.finish();

      return ret;
    }

    let list = this.f.lists[this.listi];

    ret.value = this.l;
    ret.done = false;

    if (this.l === list.l.prev) {
      this.listi++;

      //fetch loop for next time
      if (this.listi < this.f.lists.length) {
        this.l = this.f.lists[this.listi].l;
      } else {
        (this.l as Loop | undefined) = undefined;
      }
    } else {
      this.l = this.l.next;
    }

    return ret;
  }

  return(): IteratorResult<Loop> {
    this.finish();
    return this.ret;
  }

  [Symbol.iterator](): this {
    return this;
  }
}

fiter_stack_l = new MeshIterStack<FaceLoopIter>(1024);
for (let i = 0; i < fiter_stack_l.length; i++) {
  fiter_stack_l[i] = new FaceLoopIter();
}
fiter_stack_l.cur = 0;


class FaceEdgeIterProxy extends ReusableIter<Edge> {
  f: Face;

  constructor() {
    super();

    this.f = undefined;
  }

  reset(f) {
    this.f = f;

    return this;
  }

  [Symbol.iterator]() {
    return fiter_stack_e[fiter_stack_e.cur++].reset(this.f);
  }
}

fiter_stack_e_ring = util.cachering.fromConstructor<FaceEdgeIterProxy>(FaceEdgeIterProxy, 4196);

class FaceEdgeIter {
  ret: IteratorResult<Edge>;
  done: boolean;
  f: Face;
  l: Loop;
  listi: number;

  constructor() {
    this.ret = {done: true, value: undefined};
    this.done = true;
    (this.f as Face | undefined) = undefined;
  }

  reset(face) {
    this.f = face;
    this.done = false;
    this.listi = 0;
    this.l = face.lists[0].l;

    return this;
  }

  finish(): void {
    if (!this.done) {
      this.done = true;
      this.ret.value = undefined;
      this.ret.done = true;
      (this.f as Face | undefined) = undefined;
      (this.l as Loop | undefined) = undefined;

      fiter_stack_e.cur = Math.max(fiter_stack_e.cur - 1, 0);
    }
  }

  next(): IteratorResult<Edge> {
    let ret = this.ret;

    if (this.listi >= this.f.lists.length) {
      ret.done = true;
      ret.value = undefined;
      this.finish();

      return ret;
    }

    let list = this.f.lists[this.listi];

    ret.value = this.l.e;
    ret.done = false;

    if (this.l === list.l.prev) {
      this.listi++;

      //fetch loop for next time
      if (this.listi < this.f.lists.length) {
        this.l = this.f.lists[this.listi].l;
      } else {
        /* XXX: Why is this undefined assignment here? */
        (this.l as Loop | undefined) = undefined;
      }
    } else {
      this.l = this.l.next;
    }

    return ret;
  }

  return(): IteratorResult<Edge> {
    this.finish();
    return this.ret;
  }

  [Symbol.iterator](): this {
    return this;
  }
}

fiter_stack_e = new MeshIterStack<FaceEdgeIter>(1024);
for (let i = 0; i < fiter_stack_e.length; i++) {
  fiter_stack_e[i] = new FaceEdgeIter();
}
fiter_stack_e.cur = 0;

class FaceVertIterProxy extends ReusableIter<Vertex> {
  f: Face;

  constructor() {
    super();

    this.f = undefined;
  }

  reset(f: Face): this {
    this.f = f;

    return this;
  }

  [Symbol.iterator](): FaceVertIter {
    return fiter_stack_v[fiter_stack_v.cur++].reset(this.f);
  }
}

fiter_stack_v_ring = util.cachering.fromConstructor<FaceVertIterProxy>(FaceVertIterProxy, 4196);

class FaceVertIter {
  ret: IteratorResult<Vertex> = {done: true, value: undefined};
  done: boolean;
  f: Face;
  l: Loop;
  listi: number;

  constructor() {
    this.ret = {done: true, value: undefined};
    this.done = true;
    (this.f as Face | undefined) = undefined;
    (this.l as Loop | undefined) = undefined;
  }

  reset(face: Face): this {
    this.f = face;
    this.done = false;
    this.listi = 0;
    this.l = face.lists[0].l;

    return this;
  }

  finish(): void {
    if (!this.done) {
      this.done = true;
      this.ret.value = undefined;
      this.ret.done = true;
      this.l = undefined;

      fiter_stack_v.cur = Math.max(fiter_stack_v.cur - 1, 0);
    }
  }

  next(): IteratorResult<Vertex> {
    let ret = this.ret;

    if (this.listi >= this.f.lists.length) {
      ret.done = true;
      ret.value = undefined;
      this.finish();

      return ret;
    }

    let list = this.f.lists[this.listi];

    ret.value = this.l.v;
    ret.done = false;

    if (this.l === list.l.prev) {
      this.listi++;

      /* Fetch loop for next time. */
      if (this.listi < this.f.lists.length) {
        this.l = this.f.lists[this.listi].l;
      } else {
        /* XXX why? */
        (this.l as Loop | undefined) = undefined;
      }
    } else {
      this.l = this.l.next;
    }

    return ret;
  }

  return(): IteratorResult<Vertex> {
    this.finish();
    return this.ret;
  }

  [Symbol.iterator](): this {
    return this;
  }
}

fiter_stack_v = new MeshIterStack<FaceVertIter>(1024);
for (let i = 0; i < fiter_stack_v.length; i++) {
  fiter_stack_v[i] = new FaceVertIter();
}
fiter_stack_v.cur = 0;

export class Face extends Element {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Face {
  lists : array(mesh.LoopList);
  cent  : vec3;
  no    : vec3;
}`);

  lists: LoopList[];
  iterflag: number;
  area: number;
  no: Vector3;
  cent: Vector3;

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

  ensureBoundaryFirst() {
    let maxlist, maxlen;

    for (let list of this.lists) {
      let len = 0.0;

      for (let l of list) {
        len += l.v.co.vectorDistance(l.next.v.co);
      }

      if (!maxlist || len > maxlen) {
        maxlist = list;
        maxlen = len;
      }
    }

    let i = this.lists.indexOf(maxlist);

    if (i !== 0) {
      this.lists[i] = this.lists[0];
      this.lists[0] = maxlist;
    }

    return this;
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

  calcNormal(cd_disp: CDRef<DispLayerVert> = -1): Vector3 {
    let t1 = calc_normal_temps.next(), t2 = calc_normal_temps.next();
    let t3 = calc_normal_temps.next(), sum = calc_normal_temps.next();

    sum.zero();

    this.calcCent(cd_disp);

    let c = this.cent;

    let _i = 0;
    let l = this.lists[0].l;
    do {
      let v1 = l.v, v2 = l.next.v;
      let co1, co2;

      if (cd_disp >= 0) {
        co1 = v1.customData.get<DispLayerVert>(cd_disp).worldco;
        co2 = v2.customData.get<DispLayerVert>(cd_disp).worldco;
      } else {
        co1 = v1.co;
        co2 = v2.co;
      }

      t1.load(co1).sub(c);
      t2.load(co2).sub(c);

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

  calcCent(cd_disp: CDRef<DispLayerVert> = -1): Vector3 {
    this.cent.zero();
    let tot = 0.0;

    if (this.lists.length === 0) {
      return this.cent.zero();
    }

    for (let l of this.lists[0]) {
      let co = l.v.co;

      if (cd_disp >= 0) {
        co = l.v.customData.get<DispLayerVert>(cd_disp).worldco;
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
