export function curvatureTest(mesh: any, cd_curvt: any, shell: any, mode: any): {
    verts: Set<any>;
    edges: Set<any>;
    loops: Set<any>;
    faces: Set<any>;
};
export function calcCurvShell(mesh: any, cd_curvt: any, shell: any, mode: any): void;
export function smoothParam(mesh: any, verts?: any): void;
export function calcCurvMesh(mesh: any, cd_curvt: any, mode?: number): void;
export namespace calcCurvModes {
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
    let SMOOTH_TAN: number;
}
export namespace WeightModes {
    let SIMPLE: number;
    let EDGE_LENGTH: number;
    let COTAN: number;
}
export class CurvVert2Settings extends LayerSettingsBase {
    static apiDefine(api: any): any;
    updateGen: number;
    smoothTangents: boolean;
    weightMode: number;
    copyTo(b: any): void;
}
export namespace CurvVert2Settings {
    let STRUCT: string;
}
export class CurvVert2 extends CustomDataElem<any> {
    static define(): {
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        valueSize: any;
        flag: number;
        settingsClass: typeof CurvVert2Settings;
    };
    constructor();
    error: number;
    errorvec: Vector3;
    lastd2k1: Vector3;
    lastd2k2: Vector3;
    lastd2k3: Vector3;
    no: Vector3;
    tan: Vector3;
    bin: Vector3;
    k1: number;
    k2: number;
    k3: number;
    d2k1: Vector3;
    d2k2: Vector3;
    d2k3: Vector3;
    dk1: Vector3;
    dk2: Vector3;
    dk3: Vector3;
    d3k1: Vector3;
    d3k2: Vector3;
    d3k3: Vector3;
    updateGen: number;
    needsSmooth: boolean;
    smoothTan: Vector3;
    totarea: number;
    k: number;
    wlist: any[];
    getValue(): Vector3;
    updateTangent(ps: any, owning_v: any, cd_curvt: any, noNorm?: boolean): void;
    smooth(ps: any, v: any, cd_curvt: any, fac?: number): void;
    interp(dest: any, datas: any, ws: any): void;
    updateWeights(ps: any, owning_v: any, cd_curvt: any): void;
    updateCotan(ps: any, owning_v: any, cd_curvt: any): void;
    mulScalar(f: any): this;
    clear(): this;
    add(b: any): this;
    addFac(b: any, fac: any): this;
    sub(b: any): this;
    setValue(v: any): void;
    loadSTRUCT(reader: any): void;
    copyTo(b: any): void;
}
export namespace CurvVert2 {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
import { LayerSettingsBase } from './customdata.ts';
import { CustomDataElem } from './customdata.ts';
import { Vector3 } from '../util/vectormath.js';
