import * as util from '../util/util.js';
import * as math from '../util/math.js';
import * as webgl from './webgl.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';

var set = util.set;
var RenderBuffer = webgl.RenderBuffer;

export const PrimitiveTypes = {
  POINTS : 1,
  LINES  : 2,
  TRIS   : 4,
  ALL    : 1|2|4
};

export const LayerTypes = {
  LOC    : 1,
  UV     : 2,
  COLOR  : 4,
  NORMAL : 8,
  ID     : 16
}

export const TypeSizes = {
  LOC    : 3,
  UV     : 2,
  COLOR  : 4,
  NORMAL : 3,
  ID     : 1
};

for (var k in TypeSizes) {
  TypeSizes[LayerTypes[k]] = TypeSizes[k];
}

function appendvec(a, b, n, defaultval) {
  if (defaultval == undefined)
      defaultval = 0.0;
    
  for (var i=0; i<n; i++) {
    var val = b[i];
    a.push(val == undefined ? defaultval : val);
  }
}

var _ids_arrs = [[0], [0], [0], [0]];
let zero = new Vector3();

function copyvec(a, b, starti, n, defaultval) {
  if (defaultval == undefined)
      defaultval = 0.0;
    
  for (var i=starti; i<starti+n; i++) {
    var val = b[i];
    a[i] = val == undefined ? defaultval : val;
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
    var data = this.mesh.tri_colors;
    var i = this.i*3; //*3 is because triangles have three vertices
    
    data.copy(i, c1);
    data.copy(i+1, c2);
    data.copy(i+2, c3);
    
    return this;
  }
  
  normals(n1, n2, n3){ 
    var data = this.mesh.tri_normals
    var i = this.i*3; //*3 is because triangles have three vertices
    
    data.copy(i, n1);
    data.copy(i+1, n2);
    data.copy(i+2, n3);
    
    return this;
  }
  
  uvs(u1, u2, u3) {
    var data = this.mesh.tri_uvs
    var i = this.i*3*2; //*3 is because triangles have three vertices
    
    data[i++] = u1[0];
    data[i++] = u1[1];
    
    data[i++] = u2[0];
    data[i++] = u2[1];
    
    data[i++] = u3[0];
    data[i++] = u3[1];
    
    return this;
  }
  
  ids(i1, i2, i3) {
    if (i1 === undefined || i2 === undefined || i3 === undefined) {
      throw new Error("i1/i2/i3 cannot be undefined");
    }

    var data = this.mesh.tri_ids
    var i = this.i*3; //*3 is because triangles have three vertices
    
    _ids_arrs[0][0] = i1, i1 = _ids_arrs[0];
    _ids_arrs[1][0] = i2, i2 = _ids_arrs[1];
    _ids_arrs[2][0] = i3, i3 = _ids_arrs[2];
    
    data.copy(i, i1);
    data.copy(i+1, i2);
    data.copy(i+2, i3);
    
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
    var data = this.mesh.line_colors;
    var i = this.i*2; //*3 is because triangles have three vertices
    
    data.copy(i, c1);
    data.copy(i+1, c2);
    
    return this;
  }  
  
  uvs(c1, c2) {
    var data = this.mesh.line_uvs;
    var i = this.i*2; //*3 is because triangles have three vertices
    
    data.copy(i, c1);
    data.copy(i+1, c2);
    
    return this;
  }  
  
  ids(i1, i2) {
    if (i1 === undefined || i2 === undefined) {
      throw new Error("i1/i2 cannot be undefined");
    }

    var data = this.mesh.line_ids;
    var i = this.i*2; //*3 is because triangles have three vertices
    
    _ids_arrs[0][0] = i1, i1 = _ids_arrs[0];
    _ids_arrs[1][0] = i2, i2 = _ids_arrs[1];
    
    data.copy(i, _ids_arrs[0]);
    data.copy(i+1, _ids_arrs[1]);
    
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
    var data = this.mesh.point_colors;
    var i = this.i;

    data.copy(i, c1);

    return this;
  }

  normals(c1) {
    var data = this.mesh.point_normals;
    var i = this.i;

    data.copy(i, c1);

    return this;
  }

  uvs(c1) {
    var data = this.mesh.point_uvs;
    var i = this.i;

    data.copy(i, c1);

    return this;
  }

  ids(i1) {
    if (i1 === undefined) {
      throw new Error("i1 cannot be undefined");
    }

    var data = this.mesh.point_ids;
    var i = this.i;

    _ids_arrs[0][0] = i1, i1 = _ids_arrs[0];

    data.copy(i, _ids_arrs[0]);

    return this;
  }
}

