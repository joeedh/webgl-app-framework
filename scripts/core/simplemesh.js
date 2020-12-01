import * as util from '../util/util.js';
import * as math from '../util/math.js';
import * as webgl from './webgl.js';
import {Vector2, BaseVector, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {ShaderProgram} from "./webgl.js";

//let Map = util.map;
var RenderBuffer = webgl.RenderBuffer;

export const PrimitiveTypes = {
  POINTS: 1,
  LINES : 2,
  TRIS  : 4,
  ALL   : 1 | 2 | 4
};

export const LayerTypes = {
  LOC   : 1,
  UV    : 2,
  COLOR : 4,
  NORMAL: 8,
  ID    : 16,
  CUSTOM: 32
}

export const LayerTypeNames = {
  [LayerTypes.LOC]   : "position",
  [LayerTypes.UV]    : "uv",
  [LayerTypes.COLOR] : "color",
  [LayerTypes.ID]    : "id",
  [LayerTypes.NORMAL]: "normal",
  [LayerTypes.CUSTOM]: "custom"
};

let _TypeSizes = {
  LOC   : 3,
  UV    : 2,
  COLOR : 4,
  NORMAL: 3,
  ID    : 1,
  CUSTOM: 4
};

export const TypeSizes = {};

for (var k in LayerTypes) {
  TypeSizes[LayerTypes[k]] = TypeSizes[k] = _TypeSizes[k];
}

function appendvec(a, b, n, defaultval) {
  if (defaultval === undefined)
    defaultval = 0.0;

  for (var i = 0; i < n; i++) {
    let val = b[i];
    a.push(val === undefined ? defaultval : val);
  }
}

var _ids_arrs = [[0], [0], [0], [0]];
let zero = new Vector3();

function copyvec(a, b, starti, n, defaultval) {
  if (defaultval === undefined)
    defaultval = 0.0;

  for (var i = starti; i < starti + n; i++) {
    let val = b[i];
    a[i] = val === undefined ? defaultval : val;
  }
}

export class TriEditor {
  constructor() {
    this.mesh = undefined;
    this.i = 0
  }

  bind(mesh, i) {
    this.mesh = mesh;
    this.i = i;

    return this;
  }

  colors(c1, c2, c3) {
    let data = this.mesh.tri_colors;
    let i = this.i*3; //*3 is because triangles have three vertices

    data.copy(i, c1);
    data.copy(i + 1, c2);
    data.copy(i + 2, c3);

    return this;
  }

  normals(n1, n2, n3) {
    let data = this.mesh.tri_normals

    let i = this.i*3; //*3 is because triangles have three vertices

    data.copy(i, n1);
    data.copy(i + 1, n2);
    data.copy(i + 2, n3);

    return this;
  }

  custom(layer, v1, v2, v3) {
    let i = this.i*3;
    layer.copy(i, v1);
    layer.copy(i + 1, v2);
    layer.copy(i + 2, v3);

    return this;
  }

  uvs(u1, u2, u3) {
    let data = this.mesh.tri_uvs
    let i = this.i*3; //*3 is because triangles have three vertices

    data.copy(i, u1);
    data.copy(i + 1, u2);
    data.copy(i + 2, u3);

    return this;
  }

  ids(i1, i2, i3) {
    if (i1 === undefined || i2 === undefined || i3 === undefined) {
      throw new Error("i1/i2/i3 cannot be undefined");
    }

    let data = this.mesh.tri_ids
    let i = this.i*3; //*3 is because triangles have three vertices

    _ids_arrs[0][0] = i1, i1 = _ids_arrs[0];
    _ids_arrs[1][0] = i2, i2 = _ids_arrs[1];
    _ids_arrs[2][0] = i3, i3 = _ids_arrs[2];

    data.copy(i, i1);
    data.copy(i + 1, i2);
    data.copy(i + 2, i3);

    return this;
  }
}

export class QuadEditor {
  constructor() {
    this.t1 = new TriEditor();
    this.t2 = new TriEditor();
  }

  bind(mesh, i, i2) {
    this.t1.bind(mesh, i);
    this.t2.bind(mesh, i2);

    return this;
  }

  uvs(u1, u2, u3, u4) {
    this.t1.uvs(u1, u2, u3);
    this.t2.uvs(u1, u3, u4);

    return this;
  }

  colors(u1, u2, u3, u4) {
    this.t1.colors(u1, u2, u3);
    this.t2.colors(u1, u3, u4);

    return this;
  }

  normals(u1, u2, u3, u4) {
    this.t1.normals(u1, u2, u3);
    this.t2.normals(u1, u3, u4);

    return this;
  }

  ids(u1, u2, u3, u4) {
    this.t1.ids(u1, u2, u3);
    this.t2.ids(u1, u3, u4);

    return this;
  }
}

export class LineEditor {
  constructor() {
    this.mesh = undefined;
    this.i = 0;
  }

  bind(mesh, i) {
    this.mesh = mesh;
    this.i = i;
    return this;
  }

  colors(c1, c2) {
    let data = this.mesh.line_colors;
    let i = this.i*2;

    data.copy(i, c1);
    data.copy(i + 1, c2);

    return this;
  }

  normals(c1, c2) {
    let data = this.mesh.line_normals;
    let i = this.i*2;

    data.copy(i, c1);
    data.copy(i + 1, c2);

    return this;
  }

  uvs(c1, c2) {
    let data = this.mesh.line_uvs;
    let i = this.i*2;

    data.copy(i, c1);
    data.copy(i + 1, c2);

    return this;
  }

  ids(i1, i2) {
    if (i1 === undefined || i2 === undefined) {
      throw new Error("i1 i2 cannot be undefined");
    }

    let data = this.mesh.line_ids;
    let i = this.i*2;

    _ids_arrs[0][0] = i1;
    _ids_arrs[1][0] = i2;

    data.copy(i, _ids_arrs[0]);
    data.copy(i + 1, _ids_arrs[1]);

    return this;
  }
}

export class PointEditor {
  constructor() {
    this.mesh = undefined;
    this.i = 0;
  }

  bind(mesh, i) {
    this.mesh = mesh;
    this.i = i;
    return this;
  }

  colors(c1) {
    let data = this.mesh.point_colors;
    let i = this.i;

    data.copy(i, c1);

    return this;
  }

  normals(c1) {
    let data = this.mesh.point_normals;
    let i = this.i;

    data.copy(i, c1);

    return this;
  }

  uvs(c1) {
    let data = this.mesh.point_uvs;
    let i = this.i;

    data.copy(i, c1);

    return this;
  }

  ids(i1) {
    if (i1 === undefined) {
      throw new Error("i1 cannot be undefined");
    }

    let data = this.mesh.point_ids;
    let i = this.i;

    _ids_arrs[0][0] = i1, i1 = _ids_arrs[0];

    data.copy(i, _ids_arrs[0]);

    return this;
  }
}

export class GeoLayer extends Array {
  constructor(size, name, primflag, type, idx) { //idx is for different layers of same type, e.g. multiple uv layers
    super();

    this.type = type;
    this.data = [];
    this.dataUsed = 0;
    this.data_f32 = [];

    this.f32Ready = false;
    this.normalized = false;

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

  reset() {
    this.f32Ready = false;
    this.dataUsed = 0;
  }

  extend(data) {
    let size = this.size;
    let starti = this.dataUsed;

    this.f32Ready = false;
    this.dataUsed += size;

    if (this.dataUsed > this.data.length) {
      /*
        //v8's optimizer hates this:
        for (var i=0; i<tot; i++) {
          this.data.push(0);
        }//*/

      //according to ES spec this is valid:

      this.data.length = this.dataUsed;
    }

    if (data !== undefined) {
      this.copy(~~(starti/this.size), data, 1);
    }

    return this;
  }

  //i and n will be multiplied by .size
  copy(i, data, n = 1) {
    let tot = n*this.size;
    this.f32Ready = false;

    i *= this.size;
    let thisdata = this.data;

    if (i >= this.dataUsed) {
      return;
    }

    let di = 0;
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
  constructor(primflag, type, attrsizes) {
    this.type = type;
    this.primflag = primflag;
    this.layers = [];
    this.normalized = false;

    this.attrsizes = attrsizes;
  }

  add(layer) {
    this.layers.push(layer);

    if (this.attrsizes[LayerTypeNames[layer.type]] === undefined) {
      this.attrsizes[LayerTypeNames[layer.type]] = 0;
    } else {
      this.attrsizes[LayerTypeNames[layer.type]]++;
    }
  }
}

function get_meta_mask(primflag, type) {
  return type | (primflag<<16);
}

let _debug_idgen = 0;

export class GeoLayerManager {
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

        layer2.id = layer.id;
        layer2.bufferKey = layer.bufferKey;
        layer2.normalized = layer.normalized;

        let a = layer.data;
        let b = layer2.data;
        let len = layer.dataUsed;

        for (let i = 0; i < len; i++) {
          b[i] = a[i];
        }

        meta2.layers.push(layer2);
        ret.layers.push(layer2);
      }
    }

    return ret;
  }

  get_meta(primflag, type) {
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

  extend(primflag, type, data) {
    let meta = this.get_meta(primflag, type);

    for (let i = 0; i < meta.layers.length; i++) {
      meta.layers[i].extend(data);
    }

    return this;
  }

  layerCount(primflag, type) {
    return this.get_meta(primflag, type).layers.length;
  }

  pushLayer(name, primflag, type, size) {
    let meta = this.get_meta(primflag, type);
    let idx = meta.layers.length;

    let layer = new GeoLayer(size, name, primflag, type, idx);

    layer.id = this.layer_idgen.next();
    layer.primflag = primflag;
    layer.bufferKey = layer.name + ":" + layer.id;

    this.layers.push(layer);
    meta.add(layer);

    layer.normalized = meta.normalized;

    return layer;
  }


  get(name, primflag, type, size, idx = 0) {
    if (size === undefined) {
      size = TypeSizes[type];
    }

    if (idx > 0) {
      this.has_multilayers = true;
    }

    let meta = this.get_meta(primflag, type);
    if (idx < meta.layers.length) {
      return meta.layers[idx];
    }

    if (idx === meta.layers.length) {
      return this.pushLayer(name, primflag, type, size, idx);
    } else {
      throw new Error("layer at idx doesn't exist, and there aren't enough previous layers to auto create it: " + idx);
    }
  }
}

var _default_uv = [0, 0];
var _default_color = [0, 0, 0, 1];
var _default_normal = [0, 0, 1];
var _default_id = [-1];

export class SimpleIsland {
  constructor(mesh) {
    let lay = this.layers = new GeoLayerManager();

    this.primflag = undefined;  //if undefined, will get from this.mesh.primflag

    this.mesh = mesh;

    this.makeBufferAliases();

    this.totpoint = 0;
    this.totline = 0;
    this.tottri = 0;

    this.layerflag = undefined;

    this.regen = 1;

    this.tri_editors = util.cachering.fromConstructor(TriEditor, 32);
    this.quad_editors = util.cachering.fromConstructor(QuadEditor, 32);
    this.line_editors = util.cachering.fromConstructor(LineEditor, 32);
    this.point_editors = util.cachering.fromConstructor(PointEditor, 32);

    this.buffer = new RenderBuffer();
    this.program = undefined;

    this.textures = [];
    this.uniforms = {};
    this._uniforms_temp = {};
  }

  reset(gl) {
    this.layers.reset();
    this.buffer.reset(gl);

    this.tottri = this.totline = this.totpoint = 0;
    this.regen = 1;
  }

  makeBufferAliases() {
    let lay = this.layers;

    lay.get_meta(PrimitiveTypes.TRIS, LayerTypes.NORMAL).normalized = true;
    lay.get_meta(PrimitiveTypes.LINES, LayerTypes.NORMAL).normalized = true;
    lay.get_meta(PrimitiveTypes.POINTS, LayerTypes.NORMAL).normalized = true;

    let pflag = PrimitiveTypes.TRIS;
    this.tri_cos = lay.get("tri_cos", pflag, LayerTypes.LOC); //array
    this.tri_normals = lay.get("tri_normals", pflag, LayerTypes.NORMAL); //array
    this.tri_uvs = lay.get("tri_uvs", pflag, LayerTypes.UV); //array
    this.tri_colors = lay.get("tri_colors", pflag, LayerTypes.COLOR); //array
    this.tri_ids = lay.get("tri_ids", pflag, LayerTypes.ID); //array

    pflag = PrimitiveTypes.LINES;
    this.line_cos = lay.get("line_cos", pflag, LayerTypes.LOC); //array
    this.line_normals = lay.get("line_normals", pflag, LayerTypes.NORMAL); //array
    this.line_uvs = lay.get("line_uvs", pflag, LayerTypes.UV); //array
    this.line_colors = lay.get("line_colors", pflag, LayerTypes.COLOR); //array
    this.line_ids = lay.get("line_ids", pflag, LayerTypes.ID); //array

    pflag = PrimitiveTypes.POINTS;
    this.point_cos = lay.get("point_cos", pflag, LayerTypes.LOC); //array
    this.point_normals = lay.get("point_normals", pflag, LayerTypes.NORMAL); //array
    this.point_uvs = lay.get("point_uvs", pflag, LayerTypes.UV); //array
    this.point_colors = lay.get("point_colors", pflag, LayerTypes.COLOR); //array
    this.point_ids = lay.get("point_ids", pflag, LayerTypes.ID); //array
  }

  copy() {
    let ret = new SimpleIsland();

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
    ret.regen = 1;

    ret.makeBufferAliases();

    return ret;
  }

  point(v1) {
    this.point_cos.extend(v1);

    this._newElem(PrimitiveTypes.POINTS, 1);

    this.totpoint++;
    return this.point_editors.next().bind(this, this.totpoint - 1);
  }

  line(v1, v2) {
    this.line_cos.extend(v1);
    this.line_cos.extend(v2);

    this._newElem(PrimitiveTypes.LINES, 2);

    this.totline++;
    return this.line_editors.next().bind(this, this.totline - 1);
  }

  _newElem(primtype, primcount) {
    let layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    let meta = this.layers.get_meta(primtype, LayerTypes.LOC);
    let start = meta.layers[0].dataUsed/meta.layers[0].size;

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

  tri(v1, v2, v3) {
    this.tri_cos.extend(v1);
    this.tri_cos.extend(v2);
    this.tri_cos.extend(v3);

    this._newElem(PrimitiveTypes.TRIS, 3);

    this.tottri++;

    return this.tri_editors.next().bind(this, this.tottri - 1);
  }

  quad(v1, v2, v3, v4) {
    let i = this.tottri;

    this.tri(v1, v2, v3);
    this.tri(v1, v3, v4);

    return this.quad_editors.next().bind(this, i, i + 1);
  }

  destroy(gl) {
    this.buffer.destroy(gl);
    this.regen = true;
  }

  gen_buffers(gl) {
    let layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    for (var layer of this.layers) {
      if (layer.dataUsed === 0 || !(layer.type & layerflag)) {
        continue;
      }

      if (!layer.f32Ready) {
        layer.f32Ready = true;

        if (!layer.data_f32 || layer.data_f32.length !== layer.dataUsed) {
          layer.data_f32 = new Float32Array(layer.dataUsed);
          console.log("new layer data");
        }

        let a = layer.data;
        let b = layer.data_f32;

        let count = layer.dataUsed;

        for (let i = 0; i < count; i++) {
          b[i] = a[i];
        }
      }

      //console.log(layer.dataUsed, layer.data_f32.length);

      let vbo = this.buffer.get(gl, layer.bufferKey);

      vbo.uploadData(gl, layer.data_f32);
    }
  }

  _draw_tris(gl, uniforms, params, program) {
    if (this.tottri) {
      this.bindArrays(gl, uniforms, program, "tri", PrimitiveTypes.TRIS);
      gl.drawArrays(gl.TRIANGLES, 0, this.tottri*3);
    }
  }

  flagRecalc() {
    for (let layer of this.layers) {
      layer.f32Ready = false;
    }

    this.regen = true;

    return this;
  }

  bindArrays(gl, uniforms, program, key, primflag) {
    program = program === undefined ? this.program : program;
    program = program === undefined ? this.mesh.program : program;
    let layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    if (!program || !program.program) {
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

    let buf = this.buffer.get(gl, layer.bufferKey).get(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, layer.size, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    let bindArray = (name, type) => {
      if (!(layerflag & type)) {
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

          let key = ShaderProgram.multiLayerAttrKey(name, mli, gl.haveWebGL2);

          let vbo = this.buffer.get(gl, layer.bufferKey);
          let buf = vbo.get(gl);

          li = program.attrLoc(key);
          if (li < 0) {
            continue;
          }

          gl.enableVertexAttribArray(li);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);

          gl.vertexAttribPointer(li, layer.size, gl.FLOAT, layer.normalize, 0, 0);
        }
      }
    }

    bindArray("normal", LayerTypes.NORMAL);
    bindArray("uv", LayerTypes.UV);
    bindArray("color", LayerTypes.COLOR);
    bindArray("id", LayerTypes.ID);
    bindArray("custom", LayerTypes.CUSTOM);
  }

  addDataLayer(primflag, type, size = TypeSizes[type], name = LayerTypeNames[type]) {
    return this.layers.pushLayer(name, primflag, type, size);
  }

  _draw_points(gl, uniforms, params, program) {
    if (this.totpoint > 0) {
      //console.log(this.totpoint, this.point_cos);
      this.bindArrays(gl, uniforms, program, "point", PrimitiveTypes.POINTS);
      gl.drawArrays(gl.POINTS, 0, this.totpoint);
    } else {
      console.log("no geometry");
    }
  }

  _draw_lines(gl, uniforms, params, program) {
    //console.log(this.totline, this.line_cos);
    if (this.totline > 0) {
      this.bindArrays(gl, uniforms, program, "line", PrimitiveTypes.LINES);
      gl.drawArrays(gl.LINES, 0, this.totline*2);
    } else {
      console.log("no geometry");
    }
  }

  onContextLost(e) {
    this.regen = 1;
  }

  /*
  set regen(v) {
    if (v && this.__regen !== v) {
      console.warn("set regen", v, this.__regen);
    }
    this.__regen = v;
  }

  get regen() {
    return this.__regen;
  }//*/

  draw(gl, uniforms, params, program_override = undefined) {
    let program = this.program === undefined ? this.mesh.program : this.program;
    let primflag = this.primflag === undefined ? this.mesh.primflag : this.primflag;

    if (program_override !== undefined) {
      program = program_override;
    }

    if (this.regen) {
      this.regen = 0;
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
      program = gl.simple_shader;

    if (!this.layers.has_multilayers) {
      program.bind(gl, uniforms);
    }

    if (this.tottri && (primflag & PrimitiveTypes.TRIS)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.TRIS));
      }

      this._draw_tris(gl, uniforms, params, program);
    }

    if (this.totline && (primflag & PrimitiveTypes.LINES)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.LINES));
      }
      this._draw_lines(gl, uniforms, params, program);
    }

    if (this.totpoint && (primflag & PrimitiveTypes.POINTS)) {
      if (this.layers.has_multilayers) {
        program.bindMultiLayer(gl, uniforms, this.layers.attrsizes.get(PrimitiveTypes.POINTS));
      }
      this._draw_points(gl, uniforms, params, program);
    }

    //if (gl.getError()) {
    //  this.regen = 1;
    //}
  }
}

