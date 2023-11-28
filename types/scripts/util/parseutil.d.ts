export class token {
    constructor(type: any, val: any, lexpos: any, lexlen: any, lineno: any, lexer: any, parser: any);
    type: any;
    value: any;
    lexpos: any;
    lexlen: any;
    lineno: any;
    lexer: any;
    parser: any;
    toString(): string;
}
export class tokdef {
    constructor(name: any, regexpr: any, func: any);
    name: any;
    re: any;
    func: any;
}
export class PUTLParseError extends Error {
    constructor(msg: any);
}
export class lexer {
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
    peek_i(i: any): any;
    at_end(): boolean;
    next(ignore_peek: any): any;
}
export class parser {
    constructor(lexer: any, errfunc: any);
    lexer: any;
    errfunc: any;
    start: any;
    parse(data: any, err_on_unconsumed: any): any;
    input(data: any): void;
    error(tok: any, msg: any): void;
    peek(): any;
    peek_i(i: any): any;
    peeknext(): any;
    next(): any;
    optional(type: any): boolean;
    at_end(): any;
    expect(type: any, msg: any): any;
}
