export class ImageOp extends ToolOp {
    static tooldef(): {
        inputs: {
            dataPath: StringProperty;
        };
    };
    getImage(ctx: any): any;
}
export class LoadImageOp extends ImageOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: any;
        outputs: any;
        is_modal: boolean;
    };
    modalStart(ctx: any): void;
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { StringProperty } from '../path.ux/scripts/pathux.js';