export class GeoLayer extends Array {
  constructor(size, name, type, idx) { //idx is for different layers of same type, e.g. multiple uv layers
    super();
    
    this.type = type;
    this.data_f32 = [];
    
    this.size = size;
    this.name = name;
    
    this.idx = idx;
    this.id = undefined;
  }
  
  extend(data) {
    var tot = this.size;
    var starti = this.length;

    //okay, V8's optimizer did *not* like calling push in a for loop,
    //just increment length instead, according to ES spec this is fine
    //and it's much faster
    this.length += tot;
    
    if (data !== undefined) {
      this.copy(~~(starti/this.size), data, 1);
    }
    
    return this;
  }
  
  //i and n will be multiplied by .size
  copy(i, data, n) {
    if (n == undefined) n = 1;
    
    var tot = n*this.size;
    
    i *= this.size;
    
    var di = 0;
    var end = i + tot;
    while (i < end) {
      this[i] = data[di];
      di++;
      i++;
    }
  }
  
  [Symbol.keystr]() {
    return "" + this.id;
  }
}

export class GeoLayerMeta {
  constructor(type) {
    this.type = type;
    this.layers = [];
  }
}

export class GeoLayerManager {
  constructor() {
    this.layers = new util.set();
    this.layer_meta = {};
    this.layer_idgen = new util.IDGen();
  }

  copy() {
    let ret = new GeoLayerManager();

    for (let layer of this.layers) {
      let layer2 = ret.get(layer.name, layer.type, layer.size, layer.idx);

      let a = layer.data_f32;
      let b = layer2.data_f32;

      b.length = a.length;
      layer2.length = layer.length;

      for (let i=0; i<a.length; i++) {
        b[i] = a[i];
      }
      for (let i=0; i<layer.length; i++) {
        layer2[i] = layer[i];
      }
    }

    return ret;
  }

  get_meta(type) {
    if (!(type in this.layer_meta)) {
      this.layer_meta[type] = new GeoLayerMeta(type);
    }
    
    return this.layer_meta[type];
  }
  
  [Symbol.iterator]() {
    return this.layers[Symbol.iterator]();
  }
  
  get(name, type, size, idx) {
     if (size == undefined) {
       size = TypeSizes[type];
     }
     
     var meta = this.get_meta(type);
     
     if (idx == undefined)
       idx = meta.layers.length;
     
     var layer = new GeoLayer(size, name, type, idx);
     layer.id = this.layer_idgen.next();


     this.layers.add(layer);
     meta.layers.push(layer);
     
     return layer;
  }
}

var _default_uv = [0, 0];
var _default_color = [0, 0, 0, 1];
var _default_normal = [0, 0, 1];
var _default_id = [-1];

