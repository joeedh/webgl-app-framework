export class AttachPoint {
    constructor(mode?: number);
    mode: number;
    co: any;
    ray: any;
    maxdis: number;
    flag: number;
    obj: any;
    dataLink(owner: any, getblock: any, getblock_us: any): void;
    loadSTRUCT(reader: any): void;
}
export namespace AttachPoint {
    let STRUCT: string;
}
export class Strand extends CurveSpline {
    flag: number;
    id: number;
    attachPoint: AttachPoint;
    dataLink(owner: any, _getblock: any, _getblock_us: any): void;
}
export namespace Strand {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
import { CurveSpline } from '../curve/curve.js';
