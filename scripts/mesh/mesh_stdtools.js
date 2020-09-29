import {StandardTools} from "../sceneobject/stdtools.js";
import {SelMask, SelOneToolModes} from '../editors/view3d/selectmode.js';
import {MeshFlags} from './mesh_base.js';
import {SelectOneOp} from './select_ops.js';

export class MeshTools extends StandardTools {
  static SelectOne(ctx, unique=true) {
    let view3d = ctx.view3d;
    let mesh = ctx.mesh;
    let selmask = ctx.selMask;

    let list;

    if (selmask & SelMask.VERTEX) {
      list = mesh.verts;
    } else if (selmask & SelMask.EDGE) {
      list = mesh.edges;
    } else {
      list = mesh.faces;
    }

    if (list.highlight !== undefined) {
      let e = list.highlight;

      let state = e.flag & MeshFlags.SELECT;

      let tool = new SelectOneOp();
      let mode;

      if (unique) {
        mode = SelOneToolModes.UNIQUE;
      } else if (state) {
        mode = SelOneToolModes.SUB
      } else {
        mode = SelOneToolModes.ADD;
      }

      tool.inputs.mode.setValue(mode);
      tool.inputs.setActiveObject.setValue(true);
      tool.inputs.eid.setValue(e.eid);

      ctx.toolstack.execTool(ctx, tool);

      return true;
    }

    return false;
  }
}
