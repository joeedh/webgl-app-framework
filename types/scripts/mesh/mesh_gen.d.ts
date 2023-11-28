export function buildProcMeshAPI(api: any): any;
export const Generators: any[];
export const GenTypes: {};
export class ProceduralGen {
    static genDefine(): {
        typeName: string;
        uiName: string;
        flag: number;
    };
    static buildSettings(ui: any): void;
    static apiDefine(api: any): any;
    static register(cls: any): void;
    flag: any;
    typeName: any;
    uiName: any;
    _last_hash: any;
    getBoundingBox(): void;
    hashSettings(digest: any): void;
    getSimpleMesh(gl: any): void;
    smesh: void;
    genSimpleMesh(gl: any): void;
    genMesh(): void;
    loadSTRUCT(reader: any): void;
}
export namespace ProceduralGen {
    let STRUCT: string;
}
export class CubeGenerator extends ProceduralGen {
    dimen: number;
    toSphere: number;
    aabb: Vector3[];
    getBoundingBox(): Vector3[];
    _gen(): {
        verts: number[];
        quads: any[];
    };
    genSimpleMesh(): SimpleMesh;
    genMesh(): any;
    hashSettings(digest: any): any;
}
export namespace CubeGenerator {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class ProceduralMesh extends SceneObjectData {
    static dataDefine(): {
        name: string;
        selectMask: number;
    };
    static blockDefine(): {
        typeName: string;
        uiName: string;
        defaultName: string;
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
        flag: {
            data: any;
        };
    };
    generator: CubeGenerator;
    recalc: number;
    drawOutline(view3d: any, gl: any, uniforms: any, program: any, object: any): void;
}
export namespace ProceduralMesh {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
import { Vector3 } from '../util/vectormath.js';
import { SimpleMesh } from '../core/simplemesh.js';
import { SceneObjectData } from '../sceneobject/sceneobject_base.js';
