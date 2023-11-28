export namespace EnvLightFlags {
    let USE_AO: number;
}
export class EnvLight {
    color: Vector3;
    power: number;
    ao_dist: number;
    ao_fac: number;
    flag: number;
    sunDir: Vector3;
    sunPower: number;
    sunRadius: number;
    sunColor: Vector3;
    sunLight: any;
    _digest: util.HashDigest;
    calcUpdateHash(): number;
}
export namespace EnvLight {
    let STRUCT: string;
}
export namespace SceneFlags {
    let SELECT: number;
}
export class ObjectSet extends util.set {
    list: any;
    get renderable(): Generator<any, void, unknown>;
    get editable(): Generator<any, void, unknown>;
}
export class ObjectList extends Array<any> {
    constructor(list: any, scene: any);
    scene: any;
    selected: ObjectSet;
    onselect: any;
    active: any;
    highlight: any;
    has(ob: any): boolean;
    clearSelection(): void;
    remove(ob: any): void;
    push(ob: any): number;
    get editable(): Generator<any, void, unknown>;
    get visible(): Generator<any, void, unknown>;
    get renderable(): Generator<any, void, unknown>;
    setSelect(ob: any, state: any): void;
    setHighlight(ob: any): void;
    setActive(ob: any): void;
    dataLink(scene: any, getblock: any, getblock_addUser: any): void;
    collection: any;
    _getDataRefs(): DataRef[];
    loadSTRUCT(reader: any): void;
}
export namespace ObjectList {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export namespace SceneRecalcFlags {
    let OBJECTS: number;
}
export class Scene extends DataBlock {
    static nodedef(): {
        name: string;
        uiname: string;
        flag: number;
        outputs: {
            onSelect: DependSocket;
            onToolModeChange: DependSocket;
            onTimeChange: FloatSocket;
        };
    };
    constructor(objects: any);
    collection: any;
    sbvh: SceneBVH;
    propRadius: number;
    propMode: number;
    propEnabled: boolean;
    propIslandOnly: boolean;
    widgets: WidgetManager;
    cursor3D: Matrix4;
    selectMask: number;
    toolmodes: any[];
    toolmode_map: {};
    toolmode_namemap: {};
    envlight: EnvLight;
    recalc: number;
    set objects(arg: any);
    get objects(): any;
    flag: number;
    _loading: boolean;
    time: number;
    fps: number;
    timeStart: number;
    timeEnd: number;
    toolModeProp: import("../path.ux/scripts/pathux.js").EnumProperty;
    toolmode_i: any;
    get toolmode(): any;
    _objects: any;
    regenObjectList(): void;
    get lights(): Generator<any, void, unknown>;
    getCollection(ctx: any, name: any): any;
    getInternalObject(ctx: any, key: any, dataclass_or_instance: any): any;
    updateObjectList(): void;
    add(ob: any): void;
    switchToolMode(mode: any, _file_loading?: boolean): any;
    remove(ob: any): void;
    destroyIntern(): void;
    _onselect(obj: any, state: any): void;
    changeTime(newtime: any): void;
    dataLink(getblock: any, getblock_addUser: any, ...args: any[]): void;
    _linked: boolean;
    updateWidgets(): void;
    updateWidgets_intern(): void;
    ctx: any;
}
import { Vector3 } from '../util/vectormath.js';
import * as util from '../util/util.js';
import { DataRef } from '../core/lib_api.js';
import { DataBlock } from '../core/lib_api.js';
import { SceneBVH } from '../sceneobject/scenebvh.js';
import { WidgetManager } from "../editors/view3d/widgets/widgets.js";
import { Matrix4 } from '../util/vectormath.js';
import { DependSocket } from '../core/graphsockets.js';
import { FloatSocket } from '../core/graphsockets.js';
