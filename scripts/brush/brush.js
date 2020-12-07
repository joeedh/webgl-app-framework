import {Icons} from "../editors/icon_enum.js";
import {Curve1D, SplineTemplates} from "../path.ux/scripts/pathux.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {DataBlock, BlockFlags} from "../core/lib_api.js";
import {GraphFlags, NodeFlags} from "../core/graph.js";
import {ProceduralTexUser} from './proceduralTex.js';

export const BrushFlags = {
  SELECT: 1,
  SHARED_SIZE: 2,
  DYNTOPO : 4
};

export const DynamicsMask = {
  STRENGTH: 1,
  RADIUS: 2,
  AUTOSMOOTH: 4
};

export const SculptTools = {
  CLAY: 0,
  FILL: 1,
  SCRAPE: 2,
  SMOOTH: 3,
  DRAW: 4,
  SHARP: 5,
  INFLATE: 6,
  SNAKE: 7,
  TOPOLOGY : 8,
  GRAB : 9,
  PAINT: 128,
  PAINT_SMOOTH: 129,
};

export const SculptIcons = {}
for (let k in SculptTools) {
  SculptIcons[k] = Icons["SCULPT_" + k];
}

export class BrushDynChannel {
  constructor(name = "") {
    this.name = name;
    this.curve = new Curve1D();
    this.useDynamics = false;
  }

  loadSTRUCT(reader) {
    reader(this);

    if (!this.name) {
      this.name = "unnamed";
    }
  }

  copyTo(b) {
    b.curve = this.curve.copy();
    b.useDynamics = this.useDynamics;
    b.name = this.name;
  }
}

BrushDynChannel.STRUCT = `
BrushDynChannel {
  name        : string;
  useDynamics : bool;
  curve       : Curve1D; 
}`;
nstructjs.register(BrushDynChannel);

let radius_curve_json = {
  "generators": [{"type": "EquationCurve", "equation": "x"}, {
    "type": "GuassianCurve",
    "height": 1,
    "offset": 1,
    "deviation": 0.3
  }, {
    "type": "BSplineCurve",
    "interpolating": false,
    "points": [{"0": 0.02344, "1": 0.12891, "eid": 1, "flag": 1, "tangent": 1}, {
      "0": 0.29297,
      "1": 0.85156,
      "eid": 3,
      "flag": 0,
      "tangent": 1
    }, {"0": 1, "1": 1, "eid": 2, "flag": 0, "tangent": 1}],
    "deg": 6,
    "eidgen": {"_cur": 4}
  }, {
    "type": "BounceCurve",
    "params": {"decay": 1, "scale": 1, "freq": 1, "phase": 0, "offset": 0}
  }, {"type": "ElasticCurve", "params": {"mode": false, "amplitude": 1, "period": 1}}, {
    "type": "EaseCurve",
    "params": {"mode_in": true, "mode_out": true, "amplitude": 1}
  }, {"type": "RandCurve", "params": {"amplitude": 1, "decay": 1, "in_mode": true}}],
  "uiZoom": 1,
  "VERSION": 1,
  "active_generator": "BSplineCurve"
};

let reverse_brush_curve = {
  "generators": [{"type": "EquationCurve", "equation": "x"}, {
    "type": "GuassianCurve",
    "height": 1,
    "offset": 1,
    "deviation": 0.3
  }, {
    "type": "BSplineCurve",
    "interpolating": false,
    "points": [{"0": 0.0, "1": 1.0, "eid": 1, "flag": 0, "tangent": 1}, {
      "0": 0.24219,
      "1": 0.91406,
      "eid": 3,
      "flag": 0,
      "tangent": 1
    }, {"0": 0.6562525, "1": 0.09766125000000003, "eid": 4, "flag": 1, "tangent": 1}, {
      "0": 1.0,
      "1": 0.0,
      "eid": 2,
      "flag": 0,
      "tangent": 1
    }],
    "deg": 6,
    "eidgen": {"_cur": 5}
  }, {
    "type": "BounceCurve",
    "params": {"decay": 1, "scale": 1, "freq": 1, "phase": 0, "offset": 0}
  }, {"type": "ElasticCurve", "params": {"mode": false, "amplitude": 1, "period": 1}}, {
    "type": "EaseCurve",
    "params": {"mode_in": true, "mode_out": true, "amplitude": 1}
  }, {"type": "RandCurve", "params": {"amplitude": 1, "decay": 1, "in_mode": true}}],
  "uiZoom": 0.9414801494010006,
  "VERSION": 1,
  "active_generator": "BSplineCurve"
};

