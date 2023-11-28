export function findnearestUV(localX: any, localY: any, uvEditor: any, limit?: number, type?: number, cd_uv?: any, snapLimit?: number, selectedFacesOnly?: boolean): any[];
export namespace NearestUVTypes {
    let VERTEX: number;
    let EDGE: number;
    let FACE: number;
}
export class NearestUVRet {
    type: number;
    dist: number;
    uv: Vector2;
    l: any;
    z: number;
}
/**
 expects a datapath attribute references a Mesh
 and a selfpath attribute for building a path to itself
 **/
export class UVEditor extends UIBase {
    static defineAPI(api: any): any;
    static newSTRUCT(): any;
    static define(): {
        tagname: string;
        style: string;
    };
    matrix: Matrix4;
    imatrix: Matrix4;
    smesh2: SimpleMesh;
    smesh: SimpleMesh;
    glPos: Vector2;
    glSize: Vector2;
    mpos: Vector2;
    start_mpos: Vector2;
    selectedFacesOnly: boolean;
    snapLimit: number;
    canvas: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    size: Vector2;
    velpan: VelPan;
    imageUser: ImageUser;
    _redraw_req: number;
    _last_update_key: string;
    drawlines: any[];
    resetDrawLines(): void;
    addDrawLine(v1: any, v2: any, color?: string): DrawLine;
    findnearest(localX: any, localY: any, limit: any): any[];
    onVelPanChange(): void;
    getScale(): number;
    on_mousewheel(e: any): void;
    on_mousedown(e: any): void;
    mdown: boolean;
    doSelect(e: any): void;
    updateHighlight(localX: any, localY: any): void;
    on_mousemove(e: any): void;
    on_mouseup(e: any): void;
    getLocalMouse(x: any, y: any): any;
    project(p: any): any;
    unproject(p: any): any;
    getMesh(): any;
    hasMesh(): boolean;
    flagRedraw(): void;
    updateMatrix(): void;
    drawDrawLines(gl: any, uniforms: any, program: any): void;
    viewportDraw(gl: any): void;
    gl: any;
    genMeshes(gl?: any): void;
    redraw(): void;
    updateSize(): void;
    updateMesh(): void;
    loadSTRUCT(reader: any): void;
    dataLink(owner: any, getblock: any, getblock_addUser: any): void;
}
export namespace UVEditor {
    let STRUCT: string;
}
export class DrawLine {
    constructor(v1: any, v2: any, color?: string);
    v1: Vector3;
    v2: Vector3;
    color: string;
}
export class ImageBlockOp extends ToolOp {
    static tooldef(): {
        inputs: {
            image: DataRefProperty;
            type: EnumProperty;
        };
    };
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
}
export class SetImageTypeOp extends ImageBlockOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class ImageEditor extends Editor {
    static define(): {
        areaname: string;
        tagname: string;
        uiname: string;
        apiname: string;
        flag: number;
        icon: number;
        has3D: boolean;
    };
    glPos: Vector2;
    glSize: Vector2;
    uvEditor: HTMLElement;
    sidebar: HTMLElement;
    subframe: any;
    rebuildLayout(): void;
    updateSideBar: boolean;
    flagSidebarRegen(): void;
    makeImageTypeMenu(con: any, path: any): void;
    regenSidebar(): void;
    buildEditMenu(): string[];
    defineKeyMap(): void;
    viewportDraw(gl: any): void;
    loadSTRUCT(reader: any): void;
}
export namespace ImageEditor {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
import { Vector2 } from '../../util/vectormath.js';
import { UIBase } from '../../path.ux/scripts/pathux.js';
import { Matrix4 } from '../../util/vectormath.js';
import { SimpleMesh } from '../../core/simplemesh.js';
import { VelPan } from '../editor_base.js';
import { ImageUser } from '../../image/image.js';
import { Vector3 } from '../../util/vectormath.js';
import { ToolOp } from '../../path.ux/scripts/pathux.js';
import { DataRefProperty } from '../../core/lib_api.js';
import { EnumProperty } from '../../path.ux/scripts/pathux.js';
import { Editor } from '../editor_base.js';
