import {
  BaseVector,
  Curve1DProperty, EnumProperty, Vec2Property,
  FlagProperty, FloatProperty, keymap, Mat4Property, Matrix4, ToolOp,
  ToolProperty, Vector2, Vector3, Vector4, nstructjs
} from '../../../path.ux/scripts/pathux.js';

import {BrushFlags, SculptBrush, SculptTools, BrushSpacingModes} from '../../../brush/brush.ts';
import {ProceduralTex, TexUserFlags, TexUserModes} from '../../../texture/proceduralTex.ts';
import {DataRefProperty} from '../../../core/lib_api.js';
import {AttrRef, CDFlags} from '../../../mesh/customdata.js';
import {TetMesh} from '../../../tet/tetgen.js';
import {Mesh} from '../../../mesh/mesh.js';
import {GridBase} from '../../../mesh/mesh_grids.js';
import {BVHFlags, IsectRet} from '../../../util/bvh.js';
import {MeshFlags} from '../../../mesh/mesh.js';

import * as util from '../../../util/util.js';
import * as math from '../../../util/math.js';

export function getBVH(ctx) {
  let ob = ctx.object;

  if (!ob) {
    return undefined;
  }

  if (ob.data instanceof Mesh || ob.data instanceof TetMesh) {
    return ob.data.getBVH({autoUpdate: false});
  }
}

export function regenBVH(ctx) {
  let ob = ctx.object;

  if (!ob) {
    return undefined;
  }

  if (ob.data instanceof Mesh || ob.data instanceof TetMesh) {
    ob.data.regenBVH();
  }
}

export const SymAxisMap = [
  [],
  [[-1, 1, 1]], //x
  [[1, -1, 1]], //y
  [[-1, 1, 1], [-1, -1, 1], [1, -1, 1]], //x + y

  [[1, 1, -1]], //z
  [[-1, 1, 1], [1, 1, -1], [-1, 1, -1]], //x+z
  [[1, -1, 1], [1, 1, -1], [1, -1, -1]], //y+z

  [[-1, 1, 1], [1, -1, 1], [1, 1, -1], [-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1]] //x+y+z
];

export let BRUSH_PROP_TYPE;

export class BrushProperty extends ToolProperty {
  constructor(value) {
    super(BRUSH_PROP_TYPE);

    this.brush = new SculptBrush();
    this._texture = new ProceduralTex();

    if (value) {
      this.setValue(value);
    }
  }

  calcMemSize() {
    return this.brush.calcMemSize() + this._texture.calcMemSize();
  }

  setDynTopoSettings(dynTopo) {
    this.brush.dynTopo.load(dynTopo);
  }

  setValue(brush) {
    brush.copyTo(this.brush, false);

    if (this.brush.texUser.texture) {
      this.brush.texUser.texture.copyTo(this._texture, true);
      this.brush.texUser.texture = this._texture;
    }

    return this;
  }

  getValue() {
    return this.brush;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader)

    let texuser = this.brush.texUser;
    if (this.hasTex) { //texuser.texture !== undefined && texuser.texture !== -1) {
      delete this.hasTex;
      this.brush.texUser.texture = this._texture;
    } else {
      this.brush.texUser.texture = undefined;
    }
  }
}

BrushProperty.STRUCT = nstructjs.inherit(BrushProperty, ToolProperty) + `
  brush    : SculptBrush;
  _texture : ProceduralTex;
  hasTex   : bool | !!this.brush.texUser.texture;
}`;

nstructjs.register(BrushProperty);
BRUSH_PROP_TYPE = ToolProperty.register(BrushProperty);

export class PaintSample {
  constructor() {
    this.origp = new Vector4();
    this.p = new Vector4();
    this.dp = new Vector4();
    this.viewPlane = new Vector3();

    this.rendermat = new Matrix4();

    this.strokeS = 0.0;
    this.dstrokeS = 0.0;

    this.smoothProj = 0.0;

    this.pinch = 0.0;
    this.sharp = 0.0;

    //screen coordinates
    this.sp = new Vector4();
    this.dsp = new Vector4();

    this.futureAngle = 0;

    this.invert = false;

    this.w = 0.0;

    this.color = new Vector4();
    this.angle = 0;

    this.viewvec = new Vector3();
    this.vieworigin = new Vector3();

    this.isInterp = false;

    this.vec = new Vector3();
    this.dvec = new Vector3();

    this.autosmoothInflate = 0.0;
    this.concaveFilter = 0.0;
    this.strength = 0.0;
    this.radius = 0.0;
    this.rake = 0.0;
    this.autosmooth = 0.0;
    this.esize = 0.0;
    this.planeoff = 0.0;

    this.mirrored = false;
  }

  static getMemSize() {
    let tot = 13*8;
    tot += 5*3*8 + 8*5;
    tot += 5*4*8 + 8*5 + 16*8;

    return tot;
  }

