export class MeshToolBase extends ToolMode {
    static toolModeDefine(): {
        name: string;
        uianme: string;
        icon: number;
        flag: number;
        selectMode: number;
        description: string;
    };
    constructor(...args: any[]);
    transformConstraint: any;
    transparentMeshElements: boolean;
    drawOwnIds: boolean;
    meshPath: string;
    selectMask: number;
    drawSelectMask: number;
    start_mpos: Vector2;
    last_mpos: Vector2;
    vertexPointSize: number;
    defineKeyMap(): any;
    buildFakeContext(ctx: any): any;
    clearHighlight(ctx: any): void;
    getMeshPaths(): string[];
    on_mousedown(e: any, x: any, y: any, was_touch: any): boolean;
    getAABB(): undefined;
    getViewCenter(): undefined;
    checkMeshBVHs(ctx?: any): void;
    findHighlight(e: any, x: any, y: any, selectMask?: number): {
        elem: any;
        mesh: any;
    };
    on_mousemove(e: any, x: any, y: any, was_touch: any): boolean | {
        elem: any;
        mesh: any;
    };
    findnearest3d(view3d: any, x: any, y: any, selmask: any): any;
    drawsObjectIdsExclusively(obj: any, check_mesh?: boolean): boolean;
    drawIDs(view3d: any, gl: any, uniforms: any, selmask?: any): void;
    drawSphere(gl: any, view3d: any, p: any, scale?: number, color?: number[]): void;
    drawCursor: boolean;
}
export namespace MeshToolBase {
    let STRUCT: string;
}
import { ToolMode } from "../view3d_toolmode.js";
import { Vector2 } from "../../../util/vectormath.js";
