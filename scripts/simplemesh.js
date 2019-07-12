//handle to module.  never access in code; for debug console use only.
var _simplemesh = undefined;

define([
  "util", "vectormath", "math", "webgl"
], function(util, vectormath, math, webgl) {
  "use strict";

  var exports = _simplemesh = {};
  
  var Vector2 = vectormath.Vector2, Vector3 = vectormath.Vector3;
  var Vector4 = vectormath.Vector4, Matrix4 = vectormath.Matrix4;
  var Quat = vectormath.Quat;

  var set = util.set;
  var RenderBuffer = webgl.RenderBuffer;

  var LayerTypes = exports.LayerTypes = {
    LOC    : 1,
    UV     : 2,
    COLOR  : 4,
    NORMAL : 8,
    ID     : 16
  }

  var TypeSizes = exports.TypeSizes = {
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

  function copyvec(a, b, starti, n, defaultval) {
    if (defaultval == undefined)
        defaultval = 0.0;
      
    for (var i=starti; i<starti+n; i++) {
      var val = b[i];
      a[i] = val == undefined ? defaultval : val;
    }
  }

  var TriEditor = exports.TriEditor = class TriEditor {
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
      var data = this.mesh.tri_ids
      var i = this.i*3; //*3 is because triangles have three vertices
      
      _ids_arrs[0][0] = i1, i1 = _ids_arrs[0];
      _ids_arrs[0][1] = i2, i2 = _ids_arrs[1];
      _ids_arrs[0][2] = i3, i3 = _ids_arrs[2];
      
      data.copy(i, i1);
      data.copy(i+1, i2);
      data.copy(i+2, i3);
      
      return this;
    }
  }

  var QuadEditor = exports.QuadEditor = class QuadEditor {
      constructor() {
        this.t1 = new TriEditor();
        this.t2 = new TriEditor();
      }
      
      bind(mesh, i) {
        this.t1.bind(mesh, i);
        this.t2.bind(mesh, i+1);
        
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

  var GeoLayer = exports.GeoLayer = class GeoLayer extends Array {
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
      
      for (var i=0; i<tot; i++) {
        this.push(0);
      }
      
      if (data != undefined) {
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
      var end = i+tot;
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

  var GeoLayerMeta = exports.GeoLayerMeta = class GeoLayerMeta {
    constructor(type) {
      this.type = type;
      this.layers = [];
    }
  }

  var GeoLayerManager = exports.GeoLayerManager = class GeoLayerManager {
    constructor() {
      this.layers = new util.set();
      this.layer_meta = {};
      this.layer_idgen = new util.IDGen();
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

  var SimpleIsland = exports.SimpleIsland = class SimpleIsland {
    constructor() {
      var lay = this.layers = new GeoLayerManager();
      
      this.tri_cos    = lay.get("tri_cos", LayerTypes.LOC); //array
      this.tri_normals    = lay.get("tri_normals", LayerTypes.NORMAL); //array
      this.tri_uvs    = lay.get("tri_uvs", LayerTypes.UV); //array
      this.tri_colors = lay.get("tri_colors", LayerTypes.COLOR); //array
      this.tri_ids    = lay.get("tri_ids", LayerTypes.ID); //array
      this.tottri = 0;
      this.layerflag = undefined;
      
      this.regen = 1;
      
      this.tri_editors = util.cachering.fromConstructor(TriEditor, 32);
      this.quad_editors = util.cachering.fromConstructor(QuadEditor, 32);
      
      this.buffer = new RenderBuffer();
      this.program = undefined;
      
      this.textures = [];
      this.uniforms = {};
      this._uniforms_temp = {};
    }
    
    tri(v1, v2, v3) {
      var i = this.tottri;
      
      var cos = this.tri_cos;
      cos.push(v1[0]); cos.push(v1[1]); cos.push(v1[2]);
      cos.push(v2[0]); cos.push(v2[1]); cos.push(v2[2]);
      cos.push(v3[0]); cos.push(v3[1]); cos.push(v3[2]);
      
      var layerflag = this.layerflag == undefined ? this.mesh.layerflag : this.layerflag;
      
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
      
      return this.quad_editors.next().bind(this, i);
    }
    
    destroy(gl) {
      this.buffer.destroy();
      this.regen = true;
    }
    
    gen_buffers(gl) {
      var layerflag = this.layerflag == undefined ? this.mesh.layerflag : this.layerflag;
      
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
    
    draw(gl, uniforms, params) {
      var program = this.program == undefined ? this.mesh.program : this.program;
      
      if (this.regen) {
        this.regen = 0;
        this.gen_buffers(gl);
      }
      
      if (uniforms == undefined) {
        for (var k in this._uniforms_temp) {
          delete this._uniforms_temp[k];
        }
        
        uniforms = this._uniforms_temp;
      }
      
      for (var k in this.uniforms) {
        if (!(k in uniforms)) {
          uniforms[k] = this.uniforms[k];
        }
      }
      
      for (var k in this.mesh.uniforms) {
        if (!(k in uniforms)) {
          uniforms[k] = this.mesh.uniforms[k];
        }
      }
      
      if (program == undefined)
        program = gl.simple_shader;
    
      program.bind(gl, uniforms);
      
      let li = 0;
      
      gl.enableVertexAttribArray(li);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.tri_cos);
      gl.vertexAttribPointer(li, this.tri_cos.size, gl.FLOAT, false, 0, 0);
      
      var layerflag = this.layerflag == undefined ? this.mesh.layerflag : this.layerflag;
      
      if (layerflag & LayerTypes.NORMAL) {
        li++;
        
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.tri_normals);
        gl.vertexAttribPointer(li, this.tri_normals.size, gl.FLOAT, true, 0, 0);
      }
      
      if (layerflag & LayerTypes.UV) {
        li++;
        
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.tri_uvs);
        gl.vertexAttribPointer(li, this.tri_uvs.size, gl.FLOAT, false, 0, 0);
      } 
      
      if (layerflag & LayerTypes.COLOR) {
        li++;
        
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.tri_colors);
        gl.vertexAttribPointer(li, this.tri_colors.size, gl.FLOAT, false, 0, 0);
      }
      
      if (layerflag & LayerTypes.ID) {
        li++;
        
        gl.enableVertexAttribArray(li);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer.tri_ids);
        gl.vertexAttribPointer(li, this.tri_ids.size, gl.FLOAT, false, 0, 0);
      }
      
      gl.drawArrays(gl.TRIANGLES, 0, this.tottri*3);
    }
  }

  var SimpleMesh = exports.SimpleMesh = class SimpleMesh {
    constructor(layerflag=LayerTypes.LOC|LayerTypes.NORMAL|LayerTypes.UV) {
      
      this.layerflag = layerflag;
      
      this.islands = [];
      this.uniforms = {};
      
      this.add_island();
      this.island = this.islands[0];
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
    
    draw(gl, uniforms) {
      for (var island of this.islands) {
        island.draw(gl, uniforms);
      }
    }
  }
  
  return exports;
});