export class SimpleIsland {
  constructor() {
    var lay = this.layers = new GeoLayerManager();

    this.primflag = undefined;  //if undefined, will get from this.mesh.primflag

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

  makeBufferAliases() {
    let lay = this.layers;

    this.tri_cos    = lay.get("tri_cos", LayerTypes.LOC); //array
    this.tri_normals = lay.get("tri_normals", LayerTypes.NORMAL); //array
    this.tri_uvs    = lay.get("tri_uvs", LayerTypes.UV); //array
    this.tri_colors = lay.get("tri_colors", LayerTypes.COLOR); //array
    this.tri_ids    = lay.get("tri_ids", LayerTypes.ID); //array

    this.line_cos    = lay.get("line_cos", LayerTypes.LOC); //array
    this.line_normals = lay.get("line_normals", LayerTypes.NORMAL); //array
    this.line_uvs    = lay.get("line_uvs", LayerTypes.UV); //array
    this.line_colors = lay.get("line_colors", LayerTypes.COLOR); //array
    this.line_ids    = lay.get("line_ids", LayerTypes.ID); //array

    this.point_cos    = lay.get("point_cos", LayerTypes.LOC); //array
    this.point_normals = lay.get("point_normals", LayerTypes.NORMAL); //array
    this.point_uvs    = lay.get("point_uvs", LayerTypes.UV); //array
    this.point_colors = lay.get("point_colors", LayerTypes.COLOR); //array
    this.point_ids    = lay.get("point_ids", LayerTypes.ID); //array
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
    let i = this.totpoint;

    let cos = this.point_cos;
    cos.push(v1[0]); cos.push(v1[1]); cos.push(v1[2]);

    var layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    for (i=0; i<1; i++) {
      if (layerflag & LayerTypes.UV)
        this.point_uvs.extend(_default_uv);
      if (layerflag & LayerTypes.COLOR)
        this.point_colors.extend(_default_color);
      if (layerflag & LayerTypes.NORMAL)
        this.point_normals.extend(_default_normal);
      if (layerflag & layerflag.ID)
        this.point_ids.extend(_default_id);
    }

    this.totpoint++;
    return this.point_editors.next().bind(this, this.totpoint-1);
  }
  
  line(v1, v2) {
    let i = this.totline;
    
    let cos = this.line_cos;
    cos.push(v1[0]); cos.push(v1[1]); cos.push(v1[2]);
    cos.push(v2[0]); cos.push(v2[1]); cos.push(v2[2]);

    var layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;
    
    for (i=0; i<2; i++) {
      if (layerflag & LayerTypes.UV)
        this.line_uvs.extend(_default_uv);
      if (layerflag & LayerTypes.COLOR)
        this.line_colors.extend(_default_color);
      if (layerflag & LayerTypes.NORMAL)
        this.line_normals.extend(_default_normal);
      if (layerflag & layerflag.ID)
        this.line_ids.extend(_default_id);
    }
    
    this.totline++;
    return this.line_editors.next().bind(this, this.totline-1);
  }
  
  tri(v1, v2, v3) {
    var i = this.tottri;
    
    var cos = this.tri_cos;
    cos.push(v1[0]); cos.push(v1[1]); cos.push(v1[2]);
    cos.push(v2[0]); cos.push(v2[1]); cos.push(v2[2]);
    cos.push(v3[0]); cos.push(v3[1]); cos.push(v3[2]);
    
    var layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;
    
    for (var i=0; i<3; i++) {
      if (layerflag & LayerTypes.UV)
        this.tri_uvs.extend(_default_uv);
      if (layerflag & LayerTypes.COLOR)
        this.tri_colors.extend(_default_color);
      if (layerflag & LayerTypes.NORMAL)
        this.tri_normals.extend(_default_normal);
      if (layerflag & layerflag.ID)
        this.tri_ids.extend(_default_id);
    }
    
    this.tottri++;
    
    return this.tri_editors.next().bind(this, this.tottri-1);
  }
  
  quad(v1, v2, v3, v4) {
    var i = this.tottri;
    
    this.tri(v1, v2, v3);
    this.tri(v1, v3, v4);
    
    return this.quad_editors.next().bind(this, i, i+1);
  }
  
  destroy(gl) {
    this.buffer.destroy(gl);
    this.regen = true;
  }
  
  gen_buffers(gl) {
    var layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;
    
    for (var layer of this.layers) {
      if (!(layer.type & layerflag)) {
        continue;
      }
      
      var size = layer.size*layer.length;
      
      if (layer.data_f32 == undefined || layer.data_f32.length != size) {
        layer.data_f32 = new Float32Array(layer);
      }
      
      var buf = this.buffer.get(gl, layer.name);

      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, layer.data_f32, gl.STATIC_DRAW);
    }
  }
  
