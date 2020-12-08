import {DataBlock, DataRef} from '../core/lib_api.js';
import {loadShader, Shaders} from '../shaders/shaders.js';
import {LightGen} from '../shadernodes/shader_lib.js';
import {Light} from '../light/light.js';
import {FBO} from '../core/fbo.js';
import {FBOSocket, RenderContext, RenderGraph, RenderPass} from "./renderpass.js";
import {BasePass, SharpenPass, NormalPass, AccumPass, OutputPass, AOPass, BlurPass, DenoiseBlur, PassThruPass} from "./realtime_passes.js";
import {Texture, CubeTexture} from '../core/webgl.js';
import {getFBODebug} from "../editors/debug/gldebug.js";

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {SceneObject, ObjectFlags} from '../sceneobject/sceneobject.js';
import {RenderEngine} from "./renderengine_base.js";
import {Mesh} from '../mesh/mesh.js';
import {BasicFileOp} from "../core/appstate.js";

/**
 order of faces of a cubemap in cubemap array
 corrusponds to opengl ordering
 @example
 export const CubeMap = {
  POSX : 0,
  NEGX : 1,
  POSY : 2,
  NEGY : 3,
  POSZ : 4,
  NEGZ : 5
};
 */

export const CubeMapOrder = {
  POSX : 0,
  NEGX : 1,
  POSY : 2,
  NEGY : 3,
  POSZ : 4,
  NEGZ : 5
};

export class CubeFace {
  constructor(gl, mat, cmat, size, face, cubeColor, cubeDepth, near, far) {
    this.fbo = new FBO();
    this._queueResetSamples = false;
    this.fbo.target = gl.TEXTURE_CUBE_MAP;
    this.cubeColor = cubeColor;
    this.cubeDepth = cubeDepth;

    this.near = near;
    this.far = far;

    this.cameraMatrix = cmat;

    this.fbo.layer = gl.TEXTURE_CUBE_MAP_POSITIVE_X + face;
    this.fbo.texColor = new Texture(0, cubeColor);
    this.fbo.texDepth = new Texture(1, cubeDepth);

    this.fbo.texDepth.target = this.fbo.layer;
    this.fbo.texColor.target = this.fbo.layer;

    this.size = new Vector2(size).floor();

    this.projectionMatrix = new Matrix4(mat);
    this.iprojectionMatrix = new Matrix4(mat);
    this.iprojectionMatrix.invert();

    this.face = face;
  }

  render(gl, scene, light) {
    let size = this.size;

    //XXX
    let view3d = _appstate.ctx.view3d;

    this.fbo.update(gl, size[0], size[1]);
    this.fbo.bind(gl);

    gl.viewport(0, 0, size[0], size[1]);

    gl.clearDepth(10000.0);
    gl.clearColor(0, 0, 0, 0);

    gl.clear(gl.DEPTH_BUFFER_BIT|gl.COLOR_BUFFER_BIT);

    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
    gl.disable(gl.SCISSOR_TEST);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    let program = Shaders.MeshLinearZShader;


    this.iprojectionMatrix.load(this.projectionMatrix);
    this.iprojectionMatrix.invert();

    let uniforms = {
      projectionMatrix : this.projectionMatrix,
      iprojectionMatrix : this.iprojectionMatrix,
      normalMatrix : new Matrix4(),
      objectMatrix : new Matrix4(),
      cameraMatrix : this.cameraMatrix,
      near : this.near,
      far : this.far,
      object_id : undefined
    };

    for (let ob of scene.objects.renderable) {
      if (!(ob.data.usesMaterial)) {
        continue;
      }

      uniforms.object_id = ob.lib_id;
      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      uniforms.alpha = 1.0;
      uniforms.polygonOffset = 0.0;

      ob.draw(view3d, gl, uniforms, program);
    }

    window.gldebug_sample();

    this.fbo.unbind(gl);
    gl.enable(gl.SCISSOR_TEST);
  }
}

export class CubeMap extends Array {
  constructor(size, near, far) {
    super();

    this.near = near;
    this.far = far;

    this.size = new Vector2(size).floor();
    this.length = 6;
    this.texDepth = undefined;
    this.texColor = undefined;
    this.gl = undefined;
  }

  getUniformValue() {
    return this.texDepth;
  }

