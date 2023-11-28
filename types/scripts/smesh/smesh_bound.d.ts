export class BoundElem {
    constructor(smesh: any, index: any, bmesh: any);
    smesh: any;
    i: any;
    bmesh: any;
    list: any;
    set eid(arg: any);
    get eid(): any;
    set flag(arg: any);
    get flag(): any;
}
export class BoundVertex extends BoundVector3 {
    constructor(smesh: any, vi: any, bmesh: any);
    vi: any;
    i: any;
    type: number;
    no: any;
    customData: any[];
    smesh: any;
    list: any;
    bmesh: any;
    blist: any;
    set eid(arg: any);
    get eid(): any;
    set flag(arg: any);
    get flag(): any;
    get edges(): Generator<any, void, unknown>;
    get neighbors(): void;
    get valence(): any;
}
export class BoundEdge extends BoundElem {
    type: number;
    get v1(): any;
    get v2(): any;
}
export class BoundElementSet extends Set<any> {
    constructor(values?: readonly any[]);
    constructor(iterable?: Iterable<any>);
    remove(elem: any): boolean;
}
export class BoundElementList {
    constructor(type: any);
    list: any[];
    length: number;
    idxMap: Map<any, any>;
    type: any;
    freelist: any[];
    boundMap: any[];
    selected: BoundElementSet;
    push(elem: any): void;
    setSelect(elem: any, state: any): void;
    remove(elem: any): void;
    [Symbol.iterator](): Generator<any, void, unknown>;
}
export class BoundMesh {
    elists: {};
    _update_key: string;
    smesh: any;
    calcUpdateKey(smesh: any): string;
    update(smesh: any): this;
    bind(smesh: any): void;
    getElist(type: any): any;
    initElists(): void;
    verts: any;
    edges: any;
    loops: any;
    faces: any;
}
import { BoundVector3 } from './smesh_attributes.js';
