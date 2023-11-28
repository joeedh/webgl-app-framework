export class TexPaintOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            brush: BrushProperty;
            samples: PaintSampleProperty;
            rendermat: any;
            glSize: Vec2Property;
            viewSize: Vec2Property;
            symmetryAxes: FlagProperty;
            doBlur: BoolProperty;
        };
        is_modal: boolean;
    };
    blurfbo: BrushBlurFBO;
    first: boolean;
    start_mpos: Vector3;
    last_p: Vector4;
    last_radius: any;
    last_mpos: Vector3;
    mpos: Vector3;
    getShader(gl: any, brush: any): any;
    on_keydown(e: any): void;
    on_mousemove(e: any): void;
    exec(ctx: any): void;
    execDot(ctx: any, ps: any): void;
    modalStart(ctx: any): void;
    undoPre(ctx: any): void;
    _tiles: any[];
    _tilemap: {};
    undo(ctx: any): void;
    modalEnd(...args: any[]): void;
    on_mouseup(e: any): void;
}
export namespace BrushBlurShader {
    let vertex: string;
    let fragment: string;
    let attributes: string[];
    let uniforms: {};
}
export class BrushBlurFBO {
    constructor(gl: any);
    fbo: FBO;
    shader: ShaderProgram;
    update(gl: any, size: any): void;
    compileShader(gl: any): void;
    draw(gl: any, mpos: any, ob: any, view3d: any, bvh: any, co: any, radius: any, worldRadius: any): void;
    vboxMin: Vector2;
    vboxMax: Vector2;
}
import { ToolOp } from '../../../path.ux/scripts/pathux.js';
import { Vector3 } from '../../../path.ux/scripts/pathux.js';
import { Vector4 } from '../../../path.ux/scripts/pathux.js';
import { BrushProperty } from './pbvh_base.js';
import { PaintSampleProperty } from './pbvh_base.js';
import { Vec2Property } from '../../../path.ux/scripts/pathux.js';
import { FlagProperty } from '../../../path.ux/scripts/pathux.js';
import { BoolProperty } from '../../../path.ux/scripts/pathux.js';
import { FBO } from '../../../core/fbo.js';
import { ShaderProgram } from '../../../core/webgl.js';
import { Vector2 } from '../../../path.ux/scripts/pathux.js';
