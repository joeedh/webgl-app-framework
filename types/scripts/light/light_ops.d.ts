export class AddLightOp extends ToolOp {
    static invoke(ctx: any, args: any): AddLightOp;
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        icon: number;
        inputs: {
            position: Vec3Socket;
            type: EnumProperty;
        };
    };
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { Vec3Socket } from '../core/graphsockets.js';
import { EnumProperty } from '../path.ux/scripts/pathux.js';