  mirror(mul = new Vector4([1, 1, 1, 1])) {
    this.p.mul(mul);
    this.dp.mul(mul);
    this.origp.mul(mul);

    //this.sp.mulScalar(mul);
    this.dsp.mul(mul);
    this.viewvec.mul(mul);
    this.viewPlane.mul(mul);

    this.vec.mul(mul);
    this.dvec.mul(mul);

    this.angle *= mul[0]*mul[1]*mul[2];
    this.futureAngle *= mul[0]*mul[1]*mul[2];

    this.mirrored ^= true;

    return this;
  }

  copyTo(b) {
    b.smoothProj = this.smoothProj;
    b.futureAngle = this.futureAngle;

    b.strokeS = this.strokeS;
    b.dstrokeS = this.dstrokeS;
    b.sharp = this.sharp;

    b.viewPlane.load(this.viewPlane);
    b.viewvec.load(this.viewvec);
    b.vieworigin.load(this.vieworigin);
    b.angle = this.angle;
    b.invert = this.invert;

    b.origp.load(this.origp);

    b.sp.load(this.sp);
    b.dsp.load(this.dsp);

    b.vec.load(this.vec);
    b.dvec.load(this.dvec);

    b.p.load(this.p);
    b.dp.load(this.dp);
    b.autosmoothInflate = this.autosmoothInflate;

    b.w = this.w;
    b.esize = this.esize;

    b.color.load(this.color);
    b.isInterp = this.isInterp;
    b.mirrored = this.mirrored;

    b.rendermat.load(this.rendermat);

    b.pinch = this.pinch;
    b.rake = this.rake;
    b.strength = this.strength;
    b.radius = this.radius;
    b.autosmooth = this.autosmooth;
    b.planeoff = this.planeoff;
    b.concaveFilter = this.concaveFilter;
  }

  copy() {
    let ret = new PaintSample();

    this.copyTo(ret);

    return ret;
  }
}

PaintSample.STRUCT = `
PaintSample {
  p              : vec4;
  dp             : vec4;
  sp             : vec4;
  strokeS        : float;
  dstrokeS       : float;
  dsp            : vec4;
  origp          : vec4;
  isInterp       : bool;
  sharp          : float;
  futureAngle    : float;
  
  vec            : vec3;
  dvec           : vec3;
  mirrored       : bool;
  
  color          : vec4;

  rendermat      : mat4;
   
  viewvec        : vec3;
  vieworigin     : vec3;
  viewPlane      : vec3;
  autosmoothInflate : float;

  planeoff       : float;
  rake           : float;
  strength       : float;
  angle          : float;
  radius         : float;
  w              : float;
  pinch          : float;
  smoothProj     : float;
  autosmooth     : float;
  concaveFilter  : float;
  invert         : bool;
  esize          : float;
}`;
nstructjs.register(PaintSample);

export let PAINT_SAMPLE_TYPE;

export class PaintSampleProperty extends ToolProperty {
  constructor() {
    super(PAINT_SAMPLE_TYPE);
    this.data = [];
  }

  calcMemSize() {
    let tot = super.calcMemSize();

    tot += PaintSample.getMemSize()*this.data.length;

    return tot;
  }

  push(sample) {
    this.data.push(sample);
    return this;
  }

  getValue() {
    return this.data;
  }

  setValue(b) {
    super.setValue(b);

    this.data.length = 0;
    for (let item of b) {
      this.data.push(item);
    }

    return this;
  }