export class SimpleMesh {
  constructor(layerflag = LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV) {
    this.layerflag = layerflag;
    this.primflag = PrimitiveTypes.ALL;

    this.islands = [];
    this.uniforms = {};

    this.add_island();
    this.island = this.islands[0];
  }

  reset(gl) {
    for (let island of this.islands) {
      island.reset(gl);
    }
  }

  flagRecalc() {
    for (let island of this.islands) {
      island.flagRecalc();
    }
  }

  addDataLayer(primflag, type, size = TypeSizes[type], name = LayerTypeNames[type]) {
    let ret;

    for (let island of this.islands) {
      let ret2 = island.addDataLayer(primflag, type, size, name);

      if (island === this.island) {
        ret = ret2;
      }
    }

    return ret;
  }

  copy() {
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

  add_island() {
    let island = new SimpleIsland(this);

    this.island = island;

    this.islands.push(island);
    return island;
  }

  destroy(gl) {
    for (var island of this.islands) {
      island.destroy(gl);
    }
  }

  tri(v1, v2, v3) {
    return this.island.tri(v1, v2, v3);
  }

  quad(v1, v2, v3, v4) {
    return this.island.quad(v1, v2, v3, v4);
  }

  line(v1, v2) {
    return this.island.line(v1, v2);
  }

  point(v1) {
    return this.island.point(v1);
  }

  drawLines(gl, uniforms, program_override = undefined) {
    for (let island of this.islands) {
      let primflag = island.primflag;

      island.primflag = PrimitiveTypes.LINES;
      island.draw(gl, uniforms, undefined, program_override);
      island.primflag = primflag;
    }
  }

  draw(gl, uniforms, program_override = undefined) {
    for (var island of this.islands) {
      island.draw(gl, uniforms, undefined, program_override);
    }
  }
}

export class ChunkedSimpleMesh extends SimpleMesh {
  constructor(layerflag = LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV, chunksize = 128) {
    super(layerflag);

    this.chunksize = chunksize;
    this.islands = [];
    this.uniforms = {};

    this.primflag = PrimitiveTypes.TRIS;

    this.island = undefined;

    this.quad_editors = util.cachering.fromConstructor(QuadEditor, 32);

    this.freelist = [];
    this.freeset = new Set();
    this.delset = undefined;

    this.chunkmap = new Map();
    this.idmap = new Map();
    this.idgen = 0;
  }

