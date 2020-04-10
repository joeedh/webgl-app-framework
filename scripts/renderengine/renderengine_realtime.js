import {DataBlock, DataRef} from '../core/lib_api.js';
import {loadShader, Shaders} from '../editors/view3d/view3d_shaders.js';
import {LightGen} from '../shadernodes/shader_lib.js';
import {Light} from '../light/light.js';
import {FBO} from '../core/fbo.js';
import {FBOSocket, RenderContext, RenderGraph, RenderPass} from "./renderpass.js";
import {BasePass, NormalPass, AccumPass, OutputPass, AOPass, BlurPass, PassThruPass} from "./realtime_passes.js";
import {Texture, CubeTexture} from '../core/webgl.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {SceneObject, ObjectFlags} from '../core/sceneobject.js';
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
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      uniforms.object_id = ob.lib_id;
      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      uniforms.alpha = 1.0;
      uniforms.polygonOffset = 0.0;

      ob.draw(gl, uniforms, program);
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
  constructor(light) {
    this.light = light;
    this.shadowmap = undefined;
    this.co = new Vector3();
    this.seed = 0;

    if (light !== undefined) {
      this.calcCo();
    }
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

export class RealtimeEngine extends RenderEngine {
  constructor(view3d) {
    super();

    this.projmat = new Matrix4();
    this.lights = {};

    this.view3d = view3d;
    this.gl = view3d.gl;
    this.scene = view3d.ctx.scene;

    this.cache = new ShaderCache();
    this.rendergraph = new RenderGraph();
    this.uSample = 0.0;

    let base = this.basePass = new BasePass();
    let nor = this.norPass = new NormalPass();
    let out = this.outPass = new OutputPass();
    let accumOut = this.accumOutPass = new AccumPass();
    let passThru = this.passThru = new PassThruPass();
    let ao = this.aoPass = new AOPass();

    //let test = new TestPass();

    this.rendergraph.add(nor);
    this.rendergraph.add(out);
    this.rendergraph.add(base);

    nor.outputs.fbo.connect(ao.inputs.fbo);

    if (0) {
      this.rendergraph.add(ao);

      let blurx = new BlurPass();
      let blury = new BlurPass();

      this.aoPass = blury;

      this.rendergraph.add(blurx);
      this.rendergraph.add(blury);

      blury.inputs.axis.setValue(1);

      ao.outputs.fbo.connect(blurx.inputs.fbo);
      blurx.outputs.fbo.connect(blury.inputs.fbo);
      blury.outputs.fbo.connect(base.inputs.ao);
    } else {
      this.rendergraph.add(ao);
      this.aoPass = ao;
      ao.outputs.fbo.connect(base.inputs.ao);
    }

    nor.outputs.fbo.connect(base.inputs.normal);

    if (1) {
      this.rendergraph.add(accumOut);
      this.rendergraph.add(passThru);

      base.outputs.fbo.connect(accumOut.inputs.fbo);
      accumOut.outputs.fbo.connect(passThru.inputs.fbo);
      passThru.outputs.fbo.connect(out.inputs.fbo);
    } else {
      base.outputs.fbo.connect(out.inputs.fbo);
    }
  }

  update(gl) {

  }

  resetRender() {
    console.log("reset render frame");
    this.uSample = -1;
  }

  initLights() {
    let gl = this.gl, scene = this.scene;

    for (let light of this.scene.lights) {
      if (!(light.lib_id in this.lights)) {
        this.lights[light.lib_id] = new RenderLight(light);
      } else {
        this.lights[light.lib_id].update(light, this.uSample);
      }
    }
  }

  renderShadowMaps() {
    let gl = this.gl, scene = this.scene;

    for (let light of this.scene.lights) {
      let rlight = this.lights[light.lib_id];

      if (rlight === undefined) {
        console.warn("Render light missing", light.lib_id, light.name, light);
        continue;
      }

      let co = light.locationWorld;
      this.renderShadowCube(rlight, co)
    }
  }

  render(camera, gl, viewbox_pos, viewbox_size, scene) {
    this.scene = scene;
    this.gl = gl;
    this.camera = camera;

    this.uSample++;

    this.initLights();
    this.renderShadowMaps();

    this.rendergraph.exec(gl, this, viewbox_size, camera, scene);

    let graph = this.rendergraph.graph;
    let output;

    for (let node of graph.sortlist) {
      if (node instanceof OutputPass) {
        output = node;
        break;
      }
    }


    if (!output) {
      return;
    }

    if (output.outputs.fbo.getValue().texColor) {
      let rctx = this.rendergraph.rctx;

      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);

      rctx.drawFinalQuad(output.outputs.fbo.getValue());
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
    let uniforms = {
      projectionMatrix : this.getProjMat(camera, viewbox_size),
      normalMatrix     : camera.normalmat,
      uSample          : this.uSample
    };

    LightGen.setUniforms(gl, uniforms, scene, this.lights, true, this.uSample);
    window._debug_uniforms = uniforms;

    for (let ob of scene.objects.renderable) {
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      let mat = ob.data.materials[0];
      let program;

      program = Shaders.NormalPassShader;

      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      //program.uniforms.objectMatrix = ob.outputs.matrix.getValue();
      ob.draw(gl, uniforms, program);
    }
  }

  getNullTex(gl) {
    if (nulltex === undefined) {
      nulltex = gl.createTexture();
      nulltex = new Texture(undefined, nulltex);
    }

    return nulltex;
  }

  resetSamples() {
    console.log("Reset samples!");
    this.uSample = -1;
    //window.redraw_viewport();
  }

  render_intern(camera, gl, viewbox_pos, viewbox_size, scene) {
    this.cache.drawStart(gl);

    let uniforms = {
      projectionMatrix : this.getProjMat(camera, viewbox_size),
      normalMatrix     : camera.normalmat,
      viewportSize     : viewbox_size,
      ambientColor     : scene.envlight.color,
      ambientPower     : scene.envlight.power,
      uSample          : this.uSample
    };

    console.log("ambient color", scene.envlight.color);

    let ao = this.aoPass.getOutput();
    if (ao.texColor) {
      uniforms.passAO = ao.texColor;
    } else {
      uniforms.passAO = this.getNullTex(gl);
    }

    //this.getPass(this.aoPass, uniforms);

    LightGen.setUniforms(gl, uniforms, scene, this.lights, true, this.uSample);
    window._debug_uniforms = uniforms;

    for (let ob of scene.objects.renderable) {
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      let mat = ob.data.materials[0];
      let program;

      mat = mat === undefined ? ob.data.materials.active : mat;

      if (mat !== undefined) {
        if (mat._regen && this.cache.has(mat.lib_id)) {
          this.cache.get(mat.lib_id).destroy(gl);
          this.cache.remove(mat.lib_id);
        }

        if (this.cache.has(mat.lib_id)) {
          program = this.cache.get(mat.lib_id);
        } else {
          let shaderdef = mat.generate(scene);

          window._debug_shaderdef = shaderdef;

          program = shaderdef.compile(gl);
          program.shaderdef = shaderdef;

          this.cache.add(gl, mat.lib_id, program);
          this.resetSamples();
        }

        if (program !== undefined) {
          program.shaderdef.setUniforms(mat.graph, program.uniforms);
        }
      }

      if (program === undefined) {
        console.warn("no material");
        program = Shaders.BasicLitMesh;
      }

      uniforms.objectMatrix = ob.outputs.matrix.getValue();

      ob.draw(gl, uniforms, program);
    }

    this.cache.drawEnd(gl);
  }

  destroy(gl) {
    this.cache.destroy(gl);
  }
};

RenderEngine.register(RealtimeEngine);