  makeCubeTex(gl) {
    this.gl = gl;

    let c1 = [], c2 = [];
    let i = 0;

    let tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    //gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 0, gl.DEPTH_COMPONENT, this.size[0], this.size[1]);

    for (let i=0; i<6; i++) {
      let cf = this[i];
    }

    this.gltex = new CubeTexture(undefined, tex);
  }
}

export const LightIdSymbol = Symbol("light_id");

export class ShaderCacheItem {
  constructor(shader, gen) {
    this.shader = shader;
    this.gen = gen;
  }
}

export class ShaderCache {
  constructor() {
    this.cache = {};
    this.gen = 0;
  }

  drawStart(gl) {
    this.gen++;
  }

  has(id) {
    return id in this.cache;
  }

  remove(id) {
    delete this.cache[id];
  }

  destroy(gl) {
    for (let k in this.cache) {
      this.cache[k].shader.destroy(gl);
    }

    this.cache = {};
  }

  add(gl, id, shader) {
    if (id in this.cache) {
      console.warn("overriding shader in cache", id, shader);
      this.cache[id].shader.destroy(gl);
    }

    this.cache[id] = new ShaderCacheItem(shader, this.gen);
  }

  get(id) {
    let ret = this.cache[id];

    ret.gen = this.gen;

    return ret.shader;
  }

  drawEnd(gl) {
    for (let k in this.cache) {
      let shader = this.cache[k];

      if (shader.gen !== this.gen) {
        console.log("pruning unneeded shader", k);
        shader.shader.destroy(gl);
        delete this.cache[k];
      }
    }
  }
}

export class RenderLight {
  constructor(light, id) {
    this.light = light;
    this._digest = new util.HashDigest();
    this.id = id;
    this.shadowmap = undefined;
    this.co = new Vector3();
    this.seed = 0;

    if (light !== undefined) {
      this.calcCo();
    }
  }

  calcUpdateHash() {
    let hash = this._digest;
    hash.reset();

    if (!this.light) {
      return 0;
    }

    let light = this.light;

    let mat = light.outputs.matrix.getValue();
    mat.addToHashDigest(hash);

    for (let k in light.data.inputs) {
      let sock = light.data.inputs[k];
      if (sock.edges.length > 0) {
        sock = sock.edges[0];
      }

      sock.addToUpdateHash(hash);
    }

    return hash.get();
  }

  calcCo() {
    this.co.load(this.light.locationWorld);

    util.seed(this.seed*3);

    let r = this.light.data.inputs.radius.getValue();

    let x = (util.random()-0.5)*2.0*r;
    let y = (util.random()-0.5)*2.0*r;
    let z = (util.random()-0.5)*2.0*r;

    this.co[0] += x;
    this.co[1] += y;
    this.co[2] += z;
  }

  update(light, uSample) {
    this.light = light;
    this.seed = uSample;
    this.calcCo();
  }
}

let nulltex = undefined;

let sdigest = new util.HashDigest();

export class RenderSettings {
  constructor() {
    this.sharpen = true;
    this.filterWidth = 1.5;
    this.sharpenWidth = 1;
    this.sharpenFac = 0.4;
    this.minSamples = 1;
    this.ao = true;
  }

  calcUpdateHash() {
    sdigest.reset();
    sdigest.add(!!this.sharpen);
    sdigest.add(this.filterWidth);
    sdigest.add(this.sharpenWidth);
    sdigest.add(this.ao);

    return sdigest.get();
  }
}
RenderSettings.STRUCT = `
renderengine_realtime.RenderSettings {
  sharpen      : bool;
  filterWidth  : float;
  sharpenWidth : int;
  sharpenFac   : float;
  minSamples   : int;
}
`;
nstructjs.register(RenderSettings);

export class RealtimeEngine extends RenderEngine {
  constructor(view3d, settings) {
    super();

    this._digest = new util.HashDigest();
    this.renderSettings = settings ? settings : new RenderSettings();

    this.projmat = new Matrix4();
    this.lights = {};
    this.light_idgen = 1;

    this.view3d = view3d;
    this.gl = view3d.gl;
    this.scene = view3d.ctx.scene;

    this._last_envlight_hash = undefined;
    this._last_camerahash = undefined;

    this.cache = new ShaderCache();
    this.rendergraph = new RenderGraph();
    this.uSample = 0.0;
    this.weightSum = 0.0;
    this.maxSamples = 8;

    this.shaderUpdateGen = 0;

    this._last_update_hash = undefined;

    this.rebuildGraph();
  }

