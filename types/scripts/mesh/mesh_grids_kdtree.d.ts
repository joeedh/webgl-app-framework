export const VMAXE: 16;
export const VMAXN: 16;
export const EMAXN: 16;
export namespace VMapFields {
    export { VINDEX };
    export { VU };
    export { VV };
    export { VP };
    export { VTOTE };
    export { VTOTN };
    export { VTOT };
}
export namespace EMapFields {
    export { EINDEX };
    export { EID };
    export { EV1 };
    export { EV2 };
    export { ETOTN };
    export { ETOT };
}
export namespace KdTreeFields {
    export let QFLAG: number;
    export let QCHILD1: number;
    export let QCHILD2: number;
    export let QMINU: number;
    export let QMINV: number;
    export let QMAXU: number;
    export let QMAXV: number;
    export let QCENTU: number;
    export let QCENTV: number;
    export let QDEPTH: number;
    export let QPOINT1: number;
    export let QPOINT2: number;
    export let QPOINT3: number;
    export let QPOINT4: number;
    export let QID: number;
    export let QPARENT: number;
    export let QSUBTREE_DEPTH: number;
    export let QPARENTIDX: number;
    export let QPOLYSTART: number;
    export let QPOLYEND: number;
    export let QNX: number;
    export let QNY: number;
    export let QNZ: number;
    export let QTX: number;
    export let QTY: number;
    export let QTZ: number;
    export let QBX: number;
    export let QBY: number;
    export let QBZ: number;
    export let QCENTX: number;
    export let QCENTY: number;
    export let QCENTZ: number;
    export let QAXIS: number;
    export let QSPLIT: number;
    export { a as QTOT };
}
export class UVMap extends Array<any> {
    constructor(dimen: any);
    _len: number;
    dimen: any;
    size: number;
    reset(dimen: any): this;
    clear(): this;
    has(i: any): boolean;
    set(i: any, val: any): boolean;
    get(i: any): any;
    delete(i: any): boolean;
}
export class CompressedKdNode {
    static fromNodes(ns: any): CompressedKdNode[];
}
export namespace CompressedKdNode {
    let fields: {};
    let STRUCT: string;
}
export namespace KdTreeFlags {
    let SELECT: number;
    let LEAF: number;
    let DEAD: number;
    let TEMP: number;
    let TEMP2: number;
}
export class KdTreeGrid extends GridBase {
    static define(): {
        elemTypeMask: MeshTypes;
        typeName: string;
        settingsClass: typeof GridSettings;
        uiTypeName: string;
        defaultName: string;
        valueSize: any;
        flag: number;
    };
    leafPoints: any[];
    leafNodes: any[];
    depthLimit: number;
    depthLimitEnabled: boolean;
    normalQuad: Vector3[];
    _uvmap: UVMap;
    loopEid: number;
    pmap: Map<any, any>;
    nodes: any[];
    freelist: any[];
    polys: any[];
    nodeFieldSize: number;
    subdtemps: util.cachering;
    hash(): number;
    _saveNodes(): CompressedKdNode[];
    copyTo(b: any, copy_eids?: boolean): void;
    getNormalQuad(loop: any): any;
    getQuad(loop: any): any;
    smoothPoint(v: any, fac?: number): void;
    stitchBoundaries(): void;
    _hashPoint(u: any, v: any): any;
    _getPoint(u: any, v: any, loopEid: any, mesh: any, isNewOut: any): any;
    _getUV(ni: any, pidx: any): any;
    _rebuildHash(): void;
    _freeNode(ni: any): void;
    _newNode(): any;
    _ensureNodePoint(ni: any, pidx: any, loopEid: any, mesh: any, isNewOut: any): any;
    init(dimen: any, mesh: any, loop: any, cd_grid: any): this;
    topo: any;
    recalcFlag: number;
    printNodes(): string;
    flagTopoRecalc(): void;
    flagNeighborRecalc(): void;
    getTopo(mesh: any, cd_grid: any): any;
    updateMirrorFlag(mesh: any, p: any, isboundary?: boolean): void;
    compactNodes(): void;
    evaluate(u: any, v: any, startNi?: number, depthLimit?: any): any;
    findNode(u: any, v: any, startNi?: number, depthLimit?: any): number;
    buildTangentMatrix(ni: any, u1: any, v1: any, matOut: any): void;
    buildTangentMatrix1(ni: any, u1: any, v1: any, matOut: any): void;
    invertTangentMatrix(mat: any): void;
    tangentToGlobalSS(inverse?: boolean): void;
    globalToTangentSS(): void;
    subdivideAll(mesh: any, loop: any, cd_grid: any): void;
    subdivideAll_intern(mesh: any, loop: any, cd_grid: any): void;
    tangentToGlobal(level?: number, inverse?: boolean): void;
    globalToTangent(level?: number): void;
    _changeMresSettings(depthLimit: any, enabled: any): void;
    mresUp(): void;
    mresDown(): void;
    checkMultiRes(mesh: any, loop: any, cd_grid: any): void;
    update(mesh: any, loop: any, cd_grid: any, _ignore_mres?: boolean): void;
    rebuildNodePolys(mesh: any, l: any, cd_grid: any): {
        vmap: any;
        emap: any;
        dimen: any;
        uvmap: any;
    };
    pruneDeadPoints(mesh: any, l: any, cd_grid: any): void;
    collapse(ni: any): void;
    enforceNeighborDepthLimit(mesh: any, l: any, cd_grid: any): boolean;
    enforceNeighborDepthLimit_intern(mesh: any, l: any, cd_grid: any): boolean;
    subdivide(ni: any, loopEid: any, mesh: any): void;
    _subdivide_intern(ni: any, loopEid: any, mesh: any): void;
    _ensure(mesh: any, loop: any, cd_grid: any): void;
    _updateNormal(ni: any): void;
    checkVertNormals(mesh: any, loop: any, cd_grid: any): boolean;
    checkNodeNormals(): void;
    getLeafPoints(): any[] | Set<any>;
    getLeafNodes(): any[];
    addTriNeighbors(): void;
    updateNormalQuad(loop: any): void;
    uvColorTest(mesh: any, loop: any, cd_grid: any): void;
    idmul: number;
    _loadCompressedNodes(ns1?: any[]): void;
    _testNodeCompression(): void;
}
export namespace KdTreeGrid {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
declare const VINDEX: 0;
declare const VU: 1;
declare const VV: 2;
declare const VP: 3;
declare const VTOTE: 4;
declare const VTOTN: number;
declare const VTOT: number;
declare const EINDEX: 0;
declare const EID: 1;
declare const EV1: 2;
declare const EV2: 3;
declare const ETOTN: 4;
declare const ETOT: number;
declare let a: number;
import { GridBase } from "./mesh_grids.js";
import { Vector3 } from "../path.ux/scripts/pathux.js";
import * as util from "../util/util.js";
import { MeshTypes } from "./mesh_base.js";
import { GridSettings } from "./mesh_grids.js";
export {};
