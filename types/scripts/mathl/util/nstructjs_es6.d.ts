export class STRUCT {
    static inherit(child: any, parent: any, structName?: any): string;
    /** invoke loadSTRUCT methods on parent objects.  note that
     reader() is only called once.  it is called however.*/
    static Super(obj: any, reader: any): void;
    /** deprecated.  used with old fromSTRUCT interface. */
    static chain_fromSTRUCT(cls: any, reader: any): any;
    static formatStruct(stt: any, internal_only: any, no_helper_js: any): string;
    static fmt_struct(stt: any, internal_only: any, no_helper_js: any): string;
    idgen: number;
    allowOverriding: boolean;
    structs: {};
    struct_cls: {};
    struct_ids: {};
    compiled_code: {};
    null_natives: {};
    validateStructs(onerror: any): void;
    forEach(func: any, thisvar: any): void;
    parse_structs(buf: any, defined_classes: any): void;
    /** adds all structs referenced by cls inside of srcSTRUCT
     *  to this */
    registerGraph(srcSTRUCT: any, cls: any): void;
    register(cls: any, structName: any): void;
    unregister(cls: any): void;
    add_class(cls: any, structName: any): void;
    isRegistered(cls: any): boolean;
    get_struct_id(id: any): any;
    get_struct(name: any): any;
    get_struct_cls(name: any): any;
    _env_call(code: any, obj: any, env: any): any;
    write_struct(data: any, obj: any, stt: any): void;
    /**
     @param data : array to write data into,
     @param obj  : structable object
     */
    write_object(data: any, obj: any): any;
    /**
     Read an object from binary data
  
     @param data : DataView or Uint8Array instance
     @param cls_or_struct_id : Structable class
     @param uctx : internal parameter
     @return {cls_or_struct_id} Instance of cls_or_struct_id
     */
    readObject(data: any, cls_or_struct_id: any, uctx: any): any;
    /**
     @param data array to write data into,
     @param obj structable object
     */
    writeObject(data: any, obj: any): any;
    writeJSON(obj: any, stt?: any): {
        length: any;
    };
    /**
     @param data : DataView or Uint8Array instance
     @param cls_or_struct_id : Structable class
     @param uctx : internal parameter
     */
    read_object(data: any, cls_or_struct_id: any, uctx: any, objInstance: any): any;
    readJSON(json: any, cls_or_struct_id: any, objInstance?: any): any;
}
export function _truncateDollarSign(s: any): any;
declare var struct_binpack: Readonly<{
    __proto__: any;
    readonly STRUCT_ENDIAN: boolean;
    setEndian: typeof setEndian;
    temp_dataview: DataView;
    uint8_view: Uint8Array;
    unpack_context: typeof unpack_context;
    pack_byte: typeof pack_byte;
    pack_sbyte: typeof pack_sbyte;
    pack_bytes: typeof pack_bytes;
    pack_int: typeof pack_int;
    pack_uint: typeof pack_uint;
    pack_ushort: typeof pack_ushort;
    pack_float: typeof pack_float;
    pack_double: typeof pack_double;
    pack_short: typeof pack_short;
    encode_utf8: typeof encode_utf8;
    decode_utf8: typeof decode_utf8;
    test_utf8: typeof test_utf8;
    pack_static_string: typeof pack_static_string;
    pack_string: typeof pack_string;
    unpack_bytes: typeof unpack_bytes;
    unpack_byte: typeof unpack_byte;
    unpack_sbyte: typeof unpack_sbyte;
    unpack_int: typeof unpack_int;
    unpack_uint: typeof unpack_uint;
    unpack_ushort: typeof unpack_ushort;
    unpack_float: typeof unpack_float;
    unpack_double: typeof unpack_double;
    unpack_short: typeof unpack_short;
    unpack_string: typeof unpack_string;
    unpack_static_string: typeof unpack_static_string;
}>;
declare var struct_filehelper: Readonly<{
    __proto__: any;
    versionToInt: typeof versionToInt;
    versionCoerce: typeof versionCoerce;
    versionLessThan: typeof versionLessThan;
    FileParams: typeof FileParams;
    Block: typeof Block;
    FileeError: typeof FileeError;
    FileHelper: typeof FileHelper;
}>;
export function getEndian(): boolean;
export function inherit(child: any, parent: any, structName?: any, ...args: any[]): string;
export function isRegistered(cls: any): any;
export var manager: any;
declare var struct_parser: Readonly<{
    __proto__: any;
    NStruct: typeof NStruct;
    StructEnum: {
        T_INT: number;
        T_FLOAT: number;
        T_DOUBLE: number;
        T_STRING: number;
        T_STATIC_STRING: number;
        T_STRUCT: number;
        T_TSTRUCT: number;
        T_ARRAY: number;
        T_ITER: number;
        T_SHORT: number;
        T_BYTE: number;
        T_BOOL: number;
        T_ITERKEYS: number;
        T_UINT: number;
        T_USHORT: number;
        T_STATIC_ARRAY: number;
        T_SIGNED_BYTE: number;
    };
    ValueTypes: Set<number>;
    StructTypes: {
        int: number;
        uint: number;
        ushort: number;
        float: number;
        double: number;
        string: number;
        static_string: number;
        struct: number;
        abstract: number;
        array: number;
        iter: number;
        short: number;
        byte: number;
        bool: number;
        iterkeys: number;
        sbyte: number;
    };
    StructTypeMap: {};
    struct_parse: parser;
}>;
declare var struct_parseutil: Readonly<{
    __proto__: any;
    token: typeof token;
    tokdef: typeof tokdef;
    PUTIL_ParseError: typeof PUTIL_ParseError;
    lexer: typeof lexer;
    parser: typeof parser;
}>;
export function readJSON(json: any, class_or_struct_id: any): any;
/**
 @param data : DataView
 */
