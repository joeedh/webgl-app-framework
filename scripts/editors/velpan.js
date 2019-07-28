import {Matrix4, Vector2} from "../util/vectormath.js";

export let VelPanFlags = {
  UNIFORM_SCALE : 1
};

export class VelPan {
  constructor() {
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

  /**
   load settings from another velocity pan instance
   does NOT set this.onchange
   * */
  load(velpan) {
    this.pos.load(velpan.pos);
    this.scale.load(velpan.scale);
    this.axes = velpan.axes;

    this.update(false);

    return this;
  }

  update(fire_events=true) {
    this.mat.makeIdentity();
    this.mat.scale(this.scale[0], this.scale[1], 1.0);
    this.mat.translate(this.pos[0], this.pos[1], 0.0);

    this.imat.load(this.mat).invert();

    if (fire_events && JSON.stringify(this.mat) != JSON.stringify(this._last_mat)) {
      console.log("velpan update");

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
  pos    : vec2;
  scale  : vec2;
  axes   : int;
  mat    : mat4;
  imat   : mat4;
  flag   : int;
}
`;
nstructjs.manager.add_class(VelPan);

