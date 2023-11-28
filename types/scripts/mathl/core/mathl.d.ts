export function findSlots(ctx: any, ast: any): void;
export function parse(src: any, filename: any): ParseState;
export function genCode(ctx: any, type: any, args?: {}): any;
export function genJS(ctx: any, args?: {}): any;
export function compileJS(code: any, filename: any): any;
export { preprocess } from "../parser/preprocessor.js";
import { ParseState } from './state.js';
export { silence, unsilence } from "../util/util.js";
