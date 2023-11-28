export const PCOS: 0;
export const PEID: number;
export const PCOLOR: number;
export const PTOT: number;
export class PatchList {
    patchdata: any[];
    eidmap: {};
    gltex: any;
    texdimen: any;
    destroy(gl: any): void;
}
export class PatchData {
    ps: Float64Array;
    ns: Float64Array;
    eid: number;
    i: number;
    color: number[];
    flag: number;
}
