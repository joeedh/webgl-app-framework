export function startAddons(autoRegister: any): void;
export const AddonPath: string;
export class AddonRecord {
    constructor(url: any, addon: any, addonAPI: any);
    addon: any;
    addonAPI: any;
    url: any;
    _enabled: boolean;
    forceEnabled: boolean;
    key: any;
    name: any;
    nstructjsRegister(): void;
    set enabled(arg: boolean);
    get enabled(): boolean;
}
export class AddonManager {
    addons: any[];
    urlmap: Map<any, any>;
    unload(addon_or_url: any): boolean;
    _loadAddon(rec: any, reject: any): void;
    load(url: any, register?: boolean): Promise<any>;
    loadAddonList(register?: boolean): void;
    handleArgv(argv: any): void;
}
export default manager;
declare const manager: AddonManager;
