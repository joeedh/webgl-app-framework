import {DataBlock, DataRef} from '../core/lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags, SocketTypes} from '../core/graph.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DependSocket, Vec2Socket, Vec3Socket, RGBASocket, Vec4Socket, Matrix4Socket, FloatSocket} from "../core/graphsockets.js";
import {UIBase} from '../path.ux/scripts/ui_base.js';
import {Container} from '../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {AbstractGraphClass} from '../core/graph_class.js';
import {ShaderFragments, LightGen, DiffuseBRDF} from './shader_lib.js';

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
    this.diffuse = new Vector3([1, 0.75, 0.5]);
    this.scatter = new Vector3();
    this.normal = new Vector3();
    this.roughness = 0.1;
    this.alpha = 1.0;
  }

  load(b) {
    this.emission.load(b.emission);
    this.diffuse.load(b.diffuse);
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
  diffuse    : vec3;
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
nstructjs.manager.add_class(ClosureSocket);

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
  constructor() {
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
    graph.sort();

    this.vertex = `precision mediump float;
    uniform matrix projectionMatrix;
    uniform matrix objectMatrix;
    uniform int objectID;
    
    attribute vec3 position;
    attribute vec2 uv;
    attribute vec4 color;
    attribute vec3 normal;
    attribute float id;
    
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vNormal
    varying float vId;
    varying vec3 vGlocalCo;
    varying vec3 vLocalCo;
    
    void main() {
      vec4 p = vec4(position, 1.0);
      
      p = objectMatrix * projectionMatrix * p;
      gl_Position = p;

      vColor = color;
      vNormal = normal;
      vUv = uv;
      vId = id;        
      
      vGlobalCo = (objectMatrix * p).xyz;
      vLocalCo = p.xyz;
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

    console.log(visit);

    for (let node of graph.sortlist) {
      if (!(node.graph_id in visit)) {
        continue;
      }

      let buf = this.buf;

      this.out("//" + node.constructor.name + "\n");

      for (let k in node.outputs) {
        let sock = node.outputs[k];
        if (sock.edges.length == 0) {
          continue;
        }

        let type = this.getType(sock);
        let name = this.getSocketName(sock);

        this.out(`${type} ${name};\n`);
      }

      this.out("{\n");
      node.genCode(this);
      this.out("\n}\n");
    }

    let uniforms = '';
    for (let k in this.uniforms) {
      let sock = this.uniforms[k];
      let type = this.getType(sock);

      uniforms += `uniform ${type} ${k};\n`;

    }

    this.buf = ShaderFragments.SHADERLIB + "\n" + this.buf;
    this.buf = uniforms + "\n\n" + this.buf;

    return this;
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

${lights}
${gen.getSocketName(this.outputs.surface)} = cl;
    `)
  }

  static nodedef() {return {
    category  : "Shaders",
    uiname    : "Diffuse",
    inputs    : {
      color     : new RGBASocket(),
      roughness : new FloatSocket(),
      normal    : new Vec3Socket()
    },
    outputs    : {
      surface : new ClosureSocket()
    }
  }}

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
    /*
    if (this.inputs.color instanceof Vec4Socket) {
      let sock = new RGBASocket();
      this.inputs.color.copyTo(sock);
      sock.graph_id = this.inputs.color.graph_id;
      sock.edges = this.inputs.color.edges;

      this.inputs.color = sock;
    }//*/
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

