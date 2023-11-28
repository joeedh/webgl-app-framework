export class MeshEditor extends MeshToolBase {
    static toolModeDefine(): {
        name: string;
        uianme: string;
        icon: number;
        flag: number;
        description: string;
        transWidgets: (typeof ScaleWidget | typeof RotateWidget | typeof InflateWidget)[];
    };
    static buildEditMenu(): string[];
    static haveHandles(): void;
    constructor(manager: any);
    loopMesh: SimpleMesh;
    normalMesh: SimpleMesh;
    selectMask: MeshTypes;
    drawNormals: boolean;
    drawSelectMask: MeshTypes;
    drawLoops: boolean;
    drawCurvatures: boolean;
    _last_update_loop_key: string;
    _last_normals_key: string;
    _last_update_curvature: string;
    _getObject(): void;
    sceneObject: any;
    mesh: any;
    updateCurvatureMesh(gl: any): void;
    curvatureMesh: SimpleMesh;
    updateLoopMesh(gl: any): void;
    updateNormalsMesh(gl: any): void;
    dataLink(scene: any, getblock: any, getblock_addUser: any, ...args: any[]): void;
}
export namespace MeshEditor {
    let STRUCT: string;
}
import { MeshToolBase } from "./meshtool.js";
import { SimpleMesh } from '../../../core/simplemesh.js';
import { MeshTypes } from '../../../mesh/mesh_base.js';
import { ScaleWidget } from '../widgets/widget_tools.js';
import { RotateWidget } from '../widgets/widget_tools.js';
import { InflateWidget } from '../widgets/widget_tools.js';
