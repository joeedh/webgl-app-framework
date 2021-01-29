"use strict";

import {util, nstructjs} from '../path.ux/scripts/pathux.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';

let STRUCT = nstructjs.STRUCT;
import './const.js';

export const constmap = {};

let TEXTURE_2D = 3553;

export class IntUniform {
  constructor(val) {
    this.val = val;
  }
}

export function initDebugGL(gl) {
  let addfuncs = {};

  let makeDebugFunc = (k, k2) => {
    return function() {
      let ret = this[k2].apply(this, arguments);

      let err = this.getError();
      if (err !== 0) {
        console.warn("gl."+k+":", constmap[err]);
      }

      return ret;
    }
  };

  for (let k in gl) {
    let v = gl[k];

    if (k !== "getError" && typeof v === "function") {
      let k2 = "_" + k;

      addfuncs[k2] = v;
      gl[k] = makeDebugFunc(k, k2);
    }
  }

  for (let k in addfuncs) {
    gl[k] = addfuncs[k];
  }

  return gl;
}

let _gl = undefined;

export function addFastParameterGet(gl) {
  let map = {
  };

  gl._getParameter = gl.getParameter;
  gl._enable = gl.enable;
  gl._disable = gl.disable;
  gl._viewport = gl.viewport;
  gl._scissor = gl.scissor;
  gl._depthMask = gl.depthMask;

  let validkeys = new Set([gl.DEPTH_TEST, gl.MAX_VERTEX_ATTRIBS, gl.DEPTH_WRITEMASK, gl.SCISSOR_BOX, gl.VIEWPORT]);

  gl.depthMask = function(mask) {
    mask = !!mask;

    if (mask !== map[gl.DEPTH_WRITEMASK]) {
      map[gl.DEPTH_WRITEMASK] = mask;
      gl._depthMask(mask);
    }
  };

  gl.viewport = function (x, y, w, h) {
    if (map[gl.VIEWPORT] === undefined) {
      map[gl.VIEWPORT] = [x, y, w, h];
    } else {
      let box = map[gl.VIEWPORT];
      box[0] = x;
      box[1] = y;
      box[2] = w;
      box[3] = h;
    }

    return gl._viewport(x, y, w, h);
  };

  gl.scissor = function(x, y, w, h) {
    if (map[gl.SCISSOR_BOX] === undefined) {
      map[gl.SCISSOR_BOX] = [x, y, w, h];
    } else {
      let box = map[gl.SCISSOR_BOX];
      box[0] = x;
      box[1] = y;
      box[2] = w;
      box[3] = h;
    }

    return gl._scissor(x, y, w, h);
  };

  gl.enable = function(p) {
    if (p in map && map[p]) {
      return;
    }

    map[p] = true;
    return gl._enable(p);
  }

  gl.disable = function (p) {
    if (p in map && !map[p]) {
      return;
    }

    map[p] = false;
    gl._disable(p);
  }

  //*
  gl.getParameter = function(p) {
    if (p !== undefined && !validkeys.has(p)) {
      return gl._getParameter(p);
    }

    if (p in map) {
      return map[p];
    }

    map[p] = this._getParameter(p);

    if (map[p] && Array.isArray(map[p])) {
      let cpy = [];
      for (let item of map[p]) {
        cpy.push(item);
      }

      map[p] = cpy;
    }

    return map[p];
  }//*/
}
//*/

export function onContextLost(e) {
  for (let k in shapes) {
    shapes[k].onContextLost(e);
  }
}

//params are passed to canvas.getContext as-is
export function init_webgl(canvas, params={}) {
  if (_gl !== undefined) {
    return _gl;
  }

  let webgl2 = params.webgl2 !== undefined ? params.webgl2 : true;
  let gl;

  if (webgl2) {
    gl = canvas.getContext("webgl2", params);
    gl.color_buffer_float = gl.getExtension("EXT_color_buffer_float");
  } else {
    gl = canvas.getContext("webgl", params);

    if (!gl.RGBA32F) {
      gl.RGBA32F = gl.RGBA;
      gl.RGBA8UI = gl.RGBA;
    }

    gl.getExtension("EXT_frag_depth");
    gl.color_buffer_float = gl.getExtension("WEBGL_color_buffer_float");
    gl.texture_float = gl.getExtension("OES_texture_float");
  }

  canvas.addEventListener("webglcontextlost", function(event) {
    event.preventDefault();
  }, false);

  canvas.addEventListener(
    "webglcontextrestored", onContextLost, false);

  addFastParameterGet(gl);

  _gl = gl;
  gl.haveWebGL2 = webgl2;

  for (let k in gl) {//of Object.getOwnPropertyNames(gl)) {
    let v = gl[k];

    if (typeof v == "number" || typeof v == "string") {
      constmap[v] = k;
    }
  }

  window._constmap = constmap;

  gl.texture_float = gl.getExtension("OES_texture_float_linear");
  gl.float_blend = gl.getExtension("EXT_float_blend");
  gl.getExtension("OES_standard_derivatives");
  gl.getExtension("ANGLE_instanced_arrays");
  gl.getExtension("WEBGL_lose_context");
  gl.draw_buffers = gl.getExtension("WEBGL_draw_buffers");


  gl.depth_texture = gl.getExtension("WEBGL_depth_texture");
  //gl.getExtension("WEBGL_debug_shaders");

  gl.shadercache = {};

  if (DEBUG.gl) {
    initDebugGL(gl);
  }

  return gl;
}

