/*
 * Warning: this API is particularly old.
 **/

import * as webgl from './webgl.js';
import {
  Vector2, BaseVector, Vector3, Vector4,
  Quat, Matrix4, util, math, nstructjs
} from '../path.ux/scripts/pathux.js'
import {ShaderProgram} from "./webgl.js";
import './const.js';
import {Shaders, loadShader} from '../shaders/shaders.js';
import {INumberList} from "../util/polyfill";
import {RenderBuffer} from "./webgl.js";

export enum PrimitiveTypes {
  NONE = 0,
  POINTS = 1,
  LINES = 2,
  TRIS = 4,
  ADVANCED_LINES = 8,
  ALL = 1 | 2 | 4 | 8
};

export enum LayerTypes {
  LOC = 1,
  UV = 2,
  COLOR = 4,
  NORMAL = 8,
  ID = 16,
  CUSTOM = 32,
  INDEX = 64
}

export const LayerTypeNames = {
  [LayerTypes.LOC]: "position",
  [LayerTypes.UV]: "uv",
  [LayerTypes.COLOR]: "color",
  [LayerTypes.ID]: "id",
  [LayerTypes.NORMAL]: "normal",
  [LayerTypes.CUSTOM]: "custom"
};

let _TypeSizes = {
  LOC: 3,
  UV: 2,
  COLOR: 4,
  NORMAL: 3,
  ID: 1,
  CUSTOM: 4,
  INDEX: 1
};

export const TypeSizes = {};

for (let k in LayerTypes) {
  TypeSizes[LayerTypes[k]] = TypeSizes[k] = _TypeSizes[k];
}

let line2_temp4s = util.cachering.fromConstructor(Vector4, 64);
let line2_stripuvs = [
  [1, 0],
  [-1, 0],
  [-1, 1],

  [1, 0],
  [-1, 1],
  [1, 1],
];

function appendvec(a, b, n, defaultval) {
  if (defaultval === undefined)
    defaultval = 0.0;

  for (let i = 0; i < n; i++) {
    let val = b[i];
    a.push(val === undefined ? defaultval : val);
  }
}

let _ids_arrs = [[0], [0], [0], [0]];
let zero = new Vector3();

function copyvec(a, b, starti, n, defaultval) {
  if (defaultval === undefined)
    defaultval = 0.0;

  for (let i = starti; i < starti + n; i++) {
    let val = b[i];
    a[i] = val === undefined ? defaultval : val;
  }
}

export class TriEditor {
  mesh: SimpleIsland;
  i: number;

  constructor() {
    this.mesh = undefined;
    this.i = 0
  }

  bind(mesh: SimpleIsland, i: number): this {
    this.mesh = mesh;
    this.i = i;

    return this;
  }

  colors(c1, c2, c3): this {
    let data = this.mesh.tri_colors;
    let i = this.i * 3; //*3 is because triangles have three vertices

    data.copy(i, c1);
    data.copy(i + 1, c2);
    data.copy(i + 2, c3);

    return this;
  }

  normals(n1: INumberList, n2: INumberList, n3: INumberList): this {
    let data = this.mesh.tri_normals

    let i = this.i * 3; //*3 is because triangles have three vertices

    data.copy(i, n1);
    data.copy(i + 1, n2);
    data.copy(i + 2, n3);

    return this;
  }

  custom(layeri: number, v1: INumberList, v2: INumberList, v3: INumberList): this {
    let layer = this.mesh.layers.layers[layeri];

    let i = this.i * 3;
    layer.copy(i, v1);
    layer.copy(i + 1, v2);
    layer.copy(i + 2, v3);

    return this;
  }

  uvs(u1: INumberList, u2: INumberList, u3: INumberList): this {
    let data = this.mesh.tri_uvs
    let i = this.i * 3; //*3 is because triangles have three vertices

    data.copy(i, u1);
    data.copy(i + 1, u2);
    data.copy(i + 2, u3);

    return this;
  }

  ids(i1: number, i2: number, i3: number): this {
    if (i1 === undefined || i2 === undefined || i3 === undefined) {
      throw new Error("i1/i2/i3 cannot be undefined");
    }

    let data = this.mesh.tri_ids
    let i = this.i * 3; //*3 is because triangles have three vertices

    _ids_arrs[0][0] = i1;
    let a1 = _ids_arrs[0];
    _ids_arrs[1][0] = i2;
    let a2 = _ids_arrs[1];
    _ids_arrs[2][0] = i3;
    let a3 = _ids_arrs[2];

    data.copy(i, a1);
    data.copy(i + 1, a2);
    data.copy(i + 2, a3);

    return this;
  }
}

export class QuadEditor {
  t1: TriEditor;
  t2: TriEditor;

  constructor() {
    this.t1 = new TriEditor();
    this.t2 = new TriEditor();
  }

  bind(island: SimpleIsland, i: number, i2: number): this {
    this.t1.bind(island, i);
    this.t2.bind(island, i2);

    return this;
  }

  uvs(u1: INumberList, u2: INumberList, u3: INumberList, u4: INumberList) {
    this.t1.uvs(u1, u2, u3);
    this.t2.uvs(u1, u3, u4);

    return this;
  }

  custom(li: number, v1: INumberList, v2: INumberList, v3: INumberList, v4: INumberList) {
    this.t1.custom(li, v1, v2, v3);
    this.t2.custom(li, v1, v3, v4);
  }

  colors(u1: INumberList, u2: INumberList, u3: INumberList, u4: INumberList) {
    this.t1.colors(u1, u2, u3);
    this.t2.colors(u1, u3, u4);

    return this;
  }

  normals(u1: INumberList, u2: INumberList, u3: INumberList, u4: INumberList) {
    this.t1.normals(u1, u2, u3);
    this.t2.normals(u1, u3, u4);

    return this;
  }

  ids(u1: number, u2: number, u3: number, u4: number) {
    this.t1.ids(u1, u2, u3);
    this.t2.ids(u1, u3, u4);

    return this;
  }
}

export class LineEditor {
  mesh: SimpleIsland;
  i: number;

  constructor() {
    this.mesh = undefined;
    this.i = 0;
  }

  bind(mesh: SimpleIsland, i: number): this {
    this.mesh = mesh;
    this.i = i;
    return this;
  }

  colors(c1: INumberList, c2: INumberList): this {
    let data = this.mesh.line_colors;
    let i = this.i * 2;

    data.copy(i, c1);
    data.copy(i + 1, c2);

    return this;
  }

  custom(layeri: number, v1: INumberList, v2: INumberList): this {
    let layer = this.mesh.layers.layers[layeri];

    let i = this.i * 2;
    layer.copy(i, v1);
    layer.copy(i + 1, v2);

    return this;
  }

  normals(c1: INumberList, c2: INumberList): this {
    let data = this.mesh.line_normals;
    let i = this.i * 2;

    data.copy(i, c1);
    data.copy(i + 1, c2);

    return this;
  }

  uvs(c1: INumberList, c2: INumberList): this {
    let data = this.mesh.line_uvs;
    let i = this.i * 2;

    data.copy(i, c1);
    data.copy(i + 1, c2);

    return this;
  }

  ids(i1: number, i2: number): this {
    if (i1 === undefined || i2 === undefined) {
      throw new Error("i1 i2 cannot be undefined");
    }

    let data = this.mesh.line_ids;
    let i = this.i * 2;

    _ids_arrs[0][0] = i1;
    _ids_arrs[1][0] = i2;

    data.copy(i, _ids_arrs[0]);
    data.copy(i + 1, _ids_arrs[1]);

    return this;
  }
}

class DummyEditor {
  colors() {
    return this
  }

  ids() {
    return this
  }

  normals() {
    return this
  }

  custom() {
    return this
  }

  tangent() {
    return this
  }

  uvs() {
    return this
  }
}

let dummyeditor = new DummyEditor();

export class LineEditor2 {
  mesh: SimpleIsland;
  i: number;

  constructor() {
    this.mesh = undefined;
    this.i = 0;
  }

  bind(mesh: SimpleIsland, i: number): this {
    this.mesh = mesh;
    this.i = i;
    return this;
  }

