export class MakeTetMesh extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            maxDepth: any;
            leafLimit: any;
        };
        outputs: {};
    };
    static canRun(ctx: any): boolean;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {
        mesh: {
            dview: DataView;
            drawflag: any;
        };
        ob: any;
    };
    undo(ctx: any): void;
    exec(ctx: any): void;
}
export class TetSmoothVerts extends TetDeformOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            factor: FloatProperty;
        };
        outputs: {};
    };
    exec(ctx: any): void;
}
export class TetToMesh extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {};
        outputs: {};
    };
    static canRun(ctx: any): boolean;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {
        mesh: {
            dview: DataView;
        };
        ob: any;
    };
    undo(ctx: any): void;
    exec(ctx: any): void;
}
export class Tetrahedralize extends TetMeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class TetTest extends TetDeformOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class TetFixNormalsOp extends TetMeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
    };
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { TetDeformOp } from './tet_ops_base.js';
import { FloatProperty } from '../path.ux/scripts/pathux.js';
import { TetMeshOp } from './tet_ops_base.js';
