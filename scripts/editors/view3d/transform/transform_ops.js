import {keymap, reverse_keymap} from '../../../path.ux/scripts/util/simple_events.js';
import {TransDataElem, TransformData, TransDataType, PropModes, TransDataTypes, TransDataList} from "./transform_base.js";
import {MeshTransType} from "./transform_types.js";
import {ToolOp, UndoFlags, IntProperty, FlagProperty, EnumProperty,
  Vec3Property, Mat4Property, FloatProperty,
  BoolProperty, PropFlags, PropTypes, PropSubTypes
} from "../../../path.ux/scripts/pathux.js";
import {SelMask} from '../selectmode.js';
import {Vector2, Vector3, EulerOrders, Vector4, Quat, Matrix4} from '../../../util/vectormath.js';
import {View3DOp} from '../view3d_ops.js';
import {isect_ray_plane} from '../../../path.ux/scripts/util/math.js';
import {calcTransCenter} from "./transform_query.js";
import {CastModes, castViewRay} from '../findnearest.js';

import {ListProperty, StringSetProperty} from "../../../path.ux/scripts/pathux.js";
import {ModalFlags} from "../../../core/modalflags.js";
import {MeshFlags, MeshTypes} from '../../../mesh/mesh_base.js';

/*
Transform refactor:

- Allow passing custom TransDataType classes
- Allow working on UI data (e.g. non-saved)
  so widgets can use transform more flexibly.

* */

export const SnapModes = {
  NONE    : 0,
  SURFACE : 1 //uses depth buffer
};

export class TransformOp extends View3DOp {
  constructor() {
    super();

    this.numericVal = undefined;

    this._mpos = new Vector2();
    this._first = true;

    this.tdata = undefined;
    this.centfirst = true;
    this.center = new Vector3();
  }

  exec(ctx) {
    if (!this.modalRunning) {
      this.genTransData(ctx);
    }
  }

  //called only during modal mode
  numericSet(val) {
    throw new Error("numericSet: implement me!");
  }

  execPost(ctx) {
    //prevent reference leaks from keeping this.tdata around
    this.tdata = undefined;
  }

  static canRun(ctx) {
    return ctx.view3d !== undefined;
  }

  setConstraintFromString(c) {
    let axis = new Vector3();
    let map = {
      x : 0,
      y : 1,
      z : 2
    };

    for (let i=0; i<c.length; i++) {
      let ax = c[i].toLowerCase();

      if (ax in map) {
        axis[map[ax]] = 1.0;
      }
    }

    this.inputs.constraint.setValue(axis);
    return this;
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if ("constraint" in args) {
      tool.setConstraintFromString(args.constraint);
    }

    //console.log("TRANSFROM INVOKE", args);

    if (!("selmask" in args)) {
      tool.inputs.selmask.setValue(ctx.selectMask);
    }

    if (!("propEnabled" in args)) {
      tool.inputs.propEnabled.setValue(ctx.scene.propEnabled);
    }

    if (!("propMode" in args)) {
      tool.inputs.propMode.setValue(ctx.scene.propMode);
    }

    if (!("propRadius" in args)) {
      tool.inputs.propRadius.setValue(ctx.scene.propRadius);
    }

    return tool;
  }

  static tooldef() {return {
    uiname      : "transform base",
    is_modal    : true,

    inputs       : {
      types      : TransDataType.buildTypesProp(["mesh", "object"]).private(),
      value      : new Vec3Property(),
      space      : new Mat4Property().private(),
      snapMode   : new EnumProperty(SnapModes.NONE, SnapModes),
      constraint : new Vec3Property([1.0,1.0,1.0]).private(), //locked constraint axes
      constraint_space : new Mat4Property().private(),
      selmask    : new FlagProperty("GEOM", SelMask).private(),
      propMode   : new EnumProperty(0, PropModes, undefined,
        "Prop Mode", "Proportional (magnet) mode"),
      propRadius : new FloatProperty(0.125, "propradius", "Prop Radius",
        "Proportional radius", PropFlags.SAVE_LAST_VALUE),
      propEnabled : new BoolProperty(false)
    }
  }}