  custom(layeri: number, c1: INumberList, c2: INumberList): this {
    let data = this.mesh.layers.layers[layeri];

    let i = this.i * 6;

    data.copy(i + 0, c1);
    data.copy(i + 1, c1);
    data.copy(i + 2, c2);
    data.copy(i + 3, c1);
    data.copy(i + 4, c2);
    data.copy(i + 5, c2);

    return this;
  }

  colors(c1: INumberList, c2: INumberList): this {
    let data = this.mesh.line_colors2;
    let i = this.i * 6;

    data.copy(i + 0, c1);
    data.copy(i + 1, c1);
    data.copy(i + 2, c2);
    data.copy(i + 3, c1);
    data.copy(i + 4, c2);
    data.copy(i + 5, c2);

    return this;
  }

  normals(c1: INumberList, c2: INumberList): this {
    let data = this.mesh.line_normals2;
    let i = this.i * 6;

    data.copy(i + 0, c1);
    data.copy(i + 1, c1);
    data.copy(i + 2, c2);
    data.copy(i + 3, c1);
    data.copy(i + 4, c2);
    data.copy(i + 5, c2);

    return this;
  }

  uvs(c1: INumberList, c2: INumberList): this {
    let data = this.mesh.line_uvs2;
    let i = this.i * 6;

    data.copy(i + 0, c1);
    data.copy(i + 1, c1);
    data.copy(i + 2, c2);
    data.copy(i + 3, c1);
    data.copy(i + 4, c2);
    data.copy(i + 5, c2);

    return this;
  }

  ids(i1: number, i2: number): this {
    if (i1 === undefined || i2 === undefined) {
      throw new Error("i1 i2 cannot be undefined");
    }

    let data = this.mesh.line_ids2;
    let i = this.i * 6;

    let c1 = _ids_arrs[0];
    let c2 = _ids_arrs[1];

    c1[0] = i1;
    c2[0] = i2;

    data.copy(i + 0, c1);
    data.copy(i + 1, c1);
    data.copy(i + 2, c2);
    data.copy(i + 3, c1);
    data.copy(i + 4, c2);
    data.copy(i + 5, c2);

    return this;
  }
}

export class PointEditor {
  mesh: SimpleIsland;
  i: number;

  constructor() {
    this.mesh = undefined;
    this.i = 0;
  }

  bind(mesh: SimpleIsland, i: number): this {
    this.mesh = mesh;
    this.i = i;
    return this;
  }

  colors(c1: INumberList): this {
    let data = this.mesh.point_colors;
    let i = this.i;

    data.copy(i, c1);

    return this;
  }

  normals(c1: INumberList): this {
    let data = this.mesh.point_normals;
    let i = this.i;

    data.copy(i, c1);

    return this;
  }

  uvs(c1: INumberList): this {
    let data = this.mesh.point_uvs;
    let i = this.i;

    data.copy(i, c1);

    return this;
  }

  ids(i1: number): this {
    if (i1 === undefined) {
      throw new Error("i1 cannot be undefined");
    }

    let data = this.mesh.point_ids;
    let i = this.i;

    _ids_arrs[0][0] = i1;
    data.copy(i, _ids_arrs[0]);

    return this;
  }
}

export const glTypeSizes = {
  5126: 4, //gl.FLOAT
  5120: 1, //gl.BYTE
  5121: 1, //gl.UNSIGNED_BYTE
  5123: 2, //gl.UNSIGNED_SHORT
  5122: 2, //gl.SHORT
  5124: 4, //gl.INT
  5125: 4, //gl.UNSIGNED_INT
}
export const glTypeArrays = {
  5126: Float32Array, //gl.FLOAT
  5120: Int8Array, //gl.BYTE
  5121: Uint8Array, //gl.UNSIGNED_BYTE
  5122: Int16Array, //gl.SHORT
  5123: Uint16Array, //gl.UNSIGNED_SHORT
  5124: Int32Array, //gl.INT
  5125: Uint32Array, //gl.UNSIGNED_INT
}

export const glTypeArrayMuls = {
  5126: 1, //gl.FLOAT
  5120: 127, //gl.BYTE
  5121: 255, //gl.UNSIGNED_BYTE
  5123: 65535, //gl.UNSIGNED_SHORT
  5122: 32767, //gl.SHORT
  5124: 1, //gl.INT
  5125: 1, //gl.UNSIGNED_INT
};

const glSizes = {
  FLOAT: 5126,
  BYTE: 5120,
  UNSIGNED_BYTE: 5121,
  SHORT: 5122,
  UNSIGNED_SHORT: 5123,
  INT: 5124,
  UNSIGNED_INT: 5125
};
const glRanges = {
  [glSizes.FLOAT]: [-1e17, 1e17],
  [glSizes.UNSIGNED_SHORT]: [0, 65535],
  [glSizes.SHORT]: [-32767, 32767],
  [glSizes.BYTE]: [-127, 127],
  [glSizes.UNSIGNED_BYTE]: [0, 255],
  [glSizes.UNSIGNED_INT]: [0, (1 << 32) - 1],
  [glSizes.INT]: [-((1 << 31) - 1), (1 << 31) - 1],
};

let dmap = new WeakSet();

function debugproxy(data, min = -1e17, max = 1e17, isint) {
  if (dmap.has(data)) {
    data.debug.min = min;
    data.isint = isint;
    data.debug.max = max;
    return data.debug.proxy;
  }

  dmap.add(data);

  function validate(target, prop) {
    if (typeof prop === "string") {
      prop = parseFloat(prop);
    }

    let bad = prop !== ~~prop;
    bad = bad || isNaN(prop) || !isFinite(prop);
    bad = bad || prop < 0 || prop >= data.length;

    if (bad) {
      console.log(target, prop)
      throw new Error("bad prop " + prop);
    }

    return prop;
  }

  let debug = {
    min, max, isint
  };

  let proxy = new Proxy(data, {
    get(target, prop, rc) {
      prop = validate(target, prop);

      return target[prop];
    },

    set(target, prop, val) {
      prop = validate(target, prop);

      let bad = typeof val !== "number";
      bad = bad || val < debug.min || val > debug.max;
      bad = bad || isNaN(val) || !isFinite(val);
      bad = bad || (1 && val !== ~~val);

      if (bad) {
        console.log(val, target, prop, debug.min, debug.max);
        throw new Error("bad value " + val);
      }

      target[prop] = val;

      return true;
    }
  })

  data.debug = debug;
  data.debug.proxy = proxy;

  return proxy;
}

const GL_ARRAY_BUFFER = 34962;
const GL_ELEMENT_ARRAY_BUFFER = 34963;
const GL_STATIC_DRAW = 35044;

export class GeoLayer extends Array {
  index?: number;
  glSize: number;
  glSizeMul: number;
  glReady: boolean;
  type: number;
  _useTypedData: boolean;
  data: number[];
  data_f32: Float32Array | number[];
  dataUsed: number;
  f32Ready: boolean;
  normalized: boolean;
  size: number;
  name: string;
  primflag: number;
  bufferKey?: string;
  idx: number;
  id?: number;

  bufferType: number;
  bufferHint: number;

  constructor(size: number, name: string, primflag: number, type: number, idx: number) { //idx is for different layers of same type, e.g. multiple uv layers
    super();

    this.index = undefined;

    this.glSize = 5126; //gl.FLOAT
    this.glSizeMul = 1.0;
    this.glReady = false;

    this.type = type;
    this.data = [];
    this._useTypedData = false; //make v8's optimizer happy by not assinging .data

    this.dataUsed = 0;
    this.data_f32 = [];

    this.f32Ready = false;
    this.normalized = false;

    this.bufferType = GL_ARRAY_BUFFER;
    this.bufferHint = GL_STATIC_DRAW;

    this.size = size;
    this.name = name;

    this.primflag = primflag;
    this.bufferKey = undefined;
    this.idx = idx;
    this.id = undefined;
  }

  /*
  get dataUsed() {
    return this._dataUsed;
  }

  set dataUsed(v) {
    if (!v) {
      console.warn(LayerTypeNames[this.type])
    }

    this._dataUsed = v;
  }*/

  _getWriteData() {
    return this._useTypedData ? this.data_f32 : this.data;
  }

