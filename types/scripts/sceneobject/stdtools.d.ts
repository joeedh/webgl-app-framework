export namespace StandardTools1 {
    let SELECTONE: number;
    let TOGGLE_SELECT_ALL: number;
    let CIRCLE_SELECT: number;
    let BOX_SELECT: number;
    let SELECT_LINKED: number;
    let DELETE: number;
    let DUPLICATE: number;
}
/**
 * Collection of standard tool operators
 * for different types of object data.
 *
 * For standard tools that operate at object level itself
 * see sceneobject_ops.js:ObjectTools
 *
 * Note that these do *not* compose.
 *
 * Popping up menus and
 * spawning modal tools are okay.
 */
export const NOTEXIST: unique symbol;
export class StandardTools {
    static SelectOne(ctx: any, unique?: boolean): symbol;
    static ToggleSelectAll(ctx: any): symbol;
    static CircleSelect(ctx: any): symbol;
    static BoxSelect(ctx: any): symbol;
    static SelectLinked(ctx: any, x: any, y: any): symbol;
    static Delete(ctx: any): symbol;
    static Duplicate(ctx: any): symbol;
    hasTool(method: any): boolean;
}
