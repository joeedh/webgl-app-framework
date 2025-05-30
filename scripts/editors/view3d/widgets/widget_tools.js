import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../../core/simplemesh.ts';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property,
  ToolOp, ToolFlags, UndoFlags, ToolMacro,
  PropFlags, PropTypes, PropSubTypes
} from '../../../path.ux/scripts/pathux.js';
import {Shaders} from '../../../shaders/shaders.js';
import {dist_to_line_2d} from '../../../path.ux/scripts/util/math.js';
import {CallbackNode, Node, NodeFlags} from "../../../core/graph.js";
import {DependSocket} from '../../../core/graphsockets.js';
import * as util from '../../../util/util.js';
import {SelMask} from '../selectmode.js';

import {View3DFlags} from "../view3d_base.js";
import {WidgetBase, WidgetSphere, WidgetArrow, WidgetFlags} from './widgets.js';
import {TranslateOp, ScaleOp, RotateOp, InflateOp} from "../transform/transform_ops.js";
import {calcTransCenter} from '../transform/transform_query.js';
import {Icons} from '../../icon_enum.js';
import {ConstraintSpaces} from '../transform/transform_base.js';
import {InsetTransformOp} from '../transform/transform_inset.js';
import {InsetHoleOp} from '../../../mesh/mesh_extrudeops.js';

let update_temps = util.cachering.fromConstructor(Vector3, 64);
let update_temps4 = util.cachering.fromConstructor(Vector4, 64);
let update_mats = util.cachering.fromConstructor(Matrix4, 64);

export class WidgetSceneCursor extends WidgetBase {
  constructor() {
    super();
  }

  get isDead() {
    return !this.manager.ctx.view3d._showCursor();
  }

  static widgetDefine() {
    return {
      uiName  : "cursor",
      typeName: "cursor",
      selMask : undefined,
      flag    : WidgetFlags.IGNORE_EVENTS,
      icon    : -1
    }
  }

  update(manager) {
    super.update(manager);
    let view3d = manager.ctx.view3d;

    if (this.shape === undefined) {
      this.shape = new WidgetSphere(manager);
      this.shape.manager = manager;
      this.shape.shapeid = "CURSOR";
    }

    this.matrix.load(view3d.cursor3D);
    this.matrix.scale(0.15, 0.15, 0.15);
  }
};

export class NoneWidget extends WidgetBase {
  static widgetDefine() {
    return {
      uiname: "Disable widgets",
      name  : "none",
      icon  : -1,
      flag  : 0
    }
  }

  static validate(ctx) {
    return true;
  }
}

export class TransformWidget extends WidgetBase {
  static validate(ctx) {
    let selmask = ctx.selectMask;

    if (selmask & SelMask.OBJECT) {
      for (let ob of ctx.selectedObjects) {
        return true;
      }
    }

    if (selmask & SelMask.GEOM) {
      for (let ob of ctx.selectedMeshObjects) {
        for (let v of ob.data.verts.selected) {
          return true;
        }
      }
    }

    return false;
  }

  create(ctx, manager) {
  }

  /** space: see ConstraintSpaces */
  getTransMatrix(space = undefined) {
    if (!this.ctx || !this.ctx.view3d) {
      return new Matrix4();
    }

    const view3d = this.ctx.view3d;
    return new Matrix4(view3d.getTransMatrix(space));
  }

  getTransAABB() {
    if (!this.ctx || !this.ctx.view3d) {
      window.redraw_viewport();

      let d = 0.00001;
      return [new Vector3([-d, -d, -d]), new Vector3([d, d, d])];
    }

    let ctx = this.ctx;
    let view3d = this.view3d;
    let aabb = this.ctx.view3d.getTransBounds();

    //console.log(new Vector3(aabb[1]).sub(aabb[0]));

    return [new Vector3(aabb[0]), new Vector3(aabb[1])];
  }

  getTransCenter() {
    if (!this.ctx || !this.ctx.view3d) {
      window.redraw_viewport();
      return new Vector3();
    }

    let ret = this.ctx.view3d.getTransCenter();
    let aabb = this.ctx.view3d.getTransBounds();

    if (!aabb) {
      if (ret) {
        ret.center = new Vector3();
        return ret;
      } else {
        return {
          center: new Vector3()
        };
      }
    }

    //use aabb midpoint instead of median center
    ret.center = new Vector3(aabb[0]).interp(aabb[1], 0.5);

    return ret;
  }