function format_lines(script) {
  var i = 1;
  var lines = script.split("\n")
  var maxcol = Math.ceil(Math.log(lines.length) / Math.log(10))+1;

  var s = "";

  for (var line of lines) {
    s += ""+i + ":";
    while (s.length < maxcol) {
      s += " "
    }

    s += line + "\n";
    i++;
  }

  return s;
}

export function hashShader(sdef) {
  let hash;

  let clean = {
    vertex : sdef.vertex,
    fragment : sdef.fragment,
    uniforms : sdef.uniforms,
    attributes : sdef.attributes
  };

  let ret = JSON.stringify(clean);
  sdef.__hash = ret;

  return ret;
}


/*
shaderdef = {
  fragment : fragment shader code,
  vertex : vertex shader code,
  uniforms : uniforms,
  attributes : attributes
}
*/

export function getShader(gl, shaderdef) {
  if (gl.shadercache === undefined) {
    gl.shadercache = {};
  }

  let hash = shaderdef.__hash !== undefined ? shaderdef.__hash : hashShader(shaderdef);
  if (hash in gl.shadercache) {
    return gl.shadercache[hash];
  }

  let shader = new ShaderProgram(gl, shaderdef.vertex, shaderdef.fragment, shaderdef.attributes);
  if (shaderdef.uniforms)
    shader.uniforms = shaderdef.uniforms;

  gl.shadercache[hash] = shader;
  return shader;
}

//
// loadShader
//
// 'shaderId' is the id of a <script> element containing the shader source string.
// Load this shader and return the WebGLShader object corresponding to it.
//
function loadShader(ctx, shaderId)
{
  var shaderScript = document.getElementById(shaderId);

  if (!shaderScript) {
    shaderScript = {text : shaderId, type : undefined};

    if (shaderId.trim().toLowerCase().startsWith("//vertex")) {
      shaderScript.type = "x-shader/x-vertex";
    } else if (shaderId.trim().toLowerCase().startsWith("//fragment")) {
      shaderScript.type = "x-shader/x-fragment";
    } else {
      console.trace();
      console.log("Invalid shader type");
      console.log("================");
      console.log(format_lines(shaderScript));
      console.log("================");
      throw new Error("Invalid shader type for shader script;\n script must start with //vertex or //fragment");
    }
  }

  if (shaderScript.type == "x-shader/x-vertex")
    var shaderType = ctx.VERTEX_SHADER;
  else if (shaderScript.type == "x-shader/x-fragment")
    var shaderType = ctx.FRAGMENT_SHADER;
  else {
    log("*** Error: shader script '"+shaderId+"' of undefined type '"+shaderScript.type+"'");
    return null;
  }

  // Create the shader object
  if (ctx == undefined || ctx == null || ctx.createShader == undefined)
    console.trace();

  var shader = ctx.createShader(shaderType);

  // Load the shader source
  ctx.shaderSource(shader, shaderScript.text);

  // Compile the shader
  ctx.compileShader(shader);

  // Check the compile status
  var compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
  if (!compiled && !ctx.isContextLost()) {
    // Something went wrong during compilation; get the error
    var error = ctx.getShaderInfoLog(shader);

    console.log(format_lines(shaderScript.text));
    console.log("\nError compiling shader: ", error);

    ctx.deleteShader(shader);
    return null;
  }

  return shader;
}

var _safe_arrays = [
  0,
  0,
  new Float32Array(2),
  new Float32Array(3),
  new Float32Array(4),
];

export let use_ml_array = false;

export class ShaderProgram {
  constructor(gl, vertex, fragment, attributes) {
    this.vertexSource = vertex;
    this.fragmentSource = fragment;

    this.attrs = [];

    this.multilayer_programs = {};

    for (var a of attributes) {
      this.attrs.push(a);
    }

    this.defines = {};
    this._use_def_shaders = true;
    this._def_shaders = {};

    this.multilayer_attrs = {};

    this.rebuild = 1;

    this.uniformlocs = {};
    this.attrlocs = {};
    this.uniform_defaults = {};

    this.uniforms = {};
    this.gl = gl;
  }

