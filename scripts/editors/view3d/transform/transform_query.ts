import {TransDataTypes} from './transform_base.js'
import {aabb_union} from '../../../util/math.js'
import {Vector3, Matrix4} from '../../../util/vectormath.js'
import {cachering} from '../../../util/util.js'
import type {ToolContext} from '../../../core/context.js'

const cent_rets = cachering.fromConstructor(Vector3, 64)

export interface TransCenterResult {
  spaceMatrix: Matrix4
  center: Vector3
  totelem: number
}

const calcTransCenter_rets = new cachering<TransCenterResult>(() => {
  return {
    spaceMatrix: new Matrix4(),
    center     : new Vector3(),
    totelem    : -1,
  }
}, 512)

export function calcTransAABB(ctx: ToolContext, selmode: number): [Vector3, Vector3] | undefined {
  let ret: [Vector3, Vector3] | undefined = undefined

  for (const type of TransDataTypes) {
    if (!type.isValid(ctx)) {
      continue
    }
    const aabb = type.calcAABB(ctx, selmode)

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
 * @param transform_space : integer. Constraint space.  One of transform_base.ts:ConstraintSpaces.
 * @param aabb_out : List of two Vector3s to be filled with min/max of aabb
 */
export function calcTransCenter(
  ctx: ToolContext,
  selmask: number,
  transform_space: number,
  aabb_out?: [Vector3, Vector3]
): TransCenterResult {
  const cent = cent_rets.next().zero()
  let tot = 0.0

  const ret = calcTransCenter_rets.next()
  ret.spaceMatrix.makeIdentity()

  for (const type of TransDataTypes) {
    const cent2 = type.getCenter(ctx, [], selmask, transform_space, ret.spaceMatrix)
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
    const aabb = calcTransAABB(ctx, selmask)

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
 * @param transform_space : integer. Constraint space.  One of transform_base.ts:ConstraintSpaces.
 */
export function calcTransMatrix(ctx: ToolContext, selmask: number, transform_space: number): Matrix4 {
  const ret = calcTransCenter_rets.next()
  ret.spaceMatrix.makeIdentity()

  for (const type of TransDataTypes) {
    const mat = type.getOriginMatrix(ctx, [], selmask, transform_space, ret.spaceMatrix)
    if (mat !== undefined) {
      return ret.spaceMatrix
    }
  }

  return new Matrix4()
}
