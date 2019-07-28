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
import {ShaderNodeTypes, OutputNode, DiffuseNode} from '../../core/material.js';
import {AbstractGraphClass} from '../../core/graph_class.js';

import {IntProperty, StringProperty, PropSubTypes, PropTypes, PropFlags} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, UndoFlags, ToolFlags} from '../../path.ux/scripts/simple_toolsys.js';

export class AddNodeOp extends ToolOp {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let tool = new AddNodeOp();

    console.log("ARGS", args);
    if ("graphPath" in args) {
      tool.inputs.graphPath.setValue(args["graphPath"]);
    }
    if ("graphClass" in args) {
      tool.inputs.graphClass.setValue(args["graphClass"]);
    }
    if ("nodeClass" in args) {
      tool.inputs.nodeClass.setValue(args["nodeClass"]);
    }

    return tool;
  }

  static tooldef() {return {
    toolpath : "node.add_node",
    uiname   : "Add Node",
    inputs   : {
      graphPath : new StringProperty(),
      graphClass : new StringProperty(), //AbstractGraphClass.graphdef().typeName, see graph_class.js.
      nodeClass : new StringProperty, //node class name, just constructor.name
    },

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

    node.graph_ui_pos[0] = 10;
    node.graph_ui_pos[1] = 300;

    graph.add(node);
    this.outputs.graph_id.setValue(node.graph_id);

    console.log(graph.nodes);
  }
}
ToolOp.register(AddNodeOp);
