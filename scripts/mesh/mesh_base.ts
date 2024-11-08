import {clearAspectCallbacks, initAspectClass, _setUIBase} from '../path.ux/scripts/core/aspect.js';
import {UIBase, nstructjs, util} from '../path.ux/scripts/pathux.js';

import * as customdata from './customdata';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";

export const REUSE_EIDS = true;

export const DEBUG_DUPLICATE_FACES = false;
export const DEBUG_MANIFOLD_EDGES = false;

export const DEBUG_BAD_LOOPS = false;
export const DEBUG_DISK_INSERT = false;

//adds a field to mesh_types.Element
export const STORE_DELAY_CACHE_INDEX = true;

export const ENABLE_CACHING = true;

export const SAVE_DEAD_LOOPS = ENABLE_CACHING;
export const SAVE_DEAD_FACES = ENABLE_CACHING;

export const SAVE_DEAD_VERTS = ENABLE_CACHING;
export const SAVE_DEAD_EDGES = ENABLE_CACHING;

export const WITH_EIDMAP_MAP = true;

_setUIBase(UIBase);

export const MAX_FACE_VERTS = 1000000;
export const MAX_VERT_EDGES = 1000;
export const MAX_EDGE_FACES = 100;

export type EID<type> = number;

export enum HandleTypes {
  AUTO = 0,
  FREE = 1,
  STRAIGHT = 2,
}

export enum MeshSymFlags {
  X = 1,
  Y = 2,
  Z = 4
}

export const MeshSymMap = {
  1: 0,
  2: 1,
  4: 2
};

export enum MeshDrawFlags {
  SHOW_NORMALS = 1,
  USE_LOOP_NORMALS = 2 //use loop normals if they have a NormalElemLayer customdata layer
}

export enum MeshFeatures {
  GREATER_TWO_VALENCE = (1 << 1),
  SPLIT_EDGE = (1 << 2),
  JOIN_EDGE = (1 << 3),
  SPLIT_FACE = (1 << 4),
  JOIN_FACE = (1 << 5),
  MAKE_VERT = (1 << 6),
  KILL_VERT = (1 << 7),
  MAKE_EDGE = (1 << 8),
  KILL_EDGE = (1 << 9),
  MAKE_FACE = (1 << 10),
  KILL_FACE = (1 << 11),
  EDGE_HANDLES = (1 << 12),

  EDGE_CURVES_ONLY = (1 << 13),
  SINGLE_SHELL = (1 << 14),
  BVH = (1 << 15),

  ALL = ((1 << 30) - 1) & ~((1 << 13) | (1 << 14)), //edge_curves_only
  BASIC = ((1 << 30) - 1) & ~((1 << 12) | (1 << 13) | (1 << 14)) //everything except handles and edge curves
};

export class MeshError extends Error {
}

export class MeshFeatureError extends MeshError {
}

/*
 child classes should support nested iteration
*/
export class ReusableIter<type> {
  static safeIterable<type>(iter: Iterable<type>): boolean {
    if (!iter || (typeof iter !== "object" && typeof iter !== "function")) {
      return false;
    }

    let ret = Array.isArray(iter);
    ret = ret || (iter instanceof ReusableIter);
    ret = ret || (iter instanceof Set);
    ret = ret || (iter instanceof util.set);

    return ret;
  }

  static getSafeIter<type>(iter): Iterable<type> {
    if (iter === undefined) {
      return undefined;
    }

    if (!this.safeIterable<type>(iter)) {
      return new Set<type>(iter);
    } else {
      return iter;
    }
  }

  [Symbol.iterator]() {
    throw new Error("implement me!");
  }
}

let lctx_blacklist = new Set([
  "reset", "newVertex", "killVertex", "killEdge", "killFace",
  "newFace", "newEdge", "newVertex", "onnew", "onkill"
]);

export enum ChangeFlags {
  CO = 1,
  NO = 2,
  CUSTOMDATA = 4,
  FLAG = 8
};

export enum LogTags {
  NONE = 0,
  COLLAPSE_EDGE = 1,
  DISSOLVE_EDGE = 2,
  DISSOLVE_VERT = 3,
  SPLIT_EDGE = 4,
  JOINTWOEDGES = 5,
  SPLIT_FACE = 6,
  SPLIT_EDGES_SMART2 = 7
}

export class LogContext {
  onnew: (v: Element, tag?: any) => void | undefined;
  onkill: (v: Element, tag?: any) => void | undefined;
  onchange: (v: Element, tag?: any) => void | undefined;

  haveAspect: boolean;

  constructor(useAsAspectClass = false) {
    if (useAsAspectClass) {
      initAspectClass(this, lctx_blacklist);
    }

    this.haveAspect = useAsAspectClass;

    /*
    this.newVerts = new Set();
    this.newEdges = new Set();
    this.newFaces = new Set();

    this.killVerts = new Set();
    this.killEdges = new Set();
    this.killFaces = new Set();
     */

    this.onnew = null;
    this.onkill = null;
    this.onchange = null; //function onchange(elem, changemask)
  }

  reset() {
    this.onnew = this.onkill = undefined;

    if (this.haveAspect) {
      clearAspectCallbacks(this);
    }

    return this;
  }

  newVertex(v, tag = undefined) {
    if (this.onnew) {
      this.onnew(v, tag);
    }
    //this.newVerts.add(v);
    return this;
  }

  newEdge(e, tag = undefined) {
    if (this.onnew) {
      this.onnew(e, tag);
    }
    //this.newEdges.add(e);
    return this;
  }

  newFace(f, tag = undefined) {
    if (this.onnew) {
      this.onnew(f, tag);
    }
    //this.newFaces.add(f);
    return this;
  }

