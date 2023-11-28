export function saveUndoTetMesh(mesh: any): {
    dview: DataView;
};
export function loadUndoTetMesh(ctx: any, data: any): any;
export class TetMeshOp extends ToolOp {
    getMeshes(ctx: any): any[];
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
}
export class TetDeformOp extends ToolOp {
    getMeshes(ctx: any): any[];
    undoPre(ctx: any): void;
    _undo: any[];
    undo(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
