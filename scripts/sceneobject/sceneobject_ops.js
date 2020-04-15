import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property,
  PropFlags, PropTypes, PropSubTypes} from '../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {dist_to_line_2d} from '../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {Mesh, MeshTypes, MeshFlags} from '../mesh/mesh.js';
import {MeshOp} from '../mesh/mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';

export class SceneObjectOp extends ToolOp {
  execPost(ctx) {
    super.execPre(ctx);
    window.redraw_viewport();
  }
}

export class DeleteObjectOp extends SceneObjectOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    toolpath : "object.delete_selected",
    name : "delete_selected",
    uiname : "Delete Selected",
    description : "Delete all selected objects",
    inputs : {},
    outputs : {},
    icon : -1
  }}

  exec(ctx) {
    let scene = ctx.scene;

    let list = [];

    for (let ob of scene.objects.editable) {
      list.push(ob);
    }

    for (let ob of list) {
      scene.remove(ob);

      if (ob.lib_users <= 0) {
        console.log("Nuking object");
        let data = ob.data;

        ctx.datalib.remove(ob);

        if (data.lib_users <= 0) {
          console.log("Nuking object data too");
          ctx.datalib.remove(data);
        }
      }
    }
  }
}
ToolOp.register(DeleteObjectOp);
