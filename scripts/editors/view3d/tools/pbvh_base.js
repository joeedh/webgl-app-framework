//grab data field definition
import {FloatProperty, ToolOp, ToolProperty, Vector2, Vector3, Vector4} from '../../../path.ux/scripts/pathux.js';
import {BrushFlags, SculptBrush} from '../../../brush/brush.js';
import {ProceduralTex} from '../../../texture/proceduralTex.js';
import {DataRefProperty} from '../../../core/lib_api.js';
import {BVHToolMode} from './pbvh.js';

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

  setValue(brush) {
    brush.copyTo(this.brush, true);

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
    if (texuser.texture !== undefined && texuser.texture !== -1) {
      this.brush.texUser.texture = this._texture;
    } else {
      this.brush.texUser.texture = undefined;
    }
  }
}

BrushProperty.STRUCT = nstructjs.inherit(BrushProperty, ToolProperty) + `
  brush : SculptBrush;
  _texture : ProceduralTex;
}`;

nstructjs.register(BrushProperty);
BRUSH_PROP_TYPE = ToolProperty.register(BrushProperty);

export class PaintSample {
  constructor() {
    this.p = new Vector4();
    this.dp = new Vector4();
    this.viewPlane = new Vector3();

    this.color = new Vector4();
    this.angle = 0;

    this.viewvec = new Vector3();
    this.vieworigin = new Vector3();

    this.vec = new Vector3();
    this.dvec = new Vector3();

    this.strength = 0.0;
    this.radius = 0.0;
    this.autosmooth = 0.0;
    this.esize = 0.0;
    this.planeoff = 0.0;
  }

  copyTo(b) {
    b.viewPlane.load(this.viewPlane);
    b.dp.load(this.dp);
    b.p.load(this.p);
    b.angle = this.angle;
    b.vec.load(this.vec);
    b.dvec.load(this.dvec);
    b.strength =  this.strength;
    b.radius = this.radius;
    b.autosmooth = this.autosmooth;
    b.esize = this.esize;
    b.planeoff = this.planeoff;
  }

  copy()  {
    let ret = new PaintSample();

    this.copyTo(ret);

    return ret;
  }
}
PaintSample.STRUCT = `
PaintSample {
  p            : vec4;
  dp           : vec4;
  vec          : vec3;
  dvec         : vec3;
  planeoff     : float;
  strength     : float;
  angle        : float;
  radius       : float;
  autosmooth   : float;
  viewPlane    : vec3;
}`;
nstructjs.register(PaintSample);

export let PAINT_SAMPLE_TYPE;
export class PaintSampleProperty extends ToolProperty {
  constructor() {
    super(PAINT_SAMPLE_TYPE);
    this.data = [];
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
    return ctx.toolmode && ctx.toolmode instanceof BVHToolMode;
  }

  static tooldef() {
    return {
      uiname: "Set Brush Radius",
      toolpath: "brush.set_radius",
      inputs: {
        radius: new FloatProperty(15.0),
        brush: new DataRefProperty(SculptBrush)
      },
      is_modal: true
    }
  }

  modalStart(ctx) {
    this.first = true;
    return super.modalStart(ctx);
  }

  on_mousemove(e) {
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
      this.cent_mpos.load(mpos).subScalar(brush.radius / devicePixelRatio / Math.sqrt(2.0));

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
    if (toolmode && toolmode instanceof BVHToolMode) {
      toolmode.mpos.load(this.cent_mpos);
    }

    let ratio = l1 / l2;
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

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    let toolmode = ctx.toolmode;
    if (!toolmode || !(toolmode instanceof BVHToolMode)) {
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

  on_mouseup(e) {
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
    super.on_keydown(e);
  }
}

ToolOp.register(SetBrushRadius);