  rebuildGraph() {
    this.rendergraph.clear();

    let base = this.basePass = new BasePass();
    let nor = this.norPass = new NormalPass();
    let out = this.outPass = new OutputPass();
    let accumOut = this.accumOutPass = new AccumPass();
    let passThru = this.passThru = new PassThruPass();
    let ao = new AOPass();

    console.log("rebuild render graph");

    //let test = new TestPass();

    this.rendergraph.add(out);
    this.rendergraph.add(base);

    let needNormalPass = false;

    console.log(this.renderSettings.ao);

    if (this.renderSettings.ao) {
      needNormalPass = true;

      //force material recompiling to get WITH_AO define
      if (!this.aoPass) {
        this.shaderUpdateGen++;
      }

      this.rendergraph.add(ao);
      this.rendergraph.add(nor);

      nor.outputs.fbo.connect(ao.inputs.fbo);


      let blurx = new DenoiseBlur();
      let blury = new DenoiseBlur();

      this.aoPass = blury;

      this.rendergraph.add(blurx);
      this.rendergraph.add(blury);

      blury.inputs.axis.setValue(1);

      blury.inputs.samples.setValue(2);
      blurx.inputs.samples.setValue(2);

      ao.outputs.fbo.connect(blurx.inputs.fbo);
      //blurx.outputs.fbo.connect(blury.inputs.fbo);

      blurx.outputs.fbo.connect(blury.inputs.fbo);
      blury.outputs.fbo.connect(base.inputs.ao);

      //ao.outputs.fbo.connect(base.inputs.ao);
      //ao.outputs.fbo.connect(base.inputs.ao);
    } else {
      if (this.aoPass) {
        //force all materials to recompile
        this.shaderUpdateGen++;
      }
      this.aoPass = undefined;
      //this.aoPass = ao;
      //ao.outputs.fbo.connect(base.inputs.ao);
    }

    if (needNormalPass) {
      nor.outputs.fbo.connect(base.inputs.normal);
    }


    if (1) {
      this.rendergraph.add(accumOut);
      this.rendergraph.add(passThru);

      base.outputs.fbo.connect(accumOut.inputs.fbo);
      base.outputs.w.connect(accumOut.inputs.w);

      if (this.renderSettings.sharpen) {
        let sharpx = new SharpenPass();
        let sharpy = new SharpenPass();

        this.rendergraph.add(sharpx);
        this.rendergraph.add(sharpy);

        this.sharpx = sharpx;
        this.sharpy = sharpy;

        this.updateSharpen();

        sharpy.inputs.axis.setValue(1);

        accumOut.outputs.fbo.connect(passThru.inputs.fbo);
        passThru.outputs.fbo.connect(sharpx.inputs.fbo);

        sharpx.outputs.fbo.connect(sharpy.inputs.fbo);
        sharpy.outputs.fbo.connect(out.inputs.fbo);
      } else {
        accumOut.outputs.fbo.connect(passThru.inputs.fbo);
        passThru.outputs.fbo.connect(out.inputs.fbo);
      }
    } else {
      base.outputs.fbo.connect(out.inputs.fbo);
      //ao.outputs.fbo.disconnect();
      //ao.outputs.fbo.connect(out.inputs.fbo);
    }

    this._last_update_hash = this.renderSettings.calcUpdateHash();
  }

  updateSharpen() {
    this.sharpx.inputs.samples.setValue(this.renderSettings.sharpenWidth);
    this.sharpy.inputs.samples.setValue(this.renderSettings.sharpenWidth);

    this.sharpx.inputs.factor.setValue(this.renderSettings.sharpenFac);
    this.sharpy.inputs.factor.setValue(this.renderSettings.sharpenFac);
  }

  update(gl) {

  }

  resetRender() {
    //console.log("reset render frame");
    this.uSample = 0;
    this.weightSum = 0.0;
  }

  addLight(light) {
    let id = this._getLightId(light);
    let rlight = new RenderLight(light, id);

    this.lights[id] = rlight;
    return rlight;
  }

  updateLight(light) {
    let id = this._getLightId(light);

    if (!(id in this.lights)) {
      this.addLight(light);
    }

    this.lights[id].update(light, this.uSample);
  }

