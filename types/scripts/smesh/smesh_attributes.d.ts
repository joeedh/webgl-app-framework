export namespace AttrTypes {
    let FLOAT32: number;
    let FLOAT64: number;
    let INT32: number;
    let INT16: number;
    let INT8: number;
    let UINT32: number;
    let UINT16: number;
    let UINT8: number;
}
export const AttrSizes: {
    [x: number]: number;
};
export const AttrTypeClasses: {
    [x: number]: Float32ArrayConstructor | Float64ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor | Int8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor | Uint8ArrayConstructor;
};
export const AttrFlags: {};
export const arrayPool: util.ArrayPool;
export const AttrClasses: any[];
export class AttrDefineModel {
    constructor(obj?: {});
    typeName: any;
    uiName: any;
    dataType: any;
    dataCount: any;
    flag: any;
}
export class GeoAttr {
    static attrDefine: {
        typeName: string;
        uiName: string;
        dataType: number;
        dataCount: number;
        flag: number;
    };
    static bind(array: any): any;
    static _getAttrDef(): AttrDefineModel;
    static interp(array: any, desti: any, sources: any, ws: any): void;
    static copyTo(array: any, desti: any, srci: any): void;
    static getClass(typeName: any): any;
    static register(cls: any): void;
}
export class BoundVector3 {
    constructor(buf: any, byteOffset: any);
    load(b: any): this;
    0: any;
    1: any;
    2: any;
    loadXYZ(x: any, y: any, z: any): this;
    dot(b: any): number;
    multVecMatrix(matrix: any, ignore_w: any): any;
    cross(v: any): this;
    rot2d(A: any, axis: any): this;
}
export class Float3Attr extends GeoAttr {
    static attrDefine: {
        typeName: string;
        dataType: number;
        dataCount: number;
    };
    static bind(array: any): BoundVector3[];
}
export class Uint8Attr extends GeoAttr {
    static attrDefine: {
        typeName: string;
        dataType: number;
        dataCount: number;
    };
}
export class Int32Attr extends GeoAttr {
    static attrDefine: {
        typeName: string;
        dataType: number;
        dataCount: number;
    };
}
import * as util from '../util/util.js';
