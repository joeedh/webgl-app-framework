import * as util from '../../../util/util.js'
import {TransDataTypes} from './transform_base.js'
import {aabb_union} from '../../../util/math.js'
import {Vector3, Matrix4} from '../../../util/vectormath.js'
import {cachering} from '../../../util/util.js'

let cent_rets = cachering.fromConstructor(Vector3, 64)

let calcTransCenter_rets = new util.cachering(() => {
  return {
    spaceMatrix: new Matrix4(),
    center     : new Vector3(),
    totelem    : -1,
  }
}, 512)

export function calcTransAABB(ctx, selmode) {
  let ret = undefined

  for (let type of TransDataTypes) {
    if (!type.isValid(ctx)) {
      continue
    }
    let aabb = type.calcAABB(ctx, selmode)

    if (aabb === undefined) continue

    if (ret !== undefined) {
      aabb_union(ret, aabb)
    } else {
      ret = [new Vector3(aabb[0]), new Vector3(aabb[1])]
    }
  }

  return ret
}
/**
 *
 * @param ctx
 * @param selmask
 * @param transform_space : integer. Constraint space.  One of transform_base.js:ConstraintSpaces.
 * @param aabb_out : List of two Vector3s to be filled with min/max of aabb
 */
export function calcTransCenter(ctx, selmask, transform_space, aabb_out = undefined) {
  let cent = cent_rets.next().zero()
  let tot = 0.0

  let ret = calcTransCenter_rets.next()
  ret.spaceMatrix.makeIdentity()

  for (let type of TransDataTypes) {
    let cent2 = type.getCenter(ctx, [], selmask, transform_space, ret.spaceMatrix)
    if (cent2 !== undefined) {
      cent.add(cent2)
      tot++
    }
  }

  if (tot > 0.0) {
    cent.mulScalar(1.0 / tot)
  }

  ret.center.load(cent)

  if (aabb_out) {
    let aabb = calcTransAABB(ctx)

    if (aabb !== undefined) {
      aabb_out[0].load(aabb[0])
      aabb_out[1].load(aabb[1])
    } else {
      aabb_out[0].zero()
      aabb_out[1].zero()
    }
  }

  return ret
}

/**
 *
 * @param ctx
 * @param selmask
 * @param transform_space : integer. Constraint space.  One of transform_base.js:ConstraintSpaces.
 * @param aabb_out : List of two Vector3s to be filled with min/max of aabb
 */
export function calcTransMatrix(ctx, selmask, transform_space) {
  let ret = calcTransCenter_rets.next()
  ret.spaceMatrix.makeIdentity()

  for (let type of TransDataTypes) {
    let mat = type.getOriginMatrix(ctx, [], selmask, transform_space, ret.spaceMatrix)
    if (mat !== undefined) {
      return ret.spaceMatrix
    }
  }

  return new Matrix4()
}
