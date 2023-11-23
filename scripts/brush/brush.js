import {Icons} from "../editors/icon_enum.js";
import {Curve1D, SplineTemplates} from "../path.ux/scripts/pathux.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {DataBlock, BlockFlags} from "../core/lib_api.js";
import {GraphFlags, NodeFlags} from "../core/graph.js";
import {
  CombModes, CombPattern, ProceduralTex, ProceduralTexUser, TexUserFlags, TexUserModes
} from '../texture/proceduralTex.js';
import {nstructjs} from '../path.ux/pathux.js';

function feq(a, b) {
  return Math.abs(a - b) < 0.00001;
}

export const BrushSpacingModes = {
  NONE: 0,
  EVEN: 1
};


export const BrushFlags = {
  SELECT               : 1,
  SHARED_SIZE          : 2,
  DYNTOPO              : 4,
  INVERT_CONCAVE_FILTER: 8,
  MULTIGRID_SMOOTH     : 16,
  PLANAR_SMOOTH        : 32,
  CURVE_RAKE_ONLY_POS_X: 64, //for debugging purposes, restrict curavture raking to one side of the mesh
  INVERT               : 128,
  LINE_FALLOFF         : 256,
  SQUARE               : 512,
  USE_LINE_CURVE       : 1024
};

export const DynTopoModes = {
  SCREEN: 0,
  WORLD : 1
};

export const SculptTools = {
  CLAY            : 0,
  FILL            : 1,
  SCRAPE          : 2,
  SMOOTH          : 3,
  DRAW            : 4,
  SHARP           : 5,
  INFLATE         : 6,
  SNAKE           : 7,
  TOPOLOGY        : 8,
  GRAB            : 9,
  HOLE_FILLER     : 10,
  MASK_PAINT      : 11,
  WING_SCRAPE     : 12,
  PINCH           : 13,
  DIRECTIONAL_FAIR: 14,
  SLIDE_RELAX     : 15,
  BVH_DEFORM      : 16,
  PAINT           : 128,
  PAINT_SMOOTH    : 129,
  COLOR_BOUNDARY  : 130,
  TEXTURE_PAINT   : 150,
  FACE_SET_DRAW   : 151
};

export const DynTopoFlags = {
  SUBDIVIDE         : 1,
  COLLAPSE          : 2,
  ENABLED           : 8,
  FANCY_EDGE_WEIGHTS: 16,
  QUAD_COLLAPSE     : 32,
  ALLOW_VALENCE4    : 64,
  DRAW_TRIS_AS_QUADS: 128,
  ADAPTIVE          : 256
};

export const DynTopoOverrides = {
  //these are mirrored with DynTopoFlags
  SUBDIVIDE: 1,
  COLLAPSE : 2,
  //4 used to be INHERIT_DEFAULT, moved to DynTopoOverrides.NONE
  ENABLED           : 8,
  FANCY_EDGE_WEIGHTS: 16,
  QUAD_COLLAPSE     : 32,
  ALLOW_VALENCE4    : 64,
  DRAW_TRIS_AS_QUADS: 128,
  ADAPTIVE          : 256,
  //end of DynTopoFlags mirror

  //these mirror properties instead of flags
  VALENCE_GOAL    : 1<<16,
  EDGE_SIZE       : 1<<17,
  DECIMATE_FACTOR : 1<<18,
  SUBDIVIDE_FACTOR: 1<<19,
  MAX_DEPTH       : 1<<20,
  EDGE_COUNT      : 1<<21,
  NONE            : 1<<22,
  REPEAT          : 1<<23,
  SPACING_MODE    : 1<<24,
  SPACING         : 1<<25,
  EDGEMODE        : 1<<26,
  SUBDIV_MODE     : 1<<27,
  EVERYTHING      : ((1<<27) - 1) & ~(1<<22) //all flags except for NONE
};

export const SubdivModes = {
  SIMPLE: 0,
  SMART : 1
};

const apiKeyMap = {
  valenceGoal    : 'VALENCE_GOAL',
  edgeSize       : 'EDGE_SIZE',
  decimateFactor : 'DECIMATE_FACTOR',
  subdivideFactor: 'SUBDIVIDE_FACTOR',
  maxDepth       : 'MAX_DEPTH',
  edgeCount      : 'EDGE_COUNT',
  repeat         : 'REPEAT',
  spacingMode    : 'SPACING_MODE',
  spacing        : 'SPACING',
  edgeMode       : 'EDGEMODE',
  subdivMode     : 'SUBDIV_MODE'
};

