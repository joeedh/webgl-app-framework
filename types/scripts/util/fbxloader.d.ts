export function loadBinaryFBX(data: any): FBXData;
export function loadTextFBX(data: any): void;
export function isBinaryFBX(data: any): boolean;
/** data is a DataView */
export function loadFBX(data: any): void | FBXData;
export class FBXFileError extends Error {
}
export class TempList extends Array<any> {
    constructor(idmap: any, datablocks: any);
    namemap: {};
    idmap: any;
    datablocks: any;
    push(id: any, item: any, name?: any): void;
}
export class FBXData {
    constructor(version: any);
    version: any;
    root: any;
    nodes: any[];
    idmap: {};
    datablocks: any[];
    geometries: TempList;
    sceneobjects: TempList;
    materials: TempList;
    add(node: any): void;
    loadGeometry(node: any): Mesh;
    finish(): void;
    instance(datalib: any, scene: any): void;
}
export namespace PropTypes {
    let INT16: string;
    let BOOL: string;
    let INT32: string;
    let FLOAT32: string;
    let FLOAT64: string;
    let INT64: string;
    let INT16_ARRAY: string;
    let BOOL_ARRAY: string;
    let INT32_ARRAY: string;
    let FLOAT32_ARRAY: string;
    let FLOAT64_ARRAY: string;
    let INT64_ARRAY: string;
    let STRING: string;
    let BINARY: string;
}
export namespace PropSizes {
    let Y: number;
    let C: number;
    let I: number;
    let F: number;
    let D: number;
    let L: number;
    let y: number;
    let b: number;
    let i: number;
    let f: number;
    let d: number;
    let l: number;
}
export namespace ArrayTypeMap {
    let y_1: string;
    export { y_1 as y };
    let i_1: string;
    export { i_1 as i };
    let l_1: string;
    export { l_1 as l };
    let d_1: string;
    export { d_1 as d };
    let f_1: string;
    export { f_1 as f };
    let b_1: string;
    export { b_1 as b };
}
export const ArrayTypes: Set<string>;
export const PropMap: {};
export let binaryMagicData: Uint8Array;
import { Mesh } from "../mesh/mesh.js";