  static insertDefine(define, code) {
    code = code.trim().split("\n");

    if (code.length > 3) {
      code = code.slice(0, 3).concat([define]).concat(code.slice(3, code.length));
    } else {
      code = code.concat([define]);
    }

    return code.join("\n") + "\n";
  }

  static _use_ml_array() {
    return use_ml_array;
  }
  static multilayerAttrSize(attr) {
    return attr.toUpperCase() + "_SIZE";
  }

  static multilayerGet(attr, i) {
    if (this._use_ml_array()) {
      return `${attr}_layers[${i}]`;
    } else {
      return `get_${attr}_layer(i)`;
    }
  }

  static maxMultilayer() {
    return 8;
  }

  static multilayerAttrDeclare(attr, type, is_fragment, is_glsl_300) {
    let keyword, keyword2;

    if (is_fragment) {
      keyword = is_glsl_300 ? 'in' : "attribute";
      keyword2 = is_glsl_300 ? 'in' : "varying";
    } else {
      keyword = is_glsl_300 ? 'in' : "attribute";
      keyword2 = is_glsl_300 ? 'out' : "varying";
    }
    let size = this.multilayerAttrSize(attr);

    if (this._use_ml_array()) {
      let ret = `
#ifndef ${size}_DECLARE
#define ${size} 1
#endif

//${size}_DECLARE
#define ${attr} ${attr}_layers[0]\n`;
      if (!is_fragment) {
        ret += `${keyword} ${type} ${attr}_layers[${size}];\n`;
      }
      ret += `${keyword2} ${type} v${attr}_layers[${size}];\n`;

      return ret;
    }

    let ret = `
#ifndef ${size}_DECLARE
#define ${size} 1
#endif
//${size}_DECLARE\n`;
    if (!is_fragment) {
      ret += `${keyword} ${type} ${attr};\n`;
    }
    ret += `    
${keyword2} ${type} v${attr};
    `

    let func = `
${type} get_${attr}_layer(int i) {
  switch (i) {
    case 0:
      return ${attr}

    `
    for (let i=0; i<this.maxMultilayer(); i++) {
      ret += `
      #if ${size} > ${i+1}\n`;
      if (!is_fragment) {
        ret += `${keyword} ${type} ${attr}_${i+2};\n`;
      }

      ret += `${keyword2} ${type} v${attr}_${i+2};
      #endif
      `

      if (i === 0) {
        continue;
      }

      func += `
    case ${i}:
#if ${size} > ${i+1} 
      return ${attr}_${i+2};
      break;
#endif
      `;

    }

    func += '  }\n}\n';

    return ret;
  }

  static multiLayerAttrKey(attr, i, use_glsl300) {
    if (!this._use_ml_array()) {
      return i ? `${attr}_${i}` : attr;
    } else {
      return `${attr}_layers[${i}]`;
    }
  }
  static multilayerVertexCode(attr) {
    let size = this.multilayerAttrSize(attr);
    let ret = `

v${attr} = ${attr};
#if ${size} > 1

    `;

    for (let i=1; i<this.maxMultilayer; i++) {
      if (this._use_ml_array()) {
        ret += `
#if ${size} >= ${i}
  v${attr}_layers[{i}] = ${attr}_layers[${i}];
#endif
      `;
      } else {
        ret += `
#if ${size} >= ${i}
  v${attr}_${i+2} = ${attr}_${i+2};
#endif
      `;
      }
    }
    ret += '#endif\n';

    return ret;
  }

  setAttributeLayerCount(attr, n) {
    if (n <= 1 && attr in this.multilayer_attrs) {
      delete this.multilayer_attrs[attr];
    } else {
      this.multilayer_attrs[attr] = n;
    }

    return this;
  }