export class BrushDynamics {
  constructor() {
    this.channels = [];

    let ch = this.getChannel("strength", true);
    ch.useDynamics = false;
    ch.curve.loadJSON(radius_curve_json);

    ch = this.getChannel("radius", true);
    ch.useDynamics = false;
    ch.curve.loadJSON(radius_curve_json);

    ch = this.getChannel("autosmooth", true);
    ch.useDynamics = true;
    ch.curve.loadJSON(reverse_brush_curve);
  }

  loadDefault(name) {
    let json = new BrushDynamics().getChannel(name, true).curve.toJSON();
    //let json = radius_curve_json;
    //let json2 = new BrushDynamics().radius.curve.toJSON();

    this.getChannel(name, true).curve.loadJSON(json);
  }

  hasChannel(name) {
    return this.getChannel(name, false) !== undefined;
  }

  getChannel(name, autoCreate = true) {
    for (let ch of this.channels) {
      if (ch.name === name) {
        return ch;
      }
    }

    if (autoCreate) {
      let ch = new BrushDynChannel(name);
      this.channels.push(ch);

      if (!this.hasOwnProperty(name)) {
        Object.defineProperty(this, name, {
          get: function () {
            return this.getChannel(name);
          }
        });
      }

      return ch;
    }

    return undefined;
  }

  getCurve(channel) {
    let ch = this.getChannel(channel);

    if (ch) {
      return ch.curve;
    }
  }

  loadSTRUCT(reader) {
    reader(this);

    let defineProp = (name) => {
      if (this.hasOwnProperty(name)) {
        return;
      }

      Object.defineProperty(this, name, {
        get: function () {
          return this.getChannel(name);
        }
      });
    }

    if (!this.autosmooth) {
      this.loadDefault("autosmooth");
    }

    for (let ch of this.channels) {
      defineProp(ch.name);
    }
  }

  copyTo(b) {
    for (let ch1 of this.channels) {
      let ch2 = b.getChannel(ch1.name, true);
      ch1.copyTo(ch2);
    }
  }
}

BrushDynamics.STRUCT = `
BrushDynamics {
  channels : array(BrushDynChannel);
}
`;
nstructjs.register(BrushDynamics);

export class SculptBrush extends DataBlock {
  constructor() {
    super();

    this.flag = BrushFlags.SHARED_SIZE;

    this.texUser = new ProceduralTexUser();

    this.tool = SculptTools.CLAY;
    this.strength = 0.5;
    this.spacing = 0.25;
    this.radius = 55.0;
    this.autosmooth = 0.0;
    this.planeoff = 0.0;

    this.falloff = new Curve1D();

    this.color = new Vector4([1, 1, 1, 1]);
    this.bgcolor = new Vector4([0, 0, 0, 1]);

    this.dynamics = new BrushDynamics();
  }

  copyTo(b, noDataBlockCopy = false) {
    if (!noDataBlockCopy) {
      super.copyTo(b, false);
    }

    this.texUser.copyTo(b.texUser);

    b.flag = this.flag;
    b.tool = this.tool;

    b.strength = this.strength;
    b.spacing = this.spacing;
    b.radius = this.radius;
    b.autosmooth = this.autosmooth;
    b.planeoff = this.planeoff;

    b.color.load(this.color);
    b.bgcolor.load(this.bgcolor);

    b.falloff = this.falloff.copy();

    this.dynamics.copyTo(b.dynamics);
  }

  copy(addLibUsers = false) {
    let ret = super.copy(addLibUsers);
    this.copyTo(ret);

    ret.name = this.name;

    return ret;
  }

  static blockDefine() {
    return {
      typeName: "brush",
      defaultName: "Brush",
      uiName: "Brush",
      flag: BlockFlags.FAKE_USER,
      icon: Icons.SCULPT_PAINT
    }
  }

  loadSTRUCT(reader) {
    reader(this);

    //handle old file data
    if (typeof this.lib_userData !== "string") {
      this.lib_userData = "{}";
    }

    super.loadSTRUCT(reader);
  }

