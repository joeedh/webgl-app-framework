import {
  Vec3Property,
  StringProperty,
  EnumProperty,
  ListProperty,
  BoolProperty,
  IntProperty
} from "../../../path.ux/scripts/toolprop.js";
//import {MeasureToolBase} from "./measuretool.js";
import {ToolOp} from "../../../path.ux/scripts/simple_toolsys.js";
import {Vector3} from "../../../util/vectormath.js";
import {Icons} from "../../icon_enum.js";
import {MeasurePoint, MeasureFlags, measureUtils} from './measuretool_base.js';
import {SelOneToolModes, SelToolModes} from "../selectmode.js";
import {PropTypes} from "../../../path.ux/scripts/toolprop.js";

export class MeasureOp extends ToolOp {
  constructor(toolmode) {
    super();

    if (toolmode !== undefined) {
      this.inputs.toolName.setValue(toolmode.constructor.widgetDefine().name);
    }
  }

  static invoke(ctx, args) {
    if (ctx.scene === undefined || ctx.scene.toolmode === undefined) {
      return undefined;
    }

    let name = args.toolName;
    if (!name) {
      name = ctx.scene.toolmode.constructor.widgetDefine().name;
    }
    
    let ret = new this();

    ret.inputs.toolName.setValue(name);
    
    return ret;
  }

  static tooldef() {return {
    inputs : {
      toolName : new StringProperty().private()
    }
  }}

  get toolModeName() {
    return this.inputs.toolName.getValue();
  }

  undoPre(ctx) {
    let ms = ctx.scene.toolmode_namemap[this.toolModeName];

    let points = [];
    for (let p of ms.points) {
      points.push(new MeasurePoint(p));
    }

    this._undo = {
      points     : points,
      toolmode_i : ctx.scene.toolmode_i
    };
  }

  getToolMode(ctx) {
    return ctx.scene.toolmode_namemap[this.toolModeName];
  }

  undo(ctx) {
    let ud = this._undo;
    if (ctx.scene.toolmode_i !== ud.toolmode_i) {
      ctx.scene.switchToolMode(ud.toolmode_i);
    }

    let ms = ctx.scene.toolmode_namemap[this.toolModeName];
    ms.points = [];

    for (let i=0; i<ud.points.length; i++) {
      ms.points.push(new MeasurePoint(ud.points[i]));
    }

    ms.updatePointWidgets();
    window.redraw_viewport();
  }

  execPost(ctx) {
    window.redraw_viewport();
  }
}


export class AddPointOp extends MeasureOp {
  constructor(toolmode) {
    super(toolmode);
  }

  static tooldef() {return {
    uiname : "Point Add (Measure)",
    name : "add_point",
    toolpath : "measure.add_point",
    inputs : ToolOp.inherit({
      p : new Vec3Property()
    })
  }}

  static canRun(ctx) {
    let toolmode = ctx.scene.toolmode;

    if (toolmode === undefined) {
      return false;
    }

    let def = toolmode.constructor.widgetDefine();
    return def.name.search("measure") >= 0;
    //return ctx.scene.toolmode instanceof MeasureToolBase;
  }

  exec(ctx) {
    let ms = this.getToolMode(ctx);

    let p = this.inputs.p.getValue();

    let max = ms.maxPoints;
    max = max === 0 ? 1e17 : max;

    if (ms.points.length < max) {
      ms.points.push(new MeasurePoint(p));
    } else {
      ms.points = [new MeasurePoint(p)];
    }

    ms.updatePointWidgets();
  }
}
ToolOp.register(AddPointOp);


export class ClearPointsOp extends MeasureOp {
  constructor(toolmode) {
    super(toolmode);
  }

  static tooldef() {return {
    uiname : "Clear Points (Measure)",
    name : "clear_points",
    icon : Icons.RESET,
    toolpath : "measure.clear_points",
    inputs : ToolOp.inherit({
    })
  }}

  exec(ctx) {
    let ms = this.getToolMode(ctx);

    ms.points.length = 0;
    ms.updatePointWidgets();
  }
}
ToolOp.register(ClearPointsOp);

