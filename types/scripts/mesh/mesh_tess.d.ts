export function setEPS(eps: any): void;
export function setMeshClass(mesh: any): void;
export function triangulateQuad(mesh: any, f: any, lctx: any, newfaces: any): void;
export function triangulateFace(f: any, loopTris?: any[]): any[];
export function genCommands(mesh: any, ltri: any): void;
export function applyTriangulation(mesh: any, f: any, newfaces: any, newedges: any, lctx: any): void;
export class CDT {
    loops: any[];
    calcWinding: boolean;
    fixWinding: boolean;
    triangles: any[] | {
        i: any;
        j: any;
        k: any;
        x: number;
        y: number;
        r: number;
    }[];
    min: Vector2;
    max: Vector2;
    /**
     *
     * @param loop Flat Array with (x, y, id) entires per vertex
     * */
    addLoop(loop: any): void;
    constrain(tris: any, verts: any, inedges: any, trimHoles: any): any;
    estWinding(me: any): boolean;
    trimHoles(me: any): void;
    unnormalize(co: any): any;
    normalizeLoops(): void;
    _normScale: number;
    generate(trimHoles?: boolean): void;
    generate_intern(trimHoles?: boolean): void;
    verts: any[];
    edges: any[];
}
import { Vector2 } from '../util/vectormath.js';
