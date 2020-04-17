/*view picking functionality*/

import {Vector2, Vector3} from "../../util/vectormath.js";
import {SelMask} from "./selectmode.js";

export const FindNearestTypes = [];

export class FindNearestRet {
  constructor() {
    this.data = undefined;
    this.object = undefined;
    this.p2d = new Vector2();
    this.p3d = new Vector3();
    this.dis = undefined;
  }
}

function getDefine(cls) {
  if (cls._define) {
    return cls._define;
  }

  cls._define = cls.define();
  return cls._define;
}

/**
 * Finds geometry close to (screen-space) x/y
 * @param ctx : context
 * @param selectMask : see SelMask, what type of data to find
 * @param mpos : mouse position
 * @param view3d : View3D, defaults to ctx.view3d
 * @param limit : maximum distance in screen space from x/y
 * @returns {Array<FindNearestRet>}
 * @constructor
 */
//if view3d is undefined, will use ctx.view3d
//mpos is assumed to already have view3d.getLocalMouse called on it
export function FindNearest(ctx, selectMask, mpos, view3d=undefined, limit=25) {
  view3d = view3d === undefined ? ctx.view3d : view3d;

  let ret = [];

  for (let cls of FindNearestTypes) {
    let def = getDefine(cls);

    if (def.selectMask & selectMask) {
      let ret2 = cls.findnearest(ctx, selectMask, mpos, view3d, limit);
      if (ret2 !== undefined) {
        ret = ret.concat(ret2);
      }
    }
  }

  return ret;
}

export class FindnearestClass {
  static define() {return {
    selectMask : 0
  }}

  //returns array of items
  static findnearest(ctx, selectMask, mpos, view3d, limit=25) {
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this class (and was drawn)
  *
  * When drawing pass the object id to red and any subdata
  * to green.
  * */
  drawIDs(view3d, gl, uniforms, object, mesh) {
  }

  static register(cls) {
    FindNearestTypes.push(cls);
  }
}

