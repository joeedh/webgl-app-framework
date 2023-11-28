export function vertexSmooth_tst(mesh: any, verts?: any, fac?: number): void;
export function ccVertexSmooth(mesh: any, verts?: any, fac?: number): void;
export function resetUnwrapSolvers(): void;
export class DeleteOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class DeleteOnlyFacesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class FlipLongTrisOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class TriToQuadsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class SymmetrizeOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class BisectOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class TriangulateOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export namespace RemeshOpModes {
    let REMESH: number;
    let GEN_CROSSFIELD: number;
    let OPT_CROSSFIELD: number;
}
export class RemeshOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    makeRemesher(ctx: any, mesh: any, lctx: any): any;
    exec(ctx: any): void;
}
export class InteractiveRemeshOp extends RemeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
        is_modal: boolean;
    };
    redo(ctx: any): void;
    _redo: {};
    makeLogCtx(ctx: any, mesh: any): LogContext;
    on_mousedown(e: any): void;
    on_mouseup(e: any): void;
    remesher: any;
    lctx: LogContext;
    modalStart(ctx: any): void;
    last_time: number;
    on_tick(): void;
    _step(ctx: any, remesher: any, mesh: any, lctx: any): void;
}
export class LoopSubdOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class CatmullClarkeSubd extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export namespace SymFlags {
    let X: number;
    let Y: number;
    let Z: number;
    let AUTO: number;
}
export class MeshSnapToMirror extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class MeshSubdTest extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class SubdivideSimple extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class SplitEdgesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export namespace SmoothTypes {
    let CC: number;
    let COTAN: number;
    let UNIFORM: number;
}
export class SmoothCurvaturesOp extends MeshDeformOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class MarkSingularitiesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class UnmarkSingularitiesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class RelaxRakeUVCells extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class VertexSmooth extends MeshDeformOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class TestSplitFaceOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class TestCollapseOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class EnsureGridsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class VoxelUnwrapOp extends UnwrapOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class RandomizeUVsOp extends MeshOpBaseUV {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class UnwrapSolveOp extends UnwrapOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class RelaxUVsOp extends MeshOpBaseUV {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class FixUvSeamsOp extends MeshOpBaseUV {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class ResetUVs extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class GridUVs extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class PackIslandsOp extends MeshOpBaseUV {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class SubdivideGridsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class SmoothGridsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class GridsTestOp2 extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class GridsTestOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class DeleteGridsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class ResetGridsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class ApplyGridBaseOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class AddCDLayerOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class RemCDLayerOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class TestMultiGridSmoothOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class FixNormalsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class FixManifoldOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class ConnectVertsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class DissolveVertOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class CleanupQuads extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class CleanupTris extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class DissolveEdgesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export namespace RotateEdgeModes {
    let FORWARD: number;
    let BACKWARD: number;
}
export class RotateEdgeOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class CollapseEdgesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class RandomCollapseOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class DissolveEdgeLoopsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class FlipNormalsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class QuadSmoothOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class TestSmoothOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class DissolveFacesOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class OptRemeshParams extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        undoflag: any;
        inputs: {
            edgeGoal: FloatProperty;
        };
        outputs: {};
        is_modal: boolean;
    };
    remesher: UniformTriRemesher;
    on_mouseup(e: any): void;
    modalEnd(wasCancelled: any): void;
    modalStart(ctx: any): void;
}
export class SolverOpBase extends MeshOp {
    static tooldef(): {
        inputs: any;
        is_modal: boolean;
        outputs: any;
    };
    solver: Solver;
    on_keydown(e: any): void;
    getSolver(mesh: any): Solver;
    execStep(mesh: any, solver: any): void;
    on_tick(): void;
    modalStart(ctx: any): void;
    exec(ctx: any): void;
    on_mouseup(e: any): void;
}
export class TestSolverOp extends SolverOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        is_modal: boolean;
        outputs: any;
    };
    solver: any;
}
export class DuplicateMeshOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    static invoke(ctx: any, args: any): any;
    exec(ctx: any): void;
}
import { MeshOp } from './mesh_ops_base.js';
import { LogContext } from './mesh_base.js';
import { MeshDeformOp } from './mesh_ops_base.js';
import { UnwrapOpBase } from './mesh_uvops_base.js';
import { MeshOpBaseUV } from './mesh_uvops_base.js';
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { UniformTriRemesher } from './mesh_remesh.js';
import { FloatProperty } from '../path.ux/scripts/pathux.js';
import { Solver } from './mesh_solver.js';
