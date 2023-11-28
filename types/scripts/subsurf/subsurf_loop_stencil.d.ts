export function getAdjLoopTris(mesh: any, v: any): Generator<any, void, unknown>;
export function getNeighbors(mesh: any, v: any): Generator<any, void, unknown>;
export function hashFace(mesh: any, f: any): number;
export function hashTri(mesh: any, ls: any, fhashmap: any): number;
export function buildLoopIdx(mesh: any, f: any, lmap: any): void;
export function buildTriData(tri: any): void;
export function hashTris(mesh: any): typeof hashes;
export class SymVector3 extends Array<any> {
    constructor(val: any);
    0: any;
    1: any;
    2: any;
    load(b: any): this;
    add(b: any): this;
    sub(b: any): this;
    mul(b: any): this;
    div(b: any): this;
    negate(b: any): this;
    mulScalar(b: any): this;
    dot(v: any): any;
    normalize(): this;
    vectorLengthSqr(): any;
    vectorLength(): import("../mathl/transform/sym.js").CallSym;
    vectorDistanceSqr(b: any): any;
    addFac(b: any, c: any): this;
    vectorDistance(b: any): import("../mathl/transform/sym.js").CallSym;
    copy(): SymVector3;
}
declare namespace hashes {
    let length: number;
}
export {};
