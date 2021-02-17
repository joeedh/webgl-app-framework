import {Area} from '../../path.ux/scripts/screen/ScreenArea.js';
import {Editor} from '../editor_base.js';
import '../../path.ux/scripts/util/struct.js';

let STRUCT = nstructjs.STRUCT;
import {UIBase} from '../../path.ux/scripts/core/ui_base.js';
import {Container} from '../../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {ShaderNodeTypes, OutputNode, DiffuseNode} from '../../shadernodes/shader_nodes.js';
import {AbstractGraphClass} from '../../core/graph_class.js';
import {NodeFlags, SocketFlags, SocketTypes, NodeSocketType} from "../../core/graph.js";

import {
  IntProperty, Vec2Property, StringProperty,
  PropSubTypes, PropTypes, PropFlags,
  KeyMap, HotKey, ToolOp, UndoFlags, ToolFlags,
  DataPathError
} from '../../path.ux/scripts/pathux.js';
import {Icons} from '../icon_enum.js';
import {getContextArea} from "../editor_base.js";
import {ModalFlags} from "../../core/modalflags.js";
import {NodeEditor} from "./NodeEditor.js";

export class SavedGraph {
  constructor(graph) {
    this.graph = graph;
  }
}

SavedGraph.STRUCT = `
graph.SavedGraph {
  graph : abstract(graph.Graph);
}
`;
nstructjs.register(SavedGraph);

export class NodeGraphOp extends ToolOp {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (args["useNodeEditorGraph"]) {
      tool.inputs.graphPath.setValue(ctx.nodeEditor.graphPath);
      tool.inputs.graphClass.setValue(ctx.nodeEditor.graphClass);
    }

    if ("graphPath" in args) {
      tool.inputs.graphPath.setValue(args["graphPath"]);
    }
    if ("graphClass" in args) {
      tool.inputs.graphClass.setValue(args["graphClass"]);
    }

    return tool;
  }

  static tooldef() {
    return {
      inputs: {
        graphPath : new StringProperty(),
        graphClass: new StringProperty(), //AbstractGraphClass.graphdef().typeName, see graph_class.js.
      }
    }
  }

  fetchGraph(ctx) {
    if (this.inputs.graphPath.getValue() === "") {
      console.warn("graphPath was empty string");
      return undefined;
    }

    try {
      return ctx.api.getValue(ctx, this.inputs.graphPath.getValue());
    } catch (error) {
      if (error instanceof DataPathError) {
        console.warn("Unknown graph path " + this.inputs.graphPath.getValue());
        return undefined;
      } else {
        throw error;
      }
    }
  }

  updateAllEditors(ctx) {
    for (let sarea of ctx.screen.sareas) {
      if (sarea.area instanceof NodeEditor) {
        sarea.area.flushUpdate();
        sarea.area._recalcLines();
      }
    }
  }

  undoPre(ctx) {
    let graph = this.inputs.graphPath.getValue();
    let undo = this._undo = {};

    if (graph === "") {
      console.warn("graphPath was empty string");
      return;
    }

    graph = ctx.api.getValue(ctx, graph);
    if (!graph) {
      console.warn("could not get graph");
      return;
    }

    console.log("GRAPH", graph, this.inputs.graphPath.getValue());

    graph = new SavedGraph(graph);

    let data = [];
    nstructjs.writeObject(data, graph);
    data = new Uint8Array(data);
    data = new DataView(data.buffer);

    undo.graphPath = this.inputs.graphPath.getValue();
    undo.data = data;
  }

  calcUndoMem(ctx) {
    if (this._undo && this._undo.data) {
      return this._undo.data.byteLength;
    }

    return 0;
  }

  undo(ctx) {
    if (!this._undo) {
      return;
    }

    let data = this._undo.data;
    let path = this._undo.graphPath;

    if (!data || path === undefined) {
      console.warn("no undo data");
      return;
    }

    let graph = ctx.api.getValue(ctx, path);
    if (!graph) {
      console.warn("failed to resolve graph at path " + path);
      return;
    }

    let savedgraph = nstructjs.readObject(data, SavedGraph);

    let getblock = (ref) => {
      let block = ctx.datalib.get(ref);

      if (block) {
        block.lib_addUser();
      }

      return block;
    }

    graph.load(savedgraph.graph);
    graph.dataLink(undefined, getblock, getblock);
    graph.signalUI();
  }
}


export class NodeTranslateOp extends NodeGraphOp {
  constructor() {
    super();

    this.first = true;
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
  }

