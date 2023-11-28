export function getDynVerts(mesh: any): any;
export class BVHSettings {
    constructor(leafLimit?: number, drawLevelOffset?: number, depthLimit?: number);
    leafLimit: number;
    drawLevelOffset: number;
    depthLimit: number;
    _last_key: string;
    copyTo(b: any): void;
    calcUpdateKey(): string;
    load(b: any): this;
    copy(b: any): BVHSettings;
}
export namespace BVHSettings {
    let STRUCT: string;
}
export namespace BVHFlags {
    let UPDATE_DRAW: number;
    let TEMP_TAG: number;
    let UPDATE_UNIQUE_VERTS: number;
    let UPDATE_UNIQUE_VERTS_2: number;
    let UPDATE_NORMALS: number;
    let UPDATE_TOTTRI: number;
    let UPDATE_OTHER_VERTS: number;
    let UPDATE_INDEX_VERTS: number;
    let UPDATE_COLORS: number;
    let UPDATE_MASK: number;
    let UPDATE_BOUNDS: number;
    let UPDATE_ORIGCO_VERTS: number;
}
export namespace BVHTriFlags {
    let LOOPTRI_INVALID: number;
}
export class FakeSetIter {
    ret: {
        done: boolean;
        value: any;
    };
    fset: any;
    i: number;
    init(fset: any): this;
    next(): {
        done: boolean;
        value: any;
    };
}
export class FakeSet1 extends Array<any> {
    constructor();
    itercache: util.cachering;
    add(item: any): void;
    remove(): void;
    delete(item: any): this;
    [Symbol.iterator](): any;
}
export class BVHTri {
    constructor(id: any, tri_idx: any, f: any);
    seti: number;
    node: any;
    v1: any;
    v2: any;
    v3: any;
    l1: any;
    l2: any;
    l3: any;
    id: any;
    _id1: number;
    tri_idx: any;
    removed: boolean;
    flag: number;
    no: Vector3;
    area: number;
    f: any;
    vs: any[];
    nodes: any[];
    [Symbol.keystr](): number;
}
export namespace BVHVertFlags {
    let BOUNDARY_MESH: number;
    let BOUNDARY_FSET: number;
    let CORNER_MESH: number;
    let CORNER_FSET: number;
    let NEED_BOUNDARY: number;
    let NEED_VALENCE: number;
    let NEED_ALL: number;
    let BOUNDARY_ALL: number;
    let CORNER_ALL: number;
}
export class MDynVert extends CustomDataElem<any> {
    static define(): {
        elemTypeMask: MeshTypes;
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        flag: number;
    };
    constructor();
    flag: number;
    updateBoundary(v: any, cd_fset: any): void;
    check(v: any, cd_fset: any): boolean;
    valence: number;
    copyTo(b: any): void;
    interp(dest: any, blocks: any, weights: any): void;
    getValue(): number;
    setValue(v: any): void;
}
export namespace MDynVert {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class CDNodeInfo extends CustomDataElem<any> {
    static define(): {
        elemTypeMask: MeshTypes;
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        flag: number;
    };
    constructor();
    node: any;
    vel: Vector3;
    flag: number;
    valence: number;
    clear(): this;
    setValue(node: any): void;
    interp(dest: any, srcs: any, ws: any): void;
    copyTo(b: any): void;
}
export namespace CDNodeInfo {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class IsectRet {
    id: number;
    p: Vector3;
    uv: Vector2;
    dist: number;
    tri: any;
    load(b: any): this;
    copy(): IsectRet;
}
export class BVHNodeVertex extends Vector3 {
    constructor(arg: any);
    origco: Vector3;
    id: number;
    nodes: any[];
    edges: any[];
}
export class BVHNodeEdge {
    constructor(v1: any, v2: any);
    id: number;
    v1: any;
    v2: any;
    nodes: any[];
    otherVertex(v: any): any;
}
export const DEFORM_BRIDGE_TRIS: false;
export class BVHNode {
    constructor(bvh: any, min: any, max: any);
    __id2: any;
    min: Vector3;
    max: Vector3;
    omin: Vector3;
    omax: Vector3;
    leafIndex: number;
    leafTexUV: Vector2;
    boxverts: number[][];
    boxedges: any[];
    boxvdata: any;
    boxbridgetris: {
        indexVerts: any[];
        indexLoops: any[];
        indexTris: any[];
        indexEdges: any[];
    };
    ocent: Vector3;
    ohalfsize: Vector3;
    origGen: number;
    axis: number;
    depth: number;
    leaf: boolean;
    parent: any;
    bvh: any;
    index: number;
    set flag(arg: any);
    get flag(): any;
    tottri: number;
    drawData: any;
    id: number;
    _id: number;
    uniqueVerts: Set<any>;
    uniqueTris: Set<any>;
    otherVerts: Set<any>;
    wireVerts: Set<any>;
    indexVerts: any[];
    indexLoops: any[];
    indexTris: any[];
    indexEdges: any[];
    otherTris: Set<any>;
    allTris: Set<any>;
    children: any[];
    subtreeDepth: number;
    nodePad: number;
    _castRayRets: util.cachering;
    _closestRets: util.cachering;
    cent: any;
    halfsize: any;
    _flag: any;
    calcBoxVerts(): void;
    origUpdate(force?: boolean, updateOrigVerts?: boolean): boolean;
    setUpdateFlag(flag: any): this;
    split(test: any): void;
    closestTrisSimple(co: any, radius: any, out: any): void;
    closestTris(co: any, radius: any, out: any): void;
    closestOrigVerts(co: any, radius: any, out: any): void;
    nearestVertsN(co: any, n: any, heap: any, mindis: any): any;
    closestVerts(co: any, radius: any, out: any): void;
    closestVertsSquare(co: any, origco: any, radius: any, matrix: any, min: any, max: any, out: any): void;
    vertsInTube(co: any, ray: any, radius: any, clip: any, isSquare: any, out: any): void;
    /** length of ray vector is length of cone*/
    facesInCone(co: any, ray: any, radius1: any, radius2: any, visibleOnly: boolean, isSquare: any, out: any, tris: any): void;
    vertsInCone(co: any, ray: any, radius1: any, radius2: any, isSquare: any, out: any): void;
    closestPoint(p: any, mindis?: number): any;
    castRay(origin: any, dir: any): any;
    addTri_new(id: any, tri_idx: any, v1: any, v2: any, v3: any, noSplit: boolean, l1: any, l2: any, l3: any): any;
    addWireVert(v: any): void;
    addTri(...args: any[]): any;
    shapeTest(report?: boolean): 0 | 2 | 3;
    splitTest(depth?: number): 0 | 1;
    addTri_old(id: any, tri_idx: any, v1: any, v2: any, v3: any, noSplit: boolean, l1: any, l2: any, l3: any): any;
    _addVert(v: any, cd_node: any, isDeforming: any): void;
    _pushTri(tri: any): any;
    updateUniqueVerts(): void;
    updateNormalsGrids(): void;
    updateNormals(): void;
    updateIndexVertsGrids(): void;
    updateIndexVerts(): void;
    updateOtherVerts(): void;
    update(boundsOnly?: boolean): void;
    remTri(id: any): void;
}
export class BVH {
    static create(mesh: any, storeVerts_or_args?: boolean, useGrids?: boolean, leafLimit?: any, depthLimit?: any, freelist?: any, addWireVerts?: boolean, deformMode?: boolean): BVH;
    constructor(mesh: any, min: any, max: any, tottri?: number);
    min: Vector3;
    max: Vector3;
    glLeafTex: any;
    _id: number;
    nodeVerts: any[];
    nodeEdges: any[];
    nodeVertHash: Map<any, any>;
    nodeEdgeHash: Map<any, any>;
    _node_elem_idgen: number;
    isDeforming: boolean;
    totTriAlloc: number;
    totTriFreed: number;
    cd_orig: number;
    origGen: number;
    dead: boolean;
    freelist: any[];
    needsIndexRebuild: boolean;
    hideQuadEdges: boolean;
    computeValidEdges: boolean;
    tottri: number;
    addPass: number;
    flag: number;
    updateNodes: Set<any>;
    updateGridLoops: Set<any>;
    mesh: any;
    node_idgen: number;
    forceUniqueTris: boolean;
    storeVerts: boolean;
    leafLimit: number;
    drawLevelOffset: number;
    depthLimit: number;
    nodes: any[];
    node_idmap: Map<any, any>;
    root: any;
    tri_idgen: number;
    cd_node: number;
    cd_grid: number;
    tris: Map<any, any>;
    fmap: Map<any, any>;
    verts: Set<any>;
    dirtemp: Vector3;
    _i: number;
    get leaves(): Generator<any, void, unknown>;
    makeNodeDefTexture(): {
        data: Float32Array;
        dimen: number;
    };
    _fixOrphanDefVerts(vs: any): boolean;
    splitToUniformDepth(): void;
    getNodeVertex(co: any): any;
    getNodeEdge(node: any, v1: any, v2: any): any;
    origCoStart(cd_orig: any): void;
    _checkCD(): void;
    checkCD(): void;
    spatiallySortMesh(): void;
    oldspatiallySortMesh(mesh: any): void;
    destroy(mesh: any): any[];
    preallocTris(count?: number): void;
    closestOrigVerts(co: any, radius: any): Set<any>;
    facesInCone(origin: any, ray: any, radius1: any, radius2: any, visibleOnly?: boolean, isSquare?: boolean): Set<any>;
    vertsInCone(origin: any, ray: any, radius1: any, radius2: any, isSquare?: boolean): Set<any>;
    vertsInTube(origin: any, ray: any, radius: any, clip?: boolean): Set<any>;
    nearestVertsN(co: any, n: any): Set<any>;
    closestVerts(co: any, radius: any): Set<any>;
    closestVertsSquare(co: any, radius: any, matrix: any): Set<any>;
    closestTris(co: any, radius: any): Set<any>;
    closestTrisSimple(co: any, radius: any): Set<any>;
    closestPoint(co: any): any;
    castRay(origin: any, dir: any): any;
    getFaceTris(id: any): any;
    removeFace(id: any, unlinkVerts?: boolean, joinNodes?: boolean): void;
    _nextTriIdx(): number;
    checkJoin(node: any): void;
    joinNode(node: any, addToRoot?: boolean): void;
    removeTri(tri: any): void;
    getDebugCounts(): {
        totAlloc: number;
        totFreed: number;
    };
    _removeTri(tri: any, partial: boolean, unlinkVerts: any, joinNodes?: boolean): void;
    hasTri(id: any, tri_idx: any): boolean;
    _getTri1(id: any, tri_idx: any, v1: any, v2: any, v3: any): BVHTri;
    _getTri(id: any, tri_idx: any, v1: any, v2: any, v3: any): any;
    _newNode(min: any, max: any): any;
    ensureIndices(): void;
    _remNode(node: any): void;
    updateTriCounts(): void;
    update(): void;
    addWireVert(v: any): any;
    addTri(id: any, tri_idx: any, v1: any, v2: any, v3: any, noSplit?: boolean, l1?: any, l2?: any, l3?: any, addPass?: number): any;
}
export namespace BVH {
    export { BVHNode as nodeClass };
}
export class SpatialHash extends BVH {
    dimen: number;
    hsize: number;
    hused: number;
    htable: any[];
    hmul: any;
    hashkey(co: any): number;
    _resize(hsize: any): void;
    _calcDimen(tottri: any): number;
    _lookupNode(key: any): any;
    checkJoin(): boolean;
    _forEachNode(cb: any, minx: any, miny: any, minz: any, maxx: any, maxy: any, maxz: any): void;
    _addNode(node: any): void;
}
import * as util from './util.js';
import { Vector3 } from './vectormath.js';
import { CustomDataElem } from "../mesh/customdata.js";
import { MeshTypes } from "../mesh/mesh_base.js";
import { Vector2 } from './vectormath.js';
