import { CustomDataElem, ICustomDataElemDef } from "./customdata";
import { MeshTypes } from "./mesh_base";
import '../util/floathalf.js';
import { Vector2, Vector3, Vector4, DataAPI, DataStruct } from '../path.ux/scripts/pathux.js';
import { StructReader } from "../path.ux/scripts/path-controller/types/util/nstructjs";
export declare enum UVFlags {
    PIN = 2
}
export declare class UVLayerElem extends CustomDataElem<Vector2> {
    static STRUCT: string;
    static apiDefine(api: any, dstruct: any): void;
    static define(): {
        elemTypeMask: MeshTypes;
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        valueSize: number;
        flag: number;
    };
    uv: Vector2;
    flag: number;
    constructor();
    clear(): this;
    setValue(uv: Vector2): void;
    add(b: this): this;
    addFac(b: this, fac: number): this;
    mulScalar(b: number): this;
    getValue(): Vector2;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
}
export declare class Vector2LayerElem extends CustomDataElem<Vector2> {
    value: Vector2;
    static STRUCT: string;
    constructor();
    static apiDefine(api: DataAPI, dstruct: DataStruct): void;
    static define(): ICustomDataElemDef;
    clear(): this;
    setValue(value: Vector2): void;
    add(b: this): this;
    addFac(b: this, fac: number): this;
    mulScalar(b: number): this;
    getValue(): Vector2;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
}
export declare const ORIGINDEX_NONE = -1;
export declare class OrigIndexElem extends CustomDataElem<number> {
    static STRUCT: string;
    i: number;
    constructor();
    static define(): ICustomDataElemDef;
    setValue(i: number): void;
    getValue(): number;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
}
export declare class FloatElem extends CustomDataElem<number> {
    static STRUCT: string;
    value: number;
    constructor(value?: number);
    add(b: this): this;
    addFac(b: this, fac: number): this;
    clear(): this;
    static define(): ICustomDataElemDef;
    setValue(f: number): void;
    getValue(): number;
    copyTo(b: this): void;
    mulScalar(b: number): this;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
}
export declare class IntElem extends CustomDataElem<number> {
    static STRUCT: string;
    value: number;
    constructor();
    static define(): ICustomDataElemDef;
    setValue(i: number): void;
    getValue(): number;
    clear(): this;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
}
export declare class NormalLayerElem extends CustomDataElem<Vector3> {
    static STRUCT: string;
    no: Vector3;
    constructor();
    static define(): ICustomDataElemDef;
    setValue(n: Vector3): void;
    getValue(): Vector3;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
}
export declare class ColorLayerElem extends CustomDataElem<Vector4> {
    static STRUCT: string;
    color: Vector4;
    constructor();
    static define(): ICustomDataElemDef;
    clear(): this;
    static apiDefine(api: DataAPI, dstruct: DataStruct): void;
    setValue(color: Vector4): void;
    getValue(): Vector4;
    copyTo(b: this): void;
    add(b: this): this;
    addFac(b: this, fac: number): this;
    mulScalar(b: number): this;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class Vector3LayerElem extends CustomDataElem<Vector3> {
    static STRUCT: string;
    value: Vector3;
    constructor();
    static define(): ICustomDataElemDef;
    setValue(val: Vector3): void;
    getValue(): Vector3;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class Vector4LayerElem extends CustomDataElem<Vector4> {
    static STRUCT: string;
    value: Vector4;
    constructor();
    static define(): {
        elemTypeMask: number;
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        valueSize: number;
        flag: number;
    };
    setValue(val: Vector4): void;
    getValue(): Vector4;
    copyTo(b: this): void;
    interp(dest: this, datas: this[], ws: number[]): void;
    validate(): boolean;
    loadSTRUCT(reader: StructReader<this>): void;
}
export declare class MaskElem extends FloatElem {
    static STRUCT: string;
    constructor();
    static define(): ICustomDataElemDef;
}
