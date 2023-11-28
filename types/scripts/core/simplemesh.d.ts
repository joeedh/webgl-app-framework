export namespace PrimitiveTypes {
    let POINTS: number;
    let LINES: number;
    let TRIS: number;
    let ADVANCED_LINES: number;
    let ALL: number;
}
export namespace LayerTypes {
    let LOC: number;
    let UV: number;
    let COLOR: number;
    let NORMAL: number;
    let ID: number;
    let CUSTOM: number;
    let INDEX: number;
}
export const LayerTypeNames: {
    [x: number]: string;
};
export const TypeSizes: {};
export class TriEditor {
    mesh: any;
    i: number;
    bind(mesh: any, i: any): this;
    colors(c1: any, c2: any, c3: any): this;
    normals(n1: any, n2: any, n3: any): this;
    custom(layeri: any, v1: any, v2: any, v3: any): this;
    uvs(u1: any, u2: any, u3: any): this;
    ids(i1: any, i2: any, i3: any): this;
}
export class QuadEditor {
    t1: TriEditor;
    t2: TriEditor;
    bind(mesh: any, i: any, i2: any): this;
    uvs(u1: any, u2: any, u3: any, u4: any): this;
    custom(li: any, v1: any, v2: any, v3: any, v4: any): void;
    colors(u1: any, u2: any, u3: any, u4: any): this;
    normals(u1: any, u2: any, u3: any, u4: any): this;
    ids(u1: any, u2: any, u3: any, u4: any): this;
}
export class LineEditor {
    mesh: any;
    i: number;
    bind(mesh: any, i: any): this;
    colors(c1: any, c2: any): this;
    custom(layeri: any, v1: any, v2: any): this;
    normals(c1: any, c2: any): this;
    uvs(c1: any, c2: any): this;
    ids(i1: any, i2: any): this;
}
export class LineEditor2 {
    mesh: any;
    i: number;
    bind(mesh: any, i: any): this;
    custom(layeri: any, c1: any, c2: any): this;
    colors(c1: any, c2: any): this;
    normals(c1: any, c2: any): this;
    uvs(c1: any, c2: any): this;
    ids(i1: any, i2: any): this;
}
export class PointEditor {
    mesh: any;
    i: number;
    bind(mesh: any, i: any): this;
    colors(c1: any): this;
    normals(c1: any): this;
    uvs(c1: any): this;
    ids(i1: any): this;
}
export const glTypeSizes: {
    5126: number;
    5120: number;
    5121: number;
    5123: number;
    5122: number;
    5124: number;
    5125: number;
};
export const glTypeArrays: {
    5126: Float32ArrayConstructor;
    5120: Int8ArrayConstructor;
    5121: Uint8ArrayConstructor;
    5122: Int16ArrayConstructor;
    5123: Uint16ArrayConstructor;
    5124: Int32ArrayConstructor;
    5125: Uint32ArrayConstructor;
};
export const glTypeArrayMuls: {
    5126: number;
    5120: number;
    5121: number;
    5123: number;
    5122: number;
    5124: number;
    5125: number;
};
export class GeoLayer extends Array<any> {
    constructor(size: any, name: any, primflag: any, type: any, idx: any);
    index: any;
    glSize: number;
    glSizeMul: number;
    glReady: boolean;
    type: any;
    data: any[];
    _useTypedData: boolean;
    dataUsed: number;
    data_f32: any[];
    f32Ready: boolean;
    normalized: boolean;
    bufferType: number;
    bufferHint: number;
    size: any;
    name: any;
    primflag: any;
    bufferKey: any;
    idx: any;
    id: any;
    _getWriteData(): any[];
    setGLSize(size: any): this;
    setNormalized(state: any): this;
    reset(): this;
    extend(data: any): this;
    setCount(count: any, dirty?: boolean): void;
    _copy2Typed(data1: any, data2: any, n: any, mul: any, start: any): void;
    _copy2(data1: any, data2: any, n: any, mul: any, start: any): void;
    _copy_int(i: any, data: any, n?: number): this;
    copy(i: any, data: any, n?: number): this;
    [Symbol.keystr](): string;
}
export class GeoLayerMeta {
    constructor(primflag: any, type: any, attrsizes: any);
    type: any;
    primflag: any;
    layers: any[];
    normalized: boolean;
    attrsizes: any;
    add(layer: any): void;
}
export class GeoLayerManager {
    layers: any[];
    has_multilayers: boolean;
    _debug_id: number;
    layer_meta: Map<any, any>;
    layer_idgen: util.IDGen;
    attrsizes: Map<any, any>;
    reset(): this;
    copy(): GeoLayerManager;
    get_meta(primflag: any, type: any): any;
    extend(primflag: any, type: any, data: any, count: any): this;
    layerCount(primflag: any, type: any): any;
    pushLayer(name: any, primflag: any, type: any, size: any): GeoLayer;
    get(name: any, primflag: any, type: any, size: any, idx?: any): any;
    [Symbol.iterator](): IterableIterator<any>;
}
export class SimpleIsland {
    constructor(mesh: any);
    layers: GeoLayerManager;
    _glAttrs: {};
    primflag: any;
    mesh: any;
    totpoint: number;
    totline: number;
    tottri: number;
    totline_tristrip: number;
    indexedMode: any;
    layerflag: any;
    regen: number;
    _regen_all: number;
    tri_editors: util.cachering;
    quad_editors: util.cachering;
    line_editors: util.cachering;
    point_editors: util.cachering;
    tristrip_line_editors: util.cachering;
    buffer: webgl.RenderBuffer;
    program: any;
    textures: any[];
    uniforms: {};
    _uniforms_temp: {};
    reset(gl: any): void;
    getIndexedMode(): any;
    setPrimitiveCount(primtype: any, tot: any): this;
    makeBufferAliases(): void;
    tri_cos: any;
    tri_normals: any;
    tri_uvs: any;
    tri_colors: any;
    tri_ids: any;
    line_cos: any;
    line_normals: any;
    line_uvs: any;
    line_colors: any;
    line_ids: any;
    point_cos: any;
    point_normals: any;
    point_uvs: any;
    point_colors: any;
    point_ids: any;
    line_cos2: any;
    line_normals2: any;
    line_uvs2: any;
    line_colors2: any;
    line_ids2: any;
    line_stripuvs: any;
    line_stripdirs: any;
    copy(): SimpleIsland;
    glFlagUploadAll(primflag?: number): void;
    point(v1: any): any;
    smoothline(v1: any, v2: any, w1?: number, w2?: number): any;
    line(v1: any, v2: any): any;
    _newElem(primtype: any, primcount: any): number;
    tri(v1: any, v2: any, v3: any): any;
    quad(v1: any, v2: any, v3: any, v4: any): any;
    destroy(gl: any): void;
    gen_buffers(gl: any): void;
    getIndexBuffer(ptype: any): any;
    _draw_tris(gl: any, uniforms: any, params: any, program: any): void;
    _draw_line_tristrips(gl: any, uniforms: any, params: any, program: any): void;
    flagRecalc(): this;
    bindArrays(gl: any, uniforms: any, program: any, key: any, primflag: any): void;
    addDataLayer(primflag: any, type: any, size?: any, name?: string): GeoLayer;
    getDataLayer(primflag: any, type: any, size?: any, name?: string): any;
    _draw_points(gl: any, uniforms: any, params: any, program: any): void;
    _draw_lines(gl: any, uniforms: any, params: any, program: any): void;
    onContextLost(e: any): void;
    draw(gl: any, uniforms: any, params: any, program_override?: any): void;
    gl: any;
}
export class SimpleMesh {
    constructor(layerflag?: number);
    layerflag: number;
    primflag: number;
    indexedMode: boolean;
    gl: any;
    islands: any[];
    uniforms: {};
    island: any;
    reset(gl: any): void;
    flagRecalc(): void;
    getDataLayer(primflag: any, type: any, size?: any, name?: string): any;
    addDataLayer(primflag: any, type: any, size?: any, name?: string): any;
    copy(): SimpleMesh;
    add_island(): SimpleIsland;
    destroy(gl?: any): void;
    tri(v1: any, v2: any, v3: any): any;
    quad(v1: any, v2: any, v3: any, v4: any): any;
    line(v1: any, v2: any): any;
    point(v1: any): any;
    smoothline(v1: any, v2: any): any;
    drawLines(gl: any, uniforms: any, program_override?: any): void;
    draw(gl: any, uniforms: any, program_override?: any): void;
}
export class ChunkedSimpleMesh extends SimpleMesh {
    constructor(layerflag?: number, chunksize?: number);
    chunksize: number;
    quad_editors: util.cachering;
    freelist: any[];
    freeset: Set<any>;
    delset: any;
    chunkmap: util.IDMap;
    idmap: util.IDMap;
    idgen: number;
    free(id: any): void;
    get_chunk(id: any): any;
    onContextLost(e: any): void;
    regen: number;
    tri(id: any, v1: any, v2: any, v3: any): any;
    quad(id: any, v1: any, v2: any, v3: any, v4: any): void;
    smoothline(id: any, v1: any, v2: any): any;
    line(id: any, v1: any, v2: any): any;
    point(id: any, v1: any): any;
}
import * as util from '../util/util.js';
import * as webgl from './webgl.js';
