export function calcTransAABB(ctx: any, selmode: any): Vector3[];
/**
 *
 * @param ctx
 * @param selmask
 * @param transform_space : integer. Constraint space.  One of transform_base.js:ConstraintSpaces.
 * @param aabb_out : List of two Vector3s to be filled with min/max of aabb
 */
export function calcTransCenter(ctx: any, selmask: any, transform_space: any, aabb_out: any): any;
/**
 *
 * @param ctx
 * @param selmask
 * @param transform_space : integer. Constraint space.  One of transform_base.js:ConstraintSpaces.
 * @param aabb_out : List of two Vector3s to be filled with min/max of aabb
 */
export function calcTransMatrix(ctx: any, selmask: any, transform_space: any, aabb_out: any): any;
import { Vector3 } from '../../../util/vectormath.js';
