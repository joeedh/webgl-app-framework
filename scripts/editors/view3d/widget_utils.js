import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, ListProperty,
  PropFlags, PropTypes, PropSubTypes, StringSetProperty
} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {Shaders} from './view3d_shaders.js';
import {dist_to_line_2d} from '../../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import * as util from '../../util/util.js';
import {SelMask} from './selectmode.js';

import {View3DFlags} from "./view3d_base.js";
import {WidgetBase, WidgetSphere, WidgetArrow, WidgetTool, WidgetFlags} from './widgets.js';
import {TranslateOp, ScaleOp, SnapModes} from "./transform_ops.js";
import {calcTransCenter} from './transform_query.js';
import {ToolMacro} from "../../path.ux/scripts/simple_toolsys.js";
import {Icons} from '../icon_enum.js';
import {DataPathError} from "../../path.ux/scripts/controller.js";
import {PropModes, TransDataType, TransDataElem, TransDataMap, TransDataTypes} from './transform_base.js';
import {ConstraintSpaces} from "./transform_base.js";
import {aabb_union} from '../../util/math.js';
import {TransformOp} from './transform_ops.js';

export class TransMovWidget extends TransDataType {
  static transformDefine() {return {
    name   : "movable_widget",
    uiname : "Movable Widget",
    flag   : 0,
    icon   : -1
  }}

  static isValid(ctx, toolop) {
    return true;
  }

  static genData(ctx, selectMask, propmode, propradius, toolop) {
    if (ctx.scene === undefined) {
      return [];
    }

    let manager = ctx.scene.widgets;

    let ret = [];
    let api = ctx.api;
    
    for (let path of toolop.inputs.datapaths) {
      let td = new TransDataElem();
      td.data1 = path;
      td.data2 = api.getValue(ctx, path);

      console.log(path);
      ret.push(td);
    }


    return ret;
  }

  static applyTransform(ctx, elem, do_prop, matrix, toolop) {
    let co = new Vector3();

    co.load(elem.data2).multVecMatrix(matrix);
    ctx.api.setValue(ctx, elem.data1, co);

    if (ctx.scene) {
      ctx.scene.widgets.update();
    }
  }

  static undoPre(ctx, elemlist) {
    let ret = {
      paths : [],
      cos : []
    };

    for (let td of elemlist) {
      ret.paths.push(td.data1);
      ret.cos.push(td.data2.copy());
    }

    return ret;
  }

  static undo(ctx, udata) {
    let paths = udata.paths;
    let cos = udata.cos;

    for (let i=0; i<paths.length; i++) {
      let path = paths[i], co = cos[i];
      ctx.api.setValue(ctx, path, co);
    }

    window.redraw_viewport();
  }

  /**
   * @param ctx                : instance of ToolContext or a derived class
   * @param selmask            : SelMask
   * @param spacemode          : ConstraintSpaces
   * @param space_matrix_out   : Matrix4, optional, matrix to put constraint space in
   */
  static getCenter(ctx, list, selmask, spacemode, space_matrix_out, toolop) {
    let center = new Vector3();
    let tot = 0.0;

    for (let td of list) {
      let co = ctx.api.getValue(ctx, td.data1);

      center.add(co);
      tot++;
    }

    if (!tot) {
      return undefined;
    }

    center.mulScalar(1.0 / tot);

    return center;
  }

  static calcAABB(ctx, toolop) {
  }

  static update(ctx, elemlist) {
  }
}
TransDataType.register(TransMovWidget)

export class MovWidgetTranslateOp extends TranslateOp {
  static tooldef() {return {
    name : "translate",
    uiname : "Translate",
    toolpath : "movable_widget.translate",
    is_modal : true,
    inputs : ToolOp.inherit({
      types     : TransDataType.buildTypesProp("movable_widget"),
      datapaths : new ListProperty(PropTypes.STRING)
    }),

    outputs : ToolOp.inherit({})
  }}
}
ToolOp.register(MovWidgetTranslateOp);

export class MovableWidget extends WidgetBase {
  constructor(manager, datapath, snapmode=SnapModes.NONE) {
    super(manager);

    this.datapath = datapath;
    this.shapeid = "SPHERE";
    this.snapMode = snapmode;

    this.shape = undefined;
    this.bad = false;

    this.onupdate = undefined;
    this.flag |= WidgetFlags.CAN_SELECT;
  }

  on_mousedown(e, localX, localY, was_touch) {
    console.log("Movable widget mouse down!");

    if (e.button == 0 || was_touch) {
      let toolop = new MovWidgetTranslateOp();

      toolop.inputs.datapaths.push(this.datapath);
      toolop.inputs.snapMode.setValue(this.snapMode);
      this.ctx.toolstack.execTool(toolop);
    }
  }

  static canCall(ctx) {
    return true;
  }

  getValue() {
    return this.ctx.api.getValue(this.ctx, this.datapath);
  }

  setValue(val) {
    this.ctx.api.setValue(this.ctx, this.datapath, val);
    this.update(this.manager);
    window.redraw_viewport();
  }

  update(manager) {
    super.update();

    if (this.bad) {
      return;
    }

    if (this.shape === undefined) {
      this.shape = new WidgetSphere(manager);
    }

    let scale = 0.25;

    this.matrix.makeIdentity();
    let co;

    try {
      co = this.ctx.api.getValue(this.ctx, this.datapath);
    } catch (error) {
      this.bad = true;

      if (!(error instanceof DataPathError)) {
        throw error;
      }

      console.log("MovableWidget: invalid data path", this.datapath);
      return;
    }

    if (co === undefined) {
      this.bad = true;
      return;
    }

    this.matrix.translate(co[0], co[1], co[2]);
    this.matrix.scale(scale, scale, scale);
  }
}