  copy() {
    let ret = new PaintSampleProperty();

    for (let item of this) {
      ret.push(item.copy());
    }

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
}

PaintSampleProperty.STRUCT = nstructjs.inherit(PaintSampleProperty, ToolProperty) + `
  data : array(PaintSample);
}`;

nstructjs.register(PaintSampleProperty);
PAINT_SAMPLE_TYPE = ToolProperty.register(PaintSampleProperty);

export class SetBrushRadius extends ToolOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.cent_mpos = new Vector2();
    this.first = true;
  }

  static canRun(ctx) {
    return ctx.toolmode && ctx.toolmode.constructor.name === "BVHToolMode";
  }

  static tooldef() {
    return {
      uiname  : "Set Brush Radius",
      toolpath: "brush.set_radius",
      inputs  : {
        radius: new FloatProperty(15.0),
        brush : new DataRefProperty(SculptBrush)
      },
      is_modal: true
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    let toolmode = ctx.toolmode;
    if (!toolmode || toolmode.constructor.name !== "BVHToolMode") {
      return tool;
    }

    let brush = toolmode.getBrush();
    if (!brush) {
      return tool;
    }

    if (!("brush" in args)) {
      tool.inputs.brush.setValue(brush);
    }

    if (!("radius" in args)) {
      let radius = brush.flag & BrushFlags.SHARED_SIZE ? toolmode.sharedBrushRadius : brush.radius;
      tool.inputs.radius.setValue(radius);
    }

    return tool;
  }

  modalStart(ctx) {
    this.rand.seed(0);
    this.first = true;

    return super.modalStart(ctx);
  }

  on_pointermove(e) {
    let mpos = this.mpos;

    mpos[0] = e.x;
    mpos[1] = e.y;

    let ctx = this.modal_ctx;

    let brush = ctx.datalib.get(this.inputs.brush.getValue());
    if (!brush) {
      return;
    }


    if (this.first) {
      this.first = false;
      this.cent_mpos.load(mpos).subScalar(brush.radius/devicePixelRatio/Math.sqrt(2.0));

      this.start_mpos.load(mpos);
      this.last_mpos.load(mpos);
      return;
    }


    let l1 = mpos.vectorDistance(this.cent_mpos);
    let l2 = this.last_mpos.vectorDistance(this.cent_mpos);

    if (l2 === 0.0 || l1 === 0.0) {
      return;
    }

    this.resetTempGeom();
    this.makeTempLine(this.cent_mpos, this.mpos, "rgba(25,25,25,0.25)");

    let toolmode = ctx.toolmode;
    if (toolmode && toolmode.constructor.name === "BVHToolMode") {
      toolmode.mpos.load(this.cent_mpos);
    }

    let ratio = l1/l2;
    let radius;

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      let bvhtool = ctx.scene.toolmode_namemap.bvh;
      if (bvhtool) {
        radius = bvhtool.sharedBrushRadius;
      } else {
        radius = brush.radius;
      }
    } else {
      radius = brush.radius;
    }

    radius *= ratio;
    console.log("F", ratio, radius);

    this.last_mpos.load(mpos);
    this.inputs.radius.setValue(radius);

    this.exec(ctx);
  }

  on_pointerup(e) {
    this.modalEnd(false);
  }

  exec(ctx) {
    let brush = ctx.datalib.get(this.inputs.brush.getValue());

    if (brush) {
      if (brush.flag & BrushFlags.SHARED_SIZE) {
        let toolmode = ctx.scene.toolmode_namemap.bvh;

        if (toolmode) {
          toolmode.sharedBrushRadius = this.inputs.radius.getValue();
        }
      } else {
        brush.radius = this.inputs.radius.getValue();
      }
    }
  }

  undoPre(ctx) {
    let brush = ctx.datalib.get(this.inputs.brush.getValue());

    this._undo = {};

    if (brush) {
      this._undo.radius = brush.radius;
      this._undo.brushref = DataRef.fromBlock(brush);
    }
  }

  undo(ctx) {
    let undo = this._undo;

    if (!undo.brushref) {
      return;
    }

    let brush = ctx.datalib.get(undo.brushref);
    if (!brush) {
      return;
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      let toolmode = ctx.scene.toolmode_namemap.bvh;

      if (toolmode) {
        toolmode.sharedBrushRadius = undo.radius;
      }
    } else {
      brush.radius = undo.radius;
    }
  }

  on_keydown(e) {
    switch (e.keyCode) {
      case keymap["Escape"]:
      case keymap["Enter"]:
      case keymap["Space"]:
        this.modalEnd(false);
        break;
    }
  }
}

ToolOp.register(SetBrushRadius);

let co = new Vector3();
let t1 = new Vector3();
let t2 = new Vector3();

export class PathPoint {
  constructor(co, dt) {
    this.color = "yellow";
    this.co = new Vector2(co);
    this.origco = new Vector2(co);
    this.vel = new Vector2();
    this.acc = new Vector2();
    this.dt = dt;
  }
}

export function calcConcave(v) {
  co.zero();
  let tot = 0.0;
  let elen = 0;

  for (let v2 of v.neighbors) {
    co.add(v2.co);
    elen += v2.co.vectorDistance(v.co);

    tot++;
  }

  if (tot === 0.0) {
    return 0.5;
  }

  elen /= tot;

  co.mulScalar(1.0/tot);
  t1.load(v.co).sub(co).mulScalar(1.0/elen);
  let fac = t1.dot(v.no)*0.5 + 0.5;

  return 1.0 - fac;
}

export function calcConcaveLayer(mesh) {
  let name = "_paint_concave";

  let cd_concave = mesh.verts.customData.getNamedLayerIndex(name, "float");
  if (cd_concave < 0) {
    let layer = mesh.verts.addCustomDataLayer("float", name);
    layer.flag |= CDFlags.TEMPORARY;

    cd_concave = layer.index;
  }


  for (let v of mesh.verts) {

  }
}

import {bez4, dbez4} from '../../../util/bezier.js';
import {copyMouseEvent} from '../../../path.ux/scripts/path-controller/util/events.js';
import {CameraModes} from '../view3d_base.js';

