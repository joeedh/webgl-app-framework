export class DataPathBrowser extends Editor {
    static define(): {
        tagname: string;
        areaname: string;
        uiname: string;
    };
    needsRebuild: boolean;
    rebuild(): void;
    defineKeyMap(): void;
    loadSTRUCT(reader: any): void;
}
export namespace DataPathBrowser {
    let STRUCT: string;
}
import { Editor } from '../editor_base.js';
