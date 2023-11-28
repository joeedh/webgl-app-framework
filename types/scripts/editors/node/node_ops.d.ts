export class SavedGraph {
    constructor(graph: any);
    graph: any;
}
export namespace SavedGraph {
    let STRUCT: string;
}
export class NodeGraphOp extends ToolOp {
    static invoke(ctx: any, args: any): any;
    static tooldef(): {
        inputs: {
            graphPath: StringProperty;
            graphClass: StringProperty;
        };
    };
    fetchGraph(ctx: any): any;
    updateAllEditors(ctx: any): void;
    undoPre(ctx: any): void;
    _undo: {};
    calcUndoMem(ctx: any): any;
    undo(ctx: any): void;
}
export class NodeTranslateOp extends NodeGraphOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        icon: number;
        is_modal: boolean;
        inputs: any;
    };
    first: boolean;
    mpos: Vector2;
    start_mpos: Vector2;
    modalStart(ctx: any): void;
    modalEnd(cancelled: any): void;
    on_mousemove(e: any): void;
    _apply(ctx: any, offset: any): void;
    start_positions: {};
    exec(ctx: any): void;
    on_mouseup(e: any): void;
}
export class AddNodeOp extends NodeGraphOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        inputs: any;
        outputs: {
            graph_id: IntProperty;
        };
    };
    exec(ctx: any): void;
}
export class ConnectNodeOp extends NodeGraphOp {
    static tooldef(): {
        toolpath: string;
        description: string;
        uiname: string;
        icon: number;
        inputs: any;
        is_modal: boolean;
    };
    first: boolean;
    start_mpos: Vector2;
    mpos: Vector2;
    last_sock2: any;
    on_mousemove(e: any): void;
    modalStart(ctx: any): void;
    modalEnd(cancelled: any): void;
    on_mouseup(e: any): void;
    execPre(ctx: any): void;
    exec(ctx: any): void;
}
export class DeleteNodeOp extends NodeGraphOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
import { ToolOp } from '../../path.ux/scripts/pathux.js';
import { StringProperty } from '../../path.ux/scripts/pathux.js';
import { Vector2 } from '../../util/vectormath.js';
import { IntProperty } from '../../path.ux/scripts/pathux.js';
