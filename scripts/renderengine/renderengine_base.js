import {DataBlock, DataRef} from '../core/lib_api.js';
import {loadShader} from '../shaders/shaders.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {SceneObject, ObjectFlags} from '../sceneobject/sceneobject.js';

export class RenderEngine {
  update(gl, view3d) {

  }

  resetRender() {

  }

  render(camera, gl, viewbox_pos, viewbox_size, scene) {

  }

  destroy(gl) {

  }

  static register(cls) {
    this.engines.push(cls);
  }
};
RenderEngine.engines = [];
