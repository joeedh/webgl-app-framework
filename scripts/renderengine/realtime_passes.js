import {DataBlock, DataRef} from '../core/lib_api.js';
import {loadShader, Shaders} from '../editors/view3d/view3d_shaders.js';
import {LightGen} from '../shadernodes/shader_lib.js';
import {FBO} from '../core/fbo.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {SceneObject, ObjectFlags} from '../core/sceneobject.js';
import {RenderEngine} from "./renderengine_base.js";
import {Mesh} from '../mesh/mesh.js';
import {FBOSocket, RenderContext, RenderGraph, RenderPass} from "./renderpass.js";
import {Node, Graph, NodeSocketType, NodeFlags, SocketFlags, SocketTypes} from "../core/graph.js";
import {FloatSocket} from "../core/graphsockets.js";

let zero = new Vector2([0, 0]);

export class BasePass extends RenderPass {
  constructor() {
    super();
  }

  static nodedef() {return {
    uiname : "Base Pass",
    name   : "base_pass",
    inputs : Node.inherit({
      ao      : new FBOSocket(),
      normal  : new FBOSocket()
    }),
    outputs : Node.inherit({

    }),
    shader : `
gl_FragColor = texture2D(rgba, v_Uv);
gl_FragDepthEXT = texture2D(depth, v_Uv)[0];
    `
  }}

  renderIntern(rctx) {
    let gl = rctx.gl;

    gl.clearColor(1.0, 1.0, 1.0, 0.0);
    gl.clearDepth(100000.0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    console.log("base pass exec!");
    rctx.engine.render_intern(rctx.drawmats, rctx.gl, zero, rctx.size, rctx.scene);
  }
}


export class NormalPass extends RenderPass {
  constructor() {
    super();
  }

  static nodedef() {return {
    uiname : "Normal Pass",
    name   : "normal_pass",
    inputs : Node.inherit({

    }),
    outputs : Node.inherit({

    }),
    shader : `
gl_FragColor = texture2D(fbo_rgba, v_Uv);
gl_FragDepthEXT = texture2D(fbo_depth, v_Uv)[0];
    `
  }}

  renderIntern(rctx) {
    console.log("normal pass exec!");
    rctx.engine.render_normals(rctx.drawmats, rctx.gl, zero, rctx.size, rctx.scene);
  }
}

export class OutputPass extends RenderPass {
  constructor() {
    super();
  }

  static nodedef() {return {
    uiname : "Test Pass",
    name   : "test_pass",
    inputs : Node.inherit({

    }),
    outputs : Node.inherit({

    }),
    shader : `
gl_FragColor = texture2D(fbo_rgba, v_Uv);
gl_FragDepthEXT = texture2D(fbo_depth, v_Uv)[0];
    `
  }}

  renderIntern(rctx) {
    super.renderIntern(rctx, true);
  }
}

export class AOPass extends RenderPass {
  constructor() {
    super();
  }

