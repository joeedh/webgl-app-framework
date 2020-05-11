import {DataBlock, DataRef} from '../core/lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags} from '../core/graph.js';
import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DependSocket, Vec3Socket, Vec4Socket, Matrix4Socket, FloatSocket} from "../core/graphsockets.js";
import {UIBase} from '../path.ux/scripts/core/ui_base.js';
import {Container} from '../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {AbstractGraphClass} from '../core/graph_class.js';
import {ShaderGenerator, OutputNode, DiffuseNode} from "./shader_nodes.js";

export {ShaderNetworkClass, ShaderNodeTypes, ShaderGenerator} from './shader_nodes.js';

export const MaterialFlags = {
  SELECT : 1
};

export const ShadowFlags = {
  NO_SHADOWS : 1
};

export class ShadowSettings {
  constructor() {
    this.bias = 1.0;
    this.flag = 0;
  }
}

ShadowSettings.STRUCT = `
ShadowSettings {
  bias : float;
  flag : int;
}
`;
nstructjs.manager.add_class(ShadowSettings);

export class ShaderNetwork extends DataBlock {
  constructor() {
    super();

    this.shadow = new ShadowSettings();
    this.flag = 0;
    this.graph = new Graph();
    this.graph.onFlagResort = this._on_flag_resort.bind(this);
    this._regen = true;
  }

  _on_flag_resort() {
    console.log("material shader resort");
    this._regen = 1;
  }

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);
    //this.graph.dataLink(getblock, getblock_addUser);
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

  static nodedef() {return {
    uiname : "Shader Network",
    inputs  : {},
    outputs : {
      onTopologyChange : new DependSocket("onTopologyChange")
    }
  }};

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
  graph    : graph.Graph;
  flag     : int;
  shadow   : ShadowSettings;
}
`;
DataBlock.register(ShaderNetwork);
nstructjs.manager.add_class(ShaderNetwork);

export function makeDefaultShaderNetwork() {
  let sn = new ShaderNetwork();

  let out = new OutputNode();
  sn.graph.add(out);

  let shader = new DiffuseNode();
  sn.graph.add(shader);

  shader.outputs.surface.connect(out.inputs.surface);

  shader.graph_ui_pos[0] -= 100;
  out.graph_ui_pos[0] += 300;

  return sn;
}

