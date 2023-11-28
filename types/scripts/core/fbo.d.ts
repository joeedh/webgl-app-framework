export function getBlitShaderCode(gl: any): {
    vertex: string;
    fragment: string;
    uniforms: {};
    attributes: string[];
};
export class FBO {
    constructor(gl: any, width?: number, height?: number);
    target: any;
    layer: any;
    ctype: number;
    dtype: number;
    etype: number;
    gl: any;
    fbo: any;
    regen: boolean;
    size: Vector2;
    texDepth: any;
    texColor: any;
    getBlitShader(gl: any): any;
    copy(copy_buffers?: boolean): FBO;
    create(gl: any, texColor?: any, texDepth?: any): void;
    setTexColor(gl: any, tex: any): void;
    bind(gl: any): void;
    _last_viewport: any;
    _getQuad(gl: any, width: any, height: any, program: any): simplemesh.SimpleMesh;
    smesh: simplemesh.SimpleMesh;
    blitshader: any;
    /**
     * Draws depth texture to rgba
     * Does not bind framebuffer.
     * */
    drawDepth(gl: any, width: any, height: any, tex: any): void;
    drawQuadScaled(gl: any, width: any, height: any, tex?: any, value_scale?: number, depth?: any): void;
    /**
     * Draws texture to screen
     * Does not bind framebuffer
     * */
    drawQuad(gl: any, width: any, height: any, tex?: any, depth?: any, program?: any, uniforms?: any): void;
    unbind(gl: any): void;
    destroy(): void;
    update(gl: any, width: any, height: any): void;
}
export class FrameStage extends FBO {
    shader: any;
    update(gl: any, width: any, height: any, ...args: any[]): void;
}
export namespace BlitShaderGLSL200 {
    let vertex: string;
    let fragment: string;
    let uniforms: {};
    let attributes: string[];
}
export namespace BlitShaderGLSL300 {
    let vertex_1: string;
    export { vertex_1 as vertex };
    let fragment_1: string;
    export { fragment_1 as fragment };
    let uniforms_1: {};
    export { uniforms_1 as uniforms };
    let attributes_1: string[];
    export { attributes_1 as attributes };
}
export class FramePipeline {
    constructor(width?: number, height?: number);
    stages: FrameStage[];
    size: Vector2;
    smesh: simplemesh.SimpleMesh;
    _texs: webgl.Texture[];
    destroy(gl: any): void;
    addStage(gl: any, shaderdef: any): FrameStage;
    getBlitShader(gl: any): any;
    draw(gl: any, drawfunc: any, width: any, height: any, drawmats: any): void;
    blitshader: any;
    drawFinal(gl: any, stage?: any): void;
}
import { Vector2 } from '../util/vectormath.js';
import * as simplemesh from './simplemesh.js';
import * as webgl from './webgl.js';
