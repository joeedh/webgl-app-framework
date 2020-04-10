import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {saveFile, loadFile} from '../../path.ux/scripts/html5_fileapi.js';

import {Editor, VelPan} from '../editor_base.js';

import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

import {DataPathError} from '../../path.ux/scripts/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";

import {SimpleMesh, LayerTypes} from "../../core/simplemesh.js";
import {FBO} from '../../core/fbo.js';
import {getShader, ShaderProgram, Texture} from "../../core/webgl.js";
import {getWebGL} from "../view3d/view3d.js";

export let DisplayShader = {
  vertex : `#version 300 es
precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;

in vec3 position;
in vec2 uv;

out vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position, 1.0);
  v_Uv = uv;
}
    
  `,
  fragment : `#version 300 es
precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;

in vec2 v_Uv;
out vec4 fragColor;

void main(void) {
  //fragColor = vec4(v_Uv[0], v_Uv[1], 0.0, 1.0);
  
  vec4 color = texture(rgba, v_Uv);
  
  if (color.a == 0.0) {
    fragColor = vec4(1, 0.5, 0.25, 1.0);
  } else {
    fragColor = vec4(color.rgb, 1.0);
  }
  
  //gl_FragDepth = texture(depth, v_Uv)[0];
}

  `,
  uniforms : {},
  attributes : ["position", "uv"]
};

export let DepthShader = {
  vertex : `#version 300 es
precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;

in vec3 position;
in vec2 uv;

out vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position, 1.0);
  v_Uv = uv;
}
    
  `,
  fragment : `#version 300 es
precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;

in vec2 v_Uv;
out vec4 fragColor;

void main(void) {
  float f = texture(depth, v_Uv)[0];
  f = fract(f*720022.32423);
    
  fragColor = vec4(f, f, f, 1.0);
  
  //gl_FragDepth = texture(depth, v_Uv)[0];
}

  `,
  uniforms : {},
  attributes : ["position", "uv"]
};

export const ShaderDef = {
  DisplayShader : DisplayShader,
  DepthShader   : DepthShader
};

export const Shaders = {};

export class glDebug {
  constructor(gl) {
    this.gl = gl;
    this.stack = [];
    this.maxTex = 25;

    this._clean_gl = this.saveGL();
    //this.fbos = [];
    this.texs = [];

    this.loadShaders();
  }

  saveDrawBufferFBOBlit() {
    let gl = this.gl;

    let oldtex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    let vp = gl.getParameter(gl.VIEWPORT);
    let oldshader = gl.getParameter(gl.CURRENT_PROGRAM);

    let fbo = new FBO(gl, vp[2], vp[3]);
    let dbuf = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    let rbuf = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);

    fbo.bind(gl);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dbuf);

    let mask = gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT;
    let filter = gl.NEAREST;

    gl.blitFramebuffer(vp[0], vp[1], vp[0]+vp[2], vp[1]+vp[3], 0, 0, vp[2], vp[3], mask, filter)

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dbuf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rbuf);

    let tex = fbo.texColor.texture;
    tex.depth = fbo.texDepth.texture;

    this.texs.push(tex);
  }

  saveDrawBuffer() {
    this.saveDrawBufferFBOBlit();
    return;

    let gl = this.gl;

    let oldtex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    let vp = gl.getParameter(gl.VIEWPORT);
    let oldshader = gl.getParameter(gl.CURRENT_PROGRAM);

    while (this.texs.length > this.maxTex) {
      let tex2 = this.texs.shift();
      gl.deleteTexture(tex2);
    }

    let tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.texs.push(tex);

    gl.finish();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vp[0], vp[1], vp[2], vp[3], 0);
    gl.finish();

    if (1) {
      let depth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depth);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, vp[0], vp[1], vp[2], vp[3], 0);
      gl.finish();

      tex.depth = depth;
    }
    gl.bindTexture(gl.TEXTURE_2D, oldtex);
  }

  loadCleanGL() {
    let obj = this._clean_gl;
    let gl = this.gl;

    for (let k in obj) {
      try {
        gl[k] = obj[k];
      } catch (error) {

      }
    }
  }

  saveGL() {
    let gl = this.gl;

    let ret = {};
    this.stack.push(ret);

    for (let k in gl) {
      ret[k] = gl[k];
    }

    return ret;
  }

  restoreGL() {
    let item = this.stack.pop();
    let gl = this.gl;

    for (let k in item) {
      try {
        gl[k] = item[k];
      } catch (err) {

      }
    }
  }

  static getDebug(gl) {
    if (gl._debug) {
      return gl._debug;
    }

    gl._debug = new glDebug(gl);

    return gl._debug;
  }

  loadShaders() {
    let gl = this.gl;

    for (let k in ShaderDef) {
      let sdef = ShaderDef[k];

      Shaders[k] = getShader(gl, sdef);
    }
  }
};

window.gldebug_sample = () => {
  let gl = getWebGL();

  if (gl._debug) {
    gl._debug.saveDrawBuffer();
  }
};