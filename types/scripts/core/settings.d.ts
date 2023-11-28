export class SavedScreen {
    static create(name?: string): SavedScreen;
    constructor(name: any, data: any);
    name: any;
    data: any;
    loadSTRUCT(reader: any): void;
}
export namespace SavedScreen {
    let STRUCT: string;
}
export class AddonSettings {
    constructor(name: any);
    name: any;
    enabled: boolean;
    settings: {};
    loadSTRUCT(reader: any): void;
    toJSON(): {
        name: any;
        enabled: boolean;
        settings: {};
    };
    loadJSON(json: any): this;
}
export namespace AddonSettings {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class AppSettings {
    static defineAPI(api: any): any;
    screens: any[];
    addonSettings: {};
    limitUndoMem: boolean;
    undoMemLimit: number;
    brushSet: number;
    toJSON(): {
        screens: any[];
        limitUndoMem: boolean;
        undoMemLimit: number;
        brushSet: number;
        addonSettings: {};
    };
    loadJSON(json: any): void;
    save(): void;
    _loadAddons(): void;
    load(): void;
    syncAddonList(): boolean;
    destroy(): void;
    loadSTRUCT(reader: any): void;
}
export namespace AppSettings {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
