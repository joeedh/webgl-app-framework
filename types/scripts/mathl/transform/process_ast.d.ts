export function transformSwizzleSimple(ast: any, ctx: any): void;
export function transformSwizzleComplex(ast: any, ctx: any): void;
export function transformOps(ast: any, ctx: any): void;
export function transformPolymorphism(ast: any, ctx: any): void;
export function initFuncKeyes(ast: any, ctx: any): void;
export function propagateTypes(ast: any, ctx: any, stage?: number): void;
export function transformAst(ast: any, ctx: any): void;
export const swizzlesizes: {
    1: string;
    2: string;
    3: string;
    4: string;
};
export namespace swizzlemap {
    let x: number;
    let y: number;
    let z: number;
    let w: number;
    let r: number;
    let g: number;
    let b: number;
    let a: number;
    let u: number;
    let v: number;
    let t: number;
}
export const swizzlecode: "\n\nvec2 swizzle_vec3_xy(vec3 v) {\n  return vec2(v[0], v[1]);\n}\n";
export namespace swizzlemap2 {
    export { map };
    export { codeget };
    export { codeset };
}
declare let map: {};
declare let codeget: {};
declare let codeset: {};
export {};