  dataLink(getblock, getblock_adduser) {
    super.dataLink(getblock, getblock_adduser);

    this.texUser.dataLink(this, getblock, getblock_adduser);
  }

  static nodedef() {
    return {
      name: "brush",
      uiname: "Brush",
      flag: NodeFlags.SAVE_PROXY
    }
  }
}

SculptBrush.STRUCT = nstructjs.inherit(SculptBrush, DataBlock) + `
  autosmooth : float;
  strength   : float;
  tool       : int;
  radius     : float;
  planeoff   : float;
  spacing    : float;
  color      : vec4;
  bgcolor    : vec4;
  dynamics   : BrushDynamics;
  flag       : int;
  falloff    : Curve1D;
  texUser    : ProceduralTexUser;
}
`;
nstructjs.register(SculptBrush);
DataBlock.register(SculptBrush);

export function makeDefaultBrushes() {
  let brushes = {};
  let bmap = {};

  for (let k in SculptTools) {
    let name = k[0] + k.slice(1, k.length).toLowerCase();
    name = name.replace(/_/g, " ").trim();

    let brush = brushes[name] = new SculptBrush();
    brush.name = name;
    brush.tool = SculptTools[k];

    bmap[SculptTools[k]] = brush;
  }

  let brush;
  brush = bmap[SculptTools.PAINT];
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.PAINT_SMOOTH];
  brush.autosmooth = 0.0;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.DRAW];
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.CLAY];
  brush.autosmooth = 0.2;
  brush.strength = 0.9;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.FILL];
  brush.autosmooth = 0.2;
  brush.strength = 0.9;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.SCRAPE];
  brush.autosmooth = 0.2;
  brush.strength = 0.9;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.INFLATE];
  brush.strength = 0.25;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.SMOOTH];
  brush.strength = 1.0;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);
  brush.dynamics.strength.useDynamics = true;

  brush = bmap[SculptTools.SNAKE];
  brush.strength = 0.2;
  brush.autosmooth = 0.4;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.SHARP];
  brush.strength = 1.0;
  brush.autosmooth = 0.1;
  brush.spacing = 0.075;
  brush.dynamics.strength.useDynamics = true;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARPER);

  brush = bmap[SculptTools.TOPOLOGY];
  brush.autosmooth = 0.35;

  return brushes;
}

export class PaintToolSlot {
  constructor(tool) {
    this.brush = undefined;
    this.tool = tool;
  }

  dataLink(owner, getblock, getblock_addUser) {
    this.brush = getblock_addUser(this.brush, owner);
  }

  setBrush(brush, scene) {
    if (brush === this.brush) {
      return;
    }

    if (this.brush !== undefined && typeof this.brush === "object") {
      this.brush.lib_remUser(scene);
    }

    brush.lib_addUser(scene);
    this.brush = brush;
  }

  resolveBrush(ctx) {
    if (!this.brush) {
      let scene = ctx.scene;

      //there should always be at least one brush (we enforce this in getBrushes)
      //for each tool type
      this.brush = this.getBrushList(ctx)[0];
      this.brush.lib_addUser(scene);
    }

    return this.brush;
  }

  getBrushList(ctx) {
    return getBrushes(ctx).filter(f => f.tool === this.tool);
  }
}

PaintToolSlot.STRUCT = `
PaintToolSlot {
  brush : DataRef | DataRef.fromBlock(this.brush);
  tool  : int;
}
`;
nstructjs.register(PaintToolSlot);

export const DefaultBrushes = makeDefaultBrushes();
window._DefaultBrushes = DefaultBrushes;

/**
 Ensures that at least one brush instance of each brush tool type
 exists in the datalib
 * */
export function getBrushes(ctx, overrideDefaultBrushes = false) {
  let brushes = ctx.datalib.brush;

  for (let k in DefaultBrushes) {
    let found = false;
    let b = DefaultBrushes[k];

    for (let b2 of brushes) {
      if (b2.tool === b.tool) {
        found = b2;
        break;
      }
    }

    if (found && overrideDefaultBrushes) {
      b.copyTo(found, true);
    }

    if (!found) {
      b = b.copy();

      console.log("adding", k, b);
      ctx.datalib.add(b);
    }
  }

  let ret = [];
  for (let b of brushes) {
    ret.push(b);
  }

  return ret;
}

window._getBrushes = getBrushes;