for (let k in DynTopoOverrides) {
  let k2 = `flag[${k}]`;
  apiKeyMap[k] = k;
  apiKeyMap[k2] = k;
}

let _ddigest = new util.HashDigest();

export class DynTopoSettings {
  constructor() {
    this.overrideMask = DynTopoOverrides.NONE;

    this.subdivMode = SubdivModes.SMART;

    this.edgeMode = DynTopoModes.SCREEN;

    this.valenceGoal = 6;
    this.edgeSize = 20.0;
    this.decimateFactor = 0.5;
    this.subdivideFactor = 0.25;
    this.maxDepth = 6; //used by multigrid code

    this.spacing = 1.0;
    this.spacingMode = BrushSpacingModes.EVEN;

    this.flag = DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE;
    //this.flag |= DynTopoFlags.FANCY_EDGE_WEIGHTS;

    this.edgeCount = 150;
    this.repeat = 1;
  }

  static apiKeyToOverride(k) {
    return apiKeyMap[k];
  }

  calcHashKey(d = _ddigest.reset()) {
    d.add(this.valenceGoal);
    d.add(this.overrideMask);
    d.add(this.decimateFactor);
    d.add(this.subdivideFactor);
    d.add(this.maxDepth);
    d.add(this.flag);
    d.add(this.edgeCount);
    d.add(this.edgeSize);
    d.add(this.spacing);
    d.add(this.repeat);
    d.add(this.spacingMode);
    d.add(this.edgeMode);
    d.add(this.subdivMode);
    d.add(this.spacing);

    return d.get();
  }

  equals(b) {
    let r = true;

    r = r && this.flag === b.flag;
    r = r && this.overrideMask === b.overrideMask;
    r = r && this.maxDepth === b.maxDepth;
    r = r && this.edgeCount === b.edgeCount;

    r = r && feq(this.spacing, b.spacing);
    r = r && feq(this.valenceGoal, b.valenceGoal);
    r = r && feq(this.decimateFactor, b.decimateFactor);
    r = r && feq(this.subdivideFactor, b.subdivideFactor);

    r = r && feq(this.edgeSize, b.edgeSize);
    r = r && this.repeat === b.repeat;

    r = r && this.spacingMode === b.spacingMode;
    r = r && this.edgeMode === b.edgeMode;

    r = r && this.subdivMode === b.subdivMode;

    return r;
  }

  loadDefaults(defaults) {
    let b = defaults;

    let mask = this.overrideMask;
    let dyn = DynTopoOverrides;

    if (mask & dyn.NONE) {
      this.load(b);
      return this;
    }

    for (let k in DynTopoFlags) {
      let f = DynTopoFlags[k];

      if (!(mask & f)) {
        let val = b.flag & f;

        if (val) {
          this.flag |= f;
        } else {
          this.flag &= ~f;
        }
      }
    }

    if (!(mask & dyn.SUBDIVIDE_FACTOR)) {
      this.subdivideFactor = b.subdivideFactor;
    }

    if (!(mask & dyn.DECIMATE_FACTOR)) {
      this.decimateFactor = b.decimateFactor;
    }

    if (!(mask & dyn.MAX_DEPTH)) {
      this.maxDepth = b.maxDepth;
    }

    if (!(mask & dyn.EDGE_COUNT)) {
      this.edgeCount = b.edgeCount;
    }

    if (!(mask & dyn.EDGE_SIZE)) {
      this.edgeSize = b.edgeSize;
    }

    if (!(mask & dyn.VALENCE_GOAL)) {
      this.valenceGoal = b.valenceGoal;
    }

    if (!(mask & dyn.REPEAT)) {
      this.repeat = b.repeat;
    }

    if (!(mask & dyn.SPACING_MODE)) {
      this.spacingMode = b.spacingMode;
    }

    if (!(mask & dyn.SPACING)) {
      this.spacing = b.spacing;
    }

    if (!(mask & dyn.EDGEMODE)) {
      this.edgeMode = b.edgeMode;
    }

    if (!(mask & dyn.SUBDIV_MODE)) {
      this.subdivMode = b.subdivMode;
    }

    return this;
  }

