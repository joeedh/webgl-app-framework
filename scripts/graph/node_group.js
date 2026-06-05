import {DataBlock} from '../core/lib_api.js'
import {Icons} from '../editors/icon_enum.js'
import {Graph, Node, NodeFlags} from '../core/graph.js'
import {nstructjs} from '../path.ux/scripts/pathux.js'

export class NodeGroup extends DataBlock {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
  graph.NodeGroup {
  category     : string;
  graph        : graph.Graph;
  groupInputs  : abstract(graph.NodeSocketType);
  groupOutputs : abstract(graph.NodeSocketType);
}
`
  )
  constructor() {
    super()

    this.category = ''
    this.graph = new Graph()

    this.groupInputs = []
    this.groupOutputs = []
  }

  static blockDefine() {
    return {
      typeName: 'nodegroup',
      uiName  : 'Node Group',
      icon    : Icons.EDITOR_NODE,
    }
  }

  static nodedef() {
    return {
      name   : 'node group',
      uiname : 'node group',
      flag   : NodeFlags.SAVE_PROXY,
      inputs : {},
      outputs: {},
    }
  }

  copyTo(b, copyContents) {
    super.copyTo(b, copyContents)

    b.category = this.category
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader)
  }

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser)

    this.graph.dataLink(this, getblock, getblock_addUser)
  }
}
DataBlock.register(NodeGroup)

export class NodeGroupInputs extends Node {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
  graph.NodeGroupInputs {
}`
  )
  constructor() {
    super()
  }
}

export class NodeGroupOutputs extends Node {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
  graph.NodeGroupOutputs {
}`
  )
  constructor() {
    super()
  }
}

export class NodeGroupInst extends Node {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
  graph.NodeGroupInst {
  group : DataRef | DataRef.fromBlock(this.group);
}`
  )
  constructor() {
    super()

    this.group = undefined
    this.graph = new Graph()
  }

  syncGroup() {
    let idmap = {}

    for (let node of this.graph.nodes) {
      idmap[node.graph_id] = node
    }

    this.graph.destroy()
    this.graph = new Graph()
  }

  static nodedef() {
    return {
      name   : 'node_group_inst',
      uiname : 'Group Instance',
      inputs : {},
      outputs: {},
      flag   : 0,
      icon   : Icons.EDITOR_NODE,
    }
  }

  graphDataLink(ownerBlock, getblock, getblock_addUser) {
    super.graphDataLink(ownerBlock, getblock, getblock_addUser)

    this.group = getblock_addUser(this.group)
  }
}
