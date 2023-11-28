export function ccSmooth(v: any, cd_fset: any, cd_dyn_vert: any, weight1: any, weightR: any, weightS: any): any;
export function createPatches(mesh: any, faces?: any): PatchList;
export function loopSubdivide(mesh: any, faces?: any): void;
export function subdivide(mesh: any, faces?: any, linear?: boolean): {
    oldLoopEidsToQuads: Map<any, any>;
    newVerts: Set<any>;
    centerFeidMap: Map<any, any>;
};
import { PatchList } from './subsurf_base.js';
