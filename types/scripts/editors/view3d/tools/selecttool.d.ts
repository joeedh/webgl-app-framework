export class ObjectEditor extends ToolMode {
    static toolModeDefine(): {
        name: string;
        uiname: string;
        description: string;
        icon: number;
        flag: number;
        selectMode: number;
        transWidgets: (typeof ScaleWidget | typeof RotateWidget)[];
    };
    start_mpos: Vector2;
    transformWidget: number;
    _transformProp: any;
    test: string;
    defineKeyMap(): any;
    clearHighlight(ctx: any): void;
    on_mousedown(e: any, x: any, y: any, was_touch: any, ...args: any[]): boolean;
    on_mousemove(e: any, x: any, y: any, was_touch: any, ...args: any[]): boolean;
    _updateHighlight(e: any, x: any, y: any, was_touch: any): void;
    drawObject(gl: any, uniforms: any, program: any, object: any): boolean;
    findnearest(ctx: any, x: any, y: any, selmask?: number, limit?: number): any;
}
export namespace ObjectEditor {
    let STRUCT: string;
}
import { ToolMode } from '../view3d_toolmode.js';
import { Vector2 } from '../../../util/vectormath.js';
import { ScaleWidget } from "../widgets/widget_tools.js";
import { RotateWidget } from "../widgets/widget_tools.js";