  setGLSize(size: number): this {
    this.glSize = size;
    this.glSizeMul = glTypeArrayMuls[size];

    return this;
  }

  setNormalized(state: boolean) {
    this.normalized = !!state;
    return this;
  }

  reset() {
    this.glReady = false;
    //this._useTypedData = false;
    //this.f32Ready = false;
    this.dataUsed = 0;
    return this;
  }

  extend(data: INumberList, count = 1) {
    for (let i = 0; i < count; i++) {
      this.extendIntern(data, i * this.size);
    }
  }

  private extendIntern(data: INumberList, dataStart: number) {
    if (this._useTypedData && this.dataUsed >= this.data_f32.length) {
      if (window.DEBUG.simplemesh) {
        console.warn("Resizing simplemesh attribute after conversion to a typed array");
      }

      this._useTypedData = false;
      this.data = new Array(this.data_f32.length);

      let a = this.data;
      let b = this.data_f32;

      for (let i = 0; i < a.length; i++) {
        a[i] = b[i];
      }

      this.data_f32 = [];
    }

    let bad = isNaN(this.dataUsed) || this.dataUsed !== ~~this.dataUsed || this.dataUsed < 0;
    bad = bad || isNaN(this.size) || isNaN(this.data.length) || this.size <= 0 || this.data.length < 0;

    if (bad) {
      throw new Error("dataUsed NaN error " + this.dataUsed);
    }

    let size = this.size;
    let starti = this.dataUsed;

    this.f32Ready = this._useTypedData;
    this.dataUsed += size;

    if (!this._useTypedData && this.dataUsed > this.data.length) {
      /*
        //v8's optimizer hates this:
        for (let i=0; i<tot; i++) {
          this.data.push(0);
        }//*/

      //according to ES spec this is valid:

      this.data.length = ~~(this.dataUsed * 1.5);
    }

    if (data !== undefined) {
      this.copy(~~(starti / this.size), data, 1, dataStart);
    }

    return this;
  }

  setCount(count: number, dirty = false) {
    if (isNaN(count)) {
      throw new Error("count was NaN");
    }

    count *= this.size;

    if (dirty) {
      this.glReady = false;
    }

    this.dataUsed = count;
    let data = this._useTypedData ? this.data_f32 : this.data;

    if (this.dataUsed !== data.length) {
      if (!this._useTypedData) {
        if (this.data.length < this.dataUsed) {
          this.data.length = this.dataUsed;
          this.glReady = false;
        }

        this.f32Ready = false;
      } else {
        if (window.DEBUG && window.DEBUG.simplemesh) {
          console.log("simpleisland is converting back to simple array", count, this.data_f32.length, this.dataUsed);
        }

        let len = this.dataUsed;

        this.data = new Array(len);

        let a = this.data;
        let b = this.data_f32;

        for (let i = 0; i < b.length; i++) {
          a[i] = b[i];
        }

        this.data.length = this.dataUsed;

        this.glReady = false;
        this._useTypedData = false;
        this.f32Ready = false;
      }
    }
  }

  _copy2Typed(data1: INumberList, data2: INumberList, n: number, mul: number, start: number, dataStart: number) {
    for (let i = 0; i < n; i++) {
      data1[start++] = ~~(data2[dataStart + i] * mul);
    }
  }

  _copy2(data1: INumberList, data2: INumberList, n: number, mul: number, start: number, dataStart: number) {
    for (let i = 0; i < n; i++) {
      data1[start++] = ~~(data2[dataStart + i] * mul);
    }
  }

  _copy_int(i: number, data: INumberList, n = 1, dataStart = 0) {
    let tot = n * this.size;
    this.f32Ready = false;

    i *= this.size;
    let thisdata;
    let mul = this.glSizeMul;

    //let di = 0;
    //let end = i + tot;

    if (this._useTypedData) {
      thisdata = this.data_f32;
    } else {
      thisdata = this.data;
    }

    if (window.DEBUG.simplemesh) {
      let range = glRanges[this.glSize];
      thisdata = debugproxy(thisdata, range[0], range[1], this.glSize !== glSizes.FLOAT);
    }

    if (this._useTypedData) {
      this._copy2Typed(thisdata, data, tot, mul, i, dataStart);
    } else {
      this._copy2(thisdata, data, tot, mul, i, dataStart);
    }

    /*
    while (i < end) {
      thisdata[i] = ~~(data[di]*mul);
      di++;
      i++;
    }*/

    return this;
  }


  /** i and n will be multiplied by .size, dataStart will not */
  copy(i: number, data: INumberList, n = 1, dataStart = 0) {
    //V8's optimizer doesn't like it if we pass floats
    //to integer typed arrays, even if we multiply them by
    //the proper range scale first.  They must be truncated.
    if (this.glSizeMul !== 1) {
      return this._copy_int(i, data, n, dataStart);
    }

    let tot = n * this.size;

    this.f32Ready = this._useTypedData;

    i *= this.size;
    let thisdata;

    if (this._useTypedData) {
      thisdata = this.data_f32;
    } else {
      thisdata = this.data;
    }

    if (i >= this.dataUsed) {// || i + tot > this.data.length) {
      throw new Error("eek!");
      return;
    }

    if (isNaN(i)) {
      throw new Error("NaN!");
    }

    let di = dataStart;
    let end = i + tot;

    while (i < end) {
      thisdata[i] = data[di];
      di++;
      i++;
    }

    return this;
  }

  [Symbol.keystr]() {
    return "" + this.id;
  }
}

export class GeoLayerMeta {
  type: number;
  primflag: number;
  layers: GeoLayer[];
  normalized: boolean;
  attrsizes: { [k: string]: number };

  constructor(primflag: number, type: number, attrsizes: { [k: string]: number }) {
    this.type = type;
    this.primflag = primflag;
    this.layers = [];
    this.normalized = false;

    this.attrsizes = attrsizes;
  }

  add(layer: GeoLayer) {
    this.layers.push(layer);

    if (this.attrsizes[LayerTypeNames[layer.type]] === undefined) {
      this.attrsizes[LayerTypeNames[layer.type]] = 0;
    } else {
      this.attrsizes[LayerTypeNames[layer.type]]++;
    }
  }
}

function get_meta_mask(primflag: number, type: number): number {
  return type | (primflag << 16);
}

let _debug_idgen = 0;

export class GeoLayerManager {
  layers: GeoLayer[];
  has_multilayers: boolean;
  _debug_id: number;
  layer_meta: Map<number, GeoLayerMeta>;
  layer_idgen: util.IDGen;
  attrsizes: Map<number, { [k: string]: number }>;

  constructor() {
    this.layers = [];
    //this.layers_prim_map = new

    this.has_multilayers = false;

    this._debug_id = _debug_idgen++;

    this.layer_meta = new Map();
    this.layer_idgen = new util.IDGen();

    this.attrsizes = new Map(); //maps primitive types to attribute size maps
  }

  reset() {
    for (let [key, meta] of this.layer_meta) {
      for (let l of meta.layers) {
        l.reset();
      }
    }

    return this;
  }

  copy() {
    let ret = new GeoLayerManager();

    ret.layer_idgen = this.layer_idgen.copy();
    ret.has_multilayers = this.has_multilayers;

    for (let key of this.layer_meta.keys()) {
      let meta = this.layer_meta.get(key);
      let meta2 = ret.get_meta(meta.primflag, meta.type);

      for (let layer of meta.layers) {
        let layer2 = new GeoLayer(layer.size, layer.name, layer.primflag, layer.type, layer.idx);

        layer2.data.length = layer.data.length;
        layer2.dataUsed = layer.dataUsed;

        layer2._useTypedData = layer._useTypedData;

        layer2.glSize = layer.glSize;
        layer2.glSizeMul = layer.glSizeMul;
        layer2.id = layer.id;
        layer2.index = layer.index;
        layer2.bufferKey = layer.bufferKey;
        layer2.normalized = layer.normalized;

        let a = layer.data;
        let b = layer2.data;
        let len = layer.dataUsed;

        if (layer._useTypedData) {
          layer2.data_f32 = layer.data_f32.slice(0, layer.data_f32.length);
        } else {
          layer2.data = layer.data.slice(0, layer.data.length);
        }

        meta2.layers.push(layer2);
        ret.layers.push(layer2);
      }
    }

    return ret;
  }

