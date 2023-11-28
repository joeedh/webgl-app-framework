export namespace SelToolModes {
    let ADD: number;
    let SUB: number;
    let AUTO: number;
}
export namespace SelOneToolModes {
    let ADD_1: number;
    export { ADD_1 as ADD };
    let SUB_1: number;
    export { SUB_1 as SUB };
    export let UNIQUE: number;
}
export namespace SelMask {
    let VERTEX: MeshTypes;
    let EDGE: MeshTypes;
    let FACE: MeshTypes;
    let HANDLE: MeshTypes;
    let GEOM: number;
    let SGEOM: number;
    let MESH: number;
    let LIGHT: number;
    let CAMERA: number;
    let NULLOBJECT: number;
    let PROCMESH: number;
    let TETMESH: number;
    let STRANDS: number;
    let OBJECT: number;
}
import { MeshTypes } from '../../mesh/mesh_base.js';
