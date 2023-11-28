export namespace UVSelMask {
    let VERTEX: number;
    let EDGE: number;
    let FACE: number;
}
export class SelectOpBaseUV extends UVOpBase {
    static canRun(ctx: any): any;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {
        list: any[];
        active: any;
        highlight: any;
    };
    undo(ctx: any): void;
    execPost(ctx: any): void;
}
export class ToggleSelectAllUVs extends SelectOpBaseUV {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class SelectLinkedOpPick extends SelectOpBaseUV {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
    };
    start_mpos: Vector2;
    last_mpos: Vector2;
    first: boolean;
    modalStart(ctx: any): void;
    on_mouseup(e: any): void;
    pick(x: any, y: any): void;
    exec(ctx: any): void;
}
export class SelectOneUVOp extends SelectOpBaseUV {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
import { UVOpBase } from '../../mesh/mesh_uvops_base.js';
import { Vector2 } from '../../util/vectormath.js';