  get_meta(primflag: number, type: number): GeoLayerMeta {
    let mask = get_meta_mask(primflag, type);

    if (!this.layer_meta.has(mask)) {
      let attrsizes = {};
      this.attrsizes.set(primflag, attrsizes);

      this.layer_meta.set(mask, new GeoLayerMeta(primflag, type, attrsizes));
    }

    return this.layer_meta.get(mask);
  }

  [Symbol.iterator]() {
    return this.layers[Symbol.iterator]();
  }

  extend(primflag: PrimitiveTypes, type: number, data: INumberList, count = 1): this {
    let meta = this.get_meta(primflag, type);

    for (let i = 0; i < meta.layers.length; i++) {
      meta.layers[i].extend(data, count);
    }

    return this;
  }

  layerCount(primflag: PrimitiveTypes, type: number): number {
    return this.get_meta(primflag, type).layers.length;
  }

  pushLayer(name: string, primflag: number, type: number, size: number): GeoLayer {
    let meta = this.get_meta(primflag, type);
    let idx = meta.layers.length;

    let layer = new GeoLayer(size, name, primflag, type, idx);

    layer.id = this.layer_idgen.next();
    layer.index = this.layers.length;
    layer.primflag = primflag;
    layer.bufferKey = layer.name + ":" + layer.id;

    this.layers.push(layer);
    meta.add(layer);

    layer.normalized = meta.normalized;

    return layer;
  }


  get(name: string, primflag: number, type: number, size?: number, idx?: number): GeoLayer {
    if (size === undefined) {
      size = TypeSizes[type];
    }

    if (idx > 0) {
      this.has_multilayers = true;
    }

    let meta = this.get_meta(primflag, type);

    if (type === LayerTypes.CUSTOM) {
      for (let layer of meta.layers) {
        if (layer.name === name) {
          return layer;
        }
      }
    } else {
      idx = idx === undefined ? 0 : idx;

      if (idx < meta.layers.length) {
        return meta.layers[idx];
      }
    }

    return this.pushLayer(name, primflag, type, size);
  }
}

let _default_uv = [0, 0];
let _default_color = [0, 0, 0, 1];
let _default_normal = [0, 0, 1];
let _default_id = [-1];

export class SimpleIsland {
  gl: WebGL2RenderingContext
  layers: GeoLayerManager;
  _glAttrs: { [k: string]: number };
  primflag: number;
  mesh: SimpleMesh;
  totpoint: number;
  totline: number;
  tottri: number;
  totline_tristrip: number;

  tri_editors: util.cachering<TriEditor>;
  quad_editors: util.cachering<QuadEditor>;
  line_editors: util.cachering<LineEditor>;
  tristrip_line_editors: util.cachering<LineEditor2>;
  point_editors: util.cachering<PointEditor>;

  regen: boolean;
  _regen_all: PrimitiveTypes;

  indexedMode: boolean;
  layerflag: LayerTypes;

  buffer: RenderBuffer;
  program: any;
  textures: any[];
  uniforms: any;
  _uniforms_temp: any;

  constructor(mesh: SimpleMesh) {
    let lay = this.layers = new GeoLayerManager();

    this._glAttrs = {};

    this.primflag = undefined;  //if undefined, will get from this.mesh.primflag

    this.mesh = mesh;

    this.makeBufferAliases();

    this.totpoint = 0;
    this.totline = 0;
    this.tottri = 0;
    this.totline_tristrip = 0;

    this.indexedMode = undefined; //inherited from mesh
    this.layerflag = undefined;

    this.regen = true;
    this._regen_all = 0;

    this.tri_editors = util.cachering.fromConstructor(TriEditor, 32, true);
    this.quad_editors = util.cachering.fromConstructor(QuadEditor, 32, true);
    this.line_editors = util.cachering.fromConstructor(LineEditor, 32, true);
    this.point_editors = util.cachering.fromConstructor(PointEditor, 32, true);

    this.tristrip_line_editors = util.cachering.fromConstructor(LineEditor2, 32, true);

    this.buffer = new RenderBuffer();
    this.program = undefined;

    this.textures = [];
    this.uniforms = {};
    this._uniforms_temp = {};
  }

  reset(gl: WebGL2RenderingContext): void {
    this.layers.reset();
    this.buffer.reset(gl);

    this.tottri = this.totline = this.totpoint = this.totline_tristrip = 0;
    this.regen = true;
  }

  getIndexedMode(): boolean {
    if (this.indexedMode !== undefined) {
      return this.indexedMode;
    } else {
      return this.mesh.indexedMode;
    }
  }

  setPrimitiveCount(primtype: PrimitiveTypes, tot: number): this {
    switch (primtype) {
      case PrimitiveTypes.TRIS:
        this.tottri = tot;
        tot *= 3;
        break;
      case PrimitiveTypes.LINES:
        this.totline = tot;
        tot *= 2;
        break;
      case PrimitiveTypes.ADVANCED_LINES:
        this.totline_tristrip = tot;
        tot *= 6;
        break;
      case PrimitiveTypes.POINTS:
        this.totpoint = tot;
        break;
    }

    let lf = this.layerflag ? this.layerflag : this.mesh.layerflag;

    for (let layer of this.layers.layers) {
      if (layer.primflag !== primtype || !(layer.type & lf)) {
        continue;
      }

      layer.setCount(tot);
    }

    return this;
  }

  tri_cos: GeoLayer;
  tri_normals: GeoLayer;
  tri_uvs: GeoLayer;
  tri_colors: GeoLayer;
  tri_ids: GeoLayer;

  line_cos: GeoLayer;
  line_normals: GeoLayer;
  line_uvs: GeoLayer;
  line_colors: GeoLayer;
  line_ids: GeoLayer;

  line_cos2: GeoLayer;
  line_normals2: GeoLayer;
  line_uvs2: GeoLayer;
  line_colors2: GeoLayer;
  line_ids2: GeoLayer;

  point_cos: GeoLayer;
  point_normals: GeoLayer;
  point_uvs: GeoLayer;
  point_colors: GeoLayer;
  point_ids: GeoLayer;

  line_stripuvs: GeoLayer;
  line_stripdirs: GeoLayer;

  makeBufferAliases(): void {
    let lay = this.layers;

    let pflag = PrimitiveTypes.TRIS;
    this.tri_cos = lay.get("tri_cos", pflag, LayerTypes.LOC); //array
    this.tri_normals = lay.get("tri_normals", pflag, LayerTypes.NORMAL).setGLSize(glSizes.SHORT).setNormalized(true); //array
    this.tri_uvs = lay.get("tri_uvs", pflag, LayerTypes.UV).setGLSize(glSizes.SHORT).setNormalized(true); //array
    this.tri_colors = lay.get("tri_colors", pflag, LayerTypes.COLOR).setGLSize(glSizes.UNSIGNED_BYTE).setNormalized(true); //array
    this.tri_ids = lay.get("tri_ids", pflag, LayerTypes.ID); //array

    pflag = PrimitiveTypes.LINES;
    this.line_cos = lay.get("line_cos", pflag, LayerTypes.LOC); //array
    this.line_normals = lay.get("line_normals", pflag, LayerTypes.NORMAL).setGLSize(glSizes.SHORT).setNormalized(true); //array
    this.line_uvs = lay.get("line_uvs", pflag, LayerTypes.UV).setGLSize(glSizes.SHORT).setNormalized(true); //array
    this.line_colors = lay.get("line_colors", pflag, LayerTypes.COLOR).setGLSize(glSizes.UNSIGNED_BYTE).setNormalized(true); //array
    this.line_ids = lay.get("line_ids", pflag, LayerTypes.ID); //array

    pflag = PrimitiveTypes.POINTS;
    this.point_cos = lay.get("point_cos", pflag, LayerTypes.LOC); //array
    this.point_normals = lay.get("point_normals", pflag, LayerTypes.NORMAL).setGLSize(glSizes.SHORT).setNormalized(true); //array
    this.point_uvs = lay.get("point_uvs", pflag, LayerTypes.UV).setGLSize(glSizes.SHORT).setNormalized(true); //array
    this.point_colors = lay.get("point_colors", pflag, LayerTypes.COLOR).setGLSize(glSizes.UNSIGNED_BYTE).setNormalized(true); //array
    this.point_ids = lay.get("point_ids", pflag, LayerTypes.ID); //array

    if (this.primflag & PrimitiveTypes.ADVANCED_LINES) {
      pflag = PrimitiveTypes.ADVANCED_LINES;

      this.line_cos2 = lay.get("line_cos2", pflag, LayerTypes.LOC); //array
      this.line_normals2 = lay.get("line_normals2", pflag, LayerTypes.NORMAL).setGLSize(glSizes.SHORT).setNormalized(true); //array
      this.line_uvs2 = lay.get("line_uvs2", pflag, LayerTypes.UV).setGLSize(glSizes.SHORT).setNormalized(true);
      this.line_colors2 = lay.get("line_colors2", pflag, LayerTypes.COLOR).setGLSize(glSizes.UNSIGNED_BYTE).setNormalized(true);
      this.line_ids2 = lay.get("line_ids2", pflag, LayerTypes.ID); //array

      this.line_stripuvs = this.getDataLayer(PrimitiveTypes.ADVANCED_LINES, LayerTypes.CUSTOM, 2, "_strip_uv");
      this.line_stripdirs = this.getDataLayer(PrimitiveTypes.ADVANCED_LINES, LayerTypes.CUSTOM, 4, "_strip_dir");
      this.line_stripdirs.normalized = false;
    }
  }

