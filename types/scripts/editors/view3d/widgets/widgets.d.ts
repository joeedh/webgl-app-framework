export namespace WidgetFlags {
    let SELECT: number;
    let HIGHLIGHT: number;
    let CAN_SELECT: number;
    let IGNORE_EVENTS: number;
    let ALL_EVENTS: number;
}
export class WidgetShape {
    constructor(view3d: any);
    _drawtemp: Vector3;
    _debug_id: number;
    extraMouseMargin: number;
    destroyed: boolean;
    flag: number;
    owner: any;
    wireframe: boolean;
    worldscale: boolean;
    wscale: number;
    color: Vector4;
    hcolor: Vector4;
    matrix: Matrix4;
    colortemp: Vector4;
    drawmatrix: Matrix4;
    _tempmat: Matrix4;
    _tempmat2: Matrix4;
    mesh: SimpleMesh;
    onclick: () => void;
    onContextLost(e: any): void;
    destroy(gl: any): void;
    gl: any;
    distToMouse(view3d: any, x: any, y: any): void;
    copy(): any;
    copyTo(b: any): any;
    setUniforms(manager: any, uniforms: any): void;
    draw(gl: any, manager: any, matrix: any, alpha?: number, no_z_write?: boolean): void;
}
export class WidgetTorus extends WidgetShape {
    constructor();
    tco: Vector3;
    shapeid: string;
    draw(gl: any, manager: any, matrix: any): void;
    distToMouse(view3d: any, x: any, y: any, matrix: any, wscale: any): any[] | 10000;
}
export class WidgetArrow extends WidgetShape {
    constructor();
    shapeid: string;
    draw(gl: any, manager: any, matrix: any): void;
    distToMouse(view3d: any, x: any, y: any, matrix: any, wscale: any): any[];
}
export class WidgetBlockArrow extends WidgetArrow {
}
export class WidgetSphere extends WidgetShape {
    shapeid: string;
    draw(gl: any, manager: any, matrix: any): void;
    distToMouse(view3d: any, x: any, y: any): any;
}
export class WidgetPlane extends WidgetShape {
    shapeid: string;
    draw(gl: any, manager: any, matrix: any): void;
    distToMouse(view3d: any, x: any, y: any, matrix: any, wscale: any): any;
}
export class WidgetChevron extends WidgetPlane {
    constructor();
}
export class WidgetDoubleChevron extends WidgetPlane {
    constructor();
}
export class WidgetBase extends Node {
    static ctxValid(ctx: any): number;
    static _weightDisZ(view3d: any, dis: any, z: any): any;
    static nodedef(): {
        name: string;
        uiname: string;
        inputs: {
            depend: DependSocket;
        };
        outputs: {
            depend: DependSocket;
        };
        flag: number;
    };
    static widgetDefine(): {
        name: string;
        uiname: string;
        icon: number;
        flag: number;
        description: string;
        selectMode: any;
    };
    constructor();
    ctx: any;
    flag: any;
    id: number;
    wscale: number;
    children: any[];
    destroyed: boolean;
    shape: any;
    manager: any;
    matrix: Matrix4;
    _tempmatrix: Matrix4;
    /** generate a string key that describes this widget, but isn't necassarily unique.
     *  this is used to keep track of whether widgets have already been created or not */
    genKey(): string;
    setMatrix(mat: any): this;
    getWscale(): number;
    get isDead(): boolean;
    onRemove(): void;
    onContextLost(e: any): void;
    destroy(gl: any): void;
    /**note that it's valid for containers
     * to return themselves, *if* they have
     * a shape and aren't purely containers
     * @param x view3d-local coordinate x
     * @param y view3d-local coordinate y
     */
    findNearest(view3d: any, x: any, y: any, limit?: number, matrix?: any): {
        data: any;
        dis: any;
        z: any;
        margin: any;
    };
    add(child: any): any;
    update(manager: any): void;
    remove(): void;
    on_mousedown(e: any, localX: any, localY: any, was_touch: any): boolean;
    on_mousemove(e: any, localX: any, localY: any): boolean;
    findNearestWidget(view3d: any, localX: any, localY: any): any;
    on_mouseup(e: any, localX: any, localY: any, was_touch: any): boolean;
    on_keydown(e: any, localX: any, localY: any): boolean;
    draw(gl: any, manager: any, matrix?: any): void;
    _newbase(matrix: any, color: any, shape: any): WidgetBase;
    getTorus(matrix: any, color: any): any;
    getArrow(matrix: any, color: any): any;
    getSphere(matrix: any, color: any): any;
    getChevron(matrix: any, color: any): any;
    getDoubleChevron(matrix: any, color: any): any;
    getPlane(matrix: any, color: any): any;
    getBlockArrow(matrix: any, color: any): any;
    setManager(manager: any): void;
    /**
     * executes a (usually modal) tool, adding (and removing)
     * draw callbacks to execute this.update() as appropriate
     * */
    execTool(ctx: any, tool: any): void;
}
export class WidgetManager {
    constructor(ctx: any);
    _init: boolean;
    widgets: any[];
    widget_idmap: {};
    shapes: {};
    idgen: util.IDGen;
    ctx: any;
    gl: any;
    widget_keymap: {};
    nodes: {};
    ready: boolean;
    haveCallbackNode(id: any, name: any): boolean;
    hasWidget(cls: any): any;
    glInit(gl: any): void;
    onContextLost(e: any): void;
    clearNodes(): void;
    removeCallbackNode(n: any): void;
    createCallbackNode(id: any, name: any, callback: any, inputs: any, outputs: any): any;
    loadShapes(): void;
    _picklimit(was_touch: any): 35 | 8;
    _fireAllEventWidgets(e: any, key: any, localX: any, localY: any, was_touch: any): number;
    on_keydown(e: any, localX: any, localY: any): boolean;
    /**see view3d.getSubEditorMpos for how localX/localY are derived*/
    on_mousedown(e: any, localX: any, localY: any, was_touch: any): boolean;
    findNearest(x: any, y: any, limit?: number): any;
    updateHighlight(e: any, localX: any, localY: any, was_touch: any): boolean;
    on_mousemove(e: any, localX: any, localY: any, was_touch: any): boolean;
    on_mouseup(e: any, localX: any, localY: any, was_touch: any): any;
    add(widget: any): WidgetBase;
    hasWidgetWithKey(key: any): boolean;
    getWidgetWithKey(key: any): any;
    remove(widget: any): void;
    highlight: any;
    active: any;
    clear(): void;
    destroy(gl: any): void;
    draw(view3d: any, gl: any): void;
    _newbase(matrix: any, color: any, shape: any): WidgetBase;
    arrow(matrix: any, color: any): WidgetBase;
    chevron(matrix: any, color: any): WidgetBase;
    plane(matrix: any, color: any): WidgetBase;
    sphere(matrix: any, color: any): WidgetBase;
    blockarrow(matrix: any, color: any): WidgetBase;
    updateGraph(): void;
    update(view3d: any): void;
}
import { Vector3 } from '../../../util/vectormath.js';
import { Vector4 } from '../../../util/vectormath.js';
import { Matrix4 } from '../../../util/vectormath.js';
import { SimpleMesh } from '../../../core/simplemesh.js';
import { Node } from "../../../core/graph.js";
import { DependSocket } from '../../../core/graphsockets.js';
import * as util from '../../../util/util.js';
