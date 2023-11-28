export function silence(): void;
export function unsilence(): void;
export function strong(...args: any[]): string;
export function stronglog(...args: any[]): void;
export function log(...args: any[]): void;
export function indent(n: any, chr?: string, color?: any): string;
export function termColor(s: any, c: any): string;
export function termPrint(...args: any[]): string;
export function getClassParent(cls: any): any;
export function getAllKeys(obj: any): Set<any>;
export function btoa(buf: any): string;
export function atob(buf: any): Uint8Array;
export function time_ms(): number;
export function color2css(c: any): string;
export function print_stack(err: any): void;
export function random(): number;
export function seed(n: any): void;
export function strhash(str: any): number;
export let termColorMap: {};
export class MovingAvg extends Array<any> {
    constructor(size?: number);
    cur: number;
    used: number;
    sum: number;
    add(val: any): number;
    sample(): number;
}
export class cachering extends Array<any> {
    static fromConstructor(cls: any, size: any, isprivate?: boolean): cachering;
    constructor(func: any, size: any, isprivate?: boolean);
    private: boolean;
    cur: number;
    next(): any;
}
export class SetIter {
    constructor(set: any);
    set: any;
    i: number;
    ret: {
        done: boolean;
        value: any;
    };
    next(): {
        done: boolean;
        value: any;
    };
    [Symbol.iterator](): this;
}
/**
 Set

 Stores objects in a set; each object is converted to a value via
 a [Symbol.keystr] method, and if that value already exists in the set
 then the object is not added.


 * */
export class set {
    constructor(input: any);
    items: any[];
    keys: {};
    freelist: any[];
    length: number;
    equals(setb: any): boolean;
    clear(): this;
    filter(f: any, thisvar: any): set;
    map(f: any, thisvar: any): set;
    reduce(f: any, initial: any): any;
    copy(): set;
    add(item: any): void;
    get size(): number;
    delete(item: any, ignore_existence?: boolean): void;
    remove(item: any, ignore_existence: any): void;
    has(item: any): boolean;
    forEach(func: any, thisvar: any): void;
    [Symbol.iterator](): SetIter;
}
export class HashIter {
    constructor(hash: any);
    hash: any;
    i: number;
    ret: {
        done: boolean;
        value: any;
    };
    next(): {
        done: boolean;
        value: any;
    };
}
export class MersenneRandom {
    constructor(seed: any);
    index: number;
    mt: Uint32Array;
    random(): number;
    seed(seed: any): void;
    extract_number(): number;
    twist(): void;
}
/** NOT CRYPTOGRAPHIC */
export class HashDigest {
    static cachedDigest(): any;
    i: number;
    hash: number;
    reset(): this;
    get(): number;
    add(v: any): void;
}
export class MapIter {
    constructor(ownermap: any);
    ret: {
        done: boolean;
        value: any;
    };
    value: any[];
    i: number;
    map: any;
    done: boolean;
    finish(): void;
    next(): {
        done: boolean;
        value: any;
    };
    return(): {
        done: boolean;
        value: any;
    };
    reset(): this;
}
export class map {
    _items: {};
    _list: any[];
    size: number;
    iterstack: any[];
    itercur: number;
    freelist: any[];
    has(key: any): boolean;
    set(key: any, v: any): void;
    keys(): Generator<any, void, unknown>;
    values(): Generator<any, void, unknown>;
    get(k: any): any;
    delete(k: any): boolean;
    [Symbol.iterator](): any;
}
export class IDMap extends Array<any> {
    constructor();
    _keys: Set<any>;
    size: number;
    has(id: any): boolean;
    set(id: any, val: any): boolean;
    get(id: any): any;
    delete(id: any): boolean;
    keys(): Generator<any, void, unknown>;
    values(): Generator<any, void, unknown>;
}
