export class SubsurfMesh extends MeshDrawInterface {
    constructor(mesh: any);
    mesh_ref: any;
    smesh: any;
    ototvert: any;
    ototedge: any;
    ototface: any;
    origverts: {};
    origfaces: {};
    origedges: {};
    patches: import("./subsurf_base.js").PatchList;
    partialGen: any;
    gen: any;
    draw(ctx: any, view3d: any, gl: any, object: any, uniforms: any, program: any): void;
    needsRecalc(mesh: any): boolean;
    syncVerts(mesh: any): void;
    generate(mesh: any, gl: any): void;
    update(ctx: any, view3d: any, gl: any, object: any): void;
}
export class SubsurfDrawer extends MeshDrawInterface {
    constructor();
    cache: {};
    get(object: any): any;
    updateGen: any;
}
import { MeshDrawInterface } from "../editors/view3d/view3d_draw.js";
