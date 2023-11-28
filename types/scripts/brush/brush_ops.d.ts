export class BrushOp extends ToolOp {
    static tooldef(): {
        inputs: {
            dataPath: StringProperty;
        };
    };
    getBrush(ctx: any): any;
    undoPre(ctx: any): void;
    _undo: {
        dview: any;
    };
    undo(ctx: any): void;
}
export class LoadDefaultBrush extends BrushOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        icon: number;
    };
    exec(ctx: any): void;
}
export class ReloadAllBrushes extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        icon: number;
    };
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { StringProperty } from '../path.ux/scripts/pathux.js';