export class SelectOpBase extends MeasureOp {
  constructor() {
    super();
  }

  execPost(ctx) {
    measureUtils.update(this.toolModeName, ctx);
    window.redraw_viewport();
  }

  static tooldef() {return {
    inputs : ToolOp.inherit({})
  }}

  static invoke(ctx, args) {
    let ret = super.invoke(ctx, args);

    let mask = PropTypes.ENUM|PropTypes.FLAG;
    let mask2 = PropTypes.INT|PropTypes.FLOAT;

    for (let arg in args) {
      let val = args[arg];

      let prop = ret.inputs[arg];

      if (prop === undefined) {
        throw new Error("invalid argument " + arg);
      }

      if (val === "true") {
        val = true;
      } else if (val === "false") {
        val = false;
      } else if (typeof val === "string" && (prop.type & mask)) {
        val = prop.values[val];
      } else if (typeof val === "string" && (prop.type & mask2)) {
        val = parseFloat(val);
      }

      prop.setValue(val);
    }

    return ret;
  }
}

export class ToggleSelectAllOp extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname: "Toggle Select All (Object)",
      name: "toggle_select_all",
      toolpath: "measure.toggle_select_all",
      icon: -1,
      inputs: ToolOp.inherit({
        mode: new EnumProperty("AUTO", SelToolModes)
      })
    }}

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let name = this.inputs.toolName.getValue();

    if (mode === SelToolModes.AUTO) {
      mode = SelToolModes.ADD;

      for (let p of measureUtils.points(name, ctx)) {
        if (p.flag & MeasureFlags.SELECT) {
          mode = SelToolModes.SUB;
          break;
        }
      }
    }

    for (let p of measureUtils.points(name, ctx)) {
      measureUtils.setSelect(name, ctx, p, mode === SelToolModes.ADD);
    }

    measureUtils.update(name, ctx);
    window.redraw_viewport();
  }
}

ToolOp.register(ToggleSelectAllOp);

export class SelectOneOp extends SelectOpBase {
  static tooldef() {return {
    uiname    : "Select One (Measure)",
    name      : "selectone",
    toolpath  : "measure.selectone",
    icon      : -1,
    inputs    : ToolOp.inherit({
      mode       : new EnumProperty("UNIQUE", SelOneToolModes),
      path       : new StringProperty().private(),
      setActive  : new BoolProperty(true)
    }),

    outputs : ToolOp.inherit({
      selectPaths : new ListProperty(PropTypes.STRING)
    })
  }}

  exec(ctx) {
    let datapath = this.inputs.path.getValue();
    let p = ctx.api.getValue(ctx, datapath);
    let mode = this.inputs.mode.getValue();
    let name = this.inputs.toolName.getValue();

    if (p === undefined) {
      throw new Error("no point at datapath " + datapath);
    }

    if (mode === SelOneToolModes.UNIQUE) {
      for (let p2 of measureUtils.points(name, ctx)) {
        measureUtils.setSelect(name, ctx, p2, false);
      }

      measureUtils.setSelect(name, ctx, p, true);
    } else {
      measureUtils.setSelect(name, ctx, p, mode === SelOneToolModes.ADD);
    }

    measureUtils.update(name, ctx);

    this.outputs.selectPaths.clear();

    for (let p of measureUtils.points.selected(name, ctx)) {
      this.outputs.selectPaths.push(measureUtils.getPath(name, ctx, p));
    }
  };
}
ToolOp.register(SelectOneOp);

class DeleteSelected extends MeasureOp {
  constructor(toolmode) {
    super(toolmode);
  }

  static tooldef() {return {
    name     : "delete",
    uiname   : "Delete Points (Measure)",
    toolpath : "measure.delete_selected",
    icon     : Icons.DELETE,
    inputs   : ToolOp.inherit({})
  }}

  exec(ctx) {
    let name = this.toolModeName;
    let ms = this.getToolMode(ctx);

    let ps = [];
    for (let p of measureUtils.points.selected(name, ctx)) {
      ps.push(p);
    }

    for (let p of ps) {
      ms.points.remove(p);
    }

    ms.update(name, ctx);
  }
}
ToolOp.register(DeleteSelected);
