export function onContextLost(e: any): void;
export function testDraw(gl: any, uniforms: any): void;
export class FontEncoding {
    map: {};
    characters: string;
    add(chr: any): void;
}
export namespace TextShader {
    let vertex: string;
    let fragment: string;
    namespace uniforms {
        let polygonOffset: number;
        let size: number[];
        let outlineWidth: number;
        let outlineColor: number[];
    }
    let attributes: string[];
}
export const encoding: FontEncoding;
export const defaultFontName: "sans-serif";
export const FONTSCALE: number;
export class SpriteFontSheet {
    constructor(encoding: any, size: any, font: any);
    encoding: any;
    size: any;
    kerning: {};
    font: any;
    render(): void;
    cells: number;
    cellsize: any;
    canvas: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    startMesh(): SimpleMesh;
    appendMesh(smesh: any, text: any, color?: any): void;
    appendChar(smesh: any, char: any, color?: any): void;
    makeTex(gl: any): void;
    glTex: Texture;
    drawMeshScreenSpace(gl: any, smesh: any, co: any, uniforms?: {}): void;
    drawMesh(gl: any, smesh: any, uniforms: any): void;
    onContextLost(e: any): void;
}
export class SpriteFont {
    constructor(font: any);
    sheets: {};
    font: any;
    update(gl: any): void;
    gl: any;
    onContextLost(e: any): void;
    getSheet(size?: number): any;
}
export let defaultFont: SpriteFont;
import { SimpleMesh } from "./simplemesh.js";
import { Texture } from './webgl.js';
