export function elemColor(e: any): number[];
export namespace Colors {
    let DRAW_DEBUG: number[];
    let SELECT: number[];
    let UNSELECT: number[];
    let ACTIVE: number[];
    let LAST: number[];
    let HIGHLIGHT: number[];
    let POINTSIZE: number;
    let POLYGON_OFFSET: number;
    let FACE_UNSEL: number[];
    let DRAW_DEBUG2: number[];
}
export class OrigRef {
    constructor(element: any, ref: any);
    ref: any;
    e: any;
    co: Vector3;
}
export class LoopTriRet {
    ref: any;
    ls: number[];
    i: number;
}
export class MeshDrawInterface {
    constructor(mesh: any, meshcache: any);
    destroy(gl: any): void;
    origVerts(mesh: any): void;
    origEdges(mesh: any): void;
    origFaceCenters(mesh: any): void;
    origFaces(mesh: any): void;
    sync(view3d: any, gl: any, object: any): void;
    draw(view3d: any, gl: any, object: any, uniforms: any, program: any): void;
    drawIDs(view3d: any, gl: any, object: any, uniforms: any, program: any): void;
}
export class BasicMeshDrawer extends MeshDrawInterface {
    _regen: boolean;
    mc: any;
    origVerts(mesh: any): () => Generator<any, void, unknown>;
    origEdges(mesh: any): () => Generator<any, void, unknown>;
    origFaceCenters(mesh: any): () => Generator<any, void, unknown>;
    origFaces(mesh: any): () => Generator<any, void, unknown>;
    loopTris(mesh: any): void;
    _generate(view3d: any, gl: any, object: any): void;
    drawIDs(view3d: any, gl: any, object: any, uniforms: any): boolean;
}
import { Vector3 } from '../../util/vectormath.js';