  copy(): SimpleIsland {
    let ret = new SimpleIsland(this.mesh);

    ret.primflag = this.primflag;
    ret.layerflag = this.layerflag;

    ret.totline = this.totline;
    ret.tottri = this.tottri;
    ret.totpoint = this.totpoint;

    for (let k in this.uniforms) {
      ret.uniforms[k] = this.uniforms[k];
    }

    for (let tex of this.textures) {
      ret.textures.push(tex);
    }

    ret.program = this.program;
    ret.layers = this.layers.copy();
    ret.regen = true;

    ret.makeBufferAliases();

    return ret;
  }

  glFlagUploadAll(primflag: PrimitiveTypes = PrimitiveTypes.ALL): void {
    this._regen_all |= primflag;
  }

  point(v1: INumberList): PointEditor {
    this.point_cos.extend(v1);

    this._newElem(PrimitiveTypes.POINTS, 1);

    this.totpoint++;
    return this.point_editors.next().bind(this, this.totpoint - 1);
  }

  smoothline(v1: INumberList, v2: INumberList, w1 = 2, w2 = 2): LineEditor2 {
    let dv = 0.0;
    for (let i = 0; i < 3; i++) {
      dv += (v1[i] - v2[i]) * (v1[i] - v2[i]);
    }

    if (!this.line_cos2) {
      this.regen = true;
      this.primflag |= PrimitiveTypes.ADVANCED_LINES;

      if (this.layerflag !== undefined) {
        this.layerflag |= LayerTypes.CUSTOM;
      } else {
        this.mesh.layerflag |= LayerTypes.CUSTOM;
      }

      this.makeBufferAliases();
    }

    let li = this.line_cos2.dataUsed;

    this.line_cos2.extend(v1);
    this.line_cos2.extend(v1);
    this.line_cos2.extend(v2);

    this.line_cos2.extend(v1);
    this.line_cos2.extend(v2);
    this.line_cos2.extend(v2);

    let data = this.line_cos2._getWriteData();
    if (dv === 0.0) {
      while (li < this.line_cos2.dataUsed) {
        data[li++] += Math.random() * 0.001;
      }
    }


    this._newElem(PrimitiveTypes.ADVANCED_LINES, 6);

    let i = this.totline_tristrip * 6;

    this.line_stripuvs.copy(i, line2_stripuvs[0]);
    this.line_stripuvs.copy(i + 1, line2_stripuvs[1]);
    this.line_stripuvs.copy(i + 2, line2_stripuvs[2]);
    this.line_stripuvs.copy(i + 3, line2_stripuvs[3]);
    this.line_stripuvs.copy(i + 4, line2_stripuvs[4]);
    this.line_stripuvs.copy(i + 5, line2_stripuvs[5]);

    let d = line2_temp4s.next().load(v2).sub(v1 as unknown as Vector4);
    d[3] = 0.0;
    d.normalize();

    d[3] = w1;
    this.line_stripdirs.copy(i, d);
    this.line_stripdirs.copy(i + 1, d);
    d[3] = w2;
    this.line_stripdirs.copy(i + 2, d);

    d[3] = w1;
    this.line_stripdirs.copy(i + 3, d);
    d[3] = w2;
    this.line_stripdirs.copy(i + 4, d);
    this.line_stripdirs.copy(i + 5, d);

    this.totline_tristrip++;

    return this.tristrip_line_editors.next().bind(this, this.totline_tristrip - 1);
  }

  line(v1: INumberList, v2: INumberList): LineEditor {
    //return this.smoothline(v1, v2);

    this.line_cos.extend(v1);
    this.line_cos.extend(v2);

    this._newElem(PrimitiveTypes.LINES, 2);

    this.totline++;
    return this.line_editors.next().bind(this, this.totline - 1);
  }

  _newElem(primtype: PrimitiveTypes, primcount: number): number {
    let layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    let meta = this.layers.get_meta(primtype, LayerTypes.LOC);
    let start = meta.layers[0].dataUsed / meta.layers[0].size;

    for (let j = 0; j < primcount; j++) {
      if (layerflag & LayerTypes.UV) {
        this.layers.extend(primtype, LayerTypes.UV, _default_uv);
      }

      if (layerflag & LayerTypes.CUSTOM) {
        this.layers.extend(primtype, LayerTypes.CUSTOM, _default_uv);
      }

      if (layerflag & LayerTypes.COLOR) {
        this.layers.extend(primtype, LayerTypes.COLOR, _default_color);
      }

      if (layerflag & LayerTypes.NORMAL) {
        this.layers.extend(primtype, LayerTypes.NORMAL, _default_normal);
      }

      if (layerflag & LayerTypes.ID) {
        this.layers.extend(primtype, LayerTypes.ID, _default_id);
      }
    }

    return start;
  }

  tri(v1: INumberList, v2: INumberList, v3: INumberList): TriEditor {
    this.tri_cos.extend(v1);
    this.tri_cos.extend(v2);
    this.tri_cos.extend(v3);

    this._newElem(PrimitiveTypes.TRIS, 3);

    this.tottri++;

    return this.tri_editors.next().bind(this, this.tottri - 1);
  }

  quad(v1: INumberList, v2: INumberList, v3: INumberList, v4: INumberList): QuadEditor {
    let i = this.tottri;

    this.tri(v1, v2, v3);
    this.tri(v1, v3, v4);

    return this.quad_editors.next().bind(this, i, i + 1);
  }

  destroy(gl: WebGL2RenderingContext): void {
    this.buffer.destroy(gl);
    this.regen = true;
  }

  gen_buffers(gl: WebGL2RenderingContext): void {
    let layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    let allflag = this._regen_all;
    this._regen_all = 0;

    //convert all layers to final typedarrays to save memory, even ones that aren't used
    for (let layer of this.layers) {
      if (layer.dataUsed === 0) {
        continue;
      }

      if (layer._useTypedData && !layer.f32Ready) {
        layer.f32Ready = true;
      }

      if (!layer.f32Ready) {
        layer.f32Ready = true;

        let typedarray = glTypeArrays[layer.glSize];

        if (!layer.data_f32 || layer.data_f32.length !== layer.dataUsed) {
          if (window.DEBUG.simplemesh) {
            console.warn("new layer data", layer.data_f32, layer);
          }

          layer.data_f32 = new typedarray(layer.dataUsed);
        }

        let a = layer.data;
        let b = layer.data_f32;

        let count = layer.dataUsed;

        layer.data.length = layer.dataUsed;
        (layer.data_f32 as unknown as Float32Array).set(layer.data);

        layer._useTypedData = true;
        layer.data = [];
        layer.glReady = false;
      }

      if (layer.glReady && layer.dataUsed !== layer.data_f32.length) {
        throw new Error("simplemesh error");
      }
    }

    for (let layer of this.layers) {
      if (layer.glReady && !(allflag & layer.primflag)) {
        continue;
      }

      if (layer.dataUsed === 0 || !(layer.type & layerflag)) {
        continue;
      }

      //custom layers have their own attribute names
      if (layer.type !== LayerTypes.CUSTOM) {
        this._glAttrs[LayerTypeNames[layer.type]] = 1;
      }

      //console.log(layer.bufferKey, layer.dataUsed, layer.data_f32.length, layer.bufferType, layer.data_f32);

      let vbo = this.buffer.get(gl, layer.bufferKey, layer.bufferType);
      vbo.uploadData(gl, layer.data_f32 as Float32Array, layer.bufferType, layer.bufferHint);
      layer.glReady = true;
    }
  }

