export class TetMeshTool extends ToolMode {
    static buildEditMenu(): string[];
    static toolModeDefine(): {
        name: string;
        uiname: string;
        icon: number;
        flag: number;
        description: string;
        selectMode: number;
        transWidgets: any[];
    };
    constructor();
}
export namespace TetMeshTool {
    let STRUCT: string;
}
import { ToolMode } from '../view3d_toolmode.js';
