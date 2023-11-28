export function cotangent_tri_weight_v3(v1: any, v2: any, v3: any): number;
export function tri_voronoi_area(p: any, q: any, r: any): number;
export namespace CotanVertFlags {
    let UPDATE: number;
}
export class CotanVert extends CustomDataElem<any> {
    static define(): {
        typeName: string;
        uiName: string;
        defaultName: string;
        valueSize: any;
        settingsClass: any;
    };
    constructor();
    ws: any[];
    cot1: any[];
    cot2: any[];
    areas: any[];
    totarea: number;
    _last_hash: number;
    flag: number;
    interp(dest: any, datas: any, ws: any): void;
    copyTo(b: any): void;
    check(v: any, cd_cotan: any): boolean;
    recalc(v: any): void;
    loadSTRUCT(reader: any): void;
}
export namespace CotanVert {
    let STRUCT: string;
}
import { CustomDataElem } from './customdata.js';
