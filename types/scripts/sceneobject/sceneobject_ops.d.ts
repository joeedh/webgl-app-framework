export function getStdTools(ctx: any): any;
export class SceneObjectOp extends ToolOp {
    execPost(ctx: any): void;
}
export class DeleteObjectOp extends SceneObjectOp {
    static tooldef(): {
        toolpath: string;
        name: string;
        uiname: string;
        description: string;
        inputs: {};
        outputs: {};
        icon: number;
    };
    exec(ctx: any): void;
}
export class ObjectTools extends StandardTools {
    static ToggleSelectAll(ctx: any, mode?: number): void;
    static Delete(ctx: any): void;
    static SelectOne(ctx: any, unique?: boolean): void;
}
export namespace ApplyTransFlags {
    let LOC: number;
    let ROT: number;
    let SCALE: number;
    let ALL: number;
}
export class ApplyTransformOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            mode: FlagProperty;
        };
    };
    _badObject(ob: any): boolean;
    exec(ctx: any): void;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
}
export class DuplicateObjectOp extends SceneObjectOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        inputs: {};
        outputs: {};
        icon: number;
    };
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { StandardTools } from "./stdtools.js";
import { FlagProperty } from '../path.ux/scripts/pathux.js';
