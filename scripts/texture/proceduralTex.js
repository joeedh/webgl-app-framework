import {Icons} from "../editors/icon_enum.js";
import {
  EnumProperty, Curve1D, SplineTemplates, nstructjs, Vec3Property, FloatProperty, Vec4Property, Vec2Property
} from "../path.ux/scripts/pathux.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {DataBlock, BlockFlags} from "../core/lib_api.js";
import {GraphFlags, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import {RecalcFlags} from '../mesh/mesh_base.js';

import {TextureShader, TextureShaderFlags} from './texture_base.js';
import {compileTexShaderJS} from './textureGen.js';
import './textures.js';
import {TexPaintShaderLib} from '../shaders/shaders.js';

export const PatternRecalcFlags = {
  PREVIEW: 1
};

let patterns_namemap = {};

export const Patterns = [];
export const PatternFlags = {
  SELECT: 1
};

let _dv_rets = util.cachering.fromConstructor(Vector3, 1024);
let out_temps = [0, 0, 0, 0, 0];
let eval_temps = new util.cachering(() => [new Array(5), new Vector3(), new Vector3(), 0.0, new Vector4()], 64);

export class PatternGen {
  constructor() {
    let def = this.constructor.patternDefine();

    this.flag = def.flag !== undefined ? def.flag : 0;
    this.name = def.defaultName !== undefined ? def.defaultName : "pattern";
  }

  static safeFloat(f) {
    f = "" + f;
    if (f.search(/\./) < 0) {
      f += ".0";
    }

    return f;
  }

  static patternDefine() {
    return {
      typeName   : "",
      uiName     : "",
      defaultName: "",
      icon       : -1,
      flag       : 0,
      uniforms   : {},
    }
  }

  static defineAPI(api) {
    let st = api.mapStruct(this, true);

    st.flags("flag", "flag", PatternFlags, "Flag");
    st.string("name", "name", "Name");

    return st;
  }

  //container.pathPrefix is set to point to correct location
  static buildSettings(container) {

  }

  static getGeneratorClass(name) {
    return patterns_namemap[name];
  }

  static register(cls) {
    if (!cls.structName) {
      throw new Error("You forgot to register " + cls.name + " with nstructjs");
    }

    if (cls.patternDefine().typeName in patterns_namemap) {
      throw new Error("Pattern " + cls.name + " does not have a unique typeName in its patternDefine");
    }

    patterns_namemap[cls.patternDefine().typeName] = cls;
    Patterns.push(cls);
  }

  genTexShader() {
    let base = this;

    let uniforms = {
      angle: 0.0,
    };

    this.bindUniforms(uniforms);

    for (let k in uniforms) {
      let v = uniforms[k];

      if (typeof v === "number" || typeof v === "boolean") {
        v = new FloatProperty(v);
        uniforms[k] = v;
      } else if (Array.isArray(v)) {
        switch (v.length) {
          case 2:
            v = new Vec2Property(v);
            break;
          case 3:
            v = new Vec3Property(v);
            break;
          case 4:
            v = new Vec4Property(v);
            break;
          default:
            console.error("Texture uniform error", k, v);
        }

        uniforms[k] = v;
      }
    }

    class Shader extends TextureShader {
      static textureDefine() {

        return {
          flag       : TextureShaderFlags.HAS_COLOR,
          uniforms,
          params     : {
            inP: new Vec3Property()
          },
          fragmentPre: TexPaintShaderLib + "\n" + base.genGlslPre("Point", "Color", uniforms) + "\n"
        }
      }

      genCode() {
        let s = base.genGlsl("Point", "Color", uniforms);

        return `
float fsample(inout vec3 Point, inout vec3 Normal, float Time, inout vec4 Color) {
  ${s}
}        

        `;
      }
    }

    let shader = compileTexShaderJS(new Shader());
    this.texShaderJS = shader;

    let digest = new util.HashDigest();
    this.calcUpdateHash(digest, true);

    this.texShaderJSHash = digest.get();
    console.log("SHADER:", shader);
  }

  checkTexShaderJS() {
    let digest = new util.HashDigest();
    this.calcUpdateHash(digest, true);
    let hash = digest.get();

    if (!this.texShaderJS || hash !== this.texShaderJSHash) {
      this.genTexShader();
    }
  }

  genGlsl(inputP, outputC, uniforms) {
    console.error("Implement me! genGlsl!");
  }

  genGlslPre(inC, outP, uniforms = {}) {
    let uniforms2 = this.constructor.patternDefine().uniforms || {};

    let pre = '';

    for (let k in uniforms2) {
      let v = uniforms2[k];

      pre += `uniform ${v} ${k};\n`;
    }

    return pre;
  }

  bindUniforms(uniforms) {
    let uniforms2 = this.constructor.patternDefine().uniforms || {};

    let pre = '';

    for (let k in uniforms2) {
      uniforms[k] = this[k];
    }

    return this;
  }

  copy() {
    let ret = new this.constructor();

    this.copyTo(ret);

    return ret;
  }

  copyTo(b) {
    b.flag = this.flag;
  }

  calcUpdateHash(digest, recompileOnly) {
  }

  evaluate(co, color_out) {
    this.checkTexShaderJS();

    let args = eval_temps.next();

    //eek need to figure out time!
    //outs[3] = window.T;

    //debugger;

    args[1][0] = co[0];
    args[1][1] = co[1];
    args[1][2] = co[2];

    this.bindUniforms(this.texShaderJS);
    this.texShaderJS.call.apply(undefined, args);
    return args[0][this.texShaderJS.outputs.Color][0];
  }

  derivative(co) {
    let co2 = _dv_rets.next().load(co);
    let df = 0.00015;

    let a = this.evaluate(co);
    co2[0] += df;

    let b = this.evaluate(co2);
    co2.load(co);
    co2[1] += df;

    let c = this.evaluate(co2);
    co2.load(co);
    co2[2] += df;
    let d = this.evaluate(co2);

    df = 1.0/df;

    b.sub(a).mulScalar(df);
    c.sub(a).mulScalar(df);
    d.sub(a).mulScalar(df);

    co2[0] = b;
    co2[1] = c;
    co2[2] = d;

    return co2;
  }
}

PatternGen.STRUCT = `
PatternGen {
  flag : int;
  name : string;
}
`;
nstructjs.register(PatternGen);

let sntmps = util.cachering.fromConstructor(Vector3, 32);

function hash(f) {
  //return Math.fract(f*31.23423 + Math.fract(f*23324.2343));
  let sign = f < 0 ? -1 : 1;
  f *= sign;

  let f2 = (f - (~~f));
  f2 = sign < 0 ? 1.0 - f2 : f2;

  f = f*3.316624*128.0*f2;

  let sign2 = f < 0.0;
  f -= ~~f;

  if (sign2) {
    f = 1.0 - f;
  }

  //f = Math.fract(f*Math.sqrt(11.0)*Math.sin(f));

  return f;
  return Math.fract(1.0/Math.fract(0.00001*f + 0.00001));
}

function hash3(x, y, z) {
  let f = x*Math.sqrt(3.0) + y*Math.sqrt(5.0)*10.0 + z*Math.sqrt(7.0)*100.0;
  return hash(f);
  //return hash(x*y*z + x*x + y*y + z*x);
}

export class SimpleNoise extends PatternGen {
  constructor() {
    super();

    this.levels = 5;
    this.levelScale = 3.0;

    this.factor = 0.0;

    //for debugging purposes
    this.zoff = 0.0;
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.float("zoff", "zoff", "Zoffs").noUnits().range(-100, 100);
    st.float("levels", "levels", "Levels").noUnits().range(1, 15);
    st.float("levelScale", "levelScale", "Level Scale").noUnits().range(0.001, 10.0);
    st.float("factor", "factor", "factor").noUnits().range(0.0, 1.0);
  }

  static buildSettings(container) {
    container.prop("levels");
    container.prop("levelScale");
    container.prop("factor");

    container.prop("zoff");
  }

  static patternDefine() {
    return {
      typeName   : "SimpleNoise",
      defaultName: "noise",
      uiName     : "Noise",
    }
  }

  copyTo(b) {
    super.copyTo(b);

    b.levels = this.levels;
    b.levelScale = this.levelScale;
    b.zoff = this.zoff;
    b.factor = this.factor;
  }

  calcUpdateHash(digest, recompileOnly) {
    digest.add(this.levels);
    digest.add(this.levelScale);
    digest.add(this.zoff);
    digest.add(this.factor);
  }

  evaluate(co) {
    co = sntmps.next().load(co);

    let scale = Math.pow(this.levelScale, this.levels);
    let f = this.evaluate_intern(co, scale);

    let f1 = f;
    let f2 = f;
    let tot = 1.0;

    let lscale = 1.0/this.levelScale;

    for (let i = 0; i < this.levels; i++) {
      let rf = i + 1;

      co[0] += hash(rf)*1024.23432;
      co[1] += hash(rf + 0.234)*1024.523;
      co[2] += hash(rf + 0.345)*1024.234;

      scale *= lscale;

      let f3 = this.evaluate_intern(co, scale);

      f1 *= f3;
      f2 += f3;

      tot++;
    }

    if (tot === 0.0) {
      return 0.0;
    }

    f1 = Math.pow(f1, 1.0/tot);
    f2 /= tot;

    return f1 + (f2 - f1)*this.factor;
  }

  evaluate_intern(co, scale) {
    let x = co[0]*scale;
    let y = co[1]*scale;
    let z = co[2]*scale + this.zoff;

    let u = Math.fract(x);
    let v = Math.fract(y);
    let w = Math.fract(z);

    function hash3(x, y, z) {
      let f = x*Math.sqrt(3.0) + y*Math.sqrt(5.0)*10.0 + z*Math.sqrt(7.0)*100.0;
      return Math.fract(hash(f));
      //return hash(x*y*z + x*x + y*y + z*x);
    }

    let cx = Math.floor(x);
    let cy = Math.floor(y);
    let cz = Math.floor(z);

    let h1 = hash3(cx, cy, cz);

    let h2 = hash3(cx, cy + 1, cz);
    let h3 = hash3(cx + 1, cy + 1, cz);
    let h4 = hash3(cx + 1, cy, cz);

    let h5 = hash3(cx, cy, cz + 1);
    let h6 = hash3(cx, cy + 1, cz + 1);
    let h7 = hash3(cx + 1, cy + 1, cz + 1);
    let h8 = hash3(cx + 1, cy, cz + 1);

    u = u*u*(3.0 - 2.0*u);
    v = v*v*(3.0 - 2.0*v);
    w = w*w*(3.0 - 2.0*w);

    let a = h1 + (h2 - h1)*v;
    let b = h4 + (h3 - h4)*v;
    let r1 = a + (b - a)*u;

    let c = h5 + (h6 - h5)*v;
    let d = h8 + (h7 - h8)*v;
    let r2 = c + (d - c)*u;

    return r1 + (r2 - r1)*w;
  }
}

SimpleNoise.STRUCT = nstructjs.inherit(SimpleNoise, PatternGen) + `
  levels     : float;
  levelScale : float;
  zoff       : float;
  factor     : float;
}`;
PatternGen.register(SimpleNoise);
nstructjs.register(SimpleNoise);

let mevals = util.cachering.fromConstructor(Vector3, 64);

export class MoireNoise extends PatternGen {
  constructor() {
    super();

    this.dynamicAngle = false;
    this.angleOffset = 0.0;
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.bool("dynamicAngle", "dynamicAngle", "Rake Mode");
    st.float("angleOffset", "angleOffset", "Angle")
      .displayUnit("degree")
      .baseUnit("radian")
      .range(-Math.PI*2, Math.PI*2);

    return st;
  }

  static buildSettings(container) {
    container.prop("angleOffset");
    container.prop("dynamicAngle");
  }

  static patternDefine() {
    return {
      typeName   : "MoireNoise",
      defaultName: "Moire",
      uiName     : "Moire",
      uniforms   : {
        angleOffset: "float"
      }
    }
  }

  copyTo(b) {
    super.copyTo(b);

    b.dynamicAngle = this.dynamicAngle;
    b.angleOffset = this.angleOffset;
  }

  calcUpdateHash(digest, recompileOnly) {
    digest.add(this.dynamicAngle);
    digest.add(this.angleOffset);
  }

  genGlsl(inputP, outputC, uniforms) {
    let th = PatternGen.safeFloat(this.angleOffset);

    if (uniforms.brushAngle !== undefined) {
      th = `(${th} + brushAngle)`;
    }

    return `
  
  
  vec3 p = ${inputP};
  vec2 p2 = rot2d(p.xy, ${th});
  
  float dx1 = 1.0 - abs(fract(p2.x)-0.5)*2.0;
  float dy1 = 1.0 - abs(fract(p2.y)-0.5)*2.0;
  float dx2 = 1.0 - abs(fract(p.x)-0.5)*2.0;
  float dy2 = 1.0 - abs(fract(p.y)-0.5)*2.0;
  
  //float f = pow(dx1*dy1*dx2*dy2, 1.0/4.0);
  float f = (dx1+dx2+dy1+dy2)*0.25;
  
  f = cos(f*13.11432)*0.5 + 0.5;
  
  ${outputC} = vec4(f, f, f, 1.0);
`
  }

  evaluate(co, dv_out) {
    let p = mevals.next().load(co);
    let p2 = mevals.next().load(co);

    p.mulScalar(5.0);

    p2.rot2d(this.angleOffset);

    let fract = Math.fract, abs = Math.abs, cos = Math.cos;

    const dx1 = 1.0 - abs(fract(p2[0]) - 0.5)*2.0;
    const dy1 = 1.0 - abs(fract(p2[1]) - 0.5)*2.0;
    const dx2 = 1.0 - abs(fract(p[0]) - 0.5)*2.0;
    const dy2 = 1.0 - abs(fract(p[1]) - 0.5)*2.0;

    //let f = pow(dx1*dy1*dx2*dy2, 1.0/4.0);
    let f = (dx1 + dx2 + dy1 + dy2)*0.25;

    f = cos(f*13.11432)*0.5 + 0.5;

    return f;
  }
}

MoireNoise.STRUCT = nstructjs.inherit(MoireNoise, PatternGen) + `
  dynamicAngle : bool;
  angleOffset  : float; 
};`
PatternGen.register(MoireNoise);

export const CombModes = {
  SAW     : 0,
  TENT    : 1,
  SIN     : 2,
  STEP    : 3,
  DOME    : 4,
  RAW_STEP: 5,
};

let ModeFuncs = {
  [CombModes.SAW]     : Math.fract,
  [CombModes.TENT]    : Math.tent,
  [CombModes.SIN]     : (f) => Math.sin(f*Math.PI*2.0)*0.5 + 0.5,
  [CombModes.RAW_STEP]: (f) => Math.fract(f) > 0.5 ? 1.0 : 0.0,
  [CombModes.DOME]    : f => Math.abs(Math.sin(f*Math.PI*2.0)),
  [CombModes.STEP]    : (f) => {
    f = Math.tent(f);
    f = f*2.0;

    f = Math.min(Math.max(f, 0.0), 1.0);

    return f;
  }
};

export class CombPattern extends PatternGen {
  constructor() {
    super();

    this.count = 1;
    this.angleOffset = 0.0;
    this.mode = CombModes.STEP;
    this.combWidth = 0.5;
    this.blackPoint = 0.5;
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.enum("mode", "mode", CombModes, "Mode");

    st.float("angleOffset", "angleOffset", "Angle")
      .displayUnit("degree")
      .baseUnit("radian")
      .range(-Math.PI*2, Math.PI*2);

    st.float("combWidth", "combWidth", "Width", "Comb Width")
      .range(0.0, 1.0)
      .step(0.01)
      .noUnits();

    st.float("blackPoint", "blackPoint", "Black Point")
      .range(0.0, 1.0)
      .step(0.1)
      .noUnits();

    st.float("count", "count", "Count", "Number of strokes")
      .range(1.0, 5.0)
      .step(0.15)
      .noUnits();

    return st;
  }

  static buildSettings(container) {
    container.prop("mode");
    container.prop("count");
    container.prop("angleOffset");
    container.prop("combWidth");
    container.prop("blackPoint");
  }

  static patternDefine() {
    return {
      typeName   : "CombPattern",
      defaultName: "Comb",
      uiName     : "Comb",
      uniforms   : {
        angleOffset: "float",
        count      : "float",
        combWidth  : "float",
        blackPoint : "float"
      }
    }
  }

  copyTo(b) {
    super.copyTo(b);

    b.blackPoint = this.blackPoint;
    b.count = this.count;
    b.mode = this.mode;
    b.combWidth = this.combWidth;
    b.angleOffset = this.angleOffset;
  }

  bindUniforms(uniforms) {
    uniforms.blackPoint = this.blackPoint;
    uniforms.combWidth = this.combWidth;
    uniforms.count = this.count;
    uniforms.angleOffset = this.angleOffset;
  }

  calcUpdateHash(digest, recompileOnly=false) {
    digest.add(this.angleOffset);
    digest.add(this.mode);

    if (!recompileOnly) {
      digest.add(this.blackPoint);
      digest.add(this.count);
      digest.add(this.combWidth);
    }
  }

  genGlsl(inputP, outputC, uniforms) {
    let th = PatternGen.safeFloat(this.angleOffset);
    let line;

    let pi2 = Math.PI*2.0;

    switch (this.mode) {
      case CombModes.SAW:
        line = `float f = fract(p.x*count);`;
        break;

      default:
      case CombModes.TENT:
        line = `float f = tent(p.x*count);`;
        break;
      case CombModes.SIN:
        line = `float f = sin(p.x*count*${pi2})*0.5 + 0.5;`;
        break;
      case CombModes.STEP:
        line = `float f = fract(p.x*count) > 0.5 ? 1.0 : 0.0;`;
        break;
      case CombModes.DOME:
        line = `float f = abs(sin(p.x*count*${pi2}));`;
        break;


    }


    if (uniforms.angle !== undefined) {
      th = `(${th} + angle)`;
    }

    return `
  
  
  vec3 p = ${inputP};
  vec2 p2 = rot2d(p.xy, ${th});

  ${line}
  
  ${outputC} = vec4(f, f, f, 1.0);
`
  }

  evaluate(co, dv_out) {
    return super.evaluate(co, dv_out);
    /*
    let d = co[0]*co[0] + co[1]*co[1];
    d = 1.0 - Math.sqrt(d);
    d = Math.fract(d);
    return d;
    //*/

    let p = mevals.next().load(co);
    p.rot2d(this.angleOffset);

    let f = Math.fract(p[0]*this.count);
    let cwid = 1.0 - this.combWidth;

    f = Math.min(f*(1.0 + cwid), 1.0);

    let b = this.blackPoint;

    return ModeFuncs[this.mode](f)*(1.0 - b) + b;
  }
}

CombPattern.STRUCT = nstructjs.inherit(CombPattern, PatternGen) + `
  angleOffset  : float; 
  count        : float;
  mode         : int;
  combWidth    : float;
  blackPoint   : float;
}`
PatternGen.register(CombPattern);
nstructjs.register(CombPattern);

export class GaborNoise extends PatternGen {
  constructor() {
    super();

    this.levels = 5;
    this.levelScale = 3.0;

    this.factor = 0.0;
    this.randomness = 0.5;
    this.decayPower = 0.5;
    this.decay2 = 0.5;

    //for debugging purposes
    this.zoff = 0.0;
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.float("zoff", "zoff", "Zoffs").noUnits().range(-100, 100);
    st.float("levels", "levels", "Levels").noUnits().range(1, 15);
    st.float("levelScale", "levelScale", "Level Scale").noUnits().range(0.001, 10.0);
    st.float("factor", "factor", "factor").noUnits().range(0.0, 1.0);
    st.float("randomness", "randomness", "randomness").noUnits().range(0.0, 1.0);
    st.float("decayPower", "decayPower", "Decay Power").noUnits().range(0.001, 4.0);
    st.float("decay2", "decay2", "Decay 2").noUnits().range(0.001, 4.0).step(0.003);
  }

  static buildSettings(container) {
    container.prop("levels");
    container.prop("levelScale");
    container.prop("factor");
    container.prop("randomness");
    container.prop("decayPower");
    container.prop("decay2");

    container.prop("zoff");
  }

  static patternDefine() {
    return {
      typeName   : "GaborNoise",
      defaultName: "Gabor",
      uiName     : "Gabor",
    }
  }

  copyTo(b) {
    super.copyTo(b);

    b.levels = this.levels;
    b.levelScale = this.levelScale;
    b.zoff = this.zoff;
    b.factor = this.factor;
    b.randomness = this.randomness;
    b.decayPower = this.decayPower;
    b.decay2 = this.decay2;
  }

  calcUpdateHash(digest, recompileOnly=false) {
    digest.add(this.levels);
    digest.add(this.levelScale);
    digest.add(this.zoff);
    digest.add(this.factor);
    digest.add(this.randomness);
    digest.add(this.decayPower);
    digest.add(this.decay2);
  }

  evaluate(co) {
    co = sntmps.next().load(co);

    let scale = 5.0;//*Math.pow(this.levelScale, this.levels);
    let f = this.evaluate_intern(co, scale);

    return f;
    let f1 = f;
    let f2 = 0.0;
    let tot = 1.0;

    let lscale = 1.0/this.levelScale;

    for (let i = 0; i < this.levels; i++) {
      let rf = i + 1;

      co[0] += hash(rf)*1024.0;
      co[1] += hash(rf + 0.234)*1024.0;
      co[2] += hash(rf + 0.345)*1024.0;

      scale *= lscale;

      let f3 = this.evaluate_intern(co, scale);
      f1 *= f3;
      f2 += f3;
      tot++;
    }

    f1 = Math.pow(f1, 1.0/tot);
    f2 /= tot;

    return f1 + (f2 - f1)*this.factor;
  }

  evaluate_intern(co, scale) {
    let x = co[0]*scale;
    let y = co[1]*scale;
    let z = co[2]*scale + this.zoff;

    let f = 0.0;
    let tot = 0.0;

    /*

    f := exp(-decay2*r2);
    ff := solve(f-goal, r2);
    ff := part(ff, 1, 2);
    ff := sub(i=0, ff);

    sub(goal=0.1, decay2=1.0, ff);
    **/


    let err = 0.1;
    let decay2 = this.decay2*2.0;

    let steps = Math.log(1.0/err)/decay2;
    steps = Math.ceil(steps);
    steps = Math.min(Math.max(steps, 1), 3);

    let n = steps;
    let n2 = n*n*2.0;
    let mul = 1.0/n2;

    let ix1 = Math.floor(x);
    let iy1 = Math.floor(y);
    let iz1 = Math.floor(z);

    let factor = this.factor*10.0 + 1.0;
    let rfac = this.randomness;
    let efac = this.decayPower;

    f = 0.0;
    let fmax = 0.0;

    outer: for (let ix = -n; ix <= n; ix++) {
      for (let iy = -n; iy <= n; iy++) {
        for (let iz = -n; iz <= n; iz++) {
          let ix2 = ix1 + ix;
          let iy2 = iy1 + iy;
          let iz2 = iz1 + iz;

          let rx = hash3(ix2, iy2, iz2) - 0.5;
          let ry = hash3(ix2 + 0.234, iy2 + 0.2343, iz2 + 0.63434) - 0.5;
          let rz = hash3(ix2 - 0.274, iy2 + 0.83432, iz2 + 0.123523) - 0.5;

          ix2 += rx*rfac;
          iy2 += ry*rfac;
          iz2 += rz*rfac;

          let dx = x - ix2;
          let dy = y - iy2;
          let dz = z - iz2;

          let dis = ((dx*dx + dy*dy + dz*dz)*mul);
          //dis = Math.min(Math.min(dx*dx, dy*dy), dz*dz)*mul;

          //dx = Math.tent(dx);
          //dy = Math.tent(dy);
          //dz = Math.tent(dz);
          //dis = (dx+dy+dz)/3.0;
          //dis *= dis;

          let dis2 = dis;

          let w = Math.exp(-dis2*decay2);

          dis = dis**efac;

          let f2 = 1.0 - Math.abs(Math.fract(dis*factor) - 0.5)*2.0;

          //f2 = f2*f2*(3.0 - 2.0*f2);

          f += f2*w;
          tot += w;
        }
      }
    }

    //tot = Math.max(tot, 0.0001);
    f /= tot;
    //f = fmax;
    //f = Math.pow(f, 1.0 / tot);

    f = f*1.8;
    return f*f*f*f;

    let u = Math.fract(x);
    let v = Math.fract(y);
    let w = Math.fract(z);


  }
}

GaborNoise.STRUCT = nstructjs.inherit(GaborNoise, PatternGen) + `
  levels     : float;
  levelScale : float;
  zoff       : float;
  factor     : float;
  randomness : float;
  decayPower : float;
  decay2     : float;
}`;
PatternGen.register(GaborNoise);
nstructjs.register(GaborNoise);


let evalcos = util.cachering.fromConstructor(Vector3, 512);
let dvcos = util.cachering.fromConstructor(Vector3, 512);

export class ProceduralTex extends DataBlock {
  constructor() {
    super();

    this.updateGen = 0;

    this.generators = []; //stored generator instances
    this.generator = undefined;

    this.scale = 1.0;
    this.power = 1.0;
    this.brightness = 0.0;
    this.contrast = 1.0;

    this.setGenerator(SimpleNoise);

    this.recalcFlag = PatternRecalcFlags.PREVIEW;
    this.previews = [];

    this._last_update_hash = undefined;
    this._digest = new util.HashDigest();
  }

  static getPattern(index_or_typename_or_class) {
    let cls = index_or_typename_or_class;

    if (typeof cls === "string") {
      for (let cls2 of Patterns) {
        if (cls2.patternDefine().typeName === cls) {
          return cls2;
        }
      }

      return undefined;
    } else if (typeof cls === "number") {
      return Patterns[cls];
    } else {
      return Patterns.indexOf(cls) >= 0 ? cls : undefined;
    }
  }

  static buildGeneratorEnum() {
    let enumdef = {};
    let uinames = {};
    let icons = {};
    let i = 0;

    for (let cls of Patterns) {
      let def = cls.patternDefine();

      enumdef[def.typeName] = i;
      uinames[def.typeName] = def.uiName;
      icons[def.typeName] = def.icon;

      i++;
    }

    return new EnumProperty(0, enumdef).addUINames(uinames).addIcons(icons);
  }

  static blockDefine() {
    return {
      typeName   : "texture",
      uiName     : "Texture",
      defaultName: "Texture",
      icon       : Icons.RENDER
    }
  }

  static nodedef() {
    return {
      name   : "texture",
      uiname : "Texture",
      flag   : NodeFlags.SAVE_PROXY,
      inputs : {
        depend: new DependSocket()
      },
      outputs: {
        depend: new DependSocket()
      }
    }
  }

  calcMemSize() {
    return 1024; //just assume a large-ish block of memory
  }

  bindUniforms(uniforms) {
    uniforms["texScale"] = this.scale;
    uniforms["texBrightness"] = this.brightness;
    uniforms["texContrast"] = this.contrast;
    uniforms["texPower"] = this.power;

    this.generator.bindUniforms(uniforms);
  }

  genGlsl(inP, outC, uniforms = {}) {
    uniforms = Object.assign({}, uniforms);
    this.bindUniforms(uniforms);

    return this.generator.genGlsl(inP, outC, uniforms);
  }

  genGlslPre(inP, outC, uniforms = {}) {
    uniforms = Object.assign({}, uniforms);
    this.bindUniforms(uniforms);

    return `
uniform float texScale;
uniform float texBrightness;
uniform float texContrast;
uniform float texPower;
    ` + this.generator.genGlslPre(inP, outC, uniforms);
  }

  copyTo(b, nonDataBlockMode = false) {
    if (!nonDataBlockMode) {
      super.copyTo(b);
    }

    b.generators.length = 0;
    b.generator = undefined;

    for (let gen of this.generators) {
      let gen2 = gen.copy();

      b.generators.push(gen2);
    }

    b.setGenerator(this.generator.constructor);

    b.scale = this.scale;
    b.power = this.power;
    b.brightness = this.brightness;
    b.contrast = this.contrast;

    b.previews = this.previews.concat([]); //reuse preview instances
    b.recalcFlag = this.recalcFlag;
  }

  update() {
    let digest = this._digest.reset();

    this.generator.calcUpdateHash(digest);

    digest.add(this.scale);
    digest.add(this.power);
    digest.add(this.updateGen);
    digest.add(this.brightness);
    digest.add(this.contrast);

    let hash = digest.get();

    if (hash !== this._last_update_hash) {
      this.recalcFlag |= PatternRecalcFlags.PREVIEW;
      this._last_update_hash = hash;
      return true;
    }

    return false;
  }

  buildSettings(container) {
    container.prop("scale");
    container.prop("brightness");
    container.prop("contrast");
    container.prop("power");

    if (this.generator) {
      let prefix = container.dataPrefix;
      container.dataPrefix += ".generator";

      this.generator.constructor.buildSettings(container);

      container.dataPrefix = prefix;
    }
  }

  getPreview(width, height) {
    if (this.recalcFlag & PatternRecalcFlags.PREVIEW) {
      this.previews.length = 0;
      this.recalcFlag &= ~PatternRecalcFlags.PREVIEW;
    }

    for (let p of this.previews) {
      if (p.width === width && p.height === height) {
        return p;
      }
    }

    let p = this.genPreview(width, height);
    this.previews.push(p);

    return p;
  }

  genPreview(width, height) {
    console.log("generating texture preview");

    let image = new ImageData(width, height);
    let idata = image.data;

    let gen = this.generator;
    let co = new Vector3();

    for (let i = 0; i < width*height; i++) {
      let ix = i%width, iy = ~~(i/height);
      let x = ix/width, y = iy/height;

      let idx = i*4;

      co[0] = x;
      co[1] = y;

      let f = this.evaluate(co);

      idata[idx] = idata[idx + 1] = idata[idx + 2] = ~~(f*255);
      idata[idx + 3] = 255;
    }

    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    g.putImageData(image, 0, 0);

    return canvas;
  }

  getGenerator(cls) {
    for (let gen of this.generators) {
      if (gen.constructor === cls) {
        return gen;
      }
    }

    let gen = new cls();
    this.generators.push(gen);

    return gen;
  }

  setGenerator(cls) {
    this.generator = this.getGenerator(cls);

    return this;
  }

  evaluate(co, scale = 1.0) {
    co = evalcos.next().load(co);
    co.mulScalar(this.scale*scale);

    let f = this.generator.evaluate(co);
    f *= this.contrast;
    f = Math.pow(f, this.power) + this.brightness;

    return f;
  }

  derivative(co1, scale) {
    let co = evalcos.next().load(co1);

    let a = this.evaluate(co, scale);

    let df = 0.00001;
    co[0] += df;
    let b = this.evaluate(co, scale);

    co.load(co1);
    co[1] += df;
    let c = this.evaluate(co, scale);

    co.load(co1);
    co[2] += df;
    let d = this.evaluate(co, scale);

    let dv = dvcos.next();

    dv[0] = (b - a)/df;
    dv[1] = (c - a)/df;
    dv[2] = (d - a)/df;

    return dv;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    if (this.generator === "") {
      console.warn("failed to read active generator");

      if (this.generators.length > 0) {
        this.setGenerator(this.generators[0].constructor);
      } else {
        this.setGenerator(SimpleNoise);
      }
    } else {
      let gen = this.generator;
      this.generator = undefined;

      for (let cls of Patterns) {
        if (cls.patternDefine().typeName === gen) {
          this.setGenerator(cls);
        }
      }

      if (!this.generator) {
        this.setGenerator(Patterns[0]);
      }
    }
  }
}

ProceduralTex.STRUCT = nstructjs.inherit(ProceduralTex, DataBlock) + `
  scale         : float;
  power         : float;
  brightness    : float;
  contrast      : float;
  generators    : array(abstract(PatternGen));
  generator     : string | this.generator ? this.generator.constructor.patternDefine().typeName : "";  
}
`;
nstructjs.register(ProceduralTex);
DataBlock.register(ProceduralTex);

export const TexUserFlags = {
  SELECT       : 1,
  RAKE         : 2,
  CONSTANT_SIZE: 4,
  FANCY_RAKE   : 8,
  ORIGINAL_CO  : 16
};

export const TexUserModes = {
  GLOBAL     : 0,
  VIEWPLANE  : 1,
  VIEW_REPEAT: 2,
};

let _udigest = new util.HashDigest();
let cotmp = new Vector3();

export class ProceduralTexUser {
  constructor() {
    this.texture = undefined;
    this.scale = 1.0;
    this.mode = TexUserModes.GLOBAL;
    this.flag = 0; //see TexUserFlags
    this.pinch = 0.0;
  }

  sample(co, texScale, angle, rendermat, screen_origin, aspect, dv_out) {
    if (this.mode === TexUserModes.VIEWPLANE || this.mode === TexUserModes.VIEW_REPEAT) {
      cotmp.load(co).multVecMatrix(rendermat);

      if (screen_origin) {
        cotmp.sub(screen_origin);
      }

      cotmp[0] *= aspect;

      if (this.flag & TexUserFlags.RAKE) {
        cotmp.rot2d(-angle);
      }

      co = cotmp;
    }

    if (dv_out) {
      dv_out.load(this.texture.derivative(co, texScale));
    }

    return this.texture.evaluate(co, texScale);
  }

  copyTo(b) {
    b.texture = this.texture;
    b.scale = this.scale;
    b.mode = this.mode;
    b.flag = this.flag;
    b.pinch = this.pinch;
  }

  copy() {
    let ret = new ProceduralTexUser();
    this.copyTo(ret);
    return ret;
  }

  equals(b) {
    let r = this.texture === b.texture;

    function feq(a, b) {
      return Math.abs(a - b) < 0.00001;
    }

    r = r && feq(this.scale, b.scale);
    r = r && this.mode === b.mode;
    r = r && this.flag === b.flag;
    r = r && feq(this.pinch, b.pinch);

    return r;
  }

  calcHashKey(digest = _udigest) {
    let d = digest;

    d.add(this.scale);
    d.add(this.texture ? this.texture.lib_id : -1);
    d.add(this.mode);
    d.add(this.flag);
    d.add(this.pinch);

    return d.get();
  }

  dataLink(owner, getblock, getblock_adduser) {
    if (this.texture !== undefined) {
      this.texture = getblock_adduser(this.texture, owner);
    }
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

ProceduralTexUser.STRUCT = `
ProceduralTexUser {
  texture : DataRef | DataRef.fromBlock(this.texture);
  flag    : int;
  mode    : int;
  scale   : float;
  pinch   : float;
}
`
nstructjs.register(ProceduralTexUser);


export function buildProcTextureAPI(api, api_define_datablock) {
  for (let cls of Patterns) {
    cls.defineAPI(api);
  }

  let st = api_define_datablock(api, ProceduralTex);

  let onchange = function () {
    this.dataref.updateGen++;
    this.dataref.graphUpdate();
  }

  let prop = ProceduralTex.buildGeneratorEnum();
  st.enum("mode", "mode", prop, "Mode").on('change', function () {
    let tex = this.dataref;
    tex.recalcFlag |= PatternRecalcFlags.PREVIEW;
  }).customGetSet(function () {
    let tex = this.dataref;

    return tex.generator.constructor.patternDefine().typeName;
  }, function (val) {
    let tex = this.dataref;

    let cls;

    if (typeof val === "string") {
      cls = PatternGen.getGeneratorClass(val);
    } else {
      cls = Patterns[val];
    }

    tex.setGenerator(cls);
  });

  st.float("scale", "scale", "Scale").noUnits().range(0.001, 2000.0).on('change', onchange);
  st.float("power", "power", "Exp").noUnits().range(0.001, 100.0).on('change', onchange);
  st.float("brightness", "brightness", "Brightness").noUnits().range(-5.0, 5.0).on('change', onchange);
  st.float("contrast", "contrast", "Contrast").noUnits().range(0.001, 100.0).on('change', onchange);

  st.dynamicStruct("generator", "generator", "Generator");

  let onch = function () {
    let texuser = this.dataref;

    if (texuser.texture) {
      texuser.texture.graphUpdate();
    }
  }

  let userst = api.mapStruct(ProceduralTexUser, true);

  userst.flags("flag", "flag", TexUserFlags, "flag").descriptions(
    {
      CONSTANT_SIZE: "Use constant instead of brush size in 'View Repeat' mode"
    }
  );

  userst.enum("mode", "mode", TexUserModes, "Mode");
  userst.struct("texture", "texture", "Texture", st);
  userst.float("scale", "scale", "Scale").noUnits().range(0.0001, 1000.0).on('change', onch);
  userst.float("pinch", "pinch", "Tex Pinch").noUnits().range(-1.0, 1.0);

  return st;
}