  load(b) {
    this.flag = b.flag;
    this.overrideMask = b.overrideMask;
    this.edgeMode = b.edgeMode;

    this.edgeSize = b.edgeSize;
    this.edgeCount = b.edgeCount;
    this.repeat = b.repeat;

    this.decimateFactor = b.decimateFactor;
    this.subdivideFactor = b.subdivideFactor;

    this.valenceGoal = b.valenceGoal;
    this.maxDepth = b.maxDepth;
    this.spacingMode = b.spacingMode;
    this.spacing = b.spacing;

    this.subdivMode = b.subdivMode;

    return this;
  }

  copy() {
    return new DynTopoSettings().load(this);
  }
}

DynTopoSettings.STRUCT = `
DynTopoSettings {
  flag            : int;
  overrideMask    : int;
  edgeSize        : float;
  edgeMode        : int;
  edgeCount       : int;
  decimateFactor  : float;
  subdivideFactor : float;
  maxDepth        : int;
  valenceGoal     : int;
  repeat          : int;
  spacingMode     : int;
  spacing         : float;
  subdivMode      : int;
}
`;
nstructjs.register(DynTopoSettings);

export const SculptIcons = {}
for (let k in SculptTools) {
  SculptIcons[k] = Icons["SCULPT_" + k];
}

let _bdhash = new util.HashDigest();

export class BrushDynChannel {
  constructor(name = "") {
    this.name = name;
    this.curve = new Curve1D();
    this.useDynamics = false;
  }

  calcHashKey(digest = _bdhash.reset()) {
    let d = digest;

    d.add(this.name);
    d.add(this.useDynamics);
    this.curve.calcHashKey(d);

    return d.get();
  }

  equals(b) {
    let r = this.name === b.name;

    r = r && this.curve.equals(b.curve);
    r = r && this.useDynamics === b.useDynamics;

    return r;
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
  "generators"      : [{"type": "EquationCurve", "equation": "x"}, {
    "type"     : "GuassianCurve",
    "height"   : 1,
    "offset"   : 1,
    "deviation": 0.3
  }, {
    "type"         : "BSplineCurve",
    "interpolating": false,
    "points"       : [{"0": 0.02344, "1": 0.12891, "eid": 1, "flag": 1, "tangent": 1}, {
      "0"      : 0.29297,
      "1"      : 0.85156,
      "eid"    : 3,
      "flag"   : 0,
      "tangent": 1
    }, {"0": 1, "1": 1, "eid": 2, "flag": 0, "tangent": 1}],
    "deg"          : 6,
    "eidgen"       : {"_cur": 4}
  }, {
    "type"  : "BounceCurve",
    "params": {"decay": 1, "scale": 1, "freq": 1, "phase": 0, "offset": 0}
  }, {"type": "ElasticCurve", "params": {"mode": false, "amplitude": 1, "period": 1}}, {
    "type"  : "EaseCurve",
    "params": {"mode_in": true, "mode_out": true, "amplitude": 1}
  }, {"type": "RandCurve", "params": {"amplitude": 1, "decay": 1, "in_mode": true}}],
  "uiZoom"          : 1,
  "VERSION"         : 1,
  "active_generator": "BSplineCurve"
};

let reverse_brush_curve = {
  "generators"      : [{"type": "EquationCurve", "equation": "x"}, {
    "type"     : "GuassianCurve",
    "height"   : 1,
    "offset"   : 1,
    "deviation": 0.3
  }, {
    "type"         : "BSplineCurve",
    "interpolating": false,
    "points"       : [{"0": 0.0, "1": 1.0, "eid": 1, "flag": 0, "tangent": 1}, {
      "0"      : 0.24219,
      "1"      : 0.91406,
      "eid"    : 3,
      "flag"   : 0,
      "tangent": 1
    }, {"0": 0.6562525, "1": 0.09766125000000003, "eid": 4, "flag": 1, "tangent": 1}, {
      "0"      : 1.0,
      "1"      : 0.0,
      "eid"    : 2,
      "flag"   : 0,
      "tangent": 1
    }],
    "deg"          : 6,
    "eidgen"       : {"_cur": 5}
  }, {
    "type"  : "BounceCurve",
    "params": {"decay": 1, "scale": 1, "freq": 1, "phase": 0, "offset": 0}
  }, {"type": "ElasticCurve", "params": {"mode": false, "amplitude": 1, "period": 1}}, {
    "type"  : "EaseCurve",
    "params": {"mode_in": true, "mode_out": true, "amplitude": 1}
  }, {"type": "RandCurve", "params": {"amplitude": 1, "decay": 1, "in_mode": true}}],
  "uiZoom"          : 0.9414801494010006,
  "VERSION"         : 1,
  "active_generator": "BSplineCurve"
};

let _digest2 = new util.HashDigest();

export class BrushDynamics {
  constructor() {
    this.channels = [];

    let ch = this.getChannel("strength", true);
    ch.useDynamics = false;
    ch.curve.loadJSON(radius_curve_json);

    ch = this.getChannel("radius", true);
    ch.useDynamics = false;
    //ch.curve.loadJSON(radius_curve_json);

    ch = this.getChannel("autosmooth", true);
    ch.useDynamics = true;
    ch.curve.loadJSON(reverse_brush_curve);

    ch = this.getChannel("concaveFilter", true);
    ch.useDynamics = true;
    ch.curve.loadJSON(reverse_brush_curve);

    ch = this.getChannel("rake", true);
    ch.useDynamics = false;
    ch.curve.loadJSON(reverse_brush_curve);

    ch = this.getChannel("pinch", true);
    ch.useDynamics = false;

    ch = this.getChannel("smoothProj", true);
    ch.useDynamics = false;

    ch = this.getChannel("sharp", true);
    ch.useDynamics = false;

    ch = this.getChannel("autosmoothInflate", true);
    ch.useDynamics = false;
  }

