import {Light, LightTypes} from '../light/light.js';
import {Vector3, Vector4, Matrix4, Vector2, Quat} from '../util/vectormath.js';

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

  static setUniforms(gl, uniforms, scene) {
    let p = new Vector3();

    for (let gen of LightGenerators) {
      let i = 0;

      for (let light of scene.lights.renderable) {
        if (light.data.type != gen.lightType) {
          continue;
        }

        let uname = gen.uniformName + `[${i}]`;
        i++;

        p.zero();
        p.multVecMatrix(light.outputs.matrix.getValue());

        uniforms[uname + ".co"] = p;
        uniforms[uname + ".power"] = light.data.inputs.power.getValue();
        uniforms[uname + ".radius"] = light.data.inputs.radius.getValue();
        uniforms[uname + ".distance"] = light.data.inputs.distance.getValue();
        uniforms[uname + ".color"] = light.data.inputs.color.getValue();
      }
    }
  }

  genDefines(scene) {
    let tot = 0;

    for (let light of scene.lights.renderable) {
      if (light.data.type == this.lightType) {
        tot++;
      }
    }

    if (tot == 0) return '';

    return `#define ${this.totname} ${tot}\n`;
  }


  static genDefines(scene) {
    let ret = '';

    for (let gen of LightGenerators) {
      ret += gen.genDefines(scene) + "\n";
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
  
    struct PointLight {
      vec3 co;
      float power;
      float radius; //soft shadow radius
      vec3 color;
      float distance; //falloff distance
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
      
      CLOSURE.light += f * POINTLIGHTS[li].color * energy;
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
  AMBIENT : ` //inputs: CLOSURE
    //CLOSURE.light += texture2D(passAO, gl_FragCoord.xy/viewportSize)[0]*ambientColor*ambientPower;
    CLOSURE.light += CLOSURE.diffuse*texture2D(passAO, gl_FragCoord.xy/viewportSize).rgb*ambientColor*ambientPower;
    //CLOSURE.light = ambientColor;
  `,
  CLOSUREDEF : ClosureGLSL,
  ATTRIBUTES : `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
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
`,
  VARYINGS : `
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vNormal;
    varying float vId;
    varying vec3 vGlobalCo;
    varying vec3 vLocalCo;
  `,
  SHADERLIB : `

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