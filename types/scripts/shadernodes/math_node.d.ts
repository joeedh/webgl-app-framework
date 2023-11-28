export namespace MathNodeFuncs {
    let ADD: number;
    let SUB: number;
    let MUL: number;
    let DIV: number;
    let POW: number;
    let SQRT: number;
    let FLOOR: number;
    let CEIL: number;
    let MIN: number;
    let MAX: number;
    let FRACT: number;
    let TENT: number;
    let COS: number;
    let SIN: number;
    let TAN: number;
    let ACOS: number;
    let ASIN: number;
    let ATAN: number;
    let ATAN2: number;
    let LOG: number;
    let EXP: number;
}
export const MathSnippets: {
    [x: number]: string;
};
export class MathNode extends ShaderNode {
    static nodedef(): {
        category: string;
        name: string;
        uiname: string;
        inputs: {
            a: FloatSocket;
            b: FloatSocket;
        };
        outputs: {
            value: FloatSocket;
        };
    };
    mathFunc: number;
    loadSTRUCT(reader: any): void;
}
export namespace MathNode {
    let STRUCT: string;
}
import { ShaderNode } from "./shader_nodes.js";
import { FloatSocket } from "../core/graphsockets.js";
