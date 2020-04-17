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

let update_temps = util.cachering.fromConstructor(Vector3, 64);
let update_temps4 = util.cachering.fromConstructor(Vector4, 64);
let update_mats = util.cachering.fromConstructor(Matrix4, 64);

export class WidgetSceneCursor extends WidgetBase {
  constructor() {
    super();
  }

  get isDead() {
    return !this.manager.view3d._showCursor();
  }

  static widgetDefine() {return {
    uiName: "cursor",
    typeName: "cursor",
    selMask: undefined,
    flag : WidgetFlags.IGNORE_EVENTS,
    icon: -1
  }}

  update(manager) {
    super.update(manager);
    let view3d = manager.view3d;

    if (this.shape === undefined) {
      this.shape = new WidgetSphere(manager);
      this.shape.manager = manager;
      this.shape.shapeid = "CURSOR";
    }

    this.matrix.load(view3d.cursor3D);
    this.matrix.scale(0.15, 0.15, 0.15);
  }
};

export class NoneWidget extends WidgetTool {
  static define() {return {
    uiname    : "Disable widgets",
    name      : "none",
    icon      : -1,
    flag      : 0
  }}

  static validate(ctx) {
    return false;
  }
}
WidgetTool.register(NoneWidget);

export class TranslateWidget extends WidgetTool {
  constructor(manager) {
    super(manager);

    this.axes = undefined;
  }

  static widgetDefine() {return {
    uiname    : "Move",
    name      : "translate",
    icon      : Icons.TRANSLATE,
    flag      : 0
  }}

