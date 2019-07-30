export let ClosureGLSL = `
struct Closure {
  vec3 light;
  vec3 emission;
  vec3 scatter;
  float alpha;
}
`;

export let LightGenerators = [];

export class LightGen {
  constructor(args) {
    this.pre = args.pre;
    this.lightLoop = args.lightLoop;
    this.getLightVector = args.getLightVector;
    this.defines = args.defines;
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

  static generate(closure, co, normal, color, brdf) {
    let ret = "";
    for (let gen of LightGenerators) {
      ret += gen.gen(closure, co, normal, color, brdf) + "\n";
    }

    return ret;
  }
}

export let PointLightCode = new LightGen({
  pre : `
  #if defined(MAXPLIGHT) && MAXPLIGHT > 0
  #define HAVE_POINTLIGHT
  
    struct PointLight {
      vec3 co;
      float power;
      float radius; //soft shadow radius
      vec3 color;
      float distance; //falloff distance
    }
    
    uniform PointLight POINTLIGHTS[MAXPLIGHT];
  #endif
  `,

  //inputs: CLOSURE CO NORMAL COLOR (for BRDF)
  lightLoop : `
  #ifdef HAVE_POINTLIGHT
    for (int li=0; li<MAXPLIGHT; li++) {
      vec3 lvec = normalize(CO - POINTLIGHTS[i].co);
      vec3 ln = normalize(lvec);
      
      BRDF;

      vec3 f = brdf_out * dot(ln, NORMAL);
      
      float energy = 1.0 + (1.0 + sqrt(length(lvec)*POINTLIGHTS[i].distance));
      energy *= POINTLIGHTS[i].power;
      
      CLOSURE.light += f * POINTLIGHTS[i].color * energy;
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
  vec3 brdf_out = COLOR;
`);

export let ShaderFragments = {
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