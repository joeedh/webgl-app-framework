import {Area} from '../../path.ux/scripts/screen/ScreenArea.js';
import {Editor} from '../editor_base.js';
import '../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Node, NodeSocketType, Graph, NodeFlags, SocketFlags, GraphFlags, GraphNodes} from "../../core/graph.js";
import {IntProperty, StringProperty, EnumProperty, FlagProperty, PropSubTypes, PropTypes, PropFlags} from '../../path.ux/scripts/toolsys/toolprop.js';
import {ToolOp, UndoFlags, ToolFlags} from '../../path.ux/scripts/toolsys/simple_toolsys.js';
import {Icons} from '../icon_enum.js';
import {NodeGraphOp} from './node_ops.js';
import {SelToolModes, SelOneToolModes} from '../view3d/selectmode.js';

export class SelectOpBase extends NodeGraphOp {
  constructor() {
    super();

    this._undo = undefined;
  }

  static tooldef() { return {
    inputs: ToolOp.inherit()
  }}

  static canRun(ctx) {
    return ctx.nodeEditor !== undefined;
  }

  //canRun(ctx) {
  //  return this.fetchGraph(ctx) !== undefined;
  //}

  undoPre(ctx) {
    let graph = this.fetchGraph(ctx);

    if (graph === undefined) {
      return;
    }

    let ud = this._undo = {
      sel   : {},
      order : {}
    };

    let sel = ud.sel, order = ud.order;

    let i = 0;
    for (let node of graph.nodes) {
      sel[node.graph_id] = node.graph_flag & NodeFlags.SELECT;
      order[node.graph_id] = i++;
    }
  }

  undo(ctx) {
    let ud = this._undo;
    let sel = ud.sel, order = ud.order;
    let graph = this.fetchGraph(ctx);

    for (let k in sel) {
      let state = sel[k];
      let node = graph.node_idmap[k];

      if (node === undefined) {
        console.warn("Warning: missing node " + k + " in graph " + this.inputs.graphPath.getValue());
        continue;
      }

      graph.nodes.setSelect(node, !!state);
    }

    //restore original node order, which can be changed by some selection ops
    //this is distinct from the calculated toplogical sort order

    let nodes = graph.nodes.slice(0, graph.nodes.length);
    let donemap = {};

    for (let i=0; i<nodes.length; i++) {
      graph.nodes[i] = undefined;
    }

    for (let k in order) {
      let node = graph.node_idmap[k];
      let i = order[k];

      if (node === undefined) {
        console.warn("Warning: missing node " + k + " in graph " + this.inputs.graphPath.getValue());
        continue;
      }

      donemap[k] = 1;
      graph.nodes[i] = node;
    }

    //do a sanity check that we've re-added all nodes
    for (let node of nodes) {
      if (!(node.graph_id in donemap)) {
        console.warn("orphan node found in node_selectops.SelectOpBase.prototype.undo");
        for (let i=0; i<nodes.length; i++) {
          if (graph.nodes[i] === undefined) {
            graph.nodes[i] = node;
          }
        }
      }
    }

    graph.signalUI();
  }
}

export class SelectOneOp extends SelectOpBase {
  static tooldef() { return {
    toolpath : "node.selectone",
    inputs : ToolOp.inherit({
      nodeId : new IntProperty(),
      mode   : new EnumProperty("UNIQUE", SelOneToolModes)
    })
  }}

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if ("nodeId" in args) {
      tool.inputs.nodeId.setValue(args.nodeId);
    }

    if ("mode" in args) {
      tool.inputs.mode.setValue(args.mode);
    }

    return tool;
  }

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let graph = this.fetchGraph(ctx);

    if (graph === undefined) {
      console.warn("error in node_selectops.SelectOneOp");
      return;
    }

    console.log("mode", mode);

    let node = graph.node_idmap[this.inputs.nodeId.getValue()];

    if (mode == SelOneToolModes.UNIQUE) {
      for (let node2 of graph.nodes) {
        graph.nodes.setSelect(node2, false);
      }

      graph.nodes.setSelect(node, true);
    } else {
      let state = this.inputs.mode.getValue() == SelOneToolModes.ADD;

      graph.nodes.setSelect(node, state);
    }

    //change order, shader networks rely on this to
    //tell which output nodes is "active", so user can
    //interactively select different subnetworks to preview in real time
    graph.nodes.pushToFront(node);
  }
}
ToolOp.register(SelectOneOp);


export class ToggleSelectAll extends SelectOpBase {
  static tooldef() {
    return {
      toolpath: "node.toggle_select_all",
      inputs: ToolOp.inherit({
        mode: new EnumProperty("AUTO", SelToolModes)
      })
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if ("nodeId" in args) {
      tool.inputs.nodeId.setValue(args.nodeId);
    }

    if ("mode" in args) {
      tool.inputs.mode.setValue(args.mode);
    }

    return tool;
  }

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let graph = this.fetchGraph(ctx);

    console.log("toggle select all", graph);

    if (graph === undefined) {
      console.warn("error in node_selectops.ToggleSelectAll");
      return;
    }

    if (mode == SelToolModes.AUTO) {
      mode = SelToolModes.ADD;

      for (let node of graph.nodes) {
        if (node.graph_flag & NodeFlags.SELECT) {
          mode = SelToolModes.SUB;
          break;
        }
      }
    }

    console.log("mode", mode);

    for (let node of graph.nodes) {
      graph.nodes.setSelect(node, mode === SelToolModes.ADD);
    }

    graph.signalUI();
  }
}

ToolOp.register(ToggleSelectAll);
