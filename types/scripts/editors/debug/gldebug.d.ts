export function getFBODebug(gl: any): any;
export namespace DisplayShader {
    let vertex: string;
    let fragment: string;
    let uniforms: {};
    let attributes: string[];
}
export namespace DepthShader {
    let vertex_1: string;
    export { vertex_1 as vertex };
    let fragment_1: string;
    export { fragment_1 as fragment };
    let uniforms_1: {};
    export { uniforms_1 as uniforms };
    let attributes_1: string[];
    export { attributes_1 as attributes };
}
export namespace ShaderDef {
    export { DisplayShader };
    export { DepthShader };
}
export const Shaders: {};
export class FBOHistory extends Array<any> {
    constructor(max?: number);
    max: number;
    push(fbo: any): number;
    get head(): any;
}
export class glDebug {
    static getDebug(gl: any): any;
    constructor(gl: any);
    gl: any;
    stack: any[];
    maxTex: number;
    _clean_gl: {};
    texs: any[];
    fbos: {};
    get debugEditorOpen(): boolean;
    pushFBO(name: string, fbo: any, only_if_debug_editor?: boolean): void;
    saveDrawBufferFBOBlit(name: any): void;
    saveDrawBuffer(name: any): void;
    loadCleanGL(): void;
    saveGL(): {};
    restoreGL(): void;
    loadShaders(): void;
}