  update(ctx) {
  }
}

export class ThreeAxisWidget extends TransformWidget {
  update(ctx) {
    super.update(ctx);

    let x = this.axes[0],
        y = this.axes[1],
        z = this.axes[2];

    let ret = this.getTransCenter();

    this.center.matrix.makeIdentity();
    let sz = 0.4;
    this.center.matrix.scale(sz, sz, sz);

    let p = new Vector3(ret.center);
    const w = this.ctx.view3d.project(p);

    let mat = new Matrix4(); //XXX get proper matrix space transform
    mat.multiply(ret.spaceMatrix);
    let mat2 = new Matrix4();
    mat2.translate(ret.center[0], ret.center[1], ret.center[2]);

    mat.multiply(mat2);
    this.setMatrix(mat);

    let xmat = new Matrix4();
    let ymat = new Matrix4();

    let scale = 1.0;
    let toff = 1.0;
    let scale2 = 1.0; //scale*1.5;

    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    xmat.translate(0.0, 0.0, toff);
    xmat.scale(scale, scale, scale2);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    ymat.translate(0.0, 0.0, toff);
    ymat.scale(scale, scale, scale2);

    let zmat = new Matrix4();
    zmat.translate(0.0, 0.0, toff);
    zmat.scale(scale, scale, scale2);

    x.setMatrix(xmat);
    y.setMatrix(ymat);
    z.setMatrix(zmat);

    if (!this.plane_axes) {
      return;
    }

    let px = this.plane_axes[0];
    let py = this.plane_axes[1];
    let pz = this.plane_axes[2];

    xmat.makeIdentity();
    ymat.makeIdentity();
    zmat.makeIdentity();

    scale *= 0.6;
    let fac = 0.6;

    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    xmat.translate(-toff*fac, -toff*fac, 0.0);
    xmat.scale(scale, scale, scale);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    ymat.translate(toff*fac, toff*fac, 0.0);
    ymat.scale(scale, scale, scale);

    zmat.euler_rotate(0.0, 0.0, 0.0);
    zmat.translate(toff*fac, -toff*fac, 0.0);
    zmat.scale(scale, scale, scale);

    px.setMatrix(xmat);
    py.setMatrix(ymat);
    pz.setMatrix(zmat);
  }
}

export class TranslateWidget extends ThreeAxisWidget {
  constructor(manager) {
    super();
    this.axes = undefined;
  }

  static widgetDefine() {
    return {
      uiname: "Move",
      name  : "translate",
      icon  : Icons.TRANSLATE,
      flag  : 0
    }
  }

  create(ctx, manager) {
    console.log("creating widget");

    super.create(ctx, manager);

    let center = this.center = this.getSphere(undefined, [0.5, 0.5, 0.5, 1.0]);

    let px = this.getPlane(undefined, [1, 0, 0, 0.5]); //"rgba(255, 0, 0, 0.8)");
    let py = this.getPlane(undefined, "rgba(0, 255, 0, 0.2)");
    let pz = this.getPlane(undefined, "rgba(0, 0, 255, 0.2)");
    this.plane_axes = [px, py, pz];

    let x = this.getArrow(undefined, "red");
    let y = this.getArrow(undefined, "green");
    let z = this.getArrow(undefined, "blue");

    this.axes = [x, y, z];

    center.on_mousedown = (e, localX, localY) => {
      this.startTool(-1, localX, localY);
    };

    x.on_mousedown = (e, localX, localY) => {
      this.startTool(0, localX, localY);
    };
    y.on_mousedown = (e, localX, localY) => {
      this.startTool(1, localX, localY);
    };
    z.on_mousedown = (e, localX, localY) => {
      this.startTool(2, localX, localY);
    };

    px.on_mousedown = (e, localX, localY) => {
      this.startTool(3, localX, localY);
    };
    py.on_mousedown = (e, localX, localY) => {
      this.startTool(4, localX, localY);
    };
    pz.on_mousedown = (e, localX, localY) => {
      this.startTool(5, localX, localY);
    };
  }

