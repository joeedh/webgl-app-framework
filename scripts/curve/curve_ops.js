import {MeshOp} from "../mesh/mesh_ops_base.js";
import {ToolOp} from "../path.ux/scripts/simple_toolsys.js";

export class CurveOp extends MeshOp {
  static tooldef() {return {
    inputs : ToolOp.inherit({}),
    outputs : ToolOp.inherit({})
  }}
}
