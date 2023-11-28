/**
  counts number of new edges created by pattern-based subdivision,
  as done by splitEdgesSmart and splitEdgesSmart2
 */
export function countNewSplitEdges(e: any, eset: any): number;
export function splitEdgesPreserveQuads(mesh: any, es: any, testfunc: any, lctx: any): void;
export function splitEdgesSmart2(mesh: any, es: any, testfunc: any, lctx: any, smoothFac?: number): void;
export function splitEdgesSimple2(mesh: any, es: any, testfunc: any, lctx: any): void;
export function splitEdgesSimple(mesh: any, es: any, testfunc: any, lctx: any): {
    newvs: Set<any>;
    newfs: Set<any>;
    killfs: Set<any>;
    newes: Set<any>;
};
export function splitEdgesSmart(mesh: any, es: any, lctx: any): {
    newvs: Set<any>;
    newfs: Set<any>;
    killfs: Set<any>;
};
export function ccSmooth2(v: any, ws: any): any;
export function meshSubdivideTest(mesh: any, faces?: any): void;
export class Pattern {
    constructor(verts: any, newverts: any, faces: any);
    verts: any;
    newverts: any;
    faces: any;
    shift: number;
    facetemps: any[];
    facetemps2: any[];
    _temps3: any[];
    array1: any[];
    array2: any[];
    array3: any[];
    array4: any[];
    genMasks(): {};
    mirror(): this;
    copy(): Pattern;
    genFaceTemps(): void;
}
