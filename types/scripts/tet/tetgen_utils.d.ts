export function meshToTetMesh(mesh: any, tm?: TetMesh, maxDepth?: number, leafLimit?: number, haveInterior?: boolean): void;
export function vertexSmooth(tm: any, verts?: any, fac?: number): void;
export function tetMeshToMesh(tm: any, mesh?: any): Map<any, any>;
export function tetrahedralize(tm: any, cell: any, lctx: any): void;
export function tetrahedralizeMesh(tm: any, cells: any, lctx: any): void;
export class OcTri {
    constructor(v1: any, v2: any, v3: any);
    v1: any;
    v2: any;
    v3: any;
    verts: any[];
}
export class IsectRayRet {
    uv: Vector2;
    t: number;
    p: Vector3;
    tri: any;
    load(b: any): this;
}
export class OcNode {
    constructor(min: any, max: any, leafLimit: any, maxDepth: any);
    leaf: boolean;
    min: Vector3;
    max: Vector3;
    size: any;
    halfsize: any;
    cent: any;
    dead: boolean;
    tris: any[];
    depth: number;
    subtree_depth: number;
    parent: any;
    children: any[];
    leafLimit: any;
    maxDepth: any;
    castRay(origin: any, ray: any): any;
    countCastRays(origin: any, ray: any): number;
    split(): void;
    splitTest(): boolean;
    addTri(tri: any): void;
}
import { TetMesh } from './tetgen.js';
import { Vector2 } from '../util/vectormath.js';
import { Vector3 } from '../util/vectormath.js';
