import {Icons} from "../editors/icon_enum.js";
import {EnumProperty, Curve1D, SplineTemplates, nstructjs} from "../path.ux/scripts/pathux.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {DataBlock, BlockFlags} from "../core/lib_api.js";
import {GraphFlags, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import {RecalcFlags} from '../mesh/mesh_base.js';

export const PatternRecalcFlags = {
  PREVIEW: 1
};

let patterns_namemap = {};

export const Patterns = [];
export const PatternFlags = {
  SELECT: 1
};

let _dv_rets = util.cachering.fromConstructor(Vector3, 1024);

export class PatternGen {
  constructor() {
    let def = this.constructor.patternDefine();

    this.flag = def.flag !== undefined ? def.flag : 0;
    this.name = def.defaultName !== undefined ? def.defaultName : "pattern";
  }

  static patternDefine() {
    return {
      typeName   : "",
      uiName     : "",
      defaultName: "",
      icon       : -1,
      flag       : 0
    }
  }

  copy() {
    let ret = new this.constructor();

    this.copyTo(ret);

    return ret;
  }

  copyTo(b) {
    b.flag = this.flag;
  }

  calcUpdateHash(digest) {
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

  evaluate(co, color_out) {
    throw new Error("implement me!");
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

  copyTo(b) {
    super.copyTo(b);

    b.levels = this.levels;
    b.levelScale = this.levelScale;
    b.zoff = this.zoff;
    b.factor = this.factor;
  }

  calcUpdateHash(digest) {
    digest.add(this.levels);
    digest.add(this.levelScale);
    digest.add(this.zoff);
    digest.add(this.factor);
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

  evaluate(co) {
    co = sntmps.next().load(co);

    let scale = Math.pow(this.levelScale, this.levels);
    let f = this.evaluate_intern(co, scale);

    let f1 = f;
    let f2 = f;
    let tot = 1.0;

    let lscale = 1.0 / this.levelScale;

    for (let i=0; i<this.levels; i++) {
      let rf = i+1;

      co[0] += hash(rf)*1024.23432;
      co[1] += hash(rf+0.234)*1024.523;
      co[2] += hash(rf+0.345)*1024.234;

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

    let u = Math.fract(x);
    let v = Math.fract(y);
    let w = Math.fract(z);

    function hash3(x, y, z) {
      let f = x*Math.sqrt(3.0) + y*Math.sqrt(5.0)*10.0 + z*Math.sqrt(7.0)*100.0;
      return hash(f);
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

  static patternDefine() {
    return {
      typeName   : "SimpleNoise",
      defaultName: "noise",
      uiName     : "Noise",
    }
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

  calcUpdateHash(digest) {
    digest.add(this.levels);
    digest.add(this.levelScale);
    digest.add(this.zoff);
    digest.add(this.factor);
    digest.add(this.randomness);
    digest.add(this.decayPower);
    digest.add(this.decay2);
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

  evaluate(co) {
    co = sntmps.next().load(co);

    let scale = 5.0;//*Math.pow(this.levelScale, this.levels);
    let f = this.evaluate_intern(co, scale);

    return f;
    let f1 = f;
    let f2 = 0.0;
    let tot = 1.0;

    let lscale = 1.0 / this.levelScale;

    for (let i=0; i<this.levels; i++) {
      let rf = i+1;

      co[0] += hash(rf)*1024.0;
      co[1] += hash(rf+0.234)*1024.0;
      co[2] += hash(rf+0.345)*1024.0;

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

    let steps = Math.log(1.0 / err) / decay2;
    steps = Math.ceil(steps);
    steps = Math.min(Math.max(steps, 1), 3);

    let n = steps;
    let n2 = n*n*2.0;
    let mul = 1.0 / n2;

    let ix1 = Math.floor(x);
    let iy1 = Math.floor(y);
    let iz1 = Math.floor(z);

    let factor = this.factor*10.0 + 1.0;
    let rfac = this.randomness;
    let efac = this.decayPower;

    f = 0.0;
    let fmax = 0.0;

    outer: for (let ix=-n; ix<=n; ix++) {
      for (let iy=-n; iy<=n; iy++) {
        for (let iz=-n; iz<=n; iz++) {
          let ix2 = ix1 + ix;
          let iy2 = iy1 + iy;
          let iz2 = iz1 + iz;

          let rx = hash3(ix2, iy2, iz2)-0.5;
          let ry = hash3(ix2+0.234, iy2+0.2343, iz2+0.63434)-0.5;
          let rz = hash3(ix2-0.274, iy2+0.83432, iz2+0.123523)-0.5;

          ix2 += rx*rfac;
          iy2 += ry*rfac;
          iz2 += rz*rfac;

          let dx = x - ix2;
          let dy = y - iy2;
          let dz = z - iz2;

          let dis = ((dx*dx + dy*dy + dz*dz) * mul);
          //dis = Math.min(Math.min(dx*dx, dy*dy), dz*dz)*mul;

          //dx = Math.tent(dx);
          //dy = Math.tent(dy);
          //dz = Math.tent(dz);
          //dis = (dx+dy+dz)/3.0;
          //dis *= dis;

          let dis2 = dis;

          let w = Math.exp(-dis2*decay2);

          dis = dis**efac;

          let f2 = 1.0 - Math.abs(Math.fract(dis*factor)-0.5)*2.0;

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

  static patternDefine() {
    return {
      typeName   : "GaborNoise",
      defaultName: "Gabor",
      uiName     : "Gabor",
    }
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


let evalcos = util.cachering.fromConstructor(Vector3, 64);

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

  copyTo(b, nonDataBlockMode=false) {
    if (!nonDataBlockMode) {
      super.copyTo(b);
    }

    b.generators.length = 0;
    b.generator = undefined;

    for (let gen of this.generators) {
      let gen2 = gen.copy();

      b.generators.push(gen2);
      if (gen === this.generator) {
        b.generator = gen2;
      }
    }

    b.scale = this.scale;
    b.power = this.power;
    b.brightness = this.brightness;
    b.contrast = this.contrast;

    b.previews = this.previews.concat([]); //reused preview instances
    b.recalcFlag = this.recalcFlag;
  }

  update() {
    let digest = this._digest.reset();

    this.generator.calcUpdateHash(digest);
    digest.add(this.scale);
    digest.add(this.power);
    digest.add(this.updateGen);

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

  evaluate(co, scale=1.0) {
    co = evalcos.next().load(co);
    co.mulScalar(this.scale*scale);

    let f = this.generator.evaluate(co);
    f *= this.contrast;
    f = Math.pow(f, this.power) + this.brightness;

    return f;
  }

  derivative(co) {
    return this.generator.derivative;
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
  RAKE : 1
};

export const TexUserModes = {
  GLOBAL : 0,
  VIEWPLANE : 1,
};

export class ProceduralTexUser {
  constructor() {
    this.texture = undefined;
    this.scale = 1.0;
    this.mode = TexUserModes.GLOBAL;
    this.flag = 0; //see TexUserFlags
  }

  copyTo(b) {
    b.texture = this.texture;
    b.scale = this.scale;
    b.mode = this.mode;
    b.flag = this.flag;
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
}
`
nstructjs.register(ProceduralTexUser);


export function buildProcTextureAPI(api, api_define_datablock) {
  for (let cls of Patterns) {
    cls.defineAPI(api);
  }

  let st = api_define_datablock(api, ProceduralTex);

  let onchange = function() {
    this.dataref.updateGen++;
    this.dataref.graphUpdate();
  }

  let prop = ProceduralTex.buildGeneratorEnum();
  st.enum("mode", "mode", prop, "Mode").on('change', function() {
    let tex = this.dataref;
    tex.recalcFlag |= PatternRecalcFlags.PREVIEW;
  }).customGetSet(function() {
    let tex = this.dataref;

    return tex.generator.constructor.patternDefine().typeName;
  }, function(val) {
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

  let onch = function() {
    let texuser = this.dataref;

    if (texuser.texture) {
      texuser.texture.graphUpdate();
    }
  }

  let userst = api.mapStruct(ProceduralTexUser, true);

  userst.flags("flag", "flag", TexUserFlags, "flag");
  userst.enum("mode", "mode", TexUserModes, "Mode");
  userst.struct("texture", "texture", "Texture", st);
  userst.float("scale", "scale", "Scale").noUnits().range(0.0001, 1000.0).on('change', onch);

  return st;
}

