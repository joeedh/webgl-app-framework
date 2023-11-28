export namespace LogTypes {
    let VERTEX: number;
    let EDGE: number;
    let FACE: number;
    let GEOM_MASK: number;
    let ADD: number;
    let REMOVE: number;
}
export namespace VertLayout {
    let FLAG: number;
    let INDEX: number;
    let X: number;
    let Y: number;
    let Z: number;
    let NX: number;
    let NY: number;
    let NZ: number;
}
export namespace LoopLayout {
    let FLAG_1: number;
    export { FLAG_1 as FLAG };
    let INDEX_1: number;
    export { INDEX_1 as INDEX };
    export let V: number;
    export let E: number;
    export let F: number;
}
export namespace EdgeLayout {
    let FLAG_2: number;
    export { FLAG_2 as FLAG };
    let INDEX_2: number;
    export { INDEX_2 as INDEX };
    export let V1: number;
    export let V2: number;
}
export class CustomDataList extends Array<any> {
    constructor(list: any);
    list: any;
    loadSTRUCT(reader: any): void;
}
export namespace CustomDataList {
    let STRUCT: string;
}
export class MeshLog {
    log: any[];
    logstarts: any[];
    startEid: number;
    eidMap: Map<any, any>;
    _newEntry(elem: any, subtype: any, tag: any): number;
    logVertex(v: any, subtype?: number, tag?: number): number;
    logEdge(e: any, subtype?: number, tag?: number): number;
    logLoop(l: any, subtype?: number, tag?: number): number;
    calcMemSize(): number;
    _logAdd(li: any, eid?: any, tag?: number): void;
    logFace(f: any, subtype?: number, tag?: number): number;
    cancelEntry(li: any): void;
    ensure(elem: any, tag: any): number;
    logElem(elem: any, tag: any): number;
    start(mesh: any): void;
    reset(): this;
    checkStart(mesh: any): boolean;
    logKillVertex(v: any, tag: any): number;
    logKill(elem: any, tag: any): number;
    logAdd(elem: any, tag: any): number;
    logKillEdge(e: any, tag: any): number;
    logKillFace(f: any, tag: any): number;
    logAddVertex(v: any, tag: any): number;
    logAddEdge(e: any, tag: any): number;
    logAddFace(f: any, tag: any): number;
    printLog(start?: number): any[];
    undo(mesh: any, onnew: any, ondel: any): void;
}
