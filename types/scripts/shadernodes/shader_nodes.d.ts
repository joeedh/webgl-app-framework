export let ShaderNodeTypes: any[];
export class ShaderNetworkClass extends AbstractGraphClass {
}
export namespace ShaderNetworkClass {
    export { ShaderNodeTypes as NodeTypes };
}
export class Closure {
    emission: Vector3;
    light: Vector3;
    scatter: Vector3;
    normal: Vector3;
    roughness: number;
    alpha: number;
    load(b: any): this;
    copy(): Closure;
}
export namespace Closure {
    let STRUCT: string;
}
export class ClosureSocket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: string;
        flag: number;
    };
    constructor();
    data: Closure;
    copyValue(b: any): Closure;
    getValue(b: any): Closure;
    copyTo(b: any): void;
    copy(): ClosureSocket;
}
export namespace ClosureSocket {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export namespace ShaderContext {
    let GLOBALCO: number;
    let LOCALCO: number;
    let SCREENCO: number;
    let NORMAL: number;
    let UV: number;
    let COLOR: number;
    let TANGENT: number;
    let ID: number;
}
export class ShaderGenerator {
    constructor(scene: any);
    _regen: boolean;
    scene: any;
    paramnames: {};
    uniforms: {};
    textures: Map<any, any>;
    buf: string;
    vertex: any;
    update(gl: any, scene: any, graph: any, engine: any): void;
    graph: any;
    glshader: any;
    bind(gl: any, uniforms: any): void;
    getType(sock: any): "float" | "vec2" | "vec3" | "vec4" | "mat4" | "Closure";
    coerce(socka: any, sockb: any): string;
    getParameter(param: any): void;
    getSocketName(sock: any): any;
    getSocketValue(sock: any, default_param?: any): any;
    getUniform(sock: any, type: any): any;
    out(s: any): void;
    getTexture(imageblock: any): string;
    generate(graph: any, rlights: any, defines?: string): this;
    fragment: any;
    genShader(): {
        fragment: any;
        vertex: any;
        uniforms: {};
        attributes: string[];
        setUniforms(gl: any, graph: any, uniforms: any): void;
        compile(gl: any): ShaderProgram;
    };
    push(node: any): void;
    pop(): void;
}
export class ShaderNode extends Node {
    constructor();
    genCode(gen: any): void;
    buildUI(container: any): void;
}
export namespace ShaderNode {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class OutputNode extends ShaderNode {
    static nodedef(): {
        category: string;
        uiname: string;
        name: string;
        inputs: {
            surface: ClosureSocket;
        };
    };
}
export namespace OutputNode {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export namespace MixModes {
    let MIX: number;
    let MULTIPLY: number;
    let DIVIDE: number;
    let ADD: number;
    let SUBTRACT: number;
}
export class MixNode extends ShaderNode {
    static nodedef(): {
        category: string;
        uiname: string;
        name: string;
        inputs: {
            factor: FloatSocket;
            color1: RGBASocket;
            color2: RGBASocket;
        };
        outputs: {
            color: RGBASocket;
        };
    };
    mode: number;
    loadSTRUCT(reader: any): void;
}
export namespace MixNode {
    let STRUCT_4: string;
    export { STRUCT_4 as STRUCT };
}
export class ImageNode extends ShaderNode {
    static nodedef(): {
        category: string;
        uiname: string;
        name: string;
        inputs: {
            uv: Vec2Socket;
        };
        outputs: {
            color: RGBASocket;
        };
    };
    imageUser: ImageUser;
    loadSTRUCT(reader: any): void;
}
export namespace ImageNode {
    let STRUCT_5: string;
    export { STRUCT_5 as STRUCT };
}
export class DiffuseNode extends ShaderNode {
    static nodedef(): {
        category: string;
        uiname: string;
        name: string;
        inputs: {
            color: RGBASocket;
            roughness: FloatSocket;
            normal: Vec3Socket;
        };
        outputs: {
            surface: ClosureSocket;
        };
    };
    loadSTRUCT(reader: any): void;
}
export namespace DiffuseNode {
    let STRUCT_6: string;
    export { STRUCT_6 as STRUCT };
}
export class GeometryNode extends ShaderNode {
    static nodedef(): {
        category: string;
        uiname: string;
        name: string;
        outputs: {
            position: Vec3Socket;
            normal: Vec3Socket;
            screen: Vec3Socket;
            local: Vec3Socket;
            uv: Vec2Socket;
        };
    };
    loadSTRUCT(reader: any): void;
}
export namespace GeometryNode {
    let STRUCT_7: string;
    export { STRUCT_7 as STRUCT };
}
import { AbstractGraphClass } from '../core/graph_class.js';
import { Vector3 } from '../util/vectormath.js';
import { NodeSocketType } from '../core/graph.js';
import { ShaderProgram } from "../core/webgl.js";
import { Node } from '../core/graph.js';
import { FloatSocket } from "../core/graphsockets.js";
import { RGBASocket } from "../core/graphsockets.js";
import { ImageUser } from '../image/image.js';
import { Vec2Socket } from "../core/graphsockets.js";
import { Vec3Socket } from "../core/graphsockets.js";
export { ClosureGLSL, PointLightCode } from "./shader_lib.js";
