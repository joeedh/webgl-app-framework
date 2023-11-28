export class MultiGridSettings extends LayerSettingsBase {
}
export namespace MultiGridSettings {
    let STRUCT: string;
}
export namespace SmoothVertFlags {
    let SELECT: number;
    let SUPER: number;
    let QUEUED: number;
    let READY: number;
}
export class MultiGridData extends CustomDataElem<any> {
    static define(): {
        typeName: string;
        defaultName: string;
        uiName: string;
    };
    constructor();
    dco: Vector3;
    oldco: Vector3;
    co: Vector3;
    dis: number;
    geodis: number;
    v: any;
    neighbors: any[];
    weights: any[];
    island: any[];
    flag: number;
    area: number;
    sortNeighbors(owner: any): any[];
    copyTo(b: any): void;
}
export namespace MultiGridData {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class Smoother {
    static calcUpdateKey(mesh: any): string;
    static ensureSmoother(mesh: any, initAllVerts?: boolean, limitFactor?: any, forceCreate?: boolean): any;
    constructor(mesh: any);
    verts: any[];
    superVerts: any[];
    vqueue: any[];
    eidmap: {};
    limitFactor: any;
    adj: any[];
    mesh: any;
    cd_smooth: number;
    cd_name: string;
    dead: boolean;
    updateKey: string;
    init(mesh: any): this;
    destroy(): this;
    finish(): this;
    ensureVert(v: any, eid?: any): boolean;
    addVert(v: any, eid?: any): this;
    interp(superVerts?: any[]): void;
    update(): this;
    calcSuperVerts(): this;
    getSuperVerts(verts: any): Set<any>;
    smooth(superVerts: any[], fac: number, projection: any, repeat?: number): void;
}
export class MultiGridSmoother {
    static clearData(mesh: any): void;
    static ensureSmoother(mesh: any, initAllVerts?: boolean, limitFactor?: any, forceCreate?: boolean, levels?: any): any;
    constructor(mesh: any, levels?: number, limitFactor?: number);
    levels: Smoother[];
    verts: any[];
    eidmap: {};
    baseLimit: number;
    mesh: any;
    updateKey: string;
    init(mesh: any): this;
    destroy(): this;
    addVert(v: any, eid?: any): this;
    ensureVert(v: any, eid?: any): boolean;
    update(): this;
    getSuperVerts(vs: any): Set<any>;
    smooth(verts: any[], weightFunc: any, fac?: number, projection?: number, repeat?: number): this;
    finish(): this;
}
import { LayerSettingsBase } from './customdata.js';
import { CustomDataElem } from './customdata.js';
import { Vector3 } from '../util/vectormath.js';