  init(gl) {
    this.gl = gl;
    this.rebuild = false;

    let vshader = this.vertexSource, fshader = this.fragmentSource;

    if (!this._use_def_shaders) {
      let defs = '';

      for (let k in this.defines) {
        let v = this.defines[k];

        if (v === undefined || v === null || v === "") {
          defs += `#define ${k}\n`;
        } else {
          defs += `#define ${k} ${v}\n`;
        }
      }

      if (defs !== '') {
        vshader = this.constructor.insertDefine(defs, vshader);
        fshader = this.constructor.insertDefine(defs, fshader);

        this._vertexSource = vshader;
        this._fragmentSource = fshader;
      }
    }

    function loadShader(shaderType, code) {
      var shader = gl.createShader(shaderType);

      // Load the shader source
      gl.shaderSource(shader, code);

      // Compile the shader
      gl.compileShader(shader);

      // Check the compile status
      let compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      if (!compiled && !gl.isContextLost()) {
        // Something went wrong during compilation; get the error
        var error = gl.getShaderInfoLog(shader);

        console.log(format_lines(code));
        console.log("\nError compiling shader: ", error);

        gl.deleteShader(shader);
        return null;
      }

      return shader;
    }

    // create our shaders
    let vertexShader = loadShader(gl.VERTEX_SHADER, vshader);
    let fragmentShader = loadShader(gl.FRAGMENT_SHADER, fshader);

    // Create the program object
    let program = gl.createProgram();

    // Attach our two shaders to the program
    gl.attachShader (program, vertexShader);
    gl.attachShader (program, fragmentShader);

    let attribs = this.attrs;

    // Bind attributes
    let li = 0;

    for (let i = 0; i < attribs.length; ++i) {
      let attr = attribs[i];

      if (attr in this.multilayer_attrs) {
        let count = this.multilayer_attrs[attr];
        for (let j=0; j<count; j++) {
          let key = this.constructor.multiLayerAttrKey(attr, j, gl.haveWebGL2);
          gl.bindAttribLocation(program, li++, key);
        }
      } else {
        gl.bindAttribLocation(program, li++, attribs[i]);
      }
    }
    // Link the program
    gl.linkProgram(program);

    // Check the link status
    let linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked && !gl.isContextLost()) {
      // something went wrong with the link
      let error = gl.getProgramInfoLog (program);

      console.log("\nVERTEX:\n" + format_lines(vshader));
      console.log("\nFRAGMENT\n:" + format_lines(fshader));

      console.log("Error in program linking:"+error);

      gl.deleteProgram(program);

      //do nothing
      //gl.deleteProgram(program);
      //gl.deleteProgram(fragmentShader);
      //gl.deleteProgram(vertexShader);

      return null;
    }

    //console.log("created shader", program);

    this.program = program;

    this.gl = gl;
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;

    this.attrlocs = {};
    this.uniformlocs = {};

    this.uniforms = {}; //default uniforms

