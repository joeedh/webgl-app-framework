export let VarTypeClasses: any[];
export class VarType {
    static fromJSON(json: any): any;
    static register(cls: any): void;
    constructor(type: any);
    type: any;
    toJSON(): {
        type: any;
        Class: string;
    };
    loadJSON(json: any): this;
    toString(): string;
    makeZero(): number;
    getComponents(): number;
    getBaseName(): any;
    getTypeName(): string;
    getTypeNameSafe(): any;
}
export class ArrayType extends VarType {
    constructor(type: any, size: any, alias?: string);
    alias: string;
    size: any;
    toJSON(): {
        type: any;
        Class: string;
    } & {
        alias: string;
        size: any;
    };
    loadJSON(json: any): void;
    getComponents(): any;
    makeZero(): any[];
    getTypeNameSafe(): string;
}
export class DynamicArrayType extends ArrayType {
    constructor(type: any, alias?: string);
    getComponents(): number;
}
