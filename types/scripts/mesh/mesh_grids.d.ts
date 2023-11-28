export function getNeighborMap(dimen: any): any;
export function genGridDimens(depth?: number): number[];
export namespace QRecalcFlags {
    let POLYS: number;
    let TOPO: number;
    let POINT_PRUNE: number;
    let NEIGHBORS: number;
    let MIRROR: number;
    let CHECK_CUSTOMDATA: number;
    let POINTHASH: number;
    let VERT_NORMALS: number;
    let NODE_NORMALS: number;
    let NORMALS: number;
    let INDICES: number;
    let LEAF_POINTS: number;
    let LEAF_NODES: number;
    let LEAVES: number;
    let PATCH_UVS: number;
    let REGEN_IDS: number;
    let REGEN_EIDMAP: number;
    let FIX_NEIGHBORS: number;
    let NODE_DEPTH_DELTA: number;
    let ALL: number;
    let EVERYTHING: number;
}
export namespace GridSettingFlags {
    let SELECT: number;
    let ENABLE_DEPTH_LIMIT: number;
}
export class GridSettings extends LayerSettingsBase {
    static apiDefine(api: any): void;
    flag: number;
    depthLimit: number;
    _last_subsurf_key: string;
    _last_coords_hash: any;
    copyTo(b: any): void;
}
export namespace GridSettings {
    let STRUCT: string;
}
export class BLink {
    constructor(a: any, b?: any, t?: number);
    v1: any;
    v2: any;
    t: number;
    get(): any;
    getColor(cd_color: any): any;
}
export namespace NeighborKeys {
    let L: number;
    let LP: number;
    let LN: number;
    let LR: number;
    let LRP: number;
    let LRN: number;
    let LPR: number;
    let LNR: number;
}
export class ResolveValue {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
export class NeighborMap {
    constructor(dimen: any);
    dimen: any;
    maps: {
        [x: number]: number[][];
    };
    cases: {
        mask: number;
        l1: number;
        l2: number;
    }[];
    getmap(f: any, i: any): any;
    resolve(i1: any, l1: any, l2: any, l1mask: any, l2mask: any, i2?: any): any;
}
export class GridVert extends Vector3 {
    static getMemSize(p: any): number;
    constructor(index?: number, loopEid?: number, eid?: number);
    co: Vector3;
    no: Vector3;
    tan: Vector3;
    bin: Vector3;
    sco: Vector3;
    totsco: number;
    tot: number;
    uv: Vector2;
    flag: number;
    eid: number;
    index: number;
    index2: number;
    loopEid: number;
    customData: any[];
    cd: any[];
    neighbors: any[];
    bRingSet: Set<any>;
    bLink: any;
    bNext: any;
    bPrev: any;
    get length(): number;
    get bRing(): Set<any> | Generator<this, void, unknown>;
    startTan(): void;
    tanMulFac(depth: any): number;
    finishTan(): void;
    addTan(ns: any, ni: any, pidx: any): void;
    bRingInsert(v: any): void;
    bRingRemove(): void;
    load(b: any, coOnly?: boolean): this;
    _saveShortNormal(): number[];
}
export namespace GridVert {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export const gridSides: number[];
export class GridBase extends CustomDataElem<any> {
    static updateSubSurf(mesh: any, cd_grid: any, check_coords?: boolean): void;
    static recalcSubSurf(mesh: any, cd_grid: any): void;
    static patchUVLayerName(mesh: any, cd_grid: any): string;
    static hasPatchUVLayer(mesh: any, cd_grid: any): any;
    static getPatchUVLayer(mesh: any, cd_grid: any): any;
    static isGridClass(cls: any): boolean;
    static syncVertexLayers(mesh: any): void;
    static meshGridOffset(mesh: any): number;
    static calcCDLayout(mesh: any): (number | (new () => CustomDataElem<any>))[][];
    static initMesh(mesh: any, dimen: any, cd_grid?: any): void;
    constructor();
    cdmap: any[];
    cdmap_reverse: any[];
    _max_cd_i: number;
    totTris: number;
    dimen: number;
    customDataLayout: any[];
    points: any[];
    customDatas: any[];
    eidmap: {};
    needsSubSurf: boolean;
    subsurf: any;
    regenEIDMap(): void;
    getEIDMap(mesh: any): {};
    regenIds(mesh: any, loop: any, cd_grid: any): void;
    flagIdsRegen(): void;
    subdivideAll(): void;
    tangentToGlobal(depthLimit: any, inverse?: boolean): void;
    globalToTangent(depthLimit: any): void;
    initPatchUVLayer(mesh: any, l: any, cd_grid: any, cd_uv: any): void;
    recalcPointIndices(): this;
    recalcNormals(mesh: any, l: any, cd_grid: any): void;
    applyBase(mesh: any, l: any, cd_grid: any): void;
    debugDraw(gl: any, uniforms: any, ob: any): void;
    updateMirrorFlags(mesh: any, loop: any, cd_grid: any): void;
    initCDLayoutFromLoop(loop: any): void;
    /**
     strip any extra temporary data not needed
     in most situations
     */
    stripExtraData(): void;
    flagNormalsUpdate(): void;
    flagFixNeighbors(): void;
    update(mesh: any, loop: any, cd_grid: any): void;
    /** loop is allowed to be undefined, if not is used to init point positions */
    init(dimen: any, mesh: any, loop: any, cd_grid: any): void;
    onRemoveLayer(layercls: any, layer_i: any): void;
    onNewLayer(layercls: any, layer_i?: any): void;
    setValue(b: any): void;
    copyTo(b: any, copy_eids?: boolean): this;
    getValue(): this;
    makeDrawTris(mesh: any, smesh: any, loop: any, cd_grid: any): void;
    makeBVHTris(mesh: any, bvh: any, loop: any, cd_grid: any, trisout: any): void;
    fixNeighbors(mesh: any, loop: any, cd_grid: any): void;
    recalcNeighbors(mesh: any, loop: any, cd_grid: any): void;
    checkCustomDataLayout(mesh: any): void;
    relinkCustomData(): void;
    loadSTRUCT(reader: any): void;
}
export namespace GridBase {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class Grid extends GridBase {
    static define(): {
        elemTypeMask: MeshTypes;
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        settingsClass: typeof GridSettings;
        needsSubSurf: boolean;
        valueSize: any;
        flag: number;
    };
    hash(): number;
    getQuad(loop: any): any;
    clear(): this;
    recalcFlag: number;
    init(dimen: any, mesh: any, loop: any, cd_grid: any): this;
    _ensure(mesh: any, loop: any, cd_grid: any): void;
}
export namespace Grid {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
import { LayerSettingsBase } from "./customdata";
import { Vector3 } from '../util/vectormath.js';
import { Vector2 } from '../util/vectormath.js';
import { CustomDataElem } from "./customdata";
import { MeshTypes } from "./mesh_base.js";
