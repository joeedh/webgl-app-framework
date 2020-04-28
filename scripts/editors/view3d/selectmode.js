import {MeshTypes} from '../../mesh/mesh_base.js';

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

/*
* Represents all the types of data
* that are "selectable" via findnearest api.
*
* Note that each SceneObjectData implementation can
* have multiple submodes, e.g. vertex selection vs edge/face
* selection for meshes.
*
* The fields after GEOM is for picking whole objects with specific
* SceneObjectData types.
* */
export const SelMask = {
  VERTEX : MeshTypes.VERTEX, //1
  EDGE   : MeshTypes.EDGE, //2
  FACE   : MeshTypes.FACE, //4
  //8 is MeshTypes.LOOP,
  HANDLE : MeshTypes.HANDLE,
  GEOM   : MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE,

  //save some space for more per-SceneObjectData findnearest modes

  MESH  : (1<<8),
  LIGHT  : (1<<9),
  POINTSET : (1<<10),
  OBJECT : (1<<8)|(1<<9)|(1<<10), //all types
};

window._SelMask = SelMask;
