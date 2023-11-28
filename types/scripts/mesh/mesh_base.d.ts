import { util } from '../path.ux/scripts/pathux.js';
import * as customdata from './customdata';
import { StructReader } from "../path.ux/scripts/path-controller/types/util/nstructjs";
export declare const REUSE_EIDS = true;
export declare const DEBUG_DUPLICATE_FACES = false;
export declare const DEBUG_MANIFOLD_EDGES = false;
export declare const DEBUG_BAD_LOOPS = false;
export declare const DEBUG_DISK_INSERT = false;
export declare const STORE_DELAY_CACHE_INDEX = true;
export declare const ENABLE_CACHING = true;
export declare const SAVE_DEAD_LOOPS = true;
export declare const SAVE_DEAD_FACES = true;
export declare const SAVE_DEAD_VERTS = true;
export declare const SAVE_DEAD_EDGES = true;
export declare const WITH_EIDMAP_MAP = true;
export declare const MAX_FACE_VERTS = 1000000;
export declare const MAX_VERT_EDGES = 1000;
export declare const MAX_EDGE_FACES = 100;
export declare enum HandleTypes {
    AUTO = 0,
    FREE = 1,
    STRAIGHT = 2
}
export declare enum MeshSymFlags {
    X = 1,
    Y = 2,
    Z = 4
}
export declare const MeshSymMap: {
    1: number;
    2: number;
    4: number;
};
export declare enum MeshDrawFlags {
    SHOW_NORMALS = 1,
    USE_LOOP_NORMALS = 2
}
export declare enum MeshFeatures {
    GREATER_TWO_VALENCE = 2,
    SPLIT_EDGE = 4,
    JOIN_EDGE = 8,
    SPLIT_FACE = 16,
    JOIN_FACE = 32,
    MAKE_VERT = 64,
    KILL_VERT = 128,
    MAKE_EDGE = 256,
    KILL_EDGE = 512,
    MAKE_FACE = 1024,
    KILL_FACE = 2048,
    EDGE_HANDLES = 4096,
    EDGE_CURVES_ONLY = 8192,
    SINGLE_SHELL = 16384,
    BVH = 32768,
    ALL = 1073717247,
    BASIC = 1073713151
}
export declare class MeshError extends Error {
}
export declare class MeshFeatureError extends MeshError {
}
export declare class ReusableIter<type> {
    static safeIterable<type>(iter: Iterable<type>): boolean;
    static getSafeIter<type>(iter: any): Iterable<type>;
    [Symbol.iterator](): void;
}
export declare enum ChangeFlags {
    CO = 1,
    NO = 2,
    CUSTOMDATA = 4,
    FLAG = 8
}
export declare enum LogTags {
    NONE = 0,
    COLLAPSE_EDGE = 1,
    DISSOLVE_EDGE = 2,
    DISSOLVE_VERT = 3,
    SPLIT_EDGE = 4,
    JOINTWOEDGES = 5,
    SPLIT_FACE = 6,
    SPLIT_EDGES_SMART2 = 7
}
export declare class LogContext {
    onnew: (v: any, tag?: any) => void | undefined;
    onkill: (v: any, tag?: any) => void | undefined;
    onchange: (v: any, tag?: any) => void | undefined;
    haveAspect: boolean;
    constructor(useAsAspectClass?: boolean);
    reset(): this;
    newVertex(v: any, tag?: any): this;
    newEdge(e: any, tag?: any): this;
    newFace(f: any, tag?: any): this;
    killVertex(v: any, tag?: any): this;
    killEdge(e: any, tag?: any): this;
    killFace(f: any, tag?: any): void;
    changeVertex(v: any, flag: any): this;
    changeEdge(e: any, flag: any): this;
    changeHandle(h: any, flag: any): this;
    changeLoop(l: any, flag: any): this;
    changeFace(f: any, flag: any): this;
}
export declare enum MeshTypes {
    VERTEX = 1,
    EDGE = 2,
    FACE = 4,
    LOOP = 8,
    HANDLE = 16
}
export declare enum MeshFlags {
    SELECT = 1,
    HIDE = 2,
    FLAT = 4,
    SINGULARITY = 4,
    ITER_TEMP1 = 8,
    ITER_TEMP2a = 16,
    ITER_TEMP2b = 32,
    ITER_TEMP2c = 64,
    DRAW_DEBUG = 128,
    TEMP1 = 256,
    TEMP2 = 512,
    TEMP3 = 1024,
    UPDATE = 2048,
    BOUNDARY = 4096,
    CURVE_FLIP = 8192,
    SMOOTH_DRAW = 8192,
    MIRROREDX = 16384,
    MIRROREDY = 32768,
    MIRROREDZ = 65536,
    MIRRORED = 114688,
    MIRROR_BOUNDARY = 131072,
    DRAW_DEBUG2 = 262144,
    SEAM = 524288,
    COLLAPSE_TEMP = 1048576,
    TEMP4 = 2097152,
    TEMP5 = 4194304,
    NOAPI_TEMP1 = 16777216,
    NOAPI_TEMP2 = 33554432,
    ITER_TEMP3 = 134217728,
    QUAD_EDGE = 268435456,
    GRID_MRES_HIDDEN = 268435456,
    MAKE_FACE_TEMP = 536870912,
    FACE_EXIST_FLAG = 536870912
}
export declare enum MeshIterFlags {
    EDGE_FACES = 1,
    EDGE_FACES_TOT = 10,
    VERT_FACES = 1024,
    VERT_FACES_TOT = 10
}
export declare enum MeshModifierFlags {
    SUBSURF = 1
}
export declare enum RecalcFlags {
    RENDER = 1,
    TESSELATE = 2,
    PARTIAL = 4,
    ELEMENTS = 8,
    UVWRANGLER = 16,
    ALL = 31
}
declare const ArrayPool: typeof util.ArrayPool;
export { ArrayPool };
export declare function getArrayTemp<type>(n: any, clear?: boolean): type[];
export declare function reallocArrayTemp<type>(arr: any, newlen: any): type[];
import type { CustomDataElem } from "./customdata.ts";
import { CDRef, ICustomDataElemConstructor } from "./customdata";
export declare class CDElemArray extends Array<CustomDataElem<any>> {
    static STRUCT: string;
    constructor(items?: CustomDataElem<any>[]);
    clear(): this;
    get<type>(idx: CDRef<type>): type;
    hasLayer(cls: ICustomDataElemConstructor): boolean;
    getLayer(cls: ICustomDataElemConstructor, idx?: number): customdata.CustomDataElem<any>;
    updateLayout(): void;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare const EmptyCDArray: CDElemArray;
