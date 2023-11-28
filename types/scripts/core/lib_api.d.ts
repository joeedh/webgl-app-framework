export let BlockTypes: any[];
export namespace BlockFlags {
    let SELECT: number;
    let HIDE: number;
    let FAKE_USER: number;
    let NO_SAVE: number;
}
export class DataBlock extends Node {
    /**
     returns type info for a datablock
  
     @returns {{typeName: string, defaultName: string, uiName: string, flag: number, icon: number}}
     @example
     static blockDefine() { return {
        typeName    : "typename",
        defaultName : "unnamed",
        uiName      : "uiname",
        flag        : 0,
        icon        : -1 //some icon constant in icon_enum.js.Icons
      }}
     */
    static blockDefine(): {
        typeName: string;
        defaultName: string;
        uiName: string;
        flag: number;
        icon: number;
    };
    /**call this to register a subclass*/
    static register(cls: any): void;
    static unregister(cls: any): void;
    static getClass(typeName: any): any;
    constructor();
    swapDataBlockContents(obj: any): this;
    graphDisplayName(): any;
    lib_userData: {};
    lib_id: number;
    name: any;
    lib_flag: any;
    lib_icon: any;
    lib_type: any;
    lib_users: number;
    lib_external_ref: any;
    lib_userlist: any[];
    destroy(): void;
    copyTo(b: any, copyContents?: boolean): void;
    /**
     * @param getblock: gets a block
     * @param getblock_addUser:  gets a block but increments reference count
     *
     * note that the reference counts of all blocks are re-built at file load time,
     * so make sure to choose between these two functions correctly.
     */
    dataLink(getblock: any, getblock_addUser: any): void;
    _validate_userlist(): void;
    lib_getUsers(): any[];
    /**increment reference count.
     * if user is not undefined and is a datablock,
     * it will be added to this.lib_userlist
     * */
    lib_addUser(user: any): void;
    /**decrement reference count*/
    lib_remUser(user: any): void;
    loadSTRUCT(reader: any): void;
    [Symbol.keystr](): number;
}
export class DataRef {
    static STRUCT: string;
    static fromBlock(block: any): DataRef;
    constructor(lib_id?: number, lib_type?: any);
    lib_type: any;
    lib_id: number;
    name: any;
    lib_external_ref: any;
    copy(): DataRef;
    set(block: any): this;
    loadSTRUCT(reader: any): void;
}
export class BlockSet extends Array<any> {
    static STRUCT: string;
    constructor(type: any, datalib: any);
    datalib: any;
    type: any;
    __active: any;
    idmap: {};
    namemap: {};
    clear(): this;
    create(name?: any): any;
    uniqueName(name?: any): any;
    set active(arg: any);
    get active(): any;
    setActive(val: any): void;
    add(block: any, _inside_file_load?: boolean, force_unique_name?: boolean): boolean;
    rename(block: any, name: any): any;
    push(block: any): boolean;
    /**
     *
     * @param name_or_id : can be a string with block name, integer with block id, or DataRef instance
     * @returns boolean
     */
    has(name_or_id: any): boolean;
    /**
     *
     * @param name_or_id : can be a string with block name, integer with block id, or DataRef instance
     * @returns DataBlock
     */
    get(name_or_id: any): any;
    remove(block: any): void;
    destroy(): void;
    dataLink(getblock: any, getblock_addUser: any): this;
    loadSTRUCT(reader: any): void;
    afterLoad(datalib: any, type: any): void;
}
export class Library {
    static STRUCT: string;
    graph: Graph;
    libs: BlockSet[];
    libmap: {};
    idgen: util.IDGen;
    block_idmap: {};
    block_namemap: {};
    getBlockListEnum(blockClass: any, filterfunc: any): EnumProperty;
    setActive(block: any): void;
    get allBlocks(): Generator<any, void, unknown>;
    get(id_or_dataref_or_name: any): any;
    has(id_or_dataref_or_block_or_name: any): any;
    add(block: any, force_unique_name?: boolean): any;
    remove(block: any): any;
    destroy(): void;
    getLibrary(typeName: any): any;
    afterSTRUCT(): void;
    loadSTRUCT(reader: any): void;
}
export class DataRefProperty extends ToolProperty<any> {
    static STRUCT: string;
    constructor(type: any, apiname: any, uiname: any, description: any, flag: any, icon: any);
    blockType: any;
    data: DataRef;
    calcMemSize(): any;
    setValue(val: any, ...args: any[]): this;
    getValue(): DataRef;
    copyTo(b: any): void;
    copy(): DataRefProperty;
    loadSTRUCT(reader: any): void;
}
export class DataRefListProperty extends ToolProperty<any> {
    constructor(typeName: any, apiname: any, uiname: any, description: any, flag: any, icon: any);
    blockType: any;
    data: any[];
    calcMemSize(): any;
    setValue(val: any): this;
    getValue(): any[];
    copyTo(b: any): void;
    copy(): DataRefListProperty;
}
export class DataRefList extends Array<any> {
    static STRUCT: string;
    constructor(iterable: any, blockTypeName?: string);
    idmap: {};
    lib_type: string;
    active: DataRef;
    highlight: DataRef;
    push(item: any): this;
    getActive(ctx: any): any;
    getHighlight(ctx: any): any;
    setActive(ctx: any, val: any): this;
    setHighlight(ctx: any, val: any): this;
    blocks(ctx: any): Generator<any, void, unknown>;
    remove(item: any): this;
    has(item: any): boolean;
    loadSTRUCT(reader: any): void;
}
import { Node } from './graph.js';
import { Graph } from './graph.js';
import * as util from '../util/util.js';
import { EnumProperty } from '../path.ux/scripts/pathux.js';
import { ToolProperty } from '../path.ux/scripts/pathux.js';