    for (var i=0; i<attribs.length; i++) {
      this.attrlocs[attribs[i]] = i;
    }
  }

  //this function was originally asyncrounous
  static load_shader(scriptid, attrs) {
    var script = document.getElementById(scriptid);
    var text = script.text;

    var ret = new ShaderProgram(undefined, undefined, undefined, ["position", "normal", "uv", "color", "id"]);

    var lowertext = text.toLowerCase();
    var vshader = text.slice(0, lowertext.search("//fragment"));
    var fshader = text.slice(lowertext.search("//fragment"), text.length);

    ret.vertexSource = vshader;
    ret.fragmentSource = fshader;
    ret.ready = true;

    ret.promise = new Promise(function(accept, reject) {
      accept(ret);
    });

    ret.then = function() {
      return this.promise.then.apply(this.promise, arguments);
    }

    return ret;
  }

  on_gl_lost(newgl) {
    this.rebuild = 1;
    this.gl = newgl;
    this.program = undefined;

    this.uniformlocs = {};
  }

  destroy(gl) {
    if (gl && this.program) {
      gl.deleteProgram(this.program);
      this.uniforms = {};
      this.program = undefined;
    }

    //XXX implement me
    //console.warn("ShaderProgram.prototype.destroy: implement me!");
  }

  uniformloc(name) {
    if (this.uniformlocs[name] == undefined) {
      this.uniformlocs[name] = this.gl.getUniformLocation(this.program, name);
    }

    return this.uniformlocs[name];
  }

  attrloc(name) {
    return this.attrLocation(name);
  }

  attrLoc(name) {
    if (!(name in this.attrlocs)) {
      this.attrlocs[name] = this.gl.getAttribLocation(this.program, name);
    }

    return this.attrlocs[name];
  }

  calcDefKey() {
    let key = "";

    for (let k in this.defines) {
      let v = this.defines[k];

      key += k;

      if (v !== null && v !== undefined && v !== "") {
        key += ":" + v;
      }
    }

    return key;
  }

  bindMultiLayer(gl, uniforms, attrsizes) {
    let key = "";
    for (let k in attrsizes) {
      key += k + ":" + attrsizes[k] + ":";
    }

    if (key in this.multilayer_programs) {
      let shader = this.multilayer_programs[key];
      shader.defines = this.defines;

      return shader.bind(gl);
    }

    let shader = this.copy();

    for (let k in attrsizes) {
      let i = attrsizes[k];

      if (i > 1) {
        shader.multilayer_attrs[k] = i;
      }

      let size = this.constructor.multilayerAttrSize(k);

      let define = `#define ${size} ${i}`;

      shader.vertexSource = shader.vertexSource.replace("//"+size + "_DECLARE", define);
      shader.fragmentSource = shader.fragmentSource.replace("//"+size + "_DECLARE", define);
    }

    this.multilayer_programs[key] = shader;
    return shader.bind(gl, uniforms);
  }

  copy() {
    let ret = new ShaderProgram(this.gl, this.vertexSource, this.fragmentSource, this.attrs);

    ret.uniforms = this.uniforms;
    ret.defines = Object.assign({}, this.defines);

    return ret;
  }

  bind(gl, uniforms) {
    this.gl = gl;

    if (this._use_def_shaders) {
      let key = this.calcDefKey();

      if (key !== "") {
        if (!(key in this._def_shaders)) {
          let shader = this.copy();
          shader._use_def_shaders = false;

          this._def_shaders[key] = shader;
        }

        return this._def_shaders[key].bind(gl, uniforms);
      }
    }

    if (this.rebuild) {
      this.init(gl);

      if (this.rebuild)
        return false; //failed to initialize
    }

    if (!this.program) {
      return false;
    }

    function setv(dst, src, n) {
      for (var i=0; i<n; i++) {
        dst[i] = src[i];
      }
    }

    let slot_i = 0;
    gl.useProgram(this.program);
    this.gl = gl;

    for (var i=0; i<2; i++) {
      var us = i ? uniforms : this.uniforms;

      if (uniforms === undefined) {
        continue;
      }

      for (var k in us) {
        var v = us[k];
        var loc = this.uniformloc(k)

        if (loc === undefined) {
          //stupid gl returns null if it optimized away the uniform,
          //so we must silently accept this
          //console.log("Warning, could not locate uniform", k, "in shader");
          continue;
        }

        if (v instanceof IntUniform) {
          gl.uniform1i(loc, v.val);
        } else if (v instanceof Texture) {
          let slot = v.texture_slot;

          if (slot === undefined) {
            slot = slot_i++;
          }

          v.bind(gl, this.uniformloc(k), slot);
        } else if (v instanceof Array || v instanceof Float32Array || v instanceof Float64Array) {
          switch (v.length) {
            case 2:
              var arr = _safe_arrays[2];
              setv(arr, v, 2);

              gl.uniform2fv(loc, arr);
              break;
            case 3:
              var arr = _safe_arrays[3];
              setv(arr, v, 3);
              gl.uniform3fv(loc, arr);
              break;
            case 4:
              var arr = _safe_arrays[4];
              setv(arr, v, 4);
              gl.uniform4fv(loc, arr);
              break;
            default:
              console.log(v);
              throw new Error("invalid array");
              break;
          }
        } else if (v instanceof Matrix4) {
          //console.log("found matrix");
          v.setUniform(gl, loc);
        } else if (typeof v == "number") {
          gl.uniform1f(loc, v);
        } else if (v !== undefined && v !== null) {
          console.warn("Invalid uniform", k, v);
          throw new Error("Invalid uniform");
        }
      }
    }

    return this;
  }
}

window._ShaderProgram = ShaderProgram;

const GL_ARRAY_BUFFER = 34962;
const GL_ELEMENT_ARRAY_BUFFER = 34963;

export class VBO {
  constructor(gl, vbo, size=-1, bufferType=GL_ARRAY_BUFFER) {
    this.gl = gl;
    this.vbo = vbo;
    this.size = size;

    this.bufferType = bufferType;

    this.ready = false;
    this.lastData = undefined;
    this.dead = false;
    this.drawhint = undefined;
    this.lastData = undefined;
  }

  get(gl) {
    if (this.dead) {
      throw new Error("vbo is dead");
    }

    if (gl !== undefined && gl !== this.gl) {
      this.ready = false;
      this.gl = gl;
      this.vbo = gl.createBuffer();

      console.warn("context loss detected");
    }

    if (!this.ready) {
      console.warn("buffer was not ready; forgot to call .uploadData?");
    }

    if (!this.vbo) {
      throw new Error("webgl error");
    }

    return this.vbo;
  }

  checkContextLoss(gl) {
    if (gl !== undefined && gl !== this.gl) {
      this.ready = false;
      this.gl = gl;
      this.vbo = gl.createBuffer();

      console.warn("context loss detected");

      if (this.lastData !== undefined) {
        this.uploadData(gl, this.lastData, this.bufferType, this.drawhint);
      }
    }
  }

  reset(gl) {
    if (this.dead) {
      this.dead = false;
      this.gl = gl;
      this.vbo = gl.createBuffer();
      console.log("vbo creation");
    }

    this.ready = false;
    this.lastData = undefined;

    return this;
  }

