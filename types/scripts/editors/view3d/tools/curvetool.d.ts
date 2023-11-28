export class CurveToolOverlay {
    constructor(state: any, toolmode: any);
    _toolclass: any;
    _selectMask: any;
    _ob: any;
    copy(): CurveToolOverlay;
    get selectMask(): any;
    validate(): boolean;
    get selectedObjects(): any[];
    get selectedMeshObjects(): any[];
    get mesh(): any;
    get object(): any;
}
export class CurveToolBase extends MeshToolBase {
    static toolModeDefine(): {
        name: string;
        uianme: string;
        icon: number;
        flag: number;
        description: string;
    };
    static getContextOverlayClass(): typeof CurveToolOverlay;
    static isCurveTool(instance: any): any;
    constructor(manager: any);
    _isCurveTool: boolean;
    sceneObject: any;
    _meshPath: string;
    drawflag: MeshDrawFlags;
    curve: any;
    _getObject(): void;
    drawSphere(gl: any, view3d: any, p: any, scale?: number): void;
    dataLink(scene: any, getblock: any, getblock_addUser: any, ...args: any[]): void;
}
export namespace CurveToolBase {
    let STRUCT: string;
}
import { MeshToolBase } from "./meshtool.js";
import { MeshDrawFlags } from "../../../mesh/mesh.js";
