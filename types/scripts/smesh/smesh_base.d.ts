export const MAX_FACE_VERTS: 1024;
export const MAX_VERT_EDGES: 512;
export namespace SMeshTypes {
    let VERTEX: number;
    let EDGE: number;
    let LOOP: number;
    let FACE: number;
}
export namespace SMeshFlags {
    let SELECT: number;
    let HIDE: number;
    let UPDATE: number;
    let TEMP1: number;
}
export namespace SMeshRecalc {
    let RENDER: number;
    let TESSELLATION: number;
    let NORMALS: number;
    let ALL: number;
}
export namespace SMeshAttrFlags {
    let SELECT_1: number;
    export { SELECT_1 as SELECT };
    export let PRIVATE: number;
    export let NO_COPY: number;
}
