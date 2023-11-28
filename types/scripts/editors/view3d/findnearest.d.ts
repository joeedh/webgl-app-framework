/**
 * Finds geometry close to (screen-space) x/y
 * @param ctx : context
 * @param selectMask : see SelMask, what type of data to find
 * @param mpos : mouse position
 * @param view3d : View3D, defaults to ctx.view3d
 * @param limit : maximum distance in screen space from x/y
 * @returns {Array<FindNearestRet>}
 * @constructor
 */
export function FindNearest(ctx: any, selectMask: any, mpos: any, view3d?: any, limit?: number): Array<FindNearestRet>;
export class FindNearest {
    /**
     * Finds geometry close to (screen-space) x/y
     * @param ctx : context
     * @param selectMask : see SelMask, what type of data to find
     * @param mpos : mouse position
     * @param view3d : View3D, defaults to ctx.view3d
     * @param limit : maximum distance in screen space from x/y
     * @returns {Array<FindNearestRet>}
     * @constructor
     */
    constructor(ctx: any, selectMask: any, mpos: any, view3d?: any, limit?: number);
}
export function castViewRay(ctx: any, selectMask: any, mpos: any, view3d: any, mode?: number): any;
export namespace CastModes {
    let FRAMEBUFFER: number;
    let GEOMETRIC: number;
}
export const FindNearestTypes: any[];
export class FindNearestRet {
    data: any;
    _object: number;
    _mesh: number;
    p2d: Vector2;
    p3d: Vector3;
    dis: any;
    set object(arg: any);
    get object(): any;
    set mesh(arg: any);
    get mesh(): any;
    reset(): this;
}
export class FindnearestClass {
    static define(): {
        selectMask: number;
    };
    static drawsObjectExclusively(view3d: any, object: any): boolean;
    /**
     *
     * @param ctx
     * @param selectMask
     * @param mpos
     * @param view3d
     * @param limit
     *
     * @return array of 1 or more FindNearestRet instances
     */
    static findnearest(ctx: any, selectMask: any, mpos: any, view3d: any, limit?: number): void;
    /**
     *
     * @return array of 1 or more FindNearestRet instances
     */
    static castViewRay(ctx: any, selectMask: any, p: any, view3d: any, mode?: number): void;
    static register(cls: any): void;
    drawIDs(view3d: any, gl: any, uniforms: any, object: any, mesh: any): void;
}
import { Vector2 } from "../../util/vectormath.js";
import { Vector3 } from "../../util/vectormath.js";
