export class ResourceIcon extends UIBase {
    static define(): {
        tagname: string;
        flag: number;
    };
    _last_cellsize: string;
    span: HTMLSpanElement;
    setCSS(): void;
    updateCellSize(): void;
}
export class ResourceBrowser extends Editor {
    static openResourceBrowser(area: any, resourceType: any, oncancel: any): Promise<any>;
    static define(): {
        tagname: string;
        areaname: string;
        uiname: string;
        flag: number;
    };
    resourceType: any;
    needsRebuild: boolean;
    icons: any[];
    swapCallback: any;
    swapCancelled: any;
    _swapEnd: any;
    cellsize: number;
    table: any;
    end(): void;
    makeResIcon(): HTMLElement;
    rebuild(): void;
    copy(): HTMLElement;
}
import { UIBase } from "../../path.ux/scripts/core/ui_base.js";
import { Editor } from '../editor_base.js';
