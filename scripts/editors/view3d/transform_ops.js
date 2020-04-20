import {keymap} from '../../path.ux/scripts/simple_events.js';
import {TransDataElem, TransformData, TransDataType, PropModes, TransDataTypes, TransDataList} from "./transform_base.js";
import {MeshTransType} from "./transform_types.js";
import {ToolOp, UndoFlags} from "../../path.ux/scripts/simple_toolsys.js";
import {IntProperty, FlagProperty, EnumProperty,
        Vec3Property, Mat4Property, FloatProperty,
        BoolProperty, PropFlags, PropTypes, PropSubTypes
       } from "../../path.ux/scripts/toolprop.js";
import {SelMask} from './selectmode.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {View3DOp} from './view3d_ops.js';
import {isect_ray_plane} from '../../path.ux/scripts/math.js';
import {calcTransCenter} from "./transform_query.js";

/*
Transform refactor:

- Allow passing custom TransDataType classes
- Allow working on UI data (e.g. non-saved)
  so widgets can use transform more flexibly.

* */
export class TransformOp extends View3DOp {
  constructor() {
    super();

    this.tdata = undefined;
    this.centfirst = true;
    this.center = new Vector3();
  }

  static canRun(ctx) {
    return ctx.view3d !== undefined;
  }

  static invoke(ctx, args) {
    let tool = new this();

    if ("selmask" in args) {
      tool.inputs.selmask.setValue(args.selmask);
    } else {
      tool.inputs.selmask.setValue(ctx.view3d.ctx.selectMask);
    }

    if ("propmode" in args) {
      tool.inputs.propmode.setValue(args.propmode);
    }

    if ("propradius" in args) {
      tool.inputs.propradius.setValue(args.propradius);
    }

    return tool;
  }

  static tooldef() {return {
    uiname      : "transform base",
    is_modal    : true,

    inputs       : {
      value      : new Vec3Property(),
      space      : new Mat4Property(),
      constraint : new Vec3Property([1.0,1.0,1.0]), //locked constraint axes
      constraint_space : new Mat4Property(),
      selmask    : new IntProperty(),
      propmode   : new EnumProperty(0, PropModes, undefined,
                   "Prop Mode", "Proportional (magnet) mode",
                   PropFlags.SAVE_LAST_VALUE),
      propradius : new FloatProperty(0.125, "propradius", "Prop Radius",
                       "Proportional radius", PropFlags.SAVE_LAST_VALUE)
    }
  }}

  genTransData(ctx) {
    let tdata = this.tdata = new TransformData();
    let propmode = this.inputs.propmode.getValue();
    let propradius = this.inputs.propradius.getValue();
    let selmask = this.inputs.selmask.getValue();

    //console.log("selmask", selmask, "propmode", propmode, "propradius", propradius);

    for (let type of TransDataTypes) {
      let list = type.genData(ctx, selmask, propmode, propradius);
      if (list === undefined || list.length == 0) {
        continue;
      }

      list.type = type;

      if (!(list instanceof TransDataList)) {
        list = new TransDataList(type, list);
      }

      tdata.push(list);
    }

    return tdata;
  }

  calcCenter(ctx, selmask) {
    let center = new Vector3();
    let tot = 0.0;

    for (let list of this.tdata) {
      let cent2 = list.type.getCenter(ctx);
      if (cent2 !== undefined) {
        center.add(cent2);
        tot++;
      }
    }

    if (tot > 0) {
      center.mulScalar(1.0 / tot);
    }

    return center;
  }


  undoPre(ctx) {
    this.genTransData(ctx);
    this._undo = {};

    for (let list of this.tdata) {
      this._undo[list.type.name] = list.type.undoPre(ctx, list);
    }
  }

  undo(ctx) {
    let udata = this._undo;
    for (let k in udata) {
      for (let type of TransDataTypes) {
        if (type.name === k) {
          type.undo(ctx, udata[k]);
        }
      }
    }

    window.redraw_viewport();
  }

  modalStart(ctx) {
    let promise = super.modalStart(ctx);

    this.tdata = this.genTransData(ctx);

    for (let t of TransDataTypes) {
      let ret = calcTransCenter(this.modal_ctx, this.inputs.selmask.getValue(), this.modal_ctx.view3d.transformSpace);

      if (!this.inputs.constraint_space.wasSet) {
        console.log("setting constraint space", ret.spaceMatrix.$matrix);
        this.inputs.constraint_space.setValue(ret.spaceMatrix);
      }
    }

    return promise;
  }