  static tooldef() {
    return {
      toolpath: "node.translate",
      uiname  : "Translate (Node)",
      icon    : Icons.TRANSLATE,
      is_modal: true,
      inputs  : ToolOp.inherit({
        offset: new Vec2Property()
      })
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);

    ctx.setModalFlag(ModalFlags.TRANSFORMING);
  }

  modalEnd(cancelled) {
    let ctx = this.modal_ctx;
    super.modalEnd(cancelled);

    ctx.clearModalFlag(ModalFlags.TRANSFORMING);

    this.first = true;
    this.start_mpos = new Vector2();
    this.mpos = new Vector2();
    //this.last_mpos = new Vector2();

    if (cancelled) {
      this._apply(ctx, new Vector2());
    }
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;

    let mpos = this.mpos;
    let ned = ctx.nodeEditor;
    let scale = ned.velpan.scale;

    mpos[0] = e.pageX/scale[0];
    mpos[1] = e.pageY/scale[1];

    if (this.first) {
      this.start_mpos.load(mpos);
      this.first = false;
      return;
    }

    let off = this.inputs.offset.getValue();
    off.load(mpos).sub(this.start_mpos);

    this.exec(ctx);
    this.updateAllEditors(ctx);
  }

  _apply(ctx, offset) {
    let graph = this.inputs.graphPath.getValue();
    let gclass = this.inputs.graphClass.getValue();

    graph = this.fetchGraph(ctx);
    gclass = AbstractGraphClass.getGraphClass(gclass);

    let startpos;

    if (this.start_positions === undefined) {
      startpos = this.start_positions = {};
      for (let node of graph.nodes.selected.editable) {
        startpos[node.graph_id] = new Vector3(node.graph_ui_pos);
      }
    } else {
      startpos = this.start_positions;
    }

    for (let node of graph.nodes.selected.editable) {
      node.graph_ui_pos.load(startpos[node.graph_id]).add(offset);
    }

    graph.signalUI();
  }

  undo(ctx) {
    super.undo(ctx);
    this.start_positions = undefined;
  }

  exec(ctx) {
    this._apply(ctx, this.inputs.offset.getValue());
  }

  on_mouseup(e) {
    this.modalEnd(e.button !== 0);
  }
}

ToolOp.register(NodeTranslateOp);

export class AddNodeOp extends NodeGraphOp {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if ("nodeClass" in args) {
      tool.inputs.nodeClass.setValue(args["nodeClass"]);
    }

    if ("x" in args) {
      tool.inputs.pos.getValue()[0] = args.x;
    }

    if ("y" in args) {
      tool.inputs.pos.getValue()[1] = args.y;
    }

    return tool;
  }

  static tooldef() {
    return {
      toolpath: "node.add_node",
      uiname  : "Add Node",

      inputs : ToolOp.inherit({
        nodeClass: new StringProperty(), //node class name, just constructor.name
        pos      : new Vec2Property([10, 300])
      }),
      outputs: {
        graph_id: new IntProperty(), //id of new node
      }
    }
  }

  exec(ctx) {
    let graph = this.inputs.graphPath.getValue();
    let gclass = this.inputs.graphClass.getValue();
    let nclass = this.inputs.nodeClass.getValue();

    console.log(gclass, nclass, graph);

    graph = ctx.api.getValue(ctx, graph);
    gclass = AbstractGraphClass.getGraphClass(gclass);
    let node = gclass.create(nclass);

    if (node === undefined) {
      throw new Error("failed to create node of type " + nclass);
    }

    let pos = this.inputs.pos.getValue();

    node.graph_ui_pos[0] = pos[0];
    node.graph_ui_pos[1] = pos[1];

    graph.add(node);
    this.outputs.graph_id.setValue(node.graph_id);

    console.log(graph.nodes);
  }
}

ToolOp.register(AddNodeOp);

export class ConnectNodeOp extends NodeGraphOp {
  constructor() {
    super();

    this.first = true;
    this.start_mpos = new Vector2();
    this.mpos = new Vector2();
    this.last_sock2 = undefined;
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if ("disconnectSockID" in args) {
      tool.inputs.disconnectSockID.setValue(args.disconnectSockID);
    }

    if ("node1_id" in args) {
      tool.inputs.node1_id.setValue(args.node1_id);
    }
    if ("sock1_id" in args) {
      tool.inputs.sock1_id.setValue(args.sock1_id);
    }

    if ("node2_id" in args) {
      tool.inputs.node2_id.setValue(args.node2_id);
    }
    if ("sock2_id" in args) {
      tool.inputs.sock2_id.setValue(args.sock2_id);
    }

    return tool;
  }

