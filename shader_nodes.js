simport {DataBlock, DataRef} from '../core/lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags, SocketTypes} from '../core/graph.js';
import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DependSocket, Vec2Socket, Vec3Socket, RGBASocket, Vec4Socket, Matrix4Socket, FloatSocket} from "../core/graphsockets.js";
import {UIBase} from '../path.ux/scripts/core/ui_base.js';
import {Container} from '../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {AbstractGraphClass} from '../core/graph_class.js';
import {ShaderFragments, LightGen, DiffuseBRDF} from './shader_lib.js';
import {Light, LightTypes} from '../light/light.js';
import {loadShader} from "../shaders/shaders.js";

export {ClosureGLSL, PointLightCode} from './shader_lib.js';

export let ShaderNodeTypes = [];

export class ShaderNetworkClass extends AbstractGraphClass {
  static graphdef() {return {
    typeName    : "shader",
    uiName      : "Shader Network",
    graph_flag  : 0
  }}
}
ShaderNetworkClass.NodeTypes = ShaderNodeTypes;

AbstractGraphClass.registerClass(ShaderNetworkClass);

export class Closure {
  constructor() {
    this.emission = new Vector3();
    this.light = new Vector3([1, 0.75, 0.5]);
    this.scatter = new Vector3();
    this.normal = new Vector3();
    this.roughness = 0.1;
    this.alpha = 1.0;
  }

  load(b) {
    this.emission.load(b.emission);
    this.light.load(b.light);
    this.scatter.load(b.scatter);
    this.normal = new Vector3();
    this.roughness = b.roughness;
    this.alpha = b.alpha;

    return this;
  }

  copy() {
    return new Closure().load(this);
  }
}
Closure.STRUCT = `
shader.Closure {
  emission   : vec3;
  light      : vec3;
  scatter    : vec3;
  normal     : vec3;
  roughness  : float;
  alpha      : float;
}
`;
nstructjs.manager.add_class(Closure);

export class ClosureSocket extends NodeSocketType {
  constructor() {
    super();

    this.data = new Closure();
  }

  copyValue(b) {
    return this.data.copy();
  }

  getValue(b) {
    return this.data;
  }

  copyTo(b) {
    super.copyTo(b);

  }

  copy() {
    let ret = new ClosureSocket();
    this.copyTo(ret);

    ret.data.load(this.data);
    return ret;
  }

  static nodedef() {return {
    name   : "closure",
    uiname : "Surface",
    color  : "rgba(150, 200, 255, 1.0)",
    flag   : 0
  }}

  setValue(b) {
    this.data.load(b);
  }
}
ClosureSocket.STRUCT = STRUCT.inherit(ClosureSocket, NodeSocketType, "shader.ClosureSocket") + `
  data : shader.Closure;
}
`;
nstructjs.register(ClosureSocket);
NodeSocketType.register(ClosureSocket);

export const ShaderContext = {
  GLOBALCO : 1,
  LOCALCO  : 2,
  SCREENCO : 4,
  NORMAL   : 8,
  UV       : 16,
  COLOR    : 32,
  TANGENT  : 64,
  ID       : 128
};

export class ShaderGenerator {
  update(gl, scene, graph) {
    if (this._regen) {
      this._regen = false;

      this.scene = scene;
      this.graph = graph;

      let shaderdef = this.generate(graph);
      this.glshader = shaderdef.compile(gl);
    }
  }

  bind(gl, uniforms) {
    this.glshader.bind(gl, uniforms);
  }

  constructor(scene) {
    this._regen = true;
    this.scene = scene;
    this.paramnames = {};
    this.uniforms = {};

    this.buf = '';
    this.vertex = undefined;

    let p = this.paramnames;

    p[ShaderContext.LOCALCO] = 'vLocalCo';
    p[ShaderContext.GLOBALCO] = 'vGlobalCo';
    p[ShaderContext.NORMAL] = 'vNormal';
    p[ShaderContext.UV] = 'vUv';
    p[ShaderContext.COLOR] = 'vColor';
    p[ShaderContext.TANGENT] = 'vTangent';
    p[ShaderContext.ID] = 'vId';
  }

