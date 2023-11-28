export class RootFileOp extends ToolOp {
    static tooldef(): {
        undoflag: number;
        uiname: string;
        toolpath: string;
    };
}
export class BasicFileOp extends ToolOp {
    static tooldef(): {
        undoflag: number;
        uiname: string;
        toolpath: string;
    };
    exec(ctx: any): void;
}
export class FileSaveOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            forceDialog: BoolProperty;
            saveToolStack: BoolProperty;
        };
        undoflag: any;
    };
    exec(ctx: any): void;
}
export class FileOpenOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {};
        undoflag: any;
    };
    exec(ctx: any): void;
}
export class FileNewOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {};
        undoflag: any;
    };
    exec(ctx: any): void;
}
export class FileExportSTL extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {
            forceDialog: BoolProperty;
            saveToolStack: BoolProperty;
        };
        undoflag: any;
    };
    exec(ctx: any): void;
}
export class AppImportOBJOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        inputs: {};
        undoflag: any;
    };
    exec(ctx: any): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { BoolProperty } from '../path.ux/scripts/pathux.js';
