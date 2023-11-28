export class TetSelectOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        description: string;
        inputs: any;
    };
    static invoke(ctx: any, args: any): any;
    calcUndoMem(ctx: any): number;
    getMeshes(ctx: any): any[];
    undoPre(ctx: any): void;
    _undo: {
        totMem: number;
        meshes: any[];
    };
    undo(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
