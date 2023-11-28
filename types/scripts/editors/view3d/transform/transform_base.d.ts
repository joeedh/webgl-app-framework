export namespace ConstraintSpaces {
    let WORLD: number;
    let LOCAL: number;
    let NORMAL: number;
}
export namespace PropModes {
    let SMOOTH: number;
    let SHARP: number;
    let EXTRA_SHARP: number;
    let SPHERE: number;
    let LINEAR: number;
    let CONSTANT: number;
}
export class TransDataElem {
    constructor(typecls: any);
    data1: any;
    data2: any;
    no: any;
    mesh: any;
    index: number;
    symFlag: number;
    w: number;
    type: any;
}
export class TransDataList extends Array<any> {
    constructor(typeclass: any, data: any);
    type: any;
}
export class TransformData extends Array<any> {
    constructor();
    center: Vector3;
    scenter: Vector2;
}
export let TransDataTypes: any[];
export let TransDataMap: {};
export class TransDataType {
    static transformDefine(): {
        name: string;
        uiname: string;
        flag: number;
        icon: number;
    };
    static isValid(ctx: any, toolop: any): boolean;
    static buildTypesProp(default_value?: any): any;
    static getClass(name: any): any;
    static register(cls: any): void;
    static calcPropCurve(dis: any, propmode: any, propradius: any): any;
    static genData(ctx: any, selectmode: any, propmode: any, propradius: any, toolop: any): void;
    static applyTransform(ctx: any, elem: any, do_prop: any, matrix: any, toolop: any): void;
    static undoPre(ctx: any, elemlist: any): void;
    static undo(ctx: any, undodata: any): void;
    /**
     * @param ctx                : instance of ToolContext or a derived class
     * @param selmask            : SelMask
     * @param spacemode          : ConstraintSpaces
     * @param space_matrix_out   : Matrix4, optional, matrix to put constraint space in
     */
    static getCenter(ctx: any, list: any, selmask: any, spacemode: any, space_matrix_out: any, toolop: any): void;
    static calcAABB(ctx: any, toolop: any): void;
    static update(ctx: any, elemlist: any): void;
}
import { Vector3 } from '../../../util/vectormath.js';
import { Vector2 } from '../../../util/vectormath.js';
