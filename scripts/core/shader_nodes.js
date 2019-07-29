import {DataBlock, DataRef} from './lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags} from './graph.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DependSocket, Vec3Socket, RGBASocket, Vec4Socket, Matrix4Socket, FloatSocket} from "./graphsockets.js";
import {UIBase} from '../path.ux/scripts/ui_base.js';
import {Container} from '../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {AbstractGraphClass} from './graph_class.js';

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

export class ShaderGenerator {
  constructor() {
  }

  //returns a unique name for a uniform
  //for an interactively-editable shader parameter
  getUniform(name) {

  }

  out(s) {

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
