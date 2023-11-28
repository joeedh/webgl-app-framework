export namespace ResourceFlags {
    let SELECT: number;
    let LOCKED: number;
    let HIDE: number;
}
/**

 */
export class ResourceType extends EventBase {
    static handlesURL(url: any): boolean;
    static createFromURL(url: any): void;
    static resourceDefine(): {
        name: string;
        uiName: string;
        flag: number;
        icon: number;
    };
    constructor(url: any);
    url: any;
    flag: any;
    name: any;
    users: number;
    addUser(): void;
    remUser(): void;
    unload(): void;
    clone(): void;
    load(): void;
    isReady(): void;
    getThumbnail(): void;
}
export class ResourceManager {
    _cls_idgen: number;
    lists: {};
    classes: any[];
    url_res_map: {};
    makeEnum(): EnumProperty;
    classFromURL(url: any): any;
    getList(cls: any): any;
    has(resource_or_url: any): boolean;
    add(resource: any): void;
    get(url: any, resclass: any, autoload?: boolean): any;
    register(cls: any): void;
}
export const resourceManager: ResourceManager;
import { EventBase } from '../core/eventbase.js';
import { EnumProperty } from "../path.ux/scripts/pathux.js";
