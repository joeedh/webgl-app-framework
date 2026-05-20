import {MeshOp} from "../../addons/builtin/mesh/src/mesh_ops_base.js";
import {ToolOp} from "../path.ux/scripts/toolsys/simple_toolsys.js";

export class CurveOp extends MeshOp {
  static tooldef() {return {
    inputs : ToolOp.inherit({}),
    outputs : ToolOp.inherit({})
  }}
}
