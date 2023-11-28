export function genDefaultFile(appstate: any, dont_load_startup?: number): void;
export function preinit(): void;
export function init(): void;
export class FileLoadError extends Error {
}
export { genDefaultScreen } from "../editors/screengen.js";
export namespace BlockTypes {
    let SCREEN: string;
    let DATABLOCK: string;
    let SETTINGS: string;
    let LIBRARY: string;
    let TOOLSTACK: string;
}
export class FileBlock {
    constructor(type: any, data: any);
    type: any;
    data: any;
}
export class FileData {
    blocks: any[];
    save_screen: any;
    load_screen: any;
}
export class AppState {
    arguments: any[];
    saveHandle: any;
    settings: AppSettings;
    ctx: ViewContext;
    toolstack: AppToolStack;
    api: import("../path.ux/scripts/pathux.js").DataAPI;
    screen: any;
    datalib: Library;
    ignoreEvents: boolean;
    modalFlag: number;
    three_scene: any;
    three_renderer: any;
    playing: boolean;
    unswapScreen(): void;
    swapScreen(screen: any): void;
    setScreen(screen: any, trigger_destroy?: boolean): void;
    stopEvents(): this;
    startEvents(): this;
    start(loadDefaultFile?: boolean): void;
    filename: string;
    createFile(args?: {
        save_screen: boolean;
        save_settings: boolean;
        save_library: boolean;
    }): ArrayBufferLike;
    testUndoFileIO(): void;
    testFileIO(): void;
    loadUndoFile(buf: any): void;
    switchScreen(sblock: any): void;
    _execEditorOnFileLoad(): void;
    loadFileAsync(buf: any, args: any): Promise<any>;
    loadFile(buf: any, args: any, ...args: any[]): void;
    loadFile_intern(buf: any, args: any): void;
    testFileCompression(): void;
    loadFile_start(buf: any, args?: {
        reset_toolstack: boolean;
        load_screen: boolean;
        load_settings: boolean;
    }): {
        file: any;
        lastscreens_active: any;
        lastscreens: any[];
        istruct: any;
        flag: any;
        version: any;
        args: {
            reset_toolstack: boolean;
            load_screen: boolean;
            load_settings: boolean;
        };
        buf: any;
        datablocks: any[];
        found_screen: boolean;
        datalib: any;
        screen: any;
    };
    loadFile_readBlock(filectx: any): any;
    loadFile_readBlocks(filectx: any): void;
    loadFile_initDatalib(filectx: any): void;
    loadFile_loadScreen(filectx: any): void;
    loadFile_finish(filectx: any): void;
    clearStartupFile(): void;
    saveStartupFile(): void;
    /** this is executed before block re-linking has happened*/
    do_versions(version: any, datalib: any): void;
    mergeDefaultBrushes(datalib?: Library): void;
    /** this is executed after block re-linking has happened*/
    do_versions_post(version: any, datalib: any): void;
    createSettingsFile(): ArrayBufferLike;
    saveSettings(): void;
    loadSettings(): void;
    loadSettings_intern(): void;
    createUndoFile(): ArrayBufferLike;
    destroy(): void;
    draw(): void;
}
import { AppSettings } from './settings.js';
import { ViewContext } from './context.js';
import { AppToolStack } from "./toolstack.js";
import { Library } from '../core/lib_api.js';
export { BasicFileOp, RootFileOp } from "./app_ops.js";
