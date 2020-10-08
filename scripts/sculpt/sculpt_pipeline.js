import {Node, Graph} from '../core/graph.js';
import {NodeFlags} from "../core/graph.js";
import {NodeSocketType} from "../core/graph.js";
import {FBO} from "../core/fbo.js";
import {util, nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';

export class PipeBufferSocket extends NodeSocketType {
  constructor() {
    super();

    this.data = new FBO();
  }

  setValue(d) {
    this.data = d;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    super.copyTo(b);

    b.data = this.data;
  }
}
PipeBufferSocket.STRUCT = STRUCT.inherit(PipeBufferSocket, NodeSocketType) + `
}
`;
nstructjs.register(PipeBufferSocket);
NodeSocketType.register(PipeBufferSocket);

let shadercache = {};

export class PipelineNode extends Node {
  constructor() {
    super();

    this.outputSize = [0, 0];
    this.uniforms = {};
    this.fbo = new FBO();
    this.program = undefined;
    this.shaderPre = this.constructor.nodedef().shaderPre || "";
    this.shaderCode = this.constructor.nodedef().shader || "";
  }

  static nodedef() {return {
    codePre : '',
    code : '',
    flag : NodeFlags.FORCE_SOCKET_INHERIT,
    inputs : {

    },
    outputs : {
      data : new PipeBufferSocket()
    },
    uniforms : {}
  }}

  genShader(pctx) {
    let pre = this.shaderPre;

    for (let k in this.inputs) {
      let sock = this.inputs[k];
      if (sock instanceof PipeBufferSocket) {
        pre += "uniform sampler2D in_" + sock.name + ";\n"
      }
    }

    let vcode = `#version 300 es
precision highp float;

in vec2 pos;
in vec2 in_uv;

out vec2 uv;
void main(void) {
  gl_Position = vec4(pos, 0.0, 1.0);
  uv = in_uv;
} 
  `;

    let fcode = `#version 300 es
precision highp float;

uniform mat4 projectionMatrix;

in vec2 uv;
${pre}

vec2 packuv(float f, vec2 size) {
  float x = floor(mod(f, size[0])+0.00001);
  float y = floor(f / size[0] + 0.0001);
  
  return y + x;
}

void main(void) {
${this.shaderCode};
}`;

  }

  renderIntern(pctx) {
    this.genShader(pctx);
  }
  exec(pctx) {
    let gl = pctx.gl;

    for (let k in this.inputs) {
      let sock = this.inputs;
      if (sock instanceof PipeBufferSocket) {
        this.uniforms["in_" + sock.name] = sock;
        this.uniforms["in_" + size.name + "_size"] = sock.data.size;
      }
    }

    this.fbo.update(gl, this.outputSize[0], this.outputSize[1]);
    this.outputs.data.setValue(this.fbo);

    this.fbo.bind(gl);
    this.renderIntern(pctx);
    this.fbo.unbind(gl);

    for (let k in this.outputs) {
      this.outputs[k].graphUpdate();
    }
  }
}

export class SculptPipeline {
  constructor() {
    this.graph = new Graph();
  }

  add(n) {
    this.graph.add(n);
  }

  remove(n) {
    this.graph.remove(n);
  }

  exec(pctx) {
    this.graph.exec(pctx);
  }
}
/*
* data formats:
*
* vert:
* flag x y z nx ny nz
*
* edge:
* flag v1 v2 t1 t2
*
* tri:
* flag e1 e2 e3 v1 v2 v3 //es and vs are ids
*
* */
function addSplitPipeline(pipeline, maxEdgeLen) {

  class Pass1 extends PipelineNode {
    constructor() {
      super();
    }

    static nodedef() {return {
      name : "pass1",
      uniforms : {
        uEdgeLimit : maxEdgeLen,
        verts1 : new PipeBufferSocket(),
        verts2 : new PipeBufferSocket(),
        tris1 : new PipeBufferSocket(),
        tris2 : new PipeBufferSocket()
      },

      shaderPre : `
      uniform float uEdgeLimit;
      
      #define FLAG 0
      #define E1 1
      #define E2 2
      #define E3 3
      #define V1 0
      #define V2 1
      #define V3 2
      
      #define PI 3.14159265453
      
      vec3 getVertCo(float i) {
        vec2 uv2 = packuv(tri2[V1], in_verts1_size);
        return texture(in_verts1, uv2).gba;
      }
      `,

      shaderCode : `
        vec4 tri1 = texture(in_tris1, uv);
        vec4 tri2 = texture(in_tris2, uv);
        
        vec2 uv2 = packuv(tri2[V1], in_verts1_size);
        vec3 v1 = getVertCo(tri2[V1]);
        vec3 v2 = getVertCo(tri2[V2]);
        vec3 v3 = getVertCo(tri2[V1]);
        
        float l1 = length(v2 - v1);
        float l2 = length(v3 - v2);
        float l3 = length(v1 - v3);
        
        vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
        float del = 0.0;
        
        if (l1 > uEdgeLimit) {
          color[0] += 1;
          del = 1.0;
        }        
        if (l2 > uEdgeLimit) {
          color[1] += 2;
          del = 1.0;
        }        
        if (l3 > uEdgeLimit) {
          color[2] += 4;
          del = 1.0;
        }
        
      `
    }}
  }
}
