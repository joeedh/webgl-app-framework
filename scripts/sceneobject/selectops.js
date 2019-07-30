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
import {Icons} from '../editors/icon_enum.js';
import {SceneObject, ObjectFlags} from '../core/sceneobject.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';

import {SelMask, SelToolModes, SelOneToolModes} from "../editors/view3d/selectmode.js";

export class SelectOpBase extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {return {
  }}

  undoPre(ctx) {
    let ud = this._undo = {
      flags : {}
    };

    let scene = ctx.scene;

    for (let ob in scene.objects) {
      ud.flags[ob.lib_id] = ob.flag;
    }

    ud.active = scene.objects.active !== undefined ? scene.objects.active.lib_id : -1;
    ud.highlight = scene.objects.highlight.active !== undefined ? scene.objects.highlight.lib_id : -1;
  }

  undo(ctx) {
    let ud = this._undo;
    let flags = ud.flags;
    let datalib = ctx.datalib, scene = ctx.scene;

    for (let k in flags) {
      let ob = datalib.get(k);

      if (ob === undefined) {
        console.warn("error in object select op base undo", k);
        continue;
      }

      let flag = flags[k];

      scene.objects.setSelect(ob, (flag & ObjectFlags.SELECT));
      ob.flag = flag;
    }

    ud.active = datalib.get(ud.active);
    ud.highlight = datalib.get(ud.highlight);

    scene.setActive(ud.active);
    scene.setHighlight(ud.highlight);

    window.updateDataGraph();
    window.redraw_all();
  }
}

export class SelectOneOp extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname    : "Select One (Object)",
    name      : "object_select",
    toolpath  : "object.selectone",
    icon      : -1,
    inputs    : {
      mode       : new EnumProperty("UNIQUE", SelOneToolModes),
      objectId   : new IntProperty(-1),
      setActive  : new BoolProperty(true)
    }
  }}

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let scene = ctx.scene;
    let ob = this.inputs.objectId.getValue();

    ob = ctx.datalib.get(ob);

    if (ob === undefined) {
      console.warn("error in SelectOneOp");
      return;
    }

    if (mode === SelOneToolModes.UNIQUE) {
      scene.clearSelection();
      scene.objects.setSelect(ob);

      if (this.inputs.setActive.getValue()) {
        scene.object.setActive(ob);
      }
    } else {
      if (this.inputs.setActive.getValue() && mode == SelOneToolModes.ADD) {
        scene.object.setActive(ob);
      }

      scene.objects.setSelect(ob, mode == SelOneToolModes.ADD);
    }
  }
}
ToolOp.register(SelectOneOp);