  getTransTypes(ctx) {
    if (this._types !== undefined) {
      return this._types;
    }

    this._types = [];
    for (let type of this.inputs.types.getValue()) {
      type = TransDataType.getClass(type);

      if (!type.isValid(ctx, this)) {
        continue;
      }
      this._types.push(type);
    }

    return this._types;
  }

  genTransData(ctx) {
    let tdata = this.tdata = new TransformData();
    let propmode = this.inputs.propMode.getValue();
    let propradius = this.inputs.propRadius.getValue();
    let selmask = this.inputs.selmask.getValue();

    propmode = !this.inputs.propEnabled.getValue() ? undefined : propmode;

    for (let type of this.getTransTypes(ctx)) {
      let list = type.genData(ctx, selmask, propmode, propradius, this);
      if (list === undefined || list.length === 0) {
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
      if (!list.type.isValid(ctx, this)) {
        continue;
      }

      let cent2 = list.type.getCenter(ctx, list, selmask);
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


  calcUndoMem(ctx) {
    let tot = 0;

    let types = this.getTransTypes(ctx);
    let map = {};
    for (let t of types) {
      map[t.name] = t;
    }

    for (let k in this._undo) {
      let ud = this._undo[k];
      let type = map[k];

      tot += type.calcUndoMem ? type.calcUndoMem(ctx, ud) : 0;
    }

    return tot;
  }

  undoPre(ctx, checkTransData=true) {
    if (checkTransData) {
      this.genTransData(ctx);
    }

    this._undo = {};

    for (let list of this.tdata) {
      this._undo[list.type.name] = list.type.undoPre(ctx, list);
    }
  }

  undo(ctx) {
    let udata = this._undo;
    for (let k in udata) {
      for (let type of this.getTransTypes(ctx)) {
        if (type.name === k) {
          type.undo(ctx, udata[k]);
        }
      }
    }

    window.redraw_viewport();
  }

  modalStart(ctx) {
    ctx.setModalFlag(ModalFlags.TRANSFORMING);

    let promise = super.modalStart(ctx);

    this.numericVal = undefined;
    this.tdata = this.genTransData(ctx);

    for (let t of this.getTransTypes(ctx)) {
      let ret = calcTransCenter(this.modal_ctx, this.inputs.selmask.getValue(), this.modal_ctx.view3d.transformSpace);

      if (!this.inputs.constraint_space.wasSet) {
        console.log("setting constraint space", ret.spaceMatrix.$matrix);
        this.inputs.constraint_space.setValue(ret.spaceMatrix);
      }
    }

    this.center = this.calcCenter(ctx, this.inputs.selmask.getValue());

    return promise;
  }

  applyTransform(ctx, mat) {
    let tdata = this.tdata;
    let do_prop = this.inputs.propEnabled.getValue();

    for (let list of tdata) {
      for (let td of list) {
        list.type.applyTransform(ctx, td, do_prop, mat, this);
      }

      list.type.update(ctx, list);
    }
  }

  doUpdates(ctx) {
    let tdata = this.tdata;
    let do_prop = this.inputs.propEnabled.getValue();

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
    ctx.clearModalFlag(ModalFlags.TRANSFORMING);

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
    console.log("mouseup!");

    if (e.button !== 0) {
      this.cancel();
    } else {
      this.finish();
    }

    window.redraw_viewport();
  }

  on_mousewheel(e) {
    console.log("wheel!", e, e.x, e.y);

    let dy = 1.0 + e.deltaY*0.001;
    dy = Math.max(dy, 0.001);

    let r = this.inputs.propRadius.getValue() * dy;
    this.inputs.propRadius.setValue(r);

    this.modal_ctx.scene.propRadius = r;

    let mpos = new Vector2();
    let view3d = this.modal_ctx.view3d;

    if (e.x !== undefined && e.y !== undefined) {
      mpos.load(view3d.getLocalMouse(e.x, e.y));
    } else if (e.x !== undefined && e.y !== undefined) {
      mpos.load(view3d.getLocalMouse(e.x, e.y));
    } else if (!this._first) {
      mpos.load(this._mpos);
    } else {
      return;
    }

    this.updatePropRadius(r, mpos);

    console.log("dy", dy, r);

  }

  updatePropRadius(r, mpos) {
    this.inputs.propRadius.setValue(r);
    this.modal_ctx.scene.propRadius = r;

    this.updateDrawLines(mpos[0], mpos[1])
    this.updateTransData();
    this.exec(this.modal_ctx);
  }

  updateTransData() {
    this.applyTransform(this.modal_ctx, new Matrix4());
    this.tdata = undefined;

    this.genTransData(this.modal_ctx);
    this.undoPre(this.modal_ctx, false);
  }

  updateDrawLines(localX, localY) {
    let ctx = this.modal_ctx;

    if (this.centfirst) {
      this.centfirst = false;
      this.center.load(this.calcCenter(ctx, this.inputs.selmask.getValue()));
    }

    //return;

    let axis_colors = ["red", "green", "blue"];
    let view3d = ctx.view3d;

    let c = this.inputs.constraint.getValue();
    this.resetDrawLines();

    let cent = this.calcCenter(ctx, this.inputs.selmask.getValue());

    let sco = new Vector4(cent);
    sco[3] = 1.0;
    view3d.project(sco);

    let dpi = window.devicePixelRatio;

    let r = this.inputs.propRadius.getValue();
    r *= view3d.glSize[1]/sco[3]/dpi;

    if (this.inputs.propEnabled.getValue()) {
      this.addDrawCircle2D(sco, r, "rgba(0.8,0.8,0.8,1.0)")
    }

    if (c.dot(c) === 1.0) {
      let v1 = new Vector3(c), v2 = new Vector3();

      v1.multVecMatrix(this.inputs.constraint_space.getValue());
      v2.load(v1).mulScalar(1000.0).add(this.center);
      v1.mulScalar(-1000.0).add(this.center);

      let axis = 0;
      for (let i=0; i<3; i++) {
        if (c[i] !== 0.0) {
          axis = i;
          break;
        }
      }

      this.addDrawLine(v1, v2, axis_colors[axis]);
    } else if (c.dot(c) === 2.0) {
      let v1 = new Vector3();
      let v2 = new Vector3();
      let axis = 0;

      for (let i=0; i<3; i++) {
        if (c[i] === 0.0) {
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

  on_mousemove(e) {
    let view3d = this.modal_ctx.view3d;

    this._mpos.load(view3d.getLocalMouse(e.x, e.y));
    this._first = false;

    this.updateDrawLines(this._mpos[0], this._mpos[1]);
  }

  doNumericInput(key) {
    if (this.numericVal === undefined) {
      this.numericVal = {
        sign : 1,
        str : '',
        value : 0.0
      }
    }

    let num = this.numericVal;

    if (key === keymap['-']) {
      num.sign *= -1;
    } else if (key >= keymap['0'] && key <= keymap['9']) {
      num.str += reverse_keymap[key];
    } else if (key === keymap['.']) {
      if (num.str === '') {
        num.str = '0';
      }

      num.str += '.'
    } else if (key === keymap['Backspace']) {
      if (num.str.length > 0) {
        num.str = num.str.slice(0, num.str.length-1);
      }
    }

    console.log("Numeric input!", key, this.numericVal);

    let f = num.str;
    if (f.endsWith(".")) {
      f = f.slice(0, f.length-1);
    }

    if (f.length === 0) {
      return;
    }

    if (isNaN(parseFloat(f))) {
      this.ctx.error("Numeric input error! " + f);
      return;
    }

    f = parseFloat(f) * num.sign;
    this.numericSet(f);

    console.log("Numeric input:", f, (num.sign ? '-' : '') + num.str);

    this.exec(this.modal_ctx);
    window.redraw_viewport();
  }

  on_keydown(e) {
    console.log(e.keyCode);

    let doprop = false, sign = undefined;

    if (e.ctrlKey && (e.keyCode === keymap['='] || e.keyCode === keymap['-'])) {
      doprop = true;
      sign = e.keyCode === keymap['='] ? 1.0 : -1.0;
    }

    if (e.keyCode === keymap["NumPlus"] || e.keyCode === keymap["NumMinus"]) {
      doprop = true;
      sign = e.keyCode === keymap["NumPlus"] ? 1.0 : -1.0;
    }

    if (doprop) {
      let r = this.inputs.propRadius.getValue();
      let step = 0.15;

      r *= 1.0 + step*sign;

      this.updatePropRadius(r, this._mpos);

      return;
    }

    let numeric = e.keyCode === keymap['-'] || e.keyCode === keymap['.'];
    numeric = numeric || (e.keyCode >= keymap['0'] && e.keyCode <= keymap['9']);
    numeric = numeric || e.keyCode === keymap['Backspace'];

    if (numeric) {
      this.doNumericInput(e.keyCode);
      return;
    }

    switch (e.keyCode) {
      case keymap["Escape"]:
        //if (!this.numericVal) {
          this.cancel();
        //} else {
        //  this.numericVal = undefined;
        //}
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

  numericSet(val) {
    let off = this.inputs.value.getValue();
    off.zero();
    let con = this.inputs.constraint.getValue();

    let mask = 1*(!!con[0]) + 2*(!!con[1]) + 4*(!!con[2]);

    switch (mask) {
      case 0:
      case 7:
        off[0] = off[1] = off[2] = val;
        break;
      case 1:
        off[0] = val;
        break;
      case 2:
        off[1] = val;
        break;
      case 4:
        off[2] = val;
        break;
      case 3:
        off[0] = off[1] = val;
        break;
      case 5:
        off[0] = off[2] = val;
        break;
      case 6:
        off[1] = off[2] = val;
    }
  }

  on_mousemove(e) {
    super.on_mousemove(e);

    if (this.numericVal !== undefined) {
      return;
    }

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector4(cent);

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.mpos[0] = x;
      this.mpos[1] = y;
      this.first = false;
      return;
    }

    let dx = x - this.mpos[0], dy = y - this.mpos[1];

    let scent2 = new Vector4(scent);

    scent2[3] = 1.0;
    view3d.project(scent2);

    scent2[0] += dx;
    scent2[1] += dy;

    scent2[3] = 1.0;
    view3d.unproject(scent2);

    scent.load(scent2);

    let off = new Vector3(scent).sub(cent);
    let mat = this.inputs.space.getValue();

    //let imat = new Matrix4(mat);
    //imat.invert();
    //off.multVecMatrix(imat);

    let con = this.inputs.constraint.getValue();
    let is_plane = con.dot(con) != 0.0 && con.dot(con) != 1.0 && con.dot(con) != 3.0;

    if (is_plane) { //are we constraining to a plane?
      //console.log("plane constraint!");

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

      let isect = isect_ray_plane(this.center, con, view3d.activeCamera.pos, view);

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

    let snap = this.inputs.snapMode.getValue();
    if (snap == SnapModes.SURFACE) {
      let co = new Vector3(this.center).add(off);
      let sco = new Vector3(co);

      view3d.project(sco);

      let ret = castViewRay(ctx, SelMask.OBJECT|SelMask.GEOM, sco, view3d);

      if (ret !== undefined) {
        co.sub(ret.p3d).negate();
        off.add(co);
      }
    }

    this.inputs.value.setValue(off);

    this.exec(ctx);
    this.doUpdates(ctx);
    window.redraw_viewport(true);
  }

  exec(ctx) {
    super.exec(ctx);

    let mat = new Matrix4();

    let off = new Vector3(this.inputs.value.getValue());
    //off.mul(this.inputs.constraint.getValue());

    let con = this.inputs.constraint.getValue();
    if (con.dot(con) !== 3.0) {
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

  numericSet(val) {
    let off = this.inputs.value.getValue();
    off.zero().addScalar(1.0);

    let con = this.inputs.constraint.getValue();

    let mask = 1*(!!con[0]) + 2*(!!con[1]) + 4*(!!con[2]);

    switch (mask) {
      case 0:
      case 7:
        off[0] = off[1] = off[2] = val;
        break;
      case 1:
        off[0] = val;
        break;
      case 2:
        off[1] = val;
        break;
      case 4:
        off[2] = val;
        break;
      case 3:
        off[0] = off[1] = val;
        break;
      case 5:
        off[0] = off[2] = val;
        break;
      case 6:
        off[1] = off[2] = val;
    }

    this.inputs.value.setValue(off);
  }

  on_mousemove(e) {
    super.on_mousemove(e);

    if (this.numericVal !== undefined) {
      return;
    }

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    let mpos = new Vector3(view3d.getLocalMouse(e.x, e.y));
    mpos[2] = 0.0;

    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.mpos[0] = x;
      this.mpos[1] = y;
      this.mpos[2] = 0.0;

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

      if (isect !== undefined) {
        off.load(isect).sub(cent);
      } else {
        return;
      }
      //(planeorigin, planenormal, rayorigin, raynormal)
      //isect_ray_plane
    } else if (Math.abs(con.dot(con)-3.0) > 0.001) { //project to line
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
    } else {
      scent.load(cent);
      view3d.project(scent);

      this.mpos[2] = scent[2];
      mpos[2] = scent[2];

      let l1 = this.mpos.vectorDistance(scent);
      let l2 = mpos.vectorDistance(scent);
      let ratio = 1.0;

      if (l1 !== 0.0 && l2 !== 0.0) {
        ratio = l2 / l1;
      }

      off[0] = off[1] = off[2] = ratio;
    }

    this.inputs.value.setValue(off);

    this.exec(ctx);
    this.doUpdates(ctx);
    window.redraw_viewport();
  }

  exec(ctx) {
    super.exec(ctx);
    let mat = new Matrix4();

    let off = new Vector3(this.inputs.value.getValue());
    //off.mul(this.inputs.constraint.getValue());
    let cent = this.center;

    let con = this.inputs.constraint.getValue();
    mat.translate(cent[0], cent[1], cent[2]);

    if (con.dot(con) !== 3.0) {
      let cmat = this.inputs.constraint_space.getValue();
      let icmat = new Matrix4(cmat);
      icmat.invert();

      off = new Vector3(off);
      off.multVecMatrix(icmat);
      //off.mul(this.inputs.constraint.getValue());
      off.multVecMatrix(cmat);

      mat.scale(1.0+off[0], 1.0+off[1], 1.0+off[2]);
    } else {

      mat.scale(off[0], off[1], off[2]);
    }
    mat.translate(-cent[0], -cent[1], -cent[2]);

    this.applyTransform(ctx, mat);
  }
}

ToolOp.register(ScaleOp);



export class RotateOp extends TransformOp {
  constructor(start_mpos) {
    super();

    this.mpos = new Vector3();
    this.last_mpos = new Vector3();
    this.start_mpos = new Vector3();
    this.thsum = 0;
    this.trackball = false;

    if (start_mpos !== undefined) {
      this.mpos.load(start_mpos);
      this.mpos[2] = 0.0;

      this.first = false;
    } else {
      this.first = true;
    }
  }

  static tooldef() {return {
    uiname      : "Rotate",
    description : "Rotate",
    toolpath    : "view3d.rotate",
    is_modal    : true,
    inputs      : ToolOp.inherit({
      euler     : new Vec3Property()
    }),
    icon        : -1
  }}

  on_mousemove(e) {
    if (this.numericVal !== undefined) {
      return;
    }

    if (this.trackball) {
      return this.on_mousemove_trackball(e);
    } else {
      return this.on_mousemove_normal(e);
    }

  }

  on_keydown(e) {
    if (e.keyCode === keymap["R"] && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.commandKey) {
      this.trackball ^= 1;
    } else {
      return super.on_keydown(e);
    }
  }

  on_mousemove_normal(e) {
    super.on_mousemove(e);

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    view3d.project(scent);

    let mpos = new Vector3(view3d.getLocalMouse(e.x, e.y));
    mpos[2] = scent[2];

    let x = mpos[0], y = mpos[1];
    this.mpos[0] = x;
    this.mpos[1] = y;
    this.mpos[2] = mpos[2];

    if (this.first) {
      this.last_mpos.load(this.mpos);
      this.start_mpos.load(this.mpos);

      this.first = false;
      return;
    }


    let rco = new Vector3([mpos[0], mpos[1], scent[2]]);
    view3d.unproject(rco);

    //this.makeTempLine(cent, rco, "orange");

    let axismap = {
      3 : 2, //xy
      5 : 1, //zy,
      6 : 0, //xz,
      0 : 0,
      1 : 0,
      2 : 1,
      4 : 2,
    };


    let con = this.inputs.constraint.getValue();
    if (con.dot(con) !== 3.0) {
      let mask = 0;
      for (let i=0; i<con.length; i++) {
        mask |= con[i] !== 0.0 ? 1 << i : 0;
      }

      let axis = axismap[mask];

      let cmat = this.inputs.constraint_space.getValue();
      let icmat = new Matrix4(cmat);
      icmat.invert();

      let view1 = view3d.getViewVec(this.mpos[0], this.mpos[1]);
      //let view2 = view3d.getViewVec(this.last_mpos[0], this.last_mpos[1]);
      let view2 = view3d.getViewVec(this.last_mpos[0], this.last_mpos[1]);

      let plane = new Vector3();
      plane[axis] = 1.0;

      plane.multVecMatrix(cmat);
      let origin = new Vector3(this.center);

      plane.normalize();
      view1.normalize();
      view2.normalize();

      let near = -view3d.activeCamera.near - 0.000001;
      //near *= -1.0 / (view3d.activeCamera.far - view3d.activeCamera.near);

      let rco = new Vector3([this.mpos[0], this.mpos[1], near ]);
      let lastco = new Vector3([this.last_mpos[0], this.last_mpos[1], near]);

      view3d.unproject(rco);
      view3d.unproject(lastco);

      rco =  view3d.activeCamera.pos;

      let isect1 = isect_ray_plane(origin, plane, rco, view1);
      let isect2 = isect_ray_plane(origin, plane, lastco, view2);

      this.makeTempLine(isect1, this.center, "green");
      //this.makeTempLine(isect2, this.center, "blue");

      /*
      for (let i=-10; i<=10; i++) {
        for (let j=0; j<2; j++) {
          let v1 = new Vector3(this.center);
          let v2 = new Vector3(this.center);

          let j2 = j ? 2 : 1;

          v1[(axis + j2) % 3] -= 2.5;
          v2[(axis + j2) % 3] += 2.5;
          let df = 0.2;

          j2 = j ? 1 : 2;
          v1[(axis + j2) % 3] += df * i;
          v2[(axis + j2) % 3] += df * i;

          this.makeTempLine(v1, v2, "teal");
        }
      }
      //*/

      if (!isect1 || !isect2) {
        return;
      }

      view3d.project(isect1);
      view3d.project(isect2);

      isect1.sub(scent);
      isect2.sub(scent);

      //isect1.sub(this.center);
      //isect2.sub(this.center);

      isect1.normalize();
      isect2.normalize();

      let w = isect1[0]*isect2[1] - isect1[1]*isect2[0];

      w = Math.asin(w*0.999);

      if (plane.dot(view2) < 0.0) {
        w *= -1;
      }
      this.thsum += w;

      //this.inputs.euler.getValue().zero();
      //this.inputs.euler.getValue()[axis] = this.thsum;

      this._update();
    } else {
      let v1 = new Vector2(this.mpos).sub(scent);
      let v2 = new Vector2(this.last_mpos).sub(scent);

      v1.normalize();
      v2.normalize();

      let w = v1[0]*v2[1] - v1[1]*v2[0];

      w = -Math.asin(w*0.999);
      this.thsum += w;

      this._update();

      /*
      let mat = new Matrix4();
      let rmat = new Matrix4(view3d.activeCamera.rendermat);
      rmat.makeRotationOnly();

      let irmat = new Matrix4(rmat);
      let eul = new Vector3();

      irmat.invert();

      let rotmat = new Matrix4();
      rotmat.euler_rotate_order(0, 0, this.thsum, EulerOrders.XYZ);

      mat.multiply(irmat);
      mat.multiply(rotmat);
      mat.multiply(rmat);

      mat.decompose(new Vector3(), eul);

      this.inputs.euler.setValue(eul);

      // */
    }

    this.exec(ctx);

    this.last_mpos.load(this.mpos);
  }

  _update() {
    if (this.trackball) {
      return;
    }

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    view3d.project(scent);

    //this.makeTempLine(cent, rco, "orange");

    let axismap = {
      3 : 2, //xy
      5 : 1, //zy,
      6 : 0, //xz,
      0 : 0,
      1 : 0,
      2 : 1,
      4 : 2,
    };


    let con = this.inputs.constraint.getValue();
    if (con.dot(con) !== 3.0) {
      let mask = 0;
      for (let i=0; i<con.length; i++) {
        mask |= con[i] !== 0.0 ? 1 << i : 0;
      }

      let axis = axismap[mask];

      let cmat = new Matrix4(this.inputs.constraint_space.getValue());
      cmat.makeRotationOnly();

      let icmat = new Matrix4(cmat);
      icmat.invert();

      let eul = this.inputs.euler.getValue();

      eul.zero();
      eul[axis] = this.thsum;

      let mat = new Matrix4();
      mat.euler_rotate_order(eul[0], eul[1], eul[2], EulerOrders.XYZ);
      mat.multiply(icmat);
      mat.decompose(new Vector3(), eul, undefined, undefined, undefined, EulerOrders.XYZ);

      this.inputs.euler.setValue(eul);
    } else {
      let mat = new Matrix4();
      let rmat = new Matrix4(view3d.activeCamera.rendermat);
      rmat.makeRotationOnly();

      let irmat = new Matrix4(rmat);
      let eul = new Vector3();

      irmat.invert();

      let rotmat = new Matrix4();
      rotmat.euler_rotate_order(0, 0, this.thsum, EulerOrders.XYZ);

      mat.multiply(irmat);
      mat.multiply(rotmat);
      mat.multiply(rmat);

      mat.decompose(new Vector3(), eul);

      this.inputs.euler.setValue(eul);
    }
  }

  numericSet(value) {
    this.thsum = value/180.0*Math.PI;
    this._update();
  }

  on_mousemove_trackball(e) {
    super.on_mousemove(e);

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    view3d.project(scent);
    scent[2] = 0.0;

    let mpos = new Vector3(view3d.getLocalMouse(e.x, e.y));
    mpos[2] = 0.0;

    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.mpos[0] = x;
      this.mpos[1] = y;
      this.mpos[2] = 0.0;

      this.last_mpos.load(this.mpos);

      this.first = false;
      return;
    }

    let dx = x - this.last_mpos[0], dy = y - this.last_mpos[1];
    let rx = x - this.mpos[0], ry = y - this.mpos[1];

    let rot = new Vector3();

    let mat = new Matrix4();
    let rscale = 0.004;
    rot[0] = rx*rscale;
    rot[1] = ry*rscale;

    let cmat = new Matrix4(view3d.activeCamera.cameramat);
    cmat.makeRotationOnly();

    let cmat2 = new Matrix4(cmat);
    cmat2.invert();

    //mat.multiply(cmat);
    mat.euler_rotate(rot[0], rot[1], rot[2]);
    //mat.euler_rotate(0, 0, rx*rscale);
    //mat.multiply(cmat);

    mat.decompose(undefined, rot);

    this.inputs.euler.setValue(rot);

    this.exec(ctx);
    this.doUpdates(ctx);
    window.redraw_viewport();

    this.last_mpos.load(mpos);
  }

  exec(ctx) {
    super.exec(ctx);
    let mat = new Matrix4();

    let off = new Vector3(this.inputs.value.getValue());
    //off.mul(this.inputs.constraint.getValue());
    let cent = this.center;

    let con = this.inputs.constraint.getValue();
    let eul = this.inputs.euler.getValue();

    let axismap = {
      3 : 2, //xy
      5 : 1, //zy,
      6 : 0, //xz,
      0 : 0,
      1 : 0,
      2 : 1,
      4 : 2,
    };

    if (con.dot(con) !== 3.0) {
      eul = new Vector3(eul);

      let mask = 0;
      for (let i=0; i<con.length; i++) {
        mask |= con[i] !== 0.0 ? 1 << i : 0;
      }

      let axis = axismap[mask];

      let cmat = this.inputs.constraint_space.getValue();
      let icmat = new Matrix4(cmat);
      icmat.invert();

      //console.log(cmat.toString());

      let mat2 = new Matrix4();
      mat2.euler_rotate_order(eul[0], eul[1], eul[2], EulerOrders.XYZ);
      mat2.multiply(cmat);

      //avoid gimble lock
      let order = axis === 1 ? EulerOrders.YZX : EulerOrders.XYZ;

      mat2.decompose(new Vector3(), eul, undefined, undefined, undefined, order);

      eul[(axis+1) % 3] = 0;
      eul[(axis+2) % 3] = 0;

      mat.euler_rotate_order(eul[0], eul[1], eul[2], order);
      mat.multiply(icmat);
    } else {
      mat.euler_rotate_order(eul[0], eul[1], eul[2], EulerOrders.XYZ);
    }


    let mat2 = new Matrix4();
    //mat2.translate(-off[0], -off[1], -off[2]);
    mat2.translate(cent[0], cent[1], cent[2]);
    mat2.multiply(mat);
    mat2.translate(-cent[0], -cent[1], -cent[2]);
    //mat2.translate(off[0], off[1], off[2]);

    this.applyTransform(ctx, mat2);

    window.redraw_viewport(true);
  }
}

ToolOp.register(RotateOp);


export class InflateOp extends TransformOp {
  constructor(start_mpos) {
    super();

    this.mpos = new Vector3();
    this.last_mpos = new Vector3();
    this.start_mpos = new Vector3();
    this.thsum = 0;
    this.trackball = false;

    if (start_mpos !== undefined) {
      this.mpos.load(start_mpos);
      this.mpos[2] = 0.0;

      this.first = false;
    } else {
      this.first = true;
    }
  }

  static tooldef() {return {
    uiname      : "Inflate",
    description : "Inflate along surface normals",
    toolpath    : "view3d.inflate",
    is_modal    : true,
    inputs      : ToolOp.inherit({
      factor    : new FloatProperty(0.0),
    }),
    icon        : -1
  }}

  on_mousemove(e) {
    if (this.numericVal !== undefined) {
      return;
    }

    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let cent = this.center;
    let scent = new Vector3(cent);

    view3d.project(scent);

    let mpos = new Vector3(view3d.getLocalMouse(e.x, e.y));
    mpos[2] = scent[2];

    let x = mpos[0], y = mpos[1];
    this.mpos[0] = x;
    this.mpos[1] = y;
    this.mpos[2] = mpos[2];

    if (this.first) {
      this.last_mpos.load(this.mpos);
      this.start_mpos.load(this.mpos);

      this.first = false;
      return;
    }

    let dx = this.start_mpos[0] - scent[0];
    let dy = this.start_mpos[1] - scent[1];

    //let t1 = new Vector3([dx, dy, 0]);
    let t1 = new Vector3([0, -1, 0]);
    let t2 = new Vector3(this.mpos).sub(this.start_mpos);
    t2[2] = 0;

    let sign = Math.sign(t1.dot(t2));

    this.resetTempGeom();
    this.addDrawLine2D(this.mpos, this.start_mpos, "orange");

    let w = view3d.project(new Vector3(this.center));
    let dis = t2.vectorLength() / view3d.size[1];

    //console.log(dis*sign*w, t1, t2, scent, this.center);

    this.inputs.factor.setValue(dis*w*sign);
    this.exec(ctx);
  }

  numericSet(value) {
    this.inputs.factor.setValue(value);
  }

  exec(ctx) {
    let tdata = this.tdata;

    if (!tdata) {
      this.genTransData(ctx);
      tdata = this.tdata;
    }

    let factor = this.inputs.factor.getValue();

    let norSelOnly = this.inputs.selmask.getValue() & MeshTypes.FACE;
    let n = new Vector3();

    function calcNormal(v) {
      if (!norSelOnly) {
        return v.no;
      } else {
        n.zero();
        let tot = 0;

        for (let f of v.faces) {
          if (f.flag & MeshFlags.SELECT) {
            n.add(f.no);
            tot++;
          }
        }

        if (!tot) {
          n.load(v.no);
        } else {
          n.normalize();
        }

        return n;
      }
    }

    for (let list of tdata) {
      if (list.type !== MeshTransType) {
        continue;
      }

      for (let td of list) {
        if (!td.no) {
          td.no = new Vector3(calcNormal(td.data1));
        }

        td.data1.load(td.data2).addFac(td.no, factor);
        td.data1.flag |= MeshFlags.UPDATE;
        td.mesh.regenRender();
      }
    }

    this.doUpdates(ctx);
    window.redraw_viewport(true);
  }
}

ToolOp.register(InflateOp);


