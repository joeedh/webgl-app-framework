export function initDebugGL(gl: any): any;
export function addFastParameterGet(gl: any): void;
export function onContextLost(e: any): void;
export function init_webgl(canvas: any, params?: {}): any;
export function hashShader(sdef: any): string;
export function getShader(gl: any, shaderdef: any): any;
export const constmap: {};
export class IntUniform {
    constructor(val: any);
    val: any;
}
export let use_ml_array: boolean;
export class ShaderProgram {
    static fromDef(gl: any, def: any): ShaderProgram;
    static insertDefine(define: any, code: any): string;
    static _use_ml_array(): boolean;
    static multilayerAttrSize(attr: any): string;
    static multilayerGet(attr: any, i: any): string;
    static maxMultilayer(): number;
    static multilayerAttrDeclare(attr: any, type: any, is_fragment: any, is_glsl_300: any): string;
    static multiLayerAttrKey(attr: any, i: any, use_glsl300: any): any;
    static multilayerVertexCode(attr: any): string;
    static load_shader(scriptid: any, attrs: any): ShaderProgram;
    constructor(gl: any, vertex: any, fragment: any, attributes: any);
    vertexSource: any;
    fragmentSource: any;
    attrs: any[];
    _lastDefShader: any;
    multilayer_programs: {};
    defines: {};
    _use_def_shaders: boolean;
    _def_shaders: {};
    multilayer_attrs: {};
    rebuild: number;
    uniformlocs: {};
    attrlocs: {};
    uniform_defaults: {};
    uniforms: {};
    gl: any;
    setAttributeLayerCount(attr: any, n: any): this;
    init(gl: any): any;
    program: any;
    vertexShader: any;
    fragmentShader: any;
    on_gl_lost(newgl: any): void;
    destroy(gl: any): void;
    uniformloc(name: any): any;
    attrloc(name: any): any;
    attrLoc(name: any): any;
    calcDefKey(extraDefines: any): string;
    bindMultiLayer(gl: any, uniforms: any, attrsizes: any, attributes: any): any;
    copy(): ShaderProgram;
    checkCompile(gl: any): any;
    _getLastDefShader(): any;
    _getDefShader(gl: any, defines: {}, attributes: any): any;
    bind(gl: any, uniforms: any, attributes: any): any;
}
export class VBO {
    constructor(gl: any, vbo: any, size?: number, bufferType?: number);
    gl: any;
    vbo: any;
    size: number;
    bufferType: number;
    ready: boolean;
    lastData: any;
    dead: boolean;
    drawhint: any;
    get(gl: any): any;
    checkContextLoss(gl: any): void;
    reset(gl: any): this;
    destroy(gl: any): void;
    uploadData(gl: any, dataF32: any, target?: number, drawhint?: any): void;
}
export class RenderBuffer {
    _layers: {};
    get buffers(): Generator<any, void, unknown>;
    get(gl: any, name: any, bufferType?: any): any;
    reset(gl: any): void;
    destroy(gl: any, name: any): void;
}
export class Texture {
    static unbindAllTextures(gl: any): void;
    static load(gl: any, width: any, height: any, data: any, target?: any, ...args: any[]): Texture;
    static defaultParams(gl: any, tex: any, target?: any): void;
    constructor(texture_slot: any, texture: any, target?: number);
    texture: any;
    texture_slot: any;
    target: number;
    createParams: {
        target: number;
    };
    createParamsList: number[];
    _params: {};
    texParameteri(gl: any, target: any, param: any, value: any): this;
    getParameter(gl: any, param: any): any;
    _texImage2D1(gl: any, target: any, level: any, internalformat: any, format: any, type: any, source: any): this;
    _texImage2D2(gl: any, target: any, level: any, internalformat: any, width: any, height: any, border: any, format: any, type: any, source: any): this;
    texImage2D(...args: any[]): this;
    copy(gl: any, copy_data?: boolean): Texture;
    copyTexTo(gl: any, b: any): this;
    destroy(gl: any): void;
    load(gl: any, width: any, height: any, data: any, target?: any): this;
    initEmpty(gl: any, target: any, width: any, height: any, format?: any, type?: any): this;
    bind(gl: any, uniformloc: any, slot?: any): void;
}
export class CubeTexture extends Texture {
    constructor(texture_slot: any, texture: any);
}
export class DrawMats {
    static STRUCT: string;
    isPerspective: boolean;
    cameramat: Matrix4;
    persmat: Matrix4;
    rendermat: Matrix4;
    normalmat: Matrix4;
    icameramat: Matrix4;
    ipersmat: Matrix4;
    irendermat: Matrix4;
    inormalmat: Matrix4;
    /** aspect should be sizex / sizey */
    regen_mats(aspect?: any): this;
    aspect: any;
    toJSON(): {
        cameramat: number[];
        persmat: number[];
        rendermat: number[];
        normalmat: number[];
        isPerspective: boolean;
        icameramat: number[];
        ipersmat: number[];
        irendermat: number[];
        inormalmat: number[];
    };
    loadJSON(obj: any): this;
    loadSTRUCT(reader: any): void;
}
export class Camera extends DrawMats {
    fovy: number;
    aspect: number;
    pos: Vector3;
    target: Vector3;
    orbitTarget: Vector3;
    up: Vector3;
    near: number;
    far: number;
    generateUpdateHash(objectMatrix?: any): number;
    load(b: any): this;
    copy(): Camera;
    reset(): this;
    loadJSON(obj: any): this;
    /** aspect should be sizex / sizey*/
    regen_mats(aspect?: number): void;
}
import { Matrix4 } from '../util/vectormath.js';
import { Vector3 } from '../util/vectormath.js';