  getIndexBuffer(ptype: PrimitiveTypes): GeoLayer {
    let key = "";

    switch (ptype) {
      case PrimitiveTypes.TRIS:
        key = "tri";
        break;
      case PrimitiveTypes.LINES:
        key = "line";
        break;
      case PrimitiveTypes.POINTS:
        key = "point";
        break;
    }

    key += "_indices";

    if (!this[key]) {
      let layer = this[key] = this.layers.get(key, ptype, LayerTypes.INDEX);

      layer.size = 1;
      layer.glSizeMul = 1;
      layer.glSize = glSizes.UNSIGNED_SHORT;
      layer.normalized = false;
      layer.bufferType = GL_ELEMENT_ARRAY_BUFFER;
    }

    return (this as unknown as any)[key] as unknown as GeoLayer;
  }

  _draw_tris(gl: WebGL2RenderingContext, uniforms: any, params: any, program?: ShaderProgram): void {
    if (this.tottri) {
      this.bindArrays(gl, uniforms, program, "tri", PrimitiveTypes.TRIS);

      if (this.getIndexedMode()) {
        let idx = this.getIndexBuffer(PrimitiveTypes.TRIS);

        if (!idx) {
          console.warn("Missing index layer", this);
          return;
        }

        let vbo = this.buffer.get(gl, idx.bufferKey, idx.bufferType);
        let buf = vbo.get(gl);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
        gl.drawElements(gl.TRIANGLES, this.tottri * 3, gl.UNSIGNED_SHORT, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, this.tottri * 3);
      }
    }
  }

  _draw_line_tristrips(gl: WebGL2RenderingContext, uniforms: any, params: any, program?: ShaderProgram): void {
    let attrs = this._glAttrs;

    if (this.totline_tristrip) {
      //program = Shaders.LineTriStripShader;
      //program.bind(gl, uniforms);

      if (!(program as unknown as any)._smoothline) {
        let uniforms2 = Object.assign({}, uniforms);
        let attributes = new Set(program.attrs);

        attributes.add("_strip_dir");
        attributes.add("_strip_uv");

        let vertex = program.vertexSource;
        let fragment = program.fragmentSource;

        vertex = ShaderProgram.insertDefine(`
#ifndef SMOOTH_LINE
#define SMOOTH_LINE
#endif
        `, vertex);
        fragment = ShaderProgram.insertDefine(`
#ifndef SMOOTH_LINE
#define SMOOTH_LINE
#endif
        `, fragment);

        let sdef = {
          vertex, fragment, uniforms: uniforms2, attributes
        };

        (program as unknown as any)._smoothline = loadShader(gl, sdef);
        //console.warn("Auto-generating smooth line shader");
        //let sdef = {
        //vertexProgram :
        //}
        //program._smoothline = loadShader(gl, sdef);
      }

      //program = Shaders.LineTriStripShader;
      program = (program as unknown as any)._smoothline as ShaderProgram;
      program.bind(gl, uniforms, attrs);

      this.bindArrays(gl, uniforms, program, "line2", PrimitiveTypes.ADVANCED_LINES);
      gl.drawArrays(gl.TRIANGLES, 0, this.totline_tristrip * 6);

      //gl.drawArrays(gl.LINES, 0, this.totline_tristrip*2);
    }
  }

  flagRecalc(): this {
    for (let layer of this.layers) {
      layer.f32Ready = false;
    }

    this.regen = true;

    return this;
  }

  bindArrays(gl: WebGL2RenderingContext, uniforms: any, program: ShaderProgram | undefined, key: string, primflag: PrimitiveTypes): void {
    program = program === undefined ? this.program : program;
    program = program === undefined ? this.mesh.program : program;
    let layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    if (program && !program.program) {
      //program.checkCompile(gl, uniforms);
      let attrs = this._glAttrs;
      program.bind(gl, uniforms, attrs);
    }

    if (!program) {
      return;
    }

    let maxattrib = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

    for (let i = 0; i < maxattrib; i++) {
      gl.disableVertexAttribArray(i);
    }

    let li = 0;
    let layer = this.layers.get_meta(primflag, LayerTypes.LOC).layers[0];

    if (layer.dataUsed === 0) {
      return;
    }

    let buf = this.buffer.get(gl, layer.bufferKey, layer.bufferType).get(gl);

    let btype = gl.ARRAY_BUFFER;
    if (this.getIndexedMode()) {
      //btype = gl.ELEMENT_ARRAY_BUFFER;
    }

    gl.bindBuffer(btype, buf);
    gl.vertexAttribPointer(0, layer.size, layer.glSize, false, 0, 0);
    gl.enableVertexAttribArray(0);

    let bindArray = (name, type) => {
      if (!(layerflag & type) || (type & LayerTypes.INDEX)) {
        return;
      }

      let meta = this.layers.get_meta(primflag, type);
      if (!meta.layers.length) {
        //gl.disableVertexAttribArray(li);
        li++;
        return;
      } else {
        for (let i = 0; i < meta.layers.length; i++) {
          let layer = meta.layers[i];
          let count;
          let mli = i;

          if (layer.dataUsed === 0) {
            continue;
          }

          if (type === LayerTypes.CUSTOM) {
            name = layer.name;
            count = 0;

            for (let j = 0; j < meta.layers.length; j++) {
              if (j === i) {
                break;
              }

              if (meta.layers[j].type === LayerTypes.CUSTOM && meta.layers[j].name === name) {
                count++;
              }
            }

            mli = count;
          }

          let key = ShaderProgram.multiLayerAttrKey(name, mli);

          let vbo = this.buffer.get(gl, layer.bufferKey, layer.bufferType);
          let buf = vbo.get(gl);

          li = program.attrLoc(key);
          if (li < 0) {
            continue;
          }

          gl.enableVertexAttribArray(li);
          gl.bindBuffer(btype, buf);

          gl.vertexAttribPointer(li, layer.size, layer.glSize, layer.normalized, 0, 0);
        }
      }
    }

    bindArray("normal", LayerTypes.NORMAL);
    bindArray("uv", LayerTypes.UV);
    bindArray("color", LayerTypes.COLOR);
    bindArray("id", LayerTypes.ID);
    bindArray("custom", LayerTypes.CUSTOM);
  }

  addDataLayer(primflag: PrimitiveTypes, type: number, size = TypeSizes[type], name = LayerTypeNames[type]) {
    this._glAttrs[name] = 1;

    return this.layers.pushLayer(name, primflag, type, size);
  }

  getDataLayer(primflag: PrimitiveTypes, type: number, size = TypeSizes[type], name = LayerTypeNames[type]) {
    this._glAttrs[name] = 1;

    return this.layers.get(name, primflag, type, size);
  }

  _draw_points(gl: WebGL2RenderingContext, uniforms: any, params: any, program?: ShaderProgram): void {
    if (this.totpoint > 0) {
      //console.log(this.totpoint, this.point_cos);
      this.bindArrays(gl, uniforms, program, "point", PrimitiveTypes.POINTS);
      gl.drawArrays(gl.POINTS, 0, this.totpoint);
    } else {
      console.log("no geometry");
    }
  }

