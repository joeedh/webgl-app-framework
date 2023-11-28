export class UVProjectOp extends UVOpBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
    };
    exec(ctx: any): void;
}
export class UVSetFlagBase extends UVOpBase {
    static canRun(ctx: any): any;
    execPre(ctx: any): void;
    undoPre(ctx: any): void;
    _undo: {
        list: any[];
        cd_uv: any;
        mesh: any;
    } | {
        list: any[];
        cd_uv: any;
        mesh: any;
    };
    undo(ctx: any): void;
    getLoops(ctx: any, selFacesOnly?: boolean, SelLoopsOnly?: boolean): any[] | Generator<any, void, unknown>;
    execPost(ctx: any): void;
}
export class UVSetFlagOp extends UVSetFlagBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class UVClearFlagOp extends UVSetFlagBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class UVToggleFlagOp extends UVSetFlagBase {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
import { UVOpBase } from '../../mesh/mesh_uvops_base.js';
