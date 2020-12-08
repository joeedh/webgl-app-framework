import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as simplemesh from './simplemesh.js';
import * as webgl from './webgl.js';
import {Texture} from "./webgl.js";

let DEPTH24_STENCIL8 = 35056;
let RGBA32F = 34836;

export class FBO {
  /*
  To make a cube texture FBO, create an FBO and then
  manually set .texColor.texture and .texDepth.texture,
  also set .target to gl.TEXTURE_CUBE_MAP and .layer
  to the cube map face layer
  */
  constructor(gl, width=512, height=512) {
    this.target = gl !== undefined ? gl.TEXTURE_2D : 3553;
    this.layer = undefined; //used if target is not gl.TEXTURE_2D

    this.ctype = RGBA32F;
    this.dtype = DEPTH24_STENCIL8;

    this.gl = gl;
    this.fbo = undefined;
    this.regen = true;
    this.size = new Vector2([width, height]);
    this.texDepth = undefined;
    this.texColor = undefined;

  }

  copy(copy_buffers=false) {
    let ret = new FBO();

    ret.size = new Vector2(this.size);
    ret.gl = this.gl;

    if (!copy_buffers || !this.gl || !this.fbo) {
      return ret;
    }

    ret.create(this.gl);

    let gl = this.gl;

    //ret.texColor = this.texColor.copy(gl, true);
    //ret.texDepth = this.texDepth.copy(gl, true);

    return ret;
  }

  create(gl) {
    console.warn("fbo create");

    if (this.fbo && this.gl) {
      this.destroy();
    }

    this.regen = 0;

    gl = this.gl = gl === undefined ? this.gl : gl;

    this.size[0] = ~~this.size[0];
    this.size[1] = ~~this.size[1];

    //console.trace("framebuffer creation");

    this.fbo = gl.createFramebuffer();

    if (!this.texDepth)
      this.texDepth = new webgl.Texture(undefined, gl.createTexture());
    if (!this.texColor)
      this.texColor = new webgl.Texture(undefined, gl.createTexture());

    let target = this.target;
    let layer = this.layer;

    function texParams(target, tex) {
      gl.bindTexture(target, tex.texture);

      tex.texParameteri(gl, target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      tex.texParameteri(gl, target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      tex.texParameteri(gl, target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      tex.texParameteri(gl, target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      if (target !== gl.TEXTURE_2D) {
        tex.texParameteri(gl, target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      }
    }

    texParams(this.target, this.texDepth);
    if (gl.haveWebGL2) {
      this.texDepth.texParameteri(gl, this.target, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      //gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      //gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, gl.ALWAYS);
    }

    texParams(this.target, this.texColor);

    let initTex = (tex, dtype, dtype2, dtype3) => {
      if (this.target !== gl.TEXTURE_2D)
        return;

      if (gl.haveWebGL2) {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
        //  gl.texStorage2D(gl.TEXTURE_2D, 1, dtype, this.size[0], this.size[1]);
      } else {
        tex.texImage2D(gl, this.target, 0, dtype, this.size[0], this.size[1], 0, dtype2, dtype3, null);
      }
    };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    let dtype = this.dtype;
    let dtype2 = gl.DEPTH_STENCIL;

    //UNSIGNED_INT_24_8
    let dtype3 = gl.haveWebGL2 ? gl.UNSIGNED_INT_24_8 : gl.depth_texture.UNSIGNED_INT_24_8_WEBGL;

    gl.bindTexture(this.target, this.texDepth.texture);
    initTex(this.texDepth, dtype, dtype2, dtype3);

    let ctype = this.ctype;
    let ctype2 = gl.RGBA, ctype3 = gl.FLOAT;

    gl.bindTexture(target, this.texColor.texture);
    initTex(this.texColor, ctype, ctype2, ctype3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    if (this.target === gl.TEXTURE_2D) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColor.texture, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, this.texDepth.texture, 0);
    } else {
      let target2 = target;

      if (target === gl.TEXTURE_CUBE_MAP) {
        target2 = layer;
      }

      if (DEBUG.fbo) {
        console.log("TARGET2", target2);
      }

      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target2, this.texColor.texture, 0);
      if (target === gl.TEXTURE_2D) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture, 0);
      } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, target2, this.texDepth.texture, 0);
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, target2, this.texDepth.texture, 0);
      }
    }