  _draw_lines(gl: WebGL2RenderingContext, uniforms: any, params: any, program?: ShaderProgram): void {
    if (this.totline === 0) {
      return;
    }

    if (this.getIndexedMode()) {
      let idx = this.getIndexBuffer(PrimitiveTypes.LINES);
      //reuse tri vert arrays in indexed mode
      this.bindArrays(gl, uniforms, program, "tris", PrimitiveTypes.TRIS);

      if (!idx) {
        console.warn("Missing index layer", this);
        return;
      }

      let vbo = this.buffer.get(gl, idx.bufferKey, idx.bufferType);
      let buf = vbo.get(gl);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
      gl.drawElements(gl.LINES, this.totline * 2, gl.UNSIGNED_SHORT, 0);
    } else {
      this.bindArrays(gl, uniforms, program, "line", PrimitiveTypes.LINES);
      gl.drawArrays(gl.LINES, 0, this.totline * 2);
    }
  }

  onContextLost(e: any): void {
    this.regen = true;
  }

  draw(gl: WebGL2RenderingContext, uniforms: any, params: any, program_override?: ShaderProgram): void {
    this.gl = gl;

    let program = this.program === undefined ? this.mesh.program : this.program;
    let primflag = this.primflag === undefined ? this.mesh.primflag : this.primflag;

    if (program_override !== undefined) {
      program = program_override;
    }

    if (this.regen) {
      this.regen = false;
      this.gen_buffers(gl);
    }

    if (uniforms === undefined) {
      for (let k in this._uniforms_temp) {
        delete this._uniforms_temp[k];
      }

      uniforms = this._uniforms_temp;
    }

    for (let k in this.uniforms) {
      if (!(k in uniforms)) {
        uniforms[k] = this.uniforms[k];
      }
    }

    for (let k in this.mesh.uniforms) {
      if (!(k in uniforms)) {
        uniforms[k] = this.mesh.uniforms[k];
      }
    }

    if (program === undefined)
      program = (gl as unknown as any).simple_shader as ShaderProgram;

    let attrs = this._glAttrs;

    if (!this.layers.has_multilayers) {
      program.bind(gl, uniforms, attrs);
    }

    if (this.tottri && (primflag & PrimitiveTypes.TRIS)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.TRIS), attrs);
      }

      this._draw_tris(gl, uniforms, params, program);
    }

    if (this.totline && (primflag & PrimitiveTypes.LINES)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.LINES), attrs);
      }
      this._draw_lines(gl, uniforms, params, program);
    }

    if (this.totpoint && (primflag & PrimitiveTypes.POINTS)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.POINTS), attrs);
      }
      this._draw_points(gl, uniforms, params, program);
    }

    if (this.totline_tristrip && (primflag & PrimitiveTypes.ADVANCED_LINES)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.ADVANCED_LINES), attrs);
      }
      this._draw_line_tristrips(gl, uniforms, params, program);
    }


    //if (gl.getError()) {
    //  this.regen = 1;
    //}
  }
}

export class SimpleMesh {
  program: ShaderProgram;
  layerflag: LayerTypes;
  primflag: PrimitiveTypes;
  indexedMode: boolean;
  gl: WebGL2RenderingContext | undefined;
  islands: SimpleIsland[];
  uniforms: any;
  island: SimpleIsland;

  constructor(layerflag = LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV) {
    this.layerflag = layerflag;
    this.primflag = PrimitiveTypes.ALL;
    this.indexedMode = false;

    this.gl = undefined;

    this.islands = [];
    this.uniforms = {};

    this.add_island();
    this.island = this.islands[0];
  }

  reset(gl: WebGL2RenderingContext) {
    for (let island of this.islands) {
      island.reset(gl);
    }
  }

  flagRecalc() {
    for (let island of this.islands) {
      island.flagRecalc();
    }
  }

  getDataLayer(primflag: PrimitiveTypes, type: number, size = TypeSizes[type], name = LayerTypeNames[type]): GeoLayer | undefined {
    let ret;

    for (let island of this.islands) {
      let ret2 = island.getDataLayer(primflag, type, size, name);

      if (island === this.island) {
        ret = ret2;
      }
    }

    return ret;
  }

  addDataLayer(primflag: PrimitiveTypes, type: number, size = TypeSizes[type], name = LayerTypeNames[type]): GeoLayer {
    let ret;

    for (let island of this.islands) {
      let ret2 = island.addDataLayer(primflag, type, size, name);

      if (island === this.island) {
        ret = ret2;
      }
    }

    return ret;
  }

  copy(): SimpleMesh {
    let ret = new SimpleMesh();

    ret.primflag = this.primflag;
    ret.layerflag = this.layerflag;

    for (let k in this.uniforms) {
      ret.uniforms[k] = this.uniforms[k];
    }

    for (let island of this.islands) {
      let island2 = island.copy();

      island2.mesh = ret;
      ret.islands.push(island2);

      if (island === this.island) {
        ret.island = island2;
      }
    }

    return ret;
  }

  add_island(): SimpleIsland {
    let island = new SimpleIsland(this);

    this.island = island;

    this.islands.push(island);
    return island;
  }

  destroy(gl = this.gl!) {
    //XXX bad use of global variable
    if (this.gl === undefined && window._appstate) {
      gl = window._appstate.gl;
    }

    if (!gl) {
      console.warn("failed to destroy a mesh");
      return;
    }
    for (let island of this.islands) {
      island.destroy(gl);
    }
  }

  tri(v1: INumberList, v2: INumberList, v3: INumberList): TriEditor {
    return this.island.tri(v1, v2, v3);
  }

  quad(v1: INumberList, v2: INumberList, v3: INumberList, v4: INumberList): QuadEditor {
    return this.island.quad(v1, v2, v3, v4);
  }

  line(v1: INumberList, v2: INumberList): LineEditor {
    return this.island.line(v1, v2);
  }

  point(v1: INumberList): PointEditor {
    return this.island.point(v1);
  }

  smoothline(v1: INumberList, v2: INumberList): LineEditor2 {
    return this.island.smoothline(v1, v2);
  }

  drawLines(gl: WebGL2RenderingContext, uniforms: any, program_override?: ShaderProgram): void {
    for (let island of this.islands) {
      let primflag = island.primflag;

      island.primflag = PrimitiveTypes.LINES | PrimitiveTypes.ADVANCED_LINES;
      island.draw(gl, uniforms, undefined, program_override);
      island.primflag = primflag;
    }
  }

  draw(gl: WebGL2RenderingContext, uniforms: any, program_override?: ShaderProgram): void {
    this.gl = gl;

    for (let island of this.islands) {
      island.draw(gl, uniforms, undefined, program_override);
    }
  }
}

interface IIDMap {
  set(key: number, val: number);

  get(key: number): number | undefined;

  has(key: number): boolean

  delete(key: number): boolean;

  keys(): Iterable<number>;

  values(): Iterable<number>;

  [Symbol.iterator](): Iterator<[number, number]>
}

export class ChunkedSimpleMesh extends SimpleMesh {
  idmap: IIDMap;
  chunksize: number;
  freelist: number[];
  freeset: Set<number>;
  chunkmap: IIDMap;
  idgen: number;
  regen: boolean;

  quad_editors: util.cachering<QuadEditor>;

  constructor(layerflag = LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV,
              chunksize = 2048) {
    super(layerflag);

    this.chunksize = chunksize;
    this.islands = [];
    this.uniforms = {};

    this.primflag = PrimitiveTypes.TRIS;

    this.island = undefined;

    this.quad_editors = util.cachering.fromConstructor(QuadEditor, 32, true);

    this.freelist = [];
    this.freeset = new Set();

    this.chunkmap = new util.IDMap();
    this.idmap = new util.IDMap();
    this.idgen = 0;
  }

  reset(gl: WebGL2RenderingContext): void {
    this.chunkmap = new util.IDMap();
    this.idmap = new util.IDMap();
    this.freelist.length = 0;
    this.freeset = new Set();

    for (let island of this.islands) {
      island.reset(gl);
    }
  }

