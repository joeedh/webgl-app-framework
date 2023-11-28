export class FBOSocket extends NodeSocketType {
    static nodedef(): {
        uiname: string;
        name: string;
        color: number[];
    };
    constructor();
    data: FBO;
    copyTo(b: any): this;
    copy(): FBOSocket;
    getValue(): FBO;
}
export class RenderContext {
    constructor(gl: any, engine: any, size: any, drawmats: any, scene: any);
    gl: any;
    scene: any;
    drawmats: any;
    smesh: SimpleMesh;
    engine: any;
    size: any[];
    uSample: number;
    weightSum: number;
    update(gl: any, size: any): void;
    blitshader: any;
    drawQuad(program: any, size: any): void;
    drawFinalQuad(fbo: any): void;
    renderStage(fbo: any, size: any, drawfunc: any): void;
}
export class RenderPass extends Node {
    static nodedef(): {
        inputs: {
            fbo: FBOSocket;
        };
        outputs: {
            fbo: FBOSocket;
        };
        shader: string;
        shaderPre: string;
    };
    constructor();
    uniforms: {};
    sizeScale: number;
    hasCustomSize: boolean;
    size: number[];
    getDebugName(): any;
    getOutput(): any;
    getShader(rctx: any): import("../core/webgl.js").ShaderProgram;
    compileShader(rctx: any): {
        vertex: string;
        fragment: any;
        attributes: string[];
        uniforms: {};
    };
    _shader: import("../core/webgl.js").ShaderProgram;
    bindInputs(rctx: any, program: any): void;
    renderIntern(rctx: any): void;
}
export class RenderGraph {
    graph: Graph;
    smesh: any;
    uniforms: {};
    size: number[];
    clear(): void;
    exec(gl: any, engine: any, size: any, drawmats: any, scene: any): void;
    rctx: RenderContext;
    add(node: any): this;
    remove(node: any): this;
}
import { NodeSocketType } from '../core/graph.js';
import { FBO } from '../core/fbo.js';
import { SimpleMesh } from '../core/simplemesh.js';
import { Node } from '../core/graph.js';
import { Graph } from '../core/graph.js';
