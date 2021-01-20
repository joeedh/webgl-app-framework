import '../path.ux/scripts/util/struct.js';
import * as util from '../util/util.js';
let STRUCT = nstructjs.STRUCT;

export const HandleTypes = {
  AUTO     : 0,
  FREE     : 1,
  STRAIGHT : 2
};

export const MeshSymFlags = {
  X : 1,
  Y : 2,
  Z : 4
};

export const MeshSymMap = {
  1 : 0,
  2 : 1,
  4 : 2
};

export const MeshDrawFlags = {
  SHOW_NORMALS : 1,
  USE_LOOP_NORMALS : 2 //use loop normals if they have a NormalElemLayer customdata layer
};

export const MeshFeatures = {
  GREATER_TWO_VALENCE : (1<<1),
  SPLIT_EDGE          : (1<<2),
  JOIN_EDGE           : (1<<3),
  SPLIT_FACE          : (1<<4),
  JOIN_FACE           : (1<<5),
  MAKE_VERT           : (1<<6),
  KILL_VERT           : (1<<7),
  MAKE_EDGE           : (1<<8),
  KILL_EDGE           : (1<<9),
  MAKE_FACE           : (1<<10),
  KILL_FACE           : (1<<11),
  EDGE_HANDLES        : (1<<12),

  EDGE_CURVES_ONLY    : (1<<13),
  SINGLE_SHELL        : (1<<14),

  ALL                 : ((1<<30)-1) & ~((1<<13)|(1<<14)), //edge_curves_only
  BASIC               : ((1<<30)-1) & ~((1<<12)|(1<<13)|(1<<14)) //everything except handles and edge curves
};

export class MeshError extends Error {
}

export class MeshFeatureError extends MeshError {

};

//inherit from this to flag iterators that are reusable *and* auto-resets
export class ReusableIter {
  reset() {
    return this;
  }

  static safeIterable(iter) {
    if (!iter || (typeof iter !== "object" && typeof iter !== "function")) {
      return false;
    }

    let ret = Array.isArray(iter);
    ret = ret || (iter instanceof ReusableIter);
    ret = ret || (iter instanceof Set);
    ret = ret || (iter instanceof util.set);

    return ret;
  }

  static getSafeIter(iter) {
    if (iter === undefined) {
      return undefined;
    }

    if (!this.safeIterable(iter)) {
      return new Set(iter);
    } else {
      return iter;
    }
  }
}

export class LogContext {
  constructor() {
    this.newVerts = new Set();
    this.newEdges = new Set();
    this.newFaces = new Set();

    this.killVerts = new Set();
    this.killEdges = new Set();
    this.killFaces = new Set();

    this.onnew = null;
    this.onkill = null;
  }

  newVertex(v) {
    if (this.onnew) {
      this.onnew(v);
    }
    this.newVerts.add(v);
  }

  newEdge(e) {
    if (this.onnew) {
      this.onnew(e);
    }
    this.newEdges.add(e);
  }
  newFace(f) {
    if (this.onnew) {
      this.onnew(f);
    }
    this.newFaces.add(f);
  }

  killVertex(v) {
    if (this.onkill) {
      this.onkill(v);
    }

    this.killVerts.add(v);
  }

  killEdge(e) {
    if (this.onkill) {
      this.onkill(e);
    }

    this.killEdges.add(e);
  }

  killFace(f) {
    if (this.onkill) {
      this.onkill(f);
    }

    this.killFaces.add(f);
  }

}

export const MeshTypes = {
  VERTEX : 1,
  EDGE   : 2,
  FACE   : 4,
  LOOP   : 8,
  HANDLE : 16
};

export const MeshFlags = {
  SELECT        : (1<<0),
  HIDE          : (1<<1),
  FLAT          : (1<<2),
  ITER_TEMP1    : (1<<3), //temporary flag used by faces-around-edge iterators
  ITER_TEMP2a   : (1<<4), //temporary flag used by faces-around-vertex iterators
  ITER_TEMP2b   : (1<<5), //temporary flag used by faces-around-vertex iterators
  ITER_TEMP2c   : (1<<6), //temporary flag used by faces-around-vertex iterators
  DRAW_DEBUG    : (1<<7),
  TEMP1         : (1<<8),
  TEMP2         : (1<<9),
  TEMP3         : (1<<10),
  UPDATE        : (1<<11),
  CURVE_FLIP    : (1<<12), //edge.evaluate goes backwards
  SMOOTH_DRAW   : (1<<13),
  MIRROREDX     : (1<<14),
  MIRROREDY     : (1<<15),
  MIRROREDZ     : (1<<16),
  MIRRORED      : (1<<14)|(1<<15)|(1<<16),
  MIRROR_BOUNDARY   : (1<<17), //used by mirror
  GRID_MRES_HIDDEN  : (1<<18), //used by grids to flag gridverts as not part of visible multires level
  SEAM              : (1<<19),
  FACE_EXIST_FLAG   : (1<<20),
  TEMP4             : (1<<21),
  TEMP5             : (1<<22),
  TEMP6             : (1<<23)
};

export const MeshModifierFlags = {
  SUBSURF : 1
};

export const RecalcFlags = {
  RENDER     : 1,
  TESSELATE  : 2,
  PARTIAL    : 4,
  ELEMENTS   : 8,
  UVWRANGLER : 16,
  ALL        : 1|2|4|8|16
};


let atemps = {};
window._arrcache = atemps;

export function getArrayTemp(n) {
  if (n in atemps) {
    return atemps[n].next();
  }

  let ring = new util.cachering(() => new Array(n), 64);
  atemps[n] = ring;

  return ring.next();
}