  destroy(gl) {
    if (this.dead) {
      console.warn("tried to kill vbo twice");
      return;
    }

    this.ready = false;

    gl.deleteBuffer(this.vbo);

    this.vbo = undefined;
    this.lastData = undefined;
    this.gl = undefined;
    this.dead = true;
  }

  uploadData(gl, dataF32, target=this.bufferType, drawhint=gl.STATIC_DRAW) {
    if (gl !== this.gl) {
      //context loss
      this.gl = gl;
      this.vbo = gl.createBuffer();
      this.size = -1;

      console.warn("Restoring VBO after context loss");
    }

    let useSub = this.size === dataF32.length && this.vbo;

    this.lastData = dataF32;
    this.size = dataF32.length;

    this.drawhint = drawhint;

    gl.bindBuffer(target, this.vbo);

    if (useSub) {
      gl.bufferSubData(target, 0, dataF32);
    } else {
      if (DEBUG.simplemesh) {
        console.warn("bufferData");
      }
      gl.bufferData(target, dataF32, drawhint);
    }

    this.ready = true;
  }
}

export class RenderBuffer {
  constructor() {
    this._layers = {};
  }

  get(gl, name, bufferType=gl.ARRAY_BUFFER) {
    if (this[name] !== undefined) {
      return this[name];
    }

    //console.log("new buffer");
    let buf = gl.createBuffer();

    let vbo = new VBO(gl, buf, undefined, bufferType);

    this._layers[name] = vbo;
    this[name] = vbo;

    return vbo;
  }

  get buffers() {
    let this2 = this;

    return (function*() {
      for (let k in this2._layers) {
        yield this2._layers[k];
      }
    })();
  }

  reset(gl) {
    for (let vbo of this.buffers) {
      vbo.reset(gl);
    }
  }

  destroy(gl, name) {
    if (name === undefined) {
      for (let k in this._layers) {
        this._layers[k].destroy(gl);

        delete this._layers[name];
        delete this[name];
      }
    } else {
      if (this._layers[name] === undefined) {
        console.trace("WARNING: gl buffer not in RenderBuffer!", name, gl);
        return;
      }

      this._layers[name].destroy(gl);

      delete this._layers[name];
      delete this[name];
    }
  }
}

export class Texture {
  //3553 is gl.TEXTURE_2D
  constructor(texture_slot, texture, target=3553) {
    this.texture = texture;
    this.texture_slot = texture_slot;
    this.target = target;

    this.createParams = {
      target : TEXTURE_2D
    };

    this.createParamsList = [TEXTURE_2D];

    this._params = {};
  }

