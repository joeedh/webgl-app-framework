export class SolidWireOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            size: any;
            maxDepth: IntProperty;
            minDepth: IntProperty;
            project: BoolProperty;
        };
    };
    static canRun(ctx: any): any;
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { IntProperty } from '../path.ux/scripts/pathux.js';
import { BoolProperty } from '../path.ux/scripts/pathux.js';
