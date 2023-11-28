export function getBlueMaskDef(): {
    tex: any;
    gl: any;
    shaderPre: string;
};
export function getBlueMask(gl: any): any;
export function setBlueUniforms(uniforms: any, viewport_size: any, bluetex: any, uSample?: number): void;
export let ClosureGLSL: string;
export let LightGenerators: any[];
export class LightGen {
    static setUniforms(gl: any, uniforms: any, scene: any, renderlights?: any, use_jitter?: boolean, seed?: number): void;
    static genDefines(rlights: any): string;
    static register(generator: any): void;
    static pre(): string;
    static generate(closure: any, co: any, normal: any, color: any, brdf: any): string;
    constructor(args: any);
    uniformName: any;
    lightType: any;
    name: any;
    totname: any;
    pre: any;
    lightLoop: any;
    getLightVector: any;
    defines: any;
    genDefines(rlights: any): string;
    gen(closure: any, co: any, normal: any, color: any, brdf: any): any;
}
export let PointLightCode: LightGen;
export let SunLightCode: LightGen;
export class BRDFGen {
    constructor(code: any);
    code: any;
    gen(closure: any, co: any, normal: any, color: any): any;
}
export let DiffuseBRDF: BRDFGen;
export namespace ShaderFragments {
    export let ALPHA_HASH: string;
    export let AMBIENT: string;
    export { ClosureGLSL as CLOSUREDEF };
    export let ATTRIBUTES: string;
    export let UNIFORMS: string;
    export let VARYINGS: string;
    export let SHADERLIB: string;
}