export function readObject(data: any, cls: any, __uctx?: any): any;
/** Register a class with nstructjs **/
export function register(cls: any, structName: any): any;
export function setAllowOverriding(t: any): boolean;
declare function setDebugMode$1(t: any): void;
/**
 true means little endian, false means big endian
 */
declare function setEndian$1(mode: any): boolean;
export function setTruncateDollarSign(v: any): void;
declare function setWarningMode$1(t: any): void;
/** truncate webpack mangled names. defaults to true
 *  so Mesh$1 turns into Mesh */
declare function truncateDollarSign$1(value?: boolean): void;
/** dead file */
declare var struct_typesystem: Readonly<{
    __proto__: any;
}>;
export class unpack_context {
    i: number;
}
export function unregister(cls: any): void;
export function validateStructs(onerror: any): any;
export function writeJSON(obj: any): any;
/**
 @param data : Array instance to write bytes to
 */
export function writeObject(data: any, obj: any): any;
/**
 * Write all defined structs out to a string.
 *
 * @param nManager STRUCT instance, defaults to nstructjs.manager
 * @param include_code include save code snippets
 * */
export function write_scripts(nManager?: any, include_code?: boolean): string;
declare function setEndian(mode: any): void;
declare function pack_byte(array: any, val: any): void;
declare function pack_sbyte(array: any, val: any): void;
declare function pack_bytes(array: any, bytes: any): void;
declare function pack_int(array: any, val: any): void;
declare function pack_uint(array: any, val: any): void;
declare function pack_ushort(array: any, val: any): void;
declare function pack_float(array: any, val: any): void;
declare function pack_double(array: any, val: any): void;
declare function pack_short(array: any, val: any): void;
declare function encode_utf8(arr: any, str: any): void;
declare function decode_utf8(arr: any): string;
declare function test_utf8(): boolean;
declare function pack_static_string(data: any, str: any, length: any): void;
declare function pack_string(data: any, str: any): void;
declare function unpack_bytes(dview: any, uctx: any, len: any): DataView;
declare function unpack_byte(dview: any, uctx: any): any;
declare function unpack_sbyte(dview: any, uctx: any): any;
declare function unpack_int(dview: any, uctx: any): any;
declare function unpack_uint(dview: any, uctx: any): any;
declare function unpack_ushort(dview: any, uctx: any): any;
declare function unpack_float(dview: any, uctx: any): any;
declare function unpack_double(dview: any, uctx: any): any;
declare function unpack_short(dview: any, uctx: any): any;
declare function unpack_string(data: any, uctx: any): string;
declare function unpack_static_string(data: any, uctx: any, length: any): string;
declare function versionToInt(v: any): number;
declare function versionCoerce(v: any): any;
declare function versionLessThan(a: any, b: any): boolean;
declare class FileParams {
    magic: string;
    ext: string;
    blocktypes: string[];
    version: {
        major: number;
        minor: number;
        micro: number;
    };
}
declare class Block {
    constructor(type_magic: any, data: any);
    type: any;
    data: any;
}
declare class FileeError extends Error {
}
declare class FileHelper {
    constructor(params: any);
    version: any;
    blocktypes: any;
    magic: any;
    ext: any;
    struct: any;
    unpack_ctx: unpack_context;
    read(dataview: any): Block[];
    blocks: any;
    doVersions(old: any): void;
    write(blocks: any): DataView;
    writeBase64(blocks: any): any;
    makeBlock(type: any, data: any): Block;
    readBase64(base64: any): Block[];
}
declare class NStruct {
    constructor(name: any);
    fields: any[];
    id: number;
    name: any;
}
declare class parser {
    constructor(lexer: any, errfunc: any);
    lexer: any;
    errfunc: any;
    start: any;
    parse(data: any, err_on_unconsumed: any): any;
    input(data: any): void;
    error(token: any, msg: any): void;
    peek(): any;
    peeknext(): any;
    next(): any;
    optional(type: any): boolean;
    at_end(): any;
    expect(type: any, msg: any): any;
}
declare class token {
    constructor(type: any, val: any, lexpos: any, lineno: any, lexer: any, parser: any);
    type: any;
    value: any;
    lexpos: any;
    lineno: any;
    lexer: any;
    parser: any;
    toString(): string;
}
declare class tokdef {
    constructor(name: any, regexpr: any, func: any, example: any);
    name: any;
    re: any;
    func: any;
    example: any;
}
declare class PUTIL_ParseError extends Error {
    constructor(msg: any);
}
declare class lexer {
    constructor(tokdef: any, errfunc: any);
    tokdef: any;
    tokens: any[];
    lexpos: number;
    lexdata: string;
    lineno: number;
    errfunc: any;
    tokints: {};
    statestack: (string | number)[][];
    states: {
        __main__: any[];
    };
    statedata: number;
    add_state(name: any, tokdef: any, errfunc: any): void;
    tok_int(name: any): void;
    push_state(state: any, statedata: any): void;
    pop_state(): void;
    input(str: any): void;
    peeked_tokens: any[];
    error(): void;
    peek(): any;
    peeknext(): any;
    at_end(): boolean;
    next(ignore_peek: any): any;
}
export { struct_binpack as binpack, struct_filehelper as filehelper, struct_parser as parser, struct_parseutil as parseutil, setDebugMode$1 as setDebugMode, setEndian$1 as setEndian, setWarningMode$1 as setWarningMode, truncateDollarSign$1 as truncateDollarSign, struct_typesystem as typesystem };
