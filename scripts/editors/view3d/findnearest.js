/*view picking functionality*/

import {Vector2, Vector3} from "../../util/vectormath.js";
import {SelMask} from "./selectmode.js";

export const CastModes = {
  FRAMEBUFFER : 0, //castRay p parameter is in screen space (through view3d.getLocalMouse)
  GEOMETRIC  : 1, //implement me! castRay p parameter is in world space
};

export const FindNearestTypes = [];

export class FindNearestRet {
  constructor() {
    this.data = undefined;
    this.object = undefined;
    this.p2d = new Vector2();
    this.p3d = new Vector3();
    this.dis = undefined;
  }

  reset() {
    this.p2d.zero();
    this.p3d.zero();
    this.dis = undefined;
    this.object = undefined;
    this.data = undefined;

    return this;
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

export function castRay(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
  view3d = view3d === undefined ? ctx.view3d : view3d;

  let ret = [];

  for (let cls of FindNearestTypes) {
    let def = getDefine(cls);

    if (def.selectMask & selectMask) {
      let ret2 = cls.castRay(ctx, selectMask, p, view3d, mode);
      if (ret2 !== undefined) {
        ret = ret.concat(ret2);
      }
    }
  }

  //return closest item
  let mindis = 1e17;
  let ret2 = undefined;

  for (let item of ret) {
    if (ret2 === undefined || (item.dis > 0 && item.dis < mindis)) {
      mindis = item.dis;
      ret2 = item;
    }
  }

  return ret2;
}

export class FindnearestClass {
  static define() {return {
    selectMask : 0
  }}

  /**
   *
   * @param ctx
   * @param selectMask
   * @param mpos
   * @param view3d
   * @param limit
   *
   * @return array of 1 or more FindNearestRet instances
   */
  static findnearest(ctx, selectMask, mpos, view3d, limit=25) {
  }

  /**
   *
   * @return array of 1 or more FindNearestRet instances
   */
  static castRay(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {

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

