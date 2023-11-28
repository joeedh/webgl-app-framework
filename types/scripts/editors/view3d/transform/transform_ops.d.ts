export namespace SnapModes {
    let NONE: number;
    let SURFACE: number;
}
export class TransformOp extends View3DOp {
    static canRun(ctx: any): boolean;
    static invoke(ctx: any, args: any): any;
    static tooldef(): {
        uiname: string;
        is_modal: boolean;
        inputs: {
            types: any;
            value: Vec3Property;
            space: any;
            snapMode: EnumProperty;
            constraint: any;
            constraint_space: any;
            selmask: any;
            propMode: EnumProperty;
            propRadius: FloatProperty;
            propEnabled: BoolProperty;
        };
    };
    numericVal: {
        sign: number;
        str: string;
        value: number;
    };
    _mpos: Vector2;
    _first: boolean;
    tdata: any;
    centfirst: boolean;
    center: Vector3;
    exec(ctx: any): void;
    numericSet(val: any): void;
    setConstraintFromString(c: any): this;
    getTransTypes(ctx: any): any[];
    _types: any[];
    genTransData(ctx: any): any;
    calcCenter(ctx: any, selmask: any): Vector3;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any, checkTransData?: boolean): void;
    _undo: {};
    undo(ctx: any): void;
    modalStart(ctx: any): void;
    applyTransform(ctx: any, mat: any): void;
    doUpdates(ctx: any): void;
    cancel(): void;
    finish(): void;
    on_pointerup(e: any): void;
    on_mousewheel(e: any): void;
    updatePropRadius(r: any, mpos: any): void;
    updateTransData(): void;
    updateDrawLines(localX: any, localY: any): void;
    on_pointermove(e: any): void;
    doNumericInput(key: any): void;
    on_keydown(e: any): void;
    execPre(ctx: any): void;
    execPost(ctx: any): void;
}
export class TranslateOp extends TransformOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        icon: number;
    };
    constructor(start_mpos: any);
    mpos: Vector3;
    first: boolean;
}
export class ScaleOp extends TransformOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        icon: number;
    };
    constructor(start_mpos: any);
    mpos: Vector3;
    first: boolean;
}
export class RotateOp extends TransformOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        icon: number;
    };
    constructor(start_mpos: any);
    mpos: Vector3;
    last_mpos: Vector3;
    start_mpos: Vector3;
    thsum: number;
    trackball: boolean;
    first: boolean;
    on_pointermove_normal(e: any): void;
    _update(): void;
    on_pointermove_trackball(e: any): void;
}
export class InflateOp extends TransformOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        icon: number;
    };
    constructor(start_mpos: any);
    mpos: Vector3;
    last_mpos: Vector3;
    start_mpos: Vector3;
    thsum: number;
    trackball: boolean;
    first: boolean;
}
export class ToSphereOp extends TransformOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        icon: number;
    };
    static canRun(ctx: any): number;
    constructor(start_mpos: any);
    mpos: Vector3;
    last_mpos: Vector3;
    start_mpos: Vector3;
    thsum: number;
    trackball: boolean;
    radius: number;
    first: boolean;
    calcRadius(ctx: any): void;
}
import { View3DOp } from '../view3d_ops.js';
import { Vector2 } from '../../../util/vectormath.js';
import { Vector3 } from '../../../util/vectormath.js';
import { Vec3Property } from "../../../path.ux/scripts/pathux.js";
import { EnumProperty } from "../../../path.ux/scripts/pathux.js";
import { FloatProperty } from "../../../path.ux/scripts/pathux.js";
import { BoolProperty } from "../../../path.ux/scripts/pathux.js";
