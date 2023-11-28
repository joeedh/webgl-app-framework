export function buildGridsSubSurf(mesh: any, setColor: any): void;
export class PatchBuilder {
    constructor(mesh: any, cd_grid: any);
    mesh: any;
    quads: Map<any, any>;
    cd_grid: any;
    patches: Map<any, any>;
    flens: Map<any, any>;
    cd_dyn_vert: any;
    cd_fset: any;
    buildQuad(l: any, margin?: number): any[];
    getQuad(l: any): any;
    buildPatch(l: any): void;
    build(): void;
}