  calcHashKey(d = _digest2.reset()) {
    for (let ch of this.channels) {
      ch.calcHashKey(d);
    }

    return d.get();
  }

  equals(b) {
    for (let ch1 of this.channels) {
      let ch2 = b.getChannel(ch1.name, false);

      if (!ch2 || !ch2.equals(ch1)) {
        return false;
      }
    }

    return true;
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

let ckey_digest = new util.HashDigest();

export class SculptBrush extends DataBlock {
  static STRUCT = nstructjs.inlineRegister(this, `
SculptBrush {
  autosmooth : float;
  autosmoothInflate : float;
  strength   : float;
  tool       : int;
  radius     : float;
  planeoff   : float;
  concaveFilter : float;
  rake       : float;    
  spacing    : float;
  smoothProj : float;
  color      : vec4;
  normalfac  : float;
  bgcolor    : vec4;
  dynamics   : BrushDynamics;
  flag       : int;
  falloff    : Curve1D;
  falloff2   : Curve1D;
  texUser    : ProceduralTexUser;
  pinch      : float;
  dynTopo    : DynTopoSettings;
  rakeCurvatureFactor : float;
  spacingMode: int;
  sharp      : float;
  smoothRadiusMul : float;
}`);

  constructor() {
    super();

    this.flag = BrushFlags.SHARED_SIZE;

    this.smoothRadiusMul = 1.0;

    this.smoothProj = 0.0; //how much smoothing should project to surface
    this.spacingMode = BrushSpacingModes.EVEN;

    this.texUser = new ProceduralTexUser();

    this.concaveFilter = 0.0;

    this.dynTopo = new DynTopoSettings();

    this.rakeCurvatureFactor = 0.0;

    this.tool = SculptTools.CLAY;

    this.sharp = 0.0;
    this.strength = 0.5;
    this.spacing = 0.175;
    this.radius = 55.0;
    this.autosmooth = 0.0;
    this.autosmoothInflate = 0.0;
    this.planeoff = 0.0;
    this.rake = 0.0;
    this.pinch = 0.0;

    this.normalfac = 0.5;

    this.falloff = new Curve1D();
    this.falloff2 = new Curve1D();

    this.color = new Vector4([1, 1, 1, 1]);
    this.bgcolor = new Vector4([0, 0, 0, 1]);

    this.dynamics = new BrushDynamics();
  }

  static blockDefine() {
    return {
      typeName   : "brush",
      defaultName: "Brush",
      uiName     : "Brush",
      flag       : BlockFlags.FAKE_USER,
      icon       : Icons.SCULPT_PAINT
    }
  }

  static nodedef() {
    return {
      name  : "brush",
      uiname: "Brush",
      flag  : NodeFlags.SAVE_PROXY
    }
  }

  equals(b, fast = true, ignoreRadiusStrength = false) {
    if (fast) {
      let key1 = this.calcHashKey();
      let key2 = b.calcHashKey();

      return key1 === key2;
    }

    let r = true;

    r = r && this.flag === b.flag;

    if (!ignoreRadiusStrength) {
      r = r && feq(this.strength, b.strength);
      r = r && feq(this.radius, b.radius);
    }

    r = r && feq(this.smoothRadiusMul, b.smoothRadiusMul);
    r = r && this.spacingMode === b.spacingMode;
    r = r && feq(this.tool, b.tool);
    r = r && feq(this.rake, b.rake);
    r = r && feq(this.pinch, b.pinch);
    r = r && feq(this.rakeCurvatureFactor, b.rakeCurvatureFactor);
    r = r && feq(this.autosmooth, b.autosmooth);
    r = r && feq(this.smoothProj, b.smoothProj);
    r = r && feq(this.normalfac, b.normalfac);
    r = r && feq(this.spacing, b.spacing);
    r = r && this.tool === b.tool;
    r = r && feq(this.sharp, b.sharp);
    r = r && feq(this.autosmoothInflate, b.autosmoothInflate);

    r = r && this.color.vectorDistanceSqr(b.color) < 0.00001;
    r = r && this.bgcolor.vectorDistanceSqr(b.bgcolor) < 0.00001;

    r = r && feq(this.concaveFilter, b.concaveFilter);

    r = r && this.texUser.equals(b.texUser);
    //r = r && this.dynamics.equals(b.dynamics);
    r = r && this.falloff.equals(b.falloff);
    r = r && this.dynTopo.equals(b.dynTopo);
    r = r && this.falloff2.equals(b.falloff2);

    return r;
  }

  calcHashKey(digest = ckey_digest.reset(), ignoreRadiusStrength = false) {
    let d = digest;

    for (let i = 0; i < 4; i++) {
      d.add(this.color[i]);
      d.add(this.bgcolor[i]);
    }

    if (!ignoreRadiusStrength) {
      d.add(this.strength);
      d.add(this.radius);
    }

    d.add(this.smoothRadiusMul);
    d.add(this.spacingMode);
    d.add(this.flag);
    d.add(this.tool);

    d.add(this.sharp);
    d.add(this.rakeCurvatureFactor);
    d.add(this.concaveFilter);
    d.add(this.tool);
    d.add(this.smoothProj);
    d.add(this.spacing);
    d.add(this.autosmooth);
    d.add(this.autosmoothInflate);
    d.add(this.pinch);
    d.add(this.planeoff);
    d.add(this.rake);
    d.add(this.pinch);
    d.add(this.normalfac);
    d.add(this.falloff);
    d.add(this.color);
    d.add(this.bgcolor);

    this.texUser.calcHashKey(d);
    this.dynamics.calcHashKey(d);
    this.falloff.calcHashKey(d);
    this.dynTopo.calcHashKey(d);
    this.falloff2.calcHashKey(d);

    return d.get();
  }

  calcMemSize() {
    return 16*8 + 512; //is an estimation
  }

  copyTo(b, copyBlockData = false) {
    if (copyBlockData) {
      super.copyTo(b, false);
    }

    b.flag = this.flag;
    b.tool = this.tool;
    b.sharp = this.sharp;
    b.smoothRadiusMul = this.smoothRadiusMul;

    b.spacingMode = this.spacingMode;
    b.spacing = this.spacing;

    b.smoothProj = this.smoothProj;
    b.concaveFilter = this.concaveFilter;
    b.rake = this.rake;
    b.pinch = this.pinch;
    b.autosmooth = this.autosmooth;
    b.autosmoothInflate = this.autosmoothInflate;

    b.rakeCurvatureFactor = this.rakeCurvatureFactor

    b.normalfac = this.normalfac;
    b.strength = this.strength;
    b.radius = this.radius;
    b.planeoff = this.planeoff;

    b.color.load(this.color);
    b.bgcolor.load(this.bgcolor);

    b.falloff2.load(this.falloff2);
    this.texUser.copyTo(b.texUser);
    b.dynTopo.load(this.dynTopo);
    b.falloff = this.falloff.copy();
    this.dynamics.copyTo(b.dynamics);
  }

  copy(addLibUsers = false) {
    let ret = super.copy(addLibUsers);
    this.copyTo(ret, false);
    ret.name = this.name;

    return ret;
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
}

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

  brush = bmap[SculptTools.COLOR_BOUNDARY];
  //brush.autosmooth = 0.01;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.DRAW];
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.CLAY];
  brush.autosmooth = 0.3;
  brush.strength = 0.75;
  brush.dynamics.autosmooth.useDynamics = true;
  brush.dynamics.strength.useDynamics = true;
  brush.dynamics.strength.curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARP);

