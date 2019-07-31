import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as simplemesh from './simplemesh.js';
import * as webgl from './webgl.js';
import {Texture} from "./webgl.js";

export class FBO {
  constructor(gl, width=512, height=512) {
    this.gl = gl;
    this.fbo = undefined;
    this.regen = true;
    this.size = [width, height];
    this.texDepth = undefined;
  }

  copy() {
    let ret = new FBO();

    ret.size = [this.size[0], this.size[1]];
    ret.gl = this.gl;

    return ret;
  }

  create(gl) {
    gl = this.gl = gl === undefined ? this.gl : gl;
    
    //console.trace("framebuffer creation");
    
    this.fbo = gl.createFramebuffer();
    this.texDepth = new webgl.Texture(undefined, gl.createTexture());
    this.texColor = new webgl.Texture(undefined, gl.createTexture());


    webgl.Texture.defaultParams(gl, this.texDepth.texture);
    webgl.Texture.defaultParams(gl, this.texColor.texture);

    gl.bindTexture(gl.TEXTURE_2D, this.texDepth.texture);
    //let type = gl.depth_texture.UNSIGNED_INT_24_8_WEBGL;
    
    let type = gl.UNSIGNED_INT;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, this.size[0], this.size[1], 0, gl.DEPTH_COMPONENT, type, null);
    
    gl.bindTexture(gl.TEXTURE_2D, this.texColor.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size[0], this.size[1], 0, gl.RGBA, gl.FLOAT, null);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.texDepth.texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColor.texture, 0);
  }
  
  bind(gl) {
    gl = this.gl = gl === undefined ? this.gl : gl;
    
    if (this.regen) {
      this.regen = 0;
      this.create();
    }
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
  }

  unbind(gl) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy() {
    if (this.fbo !== undefined) {
      this.gl.deleteFramebuffer(this.fbo);
      this.gl.deleteTexture(this.texDepth.texture);
      this.gl.deleteTexture(this.texColor.texture);
      this.fbo = undefined;
    }
  }
  
  update(gl, width, height) {
    gl = this.gl = gl === undefined ? this.gl : gl;
    
    if (width !== this.size[0] || height !== this.size[1]) {
      console.log("fbo update", width, height);
      this.size[0] = width;
      this.size[1] = height;
      
      this.destroy();
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

export let BlitShader = {
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

varying vec2 v_Uv;

void main(void) {
gl_FragColor = texture2D(rgba, v_Uv);
gl_FragDepthEXT = texture2D(depth, v_Uv)[0];
}

  `,
  uniforms : {},
  attributes : ["position", "uv"]
}

export class FramePipeline {
  constructor(width=512, height=512) {
    this.stages = [new FrameStage()];
    this.size = [width, height];
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
      this.smesh.program = this.blitshader = webgl.getShader(gl, BlitShader);
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
    gl.clearColor(0.3, 0.4, 1.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    drawfunc(gl);
    let laststage = stage;

    gl.depthMask(1);
    gl.disable(gl.DEPTH_TEST);
    
    for (let i=1; i<this.stages.length; i++) {
      let stage = this.stages[i];
      
      stage.update(gl, width, height);
      
      stage.shader.uniforms.rgba = this._texs[0];
      this._texs[0].texture = laststage.texColor.texture;
      
      stage.shader.uniforms.depth = this._texs[1];
      this._texs[1].texture = laststage.texDepth.texture;
      
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
