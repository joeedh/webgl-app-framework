export function printobj(obj: any): any;
export function parse_intern(src: any, ctx?: state.ParseState): state.ParseState;
export function parse_intern_old(s: any, ctx?: state.ParseState, start?: string): state.ParseState;
export function parse(src: any, startNode: any, args: any, lineOff?: number, lexposOff?: number, column?: number): any;
export let lexer: parseutil.lexer;
import * as state from './state.js';
import * as parseutil from '../util/parseutil.js';
