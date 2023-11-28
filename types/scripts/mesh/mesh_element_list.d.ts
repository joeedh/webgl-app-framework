import { Element, MeshIterStack } from "./mesh_types";
import { MeshTypes } from "./mesh_base";
import { CustomData, CustomDataElem, CustomDataLayer } from "./customdata";
import { StructReader } from "../path.ux/scripts/path-controller/types/util/nstructjs";
export declare class SelectedEditableIter<type extends Element> {
    ret: IteratorResult<type>;
    listiter: Iterator<type>;
    done: boolean;
    set: SelectionSet<type>;
    constructor(set: SelectionSet<type> | undefined);
    reset(set: SelectionSet<type>): this;
    [Symbol.iterator](): this;
    next(): IteratorResult<type, any>;
    finish(): void;
    return(): IteratorResult<type, any>;
}
export declare class SelectedEditableStack<type extends Element> {
    cur: number;
    set: SelectionSet<type>;
    stack: SelectedEditableIter<type>[];
    constructor(set: any);
    [Symbol.iterator](): SelectedEditableIter<type>;
    next(): SelectedEditableIter<type>;
}
export declare class SelectionSet<type extends Element> extends Set {
    eiterstack: SelectedEditableStack<type>;
    constructor();
    remove(item: type): boolean;
    get editable(): SelectedEditableStack<type>;
}
export declare class ElementListIter<type extends Element> {
    ret: IteratorResult<type>;
    i: number;
    elist: ElementList<type>;
    constructor(elist: ElementList<type>);
    init(elist: ElementList<type>): this;
    next(): IteratorResult<type>;
    return(): IteratorResult<type>;
}
export declare class ElementList<type extends Element> {
    static STRUCT: string;
    selected: SelectionSet<type>;
    list: (type | undefined)[];
    length: number;
    size: number;
    storeFreedElems: boolean;
    customData: CustomData;
    local_eidMap: Map<number, type>;
    type: MeshTypes;
    on_selected: (() => void) | undefined;
    highlight: type | undefined;
    active: type | undefined;
    iterstack: MeshIterStack<ElementListIter<type>>;
    private _update_req;
    private _totAdded;
    private _totRemoved;
    private freelist;
    private free_elems;
    private delayed_free_queue;
    private dqueue_idxmap;
    private idxmap;
    constructor(type: MeshTypes, storeFreedElems?: boolean);
    _getDebugTot(): {
        added: number;
        removed: number;
    };
    get cd(): CustomData;
    set cd(v: CustomData);
    [Symbol.iterator](): ElementListIter<type>;
    filter(f: (item: type) => boolean): type[];
    map<MapType>(f: (item: type) => MapType): MapType[];
    reduce<Initial>(f: (val: Initial, item: type, i: number, list: this) => Initial, initial: Initial): Initial;
    swap(a: type, b: type): this;
    reverse(): this;
    get editable(): Generator<type, void, unknown>;
    updateIndices(): void;
    setEID(e: type, neweid: number): this;
    _push(e: type): void;
    push(e: type): this;
    indexOf(e: type): number;
    _flagQueuedUpdate(): void;
    _remove(e: type, no_error?: boolean): void;
    forEach(cb: (item: type) => void, thisvar: any): void;
    compact(): this;
    remove(elem: type, no_error?: boolean): this;
    selectNone(): this;
    selectAll(): this;
    _fixcd(dest: type): void;
    customDataInterp(dest: type, sources: type[], ws: number[]): void;
    get first(): type;
    get last(): type;
    setSelect(e: type, state: boolean): this;
    setHighlight(e: type | undefined): this;
    setActive(e: type | undefined): this;
    _get_compact(): type[];
    loadSTRUCT(reader: StructReader<this>): void;
    removeCustomDataLayer(layer_i: number): void;
    clearCustomData(): void;
    prealloc(count: number): this;
    _runDelayedFreeQueue(): void;
    _checkFreeElems(): void;
    alloc(cls: new () => type): type;
    clearFreeElems(): this;
    addCustomDataLayer(cls_or_typestring: (new () => CustomDataElem<any>) & string, name: string): CustomDataLayer<any>;
    fixCustomData(): void;
    stripTempLayers(saveState?: boolean): any;
    unstripTempLayers(state: any): void;
}
