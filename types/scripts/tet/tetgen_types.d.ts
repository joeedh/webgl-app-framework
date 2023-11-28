export class VertNeighborIter {
    ret: {
        done: boolean;
        value: any;
    };
    done: boolean;
    v: any;
    i: number;
    reset(v: any): this;
    finish(): this;
    return(): {
        done: boolean;
        value: any;
    };
    next(): {
        done: boolean;
        value: any;
    };
    [Symbol.iterator](): this;
}
export class TetElement {
    constructor(type: any);
    initTetElement(type: any): void;
    eid: number;
    flag: number;
    index: number;
    type: any;
    customData: any[];
    loadSTRUCT(reader: any): void;
}
export namespace TetElement {
    let STRUCT: string;
}
export class TetVertex extends Vector3 {
    constructor(co: any);
    oldco: Vector3;
    vel: Vector3;
    acc: Vector3;
    mass: number;
    w: number;
    no: Vector3;
    edges: any[];
    get valence(): number;
    get neighbors(): any;
}
export namespace TetVertex {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class EdgeTetIter {
    e: any;
    l: any;
    _i: number;
    ret: {
        done: boolean;
        value: any;
    };
    done: boolean;
    reset(e: any): this;
    flag: number;
    next(): {
        done: boolean;
        value: any;
    };
    finish(): {
        done: boolean;
        value: any;
    };
    return(): {
        done: boolean;
        value: any;
    };
    [Symbol.iterator](): this;
}
export class TetEdge extends TetElement {
    constructor();
    v1: any;
    v2: any;
    startLength: number;
    l: any;
    get cells(): any;
    get loops(): Generator<any, void, unknown>;
    otherVertex(v: any): any;
}
export namespace TetEdge {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class TetLoop extends TetElement {
    constructor();
    v: any;
    e: any;
    f: any;
    next: any;
    prev: any;
    radial_next: any;
    radial_prev: any;
}
export namespace TetLoop {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export class TetFace extends TetElement {
    constructor();
    p: any;
    l: any;
    no: Vector3;
    cent: Vector3;
    area: number;
    loops: any[];
    isTri(): boolean;
    isQuad(): boolean;
    calcCent(): this;
    get planes(): Generator<any, void, unknown>;
    calcNormal(cd_disp?: number): this;
}
export namespace TetFace {
    let STRUCT_4: string;
    export { STRUCT_4 as STRUCT };
}
export namespace CellTypes {
    let TET: number;
    let HEX: number;
}
export class TetPlane extends TetElement {
    constructor();
    f: any;
    c: any;
    no: Vector3;
    cent: Vector3;
    plane_next: any;
    plane_prev: any;
}
export namespace TetPlane {
    let STRUCT_5: string;
    export { STRUCT_5 as STRUCT };
}
export class TetCell extends TetElement {
    constructor();
    cellType: number;
    volume: number;
    startVolume: number;
    cent: Vector3;
    planes: any[];
    faces: any[];
    edges: any[];
    verts: any[];
    isTet(): boolean;
    isHex(): boolean;
    calcCent(): Vector3;
    _regenEdges(): this;
}
export namespace TetCell {
    let STRUCT_6: string;
    export { STRUCT_6 as STRUCT };
}
export const TetClasses: {
    [x: number]: typeof TetVertex | typeof TetEdge | typeof TetLoop | typeof TetFace | typeof TetPlane | typeof TetCell;
};
import { Vector3 } from '../util/vectormath.js';
