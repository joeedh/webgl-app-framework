export function getParser(): any;
export function initParser(): void;
export function rebuildParser(): jscc_util.Parser;
export function fullVisit(ast: any, cb: any): void;
export function visit(ast: any, handlers: any): void;
export function controlledVisit(ast: any, handlers: any, state: any): void;
export class GLSLLexer extends lexer {
    constructor();
    scope: {};
    structs: {};
    scopestack: any[];
    linemap: any[];
    pushScope(): void;
    popScope(): void;
}
export const Precedence: {};
export class Node1 extends Array<any> {
    constructor(type: any);
    type: any;
    parent: any;
    push(n: any): number;
    add(n: any): void;
    remove(n: any): this;
    insert(starti: any, n: any): this;
    replace(n: any, n2: any): this;
    toString(t?: number): string;
}
export const parser: any;
import * as jscc_util from './jscc_util.js';
import { lexer } from "../util/parseutil.js";