export class PaintOpBase extends ToolOp {
  constructor() {
    super();

    this.task = undefined;

    this.grabMode = false;

    this.mfinished = false;
    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this.last_origco = new Vector4();
    this._first = true;

    this.last_draw = util.time_ms();

    this.lastps1 = undefined;
    this.lastps2 = undefined;

    this.last_radius = 0;
    this.last_vec = new Vector3();

    this.rand = new util.MersenneRandom();

    this.queue = [];
    this.qlast_time = util.time_ms();
    this.timer = undefined;

    this.path = [];
    this.alast_time = util.time_ms();

    this._savedViewPoints = [];
  }

  static tooldef() {
    return {
      inputs: {
        brush       : new BrushProperty(),
        samples     : new PaintSampleProperty(),
        symmetryAxes: new FlagProperty(undefined, {X: 1, Y: 2, Z: 4}),
        falloff     : new Curve1DProperty(),
        rendermat   : new Mat4Property(),
        viewportSize: new Vec2Property
      }
    }
  }

  static needOrig(brush) {
    let mode = brush.tool;

    let isPaint = mode === SculptTools.MASK_PAINT || mode === SculptTools.TEXTURE_PAINT;
    isPaint = isPaint || mode === SculptTools.PAINT || mode === SculptTools.PAINT_SMOOTH;

    let ret = mode === SculptTools.SHARP || mode === SculptTools.GRAB;
    ret = ret || mode === SculptTools.SNAKE; // || mode === SculptTools.SMOOTH;
    ret = ret || (!isPaint && mode !== SculptTools.GRAB && brush.pinch !== 0.0);
    ret = ret || mode === SculptTools.PINCH || mode === SculptTools.SLIDE_RELAX;

    //ret = ret || brush.autosmooth > 0 || brush.rake > 0 || brush.pinch > 0;

    if (brush.texUser.texture) {
      ret = ret || (brush.texUser.flag & TexUserFlags.ORIGINAL_CO);
    }

    return ret;
  }

  timer_on_tick() {
    if (!this.modalRunning) {
      this.clearInterval(this.timer);
      this.timer = undefined;
      return;
    }

    //XXX currently disabled
    if (this.queue.length === 0) {
      return;
    }

    if (util.time_ms() - this.last_draw > 100) {
      this.last_draw = util.time_ms();
      this.drawPath();
    }

    if (util.time_ms() - this.qlast_time > 5) {
      let time = util.time_ms();

      this.taskNext();

      this.qlast_time = util.time_ms();
    }
  }

  appendPath(x, y) {
    let dt = util.time_ms() - this.alast_time;
    dt = Math.max(dt, 1.0);

    let p = new PathPoint([x, y], dt);
    let path = this.path;
    let dpi = devicePixelRatio;

    if (path.length > 0) {
      let p0 = path[path.length - 1];
      p.vel.load(p.co).sub(p0.co);
      p.acc.load(p.vel).sub(p0.vel);

      let vel;
      //vel = new Vector3(p.vel).add(p0.vel).mulScalar(0.5);
      vel = p.vel;
      let l1 = p0.vel.vectorLength();
      let l2 = p.vel.vectorLength();

      if (p.vel.vectorLength() > 7/dpi) {
        let co = new Vector2();

        let a = new Vector2();
        let b = new Vector2();
        let c = new Vector2();
        let d = new Vector2();


        let vel1 = new Vector2(p0.vel).addFac(p0.acc, 0.5).mulScalar(0.5);
        let vel2 = new Vector2(p.vel).addFac(p.acc, 0.5).mulScalar(0.5);

        a.load(p0.co);
        d.load(p.co);
        b.load(a).addFac(vel1, 1.0/3.0);
        c.load(d).addFac(vel2, -1.0/3.0);

        co.load(p0.co).addFac(p.vel, 0.5).addFac(p.acc, 1.0/6.0);

        let brush = this.inputs.brush.getValue();
        let radius = brush.radius;
        let spacing = brush.spacing;

        let steps = Math.ceil(p.co.vectorDistance(p0.co)/(4*radius*spacing));

        if (steps === 0) {
          this.path.push(p);
          this.alast_time = util.time_ms();
          return;
        }

        let s = 0, ds = 1.0/steps;
        dt *= ds;

        let lastp = p0;

        for (let i = 0; i < steps; i++, s += ds) {
          let p2 = new PathPoint(undefined, ds);
          for (let j = 0; j < 2; j++) {
            p2.co[j] = bez4(a[j], b[j], c[j], d[j], s);
            p2.vel[j] = dbez4(a[j], b[j], c[j], d[j], s)*ds;
          }

          p2.color = "orange";
          p2.origco.load(p0.co).interp(p.co, s);

          //console.log(p2.co);

          p2.vel.load(p2.co).sub(lastp.co);
          p2.acc.load(p2.vel).sub(lastp.vel);
          this.path.push(p2);
        }

        p.vel.load(d).sub(c).mulScalar(-3.0*ds);

        p.acc.load(p.vel).sub(lastp.vel);
        p.dt = dt;

        if (0) {
          let p2 = new PathPoint(co, dt*0.5);
          path.push(p2);

          p2.dt = dt*0.5;
          p.dt = dt*0.5;

          p2.vel.load(p2.co).sub(p0.co);
          p2.acc.load(p2.vel).sub(p0.vel);

          p.vel.load(p.co).sub(p2.co);
          p.acc.load(p.vel).sub(p2.vel);
        }

        //console.log("add points");
      }
    }

    path.push(p);
    this.alast_time = util.time_ms();
  }

