export function visit(root: any, nodetype: any, handler: any): void;
export function traverse(root: any, state: any, handlers: any, log?: boolean, bottomUp?: boolean): void;
export function walk(root: any, handlers: any): void;
export function scopeWalk(root: any, ctx: any, handlers: any, log?: boolean, bottomUp?: boolean): void;
export const strtable: Map<any, any>;
export const hashtable: Map<any, any>;
export const AstTypes: string[];
export class ASTNode extends Array<any> {
    static equalsVarRef(n: any, vref: any): boolean;
    static VarRef(name: any, type: any, idx: any): ASTNode;
    static isAssign(node: any): boolean;
    constructor(type: any);
    id: number;
    type: any;
    parent: any;
    line: any;
    lexpos: any;
    col: number;
    toJSON(): {} & this;
    loadJSON(json: any): this;
    ntype: any;
    op: any;
    polyKey: any;
    noScope: any;
    qualifier: any;
    value: any;
    _getTypeId(): any;
    set(idx: any, n: any): this;
    copyPosTo(b: any): void;
    prepend(n: any): this;
    0: any;
    copy(): ASTNode;
    push(n: any): number;
    replace(a: any, b: any): this;
    remove(n: any): this;
    insert(starti: any, n: any): this;
    lineStr(): string;
    toString(t?: number): string;
}
export namespace ASTNode {
    let STRUCT: string;
}