  updateLights() {
    for (let k in this.lights) {
      this.lights[k].update(this.lights[k].light, this.uSample);
    }
  }

  _getLightId(light) {
    if (typeof light[LightIdSymbol] === "undefined") {
      light[LightIdSymbol] = this.light_idgen++;
    }

    return light[LightIdSymbol];
  }

  updateSceneLights() {
    let gl = this.gl, scene = this.scene;

    for (let light of this.scene.lights) {
      let id = this._getLightId(light);

      if (!(id in this.lights)) {
        this.lights[id] = new RenderLight(light, id);
      }
    }
  }

  renderShadowMaps() {
    return;
    let gl = this.gl, scene = this.scene;

    for (let light of this.scene.lights) {
      let id = this._getLightId(light);
      let rlight = this.lights[id];

      if (rlight === undefined) {
        console.warn("Render light missing", light.lib_id, light.name, light);
        continue;
      }

      let co = light.locationWorld;
      this.renderShadowCube(rlight, co)
    }
  }

  render(camera, gl, viewbox_pos, viewbox_size, scene, extraDrawCB) {
    let shash = this.renderSettings.calcUpdateHash();
    if (this._last_update_hash !== shash) {
      this.rebuildGraph();
      this.resetSamples();
      this._queueResetSamples = false;
    } else if (this._queueResetSamples) {
      this.resetSamples();
      this._queueResetSamples = false;
    }

    if (this.renderSettings.sharpen) {
      this.updateSharpen();
    }

    /*
    let t = util.time_ms();
    while (util.time_ms() - t < 12) {
      this._render(...arguments);
    }
    return;
    */

    if (this.uSample >= this.renderSettings.minSamples) {
      this._render(...arguments);
      return;
    }

    let max = 1000;

    while (this.uSample < this.renderSettings.minSamples && max--) {
      this._render(...arguments);
    }
  }

