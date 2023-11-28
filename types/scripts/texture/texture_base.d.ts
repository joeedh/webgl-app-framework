export const Textures: any[];
export const TextureShaders: {};
export namespace TextureShaderFlags {
    let HAS_COLOR: number;
}
export class TextureShader {
    static textureDefine(): {
        typeName: string;
        uiName: string;
        fragmentPre: string;
        flag: number;
        uniforms: {};
        params: {};
    };
    static defineAPI(api: any): any;
    static buildUI(container: any): void;
    static register(cls: any): void;
    static getTextureClass(name: any): any;
    typeName: any;
    params: {};
    uniforms: {};
    flag: number;
    id: number;
    copyTo(b: any): any;
    genCode(): string;
    loadSTRUCT(reader: any): void;
}
export namespace TextureShader {
    let STRUCT: string;
}
