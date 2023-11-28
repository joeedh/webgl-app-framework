export function splitEdgeLoops_pre(mesh: any, edges: any, vertWidthMap: Map<any, any>, width: number, lctx: any): {
    cornerMap: Map<any, any>;
    origVertMap: Map<any, any>;
    dirMap: Map<any, any>;
    origEdgeMap: Map<any, any>;
    lvmap: Map<any, any>;
};
export function splitEdgeLoops(mesh: any, edges: any, vertWidthMap: Map<any, any>, width: number, lctx: any, ...args: any[]): {
    dirMap: Map<any, any>;
    cornerMap: Map<any, any>;
    origEdgeMap: Map<any, any>;
    origVertMap: Map<any, any>;
};
export function bevelEdges(mesh: any, edges: any, width: number, lctx: any): void;
export class BevelOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
import { MeshOp } from './mesh_ops_base.js';
