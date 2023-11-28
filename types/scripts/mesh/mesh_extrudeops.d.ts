export function extrudeIndivFaces(mesh: any, faces: any, lctx: any): void;
export class ExtrudeOneVertexOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        description: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class ExtrudeRegionsOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
        outputs: {
            normal: Vec3Property;
            normalSpace: any;
        };
    };
    static invoke(ctx: any, args: any): any;
    _exec_intern(ctx: any, mesh: any): void;
    exec(ctx: any): void;
}
export class ExtrudeFaceIndivOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    static invoke(ctx: any, args: any): any;
    exec(ctx: any): void;
}
export class InsetHoleOp extends MeshOp {
    static tooldef(): {
        uiname: string;
        icon: number;
        toolpath: string;
        undoflag: number;
        flag: number;
        inputs: any;
        outputs: {
            normal: Vec3Property;
            normalSpace: any;
        };
    };
    static invoke(ctx: any, args: any): any;
    _exec_intern(ctx: any, mesh: any): void;
    exec(ctx: any): void;
}
import { MeshOp } from './mesh_ops_base.js';
import { Vec3Property } from '../path.ux/pathux.js';
