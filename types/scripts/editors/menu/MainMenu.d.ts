export class ToolHistoryConsole extends ColumnFrame {
    _buf: any;
    tooltable: any;
    rebuild(): void;
}
export class MenuBarEditor extends Editor {
    static define(): {
        tagname: string;
        areaname: string;
        uiname: string;
        icon: number;
        flag: number;
    };
    needElectronRebuild: boolean;
    menuSize: number;
    _switcher_key: string;
    _ignore_tab_change: boolean;
    _last_toolmode: any;
    borderLock: number;
    buildEditMenu(): void;
    _strip: any;
    console: HTMLElement;
    _menubar: any;
    _editMenuDef: any[];
    onFileLoad(): void;
    rebuildScreenSwitcher(): void;
    _on_tab_change(tab: any): void;
    _makeSwitcherHash(): string;
    makeScreenSwitcher(container: any): void;
    tabs: any;
    copy(): HTMLElement;
}
import { ColumnFrame } from '../../path.ux/scripts/core/ui.js';
import { Editor } from '../editor_base.js';