  static nodedef() {return {
    uiname : "AO Pass",
    name   : "ao_pass",
    inputs : Node.inherit({}),
    outputs : Node.inherit({}),
    shaderPre : `
const float dist=5.0, factor=5.0, steps=1024.0;
const int samples=16;
const float seed1=0.23432, seed2=1.2342;


vec4 unproject(vec4 p) {
  vec4 p2 = iprojectionMatrix * vec4(p.xyz, 1.0);
  
  p2.xyz /= p2.w;
  
  return p2;
}

#if 0
float sample_blue(vec2 uv) {
  float x = fract(uv[0] * size[0] / bluemask_size[0]); 
  float y = fract(uv[1] * size[1] / bluemask_size[1]); 
  
  return texture2D(bluemask, vec2(x, y))[0];
}
#endif

float rand1(float seed) {
  seed += 1.0 + uSample;
  seed = fract(seed*0.00134234 + seed*0.1234543 + seed*10.23432423 + seed);
  
  seed = 1.0 / (0.00001*seed + 0.00001);
  return fract(fract(seed*3.234324)*5.234324);
}

float nrand1(float seed) {
  return (rand1(seed)*0.5 + rand1(seed+0.5)*0.5);
}
float wrand(float x, float y, float seed) {
#if 0    
  float b = sample_blue(v_Uv);
  
  //b = rand1(x*y + x + y);
  b = floor(b * steps)/steps;
  //b *= 100.0;
  float f = rand1(b + seed); //*0.01 + seed*0.1 + seed);
  
  return f;
#endif
  float f = 0.0;
  float white = rand1((x+11.2342) * (y+13.23432)*0.001);
  
  f += (rand1(seed + x*y) - f)*0.5;
  f += (white - f)*0.5;
  //f = white;
  
  f = fract(1.0 / (0.00001*f + 0.00001));
  return f;
}

float rand(float x, float y, float seed) {
  //return (wrand(x, y, seed) + wrand(x, y, seed+0.5523) + wrand(x, y, seed+0.8324)) / 3.0;
  return wrand(x, y, seed);
}

    `,
    shader : `
  vec4 p = vec4(gl_FragCoord.xyz, 1.0);
  p.xy = (p.xy / size)*2.0 - 1.0;

  p.z = texture2D(fbo_depth, v_Uv)[0];
  float z = p.z;

  p = unproject(p);
  
  float seed = 0.0;
  
  float f = 0.0;
  float tot = 0.0;
  vec3 nin = texture2D(fbo_rgba, v_Uv).rgb*2.0 - 1.0; 
  
  for (int i=0; i<256; i++) {
    if (i > samples) {
      break;
    }
    
    vec3 n;
    n[0] = rand(v_Uv[0], v_Uv[1], seed)-0.5;
    n[1] = rand(v_Uv[0], v_Uv[1], seed+1.0)-0.5;
    n[2] = rand(v_Uv[0], v_Uv[1], seed+2.0)-0.5;
    
    //n = normalize(n + 0.25*nin);
    
    if (dot(n, nin) < 0.0) {
      n = -n;
    }
    
    n *= dist;
    vec4 p2 = vec4(p.xyz, 1.0) + vec4(n, 0.0);
    p2 = projectionMatrix * p2;
    
    p2.xyz /= p2.w;
    float oldz = p2.z;
    
    vec4 c = texture2D(fbo_rgba, (p2.xy*0.5 + 0.5));
    p2.z = texture2D(fbo_depth, (p2.xy*0.5 + 0.5))[0];
    
    vec4 p3 = unproject(p2);
    //float w = min(length(p3.xyz - p.xyz) / dist, 1.0);
    float w = length(p3.xyz - p.xyz) / dist;
    w = w > 2.0 ? 0.0 : min(w, 1.0);
    //w = min(w, 1.0);
    
    //float weight = abs(z - p2.z);
    //w=1.0;
    
    if (p2.z + (1.0+0.01*seed1)*abs(oldz-p2.z) > oldz) {
      w = 0.0;
    }
    
    f += w;
    
    seed += 3.0;
    tot += 1.0;
  }

  f /= tot;
  f = pow(1.0 - f, factor);

  //f = rand(v_Uv[0], v_Uv[1], 0.0);
  
  vec4 color = texture2D(fbo_rgba, v_Uv);
  gl_FragColor = vec4(f, f, f, 1.0);
  
  //gl_FragColor = texture2D(fbo_rgba, v_Uv);
  //gl_FragColor = vec4(texture2D(fbo_rgba, v_Uv).rgb, 1.0);
  gl_FragDepthEXT = texture2D(fbo_depth, v_Uv)[0];
    `
  }}

  renderIntern(rctx) {
    super.renderIntern(rctx, true);
  }
}

export class BlurPass extends RenderPass {
  constructor() {
    super();
  }

  static nodedef() {return {
    uiname : "Blur Pass",
    name   : "blur_pass",
    inputs : Node.inherit({
      axis    : new FloatSocket(),
      samples : new FloatSocket(undefined, undefined, 8)
    }),
    outputs : Node.inherit({

    }),
    shaderPre : `
      
    `,
    shader : `
    
    vec4 accum;
    float tot=0.0;
    vec2 p = v_Uv * size;
    const float isamp = 1.0 / float(BLUR_SAMPLES);
      
    for (int i=-BLUR_SAMPLES; i<BLUR_SAMPLES; i++) {
      float w = 1.0 - abs(float(i) / float(BLUR_SAMPLES));
      w = w*(1.0 - isamp) + isamp;
      
      //w = w*w*(3.0 - 2.0*w);
      vec2 p2 = p;
      
      p2[BLUR_AXIS] += float(i);
      
      vec4 color = texture2D(fbo_rgba, p2 / size);
      
      accum += color*w;
      tot += w;
    }
    
    accum /= tot;
    
gl_FragColor = accum;
gl_FragDepthEXT = texture2D(fbo_depth, v_Uv)[0];
    `,
  }}

  renderIntern(rctx) {
    let shaderPre = this.constructor.nodedef().shaderPre;

    shaderPre += "#define BLUR_SAMPLES " + (~~this.inputs.samples.getValue()) + "\n";

    if (this.inputs.axis.getValue() == 0.0) {
      shaderPre += "#define BLUR_AXIS 0\n" + shaderPre;
    } else {
      shaderPre += "#define BLUR_AXIS 1\n" + shaderPre;
    }

    this.shaderPre = shaderPre;
    super.renderIntern(rctx, true);
  }
}
