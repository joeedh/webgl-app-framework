export class ObjectSelectOpBase extends ToolOp {
    static tooldef(): {};
    execPre(): void;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {
        flags: {};
    };
    undo(ctx: any): void;
}
export class ObjectSelectOneOp extends ObjectSelectOpBase {
    static tooldef(): {
        uiname: string;
        name: string;
        toolpath: string;
        icon: number;
        inputs: {
            mode: EnumProperty;
            objectId: any;
            setActive: BoolProperty;
        };
    };
    static invoke(ctx: any, args: any): ObjectSelectOneOp;
    exec(ctx: any): void;
}
export class ObjectToggleSelectOp extends ObjectSelectOpBase {
    static tooldef(): {
        uiname: string;
        name: string;
        toolpath: string;
        icon: number;
        inputs: any;
    };
    static invoke(ctx: any, args: any): ObjectToggleSelectOp;
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { EnumProperty } from '../path.ux/scripts/pathux.js';
import { BoolProperty } from '../path.ux/scripts/pathux.js';
