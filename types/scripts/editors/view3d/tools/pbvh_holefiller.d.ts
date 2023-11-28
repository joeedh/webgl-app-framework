export function fillHoleFromVert(mesh: any, bvh: any, startv: any, visit: any, lctx: any): void;
export function fillBoundaryHoles(mesh: any, bvh: any, vs: any, lctx: any): void;
export class HoleFillPaintOp extends PaintOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
    };
    last_mpos: Vector3;
    start_mpos: Vector3;
    calcUndoMem(ctx: any): any;
    _undo: {};
    on_mousemove_intern(e: any, x: any, y: any, in_timer?: boolean, isInterp?: boolean): void;
    exec(ctx: any): void;
    execDot(ctx: any, ps: any, lastps: any): void;
}
import { PaintOpBase } from './pbvh_base.js';
import { Vector3 } from '../../../path.ux/scripts/pathux.js';
