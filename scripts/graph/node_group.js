import {DataBlock} from '../core/lib_api.js';
import {Icons} from '../editors/icon_enum.js';
import {Graph, Node, NodeFlags} from '../core/graph.js';

export class NodeGroup extends DataBlock {
  constructor() {
    super();

    this.category = "";
    this.graph = new Graph();

    this.groupInputs = [];
    this.groupOutputs = [];
  }

  static blockDefine() {return {
    typeName : "nodegroup",
    uiName : "Node Group",
    icon : Icons.EDITOR_NODE,
  }}

  static nodedef() {return {
    name : "node group",
    uiname : "node group",
    flag : NodeFlags.SAVE_PROXY,
    inputs : {},
    outputs : {}
  }}

  copyTo(b, copyContents) {
    super.copyTo(b, copyContents);

    b.category = this.category;
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);
  }

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);

    this.graph.dataLink(this, getblock, getblock_addUser);
  }
}
NodeGroup.STRUCT = nstructjs.inherit(NodeGroup, DataBlock) + `
  category     : string;
  graph        : graph.Graph;
  groupInputs  : abstract(graph.NodeSocketType);
  groupOutputs : abstract(graph.NodeSocketType); 
}
`;
nstructjs.register(NodeGroup);
DataBlock.register(NodeGroup);

export class NodeGroupInputs extends Node {
  constructor() {
    super();
  }
}
NodeGroupInputs.STRUCT = nstructjs.inherit(NodeGroupInputs, Node) + `
}`;

export class NodeGroupOutputs extends Node {
  constructor() {
    super();
  }
}
NodeGroupOutputs.STRUCT = nstructjs.inherit(NodeGroupOutputs, Node) + `
}`;

export class NodeGroupInst extends Node {
  constructor() {
    super();

    this.group = undefined;
    this.graph = new Graph();
  }

  syncGroup() {
    let idmap = {};

    for (let node of this.graph.nodes) {
      idmap[node.graph_id] = node;
    }

    this.graph.destroy();
    this.graph = new Graph();


  }

  static nodedef() {
    return {
      name : "node_group_inst",
      uiname : "Group Instance",
      inputs : {},
      outputs : {},
      flag : 0,
      icon : Icons.EDITOR_NODE
    }
  }

  graphDataLink(ownerBlock, getblock, getblock_addUser) {
    super.graphDataLink(ownerBlock, getblock, getblock_addUser);

    this.group = getblock_addUser(this.group);
  }
}
NodeGroupInst.STRUCT = nstructjs.inherit(NodeGroupInst, Node) + `
  group : DataRef | DataRef.fromBlock(this.group);
}`;