  static unbindAllTextures(gl) {
    for (let i=gl.TEXTURE0; i<gl.TEXTURE0+31; i++) {
      gl.activeTexture(i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  texParameteri(gl, target, param, value) {
    this._params[param] = value;

    gl.texParameteri(target, param, value);
    return this;
  }

  getParameter(gl, param) {
    return this._params[param];
  }

  _texImage2D1(gl, target, level, internalformat, format, type, source) {
    gl.bindTexture(target, this.texture);
    gl.texImage2D(target, level, internalformat, format, type, source);

    gl.getError();

    this.createParams = {
      target, level, internalformat, format, type, source
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source
    ];

    if (source instanceof Image || source instanceof ImageData) {
      this.createParams.width = source.width;
      this.createParams.height = source.height;
    }

    return this;
  }

  _texImage2D2(gl, target, level, internalformat, width, height, border, format, type, source) {
    gl.bindTexture(target, this.texture);

    gl.getError();

    //if (source === undefined || source === null) {
    //  gl.texImage2D(target, level, internalformat, width, height, border, format, type, undefined);
    //} else {
      gl.texImage2D(target, level, internalformat, width, height, border, format, type, source);
    //}

    this.createParams = {
      target, level, internalformat, format, type, source, width, height, border
    };
    this.createParamsList = [
      target, level, internalformat, format, type, source, width, height, border
    ];

    gl.getError();

    return this;
  }

  texImage2D() {
    if (arguments.length === 7) {
      return this._texImage2D1(...arguments);
    } else {
      return this._texImage2D2(...arguments);
    }
  }

  copy(gl, copy_data=false) {
    let tex = new Texture();

    tex.texture = gl.createTexture();
    tex.createParams = Object.assign({}, this.createParams);
    tex.createParamsList = this.createParamsList.concat([]);
    tex.texture_slot = this.texture_slot;

    gl.bindTexture(this.createParams.target, tex.texture);

    if (!copy_data) {
      let p = this.createParams;

      tex.texImage2D(p.target, p.level, p.internalformat, p.format, p.type, null);
      gl.getError();
    } else {
      this.copyTexTo(gl, tex);
    }

    for (let k in this._params) {
      let key = parseInt(k);
      let val = this._params[key];

      gl.texParameteri(this.createParams.target, key, val);
      gl.getError();
    }

    return tex;
  }

  copyTexTo(gl, b) {
    if (this.texture === undefined) {
      return;
    }

    let p = this.createParams;

    gl.bindTexture(p.target, b.texture);
    b.texImage2D(gl, p.target, p.level, p.internalformat, p.width, p.height, p.border, p.format, p.type, this.texture);
    gl.getError();

    return this;
  }

  destroy(gl) {
    gl.deleteTexture(this.texture);
  }

  load(gl, width, height, data, target = gl.TEXTURE_2D) {
    if (!this.texture) {
      this.texture = gl.createTexture();
    }
    gl.bindTexture(target, this.texture);

    if (data instanceof Float32Array) {
      gl.texImage2D(target, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    } else {
      gl.texImage2D(target, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    gl.getError();
    Texture.defaultParams(gl, this, target);
    gl.getError();

    return this;
  }

  initEmpty(gl, target, width, height, format=gl.RGBA, type=gl.FLOAT) {
    this.target = target;
    //this.width = width;
    //this.height = height;
    //this.format = format;
    //this.type = type;

    if (!this.texture) {
      this.texture = gl.createTexture();
      Texture.defaultParams(gl, this.texture, target);
    }

    gl.bindTexture(this.texture);
    gl.texImage2D(this.target, 0, format, width, height, 0, format, type, null);

    return this;
  }

  static load(gl, width, height, data, target = gl.TEXTURE_2D) {
    return new Texture(0).load(...arguments);
  }

  static defaultParams(gl, tex, target=gl.TEXTURE_2D) {
    if (!(tex instanceof Texture)) {
      console.warn("Depracated call to Texture.defaultParams with 'tex' a raw WebGLTexture instance instance of wrapper webgl.Texture object");
      tex = new Texture(undefined, tex);
    }

    gl.bindTexture(target, tex.texture);

    tex.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    tex.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    tex.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    tex.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  }

  bind(gl, uniformloc, slot=this.texture_slot) {
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(this.target, this.texture);
    gl.uniform1i(uniformloc, slot);
  }
}

export class CubeTexture extends Texture {
  constructor(texture_slot, texture) {
    super();

    this.texture = texture;
    this.texture_slot = texture_slot;
  }

  bind(gl, uniformloc, slot=this.texture_slot) {
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
    gl.uniform1i(uniformloc, slot);
  }
}

//cameras will derive from this class
export class DrawMats {
  constructor() {
    this.isPerspective = true;

    this.cameramat = new Matrix4();
    this.persmat = new Matrix4();
    this.rendermat = new Matrix4();
    this.normalmat = new Matrix4();

    this.icameramat = new Matrix4();
    this.ipersmat = new Matrix4();
    this.irendermat = new Matrix4();
    this.inormalmat = new Matrix4();
  }

  /** aspect should be sizex / sizey */
  regen_mats(aspect=this.aspect) {
    this.aspect = aspect;

    this.rendermat.load(this.persmat).multiply(this.cameramat);
    this.normalmat.load(this.cameramat).makeRotationOnly();

    this.icameramat.load(this.cameramat).invert();
    this.ipersmat.load(this.persmat).invert();
    this.irendermat.load(this.rendermat).invert();
    this.inormalmat.load(this.normalmat).invert();

    return this;
  }

  toJSON() {
    return {
      cameramat  : this.cameramat.getAsArray(),
      persmat    : this.persmat.getAsArray(),
      rendermat  : this.rendermat.getAsArray(),
      normalmat  : this.normalmat.getAsArray(),
      isPerspective : this.isPerspective,

      icameramat : this.icameramat.getAsArray(),
      ipersmat   : this.ipersmat.getAsArray(),
      irendermat : this.irendermat.getAsArray(),
      inormalmat : this.inormalmat.getAsArray()
    }
  }

  loadJSON(obj) {
    this.cameramat.load(obj.cameramat);
    this.persmat.load(obj.persmat);
    this.rendermat.load(obj.rendermat);
    this.normalmat.load(obj.normalmat);
    this.isPerspective = obj.isPerspective;

    this.icameramat.load(obj.icameramat);
    this.ipersmat.load(obj.ipersmat);
    this.irendermat.load(obj.irendermat);
    this.inormalmat.load(obj.inormalmat);

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}
DrawMats.STRUCT = `
DrawMats {
  cameramat     : mat4;
  persmat       : mat4;
  rendermat     : mat4;
  normalmat     : mat4;
  icameramat    : mat4;
  ipersmat      : mat4;
  irendermat    : mat4;
  inormalmat    : mat4;
  isPerspective : int;
}
`;
nstructjs.manager.add_class(DrawMats);

//simplest
export class Camera extends DrawMats {
  constructor() {
    super();

    this.isPerspective = true;

    this.fovy = 35;
    this.aspect = 1.0;

    this.pos = new Vector3([0, 0, 5]);
    this.target = new Vector3();
    this.orbitTarget = new Vector3();

    this.up = new Vector3([1, 3, 0]);
    this.up.normalize();

    this.near = 0.25;
    this.far = 10000.0;
  }

  generateUpdateHash(objectMatrix=undefined) {
    let mul = 1<<18;

    let ret = 0;

    function add(val) {
      val = (val * mul) & ((1<<31)-1);
      ret = (ret ^ val) & ((1<<31)-1);
    }

    add(this.near);
    add(this.far);
    add(this.fovy);
    add(this.aspect);
    add(this.isPerspective);
    add(this.pos[0]);
    add(this.pos[1]);
    add(this.pos[2]);
    add(this.target[0]);
    add(this.target[1]);
    add(this.target[2]);
    add(this.up[0]);
    add(this.up[1]);
    add(this.up[2]);

    if (objectMatrix !== undefined) {
      let m = objectMatrix.$matrix;

      add(m.m11); add(m.m12); add(m.m13);
      add(m.m21); add(m.m22); add(m.m23);
      add(m.m31); add(m.m32); add(m.m33);
    }

    return ret;
  }

  load(b) {
    this.isPerspective = b.isPerspective;
    this.fovy = b.fovy;
    this.aspect = b.aspect;
    this.pos.load(b.pos);
    this.orbitTarget.load(b.orbitTarget);
    this.target.load(b.target);
    this.up.load(b.up);
    this.near = b.near;
    this.far = b.far;

    this.regen_mats(this.aspect);

    return this;
  }

  copy() {
    let ret = new Camera();

    ret.isPerspective = this.isPerspective;
    ret.fovy = this.fovy;
    ret.aspect = this.aspect;

    ret.pos.load(this.pos);
    ret.target.load(this.target);
    ret.orbitTarget.load(this.orbitTarget);
    ret.up.load(this.up);

    ret.near = this.near;
    ret.far = this.far;

    ret.regen_mats(ret.aspect);

    return ret;
  }

  reset() {
    this.pos = new Vector3([0, 0, 5]);
    this.target = new Vector3();
    this.up = new Vector3([1, 3, 0]);
    this.up.normalize();

    this.regen_mats(this.aspect);
    window.redraw_all();

    return this;
  }

  toJSON() {
    var ret = super.toJSON();

    ret.fovy = this.fovy;
    ret.near = this.near;
    ret.far = this.far;
    ret.aspect = this.aspect;

    ret.target = this.target.slice(0);
    ret.pos = this.pos.slice(0);
    ret.up = this.up.slice(0);

    return ret;
  }

  loadJSON(obj) {
    super.loadJSON(obj);

    this.fovy = obj.fovy;

    this.near = obj.near;
    this.far = obj.far;
    this.aspect = obj.aspect;

    this.target.load(obj.target);
    this.pos.load(obj.pos);
    this.up.load(obj.up);

    return this;
  }

  /** aspect should be sizex / sizey*/
  regen_mats(aspect=this.aspect) {
    this.aspect = aspect;

    this.persmat.makeIdentity();
    if (this.isPerspective) {
      this.persmat.perspective(this.fovy, aspect, this.near, this.far);
    } else {
      this.persmat.isPersp = true;
      let scale = 1.0 / this.pos.vectorDistance(this.target);

      this.persmat.makeIdentity();
      this.persmat.orthographic(scale, aspect, this.near, this.far);

      //this.persmat.scale(1, 1, -2.0/zscale, 1.0/scale);
      //this.persmat.translate(0.0, 0.0, 0.5*zscale - this.near);
    }

    this.cameramat.makeIdentity();
    this.cameramat.lookat(this.pos, this.target, this.up);
    this.cameramat.invert();

    this.rendermat.load(this.persmat).multiply(this.cameramat);
    //this.rendermat.load(this.cameramat).multiply(this.persmat);

    super.regen_mats(aspect); //will calculate iXXXmat for us
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

Camera.STRUCT = STRUCT.inherit(Camera, DrawMats) + `
  fovy          : float;
  aspect        : float;
  target        : vec3;
  orbitTarget   : vec3;
  pos           : vec3;
  up            : vec3;
  near          : float;
  far           : float;
  isPerspective : bool;
}
`;
nstructjs.manager.add_class(Camera);
