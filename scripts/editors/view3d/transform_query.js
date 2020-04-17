import * as util from '../../util/util.js';
import {keymap} from '../../path.ux/scripts/simple_events.js';
import {TransDataElem, TransformData, TransDataType, PropModes, TransDataTypes, TransDataList} from "./transform_base.js";
import {MeshTransType} from "./transform_types.js";
import {ToolOp, UndoFlags} from "../../path.ux/scripts/simple_toolsys.js";
import {IntProperty, FlagProperty, EnumProperty,
  Vec3Property, Mat4Property, FloatProperty,
  BoolProperty, PropFlags, PropTypes, PropSubTypes
} from "../../path.ux/scripts/toolprop.js";
import {SelMask} from './selectmode.js';
import {aabb_union} from '../../util/math.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {View3DOp} from './view3d_ops.js';
import {isect_ray_plane} from '../../path.ux/scripts/math.js';
import {cachering} from '../../util/util.js';
import {ConstraintSpaces} from './transform_base.js';

let cent_rets = cachering.fromConstructor(Vector3, 64);

let calcTransCenter_rets = new util.cachering(() => {
  return {
    spaceMatrix : new Matrix4(),
    center      : new Vector3(),
    totelem     : -1
  }
}, 512);

export function calcTransAABB(ctx, selmode) {
  let ret = undefined;

  for (let type of TransDataTypes) {
    let aabb = type.calcAABB(ctx, selmode);

    if (aabb === undefined)
      continue;

    if (ret !== undefined) {
      aabb_union(ret, aabb)
    } else {
      ret = aabb;
    }
  }

  return ret;
}
/**
 *
 * @param ctx
 * @param selmask
 * @param transform_space : integer. Constraint space.  One of transform_base.js:ConstraintSpaces.
 * @param aabb_out : List of two Vector3s to be filled with min/max of aabb
 */
export function calcTransCenter(ctx, selmask, transform_space, aabb_out) {
  let cent = cent_rets.next().zero();
  let tot = 0.0;

  let ret = calcTransCenter_rets.next();
  ret.spaceMatrix.makeIdentity();

  for (let type of TransDataTypes) {
    let cent2 = type.getCenter(ctx, selmask, transform_space, ret.spaceMatrix);
    if (cent2 !== undefined) {
      cent.add(cent2);
      tot++;
    }
  }

  if (tot > 0.0) {
    cent.mulScalar(1.0 / tot);
  }

  ret.center.load(cent);

  if (aabb_out) {
    let aabb = calcTransAABB(ctx);

    if (aabb !== undefined) {
      aabb_out[0].load(aabb[0]);
      aabb_out[1].load(aabb[1]);
    } else {
      aabb_out[0].zero();
      aabb_out[1].zero();
    }
  }

  return ret;
}
