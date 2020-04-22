import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property,
  PropFlags, PropTypes, PropSubTypes} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {Shaders} from './view3d_shaders.js';
import {dist_to_line_2d} from '../../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import * as util from '../../util/util.js';
import {SelMask} from './selectmode.js';

import {View3DFlags} from "./view3d_base.js";
import {WidgetBase, WidgetSphere, WidgetArrow, WidgetTool, WidgetFlags} from './widgets.js';
import {TranslateOp, ScaleOp} from "./transform_ops.js";
import {calcTransCenter} from './transform_query.js';
import {ToolMacro} from "../../path.ux/scripts/simple_toolsys.js";
import {Icons} from '../icon_enum.js';
import {DataPathError} from "../../path.ux/scripts/controller.js";

export class MovableWidget extends WidgetBase {
  constructor(manager, datapath) {
    super(manager);

    this.datapath = datapath;
    this.shapeid = "SPHERE";

    this.shape = undefined;
    this.bad = false;

    this.onupdate = undefined;
    this.flag |= WidgetFlags.CAN_SELECT;
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
