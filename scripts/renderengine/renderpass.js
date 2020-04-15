import {DataBlock, DataRef} from '../core/lib_api.js';
import {getShader} from '../core/webgl.js';
import {loadShader, Shaders} from '../editors/view3d/view3d_shaders.js';
import {LightGen} from '../shadernodes/shader_lib.js';
import {LayerTypes, SimpleMesh} from '../core/simplemesh.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {SceneObject, ObjectFlags} from '../sceneobject/sceneobject.js';
import {RenderEngine} from "./renderengine_base.js";
import {Mesh} from '../mesh/mesh.js';

import {Node, Graph, NodeSocketType, SocketTypes, SocketFlags, NodeFlags} from '../core/graph.js';
import {Vec3Socket, Vec4Socket, Matrix4Socket, Vec2Socket, FloatSocket, DependSocket} from "../core/graphsockets.js";

import {FBO, FramePipeline, BlitShader, BlitShaderGLSL300} from '../core/fbo.js';
import {getWebGL} from "../editors/view3d/view3d.js";

export class FBOSocket extends NodeSocketType {
  constructor() {
    super();

    this.data = new FBO();
  }

  copyTo(b) {
    super.copyTo(b);

    b.data = this.data.copy();

    return this;
  }

  copy() {
    let ret = new FBOSocket();
    this.copyTo(ret);
    return ret;
  }

  getValue() {
    return this.data;
  }

  setValue(val) {
    if (this.data === val) {
      return;
    }

    if (this.data.gl !== undefined) {
      this.data.destroy(this.data.gl);
    }

    this.data = val;
  }

  static nodedef() {return {
    uiname : "Render Buffer",
    name   : "FBO",
    color  : [0.5, 0.85, 1.0, 1.0]
  }}
}

export class RenderContext {
  constructor(gl, engine, size, drawmats, scene) {
    this.gl = gl;
    this.scene = scene;
    this.drawmats = drawmats;
    this.smesh = undefined;
    this.engine = engine;
    this.size = [size[0], size[1]];
    this.pipeline = new FramePipeline(size[0], size[1]);

    this.uSample = 0;

    this.update(gl, size);
  }

  update(gl, size) {
    let width = size[0], height = size[1];
    let drawmats = this.drawmats;
    this.uSample = this.engine.uSample;

    if (this.smesh === undefined || this.size[0] != width || this.size[1] != height) {
      this.size[0] = width;
      this.size[1] = height;

      console.log("updateing framebuffer pipeline for new width/height");

      let BlitShaderSrc = gl.haveWebGL2 ? BlitShaderGLSL300 : BlitShader;

      let lf = LayerTypes;
      this.smesh = new SimpleMesh(lf.LOC | lf.UV);
      this.smesh.program = this.blitshader = getShader(gl, BlitShaderSrc);
      this.smesh.uniforms.uSample = this.uSample;
      this.smesh.uniforms.size = this.size;
      this.smesh.uniforms.projectionMatrix = drawmats.rendermat;

      let quad = this.smesh.quad([-1,-1,0], [-1,1,0], [1,1,0], [1,-1,0])
      quad.uvs([0,0,0], [0,1,0], [1,1,0], [1,0,0]);
    }
  }

  drawQuad(program, draw_depth=false) {
    if (program === undefined || this.smesh === undefined || this.gl === undefined) {
      console.warn("eek!", program);
      return;
    }

    let gl = this.gl;

    this.smesh.uniforms.uSample = this.uSample;
    this.smesh.uniforms.size = this.size;
    this.smesh.program = program;

    if (draw_depth) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    } else {
      //gl.depthMask(false);
    }

    /*
    if (draw_depth) {
      gl.enable(gl.DEPTH_TEST);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.enable(gl.BLEND);

    gl.depthMask(draw_depth);
    //*/

    this.smesh.draw(gl);
    //gl.enable(gl.DEPTH_TEST);
    //gl.depthMask(true);
  }

  drawFinalQuad(fbo) {
    if (this.smesh === undefined || this.gl === undefined) {
      console.warn("eek!");
      return;
    }

    let gl = this.gl;

    this.smesh.program = this.blitshader;
    this.smesh.uniforms.uSample = this.uSample;
    this.smesh.uniforms.size = this.size;

    this.smesh.uniforms.rgba = fbo.texColor;
    this.smesh.uniforms.depth = fbo.texDepth;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    this.smesh.draw(gl);
  }

  renderStage(fbo, drawfunc, input_fbos) {
    let gl = this.gl;

    fbo.update(this.gl, this.size[0], this.size[1]);
    fbo.bind(gl);

    gl.viewport(0, 0, ~~this.size[0], ~~this.size[1]);

    //gl.enable(gl.DEPTH_TEST);
    //gl.depthMask(true);
    //gl.disable(gl.DEPTH_TEST);
    //gl.depthMask(false);

    if (this.uSample == 0) {
      gl.clearDepth(5000000.0);
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    drawfunc(gl);

    //window.gldebug_sample();
    fbo.unbind(gl);
  }
}

export class RenderPass extends Node {
  constructor() {
    super();

    this.uniforms = {};
  }

  getOutput() {
    return this.outputs.fbo.getValue();
  }

