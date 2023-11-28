export namespace TexturePathModes {
    let BRUSH: number;
    let EDITOR: number;
}
export class ChangeActCDLayerOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            fullMeshUndo: any;
            redrawAll: any;
            meshPath: any;
            type: any;
            elemType: any;
            active: any;
        };
    };
    _undo: {
        elemtype: any;
        type: any;
    };
    getMesh(ctx: any): any;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    undo(ctx: any): void;
    exec(ctx: any): void;
}
export class CDLayerPanel extends ColumnFrame {
    _lastUpdateKey: any;
    _saving: boolean;
    _saved_uidata: any;
    set showDisableIcons(arg: boolean);
    get showDisableIcons(): boolean;
    set fullMeshUndo(arg: boolean);
    get fullMeshUndo(): boolean;
    set redrawAll(arg: boolean);
    get redrawAll(): boolean;
    rebuild(): void;
    list: any;
    updateDataPath(): void;
}
export class ObjectPanel extends ColumnFrame {
    _last_update_key: string;
    rebuild(): void;
}
export class TexturePanel extends Container {
    canvas: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    previewSize: number;
    _lastkey: any;
    _drawreq: number;
    _rebuildReq: number | boolean;
    getTexture(): any;
    mode: any;
    preview: any;
    settings: any;
    rebuild(): void;
    flagRebuild(): void;
    flagRedraw(): void;
    redraw(): void;
}
export class TextureSelectPanel extends TexturePanel {
    browser: any;
}
export class PropsEditor extends Editor {
    static define(): {
        tagname: string;
        areaname: string;
        apiname: string;
        uiname: string;
        icon: number;
    };
    texUser: ProceduralTexUser;
    texturePathMode: number;
    texturePath: string;
    _last_toolmode: any;
    set _texture(arg: any);
    get _texture(): any;
    tabs: any;
    workspaceTab: any;
    objTab: any;
    texTab: any;
    _last_obj: any;
    textureTab(tab: any): void;
    texPanel: HTMLElement;
    materialPanel(tab: any): void;
    updateToolMode(): void;
    copy(): HTMLElement;
}
import { ToolOp } from '../../path.ux/scripts/pathux.js';
import { ColumnFrame } from '../../path.ux/scripts/core/ui.js';
import { Container } from '../../path.ux/scripts/core/ui.js';
import { Editor } from '../editor_base.js';
import { ProceduralTexUser } from '../../texture/proceduralTex.js';
