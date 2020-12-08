import {Light, LightTypes} from '../light/light.js';
import {Vector3, Vector4, Matrix4, Vector2, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as webgl from '../core/webgl.js';

import * as bluenoise from './bluenoise_mask.js';

export let ClosureGLSL = `
struct Closure {
  vec3 diffuse;
  vec3 light;
  vec3 emission;
  vec3 scatter;
  float alpha;
};
`;

export let LightGenerators = [];

export class LightGen {
  constructor(args) {
    this.uniformName = args.uniformName;
    this.lightType = args.lightType;
    this.name = args.name;
    this.totname = args.totname;
    this.pre = args.pre;
    this.lightLoop = args.lightLoop;
    this.getLightVector = args.getLightVector;
    this.defines = args.defines;
  }

  static setUniforms(gl, uniforms, scene, renderlights=undefined, use_jitter=false, seed=0.0) {
    let p = new Vector3();
    let r = new Vector3();

    if (use_jitter) {
      util.seed(seed);
    }

    for (let gen of LightGenerators) {
      let i = 0;

      for (let k in renderlights) {
        let rlight = renderlights[k];
        let light = rlight.light;

        if (light.data.type !== gen.lightType) {
          continue;
        }

        let m = light.outputs.matrix.getValue().$matrix;
        let dir = new Vector3([m.m31, m.m32, m.m33]);

        let shadowmap = rlight.shadowmap;
        let uname = gen.uniformName + `[${i}]`;
        i++;

        p.zero();
        p.multVecMatrix(light.outputs.matrix.getValue());

        if (use_jitter) {
          switch (light.data.type) {
            case LightTypes.AREA_DISK:
            //break;
            case LightTypes.AREA_RECT:
            //break;
            case LightTypes.SUN:
              //break;
              uniforms[uname + ".dir"] = dir;
            //yes, the pass through is deliberate
            case LightTypes.POINT:
            default:
              r[0] = (util.random()-0.5)*2.0;
              r[1] = (util.random()-0.5)*2.0;
              r[2] = (util.random()-0.5)*2.0;

              r.mulScalar(light.data.inputs.radius.getValue());
              p.add(r);

              break;
          }
        }

        uniforms[uname + ".co"] = p;
        uniforms[uname + ".power"] = light.data.inputs.power.getValue();
        uniforms[uname + ".radius"] = light.data.inputs.radius.getValue();
        uniforms[uname + ".distance"] = light.data.inputs.distance.getValue();
        uniforms[uname + ".color"] = light.data.inputs.color.getValue();

        if (shadowmap !== undefined) {
          uniforms[uname + ".shadow"] = shadowmap.getUniformValue();
          uniforms[uname + ".shadow_near"] = shadowmap.near;
          uniforms[uname + ".shadow_far"] = shadowmap.far;
        }
      }
    }
  }

  genDefines(rlights) {
    let tot = 0;

    for (let k in rlights) {
      let rlight = rlights[k];
      let light = rlight.light;

      if (light.data.type === this.lightType) {
        tot++;
      }
    }

    if (tot === 0) return '';

    return `#define ${this.totname} ${tot}\n`;
  }


  static genDefines(rlights) {
    let ret = '';

    for (let gen of LightGenerators) {
      ret += gen.genDefines(rlights) + "\n";
    }

    return ret;
  }

  gen(closure, co, normal, color, brdf) {
    let code = this.lightLoop;

    code = code.replace(/CLOSURE/g, closure);
    code = code.replace(/CO/g, co);
    code = code.replace(/NORMAL/g, normal);
    code = code.replace(/COLOR/g, color);
    code = code.replace(/BRDF/g, brdf);

    return code;
  }

  static register(generator) {
    LightGenerators.push(generator);
  }

  static pre() {
    let ret = "";

    for (let gen of LightGenerators) {
      ret += gen.pre + "\n";
    }

    return ret;
  }

  static generate(closure, co, normal, color, brdf) {
    let ret = "";
    for (let gen of LightGenerators) {
      ret += gen.gen(closure, co, normal, color, brdf) + "\n";
    }

    ret += ShaderFragments.AMBIENT.replace(/CLOSURE/g, closure);

    return ret;
  }
}

export let PointLightCode = new LightGen({
  lightType : LightTypes.POINT,
  name : "POINTLIGHT",
  uniformName : "POINTLIGHTS",
  totname : "MAXPLIGHT",
  pre : `
  #if defined(MAXPLIGHT) && MAXPLIGHT > 0
    #define HAVE_POINTLIGHT
    //define HAVE_SHADOW
    
    struct PointLight {
      vec3 co;
      float power;
      float radius; //soft shadow radius
      vec3 color;
      float distance; //falloff distance
#ifdef HAVE_SHADOW
      samplerCubeShadow shadow;
#endif
      float shadow_near;
      float shadow_far;
    };
    
    uniform PointLight POINTLIGHTS[MAXPLIGHT];
  #endif
  `,

  //inputs: CLOSURE CO NORMAL COLOR (for BRDF)
  lightLoop : `
  #ifdef HAVE_POINTLIGHT
    for (int li=0; li<MAXPLIGHT; li++) {
      vec3 lvec = normalize(POINTLIGHTS[li].co - CO);
      vec3 ln = normalize(lvec);
      
      BRDF;

      vec3 f = brdf_out * dot(ln, NORMAL);
      
      float energy = 1.0 / (1.0 + sqrt(length(lvec)/POINTLIGHTS[li].distance));
      energy *= POINTLIGHTS[li].power;
     
#ifdef HAVE_SHADOW
      float z = 1.0/length(lvec) - 1.0/POINTLIGHTS[li].shadow_near;
      z /= 1.0/POINTLIGHTS[li].shadow_far - 1.0/POINTLIGHTS[li].shadow_near;
      
      z = length(lvec);
      
      vec4 sp = vec4(lvec, z);
      
      float shadow = texture(POINTLIGHTS[li].shadow, sp);
#else
      float shadow = 1.0;
#endif
  
      CLOSURE.light += f * POINTLIGHTS[li].color * energy * shadow;
      //CLOSURE.light += vec3(shadow, shadow, shadow);
    }
  #endif
  `,

  defines : [
    'MAXPLIGHT'
  ],

  getLightVector : function(co, i) {
    return `normalize(POINTLIGHTS${i}.co - ${co})`;
  }
});
LightGen.register(PointLightCode);


export let SunLightCode = new LightGen({
  lightType : LightTypes.SUN,
  name : "SUNLIGHT",
  uniformName : "SUNLIGHTS",
  totname : "MAXSLIGHT",
  pre : `
  #if defined(MAXSLIGHT) && MAXSLIGHT > 0
    #define HAVE_SUNLIGHT
    //define HAVE_SHADOW
    
    struct SUNLight {
      vec3 co;
      vec3 dir;
      float power;
      float radius; //soft shadow radius
      vec3 color;
      float distance; //falloff distance
#ifdef HAVE_SHADOW
      samplerCubeShadow shadow;
#endif
      float shadow_near;
      float shadow_far;
    };
    
    uniform SUNLight SUNLIGHTS[MAXSLIGHT];
  #endif
  `,

  //inputs: CLOSURE CO NORMAL COLOR (for BRDF)
  lightLoop : `
  #ifdef HAVE_SUNLIGHT
    for (int li=0; li<MAXSLIGHT; li++) {
      vec3 lvec = SUNLIGHTS[li].dir;
      vec3 ln = normalize(lvec);
      
      BRDF;

      vec3 f = brdf_out * max(dot(ln, NORMAL), 0.0);
      
      float energy = SUNLIGHTS[li].power;
     
#ifdef HAVE_SHADOW
      float z = 1.0/length(lvec) - 1.0/SUNLIGHTS[li].shadow_near;
      z /= 1.0/SUNLIGHTS[li].shadow_far - 1.0/SUNLIGHTS[li].shadow_near;
      
      z = length(lvec);
      
      vec4 sp = vec4(lvec, z);
      
      float shadow = texture(SUNLIGHTS[li].shadow, sp);
#else
      float shadow = 1.0;
#endif
  
      CLOSURE.light += f * SUNLIGHTS[li].color * energy * shadow;
      //CLOSURE.light += vec3(shadow, shadow, shadow);
    }
  #endif
  `,

  defines : [
    'MAXSLIGHT'
  ],

  getLightVector : function(co, i) {
    return `SUNLIGHTS${i}.dir`;
  }
});
LightGen.register(SunLightCode);

export class BRDFGen {
  constructor(code) {
    this.code = code;
  }

  gen(closure, co, normal, color) {
    let code = this.code.replace(/CLOSURE/g, closure);

    code = code.replace(/COLOR/g, color);
    code = code.replace(/CO/g, co);
    code = code.replace(/NORMAL/g, normal);

    return code;
  }
}

//inputs CLOSURE ln lvec NORMAL CO COLOR
export let DiffuseBRDF = new BRDFGen(`
  vec3 brdf_out = COLOR.rgb;
`);

export let ShaderFragments = {
  ALPHA_HASH : `
    {
      vec3 camera = (normalMatrix * vec4(vGlobalCo, 1.0)).xyz;
      float prob = hash3f(vec3(gl_FragCoord.xy, camera.z*0.01));
      
      if (prob > SHADER_SURFACE.alpha) {
        discard;
      }
    }
  `,
  AMBIENT : ` //inputs: CLOSURE
#ifdef WITH_AO
    {
    float aopass1 = texture2D(passAO, gl_FragCoord.xy/viewportSize)[0];
    vec3 aopass = vec3(aopass1, aopass1, aopass1);
    
    CLOSURE.light += CLOSURE.diffuse*aopass*ambientColor*ambientPower;
    //CLOSURE.light = ambientColor;
    }
#else
    CLOSURE.light += CLOSURE.diffuse*ambientColor*ambientPower;
#endif
  `,
  CLOSUREDEF : ClosureGLSL,
  ATTRIBUTES : `
attribute vec3 position;
attribute vec3 normal;
MULTILAYER_UV_DECLARE
attribute vec4 color;
attribute float id;
`,
  UNIFORMS : `
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;
uniform float object_id;
uniform vec2 viewportSize;

uniform sampler2D passAO;

uniform vec3 ambientColor;
uniform float ambientPower;

uniform float uSample;

`,
  VARYINGS : `
    varying vec4 vColor;
    varying vec3 vNormal;
    varying float vId;
    varying vec3 vGlobalCo;
    varying vec3 vLocalCo;
  `,
  SHADERLIB : `

float hash1f(float seed) {
  seed += uSample;
  
  seed = fract(seed*0.25234 + seed*sqrt(11.0));
  return fract(1.0 / (0.00001 + 0.00001*fract(seed)));
}

float hash2f(vec2 p) {
  float seed = p.y*sqrt(3.0) + p.x*sqrt(5.0);
  //seed += fract(p.x*p.y);
  
  return fract(seed+uSample*sqrt(2.0));
  return hash1f(seed);
}

float hash3f(vec3 p) {
  float seed = p.y*sqrt(3.0) + p.x*sqrt(5.0);
  seed += fract(p.z*sqrt(11.0));
  //seed += fract(p.x*p.y);
  
  return fract(seed+uSample*sqrt(2.0));
  return hash1f(seed);
}

Closure vec3toclosure(vec3 c) {
  Closure ret;
  
  ret.alpha = 1.0;
  ret.emission = c;
  
  return ret;
}

Closure floattoclosure(float c) {
  Closure ret;
  
  ret.alpha = 1.0;
  ret.emission = vec3(c, c, c);
  
  return ret;
}

`
};

let bluemask = {
  tex : undefined,
  gl : undefined,
  shaderPre : `
  uniform sampler2D blueMask;
  uniform vec2 blueUVOff;
  uniform vec2 blueUVScale;
  
  /*
  float _hashrand(float f) {
    f = fract((f + f*0.1 + f*1000.0)*sqrt(3.0));
    return fract(1.0 / (f*0.00001 + 0.000001));
  }*/
  
  vec4 sampleBlue(vec2 uv) {
    return texture2D(blueMask, uv*blueUVScale + blueUVOff);
  }
    
  `
};

export function getBlueMaskDef() {
  return bluemask;
}

/*
* Get a four-component blue noise mask.
* Each component is blue-corralated with the others,
* so it's four seperate but related masks.
*
* Use each component for different shading parameters,
* e.g. one for AO, one for subsurface scattering, etc, etc
* */
export function getBlueMask(gl) {
  if (!gl) {
    throw new Error("gl cannot be undefined");
    return undefined;
  }

  if (bluemask.gl === gl) {
    return bluemask.tex;
  }

  bluemask.gl = gl;
  bluemask.tex = new webgl.Texture();
  bluemask.tex.texture = gl.createTexture(gl.TEXTURE_2D);

  console.log("creating blue noise mask");

  //convert to float data
  //
  let mask = bluenoise.cmyk;
  let data = mask.mask;
  let size = mask.dimen;
  let comps = mask.components;
  let tot = comps*size*size;

  let tex = new Float32Array(size*size*4);

  let maxelem = mask.bytesPerPixel / mask.components;
  maxelem = (1<<(maxelem*8))-1;

  if (maxelem !== 255) {
    throw new Error(""+maxelem);
  }

  for (let i=0; i<size*size; i++) {
    let idx1 = i*comps;
    let idx2 = i*4;

    if (comps < 3) {
      tex[idx2+3] = 1.0;
    }

    for (let j=0; j<comps; j++) {
      let f = data[idx1+j]/maxelem;
      tex[idx2+j] = f;
    }
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bluemask.tex.texture);
  bluemask.tex.texImage2D(gl, gl.TEXTURE_2D, 0, gl.RGBA32F, ~~size, ~~size, 0, gl.RGBA, gl.FLOAT, tex);
  //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ~~size, ~~size, 0, gl.RGBA, gl.FLOAT, null);
  //bluemask.tex.load(gl, size, size, tex);

  bluemask.tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  bluemask.tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  bluemask.tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  bluemask.tex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  bluemask.tex.width = bluemask.tex.height = size;

  return bluemask.tex;
}

let _rand = new util.MersenneRandom();

export function setBlueUniforms(uniforms, viewport_size, bluetex, uSample=0.0) {
  let size = viewport_size;

  _rand.seed(uSample);

  uniforms.blueUVOff = [_rand.random(), _rand.random()];
  uniforms.blueMask = bluetex;
  uniforms.blueUVScale = [size[0]/bluetex.width, size[1]/bluetex.height];

}