  applyTransform(ctx, mat) {
    let tdata = this.tdata;
    let do_prop = this.inputs.propmode.getValue() != PropModes.NONE;

    for (let list of tdata) {
      for (let td of list) {
        list.type.applyTransform(ctx, td, do_prop, mat);
      }

      list.type.update(ctx, list);
    }
  }

  doUpdates(ctx) {
    let tdata = this.tdata;
    let do_prop = this.inputs.propmode.getValue() != PropModes.NONE;

    for (let list of tdata) {
      list.type.update(ctx, list);
    }
  }

  modalEnd(was_canceled) {
    this.centfirst = true;
    this.tdata = undefined;

    //make sure selection buffer doesn't get messed up by
    //partial update, do a full sync to gpu on mouse up

    let ctx = this.modal_ctx;
    for (let ob of ctx.selectedMeshObjects) {
      ob.data.regenRender();
    }

    return super.modalEnd(was_canceled);
  }

  cancel() {
    this.applyTransform(this.modal_ctx, new Matrix4());
    this.tdata = undefined;
    this.modalEnd(true);
  }

  finish() {
    this.tdata = undefined;
    this.modalEnd(false);
  }

  on_mouseup(e) {
    if (e.button != 0) {
      this.cancel();
    } else {
      this.finish();
    }

    window.redraw_viewport();
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;

    if (this.centfirst) {
      this.centfirst = false;
      this.center.load(this.calcCenter(ctx, this.inputs.selmask.getValue()));
    }

    let axis_colors = ["red", "green", "blue"];
    let view3d = ctx.view3d;

    let c = this.inputs.constraint.getValue();
    this.resetDrawLines();

    if (c.dot(c) == 1.0) {
      let v1 = new Vector3(c), v2 = new Vector3();

      v1.multVecMatrix(this.inputs.constraint_space.getValue());
      v2.load(v1).mulScalar(1000.0).add(this.center);
      v1.mulScalar(-1000.0).add(this.center);

      let axis = 0;
      for (let i=0; i<3; i++) {
        if (c[i] != 0.0) {
          axis = i;
          break;
        }
      }

      this.addDrawLine(v1, v2, axis_colors[axis]);
    } else if (c.dot(c) == 2.0) {
      let v1 = new Vector3();
      let v2 = new Vector3();
      let axis = 0;

      for (let i=0; i<3; i++) {
        if (c[i] == 0.0) {
          axis = i;
          break;
        }
      }

      v1[(axis+1)%3] -= 1000.0; v2[(axis+1)%3] += 1000.0;
      v1.multVecMatrix(this.inputs.constraint_space.getValue());
      v2.multVecMatrix(this.inputs.constraint_space.getValue());
      v1.add(this.center); v2.add(this.center);

      this.addDrawLine(v1, v2, axis_colors[(axis+1)%3]);

      v1.zero(); v2.zero();
      v1[(axis+2)%3] -= 1000.0; v2[(axis+2)%3] += 1000.0;
      v1.multVecMatrix(this.inputs.constraint_space.getValue());
      v2.multVecMatrix(this.inputs.constraint_space.getValue());
      v1.add(this.center); v2.add(this.center);
      this.addDrawLine(v1, v2, axis_colors[(axis+2)%3]);
    }
  }

  on_keydown(e) {
    console.log(e.keyCode);

    switch (e.keyCode) {
      case keymap["Escape"]:
        this.cancel();
        break;
      case keymap["Enter"]:
        this.finish();
        break;
      case keymap["X"]:
      case keymap["Y"]:
      case keymap["Z"]:
        let axis = e.keyCode - keymap["X"];

        let c = new Vector3();
        if (e.shiftKey) {
          c[(axis+1)%3] = c[(axis+2)%3] = 1.0;
        } else {
          c[axis] = 1.0;
        }

        this.inputs.constraint.setValue(c);
        this.exec(this.modal_ctx);
        break;
    }

    window.redraw_viewport();
  }

  execPre(ctx) {
    this.genTransData(ctx);
    this.center = this.calcCenter(ctx, this.inputs.selmask.getValue());
  }

  execPost(ctx) {
    this.tdata = undefined;
  }
}

