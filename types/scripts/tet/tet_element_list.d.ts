export class TetSelectSet extends Set<any> {
    constructor();
    get editable(): Generator<any, void, unknown>;
    loadSTRUCT(reader: any): void;
}
export class TetElementIter {
    list: any;
    ret: {
        done: boolean;
        value: any;
    };
    done: boolean;
    i: number;
    active: any;
    highlight: any;
    reset(list: any): this;
    finish(): {
        done: boolean;
        value: any;
    };
    next(): {
        done: boolean;
        value: any;
    };
    return(): {
        done: boolean;
        value: any;
    };
    [Symbol.iterator](): this;
}
export class TetElementList {
    constructor(type: any);
    type: any;
    list: any[];
    freelist: any[];
    selected: TetSelectSet;
    customData: CustomData;
    length: number;
    local_eidmap: {};
    idxmap: {};
    push(elem: any): this;
    selectAll(): this;
    selectNone(): this;
    setSelect(elem: any, state: any): this;
    initElem(elem: any): void;
    addCustomDataLayer(typecls_or_typename: any, name: any): import("../mesh/customdata.js").CustomDataLayer<unknown>;
    remCustomDataLayer(cd_idx: any): void;
    customDataInterp(target: any, elems: any, ws: any): this;
    remove(elem: any): this;
    active: any;
    highlight: any;
    compact(): this;
    _save(): any[];
    loadSTRUCT(reader: any): void;
    [Symbol.iterator](): any;
}
export namespace TetElementList {
    let STRUCT: string;
}
import { CustomData } from '../mesh/customdata.js';