  getType(sock) {
    if (sock instanceof ClosureSocket) {
      return 'Closure';
    } else if (sock instanceof FloatSocket)
      return 'float';
    else if (sock instanceof Vec3Socket)
      return 'vec3';
    else if (sock instanceof Vec4Socket)
      return 'vec4';
    else if (sock instanceof Vec2Socket)
      return 'vec2'
    else if (sock instanceof Matrix4Socket)
      return 'mat4';
  }

  coerce(socka, sockb) {
    let n1 = this.getSocketName(socka), n2 = this.getSocketName(sockb);

    if ((socka instanceof sockb.constructor) || (sockb instanceof socka.constructor)) {
      return `${n1}`;
    }

    if (sockb instanceof FloatSocket) {
      if (socka instanceof Vec2Socket) {
        return `(length(${n1})/sqrt(2.0))`;
      } else if (socka instanceof Vec3Socket) {
        return `(length(${n1})/sqrt(3.0))`;
      } else if (socka instanceof Vec4Socket) { //should include RGBASocket
        return `(length(${n1})/sqrt(4.0))`;
      } else if (socka instanceof ClosureSocket) {
        return `closure2${this.getType(sockb)}(${n1})`
      }
    } else if (sockb instanceof Vec2Socket) {
      if (socka instanceof FloatSocket) {
        return `vec2(${n1}, ${n1})`;
      } else if ((socka instanceof Vec3Socket) || (socka instanceof Vec4Socket))  {
        return `(${n1}).xy`;
      } else if (socka instanceof ClosureSocket) {
        return `closure2${this.getType(sockb)}(${n1})`
      }
    } else if (sockb instanceof Vec3Socket) {
      if (socka instanceof FloatSocket) {
        return `vec3(${n1}, ${n1}, ${n1})`;
      } else if (socka instanceof Vec4Socket) {
        return `(${n1}).xyz`;
      } else if (socka instanceof Vec2Socket) {
        return `vec3(${n1}, 0.0)`;
      } else if (socka instanceof ClosureSocket) {
        return `closure2${this.getType(sockb)}(${n1})`
      }
    } else if (sockb instanceof Vec4Socket) {
      if (socka instanceof FloatSocket) {
        return `vec4(${n1}, ${n1}, ${n1}, ${n1})`;
      } else if (socka instanceof Vec3Socket) {
        return `vec4(${n1}, 1.0)`;
      } else if (socka instanceof Vec2Socket) {
        return `vec4(${n1}, 0.0, 1.0)`;
      } else if (socka instanceof ClosureSocket) {
        return `closureto${this.getType(sockb)}(${n1})`
      }
    } else if (sockb instanceof ClosureSocket) {
      return `${this.getType(socka)}toclosure(${n1})`;
    }

    console.warn("failed coercion for", socka, sockb);
    return '0.0';
  }

  getParameter(param) {

  }

  getSocketName(sock) {
    let name = sock.socketName;

    name = "_" + name.trim().replace(/[ \t\n\r]/g, "_");
    name += '_' + sock.graph_id;

    return name;
  }

  getSocketValue(sock, default_param=undefined) {
    let name = this.getSocketName(sock);

    if (sock.edges.length > 0 && sock.socketType == SocketTypes.INPUT) {
      if (!(sock.edges[0] instanceof sock.constructor)) {
        return this.coerce(sock.edges[0], sock);
      } else {
        return this.getSocketValue(sock.edges[0]);
      }
    } else if (default_param !== undefined) {
      return this.paramnames[default_param];
    } else if (sock.socketType === SocketTypes.INPUT) {
      return this.getUniform(sock);
    } else {
      return this.getSocketName(sock);
    }
  }

  //returns a unique name for a uniform
  //for an interactively-editable shader parameter
  getUniform(sock, type) {
    let name = this.getSocketName(sock);
    this.uniforms[name] = sock;
    return name;
  }

