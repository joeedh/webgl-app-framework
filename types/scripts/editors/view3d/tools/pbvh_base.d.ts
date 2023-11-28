export function getBVH(ctx: any): any;
export function regenBVH(ctx: any): any;
export function calcConcave(v: any): number;
export function calcConcaveLayer(mesh: any): void;
export const SymAxisMap: number[][][];
export let BRUSH_PROP_TYPE: any;
export class BrushProperty extends ToolProperty<any> {
    constructor(value: any);
    brush: SculptBrush;
    _texture: ProceduralTex;
    calcMemSize(): number;
    setDynTopoSettings(dynTopo: any): void;
    setValue(brush: any): this;
    getValue(): SculptBrush;
    loadSTRUCT(reader: any): void;
}
export namespace BrushProperty {
    let STRUCT: string;
}
export class PaintSample {
    static getMemSize(): number;
    origp: Vector4;
    p: Vector4;
    dp: Vector4;
    viewPlane: Vector3;
    rendermat: Matrix4;
    strokeS: number;
    dstrokeS: number;
    smoothProj: number;
    pinch: number;
    sharp: number;
    sp: Vector4;
    dsp: Vector4;
    futureAngle: number;
    invert: boolean;
    w: number;
    color: Vector4;
    angle: number;
    viewvec: Vector3;
    vieworigin: Vector3;
    isInterp: boolean;
    vec: Vector3;
    dvec: Vector3;
    autosmoothInflate: number;
    concaveFilter: number;
    strength: number;
    radius: number;
    rake: number;
    autosmooth: number;
    esize: number;
    planeoff: number;
    mirrored: boolean;
    mirror(mul?: Vector4): this;
    copyTo(b: any): void;
    copy(): PaintSample;
}
export namespace PaintSample {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export let PAINT_SAMPLE_TYPE: any;
export class PaintSampleProperty extends ToolProperty<any> {
    constructor();
    data: any[];
    calcMemSize(): any;
    push(sample: any): this;
    getValue(): any[];
    setValue(b: any): this;
    copy(): PaintSampleProperty;
    loadSTRUCT(reader: any): void;
    [Symbol.iterator](): IterableIterator<any>;
}
export namespace PaintSampleProperty {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class SetBrushRadius extends ToolOp {
    static canRun(ctx: any): boolean;
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            radius: FloatProperty;
            brush: DataRefProperty;
        };
        is_modal: boolean;
    };
    static invoke(ctx: any, args: any): any;
    last_mpos: Vector2;
    mpos: Vector2;
    start_mpos: Vector2;
    cent_mpos: Vector2;
    first: boolean;
    modalStart(ctx: any): void;
    on_pointermove(e: any): void;
    on_pointerup(e: any): void;
    exec(ctx: any): void;
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
    on_keydown(e: any): void;
}
export class PathPoint {
    constructor(co: any, dt: any);
    color: string;
    co: Vector2;
    origco: Vector2;
    vel: Vector2;
    acc: Vector2;
    dt: any;
}
export class PaintOpBase extends ToolOp {
    static tooldef(): {
        inputs: {
            brush: BrushProperty;
            samples: PaintSampleProperty;
            symmetryAxes: FlagProperty;
            falloff: any;
            rendermat: any;
            viewportSize: Vec2Property;
        };
    };
    static needOrig(brush: any): boolean;
    task: Generator<any, void, unknown>;
    grabMode: boolean;
    mfinished: boolean;
    last_mpos: Vector2;
    last_p: Vector3;
    last_origco: Vector4;
    _first: boolean;
    last_draw: number;
    lastps1: any;
    lastps2: any;
    last_radius: number;
    last_vec: Vector3;
    rand: util.MersenneRandom;
    queue: any[];
    qlast_time: number;
    timer: number;
    path: any[];
    alast_time: number;
    _savedViewPoints: any[];
    timer_on_tick(): void;
    appendPath(x: any, y: any): void;
    drawPath(): void;
    on_keydown(e: any): void;
    on_pointermove(e: any, in_timer?: boolean): void;
    makeTask(): Generator<any, void, unknown>;
    hasSampleDelay(): void;
    on_pointermove_intern(e: any, x?: any, y?: any, in_timer?: boolean, isInterp?: boolean): {
        origco: Vector4;
        p: any;
        isect: any;
        radius: any;
        ob: any;
        vec: Vector3;
        mpos: any;
        view: any;
        getchannel: (key: any, val: any) => any;
        w: number;
    };
    getBVH(mesh: any): any;
    sampleViewRay(rendermat: any, mpos: any, view: any, origin: any, pressure: any, invert: any, isInterp: any): {
        origco: Vector4;
        p: any;
        isect: any;
        radius: any;
        ob: any;
        vec: Vector3;
        mpos: any;
        view: any;
        getchannel: (key: any, val: any) => any;
        w: number;
    };
    writeSaveViewPoints(n?: number): any;
    taskNext(): void;
    modalEnd(was_cancelled: any): void;
    on_pointerup(e: any): void;
    undoPre(ctx: any): void;
    calcUndoMem(ctx: any): void;
    modalStart(ctx: any): void;
    undo(ctx: any): void;
}
export class MaskOpBase extends ToolOp {
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {
        mesh: number;
    };
    undo(ctx: any): void;
    getCDMask(mesh: any): any;
    execPre(ctx: any): void;
    getVerts(mesh: any, updateBVHNodes?: boolean): Generator<any, void, unknown>;
}
export class ClearMaskOp extends MaskOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            value: FloatProperty;
        };
    };
    exec(ctx: any): void;
}
import { ToolProperty } from '../../../path.ux/scripts/pathux.js';
import { SculptBrush } from '../../../brush/brush.js';
import { ProceduralTex } from '../../../texture/proceduralTex.js';
import { Vector4 } from '../../../path.ux/scripts/pathux.js';
import { Vector3 } from '../../../path.ux/scripts/pathux.js';
import { Matrix4 } from '../../../path.ux/scripts/pathux.js';
import { ToolOp } from '../../../path.ux/scripts/pathux.js';
import { Vector2 } from '../../../path.ux/scripts/pathux.js';
import { FloatProperty } from '../../../path.ux/scripts/pathux.js';
import { DataRefProperty } from '../../../core/lib_api.js';
import * as util from '../../../util/util.js';
import { FlagProperty } from '../../../path.ux/scripts/pathux.js';
import { Vec2Property } from '../../../path.ux/scripts/pathux.js';
