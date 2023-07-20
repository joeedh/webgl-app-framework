import {DataBlock, DataRef} from '../core/lib_api.js';
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags} from '../core/graph.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
let STRUCT = nstructjs.STRUCT;

import {
  DependSocket,
  Vec3Socket,
  Vec4Socket,
  Matrix4Socket,
  FloatSocket,
  IntSocket,
  BoolSocket
} from "../core/graphsockets.js";
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

  copyTo(b) {
    b.bias = this.bias;
    b.flag = this.flag;
  }

  copy() {
    let ret = new ShadowSettings();

    this.copyTo(ret);

    return ret;
  }
}

ShadowSettings.STRUCT = `
ShadowSettings {
  bias : float;
  flag : int;
}
`;
nstructjs.register(ShadowSettings);

export class ShaderNetwork extends DataBlock {
  constructor() {
    super();

    this.shadow = new ShadowSettings();
    this.flag = 0;
    this.graph = new Graph();
    this.graph.onFlagResort = this._on_flag_resort.bind(this);
    this._regen = true;

    this._last_update_hash = undefined; //is set by RenderEngine code

    this.usedNodes = [];

    this.updateHash = 0;
    this.usedNodes = new Set(); //pruned list of nodes that contribute to shader code
  }

  copy(addLibUsers=false, owner) {
    let ret = super.copy(addLibUsers, owner);

    ret.graph = this.graph.copy(addLibUsers);
    ret.shadow = this.shadow.copy();
    ret.flag = this.flag;

    return ret;
  }

  copyTo(b, arg) {
    super.copyTo(b, arg);

    b.flag = this.flag;
    this.shadow.copyTo(b.shadow);
  }

  getUsedNodes() {
    let out;

    for (let node of this.graph.nodes) {
      if (node instanceof OutputNode) {
        out = node;
        break;
      }
    }

    let ret = new Set();

    let rec = (n) => {
      if (ret.has(n)) {
        return;
      }

      ret.add(n);

      for (let k in n.inputs) {
        let sock = n.inputs[k];

        for (let e of sock.edges) {
          rec(e.node);
        }
      }
    }

    if (out) {
      rec(out);
    }

    return ret;
  }

  calcUpdateHash() {
    let graph = this.graph;

    let hash = new util.HashDigest();
    for (let node of this.usedNodes) {
      hash.add(node.graph_id);

      for (let i=0; i<2; i++) {
        let socks = i ? node.outputs : node.inputs;

        for (let k in socks) {
          let sock = socks[k];

          if (sock.edges.length === 0) {
            if (sock instanceof FloatSocket) {
              hash.add(sock.value);
            } else if (sock instanceof IntSocket) {
              hash.add(sock.value);
            } else if (sock instanceof  BoolSocket) {
              hash.add(sock.value*i);
            } else if (sock instanceof Vec3Socket) {
              hash.add(sock.value[0]*1000.0);
              hash.add(sock.value[1]*1000.0);
              hash.add(sock.value[2]*1000.0);
            } else if (sock instanceof Vec4Socket) {
              hash.add(sock.value[0]*1000.0);
              hash.add(sock.value[1]*1000.0);
              hash.add(sock.value[2]*1000.0);
              hash.add(sock.value[3]*1000.0);
            }
          } else {
            for (let e of sock.edges) {
              hash.add(e.graph_id);
            }
          }
        }
      }
    }

    return hash.get();
  }
  /*helpers for data api*/

  _on_flag_resort() {
    this.usedNodes = this.getUsedNodes();
    this._regen = 1;
  }

  flagRegen() {
    this._regen = 1;
  }

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);
    this.graph.dataLink(this, getblock, getblock_addUser);
  }

  generate(scene, rlights, defines="") {
    if (scene === undefined) {
      throw new Error("scene cannot be undefined");
    }

    this._regen = false;
    this.usedNodes = this.getUsedNodes();

    let gen = new ShaderGenerator(scene);

    gen.generate(this.graph, rlights, defines);
    let shader = gen.genShader();

    return shader;
  }

  static nodedef() {return {
    uiname : "Shader Network",
    name   : "shadernetwork",
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
nstructjs.register(ShaderNetwork);

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