  drawPath() {
    this.resetTempGeom();
    let lastp;

    let start = this.path.length;
    if (this.queue.length > 0) {
      start = this.queue[0][2];
    }

    let n = new Vector2();
    let color = "rgba(255, 255, 255, 0.4)";

    for (let pi = start; pi < this.path.length; pi++) {
      let p = this.path[pi];

      if (lastp) {
        n.load(p.co).sub(lastp.co).normalize();
        let t = n[0];
        n[0] = n[1];
        n[1] = -t;
        n.mulScalar(15.0);
        n.add(p.origco);

        this.makeTempLine(lastp.co, p.co, color);

        //this.makeTempLine(p.co, n, p.color);
        //this.makeTempLine(lastp.origco, p.origco, p.color);
      }
      lastp = p;
    }
  }

  on_keydown(e) {
    switch (e.keyCode) {
      case keymap["Escape"]:
        this.modalEnd(false);

        if (this.timer) {
          window.clearInterval(this.timer);
          this.timer = undefined;
        }

        //terminate immediately
        this.queue.length = 0;
        while (this.task) {
          this.taskNext();
        }
        break;
      case keymap["Enter"]:
      case keymap["Space"]:
        this.modalEnd(false);
        break;
    }
  }

  on_pointermove(e, in_timer = false) {
    if (this.mfinished) {
      return; //wait for modalEnd
    }

    let pi = this.path.length;

    if (this.inputs.brush.getValue().spacingMode === BrushSpacingModes.EVEN) {
      //console.log("Even spacing mode");

      //try to detect janky events and interpolate with a curve
      //note that this is not the EVEN spacing mode which happens in
      //subclases, it doesn't respect brush spacing when outputting the curve
      this.appendPath(e.x, e.y);
    } else {
      let p = new PathPoint([e.x, e.y], util.time_ms() - this.alast_time);
      this.path.push(p);
    }

    this.alast_time = util.time_ms();
    this.drawPath();

    for (; pi < this.path.length; pi++) {
      let p = this.path[pi];

      let e2 = copyMouseEvent(e);

      this.queue.push([e2, p, pi]);
      //this.on_pointermove_intern(e, p.co[0], p.co[1], in_timer, pi !== this.path.length-1);
    }

    if (!this.task) {
      this.task = this.makeTask();
    }
  }

  makeTask() {
    let this2 = this;

    return (function* () {
      while (this2.queue.length > 0) {
        let [e, p, pi] = this2.queue.shift();

        let iter = this2.on_pointermove_intern(e, p.co[0], p.co[1], true, pi !== this2.path.length - 1);

        if (typeof iter === "object" && iter[Symbol.iterator]) {
          for (let step of iter) {
            yield;
          }
        }

        yield;
      }
    })();
  }

  hasSampleDelay() {
    let brush = this.inputs.brush.getValue();

    let delayMode = false;
    if (brush.texUser.texture) {
      let flag = brush.texUser.flag;
      let mode = brush.texUser.mode;

      delayMode = mode === TexUserModes.VIEW_REPEAT;
      delayMode = delayMode && (flag & TexUserFlags.FANCY_RAKE);
    }

    //console.log("delayMode:", delayMode);
  }

