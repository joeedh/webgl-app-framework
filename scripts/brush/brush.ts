import {
  BSplineCurve, Curve1D, SplineTemplates, util,
  Vector2, Vector3, Vector4, Matrix4, Quat
} from "../path.ux/scripts/pathux.js";
import {Icons} from "../editors/icon_enum.js";
import {DataBlock, BlockFlags} from "../core/lib_api.js";
import {GraphFlags, NodeFlags} from "../core/graph.js";
import {
  CombModes, CombPattern, ProceduralTex, ProceduralTexUser, TexUserFlags, TexUserModes
} from '../texture/proceduralTex';
import {nstructjs} from '../path.ux/pathux.js';
import {StructReader} from '../path.ux/scripts/path-controller/types/util/nstructjs.js';
import {Scene} from '../scene/scene.js';
import {ToolContext} from '../../types/scripts/core/context.js';

function feq(a, b) {
  return Math.abs(a - b) < 0.00001;
}

export const BrushSpacingModes = {
  NONE: 0,
  EVEN: 1
};


export enum BrushFlags {
  SELECT                = 1,
  SHARED_SIZE           = 2,
  DYNTOPO               = 4,
  INVERT_CONCAVE_FILTER = 8,
  MULTIGRID_SMOOTH      = 16,
  PLANAR_SMOOTH         = 32,
  CURVE_RAKE_ONLY_POS_X = 64, //for debugging purposes, restrict curavture raking to one side of the mesh
  INVERT                = 128,
  LINE_FALLOFF          = 256,
  SQUARE                = 512,
  USE_LINE_CURVE        = 1024
};

export enum DynTopoModes {
  SCREEN = 0,
  WORLD  = 1
};

export enum SculptTools {
  CLAY             = 0,
  FILL             = 1,
  SCRAPE           = 2,
  SMOOTH           = 3,
  DRAW             = 4,
  SHARP            = 5,
  INFLATE          = 6,
  SNAKE            = 7,
  TOPOLOGY         = 8,
  GRAB             = 9,
  HOLE_FILLER      = 10,
  MASK_PAINT       = 11,
  WING_SCRAPE      = 12,
  PINCH            = 13,
  DIRECTIONAL_FAIR = 14,
  SLIDE_RELAX      = 15,
  BVH_DEFORM       = 16,
  PAINT            = 128,
  PAINT_SMOOTH     = 129,
  COLOR_BOUNDARY   = 130,
  TEXTURE_PAINT    = 150,
  FACE_SET_DRAW    = 151
};

export enum DynTopoFlags {
  SUBDIVIDE          = 1,
  COLLAPSE           = 2,
  ENABLED            = 8,
  FANCY_EDGE_WEIGHTS = 16,
  QUAD_COLLAPSE      = 32,
  ALLOW_VALENCE4     = 64,
  DRAW_TRIS_AS_QUADS = 128,
  ADAPTIVE           = 256
};

export enum DynTopoOverrides {
  //these are mirrored with DynTopoFlags
  SUBDIVIDE          = 1,
  COLLAPSE           = 2,
  //4 used to be INHERIT_DEFAULT, moved to DynTopoOverrides.NONE
  ENABLED            = 8,
  FANCY_EDGE_WEIGHTS = 16,
  QUAD_COLLAPSE      = 32,
  ALLOW_VALENCE4     = 64,
  DRAW_TRIS_AS_QUADS = 128,
  ADAPTIVE           = 256,
  //end of DynTopoFlags mirror

  //these mirror properties instead of flags
  VALENCE_GOAL       = 1<<16,
  EDGE_SIZE          = 1<<17,
  DECIMATE_FACTOR    = 1<<18,
  SUBDIVIDE_FACTOR   = 1<<19,
  MAX_DEPTH          = 1<<20,
  EDGE_COUNT         = 1<<21,
  NONE               = 1<<22,
  REPEAT             = 1<<23,
  SPACING_MODE       = 1<<24,
  SPACING            = 1<<25,
  EDGEMODE           = 1<<26,
  SUBDIV_MODE        = 1<<27,
  EVERYTHING         = ((1<<27) - 1) & ~(1<<22) //all flags except for NONE
};

export enum SubdivModes {
  SIMPLE = 0,
  SMART  = 1
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
  static STRUCT = nstructjs.inlineRegister(this, `
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
  }`
  );

