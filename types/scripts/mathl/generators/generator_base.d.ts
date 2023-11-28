export const CodeGenerators: any[];
export class CodeGenerator {
    static generatorDefine(): {
        typeName: string;
    };
    static getGenerator(name: any): any;
    static register(cls: any): void;
    constructor(ctx: any, args?: {});
    ctx: any;
    args: {};
    genCode(ast: any): void;
}
