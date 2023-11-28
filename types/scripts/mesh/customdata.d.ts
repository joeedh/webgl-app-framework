import { DataAPI, DataStruct } from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';
import { StructReader } from "../path.ux/scripts/path-controller/types/util/nstructjs";
export type CDRef<type> = number;
export interface ICustomDataElemConstructor {
    new (): CustomDataElem<any>;
    define(): ICustomDataElemDef;
}
export declare const CDFlags: {
    SELECT: number;
    SINGLE_LAYER: number;
    TEMPORARY: number;
    IGNORE_FOR_INDEXBUF: number;
    DISABLED: number;
    NO_INTERP: number;
    NO_INTERP_COPY_ONLY: number;
};
export declare let CDElemMap: {};
export declare let CDElemTypes: any[];
export declare function cdLayerKey(typeName: any, name: any): string;
export interface ICustomDataElemDef {
    elemTypeMask: number;
    typeName: string;
    uiTypeName?: string;
    defaultName?: string;
    valueSize?: number;
    flag?: number;
    settingsClass?: any;
}
export interface ICustomDataElem {
    define(): ICustomDataElemDef;
}
export declare class CustomDataElem<ValueType> {
    static STRUCT: string;
    ['constructor']: ICustomDataElem;
    static define(): ICustomDataElemDef;
    static typeName: string;
    typeName: string;
    onRemoveLayer: (cls: new () => this, layer_i: number) => void;
    onNewLayer: (cls: new () => CustomDataElem<any>, i: number) => void;
    constructor();
    calcMemSize(): number;
    static apiDefine(api: DataAPI, dstruct: DataStruct): void;
    setValue(b: ValueType): void;
    getValue(): ValueType;
    load(b: this): this;
    clear(): this;
    hash(snapLimit?: number): number;
    copyTo(b: any): void;
    copy(): this;
    interp(dest: this, datas: this[], ws: number[]): void;
    mulScalar(f: number): this;
    add(b: this): this;
    addFac(b: this, fac: number): this;
    sub(b: this): this;
    validate(): boolean;
    static register(cls: any): void;
    loadSTRUCT(reader: StructReader<this>): void;
    static getTypeClass(typeName: any): new () => CustomDataElem<any>;
}
export declare function buildCDAPI(api: DataAPI): void;
export declare function buildElementAPI(api: any, dstruct: any): void;
export declare class LayerSettingsBase {
    static STRUCT: string;
    copyTo(b: any): void;
    static apiDefine(api: any): any;
    copy(): this;
    loadSTRUCT(reader: any): void;
}
declare class _Nothing extends LayerSettingsBase {
    static STRUCT: string;
}
export declare class CustomDataLayer<CDType> {
    static STRUCT: string;
    elemTypeMask: number;
    typeName: string;
    name: string;
    flag: number;
    id: number;
    typeSettings: any;
    islandSnapLimit: number;
    index: number;
    layerSet: LayerSet<CDType>;
    constructor(typename: any, name?: string | undefined, flag?: number, id?: number);
    getTypeSettings(): any;
    [Symbol.keystr](): string;
    __getNothing(): _Nothing;
    copy(): CustomDataLayer<CDType>;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class LayerSet<CDType> extends Array<CustomDataLayer<CDType>> {
    typeName: string;
    active: CustomDataLayer<CDType>;
    active_i: number;
    idmap: Map<number, CustomDataLayer<CDType>>;
    _layers: CustomDataLayer<CDType>[];
    static STRUCT: string;
    constructor(typeName: any);
    add(layer: CustomDataLayer<CDType>): void;
    push(...items: CustomDataLayer<CDType>[]): number;
    has(layer: any): boolean;
    remove(layer: CustomDataLayer<CDType>): this;
    copy(): LayerSet<CDType>;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class CustomData {
    flatlist: CustomDataLayer<any>[];
    idgen: util.IDGen;
    layers: Map<string, LayerSet<any>>;
    on_layeradd?: (layer: CustomDataLayer<any>, lset: LayerSet<any>) => void;
    on_layerremove?: (layer: CustomDataLayer<any>, lset: LayerSet<any>) => void;
    _layers: LayerSet<any>[];
    static STRUCT: string;
    constructor();
    _clear(): this;
    stripTempLayers(): this;
    copy(): CustomData;
    merge(cd: any): {};
    getLayerSettings(typecls_or_name: any): any;
    addLayer(cls: ICustomDataElemConstructor, name?: string | undefined): CustomDataLayer<unknown>;
    initElement(e: any): void;
    hasLayer(typename_or_cls: any): boolean;
    getLayerIndex(typename_or_cls: any): number;
    getActiveLayer<type = any>(typecls_or_name: any): CustomDataLayer<any>;
    setActiveLayer(layerIndex: any): void;
    remLayer(layer: any): void;
    _updateFlatList(): void;
    _getUniqueName(name: any): any;
    getLayerSet<ValueType>(typename: any, autoCreate?: boolean): LayerSet<ValueType>;
    hasNamedLayer(name: any, opt_cls_or_typeName?: any): boolean;
    getNamedLayerIndex(name: any, opt_cls_or_typeName: any): number;
    getNamedLayer(name: any, opt_cls_or_typeName: any): CustomDataLayer<any>;
    loadSTRUCT(reader: StructReader<this>): void;
    _getLayers(): any[];
}
export {};
