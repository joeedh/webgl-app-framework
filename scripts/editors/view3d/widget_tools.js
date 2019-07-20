import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property,
  PropFlags, PropTypes, PropSubTypes} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {WidgetShapes} from './widget_shapes.js';
import {Shaders} from './view3d_shaders.js';
import {dist_to_line_2d} from '../../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import * as util from '../../util/util.js';
import {SelMask} from './selectmode.js';

import {WidgetBase, WidgetArrow, WidgetTool, WidgetFlags} from './widgets.js';
import {TranslateOp} from "./transform_ops.js";
import {calcTransCenter} from './transform_query.js';

export class TranslateWidget extends WidgetTool {
  constructor(manager) {
    super(manager);

    this.axes = undefined;
  }

  static define() {return {
    uiname    : "Move",
    name      : "translate",
    icon      : -1,
    flag      : 0
  }}

  static validate(ctx) {
    let selmask = ctx.view3d.selectmode;

    if (selmask == SelMask.OBJET) {
      for (let ob of ctx.scene.objects.selected.editable) {
        return true;
      }
    }

    for (let ob of ctx.selectedMeshObjects) {
      for (let v of ob.data.verts.selected) {
        return true;
      }
    }

    return false;
  }

  create(ctx, manager) {
    super.create(ctx, manager);

    console.log("creating widget");

    let px = this.getPlane(undefined, [1, 0, 0, 0.5]); //"rgba(255, 0, 0, 0.8)");
    let py = this.getPlane(undefined, "rgba(0, 255, 0, 0.2)");
    let pz = this.getPlane(undefined, "rgba(0, 0, 255, 0.2)");
    this.plane_axes = [px, py, pz];

    let x = this.getArrow(undefined, "red");
    let y = this.getArrow(undefined, "green");
    let z = this.getArrow(undefined, "blue");

    this.axes = [x, y, z];

    x.on_mousedown = (localX, localY) => {
      this.startTool(0, localX, localY);
    };
    y.on_mousedown = (localX, localY) => {
      this.startTool(1, localX, localY);
    };
    z.on_mousedown = (localX, localY) => {
      this.startTool(2, localX, localY);
    };

    px.on_mousedown = (localX, localY) => {
      this.startTool(3, localX, localY);
    };
    py.on_mousedown = (localX, localY) => {
      this.startTool(4, localX, localY);
    };
    pz.on_mousedown = (localX, localY) => {
      this.startTool(5, localX, localY);
    };

    this.update(ctx);
  }

  startTool(axis, localX, localY) {
    let view3d = this.view3d;

    if (this._widget_tempnode === undefined) {
      let n = this._widget_tempnode = this.manager.createCallbackNode(0, "widget redraw", () => {
        this.update();
        console.log("widget recalc update 1");
      }, {trigger: new DependSocket("trigger")}, {});

      this.ctx.graph.add(n);
      n.inputs.trigger.connect(view3d._graphnode.outputs.onDrawPre);
    }

    let tool = new TranslateOp([localX, localY]);
    let con = new Vector3();

    if (axis > 2) {
      axis -= 3;
      con[(axis+1)%3] = 1.0;
      con[(axis+2)%3] = 1.0;
    } else {
      con[axis] = 1.0;
    }
    tool.inputs.constraint.setValue(con);

    this.ctx.toolstack.execTool(tool);

    if (tool._promise !== undefined) {
      tool._promise.then((ctx, was_cancelled) => {
        console.log("tool was finished", this, this._widget_tempnode, ".");

        if (this._widget_tempnode !== undefined) {
          //this.ctx.graph.remove(this._widget_tempnode);
          this.manager.removeCallbackNode(this._widget_tempnode);
          this._widget_tempnode = undefined;
        }
      })
    }
  }

  update(ctx) {
    if (this.axes === undefined) {
      return;
    }

    let x = this.axes[0],
        y = this.axes[1],
        z = this.axes[2];

    let ret = this.view3d.getTransCenter();


    let co1 = new Vector3(ret.center);
    let co2 = new Vector3(co1);

    this.view3d.project(co1);
    this.view3d.project(co2);

    co1[0] += 1.0;

    let z2 = this.view3d.camera.pos.vectorDistance(this.view3d.camera.target);

    this.view3d.unproject(co1);
    this.view3d.unproject(co2);

    let ratio = z2/1500.0;
    //console.log("ratio", 70*ratio, z2)
    //ratio=0.01;

    let mat = new Matrix4(); //XXX get proper matrix space transform
    mat.multiply(ret.spaceMatrix);
    //console.log(ret.spaceMatrix.$matrix);
    //mat.translate(0, 0, 1);

    let xmat = new Matrix4();
    let ymat = new Matrix4();

    let scale = !isNaN(ratio) ? ratio*80 : 1.0;
    //console.log("scale", scale);

    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    xmat.translate(0.0, 0.0, scale);
    xmat.scale(scale, scale, scale);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    ymat.translate(0.0, 0.0, scale);
    ymat.scale(scale, scale, scale);

    let zmat = new Matrix4();
    zmat.translate(0.0, 0.0, scale);
    zmat.scale(scale, scale, scale);

    //xmat.preMultiply(mat2);
    //xmat.multiply(ret.spaceMatrix);

    let mat2 = new Matrix4();
    mat2.translate(ret.center[0], ret.center[1], ret.center[2]);

    xmat.preMultiply(mat);
    ymat.preMultiply(mat);
    zmat.preMultiply(mat);

    xmat.preMultiply(mat2);
    ymat.preMultiply(mat2);
    zmat.preMultiply(mat2);

    //xmat.preMultiply(mat);
    //ymat.preMultiply(mat);
    //zmat.preMultiply(mat);

    x.setMatrix(xmat);
    y.setMatrix(ymat);
    z.setMatrix(zmat);

    let px = this.plane_axes[0];
    let py = this.plane_axes[1];
    let pz = this.plane_axes[2];

    xmat.makeIdentity();
    ymat.makeIdentity();
    zmat.makeIdentity();

    scale *= 0.6;

    let fac = 0.75;

    //ymat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    ymat.translate(-fac*scale, 0.0, fac*scale);
    ymat.scale(scale, scale, scale);

    zmat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    zmat.translate(-scale*fac, 0.0, scale*fac);
    zmat.scale(scale, scale, scale);

    xmat.euler_rotate(0.0, 0.0, Math.PI*0.5);
    xmat.translate(scale*fac, 0.0, scale*fac);
    xmat.scale(scale, scale, scale);

    xmat.preMultiply(mat);
    ymat.preMultiply(mat);
    zmat.preMultiply(mat);

    xmat.preMultiply(mat2);
    ymat.preMultiply(mat2);
    zmat.preMultiply(mat2);

    px.setMatrix(xmat);
    py.setMatrix(ymat);
    pz.setMatrix(zmat);
  }
}

WidgetTool.register(TranslateWidget);
