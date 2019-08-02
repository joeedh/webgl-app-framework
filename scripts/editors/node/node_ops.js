import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor} from '../editor_base.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase} from '../../path.ux/scripts/ui_base.js';
import {Container} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {ShaderNodeTypes, OutputNode, DiffuseNode} from '../../shadernodes/shader_nodes.js';
import {AbstractGraphClass} from '../../core/graph_class.js';
import {NodeFlags, SocketFlags, SocketTypes, NodeSocketType} from "../../core/graph.js";

import {IntProperty, Vec2Property, StringProperty, PropSubTypes, PropTypes, PropFlags} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, UndoFlags, ToolFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {Icons} from '../icon_enum.js';
import {DataPathError} from '../../path.ux/scripts/controller.js';

export class NodeGraphOp extends ToolOp {
  constructor() {
    super();
  }

  fetchGraph(ctx) {
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

  static invoke(ctx, args) {
    let tool = new this();

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

  static tooldef() {return {
    inputs   : {
      graphPath : new StringProperty(),
      graphClass : new StringProperty(), //AbstractGraphClass.graphdef().typeName, see graph_class.js.
    }
  }}
}


export class NodeTranslateOp extends NodeGraphOp {
  constructor() {
    super();

    this.first = true;
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
  }

  static tooldef() {return {
    toolpath : "node.translate",
    uiname   : "Translate (Node)",
    icon     : Icons.TRANSLATE,
    is_modal : true,
    inputs   : ToolOp.inherit({
      offset : new Vec2Property()
    })
  }}

  modalEnd(cancelled) {
    let ctx = this.modal_ctx;
    super.modalEnd(cancelled);

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
    ctx.nodeEditor.update();
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

  static tooldef() {return {
    toolpath : "node.add_node",
    uiname   : "Add Node",

    inputs   : ToolOp.inherit({
      nodeClass : new StringProperty(), //node class name, just constructor.name
      pos       : new Vec2Property([10, 300])
    }),
    outputs : {
      graph_id : new IntProperty(), //id of new node
    }
  }}

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

  static tooldef() {return {
    toolpath    : "node.connect",
    description : "connect node sockets",
    uiname      : "Connect Sockets",
    icon        : -1,
    inputs   : ToolOp.inherit({
      node1_id     : new IntProperty(-1),
      sock1_id     : new IntProperty(-1),

      node2_id     : new IntProperty(-1),
      sock2_id     : new IntProperty(-1),
    }),
    is_modal : true
  }}

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

    this.resetDrawLines();

    if (uisock1 === undefined) {
      return;
    }
    
    let p = new Vector2(uisock1.getAbsPos());
    ned.project(p, true);

    this.addDrawLine(p, mpos, "orange");

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
      let p3 = new Vector2(sock2.getAbsPos());

      this.inputs.sock2_id.setValue(sock2.socket.graph_id);
      this.inputs.node2_id.setValue(sock2.socket.node.graph_id);

      sock2.isHighlight = true;
      sock2.setCSS();
    }
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
