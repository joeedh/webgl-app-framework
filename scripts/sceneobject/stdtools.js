/**
 *
 * okay, looks like this part of the toolmode refactor might not happen.
 *
 * */
export const StandardTools1 = {
  SELECTONE         : 1,
  TOGGLE_SELECT_ALL : 2,
  CIRCLE_SELECT     : 4,
  BOX_SELECT        : 8,
  SELECT_LINKED     : 16,
  DELETE            : 32,
  DUPLICATE         : 64
};

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
export const NOTEXIST = Symbol("notexist");

export class StandardTools {
  hasTool(method) {
    return this.hasOwnProperty(method);
  }

  static SelectOne(ctx, unique=true) {
    return NOTEXIST;
  }

  static ToggleSelectAll(ctx) {
    return NOTEXIST;
  }
  static CircleSelect(ctx) {
    return NOTEXIST;
  }
  static BoxSelect(ctx) {
    return NOTEXIST;
  }
  static SelectLinked(ctx, x, y) {
    return NOTEXIST;
  }
  static Delete(ctx) {
    return NOTEXIST;
  }
  static Duplicate(ctx) {
    return NOTEXIST;
  }
}
