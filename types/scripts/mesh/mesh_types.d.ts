import { CDElemArray } from "./mesh_base";
export declare const SEAL = true;
import { HandleTypes, ReusableIter } from "./mesh_base";
import { Vector3, Matrix4, Vector2 } from '../path.ux/pathux.js';
export { EDGE_LINKED_LISTS } from '../core/const.js';
export declare class MeshIterStack<type> extends Array<type> {
    cur: number;
}
export declare class VertLoopIter {
    v: Vertex;
    ret: IteratorResult<Loop>;
    done: boolean;
    count: number;
    i: number;
    l: Loop | undefined;
    preserve_loop_mode: boolean;
    constructor(v?: Vertex);
    finish(): IteratorResult<Loop, any>;
    return(): IteratorResult<Loop, any>;
    reset(v: Vertex, preserve_loop_mode?: boolean): this;
    [Symbol.iterator](): this;
    next(): IteratorResult<Loop>;
}
export declare class VertNeighborIterR extends ReusableIter<Vertex> {
    v: Vertex;
    constructor();
    reset(v: any): this;
    [Symbol.iterator](): VertNeighborIter;
}
export declare class VertNeighborIter {
    ret: IteratorResult<Vertex>;
    done: boolean;
    v: Vertex;
    i: number;
    constructor();
    reset(v: Vertex): this;
    finish(): this;
    return(): IteratorResult<Vertex>;
    [Symbol.iterator](): this;
    next(): IteratorResult<Vertex>;
}
import { StructReader } from "../path.ux/scripts/path-controller/types/util/nstructjs";
import { View3D } from "../editors/view3d/view3d";
import { DispLayerVert } from "./mesh_displacement";
import { CDRef } from "./customdata";
export declare class Element {
    static STRUCT: string;
    type: number;
    eid: number;
    index: number;
    flag: number;
    customData: CDElemArray;
    _old_eid: number;
    _eid: number;
    _didx: number;
    constructor(type: any);
    _free(): void;
    _initElement(type: any): this;
    static isElement(obj: any): boolean;
    valueOf(): number;
    [Symbol.keystr](): number;
    findLayer<type>(typeName: any): type | undefined;
    toJSON(): {
        type: number;
        flag: number;
        index: number;
        eid: number;
    };
    loadJSON(obj: any): this;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class VertFaceIter {
    v: Vertex;
    ret: IteratorResult<Face>;
    l: Loop | undefined;
    i: number;
    done: boolean;
    count: number;
    constructor();
    finish(): IteratorResult<Face>;
    return(): IteratorResult<Face>;
    reset(v: Vertex): this;
    [Symbol.iterator](): this;
    next(): IteratorResult<Face>;
}
export declare function tracetimer(): boolean;
export declare function traceget(i: any): void;
export declare function traceset(i: any): void;
export declare class Vertex extends Element {
    co: Vector3;
    no: Vector3;
    edges: Edge[];
    static STRUCT: string;
    constructor(co?: Vector3 | undefined);
    get length(): number;
    get 0(): any;
    get 1(): any;
    get 2(): any;
    set 0(f: any);
    set 1(f: any);
    set 2(f: any);
    load(co: Vector3): this;
    _free(): void;
    calcNormal(doFaces?: boolean): this;
    get neighbors(): VertNeighborIterR;
    toJSON(): any;
    get loops(): VertLoopIter;
    get faces(): VertFaceIter;
    isBoundary(includeWire?: boolean): boolean;
    get valence(): number;
    otherEdge(e: any): Edge;
    loadSTRUCT(reader: StructReader<this>): void;
    loadXYZ(x: any, y: any, z: any): this;
    loadXY(x: any, y: any): this;
    dot(b: any): number;
    multVecMatrix(matrix: Matrix4, ignore_w?: boolean): number;
    cross(v: Vector3): this;
    rot2d(A: number, axis?: number): this;
}
export declare class Handle extends Element {
    co: Vector3;
    mode: HandleTypes;
    owner: Edge;
    roll: number;
    constructor(co?: Vector3 | undefined);
    get 0(): number;
    get 1(): number;
    get 2(): number;
    get visible(): boolean;
    loadSTRUCT(reader: StructReader<this>): void;
}
declare class ArcLengthCache {
    size: number;
    e: Edge;
    length: number;
    table: number[];
    regen: number;
    constructor(size: number, e: Edge);
    _calcS(t: number, steps?: number): number;
    update(): this;
    arcConvert(s: number): number;
    evaluate(s: number): Vector3;
}
declare class EdgeLoopIter {
    ret: IteratorResult<Loop>;
    done: boolean;
    e: Edge;
    l: Loop;
    i: number;
    constructor();
    reset(e: any): this;
    finish(): IteratorResult<Loop>;
    [Symbol.iterator](): this;
    next(): IteratorResult<Loop>;
    return(): IteratorResult<Loop>;
}
declare class EdgeVertIter {
    e: Edge;
    i: number;
    ret: IteratorResult<Vertex>;
    done: boolean;
    constructor();
    reset(e: Edge): this;
    [Symbol.iterator](): this;
    next(): IteratorResult<Vertex>;
    finish(): IteratorResult<Vertex>;
    return(): IteratorResult<Vertex>;
}
export declare class EdgeFaceIterR extends ReusableIter<Face> {
    e: Edge;
    constructor();
    reset(e: any): this;
    [Symbol.iterator](): EdgeFaceIter;
}
export declare class EdgeFaceIter {
    e: Edge | undefined;
    l: Loop | undefined;
    done: boolean;
    i: number;
    ret: IteratorResult<Face>;
    flag: number;
    constructor();
    reset(e: Edge): this;
    next(): IteratorResult<Face>;
    finish(): IteratorResult<Face>;
    return(): IteratorResult<Face>;
}
export declare class Edge extends Element {
    static STRUCT: string;
    v1: Vertex;
    v2: Vertex;
    h1: Handle | undefined;
    h2: Handle | undefined;
    l: Loop | undefined;
    _arcCache: ArcLengthCache | undefined;
    _length: number;
    length: number;
    constructor();
    _free(): void;
    get verts(): EdgeVertIter;
    get loopCount(): number;
    get faceCount(): number;
    loopForFace(face: any): Loop | undefined;
    get arcCache(): ArcLengthCache;
    set arcCache(val: ArcLengthCache | undefined);
    calcScreenLength(view3d: View3D): number;
    update(force?: boolean): void;
    updateLength(): number;
    commonVertex(e: any): Vertex | undefined;
    vertex(h: any): Vertex;
    handle(v: any): Handle;
    otherHandle(v_or_h: any): Handle;
    updateHandles(): void;
    arcEvaluate(s: number): Vector3;
    arcDerivative(s: number): Vector3;
    arcDerivative2(s: any): Vector3;
    twist(t: any): number;
    arcTwist(s: number): number;
    arcNormal(s: number): Vector3;
    get loops(): EdgeLoopIter;
    /** iterates over faces surrounding this edge;
     each face is guaranteed to only be returned once.
  
     Note that edges can have the same face twice when
     they intrude into the face.
  
     Iteration can be up to ten levels deep.  Never, ever
     do recursion from within a for loop over this iterator.
     */
    get faces(): EdgeFaceIter;
    evaluate(t: number): Vector3;
    derivative(t: number): Vector3;
    derivative2(t: number): Vector3;
    curvature(t: number): number;
    has(v: Vertex): boolean;
    otherVertex(v: Vertex): Vertex;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class Loop extends Element {
    static STRUCT: string;
    next: Loop;
    prev: Loop;
    radial_prev: Loop;
    radial_next: Loop;
    v: Vertex;
    e: Edge;
    f: Face;
    list: LoopList;
    constructor();
    _free(): this;
    get uv(): Vector2;
    loadSTRUCT(reader: StructReader<this>): void;
}
declare class LoopIter {
    list: LoopList;
    l: Loop;
    first: boolean;
    done: boolean;
    _i: number;
    ret: IteratorResult<Loop>;
    constructor();
    init(list: LoopList): this;
    next(): IteratorResult<Loop>;
    return(): IteratorResult<Loop>;
}
export declare class LoopList {
    static STRUCT: string;
    flag: number;
    l: Loop;
    length: number;
    __loops: Loop[] | undefined;
    constructor();
    [Symbol.iterator](): LoopIter;
    _recount(): number;
    get _loops(): LoopList;
    loadSTRUCT(reader: StructReader<this>): void;
}
declare class FaceLoopIter implements Iterable<Loop>, Iterator<Loop> {
    ret: IteratorResult<Loop>;
    done: boolean;
    f: Face;
    l: Loop;
    listi: number;
    constructor();
    reset(face: Face): this;
    finish(): void;
    next(): IteratorResult<Loop>;
    return(): IteratorResult<Loop>;
    [Symbol.iterator](): this;
}
declare class FaceEdgeIter {
    ret: IteratorResult<Edge>;
    done: boolean;
    f: Face;
    l: Loop;
    listi: number;
    constructor();
    reset(face: any): this;
    finish(): void;
    next(): IteratorResult<Edge>;
    return(): IteratorResult<Edge>;
    [Symbol.iterator](): this;
}
declare class FaceVertIterProxy extends ReusableIter<Vertex> {
    f: Face;
    constructor();
    reset(f: Face): this;
    [Symbol.iterator](): FaceVertIter;
}
declare class FaceVertIter {
    ret: IteratorResult<Vertex>;
    done: boolean;
    f: Face;
    l: Loop;
    listi: number;
    constructor();
    reset(face: Face): this;
    finish(): void;
    next(): IteratorResult<Vertex>;
    return(): IteratorResult<Vertex>;
    [Symbol.iterator](): this;
}
export declare class Face extends Element {
    static STRUCT: string;
    lists: LoopList[];
    iterflag: number;
    area: number;
    no: Vector3;
    cent: Vector3;
    constructor();
    _free(): void;
    get length(): number;
    ensureBoundaryFirst(): this;
    isNgon(): boolean;
    isTri(): boolean;
    isQuad(): boolean;
    get verts(): FaceVertIterProxy;
    get loops(): FaceLoopIter;
    get edges(): FaceEdgeIter;
    calcNormal(cd_disp?: CDRef<DispLayerVert>): Vector3;
    calcCent(cd_disp?: CDRef<DispLayerVert>): Vector3;
    loadSTRUCT(reader: any): void;
}
