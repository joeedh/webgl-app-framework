export namespace Endians {
    let BIG: number;
    let LITTLE: number;
}
export class BinaryWriter {
    data: any[];
    string(s: any): void;
    concat(b: any): this;
    int32(c: any): void;
    float32(f: any): void;
    float64(f: any): void;
    uint16(c: any): void;
    bytes(c: any): void;
    uint8(c: any): void;
    finish(): Uint8Array;
}
export class BinaryReader {
    constructor(buffer: any, endian?: number);
    view: DataView;
    endian: number;
    i: number;
    bytes(n: any): number[];
    float64(): number;
    float32(): number;
    int32(): number;
    int64(): number;
    uint32(): number;
    int16(): number;
    uint16(): number;
    at_end(): boolean;
    get length(): number;
    skip(n: any): this;
    uint8(): number;
    string(n: any): string;
}
