export namespace DrawShaders {
    namespace IDS {
        let vertex: string;
        let fragment: string;
        let uniforms: {};
        let attributes: string[];
    }
}
export class DebugEditor extends Editor {
    static define(): {
        has3D: boolean;
        tagname: string;
        areaname: string;
        apiname: string;
        uiname: string;
        icon: number;
    };
    displayMode: number;
    activeFBOHistory: string;
    _last_update_key: string;
    glSize: Vector2;
    glPos: Vector2;
    curTex: number;
    _ignore_tab_change: boolean;
    shaders: {};
    updateShaders(gl: any): void;
    gl: any;
    canvas: any;
    rebuildHeader(): void;
    _redraw(): void;
    defineKeyMap(): void;
    drawStart(gl: any): void;
    viewportDraw(gl: any): void;
    drawEnd(): void;
    rect(gl: any, tex: any, uniforms?: {}): void;
    _rect: SimpleMesh;
    updateGlDebug(): void;
    gldebug: any;
    copy(): HTMLElement;
}
export namespace DebugEditor {
    let STRUCT: string;
}
import { Editor } from '../editor_base.js';
import { Vector2 } from '../../util/vectormath.js';
import { SimpleMesh } from "../../core/simplemesh.js";
