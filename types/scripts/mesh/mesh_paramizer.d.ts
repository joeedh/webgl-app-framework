export function geodesic_distance_triangle(v0: any, v1: any, v2: any, dist1: any, dist2: any): any;
export function calcGeoDist(mesh: any, cd_pvert: any, shell: any, mode: any): {
    verts: Set<any>;
    edges: Set<any>;
    loops: Set<any>;
    faces: Set<any>;
};
export function testCurvatureMath(mesh: any, cd_pvert: any, shell: any, mode: any): {
    verts: Set<any>;
    edges: Set<any>;
    loops: Set<any>;
    faces: Set<any>;
};
export function paramizeShell(mesh: any, cd_pvert: any, shell: any, mode: any): void;
export function smoothParam(mesh: any, verts?: any): void;
export function paramizeMesh(mesh: any, cd_pvert: any, mode?: number): void;
export namespace ParamizeModes {
    let SELECTED: number;
    let MAX_Z: number;
}
export namespace KDrawModes {
    let NO: number;
    let TAN: number;
    let BIN: number;
    let DK1: number;
    let DK2: number;
    let DK3: number;
    let D2K1: number;
    let D2K2: number;
    let D2K3: number;
    let D3K1: number;
    let D3K2: number;
    let D3K3: number;
    let ERROR: number;
}
export namespace WeightModes {
    let SIMPLE: number;
    let EDGE_LENGTH: number;
    let COTAN: number;
}
export class ParamVertSettings extends LayerSettingsBase {
    static apiDefine(api: any): any;
    updateGen: number;
    smoothTangents: boolean;
    weightMode: number;
    copyTo(b: any): void;
}
export namespace ParamVertSettings {
    let STRUCT: string;
}
export class ParamVert extends CustomDataElem<any> {
    static define(): {
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        valueSize: any;
        flag: number;
        settingsClass: typeof ParamVertSettings;
    };
    constructor();
    updateGen: number;
    needsSmooth: boolean;
    disUV: Vector4;
    smoothTan: Vector3;
    totarea: number;
    wlist: any[];
    getValue(): Vector4;
    interp(dest: any, datas: any, ws: any): void;
    updateWeights(ps: any, owning_v: any, cd_pvert: any, cd_disp?: any): void;
    updateCotan(ps: any, owning_v: any, cd_pvert: any): void;
    smooth(ps: any, owning_v: any, cd_pvert: any, depth?: number): void;
    checkTangent(ps: any, owning_v: any, cd_pvert: any, noSmooth?: boolean): void;
    updateTangent(ps: any, owning_v: any, cd_pvert: any, noSmooth?: boolean, cd_disp?: any, noNorm?: boolean): void;
    mulScalar(f: any): this;
    clear(): this;
    add(b: any): this;
    addFac(b: any, fac: any): this;
    sub(b: any): this;
    setValue(v: any): void;
    loadSTRUCT(reader: any): void;
    copyTo(b: any): void;
}
export namespace ParamVert {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
import { LayerSettingsBase } from './customdata.js';
import { CustomDataElem } from './customdata.js';
import { Vector4 } from '../util/vectormath.js';
import { Vector3 } from '../util/vectormath.js';
