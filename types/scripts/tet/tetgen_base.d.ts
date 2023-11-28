export namespace TetFlags {
    let SELECT: number;
    let HIDE: number;
    let UPDATE: number;
    let TEMP1: number;
    let TEMP2: number;
    let TEMP3: number;
    let ITER_EDGE_TETS1: number;
    let SURFACE: number;
    let ITER_EDGE_TETSEND: number;
    let MAKEFACE_TEMP: number;
    let FLIP_HEX: number;
}
export namespace TetRecalcFlags {
    let NORMALS: number;
    let RENDER: number;
    let TESSELATION: number;
    let ALL: number;
}
export namespace TetTypes {
    let VERTEX: number;
    let EDGE: number;
    let LOOP: number;
    let FACE: number;
    let PLANE: number;
    let CELL: number;
}
export class TetLogContext extends LogContext {
    constructor();
    newVertex(t: any): void;
    killVertex(t: any): void;
    newEdge(t: any): void;
    killEdge(t: any): void;
    newFace(t: any): void;
    killFace(t: any): void;
    newCell(t: any): void;
    killCell(t: any): void;
}
import { LogContext } from '../mesh/mesh_base.js';
