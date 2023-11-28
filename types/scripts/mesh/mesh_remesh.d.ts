export function cleanupTris(mesh: any, faces: any, lctx: any): void;
export function cleanupQuads2(mesh: any, faces: any, lctx: any): boolean;
export function cleanupQuads(mesh: any, faces: any, lctx: any, maxVerts?: number): void;
export function cleanupQuadsOld(mesh: any, faces: any, lctx: any): boolean;
export function remeshMesh(mesh: any, remesher: any, lctx: any, goalType: any, goalValue: any, maxSteps?: number, rakeFactor?: number, threshold?: number, relax?: number, projection?: number, flag?: number, maxEdges?: any, rakeMode?: number): void;
export const Remeshers: {};
export const RemeshClasses: any[];
export const RemeshMap: {};
export namespace RakeModes {
    let CURVATURE: number;
    let PARAM_VERT: number;
}
export namespace RemeshParams {
    let EDIST_P1: number;
    let EDIST_P2: number;
    let EDIST_P3: number;
    let SUBD_FAC: number;
    let COLL_FAC: number;
    let RAKE_FACTOR: number;
    let SMOOTH_FACTOR: number;
    let PROJ_FACTOR: number;
    let CSMOOTH_FAC: number;
    let CSMOOTH_REPEAT: number;
    let ORIG_FACTOR: number;
    let TOTPARAM: number;
}
export class Remesher {
    static remeshDefine(): {
        type: number;
    };
    static register(cls: any): void;
    constructor(mesh: any, lctx: any, goalType: any, goalValue: any);
    params: Float64Array;
    reproject: boolean;
    projMesh: any;
    excludedParams: Set<number>;
    mesh: any;
    lctx: any;
    done: boolean;
    cd_orig: number;
    optData: any;
    goalType: any;
    goalValue: any;
    set origFactor(arg: number);
    get origFactor(): number;
    set relax(arg: number);
    get relax(): number;
    set projection(arg: number);
    get projection(): number;
    getOrigData(mesh: any): any;
    initOrigData(mesh: any): any;
    start(): void;
    step(): void;
    finish(): void;
}
export namespace RemeshGoals {
    let FACE_COUNT: number;
    let EDGE_LENGTH: number;
    let EDGE_AVERAGE: number;
}
export namespace RemeshFlags {
    let SUBDIVIDE: number;
    let COLLAPSE: number;
    let CLEANUP: number;
}
export class UniformTriRemesher extends Remesher {
    static remeshDefine(): {
        typeName: string;
    };
    totshells: number;
    flag: number;
    liveEdges: WeakSet<object>;
    set subdFac(arg: number);
    get subdFac(): number;
    set collFac(arg: number);
    get collFac(): number;
    i: number;
    elen: number;
    cd_density: number;
    cd_temps: any[];
    tempKey: string;
    timer: number;
    istep: number;
    minEdges: number;
    set smoothCurveRepeat(arg: number);
    get smoothCurveRepeat(): number;
    set smoothCurveFac(arg: number);
    get smoothCurveFac(): number;
    set rakeFactor(arg: number);
    get rakeFactor(): number;
    calcQuadEdges(mesh: any): number;
    calcEdgeLen(): number;
    _calcEdgeTh(e: any): number;
    initEdgeAngles(): void;
    countShells(): void;
    start(max?: number): void;
    max: number;
    project(): void;
    propRakeDirections(): void;
    solveRakeDirections(): void;
    updateRakeDirVis(): void;
    rake(fac?: number): void;
    updateDiagFlags(): void;
    step(vErrFunc?: any): void;
    lastt: number;
    updateDensities(): void;
    collapse(es: any, elen: any, max: any): Set<any>;
    subdivide(es: any, elen: any, max: any): Set<any>;
    run(es: any, elen: any, max: any, sign: any, op: any, postop: any): Set<any>;
    triangulate(): void;
    endOptTimer(): void;
    optimizeParams(ctx: any): void;
    optStep(flag?: number): void;
    _saveParams(): void;
    cleanupWires(): void;
    cleanup(): void;
}
export class UniformQuadRemesher extends UniformTriRemesher {
    constructor(...args: any[]);
    triQuadFlag: any;
    start(...args: any[]): void;
    step(): void;
}
export let DefaultRemeshFlags: number;
