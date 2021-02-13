export const MAX_FACE_VERTS
1024
export const MAX_VERT_EDGES
512

export const SMeshTypes = {
  VERTEX: 1,
  EDGE  : 2,
  LOOP  : 4,
  FACE  : 8
};

export const SMeshFlags = {
  SELECT: 1,
  HIDE  : 2,
  UPDATE: 4,
  TEMP1 : 8
};

export const SMeshRecalc = {
  RENDER      : 1,
  TESSELLATION: 2,
  NORMALS     : 4,
  ALL         : 1 | 2 | 4
}

export const SMeshAttrFlags = {
  SELECT : 1,
  PRIVATE: 2,
  NO_COPY: 4,
};