  out(s) {
    this.buf += s;
  }

  generate(graph) {
    this.graph = graph;
    graph.sort();

    this.vertex = `#version 300 es
#define attribute in
#define varying out
precision highp float;
precision highp samplerCubeShadow;
precision highp sampler2DShadow;

    ${ShaderFragments.CLOSUREDEF}
    ${ShaderFragments.UNIFORMS}
    ${ShaderFragments.ATTRIBUTES}
    ${ShaderFragments.VARYINGS}
    
    void main() {
      vec4 p = vec4(position, 1.0);
      
      p = objectMatrix * vec4(p.xyz, 1.0);
      p = projectionMatrix * vec4(p.xyz, 1.0);
      
      gl_Position = p;

      vColor = color;
      vNormal = normal;
      vUv = uv;
      vId = object_id;        
      
      vGlobalCo = (objectMatrix * vec4(position, 1.0)).xyz;
      vLocalCo = position;
    }
    `

    this.buf = '';

    //find output node
    let output = undefined;
    for (let node of graph.nodes) {
      if (node instanceof OutputNode) {
        output = node;
        break;
      }
    }

    if (output === undefined) {
      console.warn("no output node");

      this.fragment = `
      out vec4 fragColor;
      
      void main() {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);  
      }
      `;
      return this;
    }

    let visit = {};

    let rec = (n) => {
      if (n.graph_id in visit) {
        return;
      }

      visit[n.graph_id] = 1;

      for (let k in n.inputs) {
        let sock = n.inputs[k];
        for (let sock2 of sock.edges) {
          rec(sock2.node);
        }
      }
    };

    rec(output);

    //console.log(visit);

    for (let node of graph.sortlist) {
      if (!(node.graph_id in visit)) {
        continue;
      }

      let buf = this.buf;

      this.out("//" + node.constructor.name + "\n");

      for (let k in node.outputs) {
        let sock = node.outputs[k];
        if (sock.edges.length === 0) {
          //continue;
        }

        let type = this.getType(sock);
        let name = this.getSocketName(sock);

        this.out(`${type} ${name};\n`);
      }

      this.out("{\n");
      node.genCode(this);
      this.out("\n}\n");
    }

    let uniforms = ShaderFragments.UNIFORMS;

    for (let k in this.uniforms) {
      let sock = this.uniforms[k];
      let type = this.getType(sock);

      uniforms += `uniform ${type} ${k};\n`;

    }

    uniforms += LightGen.pre();
    let defines = '';


    defines += LightGen.genDefines(this.scene);

    for (let light of this.scene.lights.renderable) {
      switch (light.data.type) {
        case LightTypes.POINT:

          break;
      }
    }

    let varyings = ShaderFragments.VARYINGS;

    let script = `#version 300 es
precision highp float;
precision highp samplerCubeShadow;
#define varying in
#define texture2D texture

    ${defines}
    ${ShaderFragments.CLOSUREDEF}
    ${uniforms}
    ${varyings}
    ${ShaderFragments.SHADERLIB}    
    
    out vec4 fragColor;
    
    void main() {
      Closure _mainSurface;
      
      _mainSurface.alpha = 1.0;
      
      ${this.buf.replace(/SHADER_SURFACE/g, "_mainSurface")}
      
      {
        vec4 color = vec4(_mainSurface.light+_mainSurface.emission, _mainSurface.alpha);  
        //gl_FragColor = color;
        //gl_FragColor = vec4(color.rgb, 1.0);
        fragColor = vec4(color.rgb, 1.0);
      }
      
      ${ShaderFragments.ALPHA_HASH.replace(/SHADER_SURFACE/g, "_mainSurface")}
      
      //gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
    `

    this.fragment = script;

    return this;
  }