  reset() {

  }

  free(id) {
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
    island.line_cos.copy(i*2, zero);
    island.line_cos.copy(i*2 + 1, zero);
    //}
    //if (this.primflag & PrimitiveTypes.TRIS) {
    island.tri_cos.copy(i*3, zero);
    island.tri_cos.copy(i*3 + 1, zero);
    island.tri_cos.copy(i*3 + 2, zero);
    //}

    island.flagRecalc();
  }

  get_chunk(id) {
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
    for (var island of this.islands) {
      island.onContextLost(e);
    }
  }

  destroy(gl) {
    for (var island of this.islands) {
      island.destroy(gl);
    }
  }

  tri(id, v1, v2, v3) {
    if (1) {
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

    let tri_cos = chunk.tri_cos;

    let i = itri*9;

    if (tri_cos.dataUsed < i + 9) {
      chunk.regen = 1;
      return chunk.tri(v1, v2, v3);
    } else {
      if (i > tri_cos.data.length-9) {
        throw new Error("error");
      }

      tri_cos = tri_cos.data;

      tri_cos[i++] = v1[0];
      tri_cos[i++] = v1[1];
      tri_cos[i++] = v1[2];

      tri_cos[i++] = v2[0];
      tri_cos[i++] = v2[1];
      tri_cos[i++] = v2[2];

      tri_cos[i++] = v3[0];
      tri_cos[i++] = v3[1];
      tri_cos[i++] = v3[2];
    }

    chunk.regen = 1;
    return chunk.tri_editors.next().bind(chunk, itri);
  }

  quad(id, v1, v2, v3, v4) {
    throw new Error("unsupported for chunked meshes");
  }

  line(id, v1, v2) {
    let chunk = this.get_chunk(id);
    let iline = this.idmap.get(id);

    chunk.flagRecalc();

    let line_cos = chunk.line_cos;
    let i = iline*6;

    if (line_cos.dataUsed < i + 6) {
      chunk.line(v1, v2);
    } else {
      line_cos = line_cos.data;
      line_cos[i++] = v1[0];
      line_cos[i++] = v1[1];
      line_cos[i++] = v1[2];
      line_cos[i++] = v2[0];
      line_cos[i++] = v2[1];
      line_cos[i++] = v2[2];
    }

    chunk.regen = 1;
    return chunk.line_editors.next().bind(chunk, iline);
  }

  point(id, v1) {
    let chunk = this.get_chunk(id);
    let ipoint = this.idmap.get(id);

    chunk.flagRecalc();

    let point_cos = chunk.point_cos;
    let i = ipoint*3;

    if (point_cos.dataUsed < i + 3) {
      chunk.point(v1);
    } else {
      point_cos = point_cos.data;
      point_cos[i++] = v1[0];
      point_cos[i++] = v1[1];
      point_cos[i++] = v1[2];
    }

    chunk.regen = 1;
    return chunk.point_editors.next().bind(chunk, ipoint);
  }

  draw(gl, uniforms, program_override = undefined) {
    for (var island of this.islands) {
      island.draw(gl, uniforms, undefined, program_override);
    }
  }
}

export function makeCube() {

};

export function makeSphere() {

}


