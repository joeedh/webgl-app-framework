import {DataBlock, DataRef} from './lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags} from './graph.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DependSocket, Vec3Socket, Vec4Socket, Matrix4Socket, FloatSocket} from "./graphsockets.js";
import {UIBase} from '../path.ux/scripts/ui_base.js';
import {Container} from '../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {AbstractGraphClass} from './graph_class.js';
import {ShaderGenerator} from "../shadernodes/shader_nodes.js";

export {ShaderNetworkClass, ShaderNodeTypes, ShaderGenerator} from '../shadernodes/shader_nodes.js';

export const MaterialFlags = {
  SELECT : 1
};

export class ShaderNetwork extends DataBlock {
  constructor() {
    super();

    this.flag = 0;
    this.graph = new Graph();
    this.graph.onFlagResort = this._on_flag_resort.bind(this);
    this._regen = true;
  }

  _on_flag_resort() {
    console.log("material shader resort");
    this._regen = 1;
  }

  static nodedef() {return {
    inputs  : {},
    outputs : {
      onTopologyChange : new DependSocket("onTopologyChange")
    }
  }};

  dataLink(getblock, getblock_us) {
    super.dataLink(getblock, getblock_us);
    //this.graph.dataLink(getblock, getblock_us);
  }

  generate(scene) {
    if (scene === undefined) {
      throw new Error("scene cannot be undefined");
    }
    this._regen = false;

    let gen = new ShaderGenerator(scene);
    gen.generate(this.graph);
    let shader = gen.genShader();

    return shader;
  }

  static blockDefine() {return {
    typeName    : "shadernetwork",
    defaultName : "Shader Network",
    uiName   : "Shader Network",
    flag     : 0,
    icon     : -1
  }}

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);
    reader(this);

    this.graph.onFlagResort = this._on_flag_resort.bind(this);
  }
};

ShaderNetwork.STRUCT = STRUCT.inherit(ShaderNetwork, DataBlock) + `
  graph : graph.Graph;
  flag  : int;
}
`;
DataBlock.register(ShaderNetwork);
nstructjs.manager.add_class(ShaderNetwork);