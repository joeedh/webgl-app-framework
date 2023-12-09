import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.ts';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property,
  PropFlags, PropTypes, PropSubTypes, ToolOp, ToolFlags, UndoFlags
} from '../path.ux/scripts/pathux.js';
import {dist_to_line_2d} from '../path.ux/scripts/util/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {Icons} from '../editors/icon_enum.js';
import {SceneObject, ObjectFlags} from './sceneobject.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';

import {SelMask, SelToolModes, SelOneToolModes} from "../editors/view3d/selectmode.js";

export class ObjectSelectOpBase extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {}
  }

  execPre() {
    window.redraw_viewport();
  }

  calcUndoMem(ctx) {
    return 256;
  }

  undoPre(ctx) {
    let ud = this._undo = {
      flags: {}
    };

    let scene = ctx.scene;

    for (let ob in scene.objects) {
      ud.flags[ob.lib_id] = ob.flag;
    }

    ud.active = scene.objects.active !== undefined ? scene.objects.active.lib_id : -1;
    ud.highlight = scene.objects.highlight !== undefined ? scene.objects.highlight.lib_id : -1;
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

    scene.objects.setActive(ud.active);
    scene.objects.setHighlight(ud.highlight);

    window.updateDataGraph();
    window.redraw_all();
  }
}

export class ObjectSelectOneOp extends ObjectSelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Select One (Object)",
      name    : "object_select",
      toolpath: "object.selectone",
      icon    : -1,
      inputs  : {
        mode     : new EnumProperty("UNIQUE", SelOneToolModes),
        objectId : new IntProperty(-1).private(),
        setActive: new BoolProperty(true)
      }
    }
  }

  static invoke(ctx, args) {
    let tool = new this();

    if ("mode" in args) {
      tool.inputs.mode.setValue(args.mode);
    }

    if ("objectId" in args) {
      tool.inputs.objectId.setValue(args.objectId);
    }

    if ("setActive" in args) {
      tool.inputs.setActive.setValue(args.setActive);
    }

    return tool;
  }

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let scene = ctx.scene;
    let ob = this.inputs.objectId.getValue();

    ob = ctx.datalib.get(ob);

    if (ob === undefined) {
      console.warn("error in SelectOneOp", ob, this.inputs.objectId.getValue());
      return;
    }

    console.log("mode", mode);

    if (mode === SelOneToolModes.UNIQUE) {
      scene.objects.clearSelection();
      scene.objects.setSelect(ob, true);

      if (this.inputs.setActive.getValue()) {
        scene.objects.setActive(ob);
      }
    } else {
      if (this.inputs.setActive.getValue() && mode == SelOneToolModes.ADD) {
        scene.objects.setActive(ob);
      }

      scene.objects.setSelect(ob, mode === SelOneToolModes.ADD);
    }
  }
}

ToolOp.register(ObjectSelectOneOp);

export class ObjectToggleSelectOp extends ObjectSelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Toggle Select All (Object)",
      name    : "toggle_select_all",
      toolpath: "object.toggle_select_all",
      icon    : -1,
      inputs  : ToolOp.inherit({
        mode: new EnumProperty("AUTO", SelToolModes)
      })
    }
  }

  static invoke(ctx, args) {
    let tool = new this();

    if ("mode" in args) {
      tool.inputs.mode.setValue(args.mode);
    }

    return tool;
  }

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let scene = ctx.scene;

    if (mode == SelToolModes.AUTO) {
      mode = SelToolModes.ADD;

      for (let ob of scene.objects.selected.editable) {
        mode = SelToolModes.SUB;
        break;
      }
    }

    for (let ob of scene.objects.editable) {
      scene.objects.setSelect(ob, mode == SelToolModes.ADD);
    }
  }
}

ToolOp.register(ObjectToggleSelectOp);

