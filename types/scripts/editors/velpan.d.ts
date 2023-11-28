export namespace VelPanFlags {
    let UNIFORM_SCALE: number;
}
export class VelPan {
    /** boundary limits*/
    bounds: Vector2[];
    decay: number;
    pos: Vector2;
    scale: Vector2;
    vel: Vector2;
    oldpos: Vector2;
    maxVelocity: number;
    axes: number;
    flag: number;
    mat: Matrix4;
    imat: Matrix4;
    _last_mat: Matrix4;
    onchange: any;
    last_update_time: number;
    timer: number;
    copy(): VelPan;
    get min(): Vector2;
    get max(): Vector2;
    reset(fireOnChange?: boolean): this;
    /**
     load settings from another velocity pan instance
     does NOT set this.onchange
     * */
    load(velpan: any): this;
    startVelocity(): void;
    doVelocity(): void;
    updateMatrix(): this;
    update(fire_events?: boolean, do_velocity?: boolean): this;
    loadSTRUCT(reader: any): void;
}
export namespace VelPan {
    let STRUCT: string;
}
export class VelPanPanOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        undoflag: any;
        is_modal: boolean;
        icon: number;
        inputs: {
            velpanPath: StringProperty;
            pan: Vec2Property;
        };
    };
    start_pan: Vector2;
    first: boolean;
    last_mpos: Vector2;
    start_mpos: Vector2;
    start_time: number;
    last_time: number;
    _temps: util.cachering;
    on_mousemove(e: any): void;
    exec(ctx: any): void;
    on_mouseup(e: any): void;
}
import { Vector2 } from "../util/vectormath.js";
import { Matrix4 } from "../util/vectormath.js";
import { ToolOp } from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';
import { StringProperty } from '../path.ux/scripts/pathux.js';
import { Vec2Property } from '../path.ux/scripts/pathux.js';