    let errret = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    if (DEBUG.fbo) {
      console.log("FBO STATUS:", errret, webgl.constmap[errret]);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(gl) {
    this._last_viewport = gl.getParameter(gl.VIEWPORT);

    gl = this.gl = gl === undefined ? this.gl : gl;

    if (this.regen) {
      this.create(gl);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size[0], this.size[1]);
  }

  _getQuad(gl, width, height, program) {
    width = ~~width;
    height = ~~height;

    if (this.smesh === undefined || this.size[0] != width || this.size[1] != height) {
      let lf = simplemesh.LayerTypes;
      this.smesh = new simplemesh.SimpleMesh(lf.LOC | lf.UV);

      let quad = this.smesh.quad([-1,-1,0], [-1,1,0], [1,1,0], [1,-1,0]);
      quad.uvs([0,0,0], [0,1,0], [1,1,0], [1,0,0]);
    }

    if (program) {
      this.smesh.program = program;
    } else {
      this.smesh.program = this.blitshader = webgl.getShader(gl, getBlitShaderCode(gl));
    }

    return this.smesh;
  }

  /**
   * Draws depth texture to rgba
   * Does not bind framebuffer.
   * */
  drawDepth(gl, width, height, tex) {
    let quad = this._getQuad(gl, width, height);

    quad.program = this.blitshader;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    let dither = gl.getParameter(gl.DITHER);

    gl.disable(gl.DITHER);

    quad.draw(gl, {
      rgba  : tex,
      depth : tex,
      size : [width, height],
      valueScale : 1.0
    });

    if (dither) {
      gl.enable(gl.DITHER);
    }
  }

  drawQuadScaled(gl, width, height, tex=this.texColor, value_scale=1.0, depth=this.texDepth) {
    let quad = this._getQuad(gl, width, height);

    quad.program = this.blitshader;
    quad.uniforms.rgba = tex;
    quad.uniforms.depth = depth;
    quad.uniforms.valueScale = value_scale;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.smesh.draw(gl);
  }
  /**
   * Draws texture to screen
   * Does not bind framebuffer
   * */
  drawQuad(gl, width, height, tex=this.texColor, depth=this.texDepth, program=undefined, uniforms=undefined) {
    let quad = this._getQuad(gl, width, height, program);

    if (program) {
      quad.program = program;
    } else {
      quad.program = this.blitshader;
    }

    quad.uniforms.rgba = tex;
    quad.uniforms.depth = depth;
    quad.uniforms.valueScale = 1.0;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    this.smesh.draw(gl, uniforms);
  }

  unbind(gl) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let vb = this._last_viewport;
    if (!vb) {
      return;
    }

    gl.viewport(vb[0], vb[1], vb[2], vb[3]);
  }

  destroy() {
    if (this.fbo !== undefined) {
      this.gl.deleteFramebuffer(this.fbo);

      if (this.target === this.gl.TEXTURE_2D) {
        this.gl.deleteTexture(this.texDepth.texture);
        this.gl.deleteTexture(this.texColor.texture);
      }

      this.texDepth.texture = this.texColor.texture = undefined;
      this.fbo = undefined;
    }
  }

  update(gl, width, height) {
    width = ~~width;
    height = ~~height;

    /*
    function get2(f) {
      let f2 = Math.ceil(Math.log(f) / Math.log(2.0));
      return Math.pow(2.0, f2);
    }

    width = ~~get2(width);
    height = ~~get2(height);
    //*/

    gl = this.gl = gl === undefined ? this.gl : gl;

    if (width !== this.size[0] || height !== this.size[1] || gl !== this.gl) {
      console.log("fbo update", width, height);
      this.size[0] = width;
      this.size[1] = height;

      if (this.gl === undefined || gl === this.gl) {
        this.destroy(gl);
      }

      this.texDepth = this.texColor = undefined;
      this.create(gl);
    }
  }
}

export class FrameStage extends FBO {
  constructor(shader, width=512, height=512) {
    super(undefined, width, height);

    this.shader = shader;
  }

  update(gl, width, height) {
    if (gl === undefined || width === undefined || height === undefined) {
      console.log("bad arguments to fbo.FrameStage.update()", arguments);
      throw new Error("bad arguments to fbo.FrameStage.update()");
    }

    super.update(gl, width, height);
  }
}

