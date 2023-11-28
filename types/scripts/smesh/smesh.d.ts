export class EIDGen {
    static STRUCT: string;
    _cur: number;
    freelist: any[];
    next(): any;
    free(id: any): void;
}
export class SMesh extends SceneObjectData {
    static dataDefine(): {
        name: string;
        selectMask: number;
    };
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        flag: number;
    };
    elists: any[];
    _ltris: any[];
    binding: BoundMesh;
    eidgen: EIDGen;
    updateGen: number;
    recalcFlag: number;
    exec(ctx: any, ...args: any[]): void;
    wrap(): BoundMesh;
    getBoundingBox(matrix: any): any[];
    bindElists(): this;
    verts: any;
    edges: any;
    loops: any;
    faces: any;
    getElist(type: any): any;
    makeVertex(co: any, lctx: any): any;
    _diskInsert(v: any, e: any): void;
    _diskRemove(v: any, e: any): void;
    regenRender(): void;
    regenAll(): void;
    regenNormals(): void;
    recalcNormals(): void;
    genRender(): void;
    smesh: SimpleMesh;
    wmesh: SimpleMesh;
    get loopTris(): any[];
    tessellate(): void;
    _doUpdates(gl: any): void;
    getEdge(v1: any, v2: any): any;
    ensureEdge(v1: any, v2: any, lctx: any, exampleEdge: any): any;
    makeEdge(v1: any, v2: any, lctx: any): any;
    _newLoop(): any;
    _killLoop(li: any): void;
    _radialInsert(ei: any, li: any): void;
    _radialRemove(ei: any, li: any): void;
    makeFace(vs: any, lctx: any): any;
    testSave(): void;
}
import { SceneObjectData } from '../sceneobject/sceneobject_base.js';
import { BoundMesh } from './smesh_bound.js';
import { SimpleMesh } from '../core/simplemesh.js';