  on_pointermove_intern(e, x = e.x, y = e.y, in_timer = false, isInterp = false) {
    //this.makeTempLine()

    let ctx = this.modal_ctx;

    if (!ctx.object || !(ctx.object.data instanceof Mesh || ctx.object.data instanceof TetMesh)) {
      return;
    }

    let toolmode = ctx.toolmode;
    let view3d = ctx.view3d;
    let brush = this.inputs.brush.getValue();

    if (toolmode) {
      //the pbvh toolmode is responsible for drawing brush circle,
      //make sure it has up to date info for that
      toolmode.mpos[0] = x;
      toolmode.mpos[1] = y;
    }

    let mpos = view3d.getLocalMouse(x, y);
    x = mpos[0];
    y = mpos[1];

    let pressure = 1.0;

    if (e.targetTouches && e.targetTouches.length > 0) {
      let t = e.targetTouches[0];

      if (t.pressure !== undefined) {
        pressure = t.pressure;
      } else {
        pressure = t.force;
      }
    }

    //console.log(e.ctrlKey, view3d.size, x, y, e.targetTouches, pressure);

    let rendermat = view3d.activeCamera.rendermat;
    let view = view3d.getViewVec(x, y);
    let origin = view3d.activeCamera.pos;

    let invert = false;
    let mode = brush.tool;

    if (e.ctrlKey && (mode !== SculptTools.PAINT && mode !== SculptTools.PAINT_SMOOTH)) {
      invert = true;
    }

    if (brush.flag & BrushFlags.INVERT) {
      invert ^= true;
    }

    this.inputs.viewportSize.setValue(view3d.size);

    return this.sampleViewRay(rendermat, mpos, view, origin, pressure, invert, isInterp);
  }

  getBVH(mesh) {
    return mesh.getBVH({autoUpdate: false});
  }

