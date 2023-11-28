export function relaxUVs(mesh: any, cd_uv: any, loops?: any, doPack?: boolean, boundaryWeight?: number, buildFromSeams?: boolean): void;
export function fixSeams(mesh: any, cd_uv: any): void;
export class UnWrapSolver {
    static restoreOrRebuild(mesh: any, faces: any, solver: any, cd_uv: any, preserveIslands?: boolean, selLoopsOnly?: boolean): any;
    constructor(mesh: any, faces: any, cd_uv?: number, preserveIslands?: boolean, selLoopsOnly?: boolean);
    preserveIslands: boolean;
    selLoopsOnly: boolean;
    mesh: any;
    faces: Set<any>;
    cd_uv: number;
    uvw: UVWrangler;
    solvers: any[];
    tris: any[];
    start(cd_uv?: any): void;
    packIslands(): void;
    buildSolver(includeArea?: boolean): void;
    tottri: number;
    solveIntern(slv: any, count: any, gk: any): any;
    solve(count: any, gk: any): number;
    step(countUnused: any, gk: any): void;
    save(): this;
    saved: boolean;
    restore(mesh: any): boolean;
    finish(): void;
}
import { UVWrangler } from './unwrapping.js';
