export function closest_bez3_v2(p: any, a: any, b: any, c: any): any;
export function bez3(k1: any, k2: any, k3: any, s: any): number;
export function dbez3(k1: any, k2: any, k3: any, s: any): number;
export function bez3_v2(a: any, b: any, c: any, t: any): any;
export function dbez3_v2(a: any, b: any, c: any, t: any): any;
export function bez4(a: any, b: any, c: any, d: any, t: any): number;
export function dbez4(k1: any, k2: any, k3: any, k4: any, s: any): number;
export function d2bez4(k1: any, k2: any, k3: any, k4: any, s: any): number;
export function d3bez4(k1: any, k2: any, k3: any, k4: any, s: any): number;
export function makeBezier(a: any, b: any, c: any, d: any, s: any): Bezier;
export function testInit(): void;
export class QuadClosestRet3 {
    p: Vector3;
    t: number;
    dist: number;
}
export class Quad {
    constructor(a: any, b: any, c: any);
    a: Vector3;
    b: Vector3;
    c: Vector3;
    evaluate(t: any): any;
    closestPoint(p: any): any;
}
export namespace Quad {
    let STRUCT: string;
}
export class Bezier {
    constructor(a: any, b: any, c: any, d: any);
    a: Vector3;
    b: Vector3;
    c: Vector3;
    d: Vector3;
    quads: any[];
    derivative(s: any): any;
    derivative2(s: any): any;
    closestPoint(p: any): any;
    derivative3(s: any): any;
    curvature(s: any): number;
    evaluate(s: any): any;
    createQuads(): this;
}
export namespace Bezier {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
import { Vector3 } from './vectormath.js';
