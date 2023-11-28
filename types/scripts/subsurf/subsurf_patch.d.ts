export function bernstein(v: any, x: any, n: any): number;
export namespace bernstein {
    function derivative(v: any, x: any, n: any): number;
}
export function bspline(i: any, s: any, degree: any): any;
export namespace bspline {
    function derivative(i: any, s: any, degree: any): number;
}
export namespace CubicPatchFields {
    export { KPOINTS };
    export { KTOT };
}
export namespace CubicPatchFlags {
    let SELECT: number;
    let UPDATE: number;
}
export class PatchBase {
    buildTangentMatrix(u: any, v: any, matOut?: any): any;
    evaluate(u: any, v: any, dv_u_out: any, dv_v_out: any, normal_out: any): void;
}
export class CubicPatch extends PatchBase {
    _patch: Float64Array;
    evaluate_rets: util.cachering;
    dv_rets: util.cachering;
    dv2_rets: util.cachering;
    normal_rets: util.cachering;
    basis: typeof bspline;
    scratchu: Vector3;
    scratchv: Vector3;
    pointTots: any[];
    setPoint(x: any, y: any, p: any): this;
    addPoint(x: any, y: any, p: any, increment?: boolean, fac?: number): this;
    finishPoints(): void;
    mulScalarPoint(x: any, y: any, f: any): this;
    getPoint(x: any, y: any): any;
    evaluate(u: any, v: any, dv_u_out: any, dv_v_out: any, normal_out: any): any;
    derivative(u: any, v: any): void;
    derivative2(u: any, v: any): void;
    normal(u: any, v: any): void;
}
export class SSPatch {
    constructor(patch: any, loop: any);
    patch: any;
    l: any;
    evaluate(u: any, v: any, dv_u: any, dv_v: any, norout: any): any;
    derivative(u: any, v: any): any;
    derivative2(u: any, v: any): any;
    normal(u: any, v: any): any;
}
export class Patch4 extends PatchBase {
    constructor(p1: any, p2: any, p3: any, p4: any);
    patches: any[];
    dv_urets: util.cachering;
    dv_vrets: util.cachering;
    nor_rets: util.cachering;
    evaluate(u: any, v: any, dv_u: any, dv_v: any, norout: any): any;
    derivativeU(u: any, v: any): any;
    derivativeV(u: any, v: any): any;
    normal(u: any, v: any): any;
}
declare let KPOINTS: number;
declare let KTOT: number;
import * as util from '../util/util.js';
import { Vector3 } from '../util/vectormath.js';
export {};
