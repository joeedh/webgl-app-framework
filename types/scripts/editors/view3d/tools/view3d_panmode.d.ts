export class PanToolMode extends ToolMode {
    static toolModeDefine(): {
        name: string;
        uiname: string;
        icon: number;
        flag: number;
        description: string;
        selectMode: number;
        transWidgets: any[];
    };
    view3d: any;
    destroy(): void;
}
export namespace PanToolMode {
    let STRUCT: string;
}
import { ToolMode } from "../view3d_toolmode.js";