  _draw_tris(gl, uniforms, params, program) {
    this.bindArrays(gl, uniforms, program, "tri");
    
    gl.drawArrays(gl.TRIANGLES, 0, this.tottri*3);
  }

  bindArrays(gl, uniforms, program, key) {
    program = program === undefined ? this.program : program;
    program = program === undefined ? this.mesh.program : program;
    var layerflag = this.layerflag === undefined ? this.mesh.layerflag : this.layerflag;

    for (let i=0; i<6; i++) {
      gl.disableVertexAttribArray(i);
    }

    let li = 0;
    gl.enableVertexAttribArray(li);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer[key + "_cos"]);
    gl.vertexAttribPointer(li, this[key + "_cos"].size, gl.FLOAT, false, 0, 0);

    if (layerflag & LayerTypes.NORMAL) {
      li = program.attrLoc("normal");
      if (li > 0) {
        gl.simpleshader = program;

        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer[key + "_normals"]);
        gl.vertexAttribPointer(li, this[key + "_normals"].size, gl.FLOAT, true, 0, 0);
      } else {
        //console.warn("no normals attribute");
      }
    }

    if (layerflag & LayerTypes.UV) {
      li = program.attrLoc("uv");

      if (li > 0) {
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer[key + "_uvs"]);
        gl.vertexAttribPointer(li, this[key + "_uvs"].size, gl.FLOAT, false, 0, 0);
      } else {
        //console.warn("no uv attribute");
      }
    }

    if (layerflag & LayerTypes.COLOR) {
      li = program.attrLoc("color");

      if (li > 0) {
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer[key + "_colors"]);
        gl.vertexAttribPointer(li, this[key + "_colors"].size, gl.FLOAT, false, 0, 0);
      } else {
        //console.warn("no color attribute");
      }
    }

    if (layerflag & LayerTypes.ID) {
      li = program.attrLoc("id");

      if (li > 0) {
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer[key + "_ids"]);
        gl.vertexAttribPointer(li, this[key + "_ids"].size, gl.FLOAT, false, 0, 0);
      } else {
        //console.warn("no id attribute");
      }
    }
  }

  _draw_points(gl, uniforms, params, program) {
    this.bindArrays(gl, uniforms, program, "point");

    if (this.totpoint > 0) {
      //console.log(this.totpoint, this.point_cos);
      gl.drawArrays(gl.POINTS, 0, this.totpoint);
    } else {
      console.log("no geometry");
    }
  }

  _draw_lines(gl, uniforms, params, program) {
    this.bindArrays(gl, uniforms, program, "line");
    
    //console.log(this.totline, this.line_cos);
    if (this.totline > 0) {
      gl.drawArrays(gl.LINES, 0, this.totline*2);
    } else {
      console.log("no geometry");
    }
  }

  onContextLost(e) {
    this.regen = 1;
  }

  draw(gl, uniforms, params, program_override=undefined) {
    var program = this.program == undefined ? this.mesh.program : this.program;
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
  
    if (!program.bind(gl, uniforms)) {
      return; //bad shader;
    }
    
    if (this.tottri && (primflag & PrimitiveTypes.TRIS)) {
      this._draw_tris(gl, uniforms, params, program);
    }
    
    if (this.totline && (primflag & PrimitiveTypes.LINES)) {
      this._draw_lines(gl, uniforms, params, program);
    }

    if (this.totpoint && (primflag & PrimitiveTypes.POINTS)) {
      this._draw_points(gl, uniforms, params, program);
    }

    //if (gl.getError()) {
    //  this.regen = 1;
    //}
  }
}

