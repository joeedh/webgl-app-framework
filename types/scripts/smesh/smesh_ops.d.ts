export class SMeshOpBase extends ToolOp {
    static tooldef(): {
        inputs: {};
        outputs: {};
    };
    getMeshes(ctx: any): any[];
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
    execPost(ctx: any): void;
}
export class SMeshCreateOp extends ToolOp {
    static tooldef(): {
        inputs: {
            newObject: BoolProperty;
        };
        outputs: {
            newObject: DataRefProperty;
        };
    };
    calcUndoMem(ctx: any): any;
    undo(ctx: any): void;
    undoPre(ctx: any): void;
    _undo: {};
    exec(ctx: any): void;
    internalCreate(ctx: any, smesh: any): void;
}
export class MakeSCubeOp extends SMeshCreateOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
}
import { ToolOp } from '../path.ux/pathux.js';
import { BoolProperty } from '../path.ux/pathux.js';
import { DataRefProperty } from '../core/lib_api.js';
