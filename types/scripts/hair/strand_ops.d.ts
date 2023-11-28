export class MakeStrandSetOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            target: DataRefProperty;
            setActive: BoolProperty;
        };
        outputs: {
            newObject: DataRefProperty;
        };
    };
    static invoke(ctx: any, args: any): any;
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { DataRefProperty } from '../core/lib_api.js';
import { BoolProperty } from '../path.ux/scripts/pathux.js';