  killVertex(v, tag = undefined) {
    if (this.onkill) {
      this.onkill(v, tag);
    }

    //this.killVerts.add(v);
    return this;
  }

  killEdge(e, tag = undefined) {
    if (this.onkill) {
      this.onkill(e, tag);
    }

    //this.killEdges.add(e);
    return this;
  }

  killFace(f, tag = undefined) {
    if (this.onkill) {
      this.onkill(f, tag);
    }

    //this.killFaces.add(f);
  }

  changeVertex(v, flag) {
    if (this.onchange) {
      this.onchange(v, flag);
    }

    return this;
  }

  changeEdge(e, flag) {
    if (this.onchange) {
      this.onchange(e, flag);
    }

    return this;
  }

  changeHandle(h, flag) {
    if (this.onchange) {
      this.onchange(h, flag);
    }

    return this;
  }

  changeLoop(l, flag) {
    if (this.onchange) {
      this.onchange(l, flag);
    }

    return this;
  }

  changeFace(f, flag) {
    if (this.onchange) {
      this.onchange(f, flag);
    }

    return this;
  }
}

export const MeshTypes = {
  VERTEX: 1,
  EDGE: 2,
  FACE: 4,
  LOOP: 8,
  HANDLE: 16
};

export type MeshTypes = number;

export enum MeshFlags {
  SELECT = (1 << 0),
  HIDE = (1 << 1),
  FLAT = (1 << 2),
  SINGULARITY = (1 << 2), //shared with FLAT
  ITER_TEMP1 = (1 << 3), //temporary flag used by faces-around-edge iterators
  ITER_TEMP2a = (1 << 4), //temporary flag used by faces-around-vertex iterators
  ITER_TEMP2b = (1 << 5), //temporary flag used by faces-around-vertex iterators
  ITER_TEMP2c = (1 << 6), //temporary flag used by faces-around-vertex iterators
  DRAW_DEBUG = (1 << 7),
  TEMP1 = (1 << 8),
  TEMP2 = (1 << 9),
  TEMP3 = (1 << 10),
  UPDATE = (1 << 11),
  BOUNDARY = (1 << 12),
  CURVE_FLIP = (1 << 13), //edge.evaluate goes backwards, shares with SMOOTH_DRAW
  SMOOTH_DRAW = (1 << 13),
  MIRROREDX = (1 << 14),
  MIRROREDY = (1 << 15),
  MIRROREDZ = (1 << 16),
  MIRRORED = (1 << 14) | (1 << 15) | (1 << 16),
  MIRROR_BOUNDARY = (1 << 17), //used by mirror
  DRAW_DEBUG2 = (1 << 18),
  SEAM = (1 << 19),
  COLLAPSE_TEMP = (1 << 20),
  TEMP4 = (1 << 21),
  TEMP5 = (1 << 22),
  NOAPI_TEMP1 = (1 << 24), //temp flag that's not allowed to be used by core API functions
  NOAPI_TEMP2 = (1 << 25),
  ITER_TEMP3 = (1 << 27),

  //these two share the same bit
  QUAD_EDGE = (1 << 28),
  GRID_MRES_HIDDEN = (1 << 28), //used by grids to flag gridverts as not part of visible multires level

  //these two share the same bit
  MAKE_FACE_TEMP = (1 << 29),
  FACE_EXIST_FLAG = (1 << 29),
}

export enum MeshIterFlags {
  EDGE_FACES = 1 << 0,
  EDGE_FACES_TOT = 10,
  VERT_FACES = 1 << 10,
  VERT_FACES_TOT = 10
}

export enum MeshModifierFlags {
  SUBSURF = 1
}

export enum RecalcFlags {
  RENDER = 1,
  TESSELATE = 2,
  PARTIAL = 4,
  ELEMENTS = 8,
  UVWRANGLER = 16,
  ALL = 1 | 2 | 4 | 8 | 16
}

const ArrayPool = util.ArrayPool;
export {ArrayPool};

let pool = new util.ArrayPool();

export function getArrayTemp<type>(n, clear = false): type[] {
  return pool.get<type>(n, clear);
}

export function reallocArrayTemp<type>(arr, newlen): type[] {
  let ret: type[] = getArrayTemp(newlen);

  for (let i = 0; i < newlen; i++) {
    ret[i] = i < arr.length ? arr[i] : undefined;
  }

  return ret;
}


import type {CustomDataElem} from "./customdata.ts";
import type {CDRef, ICustomDataElemConstructor} from "./customdata";
import type {Element} from "./mesh_types";

export class CDElemArray extends Array<CustomDataElem<any>> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.CDElemArray {
  this : array(abstract(mesh.CustomDataElem)) | this;
}
  `);

  constructor(items?: CustomDataElem<any>[]) {
    super();

    if (items !== undefined) {
      for (let item of items) {
        this.push(item);
      }
    }
  }

  clear(): this {
    this.length = 0;
    return this;
  }

  get<type>(idx: CDRef<type>): type {
    return this[idx] as unknown as type;
  }

  hasLayer(cls: ICustomDataElemConstructor) {
    for (let item of this) {
      if (item instanceof cls) {
        return true;
      }
    }

    return false;
  }

  getLayer(cls: ICustomDataElemConstructor, idx = 0) {
    let j = 0;

    for (let i = 0; i < this.length; i++) {
      let item = this[i];
      if (item instanceof cls) {
        if (j === idx) {
          return item;
        }
        j++;
      }
    }
  }

  updateLayout() {

  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
  }
}

export interface ICustomDataCapable {
  customData: CDElemArray;
}

export const EmptyCDArray = Object.seal(new CDElemArray());
