export let colorfilterfuncs: number[];
export class PaintOp extends PaintOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
    };
    edist_scale: () => number;
    edist_subd(e: any, v1: any, v2: any, eset: any, cd_curv: any): number;
    edist_coll(e: any, v1: any, v2: any, eset: any, cd_curv: any): any;
    _last_enable_mres: string;
    dynTopoRand: util.MersenneRandom;
    grabEidMap: Map<any, any>;
    grabDists: any[];
    last_p2: Vector3;
    last_p3: Vector3;
    last_p4: Vector3;
    last_p5: Vector3;
    last_origco2: Vector4;
    last_origco3: Vector4;
    last_origco4: Vector4;
    last_origco5: Vector4;
    _first2: number;
    smoother: any;
    task: any;
    ensureSmoother(mesh: any): void;
    initOrigData(mesh: any): any;
    calcUndoMem(ctx: any): number;
    _undo: {
        mesh: any;
        mode: any;
        vmap: Map<any, any>;
        gmap: Map<any, any>;
        mmap: Map<any, any>;
        cd_mask: number;
        gdata: any[];
        log: MeshLog;
        gset: Set<any>;
        fsetmap: Map<any, any>;
    };
    sampleViewRay(rendermat: any, _mpos: any, view: any, origin: any, pressure: any, invert: any, isInterp: any): Generator<any, void, unknown>;
    last_r: any;
    initGrabData(mesh: any, co: any, radius: any): void;
    execPost(): void;
    _ensureGrabEidMap(ctx: any): void;
    execDotWithMirror(ctx: any, ps: any, lastps: any): void;
    execDotWithMirror_task(ctx: any, ps: any, lastps: any): Generator<any, void, unknown>;
    exec(ctx: any): void;
    getOrigCo(mesh: any, v: any, cd_grid: any, cd_orig: any): any;
    calcNormalVariance(mesh: any, bvh: any, co: any, radius: any): {
        n: Vector3;
        t: Vector3;
    };
    sampleNormal(ctx: any, mesh: any, bvh: any, p: any, radius: any): Vector3;
    execDot(ctx: any, ps: any, lastps: any): void;
    execDot_task(ctx: any, ps: any, lastps: any): Generator<any, void, unknown>;
    _checkcurv(v: any, cd_curv: any, cd_cotan: any, force: boolean, cd_fset: any): void;
    hasCurveVerts(brush: any): number;
    doTopology(mesh: any, maxedges: any, bvh: any, esize: any, vs: any, es: any, radius: any, brush: any): Generator<any, void, unknown>;
    _last_time: number;
    edist_simple(e: any, v1: any, v2: any, eset: any, cd_curv: any): any;
    val(v: any): number;
    edist_curvmul(e: any, cd_curv: any): number;
    edist_old(e: any, v1: any, v2: any, mode?: number): any;
    calcESize2(totedge: any, radius: any): number;
    doTopologyCollapseTris2Quads(mesh: any, max: any, bvh: any, esize: any, vs: any, es: any, radius: any, brush: any, mark_only: any, cd_curv: any): void;
    doTopologyValence4(mesh: any, max: any, bvh: any, esize: any, vs: any, es: any, radius: any, brush: any, lctx: any): void;
    _calcEsizeScale(esize: any, factor: any): any;
    doTopologyCollapse(mesh: any, max: any, bvh: any, esize: any, vs: any, es: any, radius: any, brush: any, cd_curv: any): void;
    doQuadTopo(mesh: any, bvh: any, esize: any, vs: any, brushco: any, brushradius: any, brush: any): void;
    _runLogUndo(mesh: any, bvh: any): void;
    doTopologySubdivide(mesh: any, max: any, bvh: any, esize: any, vs: any, es: any, radius: any, brush: any, newes_out: any, dosmooth: any, cd_curv: any, es_out: any): Generator<never, void, unknown>;
    _checkOrig(ctx: any): void;
    modalEnd(was_cancelled: any, ...args: any[]): void;
}
import { PaintOpBase } from './pbvh_base.js';
import * as util from '../../../util/util.js';
import { Vector3 } from '../../../path.ux/scripts/pathux.js';
import { Vector4 } from '../../../path.ux/scripts/pathux.js';
import { MeshLog } from '../../../mesh/mesh_log.js';