export class ViewSelected extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        icon: number;
        is_modal: boolean;
        undoflag: any;
    };
    modalStart(ctx: any): void;
}
export class CenterViewOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        icon: number;
        is_modal: boolean;
        undoflag: any;
    };
    p: Vector3;
    modalStart(ctx: any): void;
    node: CallbackNode;
    draw(): void;
    on_pointerup(e: any): void;
    on_keydown(e: any): void;
    modalEnd(was_cancelled: any): void;
    on_pointermove(e: any): void;
}
export class View3DOp extends ToolOp {
    drawlines: any[];
    drawquads: any[];
    drawlines2d: any[];
    modalEnd(wasCancelled: any): void;
    addDrawQuad(v1: any, v2: any, v3: any, v4: any, color: any, useZ?: boolean): void;
    addDrawLine(v1: any, v2: any, color: any, useZ?: boolean): any;
    addDrawLine2D(v1: any, v2: any, color: any): any;
    addDrawCircle2D(p: any, r: any, color: any, quality?: number): void;
    resetTempGeom(): void;
    resetDrawLines(): void;
    removeDrawLine(dl: any): void;
}
export class OrbitTool extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        is_modal: boolean;
        undoflag: any;
        flag: number;
    };
    start_sign: number;
    first: boolean;
    last_mpos: Vector2;
    start_mpos: Vector2;
    start_camera: any;
    on_pointermove(e: any): void;
    on_pointerup(e: any): void;
    on_keydown(e: any): void;
}
export class TouchViewTool extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        is_modal: boolean;
        undoflag: any;
        flag: number;
    };
    last_mpos: Vector2;
    start_mpos: Vector2;
    first: boolean;
    start_camera: any;
    touches: any[];
    _touches: {};
    pan(dx: any, dy: any): void;
    on_pointermove(e: any): void;
    on_pointerup(e: any): void;
    zoom(scale: any): void;
    orbit(dx: any, dy: any): void;
    on_keydown(e: any): void;
}
export class PanTool extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        is_modal: boolean;
        undoflag: any;
        flag: number;
    };
    last_mpos: Vector2;
    start_mpos: Vector2;
    first: boolean;
    start_camera: any;
    on_pointermove(e: any): void;
    on_pointerup(e: any): void;
    on_keydown(e: any): void;
}
export class ZoomTool extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        description: string;
        is_modal: boolean;
        undoflag: any;
        flag: number;
    };
    last_mpos: Vector2;
    start_mpos: Vector2;
    first: boolean;
    start_camera: any;
    on_pointermove(e: any): void;
    on_pointerup(e: any): void;
    on_keydown(e: any): void;
}
import { ToolOp } from '../../path.ux/scripts/pathux.js';
import { Vector3 } from '../../util/vectormath.js';
import { CallbackNode } from "../../core/graph.js";
import { Vector2 } from '../../util/vectormath.js';
