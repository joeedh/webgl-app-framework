export class Matrix4Socket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any, default_value: any);
    value: Matrix4;
    addToUpdateHash(digest: any): void;
    copy(): Matrix4Socket;
    copyTo(b: any): void;
    cmpValue(b: any): number;
    copyValue(): Matrix4;
    diffValue(b: any): number;
    getValue(): Matrix4;
}
export namespace Matrix4Socket {
    let STRUCT: string;
}
export class DependSocket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any);
    value: boolean;
    addToUpdateHash(digest: any): void;
    diffValue(b: any): number;
    copyValue(): boolean;
    getValue(): boolean;
    cmpValue(b: any): boolean;
}
export namespace DependSocket {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class IntSocket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any);
    value: number;
    diffValue(b: any): number;
    copyValue(): number;
    getValue(): number;
    cmpValue(b: any): boolean;
    addToUpdateHash(digest: any): void;
}
export namespace IntSocket {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class Vec2Socket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any, default_value: any);
    value: Vector2;
    addToUpdateHash(digest: any): void;
    copyTo(b: any): void;
    diffValue(b: any): number;
    copyValue(): Vector2;
    getValue(): Vector2;
    cmpValue(b: any): number;
}
export namespace Vec2Socket {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export class VecSocket extends NodeSocketType {
    buildUI(container: any): void;
}
export class Vec3Socket extends VecSocket {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any, default_value: any);
    value: Vector3;
    addToUpdateHash(digest: any): void;
    copyTo(b: any): void;
    diffValue(b: any): number;
    copyValue(): Vector3;
    getValue(): Vector3;
    cmpValue(b: any): number;
}
export namespace Vec3Socket {
    let STRUCT_4: string;
    export { STRUCT_4 as STRUCT };
}
export class Vec4Socket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any, default_value: any);
    value: Vector4;
    addToUpdateHash(digest: any): void;
    diffValue(b: any): number;
    copyValue(): Vector4;
    getValue(): Vector4;
    copyTo(b: any): void;
    cmpValue(b: any): number;
}
export namespace Vec4Socket {
    let STRUCT_5: string;
    export { STRUCT_5 as STRUCT };
}
export class RGBSocket extends Vec3Socket {
    constructor(uiname: any, flag: any, default_value?: number[]);
    buildUI(container: any, onchange: any): void;
}
export namespace RGBSocket {
    let STRUCT_6: string;
    export { STRUCT_6 as STRUCT };
}
export class RGBASocket extends Vec4Socket {
    constructor(uiname: any, flag: any, default_value?: number[]);
}
export namespace RGBASocket {
    let STRUCT_7: string;
    export { STRUCT_7 as STRUCT };
}
export class FloatSocket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any, default_value?: number);
    value: number;
    addToUpdateHash(digest: any): void;
    diffValue(b: any): number;
    copyValue(): number;
    getValue(): number;
    copyTo(b: any): void;
    cmpValue(b: any): number;
}
export namespace FloatSocket {
    let STRUCT_8: string;
    export { STRUCT_8 as STRUCT };
}
export class EnumSocket extends IntSocket {
    static nodedef(): {
        name: string;
        uiname: string;
        graph_flag: number;
        color: number[];
    };
    constructor(uiname: any, items: {}, flag: any, default_value?: any);
    items: {};
    value: any;
    uimap: {};
    apiDefine(api: any, sockstruct: any): void;
    addUiItems(items: any): void;
    copyTo(b: any): this;
    _saveMap(obj: any): any[];
    _loadMap(obj: any): {};
}
export namespace EnumSocket {
    let STRUCT_9: string;
    export { STRUCT_9 as STRUCT };
}
export class BoolSocket extends NodeSocketType {
    static nodedef(): {
        name: string;
        uiname: string;
        color: number[];
    };
    constructor(uiname: any, flag: any);
    value: number;
    addToUpdateHash(digest: any): void;
    diffValue(b: any): number;
    copyValue(): number;
    getValue(): boolean;
    cmpValue(b: any): boolean;
}
export namespace BoolSocket {
    let STRUCT_10: string;
    export { STRUCT_10 as STRUCT };
}
import { NodeSocketType } from './graph.js';
import { Matrix4 } from '../path.ux/scripts/pathux.js';
import { Vector2 } from '../path.ux/scripts/pathux.js';
import { Vector3 } from '../path.ux/scripts/pathux.js';
import { Vector4 } from '../path.ux/scripts/pathux.js';