  _render(camera, gl, viewbox_pos, viewbox_size, scene, extraDrawCB) {

    this.scene = scene;
    this.gl = gl;
    this.camera = camera;

    let hash = camera.generateUpdateHash();
    if (hash !== this._last_camerahash) {
      this.uSample = 0;
      this.weightSum = 0.0;
      this._last_camerahash = hash;
    }

    this.uSample++; // = Math.max((this.uSample + 1) % this.maxSamples, 1);

    this.updateSceneLights();
    this.updateLights();
    this.renderShadowMaps();

    this.extraDrawCB = extraDrawCB;
    this.rendergraph.exec(gl, this, viewbox_size, camera, scene);

    let graph = this.rendergraph.graph;
    let output;

    for (let node of graph.sortlist) {
      if (node instanceof OutputPass) {
        output = node;
        break;
      } else {
        for (let k in node.outputs) {
          let sock = node.outputs[k];
          if (sock instanceof FBOSocket) {
            let fbo = sock.data;
            if (fbo.fbo && fbo.gl) {
              let name = node.getDebugName(); //constructor.nodedef().name;

              name = `${name}_${k}`;
              getFBODebug(gl).pushFBO(name, fbo);
            }
          }
        }
      }
    }

    if (!output) {
      return;
    }

    if (output.outputs.fbo.getValue().texColor) {
      let rctx = this.rendergraph.rctx;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);

      rctx.drawFinalQuad(output.outputs.fbo.getValue());

      getFBODebug(gl).pushFBO("render_final", output.outputs.fbo.getValue());
      //will only push and copy fbo if a debug editor is open
    }
  }

  renderShadowCube(rlight, co, near=0.01, far=10000.0) {
    let gl = this.gl;

    let makeProjMat = (axis, sign) => {
      let mat = new Matrix4();
      let tmat = new Matrix4();
      let pmat = new Matrix4();

      switch (axis) {
        case 0:
          mat.euler_rotate(0.0, sign*Math.PI*0.5, 0.0);
          break;
        case 1:
          mat.euler_rotate(sign*Math.PI*0.5, 0.0, 0.0);
          break;
        case 2:
          mat.euler_rotate(0.0, 0.0, (-sign*0.5+0.5)*Math.PI);
          break;
      }

      if (0) {
        let vaxis = new Vector3();
        let up = new Vector3();

        vaxis[axis] = 1.0;
        up[(axis + 1) % 3] = 1.0;

        let target = new Vector3(co).add(vaxis);

        mat.lookat(co, target, up);
        //mat.lookat(co[0], co[1], co[2], vaxis[0], vaxis[1], vaxis[2], up[0], up[1], up[2]);
        tmat.makeIdentity();
      } else {
        tmat.translate(co[0], co[1], co[2]);
      }

      let aspect = 1.0;

      pmat.perspective(90.0, aspect, near, far);

      let mat2 = new Matrix4();

      mat2.multiply(tmat);
      mat2.multiply(mat);

      mat2.invert();
      pmat.multiply(mat2);

      //pmat.load(_appstate.ctx.view3d.camera.rendermat);

      return [pmat, mat2];
    };

    //TODO: see if webgl supports  glEnable(GL_TEXTURE_CUBE_MAP_SEAMLESS).

    let size = 512;
    size = [size, size];

    let cube = new CubeMap(size, near, far);

    let ctex = gl.createTexture();
    let dtex = gl.createTexture();

    cube.texColor = new Texture(0, ctex, gl.TEXTURE_CUBE_MAP);
    cube.texDepth = new Texture(1, dtex, gl.TEXTURE_CUBE_MAP);

    let target = gl.TEXTURE_CUBE_MAP;
    let ctype = gl.haveWebGL2 ? gl.RGBA32F : gl.RGBA;
    //let dtype = gl.haveWebGL2 ? gl.UNSIGNED_INT_24_8 : gl.depth_texture.UNSIGNED_INT_24_8_WEBGL;
    //let dtype = gl.haveWebGL2 ? gl.DEPTH24_STENCIL8 :  gl.depth_texture.UNSIGNED_INT_24_8_WEBGL;
    let dtype = gl.haveWebGL2 ? gl.DEPTH24_STENCIL8 : gl.UNSIGNED_INT;

    gl.bindTexture(target, ctex);
    gl.texStorage2D(target, 1, ctype, size[0], size[1]);

    gl.bindTexture(target, dtex);
    gl.texStorage2D(target, 1, dtype, size[0], size[1]);

    //gl.texParameteri(gl.TEXTURE_CUBE_MAP, 0x2800, gl.LINEAR);
    //gl.texParameteri(gl.TEXTURE_CUBE_MAP, 0x2800, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_FUNC, gl.GREATER);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);

    //for (uint i = 0 ; i < 6 ; i++) {
    //  glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, GL_R32F, WindowWidth, WindowHeight, 0, GL_RED, GL_FLOAT, NULL);
    //}

    for (let i=0; i<3; i++) {
      let pm1 = makeProjMat(i, 1);
      let pm2 = makeProjMat(i, -1);

      cube[i*2] = new CubeFace(gl, pm1[0], pm1[1], size, i*2, ctex, dtex, near, far);
      cube[i*2+1] = new CubeFace(gl, pm2[0], pm2[1], size, i*2+1, ctex, dtex, near, far);
    }

    window._cube = cube;

    for (let cf of cube) {
      cf.render(this.gl, this.scene, undefined);
    }

    cube.makeCubeTex(this.gl);
    rlight.shadowmap = cube;
  }

  getProjMat(camera, viewbox_size) {
    let pmat = this.projmat;

    pmat.load(camera.rendermat);
    let dx = 1.0 / viewbox_size[0];
    let dy = 1.0 / viewbox_size[1];

    let tmat = new Matrix4();

    util.seed(this.uSample);

    tmat.translate(dx*(util.random()-0.5)*2.0, dx*(util.random()-0.5)*2.0, 0.0);
    pmat.preMultiply(tmat);

    return pmat;
  }

  render_normals(camera, gl, viewbox_pos, viewbox_size, scene) {
    //XXX
    let view3d = _appstate.ctx.view3d;

    let uniforms = {
      projectionMatrix : this.getProjMat(camera, viewbox_size),
      normalMatrix     : camera.normalmat,
      uSample          : this.uSample+1
    };

    LightGen.setUniforms(gl, uniforms, scene, this.lights, true, this.uSample);
    window._debug_uniforms = uniforms;

    for (let ob of scene.objects.renderable) {
      if (!ob.data.usesMaterial) {
        continue;
      }

      let mat = ob.data.materials[0];
      let program;

      program = Shaders.NormalPassShader;

      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      //program.uniforms.objectMatrix = ob.outputs.matrix.getValue();
      ob.draw(view3d, gl, uniforms, program);
    }
  }

  getNullTex(gl) {
    if (nulltex === undefined) {
      nulltex = gl.createTexture();
      nulltex = new Texture(undefined, nulltex);
    }

    return nulltex;
  }

  queueResetSamples() {
    this._queueResetSamples = true;
  }

  resetSamples() {
    console.log("Reset samples!");
    this.uSample = 0;
    this.weightSum = 0.0;
    //window.redraw_viewport();
  }

  render_intern(camera, gl, viewbox_pos, viewbox_size, scene, shiftx=0, shifty=0) {
    let view3d = _appstate.ctx.view3d;

    let hash = this._digest;
    hash.reset();

    hash.add(scene.envlight.calcUpdateHash());
    for (let k in this.lights) {
      let rlight = this.lights[k];

      hash.add(rlight.calcUpdateHash());
    }

    if (hash.get() !== this._last_envlight_hash) {
      console.log("light update");
      this._last_envlight_hash = hash.get();
      this.resetSamples();
    }


    this.cache.drawStart(gl);

    let matrix = new Matrix4(this.getProjMat(camera, viewbox_size));
    let mat2 = new Matrix4();

    shiftx = (shiftx/viewbox_size[0])*0.5;
    shifty = (shifty/viewbox_size[1])*0.5;

    mat2.translate(shiftx, shifty, 0.0);
    matrix.preMultiply(mat2);

    let uniforms = {
      projectionMatrix : matrix,
      normalMatrix     : camera.normalmat,
      viewportSize     : viewbox_size,
      ambientColor     : scene.envlight.color,
      ambientPower     : scene.envlight.power,
      uSample          : this.uSample+1
    };

    if (this.aoPass) {
      let ao = this.aoPass.getOutput();
      uniforms.passAO = ao.texColor;
    } else {
      uniforms.passAO = this.getNullTex(gl);
    }

    //this.getPass(this.aoPass, uniforms);

    LightGen.setUniforms(gl, uniforms, scene, this.lights, true, this.uSample+1);
    window._debug_uniforms = uniforms;

    let updateMat = (mat) => {
      let hash = mat.calcUpdateHash();


      if (mat._shadergen !== this.shaderUpdateGen) {
        mat._shadergen = this.shaderUpdateGen;
        console.log("material recompile");
        mat._regen = 1;
      }

      if (hash !== mat._last_update_hash) {

        //note that the update hash changes on shader uniform changes as well as
        //code changes, so we don't call mat.flagRegen()

        console.log("Material uniform change");
        mat._last_update_hash = hash;
        this.queueResetSamples();
      }

      if (mat._regen && this.cache.has(mat.lib_id)) {
        this.cache.get(mat.lib_id).destroy(gl);
        this.cache.remove(mat.lib_id);
      }

      let program;

      if (this.cache.has(mat.lib_id)) {
        program = this.cache.get(mat.lib_id);
      } else {
        let defines = "";
        if (this.renderSettings.ao) {
          defines += "#define WITH_AO\n";
        }

        let shaderdef = mat.generate(scene, this.lights, defines);

        window._debug_shaderdef = shaderdef;

        program = shaderdef.compile(gl);
        program.shaderdef = shaderdef;

        this.cache.add(gl, mat.lib_id, program);
        this.queueResetSamples();
      }

      if (program !== undefined) {
        mat._program = program;
        program.shaderdef.setUniforms(mat.graph, program.uniforms);
      }
    }

    for (let ob of scene.objects.renderable) {
      if (!ob.data.usesMaterial) {
        continue;
      }

      let mat = ob.data.materials[0];
      let program;

      mat = mat === undefined ? ob.data.materials.active : mat;

      for (let mat of ob.data.materials) {
        updateMat(mat);
      }

      //TODO handle multiple materials properly
      if (ob.data.materials.length > 0) {
        program = ob.data.materials[0]._program;
      } else {
        continue;
      }

      uniforms.objectMatrix = ob.outputs.matrix.getValue();

      ob.draw(view3d, gl, uniforms, program);
    }

    this.cache.drawEnd(gl);
    return matrix;
  }

  destroy(gl) {
    this.cache.destroy(gl);
  }
};

RenderEngine.register(RealtimeEngine);

