export class MaterialEditor extends NodeEditor {
    static define(): {
        tagname: string;
        areaname: string;
        uiname: string;
        icon: number;
    };
    _last_update_key: any;
    dataBlockPath: string;
    activeMatMap: {};
    headerRow: any;
    updatePath(): void;
    buildHeader(): void;
    headerMesh(mesh: any, row1: any, row2: any): void;
    headerNonMesh(dblock: any, row1: any, row2: any): void;
    rebuild(): void;
}
export namespace MaterialEditor {
    let STRUCT: string;
}
import { NodeEditor } from "./NodeEditor.js";
