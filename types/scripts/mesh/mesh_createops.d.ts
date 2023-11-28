export class MeshCreateOp extends MeshOp {
    static invoke(ctx: any, args: any): any;
    static tooldef(): {
        inputs: any;
        is_modal: boolean;
        outputs: any;
    };
    modalStart(ctx: any): void;
    calcUndoMem(ctx: any): any;
    /** create new mesh primitive in 'mesh', multiply vertices by matrix */
    internalCreate(ob: any, mesh: any, matrix: any): void;
    exec(ctx: any): void;
}
export class MakePlaneOp extends MeshCreateOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        is_modal: boolean;
        inputs: any;
        outputs: any;
    };
}
export class MakeCubeOp extends MeshCreateOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        is_modal: boolean;
        inputs: any;
        outputs: any;
    };
}
export class MakeSphere extends MeshCreateOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        is_modal: boolean;
        inputs: any;
        outputs: any;
    };
}
export class MakeCylinder extends MeshCreateOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        is_modal: boolean;
        inputs: any;
        outputs: any;
    };
}
export class MakeIcoSphere extends MeshCreateOp {
    static tooldef(): {
        toolpath: string;
        uiname: string;
        is_modal: boolean;
        inputs: any;
        outputs: any;
    };
}
export class CreateFaceOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    execIntern(ctx: any, mesh: any): void;
    exec(ctx: any): void;
}
export class CreateMeshGenOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            type: EnumProperty;
            setActive: BoolProperty;
        };
        outputs: {
            objectId: IntProperty;
        };
    };
    static canRun(ctx: any): any;
    exec(ctx: any): void;
    undoPre(ctx: any): void;
    _undo: {
        selectObjects: any[];
        activeObject: number;
        newObject: number;
    };
    undo(ctx: any): void;
}
export class ProceduralToMesh extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            objectId: any;
            triangulate: BoolProperty;
        };
    };
    exec(ctx: any): void;
}
export class ImportOBJOp extends MeshCreateOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
}
import { MeshOp } from "./mesh_ops_base.js";
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { EnumProperty } from '../path.ux/scripts/pathux.js';
import { BoolProperty } from '../path.ux/scripts/pathux.js';
import { IntProperty } from '../path.ux/scripts/pathux.js';
