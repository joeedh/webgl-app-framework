export function getCurveVerts(mesh: any): any;
export function initCurveVerts(mesh: any): any;
export function dirCurveSmooth(v: any, dir: any, fac: number, cd_curv: any): void;
export function dirCurveSmooth2(v: any, dir: any, fac: number, cd_curv: any): void;
export function dirCurveSmooth1(v: any, dir: any, fac?: number): void;
export function smoothCurvatures(mesh: any, vs?: any, fac?: number, projection?: number): void;
export namespace CVFlags {
    let UPDATE: number;
    let UV_BOUNDARY: number;
}
export class CurvVert extends CustomDataElem<any> {
    static apiDefine(api: any, dstruct: any): void;
    static propegateUpdateFlags(mesh: any, cd_curv: any): void;
    static define(): {
        elemTypeMask: number;
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        valueSize: number;
        flag: number;
        settingsClass: any;
    };
    constructor();
    tan: Vector3;
    dir: Vector3;
    diruv: Vector4;
    k1: number;
    k2: number;
    no: Vector3;
    flag: number;
    v: any;
    cokey: number;
    weight: number;
    covmat: Float64Array;
    _ignoreUpdate(v: any, cd_cotan: any): this;
    relaxUvCells(v: any, cd_curv: any): void;
    check(v: any, cd_cotan: any, forceCheck: boolean, cd_fset: any): this;
    transform(t1: any, t2: any, no: any): number;
    _blendStep(v: any, cd_cotan: any, cd_fset?: number): void;
    update(v: any, cd_cotan: any, cd_fset: any): this;
    _makeProjMat(v: any, cd_cotan: any): void;
    _finish(nmat: any, v: any, cd_cotan: any, cd_fset: any): void;
    setValue(b: any): void;
    getValue(): Vector3;
    copyTo(b: any): void;
    interp(dst: any, datas: any, ws: any): void;
}
export namespace CurvVert {
    let STRUCT: string;
}
import { CustomDataElem } from './customdata.js';
import { Vector3 } from '../util/vectormath.js';
import { Vector4 } from '../util/vectormath.js';