export let BlitShaderGLSL200 = {
  vertex : `
precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;

attribute vec3 position;
attribute vec2 uv;

varying vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position, 1.0);
  v_Uv = uv;
}
    
  `,
  fragment : `
#extension GL_EXT_frag_depth : require

precision mediump float;


uniform sampler2D rgba;
uniform sampler2D depth;
uniform float valueScale;

varying vec2 v_Uv;

void main(void) {
  vec4 color = texture2D(rgba, v_Uv);
  gl_FragColor = vec4(color.rgb*valueScale, color.a);
  gl_FragDepthEXT = texture2D(depth, v_Uv)[0];
}

  `,
  uniforms : {},
  attributes : ["position", "uv"]
};

export let BlitShaderGLSL300 = {
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
uniform float valueScale;

in vec2 v_Uv;
out vec4 fragColor;

void main(void) {
  vec4 color = texture(rgba, v_Uv);
  float d = texture(depth, v_Uv)[0];
  
  //color[0] = color[1] = color[2] = d*0.9;
  
  fragColor = vec4(color.rgb*valueScale, color.a);
  
  gl_FragDepth = texture(depth, v_Uv)[0];
}

  `,
  uniforms : {},
  attributes : ["position", "uv"]
};

export class FramePipeline {
  constructor(width=512, height=512) {
    this.stages = [new FrameStage()];
    this.size = new Vector2([width, height]);
    this.smesh = undefined;

    this._texs = [
      new webgl.Texture(0),
      new webgl.Texture(1),
      new webgl.Texture(2),
      new webgl.Texture(3),
      new webgl.Texture(4),
      new webgl.Texture(5)
    ];
  }

  destroy(gl) {
    for (let stage of this.stages) {
      stage.destroy(gl);
    }

    if (this.smesh !== undefined) {
      this.smesh.destroy(gl);
      this.smesh = undefined;
    }
    this.stages = undefined;
  }

  //see webgl.getShader for shaderdef, ignore old loadShader cruft
  addStage(gl, shaderdef) {
    let shader = webgl.getShader(gl, shaderdef);
    let stage = new FrameStage(shader, this.size[0], this.size[1]);

    this.stages.push(stage);
    return stage;
  }

  draw(gl, drawfunc, width, height, drawmats) {
    if (this.smesh === undefined || this.size[0] != width || this.size[1] != height) {
      this.size[0] = width;
      this.size[1] = height;

      console.log("updateing framebuffer pipeline for new width/height");

      let lf = simplemesh.LayerTypes;
      this.smesh = new simplemesh.SimpleMesh(lf.LOC | lf.UV);

      this.smesh.program = this.blitshader = webgl.getShader(gl, getBlitShaderCode(gl));
      this.smesh.uniforms.iprojectionMatrix = drawmats.irendermat;
      this.smesh.uniforms.projectionMatrix = drawmats.rendermat;

      let quad = this.smesh.quad([-1,-1,0], [-1,1,0], [1,1,0], [1,-1,0])
      quad.uvs([0,0,0], [0,1,0], [1,1,0], [1,0,0]);
    }

    //do first stage
    let stage = this.stages[0];

    stage.update(gl, width, height);
    stage.bind(gl);

    gl.viewport(0, 0, this.size[0], this.size[1]);

    gl.enable(gl.DEPTH_TEST);

    gl.clearDepth(1000000.0);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    drawfunc(gl);
    let laststage = stage;

    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);

    for (let i=1; i<this.stages.length; i++) {
      let stage = this.stages[i];

      stage.update(gl, width, height);

      this._texs[0].texture = laststage.texColor.texture;
      stage.shader.uniforms.rgba = this._texs[0];

      this._texs[1].texture = laststage.texDepth.texture;
      stage.shader.uniforms.depth = this._texs[1];

      stage.shader.uniforms.size = this.size;

      this.smesh.program = stage.shader;
      stage.bind(gl);

      this.smesh.draw(gl);

      laststage = stage;
    }
  }

  drawFinal(gl, stage=undefined) {
    if (stage === undefined) {
      stage = this.stages[this.stages.length-1];
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(1);

    this.smesh.program = this.blitshader;
    this.blitshader.uniforms.rgba = this._texs[0];
    this.blitshader.uniforms.depth = this._texs[1];
    this.blitshader.uniforms.size = this.size;

    this._texs[0].texture = stage.texColor.texture;
    this._texs[1].texture = stage.texDepth.texture;

    this.smesh.draw(gl);
  }
}

export function getBlitShaderCode(gl) {
  if (gl.haveWebGL2) {
    return BlitShaderGLSL300;
  } else {
    return BlitShaderGLSL200;
  }
}