export class SimpleMesh {
  constructor(layerflag=LayerTypes.LOC|LayerTypes.NORMAL|LayerTypes.UV) {
    this.layerflag = layerflag;
    this.primflag = PrimitiveTypes.ALL;

    this.islands = [];
    this.uniforms = {};
    
    this.add_island();
    this.island = this.islands[0];
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
    var island = new SimpleIsland();

    island.mesh = this;
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

  drawLines(gl, uniforms, program_override=undefined) {
    for (let island of this.islands) {
      let primflag = island.primflag;

      island.primflag = PrimitiveTypes.LINES;
      island.draw(gl, uniforms, undefined, program_override);
      island.primflag = primflag;
    }
  }

  draw(gl, uniforms, program_override=undefined) {
    for (var island of this.islands) {
      island.draw(gl, uniforms, undefined, program_override);
    }
  }
}

export class ChunkedSimpleMesh extends SimpleMesh {
  constructor(layerflag=LayerTypes.LOC|LayerTypes.NORMAL|LayerTypes.UV, chunksize=128) {
    super();

    this.layerflag = layerflag;

    this.chunksize = chunksize;
    this.islands = [];
    this.uniforms = {};

    this.island = undefined;

    this.quad_editors = util.cachering.fromConstructor(QuadEditor, 32);

    this.freelist = [];
    this.chunkmap = {};
    this.idmap = {};
    this.idgen = 0;
  }

  get_chunk(id) {
    if (id in this.chunkmap) {
      return this.islands[this.chunkmap[id]];
    }

    if (this.freelist.length > 0) {
      let id2 = this.freelist.pop();
      let chunk = this.freelist.pop();

      this.chunkmap[id] = chunk;
      this.idmap[id] = id2;

      let ch = this.islands[chunk];

      if (ch.tottri < this.chunksize) {
        ch.tri(zero, zero, zero);
      }

      return ch;
    }

    let chunki = this.islands.length;
    let chunk = this.add_island();

    for (let i=0; i<this.chunksize; i++) {
      this.freelist.push(chunki);
      this.freelist.push(this.chunksize - i - 1);
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
    let chunk = this.get_chunk(id);
    let itri = this.idmap[id];

    let tri_cos = chunk.tri_cos;
    let i = itri*9;

    if (tri_cos.length < i+9) {
      chunk.regen = 1;
      return chunk.tri(v1, v2, v3);
    } else {
      tri_cos[i++] = v1[0]; tri_cos[i++] = v1[1]; tri_cos[i++] = v1[2];
      tri_cos[i++] = v2[0]; tri_cos[i++] = v2[1]; tri_cos[i++] = v2[2];
      tri_cos[i++] = v3[0]; tri_cos[i++] = v3[1]; tri_cos[i++] = v3[2];
    }

    chunk.regen = 1;
    return chunk.tri_editors.next().bind(chunk, itri);
  }

  quad(id, v1, v2, v3, v4) {
    throw new Error("unsupported for chunked meshes");
  }

  line(id, v1, v2) {
    let chunk = this.get_chunk(id);
    let iline = this.idmap[id];

    let line_cos = chunk.line_cos;
    let i = iline*6;

    if (line_cos.length < i+6) {
      chunk.line(v1, v2);
    } else {
      line_cos[i++] = v1[0]; line_cos[i++] = v1[1]; line_cos[i++] = v1[2];
      line_cos[i++] = v2[0]; line_cos[i++] = v2[1]; line_cos[i++] = v2[2];
    }

    chunk.regen = 1;
    return chunk.line_editors.next().bind(chunk, iline);
  }

  point(id, v1) {
    let chunk = this.get_chunk(id);
    let ipoint = this.idmap[id];

    let point_cos = chunk.point_cos;
    let i = ipoint*3;

    if (point_cos.length < i+9) {
      chunk.point(v1);
    } else {
      point_cos[i++] = v1[0]; point_cos[i++] = v1[1]; point_cos[i++] = v1[2];
    }

    chunk.regen = 1;
    return chunk.point_editors.next().bind(chunk, ipoint);
  }

  draw(gl, uniforms, program_override=undefined) {
    for (var island of this.islands) {
      island.draw(gl, uniforms, undefined, program_override);
    }
  }
}

export function makeCube() {

};

export function makeSphere() {

}


