/*view picking functionality*/

import {ViewContext} from '../../core/context.js'
import {IUniformsBlock} from '../../core/webgl.js'
import {Mesh} from '../../mesh/mesh.js'
import {SceneObject} from '../../sceneobject/sceneobject.js'
import {IVectorOrHigher, Vector2, Vector3} from '../../util/vectormath.js'
import {View3D} from '../all.js'
import {SelMask} from './selectmode.js'

export const CastModes = {
  FRAMEBUFFER: 0, //castViewRay p parameter is in screen space (through view3d.getLocalMouse)
  GEOMETRIC  : 1, //implement me! castRay p parameter is in world space
}

export const FindNearestTypes = [] as IFindnearestConstructor[]

export interface IFindnearestDef {
  selectMask: number
}

export type IFindnearestConstructor<T extends FindnearestClass = FindnearestClass> = {
  new (): T
  _define?: IFindnearestDef
} & typeof FindnearestClass

export class FindNearestRet<D = unknown> {
  data?: D
  _object: number
  _mesh: number
  p2d: Vector2
  p3d: Vector3
  dis?: number

  constructor() {
    this.data = undefined
    this._object = -1
    this._mesh = -1

    this.p2d = new Vector2()
    this.p3d = new Vector3()
    this.dis = undefined
  }

  //avoid reference leaks in cacherings
  get object() {
    return _appstate.datalib.get(this._object)
  }

  set object(ob) {
    if (!ob) {
      this._object = -1
      return
    }

    this._object = ob.lib_id
  }

  get mesh() {
    return _appstate.datalib.get(this._mesh)
  }

  set mesh(ob) {
    if (!ob) {
      this._mesh = -1
      return
    }

    this._mesh = ob.lib_id
  }

  reset() {
    this.p2d.zero()
    this.p3d.zero()
    this.dis = undefined
    this.object = undefined
    this.data = undefined

    return this
  }
}

function getDefine(cls: IFindnearestConstructor) {
  if (cls._define) {
    return cls._define
  }

  cls._define = cls.define()
  return cls._define
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
export function FindNearest(
  ctx: ViewContext,
  selectMask: number,
  mpos: IVectorOrHigher<2>,
  view3d?: View3D,
  limit = 25
): FindNearestRet[] {
  view3d = view3d === undefined ? ctx.view3d : view3d

  let ret = [] as FindNearestRet[]

  for (const cls of FindNearestTypes) {
    const def = getDefine(cls)

    if (def.selectMask & selectMask) {
      const ret2 = cls.findnearest(ctx, selectMask, mpos, view3d, limit)
      if (ret2 !== undefined) {
        ret = ret.concat(ret2)
      }
    }
  }

  return ret
}

export function castViewRay(
  ctx: ViewContext,
  selectMask: number,
  mpos: IVectorOrHigher<3>,
  view3d?: View3D,
  mode = CastModes.FRAMEBUFFER
): FindNearestRet[] {
  view3d = view3d === undefined ? ctx.view3d : view3d

  let ret = [] as FindNearestRet[]

  for (const cls of FindNearestTypes) {
    const def = getDefine(cls)

    if (def.selectMask & selectMask) {
      const ret2 = cls.castViewRay(ctx, selectMask, mpos, view3d, mode)
      if (ret2 !== undefined) {
        ret = ret.concat(ret2)
      }
    }
  }

  //return closest item
  let mindis = 1e17
  let ret2 = undefined

  for (const item of ret) {
    if (item.dis !== undefined && (ret2 === undefined || (item.dis > 0 && item.dis < mindis))) {
      mindis = item.dis
      ret2 = item
    }
  }

  return ret2 ? [ret2] : []
}

export class FindnearestClass {
  static define() {
    return {
      selectMask: 0,
    }
  }

  static drawsObjectExclusively(view3d: View3D, object: SceneObject) {
    return false
  }

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
  static findnearest(ctx: ViewContext, selectMask: number, mpos: IVectorOrHigher<2>, view3d: View3D, limit = 25) {}

  /**
   *
   * @return array of 1 or more FindNearestRet instances
   */
  static castViewRay(
    ctx: ViewContext,
    selectMask: number,
    p: IVectorOrHigher<3>,
    view3d: View3D,
    mode = CastModes.FRAMEBUFFER
  ) {}

  /*
   * called for all objects;  returns true
   * if an object is valid for this class (and was drawn)
   *
   * When drawing pass the object id to red and any subdata
   * to green.
   * */
  drawIDs(view3d: View3D, gl: WebGL2RenderingContext, uniforms: IUniformsBlock, object: SceneObject, mesh: Mesh) {}

  static register(cls: IFindnearestConstructor) {
    FindNearestTypes.push(cls)
  }
}
