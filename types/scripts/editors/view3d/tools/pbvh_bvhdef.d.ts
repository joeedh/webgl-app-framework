export class BVHDeformPaintOp extends PaintOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
    };
    bvhfirst: boolean;
    bGrabVerts: Map<any, any>;
    randSeed: number;
    last_mpos: Vector3;
    start_mpos: Vector3;
    calcUndoMem(ctx: any): 0 | 32;
    on_pointermove_intern(e: any, x: any, y: any, in_timer?: boolean, isInterp?: boolean): void;
    on_pointermove(e: any, in_timer: any): void;
    _undo: {
        vmap: Map<any, any>;
        nvset: WeakSet<object>;
        vlist: any[];
    };
    _doUndo(v: any): void;
    exec(ctx: any): void;
    onBind(bvh: any): void;
    _applyDef(bvh: any): void;
    execDot(ctx: any, ps: any, lastps: any): void;
}
import { PaintOpBase } from './pbvh_base.js';
import { Vector3 } from '../../../path.ux/scripts/pathux.js';