  brush.flag |= BrushFlags.SQUARE | BrushFlags.LINE_FALLOFF | BrushFlags.USE_LINE_CURVE;
  brush.spacing = 0.2;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTHER);
  brush.falloff2.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.GUASSIAN);

  brush = brush.copy();
  brush.name = "Comb";
  brush.flag |= BrushFlags.INVERT;
  brush.spacing = 0.15;
  brush.texUser.mode = TexUserModes.VIEW_REPEAT;
  brush.texUser.flag = TexUserFlags.FANCY_RAKE | TexUserFlags.RAKE;

  brush.autosmooth = 0.25;
  brush.dynamics.autosmooth.useDynamics = true;
  let curve = brush.dynamics.autosmooth.curve;
  curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.LINEAR);

  let tex = brush.texUser.texture = new ProceduralTex();
  tex.lib_users++;
  tex.lib_flag |= BlockFlags.FAKE_USER;
  tex.name = "CombBrush";

  tex.setGenerator(CombPattern);

  let pat = tex.getGenerator(CombPattern);
  pat.count = 1;
  pat.mode = CombModes.STEP;
  brush.flag |= BlockFlags.FAKE_USER;

  brushes[brush.name] = brush;


  brush = bmap[SculptTools.FILL];
  brush.autosmooth = 0.5;
  brush.strength = 0.5;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.SCRAPE];
  brush.autosmooth = 0.2;
  brush.strength = 0.5;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.INFLATE];
  brush.strength = 0.5;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.SMOOTH];
  brush.strength = 0.5;
  brush.planeoff = -1.0;
  brush.normalfac = 1.0;

  brush.dynTopo.overrideMask = 0;
  brush.dynTopo.flag = DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE;


  //brush.flag |= BrushFlags.PLANAR_SMOOTH;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SPHERE);

  brush.dynamics.strength.curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.LINEAR);
  brush.dynamics.strength.useDynamics = true;

  brush = bmap[SculptTools.SNAKE];
  brush.strength = 0.5;
  brush.autosmooth = 0.8;
  brush.dynTopo.flag = DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE;
  brush.dynTopo.overrideMask = DynTopoOverrides.COLLAPSE | DynTopoOverrides.SUBDIVIDE;
  brush.dynTopo.overrideMask |= DynTopoOverrides.EDGE_COUNT | DynTopoOverrides.DECIMATE_FACTOR;
  brush.dynTopo.edgeCount = 550;
  brush.dynTopo.decimateFactor = 0.05;

  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.SHARP];
  brush.strength = 0.5;
  brush.autosmooth = 0.25;
  brush.dynamics.autosmooth.useDynamics = false;
  brush.pinch = 0.5;
  brush.spacing = 0.09;
  brush.dynamics.strength.useDynamics = true;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARP);

  brush = bmap[SculptTools.TOPOLOGY];
  brush.rake = 0.5;
  brush.rakeCurvatureFactor = 1.0;
  brush.autosmooth = 0.15;
  brush.spacing = 0.2;
  brush.spacingMode = BrushSpacingModes.EVEN;
  brush.dynamics.autosmooth.curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.LINEAR);
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.CONSTANT);

  brush = bmap[SculptTools.GRAB];
  brush.autosmooth = 0.0;
  brush.rake = 0.0;
  brush.radius = 100;
  brush.flag &= ~BrushFlags.SHARED_SIZE;
  brush.dynTopo.overrideMask = DynTopoOverrides.ENABLED;
  brush.dynTopo.flag &= ~DynTopoFlags.ENABLED;
  let curvejson = {
    "type"                                                                        : "BSplineCurve", "points": [{
      "0": 0, "1": 0, "eid": 16, "flag": 0, "tangent": 1, "rco": [0, 0]
    }, {
      "0": 0.41673, "1": -0.06794, "eid": 17, "flag": 1, "tangent": 1, "rco": [0.41673, -0.06794]
    }, {"0": 1, "1": 1, "eid": 18, "flag": 0, "tangent": 1, "rco": [1, 1]}], "deg": 3, "interpolating": false,
    "eidgen"                                                                      : {"_cur": 19},
    "range"                                                                       : [[0, 1], [-0.19203, 1]]
  };
  brush.falloff.getGenerator("BSplineCurve").loadJSON(curvejson);

  //brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);
  brush.dynamics.autosmooth.useDynamics = false;

  brush = bmap[SculptTools.WING_SCRAPE];
  brush.autosmooth = 0.0;
  brush.pinch = 0.0;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.PINCH];
  brush.autosmooth = 0.2;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARPER);
  brush.dynamics.strength.useDynamics = true;
  brush.dynamics.autosmooth.useDynamics = false;

  brush = bmap[SculptTools.SLIDE_RELAX];
  brush.autosmooth = 0.05;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);
  brush.dynamics.strength.useDynamics = false;
  brush.dynamics.autosmooth.useDynamics = false;
  brush.spacing = 0.04;
  brush.smoothProj = 0.85;

  return brushes;
}

