export class NodeSelectOpBase extends NodeGraphOp {
    static tooldef(): {
        inputs: any;
    };
    static canRun(ctx: any): boolean;
}
export class NodeSelectOneOp extends NodeSelectOpBase {
    static tooldef(): {
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
export class NodeToggleSelectAll extends NodeSelectOpBase {
    static tooldef(): {
        toolpath: string;
        inputs: any;
    };
    exec(ctx: any): void;
}
import { NodeGraphOp } from './node_ops.js';
