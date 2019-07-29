import {Matrix4, Vector2} from "../util/vectormath.js";
import {ToolOp, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {keymap} from '../path.ux/scripts/simple_events.js';
import {StringProperty, Vec2Property} from '../path.ux/scripts/toolprop.js';
import {Icons} from './icon_enum.js';
import * as util from '../util/util.js';

export let VelPanFlags = {
  UNIFORM_SCALE : 1
};

export class VelPan {
  constructor() {
    /** boundary limits*/
    this.bounds = [new Vector2([-2000, -2000]), new Vector2([2000, 2000])];

    this.pos = new Vector2();
    this.scale = new Vector2([1, 1]);
    this.axes = 3;
    this.flag = VelPanFlags.UNIFORM_SCALE;

    this.mat = new Matrix4();
    this.imat = new Matrix4();

    this._last_mat = new Matrix4(this.mat);
    this.onchange = null;
  }

  copy() {
    return new VelPan().load(this);
  }

  //for controller api; doesn't support multipart datapaths
  get min() {
    return this.bounds[0];
  }

  //for controller api; doesn't support multipart datapaths
  get max() {
    return this.bounds[1];
  }

  /**
   load settings from another velocity pan instance
   does NOT set this.onchange
   * */
  load(velpan) {
    this.pos.load(velpan.pos);
    this.scale.load(velpan.scale);
    this.axes = velpan.axes;
    this.bounds[0].load(velpan.bounds[0]);
    this.bounds[1].load(velpan.bounds[1]);

    this.update(false);

    return this;
  }

  update(fire_events=true) {
    this.mat.makeIdentity();
    this.mat.scale(this.scale[0], this.scale[1], 1.0);
    this.mat.translate(this.pos[0], this.pos[1], 0.0);

    this.imat.load(this.mat).invert();

    if (fire_events && JSON.stringify(this.mat) != JSON.stringify(this._last_mat)) {
      //console.log("velpan update");

      this._last_mat.load(this.mat);

      if (this.onchange)
        this.onchange(this);
    }
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

VelPan.STRUCT = `
VelPan {
  bounds : array(vec2); 
  pos    : vec2;
  scale  : vec2;
  axes   : int;
  mat    : mat4;
  imat   : mat4;
  flag   : int;
}
`;
nstructjs.manager.add_class(VelPan);

export class VelPanZoomOp extends ToolOp {
  constructor() {
    super();

    this.first = true;
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this._temps = util.cachering.fromConstructor(Vector2, 16);
  }

  static tooldef() {return {
    uiname      : "Zoom (2d)",
    description : "zoom 2d window",
    toolpath    : "velpan.zoom",
    undoflag    : UndoFlags.NO_UNDO,
    is_modal    : true,
    icon        : -1,

    inputs      : {
      velpanPath : new StringProperty(),
      scale      : new Vec2Property(new Vector2([1, 1]))
    }
  }}

  on_mousemove(e) {
    let ctx = this.modal_ctx;
    let path = this.inputs.velpanPath.getValue();
    let velpan = ctx.api.getValue(ctx, path);

    let mpos = this._temps.next().zero();
    mpos[0] = e.x;
    mpos[1] = e.y;

    if (this.first) {
      this.start_mpos.load(mpos);
      this.last_mpos.load(mpos);
      this.first = false;

      return;
    }

    let dx = mpos[0] - this.last_mpos[0];
    let dy = mpos[1] - this.last_mpos[1];

    let scale = this.scale;
    if (velpan.flag & VelPanFlags.UNIFORM_SCALE) {
      let f = this.inputs.scale[0];

      f += dx/512;

      f = Math.max(f, 0.01);

      this.inputs.scale.loadXY(f, f);
    } else {
      let sx = this.inputs.scale[0];
      let sy = this.inputs.scale[1];

      sx += dx/512;
      sy += dy/512;

      sx = Math.max(sx, 0.01);
      sy = Math.max(sy, 0.01);

      this.inputs.scale.loadXY(f, f);
    }

    this.exec(this.modal_ctx);

    this.last_mpos.load(mpos);
  }

  exec(ctx) {
    let path = this.inputs.velpanPath.getValue();

    let velpan = ctx.api.getValue(ctx, path);
    velpan.scale.mul(this.inputs.scale.getValue());
    
  }

  on_mouseup(e) {
    this.modalEnd();
  }
}

ToolOp.register(VelPanZoomOp);


export class VelPanPanOp extends ToolOp {
  constructor() {
    super();

    this.start_pan = new Vector2();
    this.first = true;
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this._temps = util.cachering.fromConstructor(Vector2, 16);
  }

  static tooldef() {return {
    uiname      : "Pan (2d)",
    description : "Pan 2d window",
    toolpath    : "velpan.pan",
    undoflag    : UndoFlags.NO_UNDO,
    is_modal    : true,
    icon        : -1,

    inputs      : {
      velpanPath : new StringProperty(),
      pan        : new Vec2Property()
    }
  }}

  on_mousemove(e) {
    let ctx = this.modal_ctx;
    let path = this.inputs.velpanPath.getValue();
    let velpan = ctx.api.getValue(ctx, path);

    if (velpan === undefined) {
      this.modalEnd();
      throw new Error("bad velpan path " + path + ".");
    }

    let mpos = this._temps.next().zero();
    mpos[0] = e.x;
    mpos[1] = e.y;

    if (this.first) {
      this.start_mpos.load(mpos);
      this.last_mpos.load(mpos);
      this.first = false;
      this.start_pan.load(velpan.pos);

      return;
    }

    let dx = mpos[0] - this.last_mpos[0];
    let dy = mpos[1] - this.last_mpos[1];

    dx /= velpan.scale[0];
    dy /= velpan.scale[1];

    let pan = this.inputs.pan.getValue();
    pan[0] += dx;
    pan[1] += dy;

    velpan.pos.load(this.start_pan);

    this.exec(this.modal_ctx);

    this.last_mpos.load(mpos);
  }

  exec(ctx) {
    let path = this.inputs.velpanPath.getValue();

    let velpan = ctx.api.getValue(ctx, path);
    if (velpan === undefined) {
      throw new Error("bad velpan path " + path + ".");
    }

    velpan.pos.add(this.inputs.pan.getValue());
    velpan.update();
    //velpan.scale.mul(this.inputs.scale.getValue());
  }

  on_mouseup(e) {
    this.modalEnd();
  }
}

ToolOp.register(VelPanPanOp);
