export function getParser(lexer: any, parsedef: any, tokenlist: any, prec: any, parserName: any, force?: boolean): Parser;
export class Parser {
    constructor(lexer: any, pdata: any, hash: any);
    pdata: any;
    lexer: any;
    hash: any;
    onerror: any;
    save(zipTool?: (input: any) => string): string;
    load(data: any, actions: any, unzipTool?: (input: any) => string): void;
    compressPopTab(): void;
    toJSON(): {
        pop_tab: any;
        act_tab: any;
        goto_tab: any;
        labelmap: any;
        labels: any;
        error_symbol: any;
        eof_symbol: any;
        whitespace_token: any;
        defact_tab: any;
        productions: any;
        hash: any;
    };
    loadJSON(obj: any, actions: any): void;
    printTokens(buf: any): void;
    parse(buf: any, onerror: any): any;
}
