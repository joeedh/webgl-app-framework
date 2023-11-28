export class SettingsEditor extends Editor {
    static define(): {
        uiname: string;
        areaname: string;
        tagname: string;
        icon: number;
    };
    body: any;
    rebuild(): void;
    tabs: any;
}
import { Editor } from "../editor_base.js";
