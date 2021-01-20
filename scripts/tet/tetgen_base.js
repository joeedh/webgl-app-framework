import {LogContext} from '../mesh/mesh_base.js';

export const TetFlags = {
  SELECT        : 1,
  HIDE          : 2,
  UPDATE        : 4,
  TEMP1         : 8,
  TEMP2         : 16,
  TEMP3         : 32,
  ITER_EDGE_TETS1: 1<<6,
  ITER_EDGE_TETSEND: 1<<21, //max depth 16 for TetEdge.tets iterator

  MAKEFACE_TEMP: 1<<22
};

export const TetRecalcFlags = {}

export const TetTypes = {
  VERTEX: 1,
  EDGE  : 2,
  LOOP  : 4,
  FACE  : 8,
  TET   : 16,
};

export class TetLogContext extends LogContext {
  constructor() {
    super();

    this.newTets = new Set();
    this.killTets = new Set();
  }

  newTet(t) {
    if (this.onnew) {
      this.onnew(t);
    }

    this.newTets.add(t);
  }

  killTet(t) {
    if (this.onkill) {
      this.onkill(t);
    }

    this.killTets.add(t);
  }
}