  overrideMask = DynTopoOverrides.NONE;
  subdivMode = SubdivModes.SMART;

  edgeMode = DynTopoModes.SCREEN;

  valenceGoal = 6;
  edgeSize = 20.0;
  decimateFactor = 0.5;
  subdivideFactor = 0.25;
  maxDepth = 6; //used by multigrid code
  spacing = 1.0;
  spacingMode = BrushSpacingModes.EVEN;

  flag = DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE;
  //flag |= DynTopoFlags.FANCY_EDGE_WEIGHTS;

  edgeCount = 150;
  repeat = 1;

  constructor() {
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

  equals(b: this) {
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

  loadDefaults(defaults: any): this {
    let b = defaults;

    let mask = this.overrideMask;
    let dyn = DynTopoOverrides;

    if (mask & dyn.NONE) {
      this.load(b);
      return this;
    }

    for (let k in DynTopoFlags) {
      let f = DynTopoFlags[k]

      if (typeof f !== "number") {
        continue;
      }

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

  load(b: this): this {
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

  copy(): this {
    return new DynTopoSettings().load(this) as unknown as this;
  }
}

export const SculptIcons = {}
for (let k in SculptTools) {
  SculptIcons[k] = Icons["SCULPT_" + k];
}

let _bdhash = new util.HashDigest();

export class BrushDynChannel {
  static STRUCT = nstructjs.inlineRegister(this, `
BrushDynChannel {
  name        : string;
  useDynamics : bool;
  curve       : Curve1D; 
}
`)

  name: string;
  curve = new Curve1D();
  useDynamics = false;

  constructor(name = "") {
    this.name = name
  }

  calcHashKey(digest: util.HashDigest = _bdhash.reset()): number {
    let d = digest;

    d.add(this.name);
    d.add(this.useDynamics);
    this.curve.calcHashKey(d);

    return d.get();
  }

  equals(b: this): boolean {
    let r = this.name === b.name;

    r = r && this.curve.equals(b.curve);
    r = r && this.useDynamics === b.useDynamics;

    return r;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    if (!this.name) {
      this.name = "unnamed";
    }
  }

  copyTo(b: this): void {
    b.curve = this.curve.copy();
    b.useDynamics = this.useDynamics;
    b.name = this.name;
  }
}

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
  static STRUCT = nstructjs.inlineRegister(this, `
  BrushDynamics {
    channels : array(BrushDynChannel);
  }
`);
  channels: BrushDynChannel[] = [];

  constructor() {
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

  equals(b: this): boolean {
    for (let ch1 of this.channels) {
      let ch2 = b.getChannel(ch1.name, false);

      if (!ch2 || !ch2.equals(ch1)) {
        return false;
      }
    }

    return true;
  }

  loadDefault(name: string): void {
    let json = new BrushDynamics().getChannel(name, true).curve.toJSON();
    //let json = radius_curve_json;
    //let json2 = new BrushDynamics().radius.curve.toJSON();

    this.getChannel(name, true).curve.loadJSON(json);
  }

  hasChannel(name: string) {
    return this.getChannel(name, false) !== undefined;
  }

  getChannel<T extends true | false>(name: string, autoCreate: T = true as T): T extends true ? BrushDynChannel
                                                                                              : BrushDynChannel | undefined {
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

  getCurve(channel: string): Curve1D {
    let ch = this.getChannel(channel);

    if (ch) {
      return ch.curve;
    }
  }

  loadSTRUCT(reader: StructReader<this>): void {
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

    if (!this.hasChannel("autosmooth")) {
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


  flag = BrushFlags.SHARED_SIZE;

  smoothRadiusMul = 1.0;

  smoothProj = 0.0; //how much smoothing should project to surface
  spacingMode = BrushSpacingModes.EVEN;

  texUser = new ProceduralTexUser();

  concaveFilter = 0.0;

  dynTopo = new DynTopoSettings();

  rakeCurvatureFactor = 0.0;

  tool = SculptTools.CLAY;

  sharp = 0.0;
  strength = 0.5;
  spacing = 0.175;
  radius = 55.0;
  autosmooth = 0.0;
  autosmoothInflate = 0.0;
  planeoff = 0.0;
  rake = 0.0;
  pinch = 0.0;

  normalfac = 0.5;

  falloff = new Curve1D();
  falloff2 = new Curve1D();

  color = new Vector4([1, 1, 1, 1]);
  bgcolor = new Vector4([0, 0, 0, 1]);

  dynamics = new BrushDynamics();

  constructor() {
    super();
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
      name   : "brush",
      uiname : "Brush",
      flag   : NodeFlags.SAVE_PROXY,
      inputs : {},
      outputs: {}
    }
  }

  equals(b: this, fast = true, ignoreRadiusStrength = false): boolean {
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

  calcHashKey(digest = ckey_digest.reset(), ignoreRadiusStrength = false): number {
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

  calcMemSize(): number {
    return 16*8 + 512; //is an estimation
  }

  copyTo(b: this, copyBlockData = false): void {
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

  copy(addLibUsers = false): this {
    let ret = super.copy(addLibUsers) as this;
    this.copyTo(ret, false);
    ret.name = this.name;

    return ret;
  }

  loadSTRUCT(reader: StructReader<this>): void {
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
    if (typeof k !== "string") {
      continue;
    }

    let name = k[0] + k.slice(1, k.length).toLowerCase();
    name = name.replace(/_/g, " ").trim();

    let brush = brushes[name] = new SculptBrush();
    brush.name = name;
    brush.tool = SculptTools[k] as unknown as SculptTools;

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
    if (typeof k !== "string") {
      continue;
    }

    let name = k[0] + k.slice(1, k.length).toLowerCase();
    name = name.replace(/_/g, " ").trim();

    let brush = brushes[name] = new SculptBrush();
    brush.name = name;
    brush.tool = SculptTools[k] as unknown as SculptTools;

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
  static STRUCT = nstructjs.inlineRegister(this, `
  PaintToolSlot {
    brush : DataRef | DataRef.fromBlock(this.brush);
    tool  : int;
  }
`)

  brush?: SculptBrush = undefined
  tool: SculptTools

  constructor(tool: SculptTools) {
    this.tool = tool;
  }

  dataLink(owner: DataBlock, getblock: any, getblock_addUser: any) {
    this.brush = getblock_addUser(this.brush, owner);
  }

  setBrush(brush: SculptBrush, scene: Scene) {
    if (brush === this.brush) {
      return;
    }

    if (this.brush !== undefined && typeof this.brush === "object") {
      this.brush.lib_remUser(scene);
    }

    brush.lib_addUser(scene);
    this.brush = brush;
  }

  resolveBrush(ctx: ToolContext) {
    if (!this.brush) {
      let scene = ctx.scene;

      //there should always be at least one brush (we enforce this in getBrushes)
      //for each tool type
      this.brush = this.getBrushList(ctx)[0];
      this.brush.lib_addUser(scene);
    }

    return this.brush;
  }

  getBrushList(ctx: ToolContext) {
    return getBrushes(ctx).filter(f => f.tool === this.tool);
  }
}

export enum BrushSets {
  HIGH_RES   = 0,
  MEDIUM_RES = 1,
  DEFAULT    = 1
};

export const BrushSetFactories = [
  makeDefaultBrushes,
  makeDefaultBrushes_MediumRes
];

export var DefaultBrushes = makeDefaultBrushes();
(window as unknown as any)._DefaultBrushes = DefaultBrushes;

export var brushSet = BrushSets.DEFAULT;

export function setBrushSet(set: BrushSets | string) {
  let update = set !== brushSet;

  let found = false;

  for (let k in BrushSets) {
    const v = BrushSets[k] as unknown as BrushSets

    if (v === set) {
      found = true;
    } else if (k === set) {
      set = BrushSets[k];
      found = true;
    }
  }

  if (!found) {
    throw new Error("unknown brush set " + set);
  }

  brushSet = set as unknown as BrushSets;

  if (update) {
    console.log("Loading brush set " + set);

    DefaultBrushes = (window as unknown as any)._DefaultBrushes = BrushSetFactories[set]();
  }
}

(window as unknown as any)._setBrushSet = setBrushSet;

/**
 Ensures that at least one brush instance of each brush tool type
 exists in the datalib
 * */
export function getBrushes(ctx: ToolContext, overrideDefaultBrushes = false) {
  let brushes = ctx.datalib.brush;

  for (let k in DefaultBrushes) {
    let found: SculptBrush | undefined = undefined;
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
      let b2 = ctx.datalib.get<SculptBrush>(oname);

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

(window as unknown as any)._getBrushes = getBrushes;