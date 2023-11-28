export class FindnearestObject extends FindnearestClass {
    static drawIDs(view3d: any, gl: any, uniforms: any, object: any, mesh: any): void;
    static castViewRay_framebuffer(ctx: any, selectMask: any, p: any, view3d: any, mode?: number): FindNearestRet[];
    static castViewRay(ctx: any, selectMask: any, p: any, view3d: any, mode?: number, ...args: any[]): FindNearestRet[];
    static findnearest(ctx: any, selmask: any, mpos: any, view3d: any, limit?: number): FindNearestRet[];
}
import { FindnearestClass } from '../findnearest.js';
import { FindNearestRet } from "../findnearest.js";
