import {MeshTypes} from '../../mesh/mesh.js';

export const SelToolModes = {
  ADD   : 0,
  SUB   : 1,
  AUTO  : 2
};

export const SelOneToolModes = {
  ADD     : 0,
  SUB     : 1,
  UNIQUE  : 2,
};

export const SelMask = {
  VERTEX : MeshTypes.VERTEX,
  EDGE   : MeshTypes.EDGE,
  FACE   : MeshTypes.FACE,
  MESH   : MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE,
  OBJECT : 32
};
