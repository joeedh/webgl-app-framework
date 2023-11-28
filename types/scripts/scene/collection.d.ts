export namespace CollectFlags {
    let SELECT: number;
    let INTERNAL: number;
}
export class Collection extends DataBlock {
    static nodedef(): {
        name: string;
        uiname: string;
        outputs: {
            onObjectAdd: IntSocket;
            onObjectRem: IntSocket;
            onChildAdd: IntSocket;
            onChildRem: IntSocket;
        };
    };
    constructor(name?: string);
    name: string;
    parent: any;
    children: any[];
    objects: any[];
    memo: string;
    flag: number;
    object_idmap: {};
    child_idmap: {};
    get flatChildren(): Generator<any, void, unknown>;
    add(ob_or_collection: any): boolean;
    getChild(name: any): any;
    remove(ob_or_collection: any): boolean;
    dataLink(getblock: any, getblock_us: any): void;
    has(ob_or_collection: any): boolean;
}
import { DataBlock } from "../core/lib_api.js";
import { IntSocket } from "../core/graphsockets.js";
