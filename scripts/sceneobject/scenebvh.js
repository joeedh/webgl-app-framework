import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';
import {MeshFeatures} from '../mesh/mesh_base.js';
import {ObjectFlags} from './sceneobject.js';

let vtmps = util.cachering.fromConstructor(Vector3, 512);
let mtmps = util.cachering.fromConstructor(Matrix4, 1024);
let v4tmps = util.cachering.fromConstructor(Vector4, 128);
let crvs = util.cachering.fromConstructor(Vector4, 64);

export const visibleMask = 0x7fffffff & ~ObjectFlags.HIDE;

export class SceneBVH {
  constructor(scene) {
    this.scene = scene;
  }

  _castRay(matrix, ob, origin, ray) {
    if (!(ob.data instanceof Mesh && (ob.data.flag & MeshFeatures.BVH))) {
      return undefined;
    }

    let bvh = ob.data.getBVH();
    origin = crvs.next().load(origin);
    ray = crvs.next().load(ray);

    origin[3] = 1.0;
    ray[3] = 0.0;

    origin.multVecMatrix(matrix);
    ray.multVecMatrix(matrix).normalize();

    return bvh.castRay(origin, ray);
  }

  castRay(origin, ray, mask=visibleMask, notMask=0) {
    let minret = undefined;
    let mat = mtmps.next();

    for (let ob of this.scene.objects) {
      let ok = !visibleMask || ((ob.flag && visibleMask) === visibleMask);
      ok = ok && !(ob.flag & notMask);
      if (!ok) {
        continue;
      }


      mat.load(ob.output.matrix.getValue());
      mat.invert();

      let ret = this._castRay(mat, ob, origin, ray);
      if (!ret || ret.t < 0) {
        continue;
      }

      if (!minret || ret.t < minret.t) {
        minret = ret;
      }
    }

    return minret;
  }
}
