import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;

import {ShaderNetworkClass, ShaderNode} from "./shader_nodes.js";
import {DataBlock, DataRef} from '../core/lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags, SocketTypes} from '../core/graph.js';
import {DependSocket, Vec2Socket, Vec3Socket, RGBASocket, Vec4Socket, Matrix4Socket, FloatSocket} from "../core/graphsockets.js";
import {UIBase} from '../path.ux/scripts/core/ui_base.js';
import {Container} from '../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {AbstractGraphClass} from '../core/graph_class.js';
import {ShaderFragments} from './shader_lib.js';

export const MathNodeFuncs = {
  ADD     : 0,
  SUB     : 1,
  MUL     : 2,
  DIV     : 3,
  POW     : 4,
  SQRT    : 5,
  FLOOR   : 6,
  CEIL    : 7,
  MIN     : 8,
  MAX     : 9,
  FRACT   : 10,
  TENT    : 11,
  COS     : 12,
  SIN     : 13,
  TAN     : 14,
  ACOS    : 15,
  ASIN    : 16,
  ATAN    : 17,
  ATAN2   : 18,
  LOG     : 19,
  EXP     : 20
};

let mf = MathNodeFuncs;
export const MathSnippets = {
  [mf.ADD]     : 'A + B',
  [mf.SUB]     : 'A - B',
  [mf.MUL]     : 'A * B',
  [mf.DIV]     : 'A / B',
  [mf.POW]     : 'pow(A, B)',
  [mf.SQRT]    : 'sqrt(A)',
  [mf.FLOOR]   : 'floor(A)',
  [mf.CEIL]    : 'ceil(A)',
  [mf.MIN]     : 'min(A)',
  [mf.MAX]     : 'max(A)',
  [mf.FRACT]   : 'fract(A)',
  [mf.TENT]    : 'abs(fract(A)-0.5)*2.0',
  [mf.COS]     : 'cos(A)',
  [mf.SIN]     : 'sin(A)',
  [mf.TAN]     : 'tan(A)',
  [mf.ACOS]    : 'acos(A)',
  [mf.ASIN]    : 'asin(A)',
  [mf.ATAN]    : 'atan(A)',
  [mf.ATAN2]   : 'atan2(B, A)',
  [mf.LOG]     : 'log(A)',
  [mf.EXP]     : 'exp(A)'
};

export class MathNode extends ShaderNode {
  constructor() {
    super();

    this.mathFunc = MathNodeFuncs.MUL;
  }

  buildUI(container) {
    container.prop("mathFunc");
  }

  static defineAPI(nstruct) {
    nstruct.enum("mathFunc", "mathFunc", MathNodeFuncs, "Function", "Math function to use");
  }

  genCode(gen) {
    let snippet = MathSnippets[this.mathFunc];

    gen.out(`
      float A = ${gen.getSocketValue(this.inputs.a)};
      float B = ${gen.getSocketValue(this.inputs.b)};
      
      ${gen.getSocketName(this.outputs.value)} = ${snippet};    
    `);
  }

  static nodedef() {return {
    category  : "Math",
    name      : "math",
    uiname    : "Math",
    inputs    : {
      a : new FloatSocket(),
      b : new FloatSocket(),
    },
    outputs    : {
      value : new FloatSocket()
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

MathNode.STRUCT = STRUCT.inherit(MathNode, ShaderNode, 'shader.MathNode') + `
  mathFunc : int;
}
`;
nstructjs.manager.add_class(MathNode);
ShaderNetworkClass.register(MathNode);
