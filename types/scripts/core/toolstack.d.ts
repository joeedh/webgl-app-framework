export class AppToolStack {
    constructor(ctx: any);
    enforceMemLimit: boolean;
    memLimit: number;
    _undo_branch: any;
    _syncSettings(ctx: any): this;
    limitMemory(limit: any, ctx: any): any;
    execTool(ctx: any, toolop: any, event: any): void;
    length: any;
    modal_running: boolean;
    toolCancel(ctx: any, tool: any): void;
    undo(): void;
    replay(fromBasicFile?: boolean): Promise<any>;
    redo(): void;
}
