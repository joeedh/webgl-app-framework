import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property,
  PropFlags, PropTypes, PropSubTypes} from '../path.ux/scripts/toolsys/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../path.ux/scripts/toolsys/simple_toolsys.js';
import {dist_to_line_2d} from '../path.ux/scripts/util/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {Mesh, MeshTypes, MeshFlags} from '../mesh/mesh.js';
import {MeshOp} from '../mesh/mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {NOTEXIST, StandardTools} from "./stdtools.js";
import {SelToolModes, SelOneToolModes} from '../editors/view3d/selectmode.js';
import {SelectOneOp} from './selectops.js';
import {ObjectFlags} from "./sceneobject.js";
import {ObjectDataTypes} from './sceneobject_base.js';

export class SceneObjectOp extends ToolOp {
  execPost(ctx) {
    super.execPost(ctx);
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

    for (let ob of scene.objects.selected.editable) {
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

//
export class ObjectTools extends StandardTools {
  static ToggleSelectAll(ctx, mode=SelToolModes.AUTO) {
    ctx.api.execTool(ctx, `object.toggle_select_all(mode=${mode})`);
  }

  static Delete(ctx) {
    ctx.api.execTool(ctx, "object.delete_selected()");s
  }

  static SelectOne(ctx, unique=true) {
    let view3d = ctx.view3d;
    let scene = ctx.scene;

    if (ctx.scene.objects.highlight !== undefined) {
      let tool = new SelectOneOp();

      let ob = ctx.scene.objects.highlight;
      tool.objectId = ob.lib_id;

      if (unique) {
        tool.inputs.setActive.setValue(true);
        tool.inputs.objectId.setValue(ob.lib_id);
        tool.inputs.mode.setValue(SelOneToolModes.UNIQUE);
      } else {
        let sel = ob.flag & ObjectFlags.SELECT;

        tool.inputs.setActive.setValue(!sel);
        tool.inputs.mode.setValue(sel ? SelOneToolModes.ADD : SelOneToolModes.SUB);
      }

      ctx.toolstack.execTool(ctx, tool);
    }
  }
}

export function getStdTools(ctx) {
  let selmask = ctx.selectMask;

  if (selmask == SelMask.OBJECT) {
    return ObjectTools;
  }

  for (let cls of ObjectDataTypes) {
    let def = cls.dataDefine();

    if (def.selectMask & selmask) {
      return def;
    }
  }

  return ObjectTools;
}
