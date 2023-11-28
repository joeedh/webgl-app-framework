export class StrandSelectSet extends Set<any> {
    constructor();
    remove(s: any): void;
    get editable(): Generator<any, void, unknown>;
}
export class StrandList extends Array<any> {
    constructor();
    selected: StrandSelectSet;
    idxmap: Map<any, any>;
    _list: any;
    active: any;
    highlight: any;
    push(item: any): void;
    setSelect(item: any, state: any): void;
    remove(item: any): this;
    loadSTRUCT(reader: any): void;
}
export namespace StrandList {
    let STRUCT: string;
}
export class StrandSet extends SceneObjectData {
    static dataDefine(): {
        name: string;
        selectMask: number;
    };
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        flag: number;
    };
    idgen: number;
    idmap: Map<any, any>;
    strands: StrandList;
    target: any;
    copyTo(b: any): void;
    setSelect(s: any, state: any): void;
}
export namespace StrandSet {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
import { SceneObjectData } from '../sceneobject/sceneobject_base.js';