export function makeDefaultBrushes_MediumRes() {
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

  brush = bmap[SculptTools.COLOR_BOUNDARY];
  //brush.autosmooth = 0.01;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.DRAW];
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;

  brush = bmap[SculptTools.CLAY];
  brush.autosmooth = 0.3;
  brush.strength = 0.75;
  brush.dynamics.autosmooth.useDynamics = true;
  brush.dynamics.strength.useDynamics = true;
  brush.dynamics.strength.curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARP);
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;

  brush.flag |= BrushFlags.SQUARE | BrushFlags.LINE_FALLOFF | BrushFlags.USE_LINE_CURVE;
  brush.spacing = 0.2;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTHER);
  brush.falloff2.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.GUASSIAN);

  brush = brush.copy();
  brush.name = "Comb";
  brush.flag |= BrushFlags.INVERT;
  brush.spacing = 0.15;
  brush.texUser.mode = TexUserModes.VIEW_REPEAT;
  brush.texUser.flag = TexUserFlags.FANCY_RAKE | TexUserFlags.RAKE;

  brush.autosmooth = 0.25;
  brush.dynamics.autosmooth.useDynamics = true;
  let curve = brush.dynamics.autosmooth.curve;
  curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.LINEAR);

  let tex = brush.texUser.texture = new ProceduralTex();
  tex.lib_users++;
  tex.lib_flag |= BlockFlags.FAKE_USER;
  tex.name = "CombBrush";

  tex.setGenerator(CombPattern);

  let pat = tex.getGenerator(CombPattern);
  pat.count = 1;
  pat.mode = CombModes.STEP;
  brush.flag |= BlockFlags.FAKE_USER;

  brushes[brush.name] = brush;


  brush = bmap[SculptTools.FILL];
  brush.autosmooth = 0.5;
  brush.strength = 0.5;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.SCRAPE];
  brush.autosmooth = 0.2;
  brush.strength = 0.5;
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);

  brush = bmap[SculptTools.INFLATE];
  brush.strength = 0.5;
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.SMOOTH];
  brush.strength = 0.5;
  brush.planeoff = -1.0;
  brush.normalfac = 1.0;
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;

  brush.dynTopo.overrideMask = 0;
  brush.dynTopo.flag = DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE;


  //brush.flag |= BrushFlags.PLANAR_SMOOTH;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SPHERE);

  brush.dynamics.strength.curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.LINEAR);
  brush.dynamics.strength.useDynamics = true;

  brush = bmap[SculptTools.SNAKE];
  brush.strength = 0.5;
  brush.autosmooth = 0.8;
  brush.dynTopo.flag = DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE;
  brush.dynTopo.overrideMask = DynTopoOverrides.COLLAPSE | DynTopoOverrides.SUBDIVIDE;
  brush.dynTopo.overrideMask |= DynTopoOverrides.EDGE_COUNT | DynTopoOverrides.DECIMATE_FACTOR;
  brush.dynTopo.edgeCount = 550;
  brush.dynTopo.decimateFactor = 0.05;

  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.SHARP];
  brush.strength = 0.5;
  brush.autosmooth = 0.25;
  brush.dynamics.autosmooth.useDynamics = false;
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;
  brush.pinch = 0.5;
  brush.spacing = 0.09;
  brush.dynamics.strength.useDynamics = true;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARP);

  brush = bmap[SculptTools.TOPOLOGY];
  brush.autosmooth = 0.15;
  brush.spacing = 0.2;
  brush.spacingMode = BrushSpacingModes.EVEN;
  brush.rake = 1.0;
  brush.rakeCurvatureFactor = 1.0;
  brush.dynamics.autosmooth.curve.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.LINEAR);
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.CONSTANT);

  brush = bmap[SculptTools.GRAB];
  brush.autosmooth = 0.0;
  brush.rake = 0.0;
  brush.radius = 100;
  brush.flag &= ~BrushFlags.SHARED_SIZE;
  brush.dynTopo.overrideMask = DynTopoOverrides.ENABLED;
  brush.dynTopo.flag &= ~DynTopoFlags.ENABLED;
  let curvejson = {
    "type"                                                                        : "BSplineCurve", "points": [{
      "0": 0, "1": 0, "eid": 16, "flag": 0, "tangent": 1, "rco": [0, 0]
    }, {
      "0": 0.41673, "1": -0.06794, "eid": 17, "flag": 1, "tangent": 1, "rco": [0.41673, -0.06794]
    }, {"0": 1, "1": 1, "eid": 18, "flag": 0, "tangent": 1, "rco": [1, 1]}], "deg": 3, "interpolating": false,
    "eidgen"                                                                      : {"_cur": 19},
    "range"                                                                       : [[0, 1], [-0.19203, 1]]
  };
  brush.falloff.getGenerator("BSplineCurve").loadJSON(curvejson);

  //brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);
  brush.dynamics.autosmooth.useDynamics = false;

  brush = bmap[SculptTools.WING_SCRAPE];
  brush.autosmooth = 0.0;
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;
  brush.pinch = 0.0;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SMOOTH);

  brush = bmap[SculptTools.PINCH];
  brush.rake = 0.0;
  brush.rakeCurvatureFactor = 1.0;
  brush.autosmooth = 0.2;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SHARPER);
  brush.dynamics.strength.useDynamics = true;
  brush.dynamics.autosmooth.useDynamics = false;

  brush = bmap[SculptTools.SLIDE_RELAX];
  brush.autosmooth = 0.05;
  brush.falloff.getGenerator("BSplineCurve").loadTemplate(SplineTemplates.SQRT);
  brush.dynamics.strength.useDynamics = false;
  brush.dynamics.autosmooth.useDynamics = false;
  brush.spacing = 0.04;
  brush.smoothProj = 0.85;

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

