export class MeshFlagOpBase extends MeshOp {
    constructor(...args: any[]);
    getElemLists(mesh: any): any[];
}
export class ToggleFlagOp extends MeshFlagOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class SetFlagOp extends MeshFlagOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class ClearFlagOp extends MeshFlagOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        inputs: any;
    };
    exec(ctx: any): void;
}
import { MeshOp } from "./mesh_ops_base.js";
