import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';

import {TetTypes, TetFlags, TetRecalcFlags} from './tetgen_base.js';

let vniters = new Array(1024);
vniters.cur = 0;

export class VertNeighborIter {
  constructor() {
    this.ret = {done : false, value : undefined};
    this.done = true;
    this.v = undefined;
    this.i = 0;
  }

  reset(v) {
    this.v = v;
    this.i = 0;
    this.done = false
    this.ret.done = false;

    return this;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      vniters.cur--;
      this.v = undefined;
      this.ret.value = undefined;
      this.ret.done = true;
    }

    return this;
  }

  return() {
    this.finish();

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    let ret = this.ret;
    let v = this.v;

    if (this.i >= v.valence) {
      this.finish();
      return this.ret;
    }

    let e = v.edges[this.i];
    this.i++;

    ret.value = e.otherVertex(v);
    return ret;
  }
}
for (let i=0; i<vniters.length; i++) {
  vniters[i] = new VertNeighborIter();
}

export class TetElement {
  constructor(type) {
    this.eid = -1;
    this.flag = 0;
    this.index = 0;
    this.type = type;
    this.customData = [];
  }
}

TetElement.STRUCT = `
tet.TetElement {
  type       : byte;
  eid        : int;
  flag       : int;
  index      : int;
  customData : array(abstract(mesh.CustomDataElem)); 
}
`

export class TetVertex extends TetElement {
  constructor() {
    super(TetTypes.VERTEX);

    //hrm, mixing in Vector3 does play havoc with JS optimizers. . .
    this.initVector3();
    //this.co = new Vector3();

    this.edges = [];
  }

  get neighbors() {
    return vniters[vniters.cur++].reset(this);
  }
}

TetVertex.STRUCT = nstructjs.inherit(TetVertex, TetElement, "tet.TetVertex") + `
  0     : float;
  1     : float;
  2     : float;
  edges : iter(e, int) | e.eid;
}`;
nstructjs.register(TetVertex);
//util.mixin(TetVertex, Vector3);

let etetiters = new Array(16);
etetiters.cur = 0;

export class EdgeTetIter {
  constructor() {
    this.e = undefined;
    this.l = undefined;
    this._i = 0;
    this.ret = {done : true, value : undefined};
    this.done = true;
  }

  reset(e) {
    this.e = e;
    this.ret.done = false;
    this.ret.value = undefined;
    this.done = false;
    this.l = e.l;
    this._i = 0;
    this.flag = 1<<(etetiters.cur + TetFlags.ITER_EDGE_TETS1);

    if (e.l) {
      let _i = 0;
      let l = e.l;
      let flag = this.flag;

      do {
        if (_i++ > 100) {
          console.error("Infinite loop error");
          break;
        }

        l.t.flag &= ~flag;

        l = l.radial_next;
      } while (l !== e.l);
    }

    return this;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    if (!this.l) {
      return this.finish();
    }

    if (this._i++ > 100) {
      console.error("Infinite loop error");
      return this.finish();
    }

    this.l = this.l.radial_next;
    let _i = 0;

    while (this.l !== this.e.l && (this.l.t.flag & this.flag)) {
      this.l = this.l.radial_next;

      if (_i++ > 100) {
        console.error("Infinite loop error");
        break;
      }
    }

    if (this.l === this.e.l) {
      return this.finish();
    }

    let ret = this.ret;

    ret.value = this.l.t;
    ret.done = false;

    return ret;
  }

  finish() {
    if (!this.done) {
      this.e = undefined; //avoid reference leak

      etetiters.cur--;
      this.ret.done = true;
      this.ret.value = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }
}
for (let i=0; i<etetiters.length; i++) {
  etetiters[i] = new EdgeTetIter();
}
export class TetEdge extends TetElement {
  constructor() {
    super(TetTypes.EDGE);

    this.v1 = undefined;
    this.v2 = undefined;

    this.l = undefined;
  }

  get tets() {
    return etetiters[etetiters.cur++].reset(this);
  }

  get loops() {
    let this2 = this;

    return (function*() {
      let l = this2.l;
      let _i = 0;
      do {
        if (_i++ > 100) {
          console.error("Infinite loop error");
          break;
        }

        yield l;

        l = l.next;
      } while (l !== this2.l);
    })();
  }

  otherVertex(v) {
    if (v === this.v1) {
      return this.v2;
    } else if (v === this.v2) {
      return this.v1;
    } else {
      throw new Error("Vertex not in edge");
    }
  }
}

TetEdge.STRUCT = nstructjs.inherit(TetEdge, TetElement, "tet.TetEdge") + `
  v1 : int | this.v1.eid;
  v2 : int | this.v2.eid;
  l  : int | this.l !== undefined ? this.l.eid : -1;
}`;
nstructjs.register(TetEdge);

export class TetLoop extends TetElement {
  constructor() {
    super(TetTypes.LOOP);

    this.v = this.e = this.f = this.t = undefined;
    this.next = this.prev = undefined;

    this.radial_next = this.radial_prev = undefined;
  }
}

TetLoop.STRUCT = nstructjs.inherit(TetLoop, TetElement, "tet.TetLoop") + `
  v    : int | this.v.eid;
  next : int | this.next.eid;
  prev : int | this.prev.eid;
}`;
nstructjs.register(TetLoop);

//always a triangle
export class TetFace extends TetElement {
  constructor() {
    super(TetTypes.FACE);

    this.t = undefined; //tet
    this.l = undefined; //start loop

    this.loops = new Array(3);
  }
}

TetFace.STRUCT = nstructjs.inherit(TetFace, TetElement, "tet.TetFace") + `
  loops : iter(e, int) | e.eid;
}`;

nstructjs.register(TetFace);

export class TetTet extends TetElement {
  constructor() {
    super(TetTypes.TET);

    this.faces = new Array(4);
    this.edges = [];
    this.verts = new Array(4);
  }

  _regenEdges() {
    this.edges.length = 0;
    let flag = TetFlags.MAKEFACE_TEMP;

    for (let f of this.faces) {
      for (let l of f.loops) {
        l.e.flag &= ~flag;
      }
    }

    for (let f of this.faces) {
      for (let l of f.loops) {
        if (!(l.e.flag & flag)) {
          l.e.flag |= flag;
          this. s.push(l.e);
        }
      }
    }

    return this;
  }
}

TetTet.STRUCT = nstructjs.inherit(TetTet, TetElement, "tet.TetTet") + `
  faces : iter(f, int) | f.eid;
  verts : iter(v, int) | v.eid;
}`;
nstructjs.register(TetTet);
