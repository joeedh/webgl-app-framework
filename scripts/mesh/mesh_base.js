import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export const HandleTypes = {
  AUTO     : 0,
  FREE     : 1,
  STRAIGHT : 2
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

  ALL                 : ((1<<30)-1) & ~(1<<13), //edge_curves_only
  BASIC               : ((1<<30)-1) & ~((1<<12)|(1<<13)) //everything except handles and edge curves
};

export class MeshError extends Error {
}

export class MeshFeatureError extends MeshError {

};

export const MeshTypes = {
  VERTEX : 1,
  EDGE   : 2,
  FACE   : 4,
  LOOP   : 8,
  HANDLE : 16
};

export const MeshFlags = {
  SELECT        : 1,
  HIDE          : 2,
  FLAT          : 4,
  ITER_TEMP1    : 8, //temporary flag used by faces-around-edge iterators
  ITER_TEMP2a   : 16, //temporary flag used by faces-around-vertex iterators
  ITER_TEMP2b   : 32, //temporary flag used by faces-around-vertex iterators
  ITER_TEMP2c   : 64, //temporary flag used by faces-around-vertex iterators
  DRAW_DEBUG    : 128,
  TEMP1         : 256,
  TEMP2         : 512,
  TEMP3         : 1024,
  UPDATE        : 2048
};

export const MeshModifierFlags = {
  SUBSURF : 1
};

export const RecalcFlags = {
  RENDER     : 1,
  TESSELATE  : 2,
  PARTIAL    : 4,
  ELEMENTS   : 8
};

