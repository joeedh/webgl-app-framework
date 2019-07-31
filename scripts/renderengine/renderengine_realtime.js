import {DataBlock, DataRef} from '../core/lib_api.js';
import {loadShader, Shaders} from '../editors/view3d/view3d_shaders.js';
import {LightGen} from '../shadernodes/shader_lib.js';
import {FBO} from '../core/fbo.js';
import {FBOSocket, RenderContext, RenderGraph, RenderPass} from "./renderpass.js";
import {BasePass, NormalPass, OutputPass, AOPass, BlurPass} from "./realtime_passes.js";
import {Texture} from '../core/webgl.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {SceneObject, ObjectFlags} from '../core/sceneobject.js';
import {RenderEngine} from "./renderengine_base.js";
import {Mesh} from '../mesh/mesh.js';
import {BasicFileOp} from "../core/appstate.js";

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

let nulltex = undefined;

export class RealtimeEngine extends RenderEngine {
  constructor(view3d) {
    super();

    this.view3d = view3d;
    this.cache = new ShaderCache();
    this.rendergraph = new RenderGraph();

    let base = this.basePass = new BasePass();
    let nor = this.norPass = new NormalPass();
    let out = this.outPass = new OutputPass();
    let ao = this.aoPass = new AOPass();

    let blurx = new BlurPass();
    let blury = new BlurPass();

    this.aoPass = blury;

    //let test = new TestPass();


    this.rendergraph.add(nor);
    this.rendergraph.add(out);
    this.rendergraph.add(ao);
    this.rendergraph.add(blurx);
    this.rendergraph.add(blury);
    this.rendergraph.add(base);

    blury.inputs.axis.setValue(1);

    nor.outputs.fbo.connect(ao.inputs.fbo);

    ao.outputs.fbo.connect(blurx.inputs.fbo);
    blurx.outputs.fbo.connect(blury.inputs.fbo);
    //blury.outputs.fbo.connect(out.inputs.fbo);

    blury.outputs.fbo.connect(base.inputs.ao);
    nor.outputs.fbo.connect(base.inputs.normal);

    base.outputs.fbo.connect(out.inputs.fbo);

    //pass.outputs.fbo.connect(test.inputs.fbo);
  }

  update(gl) {

  }

  render(camera, gl, viewbox_pos, viewbox_size, scene) {
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

      rctx.drawFinalQuad(output.outputs.fbo.getValue());
    }
  }

  render_normals(camera, gl, viewbox_pos, viewbox_size, scene) {
    let uniforms = {
      projectionMatrix : camera.rendermat,
      normalMatrix     : camera.normalmat
    };

    LightGen.setUniforms(gl, uniforms, scene);
    window._debug_uniforms = uniforms;

    for (let ob of scene.objects.renderable) {
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      let mat = ob.data.materials[0];
      let program;

      program = Shaders.NormalPassShader;

      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      program.uniforms.objectMatrix = ob.outputs.matrix.getValue();
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

  render_intern(camera, gl, viewbox_pos, viewbox_size, scene) {
    this.cache.drawStart(gl);

    let uniforms = {
      projectionMatrix : camera.rendermat,
      normalMatrix     : camera.normalmat,
      viewportSize     : viewbox_size,
      ambientColor     : scene.envlight.color,
      ambientPower     : scene.envlight.power
    };

    console.log("ambient color", scene.envlight.color);

    let ao = this.aoPass.getOutput();
    if (ao.texColor) {
      uniforms.passAO = ao.texColor;
    } else {
      uniforms.passAO = this.getNullTex(gl);
    }

    //this.getPass(this.aoPass, uniforms);

    LightGen.setUniforms(gl, uniforms, scene);
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

