export class SelectOpBase extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        description: string;
        inputs: any;
    };
    static invoke(ctx: any, args: any): any;
}
export class SelectLinkedOp extends SelectOpBase {
    exec(ctx: any): void;
    selLinked(mesh: any, v: any, doneset: any, stack: any): void;
}
export class SelectLinkedPickOp extends SelectLinkedOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        description: string;
        inputs: any;
        is_modal: boolean;
    };
    modalStart(ctx: any): void;
}
export class SelectMoreLess extends SelectOpBase {
    exec(ctx: any): void;
}
export class SelectOneOp extends SelectOpBase {
    exec(ctx: any): void;
}
export class ToggleSelectAll extends SelectOpBase {
    exec(ctx: any): void;
}
export class SetFaceSmoothOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            set: BoolProperty;
        };
    };
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
    exec(ctx: any): void;
}
export class SelectEdgeLoopOp extends SelectOpBase {
    exec(ctx: any): void;
}
export class SelectInverse extends SelectOpBase {
    exec(ctx: any): void;
}
export class SelectNonManifold extends SelectOpBase {
    exec(ctx: any): void;
}
export class SelectShortestLoop extends SelectOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    mode: boolean;
    exec(ctx: any): void;
}
export class SelectLongestLoop extends SelectShortestLoop {
}
export class SelectSimilarOp extends SelectOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class CircleSelectOp extends SelectOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        is_modal: boolean;
        outputs: any;
    };
    mdown: boolean;
    modalStart(ctx: any): void;
    on_keydown(e: any): void;
    on_mousewheel(e: any): void;
    sample(e: any): void;
    on_mousedown(e: any): void;
    drawCircle(x: any, y: any): void;
    on_mouseup(e: any): void;
    on_mousemove(e: any): void;
    exec(ctx: any): void;
}
import { MeshOp } from "./mesh_ops_base.js";
import { ToolOp } from "../path.ux/scripts/pathux.js";
import { BoolProperty } from "../path.ux/scripts/pathux.js";
