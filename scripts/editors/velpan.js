import {Matrix4, Vector2} from "../util/vectormath.js";
import {StringProperty, Vec2Property, ToolOp, UndoFlags, keymap} from '../path.ux/scripts/pathux.js';
import {Icons} from './icon_enum.js';
import * as util from '../util/util.js';

export let VelPanFlags = {
  UNIFORM_SCALE : 1
};

export class VelPan {
  constructor() {
    /** boundary limits*/
    this.bounds = [new Vector2([-2000, -2000]), new Vector2([2000, 2000])];

    this.decay = 0.995;
    this.pos = new Vector2();
    this.scale = new Vector2([1, 1]);
    this.vel = new Vector2();
    this.oldpos = new Vector2();

    this.maxVelocity = 0.001;

    this.axes = 3;
    this.flag = VelPanFlags.UNIFORM_SCALE;

    this.mat = new Matrix4();
    this.imat = new Matrix4();

    this._last_mat = new Matrix4(this.mat);
    this.onchange = null;
    this.last_update_time = util.time_ms();

    this.timer = undefined;
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

  reset(fireOnChange=true) {
    this.pos.zero();
    this.scale.zero().addScalar(1.0);
    this.updateMatrix();

    if (this.onchange && fireOnChange) {
      this.onchange();
    }

    return this;
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

  startVelocity() {
    if (this.timer === undefined) {
      this.last_update_time = util.time_ms();

      this.timer = window.setInterval(() => this.doVelocity(), 30);
    }
  }

  doVelocity() {
    if (this.vel.dot(this.vel) < 0.001) {
      console.log("removing velpan timer");
      window.clearInterval(this.timer);
      this.timer = undefined;
      return;
    }

    let dt = util.time_ms() - this.last_update_time;
    this.pos.addFac(this.vel, dt);

    dt = Math.max(dt, this.maxVelocity);
    this.vel.mulScalar(Math.pow(this.decay, dt));

    this.updateMatrix();

    if (this.onchange) {
      this.onchange();
    }

    this.last_update_time = util.time_ms();
  }

  updateMatrix() {
    let s = this.scale;
    let min = new Vector2(this.bounds[0]).div(s);
    let max = new Vector2(this.bounds[1]).div(s);

    this.pos.max(min);
    this.pos.min(max);

    this.mat.makeIdentity();
    this.mat.scale(this.scale[0], this.scale[1], 1.0);
    this.mat.translate(this.pos[0], this.pos[1], 0.0);

    this.imat.load(this.mat).invert();

    return this;
  }

  update(fire_events=true, do_velocity=true) {
    if (do_velocity && this.vel.dot(this.vel) > 0.001) {
      this.startVelocity();
    }

    this.updateMatrix();

    if (fire_events && JSON.stringify(this.mat) !== JSON.stringify(this._last_mat)) {
      this._last_mat.load(this.mat);

      if (this.onchange)
        this.onchange(this);
    }

    return this;
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


export class VelPanPanOp extends ToolOp {
  constructor() {
    super();

    this.start_pan = new Vector2();
    this.first = true;
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.start_time = this.last_time = 0;
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
      this.start_pan.load(velpan.pos);
      this.start_time = util.time_ms();
      this.last_time = util.time_ms();

      this.first = false;

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
    velpan.update(undefined, false);

    //velpan.vel.load()
    let vel = new Vector2(velpan.pos).sub(velpan.oldpos);
    vel.mulScalar(1.0 / (util.time_ms() - this.last_time));

    let l = vel.vectorLength();
    l = Math.min(l, 3.0);

    vel.normalize().mulScalar(l);

    //velpan.vel.interp(vel, 0.25);
    velpan.vel.load(vel);
    //console.log(vel);
    velpan.oldpos.load(velpan.pos);

    //velpan.scale.mul(this.inputs.scale.getValue());
    this.last_time = util.time_ms();

    if (velpan.onchange) {
      velpan.onchange();
    }
  }

  on_mouseup(e) {
    this.modalEnd();
  }
}

ToolOp.register(VelPanPanOp);
