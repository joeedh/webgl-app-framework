export class EdgeCutOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        is_modal: boolean;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    mpos: Vector2;
    start_mpos: Vector2;
    last_mpos: Vector2;
    first: boolean;
    modalStart(ctx: any): void;
    on_pointermove(e: any): void;
    on_pointerdown(e: any): void;
    on_pointerup(e: any): void;
    exec(ctx: any): void;
}
import { MeshOp } from './mesh_ops_base.js';
import { Vector2 } from '../util/vectormath.js';
