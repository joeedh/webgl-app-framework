export class ElementAttr {
    constructor(typecls: any, name: any, elemType: any, index: any, category?: string, defval?: any);
    data: any[];
    name: any;
    defaultValue: any;
    typeClass: any;
    index: any;
    elemType: any;
    category: string;
    flag: number;
    typeName: any;
    dataCount: any;
    id: number;
    resize(newsize: any): this;
    setDefault(ei: any): this;
    loadSTRUCT(reader: any): void;
}
export namespace ElementAttr {
    let STRUCT: string;
}
export class BitMap {
    constructor(size?: number);
    size: number;
    map: Uint16Array;
    clear(): this;
    resize(size: any): this;
    test(bit: any): number;
    set(bit: any, state: any): void;
}
export class ElementIter {
    constructor(list: any);
    done: boolean;
    list: any;
    i: number;
    ret: {
        done: boolean;
        value: any;
    };
    reset(list: any): this;
    next(): {
        done: boolean;
        value: any;
    };
    finish(): {
        done: boolean;
        value: any;
    };
    return(): {
        done: boolean;
        value: any;
    };
}
export class ElementList {
    constructor(type: any, smesh: any);
    smesh: any;
    attrs: any[];
    a: any[];
    freelist: any[];
    freemap: BitMap;
    length: number;
    _size: number;
    type: any;
    attrIdGen: number;
    selected: Set<any>;
    active: number;
    highlight: number;
    iterstack: any[];
    setSelect(ei: any, state: any): void;
    copyElemData(dst: any, src: any): void;
    resize(newsize: any, setFreelist?: boolean): void;
    addAttr(attrcls: any, name: any, defval: any, flag: any): any;
    alloc(): any;
    _alloc(): any;
    free(ei: any): void;
    getAttr(attrcls: any, name: any, defaultval: any, flag: any): any;
    bind(): void;
    eid: any;
    flag: any;
    index: any;
    loadSTRUCT(reader: any): void;
    [Symbol.iterator](): any;
}
export namespace ElementList {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class VertexList extends ElementList {
    constructor(smesh: any);
    co: any;
    no: any;
    e: any;
    valence: any;
    neighbors(vi: any): Generator<any, void, unknown>;
    edges(vi: any): Generator<any, void, unknown>;
}
export namespace VertexList {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class EdgeList extends ElementList {
    constructor(smesh: any);
    otherVertex(ei: any, vi: any): any;
    v1: any;
    v2: any;
    v1_next: any;
    v1_prev: any;
    v2_next: any;
    v2_prev: any;
    l: any;
}
export namespace EdgeList {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export class LoopElemList extends ElementList {
    constructor(smesh: any);
    v: any;
    e: any;
    f: any;
    radial_next: any;
    radial_prev: any;
    next: any;
    prev: any;
}
export namespace LoopElemList {
    let STRUCT_4: string;
    export { STRUCT_4 as STRUCT };
}
export class FaceLoopIter {
    ret: {
        done: boolean;
        value: any;
    };
    done: boolean;
    fi: number;
    li: number;
    faces: any;
    loops: any;
    _i: number;
    reset(faces: any, fi: any): this;
    next(): {
        done: boolean;
        value: any;
    };
    finish(): {
        done: boolean;
        value: any;
    };
    return(): {
        done: boolean;
        value: any;
    };
    [Symbol.iterator](): this;
}
export class FaceList extends ElementList {
    constructor(smesh: any);
    l: any;
    no: any;
    cent: any;
    loops(fi: any): any;
    _loops(fi: any): Generator<any, void, unknown>;
    recalcNormal(fi: any): void;
}
export namespace FaceList {
    let STRUCT_5: string;
    export { STRUCT_5 as STRUCT };
}
export const ElementLists: {
    [x: number]: typeof VertexList | typeof EdgeList | typeof LoopElemList | typeof FaceList;
};
