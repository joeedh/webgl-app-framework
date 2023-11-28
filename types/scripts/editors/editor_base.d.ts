/**
 *
 * @param container
 * @param cls
 * @param path
 * @param onValidData : callback, gets a container as argument so you can build elements when valid data exists.
 * @returns {*}
 */
export function makeDataBlockBrowser(container: any, cls: any, path: any, onValidData: any): any;
export function rebuildEditorAccessor(): void;
export function buildEditorsAPI(api: any, ctxStruct: any): void;
export function spawnToolSearchMenu(ctx: any): void;
export class NewDataBlockOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            name: StringProperty;
            blockType: StringProperty;
            dataPathToSet: StringProperty;
        };
        outputs: {
            block: DataRefProperty;
        };
    };
    exec(ctx: any): void;
}
export class CopyDataBlockOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            block: DataRefProperty;
            dataPathToSet: StringProperty;
        };
        outputs: {
            block: DataRefProperty;
        };
    };
    exec(ctx: any): void;
}
export class AssignDataBlock extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            block: DataRefProperty;
            dataPathToSet: StringProperty;
        };
    };
    exec(ctx: any): void;
}
export class UnlinkDataBlockOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            block: DataRefProperty;
            dataPathToUnset: StringProperty;
        };
        outputs: {};
    };
    exec(ctx: any): void;
}
/**
 * Requires attributes:
 *
 * \attribute datapath
 *
 * \prop blockClass class of data blocks for this browser
 * \prop newOp toolpath for op to make a new block (defaults to "datalib.default_new")
 * \prop duplicateOp toolpath for op to duplciate a block (defaults to "datalib.default_copy")
 * \prop unlinkOp toolpath for op to unlink a block from its owner (defualts to "datalib.default_unlink")
 */
export class DataBlockBrowser extends Container {
    blockClass: any;
    ownerPath: any;
    vertical: boolean;
    _owner_exists: boolean;
    _path_exists: boolean;
    _needs_rebuild: boolean;
    _last_mat_name: any;
    useDataPathUndo: boolean;
    filterFunc: any;
    onValidData: any;
    newOp: string;
    duplicateOp: string;
    unlinkOp: string;
    assignOp: string;
    flagRebuild(): void;
    _getDataPath(): string;
    rebuild(): void;
    doesOwnerExist(): any;
}
export class ImageUserWidget extends DataBlockBrowser {
    blockClass: typeof ImageBlock;
}
export function getContextArea(cls: any): any;
export class EditorAccessor {
    _defined: Set<any>;
    _namemap: {};
    update(): void;
}
export let editorAccessor: EditorAccessor;
export class EditorSideBar extends Container {
    static define(): {
        tagname: string;
        style: string;
    };
    editor: any;
    _closed: boolean;
    closedWidth: number;
    openWidth: number;
    _height: number;
    _width: number;
    set width(arg: number);
    get width(): number;
    set height(arg: number);
    get height(): number;
    set closed(arg: any);
    clear(): void;
    _icon: any;
    tabpanel: any;
    collapse(): void;
    expand(): void;
}
export class Editor extends Area {
    static defineAPI(api: any): any;
    static newSTRUCT(): HTMLElement;
    useDataPathUndo: boolean;
    swapParent: any;
    container: HTMLElement;
    makeSideBar(): HTMLElement;
    dataLink(owner: any, getblock: any, getblock_addUser: any): void;
    swapBack(): any;
    swap(editor_cls: any, storeSwapParent?: boolean): any;
    onFileLoad(isActive: any): void;
    defineKeyMap(): any;
    keymap: any;
    getID(): any;
    on_keydown(e: any): void;
    getScreen(): any;
}
export class App extends Screen {
    static newSTRUCT(): HTMLElement;
    useDataPathUndo: boolean;
    _last_wutime: number;
    _last_dpi: any;
    keymap: any;
    updateCanvasSize(): void;
    on_resize(oldsize: any, newsize: any): void;
    updateDPI(): void;
    updateWidgets(): void;
    positionMenu(): void;
}
export class ScreenBlock extends DataBlock {
    copy(): ScreenBlock;
}
export class MeshMaterialChooser extends Container {
    addButton: any;
    _last_mesh_key: any;
    _activeMatCache: any[];
    _activeMatCacheSize: number;
    getActive(mesh: any): any;
    saveData(): ({
        scrollTop: number;
        scrollLeft: number;
    } | {
        scrollTop?: undefined;
        scrollLeft?: undefined;
    }) & {
        _activeMatCache: any[];
    };
    loadData(data: any): this;
    setActive(mesh: any, mati: any): void;
    rebuild(): void;
}
export class MeshMaterialPanel extends Container {
    chooser: HTMLElement;
    subpanel: any;
    rebuild(): void;
    getShadingNode(): any;
    _lastnode_name: any;
}
export class DirectionChooser extends UIBase {
    static define(): {
        tagname: string;
    };
    _last_dpi: any;
    size: number;
    canvas: HTMLCanvasElement;
    mdown: boolean;
    modaldata: any;
    _highlight: boolean;
    last_th: number;
    start_th: number;
    flip: number[];
    last_mpos: Vector2;
    start_mpos: Vector2;
    value: Vector3;
    g: CanvasRenderingContext2D;
    set highlight(arg: boolean);
    get highlight(): boolean;
    set disabled(arg: any);
    get disabled(): any;
    _disabled: any;
    endModal(): void;
    first: boolean;
    start_value: Vector3;
    _getRMat(): Matrix4;
    setCSS(): void;
    render(): void;
    setValue(v: any): void;
    updateDataPath(): void;
    updateDPI(): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { StringProperty } from '../path.ux/scripts/pathux.js';
import { DataRefProperty } from '../core/lib_api.js';
import { Container } from '../path.ux/scripts/core/ui.js';
import { ImageBlock } from '../image/image.js';
import { Area } from '../path.ux/scripts/screen/ScreenArea.js';
import { Screen } from '../path.ux/scripts/screen/FrameManager.js';
import { DataBlock } from '../core/lib_api.js';
import { UIBase } from '../path.ux/scripts/core/ui_base.js';
import { Vector2 } from '../path.ux/scripts/pathux.js';
import { Vector3 } from '../path.ux/scripts/pathux.js';
import { Matrix4 } from '../path.ux/scripts/pathux.js';
export { VelPanFlags, VelPan } from "./velpan.js";