  static tooldef() {
    return {
      toolpath   : "node.connect",
      description: "connect node sockets",
      uiname     : "Connect Sockets",
      icon       : -1,
      inputs     : ToolOp.inherit({
        node1_id: new IntProperty(-1),
        sock1_id: new IntProperty(-1),

        node2_id: new IntProperty(-1),
        sock2_id: new IntProperty(-1),

        /*used for "dragging" connections between input sockets
          which of course requires that old connection be destroyed
         */
        disconnectSockID: new IntProperty(-1)
      }),
      is_modal   : true
    }
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;

    let graph = this.fetchGraph(ctx);
    let ned = ctx.nodeEditor;

    let mpos = this.mpos;
    mpos[0] = e.x;
    mpos[1] = e.y;

    let node1 = graph.node_idmap[this.inputs.node1_id.getValue()];
    let sock1 = graph.sock_idmap[this.inputs.sock1_id.getValue()];

    let uisock1 = ned.getUISocket(sock1);

    this.resetTempGeom();

    if (uisock1 === undefined) {
      return;
    }

    let p = new Vector2(uisock1.getAbsPos(true));
    ned.project(p, true);

    this.makeTempLine(p, mpos, "orange");

    let p2 = new Vector2(mpos);
    ned.unproject(p2, true);

    this.inputs.sock2_id.setValue(-1);
    this.inputs.node2_id.setValue(-1);

    if (this.last_sock2 !== undefined && this.last_sock2.isHighlight) {
      this.last_sock2.isHighlight = false;
      this.last_sock2.setCSS();
    }

    let sock2 = ned.findSocket(p2[0], p2[1]);

    if (sock2 === undefined) {
      return;
    }

    this.last_sock2 = sock2;
    sock2.updateSocketRef();

    let ok = sock2.socket !== sock1 && sock2.socket.node !== sock1.node;
    ok = ok && sock2.socket.socketType !== sock1.socketType;

    if (ok) {
      let p3 = new Vector2(sock2.getAbsPos(true));

      this.inputs.sock2_id.setValue(sock2.socket.graph_id);
      this.inputs.node2_id.setValue(sock2.socket.node.graph_id);

      sock2.isHighlight = true;
      sock2.setCSS();
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);

    this.execPre(ctx);
  }

  modalEnd(cancelled) {
    let ctx = this.modal_ctx;
    super.modalEnd(cancelled);

    if (!cancelled) {
      this.exec(ctx);
      ctx.nodeEditor.rebuildAll();
      window.redraw_viewport();
    }
  }

  on_mouseup(e) {
    this.modalEnd(e.button != 0);
  }

  execPre(ctx) {
    super.execPre(ctx);

    let graph = this.fetchGraph(ctx);
    let remsock = graph.sock_idmap[this.inputs.disconnectSockID.getValue()];

    if (remsock !== undefined) {
      remsock.disconnect();
      graph.signalUI();
    }
  }

  exec(ctx) {
    let graph = this.fetchGraph(ctx);

    let node1 = graph.node_idmap[this.inputs.node1_id.getValue()];
    let sock1 = graph.sock_idmap[this.inputs.sock1_id.getValue()];
    let node2 = graph.node_idmap[this.inputs.node2_id.getValue()];
    let sock2 = graph.sock_idmap[this.inputs.sock2_id.getValue()];

    if (!node1 || !sock1 || !node2 || !sock2) {
      console.log(this);
      console.warn("Error in node connect op");
      return;
    }

    if (node1 === node2 || sock1 === sock2 || sock1.socketType === sock2.socketType) {
      console.log(this);
      console.warn("Error in node connect op: bad arguments");
      return;
    }

    if (sock1.hasEdges && !(sock1.graph_flag & SocketFlags.MULTI)) {
      sock1.disconnect();
    }
    if (sock2.hasEdges && !(sock2.graph_flag & SocketFlags.MULTI)) {
      sock2.disconnect();
    }

    sock1.connect(sock2);
    graph.signalUI();
  }

  undo(ctx) {
    super.undo(ctx);

    let graph = this.fetchGraph(ctx);
    if (graph !== undefined) {
      graph.signalUI();
    }
  }
}

ToolOp.register(ConnectNodeOp);

export class DeleteNodeOp extends NodeGraphOp {
  static tooldef() {
    return {
      uiname  : "Delete Node",
      toolpath: "node.delete_selected",
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit({})
    }
  }

  exec(ctx) {
    let graph = this.fetchGraph(ctx);

    if (!graph) {
      return;
    }

    for (let node of new Set(graph.nodes.selected.editable)) {
      graph.remove(node);
    }

    graph.signalUI();
  }
}

ToolOp.register(DeleteNodeOp);
