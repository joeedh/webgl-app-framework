export function buildProcTextureAPI(api: any, api_define_datablock: any): any;
export namespace PatternRecalcFlags {
    let PREVIEW: number;
}
export const Patterns: any[];
export namespace PatternFlags {
    let SELECT: number;
}
export class PatternGen {
    static safeFloat(f: any): any;
    static patternDefine(): {
        typeName: string;
        uiName: string;
        defaultName: string;
        icon: number;
        flag: number;
        uniforms: {};
    };
    static defineAPI(api: any): any;
    static buildSettings(container: any): void;
    static getGeneratorClass(name: any): any;
    static register(cls: any): void;
    flag: any;
    name: any;
    genTexShader(): void;
    texShaderJS: any;
    texShaderJSHash: number;
    checkTexShaderJS(): void;
    genGlsl(inputP: any, outputC: any, uniforms: any): void;
    genGlslPre(inC: any, outP: any, uniforms?: {}): string;
    bindUniforms(uniforms: any): this;
    copy(): any;
    copyTo(b: any): void;
    calcUpdateHash(digest: any, recompileOnly: any): void;
    evaluate(co: any, color_out: any): any;
    derivative(co: any): any;
}
export namespace PatternGen {
    let STRUCT: string;
}
export class SimpleNoise extends PatternGen {
    static defineAPI(api: any): void;
    static patternDefine(): {
        typeName: string;
        defaultName: string;
        uiName: string;
    };
    levels: number;
    levelScale: number;
    factor: number;
    zoff: number;
    evaluate(co: any): number;
    evaluate_intern(co: any, scale: any): number;
}
export namespace SimpleNoise {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class MoireNoise extends PatternGen {
    static patternDefine(): {
        typeName: string;
        defaultName: string;
        uiName: string;
        uniforms: {
            angleOffset: string;
        };
    };
    dynamicAngle: boolean;
    angleOffset: number;
    genGlsl(inputP: any, outputC: any, uniforms: any): string;
    evaluate(co: any, dv_out: any): number;
}
export namespace MoireNoise {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export namespace CombModes {
    let SAW: number;
    let TENT: number;
    let SIN: number;
    let STEP: number;
    let DOME: number;
    let RAW_STEP: number;
}
export class CombPattern extends PatternGen {
    static patternDefine(): {
        typeName: string;
        defaultName: string;
        uiName: string;
        uniforms: {
            angleOffset: string;
            count: string;
            combWidth: string;
            blackPoint: string;
        };
    };
    count: number;
    angleOffset: number;
    mode: number;
    combWidth: number;
    blackPoint: number;
    bindUniforms(uniforms: any): void;
    calcUpdateHash(digest: any, recompileOnly?: boolean): void;
    genGlsl(inputP: any, outputC: any, uniforms: any): string;
}
export namespace CombPattern {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export class GaborNoise extends PatternGen {
    static defineAPI(api: any): void;
    static patternDefine(): {
        typeName: string;
        defaultName: string;
        uiName: string;
        uniforms: {
            levels: string;
            levelScale: string;
            factor: string;
            randomness: string;
            decayPower: string;
            decay2: string;
            zoff: string;
        };
    };
    levels: number;
    levelScale: number;
    factor: number;
    randomness: number;
    decayPower: number;
    decay2: number;
    zoff: number;
    calcUpdateHash(digest: any, recompileOnly?: boolean): void;
    evaluate(co: any): any;
    genGlsl(inputP: any, outputC: any, uniforms: any): string;
    evaluate_intern(co: any, scale: any): number;
}
export namespace GaborNoise {
    let STRUCT_4: string;
    export { STRUCT_4 as STRUCT };
}
export class ProceduralTex extends DataBlock {
    static getPattern(index_or_typename_or_class: any): any;
    static buildGeneratorEnum(): any;
    static blockDefine(): {
        typeName: string;
        uiName: string;
        defaultName: string;
        icon: number;
    };
    static nodedef(): {
        name: string;
        uiname: string;
        flag: number;
        inputs: {
            depend: DependSocket;
        };
        outputs: {
            depend: DependSocket;
        };
    };
    updateGen: number;
    generators: any[];
    generator: any;
    scale: number;
    power: number;
    brightness: number;
    contrast: number;
    recalcFlag: number;
    previews: any[];
    _last_update_hash: any;
    _digest: util.HashDigest;
    calcMemSize(): number;
    bindUniforms(uniforms: any): void;
    genGlsl(inP: any, outC: any, uniforms?: {}): any;
    genGlslPre(inP: any, outC: any, uniforms?: {}): string;
    update(): boolean;
    buildSettings(container: any): void;
    getPreview(width: any, height: any): any;
    genPreview(width: any, height: any): HTMLCanvasElement;
    getGenerator(cls: any): any;
    setGenerator(cls: any): this;
    evaluate(co: any, scale?: number): any;
    derivative(co1: any, scale: any): any;
}
export namespace ProceduralTex {
    let STRUCT_5: string;
    export { STRUCT_5 as STRUCT };
}
export namespace TexUserFlags {
    let SELECT_1: number;
    export { SELECT_1 as SELECT };
    export let RAKE: number;
    export let CONSTANT_SIZE: number;
    export let FANCY_RAKE: number;
    export let ORIGINAL_CO: number;
    export let CURVED: number;
}
export namespace TexUserModes {
    let GLOBAL: number;
    let VIEWPLANE: number;
    let VIEW_REPEAT: number;
}
export class ProceduralTexUser {
    texture: any;
    scale: number;
    mode: number;
    flag: number;
    pinch: number;
    sample(co: any, texScale: any, angle: any, rendermat: any, screen_origin: any, aspect: any, dv_out: any): any;
    copyTo(b: any): void;
    copy(): ProceduralTexUser;
    equals(b: any): boolean;
    calcHashKey(digest?: util.HashDigest): number;
    dataLink(owner: any, getblock: any, getblock_adduser: any): void;
    loadSTRUCT(reader: any): void;
}
export namespace ProceduralTexUser {
    let STRUCT_6: string;
    export { STRUCT_6 as STRUCT };
}
import { DataBlock } from "../core/lib_api.js";
import * as util from '../util/util.js';
import { DependSocket } from '../core/graphsockets.js';
