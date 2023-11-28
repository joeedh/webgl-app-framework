export function makeToolModeEnum(): EnumProperty;
export class ToolMode extends Node {
    static toolModeDefine(): {
        name: string;
        uiname: string;
        icon: number;
        flag: number;
        description: string;
        selectMode: any;
        stdtools: any;
        transWidgets: any[];
    };
    static nodedef(): {
        name: string;
        uiname: string;
        inputs: {};
        outputs: {};
    };
    static buildEditMenu(): any[];
    static buildElementSettings(container: any): void;
    static buildSettings(container: any): void;
    static buildHeader(header: any, addHeaderRow: any): void;
    static getContextOverlayClass(): any;
    static busDefine(): {
        events: string[];
    };
    static unregister(cls: any): void;
    static register(cls: any): void;
    static getTransformProp(): EnumProperty;
    static defineAPI(api: any): any;
    constructor(ctx: any);
    ctx: any;
    drawlines: any[];
    drawtexts: any[];
    widgets: any[];
    _uniqueWidgets: {};
    transWidget: any;
    selectMask: any;
    _transProp: any;
    storedSelectMask: number;
    keymap: any;
    drawsObjectIdsExclusively(ob: any): boolean;
    setManager(widget_manager: any): void;
    manager: any;
    /** easy line drawing (in 3d)*/
    makeTempLine(v1: any, v2: any, color: any): any;
    makeTempText(co: any, string: any, color: any): any;
    resetTempGeom(ctx?: any): void;
    get typeName(): any;
    getKeyMaps(): any[];
    defineKeyMap(): void;
    getViewCenter(): any;
    dataLink(scene: any, getblock: any, getblock_addUser: any): void;
    hasWidgetWithKey(key: any): boolean;
    getWidgetWithKey(key: any): any;
    /**
     * Spawn a unique widget
     * @param widgetclass : widget class
     */
    ensureUniqueWidget(widgetclass: any): any;
    addWidget(widget: any): void;
    removeWidget(widget: any): void;
    hasUniqueWidget(cls: any): boolean;
    getUniqueWidget(cls: any): any;
    removeUniqueWidget(widget: any): void;
    getWidgetHighlight(): any;
    hasWidgetHighlight(): boolean;
    update(): void;
    onActive(): void;
    clearWidgets(gl: any): void;
    onInactive(): void;
    graphDisconnect(): void;
    destroy(gl: any): void;
    onContextLost(e: any): any;
    on_mousedown(e: any, x: any, y: any, was_touch: any): void;
    on_mousemove(e: any, x: any, y: any, was_touch: any): void;
    on_mouseup(e: any, x: any, y: any, was_touch: any): void;
    on_drawstart(view3d: any, gl: any): void;
    draw(view3d: any, gl: any): void;
    on_drawend(view3d: any, gl: any): void;
    drawsObjectIds(obj: any): boolean;
    /**
     * draw any extra ids the toolmode needs
     * */
    drawIDs(view3d: any, gl: any, uniforms: any): void;
    drawObject(gl: any, uniforms: any, program: any, object: any, mesh: any): boolean;
    loadSTRUCT(reader: any): void;
}
export namespace ToolMode {
    let STRUCT: string;
    let dataPath: string;
}
export class MeshCache {
    constructor(meshid: any);
    meshid: any;
    meshes: {};
    drawer: any;
    gen: any;
    getMesh(name: any): any;
    makeMesh(name: any, layers: any): any;
    makeChunkedMesh(name: any, layers: any): any;
    destroy(gl: any): void;
}
export let ToolModes: any[];
import { EnumProperty } from "../../path.ux/scripts/pathux.js";
import { Node } from '../../core/graph.js';
