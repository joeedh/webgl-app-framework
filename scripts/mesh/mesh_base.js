import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class MeshError extends Error {
}

export const MeshTypes = {
  VERTEX : 1,
  EDGE   : 2,
  FACE   : 4,
  LOOP   : 8
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
  TEMP3         : 1024
};

export const RecalcFlags = {
  RENDER     : 1,
  TESSELATE  : 2,
  PARTIAL    : 4
};