  static nodedef() {return {
    inputs : {
      fbo : new FBOSocket()
    },
    outputs : {
      fbo : new FBOSocket()
    },
    shader : `
      gl_FragColor = texture2D(fbo_rgba, v_Uv);
      gl_FragDepthEXT = texture2D(fbo_depth, v_Uv)[0];
    `,
    shaderPre : ``
  }}

  getShader(rctx) {
    if (this._shader === undefined) {
      this.compileShader(rctx);
    }

    return this._shader;
  }

  compileShader(rctx) {
    let gl = rctx.gl;
    let fragment = this.shader !== undefined ? this.shader : this.constructor.nodedef().shader;
    let shaderPre = this.shaderPre !== undefined ? this.shaderPre : this.constructor.nodedef().shaderPre;
    shaderPre = shaderPre === undefined ? '' : shaderPre;

    let have_webgl2 = gl.haveWebGL2;

    let samplers = '';
    for (let k in this.inputs) {
      if (!(this.inputs[k] instanceof FBOSocket)) {
        continue;
      }

      samplers += 'uniform sampler2D ' + k + "_rgba;\n";
      samplers += 'uniform sampler2D ' + k + "_depth;\n";
    }
    fragment = `${have_webgl2 ? "#version 300 es" : ""}
${!have_webgl2 ? "#define WEBGL1" : ""}
#ifdef WEBGL1
#extension GL_EXT_frag_depth : require
#define gl_FragDepth gl_FragDepthEXT
#else
#define texture2D texture
#define varying in
#endif

precision mediump float;

uniform mat4 projectionMatrix;
uniform mat4 iprojectionMatrix;
uniform mat4 viewMatrix; //projectionMatrix minus the perspective component
uniform mat4 iviewMatrix;

uniform float uSample;
uniform vec2 size;

#ifndef WEBGL1
out vec4 fragColor;
#define gl_FragColor fragColor
#endif

${shaderPre}
${samplers}

varying vec2 v_Uv;
  
void main(void) {
${fragment}
}
`;
    let vertex = `${have_webgl2 ? "#version 300 es" : ""}
${!have_webgl2 ? "#define WEBGL1" : ""}    
#ifdef WEBGL1
#extension GL_EXT_frag_depth : require
#else
#define texture2D texture
#define varying out
#define attribute in
#endif

precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;
uniform float uSample;
uniform vec2 size;

attribute vec3 position;
attribute vec2 uv;

varying vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position, 1.0);
  v_Uv = uv;
}
    `;

    let shader = {
      vertex     : vertex,
      fragment   : fragment,
      attributes : ["position", "uv"],
      uniforms : {

      }
    };

    this._shader = loadShader(gl, shader);

    return shader;
  }

  renderIntern(rctx, draw_depth=false) {
    let program = this.getShader(rctx);
    let gl = rctx.gl;

    if (program === undefined) {
      console.warn("bad program for render buffer");
      return;
    }

    program.uniforms.size = rctx.size;
    program.uniforms.uSample = rctx.engine.uSample;
    this.uniforms.uSample = rctx.engine.uSample;
    program.uniforms.projectionMatrix = rctx.drawmats.rendermat;
    program.uniforms.iprojectionMatrix = rctx.drawmats.irendermat;

    program.uniforms.viewMatrix = rctx.drawmats.cameramat;
    program.uniforms.iviewMatrix = rctx.drawmats.icameramat;

    for (let k in this.uniforms) {
      program.uniforms[k] = this.uniforms[k];
    }

    for (let k in this.inputs) {
      if (!(this.inputs[k] instanceof FBOSocket)) {
        continue;
      }

      let fbo = this.inputs[k].getValue();

      if (!fbo.texColor) {
        console.log("Warning: missing fbo for '" + this.constructor.name + ":" + this.graph_id + ":" + k + "'", fbo);
      }
      
      if (fbo.texColor)
        program.uniforms[k + "_rgba"] = fbo.texColor;
      if (fbo.texDepth)
        program.uniforms[k + "_depth"] = fbo.texDepth;
    }

    rctx.drawQuad(program, draw_depth);
  }

  exec(rctx) {
    let gl = rctx.gl;

    let render = (gl) => {
      this.renderIntern(rctx);
    };

    let inputs = {};
    for (let k in this.inputs) {
      let sock = this.inputs[k];

      if (sock instanceof FBOSocket) {
        inputs[k] = sock.getValue();
      }
    }

    rctx.renderStage(this.outputs.fbo.getValue(), render, inputs);

    //don't use NodeSocketType.prototype.update, it likes to copy values
    for (let k in this.outputs) {
      let sock = this.outputs[k];

      if (sock instanceof FBOSocket) {
        for (let e of sock.edges) {
          e.data = sock.data;
        }
      } else {
        sock.update();
      }

      sock.node.update();
    }
  }
}

export class RenderGraph {
  constructor() {
    this.graph = new Graph();
    this.smesh = undefined;
    this.uniforms = {};
    this.size = [512, 512];
  }

  exec(gl, engine, size, drawmats, scene) {
    if (this.rctx === undefined) {
      this.rctx = new RenderContext(gl, engine, size, drawmats, scene);
    }

    let rctx = this.rctx;

    rctx.update(gl, size);

    this.graph.sort();
    for (let node of this.graph.sortlist) {
      node.update();
    }

    this.graph.exec(this.rctx);
  }

  add(node) {
    this.graph.add(node);
    return this;
  }

  remove(node) {
    this.graph.remove(node);
    return this;
  }
}
