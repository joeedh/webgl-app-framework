export function voxelUnwrap(mesh: any, faces: any, cd_uv?: any, setSeams?: boolean, leafLimit?: number, depthLimit?: number, splitVar?: number): void;
export class CVElem extends CustomDataElem<any> {
    static define(): {
        typeName: string;
        uiTypeName: string;
        defaultName: string;
    };
    constructor();
    hasPins: boolean;
    corner: boolean;
    orig: Vector3;
    vel: Vector2;
    oldco: Vector2;
    oldvel: Vector2;
    tris: any;
    area: any;
    wind: any;
    bTangent: Vector3;
    copyTo(b: any): void;
    setValue(b: any): void;
    getValue(): this;
    clear(): void;
}
export namespace CVElem {
    let STRUCT: string;
}
export class UVIsland extends Set<any> {
    constructor();
    hasPins: boolean;
    hasSelLoops: boolean;
    boxcenter: Vector2;
    area: number;
    min: Vector2;
    max: Vector2;
}
export class UVWrangler {
    static _calcSeamHash(mesh: any, faces: any): number;
    static restoreOrRebuild(mesh: any, faces: any, wrangler: any, buildSeams: any): any;
    constructor(mesh: any, faces: any, cd_uv: any);
    mesh: any;
    needTopo: boolean;
    cd_uv: any;
    faces: Set<any>;
    loopMap: Map<any, any>;
    edgeMap: Map<any, any>;
    vertMap: Map<any, any>;
    islandLoopMap: Map<any, any>;
    islandFaceMap: Map<any, any>;
    islandVertMap: Map<any, any>;
    cellDimen: number;
    hashBounds: number[];
    hashWidth: number;
    hashWidthMul: number;
    cellSizeMul: number;
    snapLimit: number;
    shash: Map<any, any>;
    saved: boolean;
    _makeUVMesh(): any;
    uvMesh: any;
    cd_corner: any;
    cd_edge_seam: any;
    destroy(mesh: any): this;
    save(): void;
    _seamHash: any;
    restore(mesh: any): boolean;
    setCornerTags(): void;
    seamUVEdge(e: any): any;
    seamEdge(e: any): boolean;
    _getHashPoint(x: any, y: any): any;
    hashPoint(x: any, y: any): any;
    loadSnapLimit(limit: any): void;
    finish(): void;
    resetSpatialHash(limit?: number): void;
    shashAdd(l: any, uv: any): any;
    buildIslands(buildSeams?: boolean): this;
    islands: any[];
    buildTopologySeam(): void;
    buildBoundaryTangents(): void;
    isCorner(l: any): any;
    buildTopology(snap_threshold?: number): void;
    updateAABB(island: any): void;
    packIslands(ignorePinnedIslands?: boolean, islandsWithSelLoops?: boolean): void;
}
export class VoxelNode extends BVHNode {
    constructor(...args: any[]);
    avgNo: Vector3;
    avgNoTot: number;
    splitVar: number;
    splitTest(): boolean;
}
export class VoxelBVH extends BVH {
    constructor(...args: any[]);
}
export namespace VoxelBVH {
    export { VoxelNode as nodeClass };
}
import { CustomDataElem } from './customdata.js';
import { Vector3 } from '../util/vectormath.js';
import { Vector2 } from '../util/vectormath.js';
import { BVHNode } from '../util/bvh.js';
import { BVH } from '../util/bvh.js';