export class TranslateOp extends TransformOp {
  constructor(start_mpos) {
    super();

    this.mpos = new Vector3();

    if (start_mpos !== undefined) {
      this.mpos.load(start_mpos);
      this.mpos[2] = 0.0;

      this.first = false;
    } else {
      this.first = true;
    }
  }

  static tooldef() {return {
    uiname      : "Translate",
    description : "Translation tool",
    toolpath    : "view3d.translate",
    is_modal    : true,
    inputs      : ToolOp.inherit({}),
    icon        : -1
  }}

  on_mousemove(e) {
    super.on_mousemove(e);

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.mpos[0] = x;
      this.mpos[1] = y;
      this.first = false;
      return;
    }

    let dx = x - this.mpos[0], dy = y - this.mpos[1];

    view3d.project(scent);
    scent[0] += dx;
    scent[1] += dy;
    view3d.unproject(scent);

    let off = new Vector3(scent).sub(cent);
    let mat = this.inputs.space.getValue();

    //let imat = new Matrix4(mat);
    //imat.invert();
    //off.multVecMatrix(imat);

    let con = this.inputs.constraint.getValue();
    let is_plane = con.dot(con) != 0.0 && con.dot(con) != 1.0 && con.dot(con) != 3.0;

    if (is_plane) { //are we constraining to a plane?
      console.log("plane constraint!");

      con = new Vector3(con);
      for (let i=0; i<con.length; i++) {
        con[i] = con[i]==0.0;
      }
      con.normalize();
      con.multVecMatrix(this.inputs.constraint_space.getValue());
      con.normalize();

      let cent2 = new Vector3(this.center);
      view3d.project(cent2);
      //cent2.negate();

      let view = view3d.getViewVec(cent2[0]+dx, cent2[1]+dy);

      let isect = isect_ray_plane(this.center, con, view3d.camera.pos, view);

      console.log(mpos, con, isect);

      if (isect !== undefined) {
        off.load(isect).sub(cent);
      } else {
        return;
      }
      //(planeorigin, planenormal, rayorigin, raynormal)
      //isect_ray_plane
    } else if (con.dot(con) != 3.0) { //project to line
      let axis = 0;

      for (let i=0; i<3; i++) {
        if (Math.abs(con[i]) > 0.5) {
          axis = i;
          break;
        }
      }

      let p1 = new Vector3(cent);
      let p2 = new Vector3(scent);

      view3d.project(p1);
      view3d.project(p2);

      let n = new Vector3(con);

      let mm = new Matrix4(this.inputs.constraint_space.getValue());

      n.multVecMatrix(mm);
      n.normalize();

      let worldn = new Vector3(n);
      let n2 = new Vector3(n);

      n2.load(cent).add(n);
      n.load(cent);

      view3d.project(n);
      view3d.project(n2);

      let t = new Vector3();
      view3d.project(t.load(scent));
      t.sub(n);

      n.sub(n2).negate().normalize();

      let s = t[0]*n[0] + t[1]*n[1];

      view3d.project(p1.load(cent));
      p1.addFac(n, s);
      view3d.unproject(p1);
      off.load(p1).sub(cent);

      p2.load(cent).addFac(worldn, s);
    }

    this.inputs.value.setValue(off);

    this.exec(ctx);
    this.doUpdates(ctx);
    window.redraw_viewport(true);
  }

  exec(ctx) {
    if (this.tdata === undefined) {
      this.genTransData(ctx);
    }

    let mat = new Matrix4();

    let off = new Vector3(this.inputs.value.getValue());
    //off.mul(this.inputs.constraint.getValue());

    let con = this.inputs.constraint.getValue();
    if (con.dot(con) != 3.0) {
      let cmat = this.inputs.constraint_space.getValue();
      let icmat = new Matrix4(cmat);
      icmat.invert();

      off = new Vector3(off);
      off.multVecMatrix(icmat);
      //off.mul(this.inputs.constraint.getValue());
      off.multVecMatrix(cmat);
    }

    mat.translate(off[0], off[1], off[2]);

    this.applyTransform(ctx, mat);
  }
}

ToolOp.register(TranslateOp);


export class ScaleOp extends TransformOp {
  constructor(start_mpos) {
    super();

    this.mpos = new Vector3();

    if (start_mpos !== undefined) {
      this.mpos.load(start_mpos);
      this.mpos[2] = 0.0;

      this.first = false;
    } else {
      this.first = true;
    }
  }

