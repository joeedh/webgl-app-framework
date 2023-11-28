export class MeshOpBaseUV extends MeshOp {
    static invoke(ctx: any, args: any): any;
    getFaces(ctx: any): any;
    getLoops(ctx: any, selOnly?: boolean): any[] | Set<any>;
}
export class UnwrapOpBase extends MeshOpBaseUV {
    execPre(ctx: any): void;
}
export class UVOpBase extends View3DOp {
    static tooldef(): {
        inputs: any;
    };
    static invoke(ctx: any, args: any): any;
    getLoops(ctx: any, selOnly?: boolean): any[] | Set<any>;
}
import { MeshOp } from './mesh_ops_base.js';
import { View3DOp } from '../editors/view3d/view3d_ops.js';