  sampleViewRay(rendermat, mpos, view, origin, pressure, invert, isInterp) {
    let brush = this.inputs.brush.getValue();
    let mode = brush.tool;

    let ctx = this.modal_ctx;

    if (!ctx.object || !(ctx.object.data instanceof Mesh || ctx.object.data instanceof TetMesh)) {
      return;
    }

    /*
    let falloff = this.inputs.falloff.getValue();
    let strengthMul = falloff.integrate(1.0) - falloff.integrate(0.0);
    strengthMul = Math.abs(strengthMul !== 0.0 ? 1.0 / strengthMul : strengthMul);
    */

    let radius = brush.radius;

    let getchannel = (key, val) => {
      let ch = brush.dynamics.getChannel(key);
      if (ch.useDynamics) {
        return val*ch.curve.evaluate(pressure);
      } else {
        return val;
      }
    }

    radius = getchannel("radius", radius);

    let toolmode = ctx.toolmode;
    let view3d = ctx.view3d;

    if (toolmode) {
      toolmode._radius = radius;
    }

    //console.log("pressure", pressure, strength, dynmask);

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = this.getBVH(mesh);

    let axes = [-1];
    let sym = mesh.symFlag;

    for (let i = 0; i < 3; i++) {
      if (mesh.symFlag & (1<<i)) {
        axes.push(i);
      }
    }

    let haveOrigData = PaintOpBase.needOrig(brush);
    let cd_orig = -1;
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (haveOrigData) {
      cd_orig = this.initOrigData(mesh);
    }

    let isect;
    let obmat = ob.outputs.matrix.getValue();
    let matinv = new Matrix4(obmat);
    matinv.invert();

    origin = new Vector3(origin);
    origin.multVecMatrix(matinv);

    view = new Vector4(view);
    view[3] = 0.0;
    view.multVecMatrix(matinv);
    view = new Vector3(view).normalize();

    for (let axis of axes) {
      let view2 = new Vector3(view);
      let origin2 = new Vector3(origin);

      if (axis !== -1) {
        origin2[axis] = -origin2[axis];
        view2[axis] = -view2[axis];
      }

      origin2 = new Vector3(origin2);
      view2 = new Vector3(view2);

      let isect2 = bvh.castRay(origin2, view2);

      if (isect2 && (!isect || isect2.dist < isect.dist)) {
        isect = isect2.copy();
        origin = origin2;
        view = view2;
      }
    }

    let origco = new Vector4();

    if (!isect) {
      if ((this.grabMode || mode === SculptTools.GRAB || (mode === SculptTools.SNAKE)) && !this._first) {
        let p = new Vector3(this.last_p);
        p.multVecMatrix(obmat);

        view3d.project(p, rendermat);

        p[0] = mpos[0];
        p[1] = mpos[1];

        view3d.unproject(p, rendermat.clone().invert());
        p.multVecMatrix(matinv);

        let dis = p.vectorDistance(origin);

        isect = new IsectRet();

        isect.p = p;
        isect.dis = dis;
        isect.tri = undefined;
      } else {
        return;
      }
    } else {
      let tri = isect.tri;

      if (haveOrigData) {
        let o1 = this.getOrigCo(mesh, tri.v1, cd_grid, cd_orig);
        let o2 = this.getOrigCo(mesh, tri.v2, cd_grid, cd_orig);
        let o3 = this.getOrigCo(mesh, tri.v3, cd_grid, cd_orig);

        for (let i = 0; i < 3; i++) {
          origco[i] = o1[i]*isect.uv[0] + o2[i]*isect.uv[1] + o3[i]*(1.0 - isect.uv[0] - isect.uv[1]);
        }

        origco[3] = 1.0;
      } else {
        origco.load(isect.p);
        origco[3] = 1.0;
      }
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(rendermat);

    let w = p3[3]*matrix.$matrix.m11;

    if (view3d.cameraMode === CameraModes.ORTHOGRAPHIC) {
      //w = 1.0;
    }

    //let w2 = Math.cbrt(w);

    if (w <= 0) return;

    radius /= Math.max(view3d.glSize[0], view3d.glSize[1]);
    radius *= Math.abs(w);

    let vec = new Vector3();

    if (isect.tri) {
      vec.load(isect.tri.v1.no);
      vec.add(isect.tri.v2.no);
      vec.add(isect.tri.v3.no);
      vec.normalize();
    } else {
      vec.load(view).normalize();
    }

    view.negate();
    if (vec.dot(view) < 0) {
      view.negate();
    }
    view.normalize();

    vec.interp(view, 1.0 - brush.normalfac).normalize();

    if (this._first) {
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      this.last_origco.load(origco);
      this.last_vec.load(vec);
      this.last_radius = radius;
      this._first = false;

      return undefined;
    }

    this._savedViewPoints.push({
      viewvec  : new Vector3(view),
      viewp    : new Vector3(origin),
      rendermat: rendermat.clone(),
      mpos     : new Vector2(mpos)
    });

    return {
      origco, p: isect.p, isect: isect.copy(), radius, ob, vec, mpos, view, getchannel, w
    }
  }

  //for debugging purposes
  writeSaveViewPoints(n = 5) {
    function toFixed(f) {
      let s = f.toFixed(n);
      while (s.endsWith("0")) {
        s = s.slice(0, s.length - 1);
      }

      if (s.length === 0) {
        return "0";
      }

      if (s[s.length - 1] === ".") {
        s += "0";
      }

      return s;
    }

    function myToJSON(obj) {
      if (typeof obj === "object") {
        if (Array.isArray(obj) || obj instanceof BaseVector) {
          let s = '[';
          for (let i = 0; i < obj.length; i++) {
            if (i > 0) {
              s += ',';
            }

            s += myToJSON(obj[i]);
          }

          s += ']';

          return s;
        } else if (obj instanceof Matrix4) {
          return myToJSON(obj.getAsArray());
        } else {
          let s = '{';
          let keys = Object.keys(obj);

          for (let i = 0; i < keys.length; i++) {
            let k = keys[i];
            let v;

            try {
              v = obj[k];
            } catch (error) {
              console.log("error with property " + k);
              continue;
            }

            if (typeof v === "function") {
              continue;
            }

            if (i > 0) {
              s += ",";
            }

            s += `"${k}" : ${myToJSON(v)}`;
          }
          s += '}';

          return s;
        }
      } else if (typeof obj === "number") {
        return toFixed(obj);
      } else {
        return "" + obj;
      }
    }

    return myToJSON(this._savedViewPoints);
  }

  taskNext() {
    if (!this.task) {
      return;
    }

    let time = util.time_ms();
    while (util.time_ms() - time < 45) {
      let ret;

      try {
        ret = this.task.next();
      } catch (error) {
        util.print_stack(error);
        this.task = undefined;
        break;
      }

      if (!ret || ret.done) {
        this.task = undefined;
        break;
      }
    }
  }

  modalEnd(was_cancelled) {
    this.mfinished = true;

    if (!this.modalRunning) {
      return;
    }

    if (this.task) {
      //can't end modal
      console.log("Waiting for task to finish");
      this.taskNext();

      window.setTimeout(() => {
        this.modalEnd(was_cancelled);
      }, 150);

      return;
    }

    super.modalEnd(was_cancelled);

    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  on_pointerup(e) {
    this.mfinished = true;
    this.modalEnd(false);
  }

  undoPre(ctx) {
    throw new Error("implement me!");
  }

  calcUndoMem(ctx) {
    throw new Error("implement me!");
  }

  modalStart(ctx) {
    this.mfinished = false;

    this.lastps1 = undefined;
    this.lastps2 = undefined;

    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
    }

    this.timer = window.setInterval(() => this.timer_on_tick(), 5);

    this._first = true;
    super.modalStart(ctx);
  }

  undo(ctx) {
    throw new Error("implement me!");
  }
}

export class MaskOpBase extends ToolOp {
  constructor() {
    super();
  }

  calcUndoMem(ctx) {
    let ud = this._undo;

    if (ud.gridData) {
      return ud.gridData.length*8;
    }

    if (ud.vertData) {
      return ud.vertData.length*8;
    }

    return 0;
  }