  static tooldef() {return {
    uiname      : "Scale",
    description : "Scale tool",
    toolpath    : "view3d.scale",
    is_modal    : true,
    inputs      : ToolOp.inherit({}),
    icon        : -1
  }}

  on_mousemove(e) {
    super.on_mousemove(e);

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.mpos[0] = x;
      this.mpos[1] = y;
      this.first = false;
      return;
    }

    let dx = x - this.mpos[0], dy = y - this.mpos[1];

    view3d.project(scent);
    scent[0] += dx;
    scent[1] += dy;
    view3d.unproject(scent);

    let off = new Vector3(scent).sub(cent);
    let mat = this.inputs.space.getValue();

    //let imat = new Matrix4(mat);
    //imat.invert();
    //off.multVecMatrix(imat);

    let con = this.inputs.constraint.getValue();
    let is_plane = con.dot(con) != 0.0 && con.dot(con) != 1.0 && con.dot(con) != 3.0;

    if (is_plane) { //are we constraining to a plane?
      console.log("plane constraint!");

      con = new Vector3(con);
      for (let i=0; i<con.length; i++) {
        con[i] = con[i]==0.0;
      }
      con.normalize();
      con.multVecMatrix(this.inputs.constraint_space.getValue());
      con.normalize();

      let cent2 = new Vector3(this.center);
      view3d.project(cent2);
      //cent2.negate();

      let view = view3d.getViewVec(cent2[0]+dx, cent2[1]+dy);

      let isect = isect_ray_plane(this.center, con, view3d.camera.pos, view);

      console.log(mpos, con, isect);

      if (isect !== undefined) {
        off.load(isect).sub(cent);
      } else {
        return;
      }
      //(planeorigin, planenormal, rayorigin, raynormal)
      //isect_ray_plane
    } else if (con.dot(con) != 3.0) { //project to line
      let axis = 0;

      for (let i=0; i<3; i++) {
        if (Math.abs(con[i]) > 0.5) {
          axis = i;
          break;
        }
      }

      let p1 = new Vector3(cent);
      let p2 = new Vector3(scent);

      view3d.project(p1);
      view3d.project(p2);

      let n = new Vector3(con);

      let mm = new Matrix4(this.inputs.constraint_space.getValue());

      n.multVecMatrix(mm);
      n.normalize();

      let worldn = new Vector3(n);
      let n2 = new Vector3(n);

      n2.load(cent).add(n);
      n.load(cent);

      view3d.project(n);
      view3d.project(n2);

      let t = new Vector3();
      view3d.project(t.load(scent));
      t.sub(n);

      n.sub(n2).negate().normalize();

      let s = t[0]*n[0] + t[1]*n[1];

      view3d.project(p1.load(cent));
      p1.addFac(n, s);
      view3d.unproject(p1);
      off.load(p1).sub(cent);

      p2.load(cent).addFac(worldn, s);
    }

    this.inputs.value.setValue(off);

    this.exec(ctx);
    this.doUpdates(ctx);
    window.redraw_viewport();
  }

  exec(ctx) {
    if (this.tdata === undefined) {
      this.genTransData(ctx);
    }

    let mat = new Matrix4();

    let off = new Vector3(this.inputs.value.getValue());
    //off.mul(this.inputs.constraint.getValue());
    let cent = this.center;

    let con = this.inputs.constraint.getValue();
    mat.translate(cent[0], cent[1], cent[2]);

    if (con.dot(con) != 3.0) {
      let cmat = this.inputs.constraint_space.getValue();
      let icmat = new Matrix4(cmat);
      icmat.invert();

      off = new Vector3(off);
      off.multVecMatrix(icmat);
      //off.mul(this.inputs.constraint.getValue());
      off.multVecMatrix(cmat);

      mat.scale(1.0+off[0], 1.0+off[1], 1.0+off[2]);
    } else {
      let l = off.vectorLength();
      l = (off[0]+off[1]+off[2])/3.0;

      mat.scale(1.0-l, 1.0-l, 1.0-l);
    }
    mat.translate(-cent[0], -cent[1], -cent[2]);

    //mat.translate(off[0], off[1], off[2]);

    this.applyTransform(ctx, mat);
  }
}

ToolOp.register(ScaleOp);
