export class TransLoop {
    constructor(l: any, uv: any);
    l: any;
    startuv: Vector2;
    uv: any;
    w: number;
}
export class UVTransformOp extends UVOpBase {
    static tooldef(): {
        inputs: any;
        is_modal: boolean;
    };
    start_mpos: Vector2;
    last_mpos: Vector2;
    mpos: Vector2;
    first: boolean;
    tcenter: Vector2;
    modalStart(ctx: any): void;
    tdata: any[];
    on_mousemove(e: any): void;
    doMouseMove(mpos: any, start_mpos: any, last_mpos: any, uveditor: any): void;
    getMesh(ctx: any): any;
    on_mouseup(e: any): void;
    on_keydown(e: any): void;
    getTransData(ctx: any): any[];
    getTransCenter(ctx: any, tdata?: any[]): any;
    genTransData(ctx: any): void;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
    updateMesh(mesh: any): void;
    execPost(): void;
}
export class UVTranslateOp extends UVTransformOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        is_modal: boolean;
    };
    exec(ctx: any): void;
}
export class UVScaleOp extends UVTransformOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        is_modal: boolean;
    };
    exec(ctx: any): void;
}
export class UVRotateOp extends UVTransformOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        is_modal: boolean;
    };
    exec(ctx: any): void;
}
import { Vector2 } from '../../util/vectormath.js';
import { UVOpBase } from '../../mesh/mesh_uvops_base.js';
