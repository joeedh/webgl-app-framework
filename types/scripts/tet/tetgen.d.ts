export class TetMesh extends SceneObjectData {
    static dataDefine(): {
        name: string;
        selectMask: number;
    };
    static nodedef(): {
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        flag: number;
    };
    static makeBVH(tm: any): BVH;
    elists: {};
    verts: any;
    edges: any;
    faces: any;
    cells: any;
    planes: any;
    eidgen: util.IDGen;
    eidMap: Map<any, any>;
    recalcFlag: number;
    bvh: BVH;
    _meshes: {};
    _last_render_key: string;
    _last_bvh_key: string;
    updateGen: number;
    _ensureRender(gl: any): number;
    recalcStartLengths(edges?: any): void;
    drawElements(view3d: any, gl: any, uniforms: any, selmask: any, object: any): void;
    applyMatrix(matrix: any): this;
    makeElistAliases(): this;
    loops: any;
    makeElists(): this;
    _elementPush(elem: any, custom_eid?: any): void;
    makeVertex(co: any, custom_eid?: any): TetVertex;
    ensureEdge(v1: any, v2: any, lctx: any): any;
    getEdge(v1: any, v2: any): any;
    _diskInsert(v: any, e: any): this;
    _diskRemove(v: any, e: any): this;
    makeEdge(v1: any, v2: any, checkExist: boolean, custom_eid: any, lctx: any): any;
    _radialInsert(e: any, l: any): void;
    _radialRemove(e: any, l: any): void;
    selectNone(): void;
    selectAll(): void;
    reverseCellWinding(c: any): void;
    reverseFaceWinding(f: any): void;
    makeFace(vs: any, lctx: any, custom_eid: any): TetFace;
    _makePlane(f: any, cell: any, custom_eid: any): TetPlane;
    _planeInsert(f: any, p: any): void;
    _planeRemove(f: any, p: any): void;
    ensureFace(vs: any, lctx: any): any;
    findHex(vs: any): any;
    makeHex(v1: any, v2: any, v3: any, v4: any, v5: any, v6: any, v7: any, v8: any, checkExist: boolean, lctx: any): any;
    makeTet(v1: any, v2: any, v3: any, v4: any, lctx: any): TetCell;
    _elementKill(elem: any): boolean;
    killVertex(v: any): void;
    killEdge(e: any): void;
    killFace(f: any): void;
    killCell(c: any): void;
    getElemLists(): any[];
    copyElemData(dst: any, src: any): void;
    setSelect(elem: any, state: any): this;
    regenAll(): void;
    regenPartial(): void;
    regenRender(): void;
    getBVH(): BVH;
    regenBVH(): void;
    genRender(gl: any): void;
    flagSurfaceFaces(): void;
    regenNormals(): void;
    checkNormals(): void;
    recalcNormals(): this;
}
export namespace TetMesh {
    let STRUCT: string;
}
import { SceneObjectData } from '../sceneobject/sceneobject_base.js';
import * as util from '../util/util.js';
import { BVH } from '../util/bvh.js';
import { TetVertex } from './tetgen_types.js';
import { TetFace } from './tetgen_types.js';
import { TetPlane } from './tetgen_types.js';
import { TetCell } from './tetgen_types.js';