  startTool(axis, localX, localY) {
    let tool = TranslateOp.invoke(this.ctx, {}); //new TranslateOp([localX, localY]);
    let con = new Vector3();
    let selmode = this.ctx.view3d.ctx.selectMask;

    tool.inputs.selmask.setValue(selmode);

    if (axis >= 0) {
      if (axis > 2) {
        axis -= 3;
        con[(axis + 1)%3] = 1.0;
        con[(axis + 2)%3] = 1.0;
      } else {
        con[axis] = 1.0;
      }

      tool.inputs.constraint.setValue(con);
    }

    this.execTool(this.ctx, tool);
  }

  update(ctx) {
    if (this.axes === undefined) {
      this.create(ctx, this.manager);
    }

    super.update(ctx);
  }
}

export class ScaleWidget extends ThreeAxisWidget {
  constructor(manager) {
    super();

    this.axes = undefined;
  }

  static widgetDefine() {
    return {
      uiname: "Scale",
      name  : "scale",
      icon  : Icons.SCALE_WIDGET,
      flag  : 0
    }
  }


  create(ctx, manager) {
    console.log("creating widget");
    super.create(ctx, manager);

    let center = this.center = this.getSphere(undefined, [0.5, 0.5, 0.5, 1.0]);

    let x = this.getBlockArrow(undefined, "red");
    let y = this.getBlockArrow(undefined, "green");
    let z = this.getBlockArrow(undefined, "blue");

    //manager.remove(x);
    //manager.remove(y);
    //manager.remove(z);
    //manager.remove(px);
    //manager.remove(py);
    //manager.remove(center);

    this.axes = [x, y, z];

    center.on_mousedown = (e, localX, localY) => {
      this.startTool(-1, localX, localY);
    };

    x.on_mousedown = (e, localX, localY) => {
      this.startTool(0, localX, localY);
    };
    y.on_mousedown = (e, localX, localY) => {
      this.startTool(1, localX, localY);
    };
    z.on_mousedown = (e, localX, localY) => {
      this.startTool(2, localX, localY);
    };

    this.update(ctx);
  }

  startTool(axis, localX, localY) {
    let tool = ScaleOp.invoke(this.ctx, {}); //new ScaleOp([localX, localY]);
    let con = new Vector3();
    let selmode = this.ctx.view3d.ctx.selectMask;

    tool.inputs.selmask.setValue(selmode);

    if (axis >= 0) {
      con[axis] = 1.0;

      tool.inputs.constraint.setValue(con);
    }

    this.execTool(this.ctx, tool);
  }

  update(ctx) {
    if (this.axes === undefined) {
      this.create(ctx, this.manager);
    }

    super.update(ctx);
    return;
    let x = this.axes[0],
        y = this.axes[1],
        z = this.axes[2];

    //let ret = new Vector3(aabb[0]).interp(aabb[1], 0.5);


    let ret = this.getTransCenter();
    //ret = {center:  ret};

    let tmat = new Matrix4();
    let ts = 0.5;
    tmat.translate(ret.center[0], ret.center[1], ret.center[2]);
    tmat.scale(ts, ts, ts);
    //this.center.setMatrix(tmat);

    let co1 = new Vector3(ret.center);
    let co2 = new Vector3(co1);

    this.ctx.view3d.project(co1);
    this.ctx.view3d.project(co2);

    co1[0] += 1.0;

    let z2 = this.ctx.view3d.camera.pos.vectorDistance(this.ctx.view3d.camera.target);

    this.ctx.view3d.unproject(co1);
    this.ctx.view3d.unproject(co2);

    let mat = new Matrix4(); //XXX get proper matrix space transform
    mat.multiply(ret.spaceMatrix);

    let xmat = new Matrix4();
    let ymat = new Matrix4();

    //let dpi = devicePixelRatio;

    let scale = 0.65, scale2 = scale*1.5;
    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    x.localMatrix.makeIdentity();
    x.localMatrix.translate(0.0, 0.0, scale);
    xmat.scale(scale, scale, scale2);

    ymat.euler_rotate(-Math.PI*0.5, 0.0, 0.0);
    y.localMatrix.makeIdentity();
    y.localMatrix.translate(0.0, 0.0, scale);
    ymat.scale(scale, scale, scale2);

    let zmat = new Matrix4();
    z.localMatrix.makeIdentity();
    z.localMatrix.translate(0.0, 0.0, scale);
    zmat.scale(scale, scale, scale2);

    let mat2 = new Matrix4();
    mat2.translate(ret.center[0], ret.center[1], ret.center[2]);

    xmat.preMultiply(mat);
    ymat.preMultiply(mat);
    zmat.preMultiply(mat);

    xmat.preMultiply(mat2);
    ymat.preMultiply(mat2);
    zmat.preMultiply(mat2);

    x.setMatrix(xmat);
    y.setMatrix(ymat);
    z.setMatrix(zmat);
  }
}


