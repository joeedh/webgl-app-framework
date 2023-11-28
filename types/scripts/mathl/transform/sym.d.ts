export function sym(val: any): any;
export function checksym(s: any): any;
export function call(name: any, args: any): CallSym;
export function avar(name: any, idx: any): ArrayVarSym;
export function binop(a: any, b: any, op: any): any;
export function unaryop(a: any, op: any): any;
export namespace builtin_dvs {
    function cos(name: any, x: any): any;
    function sin(name: any, x: any): any;
    function fract(name: any, x: any): any;
    function floor(name: any, x: any): any;
    function ceil(name: any, x: any): any;
    function min(name: any, x: any): any;
    function max(name: any, x: any): any;
    function step(name: any, x: any): any;
    function log(name: any, x: any): any;
    function sign(name: any, x: any): any;
    function abs(name: any, x: any): any;
}
export namespace SymTypes {
    let BINOP: number;
    let CALL: number;
    let CONST: number;
    let VAR: number;
    let UNARYOP: number;
}
export class Sym extends Array<any> {
    static isRootType(sym: any): number;
    constructor(type: any);
    type: any;
    parent: any;
    isZero(): boolean;
    df(name: any): void;
    subst(name: any, b: any): void;
    add(b: any): any;
    sub(b: any): any;
    mul(b: any): any;
    div(b: any): any;
    call(name: any, args: any): CallSym;
    exp(b: any): any;
    gthan(b: any): any;
    lthan(b: any): any;
    mod(b: any): any;
    equals(b: any): any;
    lequals(b: any): any;
    gequals(b: any): any;
    lor(b: any): any;
    land(b: any): any;
    lnot(): any;
    nequals(): any;
    push(b: any): void;
    copy(): void;
    _copyChildren(b: any): this;
}
export class ValueSym extends Sym {
    value: any;
    df(name: any): any;
    copy(): ValueSym;
}
export class VarSym extends Sym {
    value: any;
    df(name: any): any;
    copy(): VarSym;
}
export class UnarySym extends VarSym {
    constructor(a: any, op: any);
    op: any;
    copy(): UnarySym;
}
export class ArrayVarSym extends VarSym {
    constructor(varname: any, idx: any);
    idx: any;
    copy(): ArrayVarSym;
}
export class BinOpSym extends Sym {
    constructor(a: any, b: any, op: any);
    op: any;
    parens: boolean;
    df(name: any): any;
    copy(): BinOpSym;
}
export class CallSym extends Sym {
    constructor(name: any, args: any);
    value: any;
    df(name: any, ...args: any[]): any;
    copy(): CallSym;
}
export const binops: {};
