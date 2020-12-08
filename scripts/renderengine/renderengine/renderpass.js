import {DataBlock, DataRef} from '../core/lib_api.js';
import {getShader} from '../core/webgl.js';
import {loadShader, Shaders} from '../shaders/shaders.js';
import {LightGen} from '../shadernodes/shader_lib.js';
import {LayerTypes, SimpleMesh} from '../core/simplemesh.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {SceneObject, ObjectFlags} from '../sceneobject/sceneobject.js';
import {RenderEngine} from "./renderengine_base.js";
import {Mesh} from '../mesh/mesh.js';

import {Node, Graph, NodeSocketType, SocketTypes, SocketFlags, NodeFlags} from '../core/graph.js';
import {Vec3Socket, Vec4Socket, Matrix4Socket, Vec2Socket, FloatSocket, DependSocket} from "../core/graphsockets.js";

import {FBO, FramePipeline, getBlitShaderCode} from '../core/fbo.js';
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

    this.uSample = 0;
    this.weightSum = 0.0;

    this.update(gl, size);
  }

  update(gl, size) {
    let width = size[0], height = size[1];
    let drawmats = this.drawmats;

    this.uSample = this.engine.uSample;
    this.weightSum = this.engine.weightSum;

    if (this.smesh === undefined || this.size[0] != width || this.size[1] != height) {
      this.size[0] = width;
      this.size[1] = height;

      console.log("updateing framebuffer pipeline for new width/height");

      let BlitShaderSrc = getBlitShaderCode(gl);

      let lf = LayerTypes;

      this.smesh = new SimpleMesh(lf.LOC | lf.UV);
      this.smesh.program = this.blitshader = getShader(gl, BlitShaderSrc);

      this.smesh.uniforms.uSample = this.uSample;
      this.smesh.uniforms.size = this.size;
      this.smesh.uniforms.projectionMatrix = drawmats.rendermat;

      let quad = this.smesh.quad(
        [1,-1,0],
        [1,1,0],
        [-1,1,0],
        [-1,-1,0],
      );
      quad.uvs(
        [1,0,0],
        [1,1,0],
        [0,1,0],
        [0,0,0],
      );
    }

    this.smesh.uniforms = {};
    this.smesh.uniforms.uSample = this.uSample;
    this.smesh.uniforms.size = this.size;
    this.smesh.uniforms.projectionMatrix = drawmats.rendermat;
  }

  drawQuad(program, size) {
    if (program === undefined || this.smesh === undefined || this.gl === undefined) {
      console.warn("eek!", program);
      return;
    }

    let gl = this.gl;

    this.smesh.uniforms.uSample = this.uSample;
    this.smesh.uniforms.size = size;
    this.smesh.program = program;

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);
    gl.depthMask(true);

    this.smesh.draw(gl);
  }

  drawFinalQuad(fbo) {
    if (this.smesh === undefined || this.gl === undefined) {
      console.warn("eek!");
      return;
    }

    let gl = this.gl;

    this.smesh.program = this.blitshader;

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);

    this.smesh.uniforms.uSample = this.uSample;
    this.smesh.uniforms.valueScale = 1.0;
    this.smesh.uniforms.size = this.size;

    this.smesh.uniforms.rgba = fbo.texColor;
    this.smesh.uniforms.depth = fbo.texDepth;

    this.smesh.draw(gl);
  }

  renderStage(fbo, size, drawfunc) {
    let gl = this.gl;

    fbo.update(this.gl, ~~size[0], ~~size[1]);

    if (size[0] !== this.size[0] && size[1] !== this.size[1]) {
      gl.bindTexture(gl.TEXTURE_2D, fbo.texColor.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    fbo.bind(gl);

    //gl.enable(gl.DEPTH_TEST);
    //gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.depthMask(false);

    drawfunc(gl);
    gl.finish();

    //window.gldebug_sample();
    fbo.unbind(gl);
  }
}

export class RenderPass extends Node {
  constructor() {
    super();

    this.uniforms = {};
    this.sizeScale = 1.0;
    this.hasCustomSize = false;
    this.size = [0, 0];
  }

  getDebugName() {
    return this.constructor.nodedef().name;
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
      gl_FragDepth = sampleDepth(fbo_depth, v_Uv);
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
        let sock = this.inputs[k];

        for (let e of sock.edges) {
          sock.setValue(e.getValue());
        }
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

precision highp float;
precision highp sampler2DShadow;

float sampleDepth(sampler2D sampler, vec2 uv) {
  return texture2D(sampler, uv)[0];
}

uniform mat4 projectionMatrix;
uniform mat4 iprojectionMatrix;
uniform mat4 viewMatrix; //projectionMatrix minus the perspective component
uniform mat4 iviewMatrix;

uniform float uSample;
uniform vec2 size;

#ifndef WEBGL1
layout(location = 0) out vec4 fragColor;
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

precision highp float;

uniform float uSample;
uniform vec2 size;

attribute vec3 position;
attribute vec2 uv;

varying vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position.xy, 0.0, 1.0);
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

    //console.log(fragment);
    return shader;
  }

  bindInputs(rctx, program) {
    let gl = rctx.gl;

    for (let k in this.inputs) {
      if (!(this.inputs[k] instanceof FBOSocket)) {
        continue;
      }

      let fbo = this.inputs[k].getValue();

      if (!fbo.texColor) {
        console.log("Warning: missing fbo texColor for '" + this.constructor.name + ":" + this.graph_id + ":" + k + "'", fbo);
      }

      if (!fbo.texDepth) {
        console.log("Warning: missing fbo texDepth for '" + this.constructor.name + ":" + this.graph_id + ":" + k + "'", fbo);
      }

      if (fbo.texColor)
        program.uniforms[k + "_rgba"] = fbo.texColor;
      if (fbo.texDepth)
        program.uniforms[k + "_depth"] = fbo.texDepth;
    }
  }

  renderIntern(rctx) {
    let gl = rctx.gl;

    let program = this.getShader(rctx);
    if (program === undefined) {
      console.warn("bad program for render buffer");
      return;
    }

    program.uniforms.size = this.size;
    program.uniforms.uSample = rctx.engine.uSample;
    this.uniforms.uSample = rctx.engine.uSample;
    program.uniforms.projectionMatrix = rctx.drawmats.rendermat;
    program.uniforms.iprojectionMatrix = rctx.drawmats.irendermat;

    program.uniforms.viewMatrix = rctx.drawmats.cameramat;
    program.uniforms.iviewMatrix = rctx.drawmats.icameramat;

    for (let k in this.uniforms) {
      program.uniforms[k] = this.uniforms[k];
    }

    this.bindInputs(rctx, program);

    rctx.drawQuad(program, this.size);
  }

  exec(rctx) {
    let gl = rctx.gl;

    let render = (gl) => {
      this.renderIntern(rctx);
    };

    if (!this.hasCustomSize) {
      this.size = [~~(rctx.size[0] * this.sizeScale), ~~(rctx.size[1] * this.sizeScale)];
    }

    rctx.renderStage(this.outputs.fbo.data, this.size, render);
    gl.finish();

    for (let k in this.outputs) {
      let sock = this.outputs[k];

      //sock.graphUpdate();
      for (let e of sock.edges) {
        e.setValue(sock.getValue());
      }
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

  clear() {
    this.graph.clear();
  }

  exec(gl, engine, size, drawmats, scene) {
    if (this.rctx === undefined) {
      this.rctx = new RenderContext(gl, engine, size, drawmats, scene);
    }

    let rctx = this.rctx;
    rctx.update(gl, size);

    rctx.drawmats = drawmats;
    rctx.size[0] = ~~size[0];
    rctx.size[1] = ~~size[1];

    this.size[0] = ~~size[0];
    this.size[1] = ~~size[1];

    gl.viewport(0, 0, ~~size[0], ~~size[1]);

    this.graph.sort();

    let rec = (n) => {
      n.graphUpdate();

      for (let k in n.inputs) {
        let sock = n.inputs[k];

        for (let e of sock.edges) {
          e.node.graphUpdate();
        }
      }
    }

    for (let node of this.graph.sortlist) {
      if (node.constructor.name === "OutputPass") {
        rec(node);
        break;
      }
    }

    //*
    for (let node of this.graph.sortlist) {
      if (node.graph_flag & NodeFlags.UPDATE) {
        node.exec(rctx);

        for (let k in node.outputs) {
          let sock = node.outputs[k];

          for (let e of sock.edges) {
            e.setValue(sock.getValue());
          }
        }
      }
    }
    //this.graph.exec(this.rctx);
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