export class RotateWidget extends TransformWidget {
  constructor() {
    super();

    this._first = true;
  }

  static widgetDefine() {
    return {
      uiname: "Rotate",
      name  : "rotate",
      icon  : Icons.ROTATE,
      flag  : 0,
    }
  }

  static nodedef() {
    return {
      name  : "rotate_widget",
      inputs: Node.inherit({})
    }
  }

  create(ctx, manager) {
    super.create(ctx, manager);

    this._first = false;

    this.axes = [
      this.getTorus(new Matrix4(), [1, 0, 0, 1]),
      this.getTorus(new Matrix4(), [0, 1, 0, 1]),
      this.getTorus(new Matrix4(), [0, 0, 1, 1]),
      //this.getTorus(new Matrix4(), [1, 1, 1, 1]) //view axis
    ];

    let makeonclick = (axis) => {
      return (e) => {
        this.onclick(e, axis);
      }
    }

    for (let i = 0; i < this.axes.length; i++) {
      this.axes[i].onclick = makeonclick(i);
    }
  }

  onclick(e, axis) {
    console.log(axis);
    let op = new RotateOp();
    let con = new Vector3();
    con[axis] = 1.0;

    op.inputs.constraint.setValue(con);
    op.inputs.selmask.setValue(this.ctx.selectMask);

    this.ctx.api.execTool(this.ctx, op);
  }

  draw(gl, manager, matrix = undefined) {
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    super.draw(gl, manager, matrix);

    gl.disable(gl.DEPTH_TEST);
  }

  update() {
    if (!this.ctx.view3d) {
      return;
    }

    if (this._first) {
      this.create(this.ctx)
    }
    super.update();

    let cent = this.getTransCenter().center;
    let aabb = this.getTransAABB();

    for (let axis of this.axes) {
      axis.matrix.makeIdentity();
    }

    let tmat = this.getTransMatrix();
    tmat.translate(cent[0], cent[1], cent[2]);

    let smat = new Matrix4();

    let scale = 2.5; //1.2;

    smat.scale(scale, scale, scale);

    this.matrix.makeIdentity();
    this.matrix.multiply(tmat);
    this.matrix.multiply(smat);

    this.axes[1].matrix.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    this.axes[0].matrix.euler_rotate(0.0, Math.PI*0.5, 0.0);
  }
}

export class InflateWidget extends TransformWidget {
  constructor() {
    super();

    this._first = true;
  }

  static widgetDefine() {
    return {
      uiname: "Inflate",
      name  : "inflate",
      icon  : Icons.INFLATE,
      flag  : 0,
    }
  }

  static nodedef() {
    return {
      name   : "inflate_widget",
      inputs : Node.inherit({}),
      outputs: Node.inherit({})
    }
  }

  create(ctx, manager) {
    this._first = false;

    super.create(ctx, manager);

    this.arrow = this.getBlockArrow(new Matrix4(), [0.7, 0.7, 0.7, 1]);
    this.arrow.onclick = (e) => {
      this.onclick(e);
    }
  }

  onclick(e) {
    let macro = new ToolMacro();
    macro.add(InsetHoleOp.invoke(this.ctx, {}));
    macro.add(InsetTransformOp.invoke(this.ctx, {selmask: this.ctx.selectMask}));

    this.execTool(this.ctx, macro);
  }

  draw(gl, manager, matrix = undefined) {
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    super.draw(gl, manager, matrix);

    gl.disable(gl.DEPTH_TEST);
  }

  update() {
    if (!this.ctx.view3d) {
      return;
    }

    if (this._first) {
      this.create(this.ctx)
    }
    super.update();

    let cent = this.getTransCenter().center;
    let tmat = this.getTransMatrix(ConstraintSpaces.NORMAL);

    let scale = 1.2;

    tmat.normalize();

    this.matrix.makeIdentity();
    this.matrix.translate(cent[0], cent[1], cent[2]);
    this.matrix.scale(scale, scale, scale);
    this.matrix.multiply(tmat);
  }
}
