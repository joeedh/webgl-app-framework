export class GPUSelectBuffer {
    regen: boolean;
    pos: Vector2;
    size: Vector2;
    fbo: FBO;
    idbuf: Float32Array;
    depth_fbo: FBO;
    _last_hash: any;
    _last_selmask: any;
    dirty(): void;
    destroy(gl: any): void;
    gen(ctx: any, gl: any, view3d: any): void;
    depthbuf: Float32Array;
    draw(ctx: any, gl: any, view3d: any, selmask?: any): void;
    sampleBlock(ctx: any, gl: any, view3d: any, x: any, y: any, w?: number, h?: number, sampleDepth?: boolean, selmask?: any): {
        data: Float32Array;
        depthData: Float32Array;
        order: any;
    } | {
        data: Float32Array;
        order: any;
        depthData?: undefined;
    };
    getSearchOrder(n: any): any;
    _check(ctx: any, gl: any, view3d: any, selmask?: any): void;
    sampleBlock_intern(ctx: any, gl: any, view3d: any, x: any, y: any, w?: number, h?: number, sampleDepth?: boolean, selmask?: any, ...args: any[]): {
        data: Float32Array;
        depthData: Float32Array;
        order: any;
    } | {
        data: Float32Array;
        order: any;
        depthData?: undefined;
    };
    sampleBlock_intern_old(ctx: any, gl: any, view3d: any, x: any, y: any, w?: number, h?: number, sampleDepth?: boolean, selmask?: any): {
        data: Float32Array;
        depthData: Float32Array;
        order: any;
    } | {
        data: Float32Array;
        order: any;
        depthData?: undefined;
    };
}
import { Vector2 } from '../../util/vectormath.js';
import { FBO } from "../../core/fbo.js";