  free(id: number): void {
    let chunk = this.chunkmap.get(id);

    if (chunk === undefined || this.freeset.has(id)) {
      return;
    }

    this.freelist.push(chunk);
    this.freelist.push(id);

    this.freeset.add(id);

    let island = this.islands[chunk];
    let i = this.idmap.get(id);
    //console.log("free", id, chunk);

    //if (this.primflag & PrimitiveTypes.POINTS) {
    island.point_cos.copy(i, zero);
    //}
    //if (this.primflag & PrimitiveTypes.LINES) {
    island.line_cos.copy(i * 2, zero);
    island.line_cos.copy(i * 2 + 1, zero);
    //}
    //if (this.primflag & PrimitiveTypes.TRIS) {
    island.tri_cos.copy(i * 3, zero);
    island.tri_cos.copy(i * 3 + 1, zero);
    island.tri_cos.copy(i * 3 + 2, zero);
    //}

    island.flagRecalc();
  }

  get_chunk(id) {
    if (id > 1 << 18 && this.idmap instanceof util.IDMap) {
      let idmap = new Map();

      for (let [k, v] of this.idmap) {
        idmap.set(k, v);
      }

      this.idmap = idmap;

      let chunkmap = new Map();
      for (let [k, v] of this.chunkmap) {
        chunkmap.set(k, v);
      }

      this.chunkmap = chunkmap;
    }
    /*
    if (this.islands.length === 0) {
      this.add_island();
    }
    let island = this.islands;
    if (island._i === undefined) {
      island._i = 0;
    }
    island.primflag = this.primflag;
    this.idmap.set(id, island._i++);
    return this.islands[0];

    */

    if (this.chunkmap.has(id)) {
      return this.islands[this.chunkmap.get(id)];
    }

    if (this.freelist.length > 0) {
      let id2 = this.freelist.pop();
      let chunk = this.freelist.pop();

      this.chunkmap.set(id, chunk);
      this.idmap.set(id, id2);

      return this.islands[chunk];
    }

    let chunki = this.islands.length;
    let chunk = this.add_island();
    chunk.primflag = this.primflag;

    for (let i = 0; i < this.chunksize; i++) {
      this.freelist.push(chunki);
      this.freelist.push(this.chunksize - i - 1);
      chunk.tri(zero, zero, zero);
    }

    return this.get_chunk(id);
  }


  onContextLost(e) {
    for (let island of this.islands) {
      island.onContextLost(e);
    }
  }

  destroy(gl) {
    for (let island of this.islands) {
      island.destroy(gl);
    }

    this.regen = true;
    this.chunkmap = new util.IDMap();
    this.idmap = new util.IDMap();
    this.freelist.length = 0;

    this.islands.length = 0;
    this.add_island();
  }

  // @ts-ignore
  tri(id: number, v1: INumberList, v2: INumberList, v3: INumberList): TriEditor {
    if (0) {
      function isvec(v) {
        if (!v) {
          return false;
        }
        let ret = typeof v.length === "number";
        ret = ret && v.length >= 3;

        ret = ret && typeof v[0] === "number";
        ret = ret && typeof v[1] === "number";
        ret = ret && typeof v[2] === "number";

        return ret;
      }

      let bad = typeof id !== "number";
      bad = bad || Math.floor(id) !== id;
      bad = bad || !isvec(v1);
      bad = bad || !isvec(v2);
      bad = bad || !isvec(v3);

      if (bad) {
        throw new Error("bad parameters");
      }
    }

    let chunk = this.get_chunk(id);
    let itri = this.idmap.get(id);

    chunk.flagRecalc();
    chunk.glFlagUploadAll(PrimitiveTypes.TRIS);

    let tri_cos = chunk.tri_cos;

    let i = itri * 9;

    if (tri_cos.dataUsed < i + 9) {
      chunk.regen = 1;

      return chunk.tri(v1, v2, v3);
    } else {
      tri_cos.glReady = false;
      tri_cos = tri_cos._getWriteData();

      tri_cos[i++] = v1[0];
      tri_cos[i++] = v1[1];
      tri_cos[i++] = v1[2];

      tri_cos[i++] = v2[0];
      tri_cos[i++] = v2[1];
      tri_cos[i++] = v2[2];

      tri_cos[i++] = v3[0];
      tri_cos[i++] = v3[1];
      tri_cos[i++] = v3[2];

      if (i > tri_cos.length) {
        console.log(i, tri_cos.length, tri_cos);
        throw new Error("range error");
      }
    }

    chunk.regen = 1;
    return chunk.tri_editors.next().bind(chunk, itri);
  }

  quad(v1: INumberList, v2: INumberList, v3: INumberList, v4: INumberList): QuadEditor {
    throw new Error("unsupported for chunked meshes");
  }

  // @ts-ignore
  smoothline(id: number, v1: INumberList, v2: INumberList): LineEditor2 {
    let chunk = this.get_chunk(id);
    let iline = this.idmap.get(id);

    chunk.flagRecalc();
    chunk.glFlagUploadAll(PrimitiveTypes.ADVANCED_LINES);

    if (!chunk.line_cos2) {
      chunk.primflag |= PrimitiveTypes.ADVANCED_LINES;
      this.layerflag |= LayerTypes.CUSTOM;
      chunk.makeBufferAliases()
    }

    let line_cos = chunk.line_cos2;
    let i = iline * 18;

    if (line_cos.dataUsed < i + 18) {
      let ret = chunk.smoothline(v1, v2);

      iline = ret.i;
      this.idmap.set(id, iline);

      return ret;
    } else {
      line_cos = line_cos._getWriteData();

      line_cos[i++] = v1[0];
      line_cos[i++] = v1[1];
      line_cos[i++] = v1[2];

      line_cos[i++] = v1[0];
      line_cos[i++] = v1[1];
      line_cos[i++] = v1[2];

      line_cos[i++] = v2[0];
      line_cos[i++] = v2[1];
      line_cos[i++] = v2[2];

      line_cos[i++] = v1[0];
      line_cos[i++] = v1[1];
      line_cos[i++] = v1[2];

      line_cos[i++] = v2[0];
      line_cos[i++] = v2[1];
      line_cos[i++] = v2[2];

      line_cos[i++] = v2[0];
      line_cos[i++] = v2[1];
      line_cos[i++] = v2[2];

      if (i > line_cos.length) {
        console.log(i, line_cos.length, line_cos);
        throw new Error("range error");
      }
    }

    chunk.regen = 1;
    return chunk.tristrip_line_editors.next().bind(chunk, iline);
  }

  // @ts-ignore
  line(id: number, v1: INumberList, v2: INumberList): LineEditor {
    //return this.smoothline(id, v1, v2);

    let chunk = this.get_chunk(id);
    let iline = this.idmap.get(id);

    chunk.flagRecalc();
    chunk.glFlagUploadAll(PrimitiveTypes.LINES);

    let line_cos = chunk.line_cos;
    let i = iline * 6;

    if (line_cos.dataUsed < i + 6) {
      chunk.line(v1, v2);
    } else {
      line_cos = line_cos._getWriteData();
      line_cos[i++] = v1[0];
      line_cos[i++] = v1[1];
      line_cos[i++] = v1[2];
      line_cos[i++] = v2[0];
      line_cos[i++] = v2[1];
      line_cos[i++] = v2[2];

      if (i > line_cos.length) {
        console.log(i, line_cos.length, line_cos);
        throw new Error("range error");
      }
    }

    chunk.regen = 1;
    return chunk.line_editors.next().bind(chunk, iline);
  }

  // @ts-ignore
  point(id: number, v1: INumberList): PointEditor {
    let chunk = this.get_chunk(id);
    let ipoint = this.idmap.get(id);

    chunk.flagRecalc();
    chunk.glFlagUploadAll(PrimitiveTypes.POINTS);

    let point_cos = chunk.point_cos;
    let i = ipoint * 3;

    if (point_cos.dataUsed < i + 3) {
      chunk.point(v1);
    } else {
      point_cos = point_cos._getWriteData();
      point_cos[i++] = v1[0];
      point_cos[i++] = v1[1];
      point_cos[i++] = v1[2];

      if (i > point_cos.length) {
        console.log(i, point_cos.length, point_cos);
        throw new Error("range error");
      }
    }

    chunk.regen = 1;
    return chunk.point_editors.next().bind(chunk, ipoint);
  }

  draw(gl: WebGL2RenderingContext, uniforms: any, program_override?: ShaderProgram): void {
    this.gl = gl;

    for (let island of this.islands) {
      island.draw(gl, uniforms, undefined, program_override);
    }
  }
}

