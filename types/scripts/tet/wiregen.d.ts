export class OcNode {
    constructor(min: any, max: any, maxDepth: any);
    leaf: boolean;
    min: Vector3;
    max: Vector3;
    size: any;
    centw: number;
    verts: any[][];
    halfsize: any;
    cent: any;
    dead: boolean;
    edges: any[];
    sizes: any[];
    leafLimit: number;
    depth: number;
    subtree_depth: number;
    parent: any;
    children: any[];
    maxDepth: any;
    split(getvert: any): void;
    addEdge(e: any, size: any): void;
}
export class ImplicitWireGen {
    constructor(mesh: any, size: any, edges?: any, maxDepth?: number, minDepth?: number);
    mesh: any;
    verts: Set<any>;
    size: any;
    projectVerts: boolean;
    minDepth: number;
    maxDepth: number;
    edges: Set<any>;
    min: any;
    max: any;
    cent: any;
    tree: OcNode;
    generate(tm: any): void;
    evaluate(co: any): number;
}
import { Vector3 } from '../util/vectormath.js';
