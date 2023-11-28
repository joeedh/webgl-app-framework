import { CustomDataElem, ICustomDataElemDef } from "../mesh/customdata";
export declare enum KnotFlags {
}
export declare class KnotDataLayer extends CustomDataElem<number> {
    static STRUCT: string;
    knot: number;
    computedKnot: number;
    flag: KnotFlags;
    tilt: number;
    constructor();
    static apiDefine(api: any, dstruct: any): void;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
    static define(): ICustomDataElemDef;
}
export declare function getKnot(v: any): KnotDataLayer;
