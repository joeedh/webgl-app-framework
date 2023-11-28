export class ConsoleLineEntry {
    constructor(line: any, loc?: string, fg?: string, bg?: string);
    line: string;
    loc: string;
    bg: string;
    fg: string;
    closed: boolean;
    parent: number;
    children: number;
    flag: number;
    loadSTRUCT(reader: any): void;
}
export namespace ConsoleLineEntry {
    let STRUCT: string;
}
export class ConsoleCommand {
    constructor(cmd: any);
    command: any;
    loadSTRUCT(reader: any): void;
}
export namespace ConsoleCommand {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export namespace HitBoxTypes {
    let TOGGLE_CHILDREN: number;
    let CUSTOM: number;
}
export class HitBox {
    constructor(x: any, y: any, w: any, h: any);
    pos: Vector2;
    size: Vector2;
    type: number;
    onhit: any;
    lines: any[];
    toggle(e: any, editor: any): void;
    click(e: any, editor: any): void;
}
export class ConsoleEditor extends Editor {
    static define(): {
        tagname: string;
        areaname: string;
        uiname: string;
        icon: number;
        flag: number;
        style: string;
    };
    _lastStack: string;
    _animreq: number;
    redraw(): void;
    hitboxes: any[];
    fontsize: number;
    lines: any[];
    history: any[];
    head: number;
    bufferSize: number;
    scroll: Vector2;
    colors: {
        error: string;
        error_bg: string;
        warning: string;
        object: string;
        loc: string;
        source: string;
        warning_bg: string;
    };
    colormap: {
        red: string;
        blue: string;
    };
    formatMessage(...args: any[]): string;
    formatStackLine(stack: any, parts?: boolean): string | any[];
    push(msg: any, linefg?: string, linebg?: string, childafter?: boolean): void;
    pushLine(line: any): void;
    get lineHeight(): number;
    printStack(start?: number, fg?: string, bg?: string, closed?: boolean): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    trace(...args: any[]): void;
    log(...args: any[]): void;
    _mouse(e: any): {
        preventDefault: any;
        stopPropagation: any;
        buttons: any;
        button: any;
        shiftKey: any;
        ctrlKey: any;
        altKey: any;
        commandKey: any;
        x: any;
        y: any;
        pageX: any;
        pageY: any;
        touches: any;
    };
    on_mousedown(e: any): void;
    on_mousemove(e: any): void;
    updateActive(x: any, y: any): any;
    on_mouseup(e: any): void;
    canvas: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    textbox: HTMLInputElement;
    _on_change(e: any): void;
    pushHistory(cmd: any): void;
    doCommand(cmd: any): void;
    doTab(cmd?: string): void;
    goHistory(di: any): void;
    popup(x: any, y: any): void;
    _on_keydown(e: any): void;
    updateSize(): void;
    queueRedraw(): void;
    copy(): HTMLElement;
    loadSTRUCT(reader: any): void;
}
import { Vector2 } from '../../path.ux/scripts/pathux.js';
import { Editor } from '../editor_base.js';
