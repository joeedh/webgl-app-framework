import {Area} from '../../path.ux/scripts/screen/ScreenArea.js';

import '../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;

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

export class FBOHistory extends Array {
  constructor(max=5) {
    super();
    this.max = max;
  }

  push(fbo) {
    let fbo2;

    if (!fbo.gl) {
      console.warn("bad fbo passed to FBOHistory.push", fbo);
      return;
    }

    let gl = fbo.gl;

    if (this.length >= this.max) {
      fbo2 = this.shift();
    }

    //*
    if (fbo2 && fbo2.fbo && fbo2.texColor && fbo2.size.vectorDistance(fbo.size) < 0.0001) {
      //console.log("reusing fbo2");
      //fbo.texColor.copyTexTo(fbo.gl, fbo2.texColor);

    } else {
      if (fbo2 && fbo2.gl && fbo2.fbo) {
        fbo2.destroy(fbo2.gl);
      }

      fbo2 = fbo.copy(false);
      fbo2.create(gl);
    }

    //fbo.bind(fbo.gl);

    //gl.bindTexture(gl.TEXTURE_2D, fbo2.texColor.texture);
    //gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, fbo.size[0], fbo.size[1], 0);
    //fbo.unbind(fbo.gl);
    fbo2.bind(fbo.gl);
    fbo.drawQuad(fbo.gl, fbo.size[0], fbo.size[1]);
    fbo2.unbind(fbo.gl);

    return super.push(fbo2);
  }

  get head() {
    return this[this.length-1];
  }
}

export class glDebug {
  constructor(gl) {
    this.gl = gl;
    this.stack = [];
    this.maxTex = 25;

    this._clean_gl = this.saveGL();
    //this.fbos = [];
    this.texs = [];
    this.fbos = {};

    this.loadShaders();
  }

  get debugEditorOpen() {
    for (let sarea of _appstate.screen.sareas) {
      if (sarea.area.constructor.define().areaname === "DebugEditor") {
        return true;
      }
    }

    return false;
  }

  pushFBO(name="draw", fbo, only_if_debug_editor=true) {
    //fbo = fbo.copy()

    if (only_if_debug_editor && !this.debugEditorOpen) {
      return;
    }

    if (!(name in this.fbos))  {
      this.fbos[name] = new FBOHistory();
    }

    this.fbos[name].push(fbo);
  }

  saveDrawBufferFBOBlit(name) {
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

    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dbuf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rbuf);

    this.pushFBO(name, fbo);
  }

  saveDrawBuffer(name) {
    this.saveDrawBufferFBOBlit(name);
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
    return getFBODebug(gl);
  }

  loadShaders() {
    let gl = this.gl;

    for (let k in ShaderDef) {
      let sdef = ShaderDef[k];

      Shaders[k] = getShader(gl, sdef);
    }
  }
};

let gldebug = undefined;
export function getFBODebug(gl) {
  if (!gl) {
    throw new Error("gl cannot be undefined in getFBODebug()");
  }

  if (!gldebug || gldebug.gl !== gl) {
    if (gldebug) {
      //if this was caused by a context loss, don't call gl destroy
      //functions, stead just clear all references.
      gldebug.fbos = gldebug.texs = gldebug.stack = gldebug.gl = gldebug._clean_gl = undefined;
    }

    gldebug = new glDebug(gl);
  }

  return gldebug;
}

window.gldebug_sample = () => {
  let gl = getWebGL();

  if (gl._debug) {
    gl._debug.saveDrawBuffer();
  }
};
