export function calcMVC(co: any, cos: any, normal?: any, cosout?: any): any[];
export function walkFaceLoop(e: any): Generator<any, void, unknown>;
export function triangulateMesh(mesh: any, faces: any, lctx: any): any[];
export function triangulateFan(mesh: any, f: any, newfaces: any, lctx: any): void;
export function bisectMesh(mesh: any, faces: any, vec: any, offset: Vector3, threshold: any): {
    newVerts: Set<any>;
    newEdges: Set<any>;
};
export function duplicateMesh(mesh: any, geom: any): {
    newVerts: any[];
    newEdges: any[];
    newFaces: any[];
    oldToNew: Map<any, any>;
    newToOld: Map<any, any>;
};
/**
 mergeMap maps deleting vertices to ones that will be kept.

 */
export function weldVerts(mesh: any, mergeMap: any): void;
export function symmetrizeMesh(mesh: any, faces: any, axis: any, sign: any, mergeThreshold?: number): void;
export function flipLongTriangles(mesh: any, faces: any, lctx: any): void;
export function trianglesToQuads(mesh: any, faces: any, flag: number, lctx: any, newfaces: any): void;
export function recalcWindings(mesh: any, faces: any, lctx: any): void;
export function splitNonManifoldEdge(mesh: any, e: any, l1: any, l2: any, lctx: any): void;
export function pruneLooseGeometry(mesh: any, lctx: any, minShellVerts?: number): void;
export function fixManifold(mesh: any, lctx: any): boolean;
export function connectVerts(mesh: any, v1: any, v2: any): void;
export function vertexSmooth(mesh: any, verts?: any, fac?: number, proj?: number, useBoundary?: boolean): void;
export function sortVertEdges(v: any, edges?: any[], matout?: any): any[];
export function getCotanData(v: any, _edges?: any, _vdata?: any[]): any[];
export function buildCotanVerts(mesh: any, verts: any): {
    vertexData: any[];
    allVerts: Set<any>;
};
export function buildCotanMap(mesh: any, verts: any): Map<any, any>;
export function cotanMeanCurvature(v: any, vdata: any, vi: any): number;
export function cotanVertexSmooth(mesh: any, verts?: any, fac?: number, proj?: number): void;
export function quadrilateFaces(mesh: any, faces: any, quadflag: number, lctx: any): void;
export function dissolveEdgeLoops(mesh: any, edges: any, quadrilate: boolean, lctx: any): void;
export function getEdgeLoop(e: any): any[];
export function dissolveFaces(mesh: any, faces: any, lctx: any): void;
export function delauney3D(mesh: any, vs: any, lctx: any): void;
export namespace TriQuadFlags {
    let NICE_QUADS: number;
    let COLOR: number;
    let SEAM: number;
    let UVS: number;
    let MARK_ONLY: number;
    let MARKED_EDGES: number;
    let FACE_SETS: number;
    let DEFAULT: number;
}
export const VAREA: 0;
export const VCTAN1: 1;
export const VCTAN2: 2;
export const VW: 3;
export const VETOT: 4;
import { Vector3 } from '../util/vectormath.js';
