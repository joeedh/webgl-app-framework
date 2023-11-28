export class FindnearestMesh extends FindnearestClass {
    static drawIDs(view3d: any, gl: any, uniforms: any, object: any, mesh: any): boolean;
    static castViewRay_framebuffer(ctx: any, selectMask: any, p: any, view3d: any, mode?: number): FindNearestRet[];
    static castViewRay(ctx: any, selectMask: any, p: any, view3d: any, mode?: number, ...args: any[]): FindNearestRet[];
    static getSearchOrder(n: any): any;
    static castScreenCircle(ctx: any, selmask: any, mpos: any, radius: any, view3d: any): {
        elements: any[];
        elementObjects: any[];
    };
    static findnearest_pbvh(ctx: any, selmask: any, mpos: any, view3d: any, limit?: number, depth?: number): any;
    static findnearest(ctx: any, selmask: any, mpos: any, view3d: any, limit?: number, ...args: any[]): any;
}
import { FindnearestClass } from '../findnearest.js';
import { FindNearestRet } from "../findnearest.js";