export var BrushSets = {
  HIGH_RES  : 0,
  MEDIUM_RES: 1
};

export var BrushSetFactories = [
  makeDefaultBrushes,
  makeDefaultBrushes_MediumRes
];

export var DefaultBrushes = makeDefaultBrushes();
window._DefaultBrushes = DefaultBrushes;

export var brushSet = BrushSets.DEFAULT;

export function setBrushSet(set) {
  let update = set !== brushSet;

  let found = false;

  for (let k in BrushSets) {
    if (BrushSets[k] === set) {
      found = true;
    } else if (k === set) {
      set = BrushSets[k];
      found = true;
    }
  }

  if (!found) {
    throw new Error("unknown brush set " + set);
  }

  brushSet = set;

  if (update) {
    console.log("Loading brush set " + set);

    DefaultBrushes = window._DefaultBrushes = BrushSetFactories[set]();
  }
}

window._setBrushSet = setBrushSet;

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
      if (b2.tool === b.tool && b2.name === b.name) {
        found = b2;
        break;
      }
    }

    if (found && overrideDefaultBrushes) {
      b.copyTo(found, false);
      found.graphUpdate();
    } else if (!found) {
      b = b.copy();
      b.lib_id = -1;

      console.log("adding", k, b);

      let tex = b.texUser.texture;
      if (tex && tex.lib_id < 0) {
        ctx.datalib.add(tex);
      }

      ctx.datalib.add(b);
    }

    let tex = b.texUser.texture;
    if (tex && tex.lib_id < 0) {
      ctx.datalib.add(tex);
    }

    if (overrideDefaultBrushes || !found) {
      //add a hidden copy too
      let oname = "__original_brush_" + b.name;
      let b2 = ctx.datalib.get(oname);

      if (!b2) {
        b2 = b.copy();
        b2.lib_id = -1;

        b2.name = oname;
        b2.lib_flag |= BlockFlags.HIDE;
        ctx.datalib.add(b2);

        let tex = b2.texUser.texture;
        if (tex && tex.lib_id < 0) {
          ctx.datalib.add(tex);
        }
      } else {
        b.copyTo(b2, false);
        b2.graphUpdate();
      }
    }
  }

  let ret = [];
  for (let b of brushes) {
    ret.push(b);
  }

  return ret;
}

window._getBrushes = getBrushes;