  static validate(ctx) {
    let selmask = ctx.view3d.selectmode;

    if (selmask & SelMask.OBJECT) {
      for (let ob of ctx.scene.objects.selected.editable) {
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
    super.create(ctx, manager);

    console.log("creating widget");

    let center = this.center = this.getSphere(undefined, [0.5, 0.5, 0.5, 1.0]);

    let px = this.getPlane(undefined, [1, 0, 0, 0.5]); //"rgba(255, 0, 0, 0.8)");
    let py = this.getPlane(undefined, "rgba(0, 255, 0, 0.2)");
    let pz = this.getPlane(undefined, "rgba(0, 0, 255, 0.2)");
    this.plane_axes = [px, py, pz];

    let x = this.getArrow(undefined, "red");
    let y = this.getArrow(undefined, "green");
    let z = this.getArrow(undefined, "blue");

    //manager.remove(x);
    //manager.remove(y);
    //manager.remove(z);
    //manager.remove(px);
    //manager.remove(py);
    //manager.remove(center);

    this.axes = [x, y, z];

    center.on_mousedown = (localX, localY) => {
      this.startTool(-1, localX, localY);
    };

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
    let tool = new TranslateOp([localX, localY]);
    let con = new Vector3();
    let selmode = this.ctx.view3d.selectmode;

    tool.inputs.selmask.setValue(selmode);

    if (axis >= 0) {
      if (axis > 2) {
        axis -= 3;
        con[(axis + 1) % 3] = 1.0;
        con[(axis + 2) % 3] = 1.0;
      } else {
        con[axis] = 1.0;
      }

      tool.inputs.constraint.setValue(con);
    }

    this.execTool(tool);
  }

  update(ctx) {
    if (this.axes === undefined) {
      return;
    }

    let x = this.axes[0],
        y = this.axes[1],
        z = this.axes[2];

    let ret = this.view3d.getTransCenter();

    let tmat = new Matrix4();
    let ts = 0.5;
    tmat.translate(ret.center[0], ret.center[1], ret.center[2]);
    tmat.scale(ts, ts, ts);
    this.center.setMatrix(tmat);

    let co1 = new Vector3(ret.center);
    let co2 = new Vector3(co1);

    this.view3d.project(co1);
    this.view3d.project(co2);

    co1[0] += 1.0;

    let z2 = this.view3d.camera.pos.vectorDistance(this.view3d.camera.target);

    this.view3d.unproject(co1);
    this.view3d.unproject(co2);

    let mat = new Matrix4(); //XXX get proper matrix space transform
    mat.multiply(ret.spaceMatrix);

    let xmat = new Matrix4();
    let ymat = new Matrix4();

    let scale = 1.0, scale2 = 1.5;
    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    x.localMatrix.makeIdentity();
    x.localMatrix.translate(0.0, 0.0, scale);
    xmat.scale(scale, scale, scale2);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
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

    let px = this.plane_axes[0];
    let py = this.plane_axes[1];
    let pz = this.plane_axes[2];

    xmat.makeIdentity();
    ymat.makeIdentity();
    zmat.makeIdentity();

    scale *= 0.6;

    let fac = 1.5;

    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    px.localMatrix.makeIdentity();
    px.localMatrix.translate(scale*fac, -scale*fac, 0.0);
    xmat.scale(scale, scale, scale);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    py.localMatrix.makeIdentity();
    py.localMatrix.translate(-scale*fac, scale*fac, 0.0);
    ymat.scale(scale, scale, scale);

    zmat.euler_rotate(0.0, 0.0, 0.0);
    pz.localMatrix.makeIdentity();
    pz.localMatrix.translate(-scale*fac, -scale*fac, 0.0);
    zmat.scale(scale, scale, scale);

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


export class ScaleWidget extends WidgetTool {
  constructor(manager) {
    super(manager);

    this.axes = undefined;
  }

  static widgetDefine() {return {
    uiname    : "Scale",
    name      : "scale",
    icon      : Icons.SCALE_WIDGET,
    flag      : 0
  }}

  static validate(ctx) {
    let selmask = ctx.view3d.selectmode;

    if (selmask == SelMask.OBJECT) {
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

    let center = this.center = this.getSphere(undefined, [0.5, 0.5, 0.5, 1.0]);

    let px = this.getPlane(undefined, [1, 0, 0, 0.5]); //"rgba(255, 0, 0, 0.8)");
    let py = this.getPlane(undefined, "rgba(0, 255, 0, 0.2)");
    let pz = this.getPlane(undefined, "rgba(0, 0, 255, 0.2)");
    this.plane_axes = [px, py, pz];

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

    center.on_mousedown = (localX, localY) => {
      this.startTool(-1, localX, localY);
    };

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
    let tool = new ScaleOp([localX, localY]);
    let con = new Vector3();

    if (axis >= 0) {
      if (axis > 2) {
        axis -= 3;
        con[(axis + 1) % 3] = 1.0;
        con[(axis + 2) % 3] = 1.0;
      } else {
        con[axis] = 1.0;
      }

      tool.inputs.constraint.setValue(con);
    }

    this.execTool(tool);
  }

  update(ctx) {
    if (this.axes === undefined) {
      return;
    }

    let x = this.axes[0],
      y = this.axes[1],
      z = this.axes[2];

    let ret = this.view3d.getTransCenter();

    let tmat = new Matrix4();
    let ts = 0.5;
    tmat.translate(ret.center[0], ret.center[1], ret.center[2]);
    tmat.scale(ts, ts, ts);
    this.center.setMatrix(tmat);

    let co1 = new Vector3(ret.center);
    let co2 = new Vector3(co1);

    this.view3d.project(co1);
    this.view3d.project(co2);

    co1[0] += 1.0;

    let z2 = this.view3d.camera.pos.vectorDistance(this.view3d.camera.target);

    this.view3d.unproject(co1);
    this.view3d.unproject(co2);

    let mat = new Matrix4(); //XXX get proper matrix space transform
    mat.multiply(ret.spaceMatrix);

    let xmat = new Matrix4();
    let ymat = new Matrix4();

    let scale = 1.0;
    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    x.localMatrix.makeIdentity();
    x.localMatrix.translate(0.0, 0.0, scale);
    xmat.scale(scale, scale, scale);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    y.localMatrix.makeIdentity();
    y.localMatrix.translate(0.0, 0.0, scale);
    ymat.scale(scale, scale, scale);

    let zmat = new Matrix4();
    z.localMatrix.makeIdentity();
    z.localMatrix.translate(0.0, 0.0, scale);
    zmat.scale(scale, scale, scale);

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

    let px = this.plane_axes[0];
    let py = this.plane_axes[1];
    let pz = this.plane_axes[2];

    xmat.makeIdentity();
    ymat.makeIdentity();
    zmat.makeIdentity();

    scale *= 0.6;

    let fac = 1.5;

    xmat.euler_rotate(0.0, Math.PI*0.5, 0.0);
    px.localMatrix.makeIdentity();
    px.localMatrix.translate(scale*fac, -scale*fac, 0.0);
    xmat.scale(scale, scale, scale);

    ymat.euler_rotate(Math.PI*0.5, 0.0, 0.0);
    py.localMatrix.makeIdentity();
    py.localMatrix.translate(-scale*fac, scale*fac, 0.0);
    ymat.scale(scale, scale, scale);

    zmat.euler_rotate(0.0, 0.0, 0.0);
    pz.localMatrix.makeIdentity();
    pz.localMatrix.translate(-scale*fac, -scale*fac, 0.0);
    zmat.scale(scale, scale, scale);

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

WidgetTool.register(ScaleWidget);

export class ExtrudeWidget extends WidgetTool {
  constructor(manager) {
    super(manager);

    this.axes = undefined;
  }

  static widgetDefine() {return {
    uiname      : "Extrude",
    name        : "extrude",
    icon        : Icons.EXTRUDE,
    flag        : 0,
    selectMode  : SelMask.FACE
  }}

  static validate(ctx) {
    let selmask = ctx.view3d.selectmode;

    for (let ob of ctx.selectedMeshObjects) {
      for (let f of ob.data.faces.selected) {
        return true;
      }
    }

    return false;
  }

  create(ctx, manager) {
    super.create(ctx, manager);

    console.log("creating widget");

    let arrow = this.arrow = this.getArrow(undefined, "orange");

    arrow.on_mousedown = (localX, localY) => {
      this.startTool(localX, localY);
    };

    this.update(ctx);
  }

  startTool(axis, localX, localY) {
    let tool1 = this.ctx.api.createTool(this.ctx, "mesh.extrude_regions()");
    let tool2 = this.ctx.api.createTool(this.ctx, "view3d.translate()");

    let macro = new ToolMacro();
    macro.add(tool1);
    macro.add(tool2);

    macro.connect(tool1, tool2, () => {
      tool2.inputs.constraint_space.setValue(tool1.outputs.normalSpace.getValue());
    });
    tool2.inputs.constraint.setValue([0, 0, 1]);

    this.execTool(macro, this.ctx);
    //"mesh.extrude_regions()"

  }

  update(ctx) {
    if (ctx === undefined) {
      ctx = this.ctx;
    }

    let no = update_temps.next().zero();
    let no2 = update_temps4.next();
    let no3 = update_temps.next();
    let co = update_temps.next().zero();
    let co2 = update_temps.next().zero();
    let tot = 0.0;

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;
      let obmat = ob.outputs.matrix.getValue();
      no3.zero();

      for (let f of mesh.faces.selected.editable) {
        co2.load(f.cent).multVecMatrix(obmat);

        no2.load(f.no);
        no2[3] = 0.0;
        no2.multVecMatrix(obmat);
        no3.add(no2);

        co.add(co2);
        tot += 1.0;
      }

      no3.normalize();
      no.add(no3);
    }

    if (tot == 0.0) {
      console.warn("error in extrudewidget update");
      return; //should never happen, see this.validate()
    }

    co.mulScalar(1.0 / tot);
    no.normalize();

    let mat = update_mats.next();
    let tmat = update_mats.next();

    mat.makeIdentity();
    tmat.makeIdentity();

    mat.makeNormalMatrix(no);
    tmat.translate(co[0], co[1], co[2]);
    mat.preMultiply(tmat);

    let localmat = this.arrow.localMatrix;
    localmat.makeIdentity();
    localmat.translate(0.0, 0.0, 0.5);

    this.arrow.setMatrix(mat);
  }
}
//WidgetTool.register(ExtrudeWidget);