  undoPre(ctx) {
    let mesh = ctx.mesh || ctx.tetmesh;

    let ud = this._undo = {mesh: -1};

    if (!mesh) {
      return;
    }

    ud.mesh = mesh.lib_id;

    let cd_grid = GridBase.meshGridOffset(mesh);
    let cd_mask;

    ud.cd_grid = cd_grid;

    if (cd_grid >= 0) {
      let gd = ud.gridData = [];
      cd_mask = ud.cd_mask = mesh.loops.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        for (let p of grid.points) {
          if (p.flag & MeshFlags.HIDE) {
            continue;
          }

          gd.push(l.eid);
          gd.push(p.eid);
          gd.push(p.customData[cd_mask].value);
        }
      }
    } else {
      cd_mask = ud.cd_mask = mesh.verts.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }
      let vd = ud.vertData = [];

      for (let v of mesh.verts) {
        if (v.flag & MeshFlags.HIDE) {
          continue;
        }

        vd.push(v.eid);
        vd.push(v.customData[cd_mask].value);
      }
    }
  }

  undo(ctx) {
    let ud = this._undo;
    let mesh = ctx.datalib.get(ud.mesh);

    if (!mesh) {
      return;
    }

    let cd_grid = GridBase.meshGridOffset(mesh);
    let cd_mask;
    let cd_node = mesh.bvh ? mesh.bvh.cd_node : new AttrRef(-1);

    ud.cd_grid = cd_grid;
    let updateflag = BVHFlags.UPDATE_MASK | BVHFlags.UPDATE_DRAW;

    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.regenEIDMap();
      }

      let gd = ud.gridData;
      cd_mask = ud.cd_mask = mesh.loops.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }

      for (let gi = 0; gi < gd.length; gi += 3) {
        let leid = gd[gi], peid = gd[gi + 1], mask = gd[gi + 2];

        let l = mesh.eidMap.get(leid);
        if (!l) {
          console.error("Missing loop " + leid);
          continue;
        }

        let grid = l.customData[cd_grid];
        let eidMap = grid.getEIDMap(mesh);

        let p = eidMap.get(peid);

        if (!p) {
          console.warn("Missing grid vert:" + peid);
          continue;
        }

        p.customData[cd_mask].value = mask;
        p.flag |= MeshFlags.UPDATE;

        if (cd_node.i >= 0) {
          let node = p.customData[cd_node.i].node;

          if (node) {
            node.setUpdateFlag(updateflag);
          }
        }
      }
    } else {
      cd_mask = ud.cd_mask = mesh.verts.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }
      let vd = ud.vertData;

      for (let vi = 0; vi < vd.length; vi += 2) {
        let veid = vd[vi], mask = vd[vi + 1];

        let v = mesh.eidMap.get(veid);

        if (!v) {
          console.warn("Missing vertex " + veid);
          continue;
        }

        v.customData[cd_mask].value = mask;
        v.flag |= MeshFlags.UPDATE;

        if (cd_node.i >= 0) {
          let node = v.customData[cd_node.i].node;
          if (node) {
            node.setUpdateFlag(updateflag);
          }
        }
      }
    }

    mesh.regenRender();
    mesh.graphUpdate();
    window.redraw_viewport(true);
  }

  getCDMask(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid >= 0) {
      return mesh.loops.customData.getLayerIndex("mask");
    } else {
      return mesh.verts.customData.getLayerIndex("mask");
    }
  }

  execPre(ctx) {
    this.rand.seed(0);
  }

  getVerts(mesh, updateBVHNodes = true) {
    let this2 = this;

    let cd_node = mesh.bvh ? mesh.bvh.cd_node : new AttrRef(-1);
    let bvh = mesh.bvh ? mesh.bvh : undefined;

    updateBVHNodes = updateBVHNodes && cd_node.i >= 0;

    let updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK;

    return (function* () {
      let cd_mask = this2.getCDMask(mesh);
      let cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_mask < 0) {
        return;
      }

      if (cd_grid >= 0) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          for (let p of grid.points) {
            yield p;

            if (updateBVHNodes) {
              let node = p.customData[cd_node.i].node;
              if (node) {
                node.setUpdateFlag(updateflag);
              }
            }
          }
        }
      } else {
        for (let v of mesh.verts) {
          yield v;

          if (updateBVHNodes) {
            let node = v.customData[cd_node.i].node;
            if (node) {
              node.setUpdateFlag(updateflag);
            }
          }
        }
      }

      mesh.regenRender();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    })();
  }
}

export class ClearMaskOp extends MaskOpBase {
  static tooldef() {
    return {
      uiname  : "Clear Mask",
      toolpath: "paint.clear_mask",
      inputs  : {
        value: new FloatProperty(1.0)
      }
    }
  }

  exec(ctx) {
    let mesh = ctx.mesh;
    if (!mesh) {
      return;
    }

    let cd_mask = this.getCDMask(mesh);
    if (cd_mask < 0) {
      return;
    }

    let value = this.inputs.value.getValue();

    for (let v of this.getVerts(mesh, true)) {
      v.customData[cd_mask].value = value;
    }
  }
}

ToolOp.register(ClearMaskOp);