  genShader() {
    if (this.fragment === undefined) {
      throw new Error("must called .generate() before .genShader");
    }

    let ret = {};

    ret.fragment = this.fragment;
    ret.vertex = this.vertex;
    ret.uniforms = {};
    ret.attributes = ['position', 'normal', 'uv', 'color', 'id'];

    ret.setUniforms = (graph, uniforms) => {
      for (let node of graph.sortlist) {
        for (let k in node.inputs) {
          let sock = node.inputs[k];

          if (sock.edges.length === 0) {
            let name = this.getSocketName(sock);
            uniforms[name] = sock.getValue();
          }
        }
      }
    };

    ret.setUniforms(this.graph, ret.uniforms);

    ret.compile = function(gl) {
      return loadShader(gl, this);
    };

    return ret;
  }

  push(node) {

  }
  pop() {

  }
}

export class ShaderNode extends Node {
  constructor() {
    super();
  }

  static defineAPI(nodeStruct) {

  }

  genCode(gen) {
  }

  buildUI(container) {
  }
};

ShaderNode.STRUCT = STRUCT.inherit(ShaderNode, Node, 'shader.ShaderNode') + `
}
`;
nstructjs.manager.add_class(ShaderNode);


export class OutputNode extends ShaderNode {
  constructor() {
    super();
  }

  genCode(gen) {
    gen.out(`
      //SHADER_SURFACE.emission = vec3(hash3f(gl_FragCoord.xyz));
      SHADER_SURFACE = ${gen.getSocketValue(this.inputs.surface)};
    `)
  }

  static nodedef() {return {
    category  : "Outputs",
    uiname    : "Output",
    inputs    : {
      surface : new ClosureSocket()
    }
  }}
};
OutputNode.STRUCT = STRUCT.inherit(OutputNode, ShaderNode, 'shader.OutputNode') + `
}
`;
nstructjs.manager.add_class(OutputNode);
ShaderNetworkClass.register(OutputNode);

export class DiffuseNode extends ShaderNode {
  constructor() {
    super();
  }

  genCode(gen) {
    let brdf = DiffuseBRDF.gen('cl', 'co', 'normal', 'color');
    let lights = LightGen.generate('cl', 'co', 'normal', 'color', brdf);

    gen.out(`
Closure cl;
vec3 co = vGlobalCo;
float roughness = ${gen.getSocketValue(this.inputs.roughness)};
vec3 normal = ${gen.getSocketValue(this.inputs.normal, ShaderContext.NORMAL)};
vec4 color = ${gen.getSocketValue(this.inputs.color)};

cl.alpha = color[3];
cl.diffuse = color.rgb;

${lights}
${gen.getSocketName(this.outputs.surface)} = cl;
    `)
  }

  static nodedef() {return {
    category  : "Shaders",
    uiname    : "Diffuse",
    inputs    : {
      color     : new RGBASocket(undefined, undefined, [0.8, 0.8, 0.8, 1.0]),
      roughness : new FloatSocket(),
      normal    : new Vec3Socket()
    },
    outputs   : {
      surface   : new ClosureSocket()
    }
  }}

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
};

DiffuseNode.STRUCT = STRUCT.inherit(DiffuseNode, ShaderNode, 'shader.DiffuseNode') + `
}
`;
nstructjs.manager.add_class(DiffuseNode);
ShaderNetworkClass.register(DiffuseNode);


export class GeometryNode extends ShaderNode {
  constructor() {
    super();
  }

  genCode(gen) {
    gen.out(`
      ${gen.getSocketName(this.outputs.position)} = vGlobalCo;
      ${gen.getSocketName(this.outputs.local)} = vLocalCo;
      ${gen.getSocketName(this.outputs.normal)} = vNormal;
    `)
  }
  static nodedef() {return {
    category   : "Inputs",
    uiname     : "Geometry",
    outputs    : {
      position : new Vec3Socket(),
      normal   : new Vec3Socket(),
      screen   : new Vec3Socket(),
      local    : new Vec3Socket()
      //tangent  : new Vec3Socket()
    }
  }}

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
};

GeometryNode.STRUCT = STRUCT.inherit(GeometryNode, ShaderNode, 'shader.GeometryNode') + `
}
`;
nstructjs.manager.add_class(GeometryNode);
ShaderNetworkClass.register(GeometryNode);
