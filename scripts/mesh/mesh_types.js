import {MeshError, MeshFlags, MeshTypes} from "./mesh_base.js";
import {Vector3} from "../util/vectormath.js";
import * as util from "../util/util.js";
import {UVLayerElem} from "./mesh_customdata.js";
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class Element {
  constructor(type) {
    this.type = type;
    this.flag = this.index = 0;
    this.eid = -1;
    this.customData = [];
  }

  valueOf() {
    return this.eid;
  }

  [Symbol.keystr]() {
    return this.eid;
  }

  toJSON() {
    return {
      type  : this.type,
      flag  : this.flag,
      index : this.index,
      eid   : this.eid
    };
  }

  loadJSON(obj) {
    this.type = obj.type;
    this.flag = obj.flag;
    this.index = obj.index;
    this.eid = obj.eid;

    return this;
  }
}

Element.STRUCT = `
mesh.Element {
  type        : int;
  flag        : int;
  index       : int;
  eid         : int;
  customData  : array(abstract(mesh.CustomDataElem));
}
`;
nstructjs.manager.add_class(Element);

/*
class VertFaceIter {
}
let _vficache = new Array(256);
for (let i=0; i<_vficache.length; i++) {

}//*/

//has Vector3 mixin
export class Vertex extends Element {
  constructor(co) {
    super(MeshTypes.VERTEX);
    this.initVector3();

    if (co !== undefined) {
      this.load(co);
    }

    this.no = new Vector3();
    this.no[2] = 1.0;
    this.edges = [];
  }

  toJSON() {
    var edges = [];
    for (var e of this.edges) {
      edges.push(e.eid);
    }

    return util.merge(super.toJSON(), {
      0 : this[0],
      1 : this[1],
      2 : this[2],
      edges : edges,
      no : this.no
    });
  }

  get faces() {
    let this2 = this;

    return (function*() {
      let flag = MeshFlags.ITER_TEMP2a;

      for (let state=0; state<4; state++) {
        for (let e of this2.edges) {
          let l = e.l;

          if (l === undefined)
            continue;

          //do dumb trickery to avoid returning the same face twice

          let _i = 0;

          do {
            if (_i++ > 10000) {
              console.warn("infinite loop detected");
              break;
            }

            switch (state) {
              case 0:
                if (l.f.flag & flag) {
                  flag = flag << 1;
                }
                break;
              case 1:
                l.f.flag = l.f.flag & ~flag;
                break;
              case 2:
                if (!(l.f.flag & flag)) {
                  l.f.flag |= flag;
                  yield l.f;
                }
                break;
              case 3:
                l.f.flag &= ~flag;
                break;
            }

            l = l.radial_next;
          } while (l != e.l);
        }

        if (state == 0 && flag > MeshFlags.ITER_TEMP2c) {
          //*sigh* just used the first one
          flag = MeshFlags.ITER_TEMP2a;
        }
      }
    })();
  }

  otherEdge(e) {
    if (this.edges.length != 2) {
      throw new MeshError("otherEdge only works on 2-valence vertices");
    }

    if (e === this.edges[0])
      return this.edges[1];
    else if (e === this.edges[1])
      return this.edges[0];
  }

  loadSTRUCT(reader) {
    reader(this);

    this.load(this.co);
    delete this.co;
  }
}
util.mixin(Vertex, Vector3);

Vertex.STRUCT = STRUCT.inherit(Vertex, Element, 'mesh.Vertex') + `
  0       : float;
  1       : float;
  2       : float;
  no      : vec3 | obj.no;
  edges   : array(e, int) | (e.eid);
}
`;
nstructjs.manager.add_class(Vertex);


var _evaluate_vs = util.cachering.fromConstructor(Vector3, 64);

export class Edge extends Element {
  constructor() {
    super(MeshTypes.EDGE);

    this.l = undefined;
    this.v1 = this.v2 = undefined;
  }

  get loops() {
    let this2 = this;

    return (function*() {
      let l = this2.l;
      let i = 0;

      do {
        if (i++ > 10000) {
          console.warn("infinite loop detected in Edge.prototype.[get loops]()");
          break;
        }

        yield l;

        l = l.radial_next;
      } while (l !== this2.l);
    })();
  }

  /**
   be careful of this iterator, it sets ITER_TEMP1 in face flags,
   so it won't work with nested loops on the same element
   */
  get faces() {
    let this2 = this;

    return (function*() {
      let l = this2.l;
      let i = 0;

      do {
        if (i++ > 10000) {
          console.warn("infinite loop detected in Edge.prototype.[get faces]()");
        }

        l.f.flag &= ~MeshFlags.ITER_TEMP1;
        l = l.radial_next;
      } while (l !== this2.l);

      do {
        if (i++ > 10000) {
          console.warn("infinite loop detected in Edge.prototype.[get faces]()");
          break;
        }

        if (!(l.f.flag & MeshFlags.ITER_TEMP1)) {
          yield l.f;
        }

        l.f.flag |= MeshFlags.ITER_TEMP1;

        l = l.radial_next;
      } while (l !== this2.l);
    })();
  }

  evaluate(t) {
    return _evaluate_vs.next().load(this.v1).interp(this.v2, t);
  }

  derivative(t) {
    var df = 0.0001;
    var a = this.evaluate(t-df);
    var b = this.evaluate(t+df);

    return b.sub(a).mulScalar(0.5/df);
  }

  derivative2(t) {
    var df = 0.0001;
    var a = this.derivative(t-df);
    var b = this.derivative(t+df);

    return b.sub(a).mulScalar(0.5/df);
  }

  curvature(t) {
    let dv1 = this.derivative(t);
    let dv2 = this.derivative2(t);

    let ret = (dv1[0]*dv2[1] - dv1[1]*dv2[0]) / Math.pow(dv1.dot(dv1), 3.0/2.0);

    return ret;
  }

  has(v) {
    return v === this.v1 || v === this.v2;
  }

  otherVertex(v) {
    if (v === undefined)
      throw new MeshError("v cannot be undefined in Edge.prototype.otherVertex()");

    if (v === this.v1)
      return this.v2;
    if (v === this.v2)
      return this.v1;

    throw new MeshError("vertex " + v.eid + " not in edge");
  }

  loadSTRUCT(reader) {
    reader(this);

    this.flag &= MeshFlags.DRAW_DEBUG;
  }
}
Edge.STRUCT = STRUCT.inherit(Edge, Element, 'mesh.Edge') + `
  l      : int | obj.l !== undefined ? obj.l.eid : -1;
  v1     : int | obj.v1.eid;
  v2     : int | obj.v2.eid;
}
`;
nstructjs.manager.add_class(Edge);

let calc_normal_temps = util.cachering.fromConstructor(Vector3, 32);

export class Loop extends Element {
  constructor() {
    super(MeshTypes.LOOP);

    this.radial_next = this.radial_prev = undefined;

    this.e = undefined;
    this.f = undefined;
    this.v = undefined;
    this.list = undefined;
  }
  /*
    get f() {
      return this._f;
    }

    set f(val) {
      console.warn("loop.f was set", val);
      this._f = val;
    }
  //*/

  get uv() {
    for (let layer of this.customData) {
      if (layer instanceof UVLayerElem)
        return layer.uv;
    }
  }
}
Loop.STRUCT = STRUCT.inherit(Loop, Element, "mesh.Loop") + `
  v           : int | obj.v.eid;
  e           : int | obj.e.eid;
  f           : int | obj.f.eid;
  radial_next : int | obj.radial_next.eid;
  radial_prev : int | obj.radial_prev.eid;
  next        : int | obj.next.eid;
  prev        : int | obj.prev.eid;
}
`;
nstructjs.manager.add_class(Loop);

class LoopIter {
  constructor() {
    this.list = undefined;
    this.l = undefined;
    this.done = false;
    this.first = undefined;
    this._i = 0;

    this.ret = {
      done  : true,
      value : undefined
    };

    this.onreturn = undefined;
  }

  init(list) {
    this.done = false;
    this.first = true;
    this.list = list;
    this.l = list.l;
    this._i = 0;

    return this;
  }

  next() {
    let ret = this.ret;
    let l = this.l;

    if (this._i++ > 10000) {
      ret.done = true;
      ret.value = undefined;

      console.warn("infinite loop detected in LoopIter");

      this.list.iterstack.cur--;
      this.done = true;

      return ret;
    }

    if (l === this.list.l && !this.first) {
      ret.done = true;
      ret.value = undefined;

      this.list.iterstack.cur--;
      this.done = true;
      return ret;
    }

    this.first = false;
    this.l = l.next;

    ret.done = false;
    ret.value = l;

    return ret;
  }

  return() {
    console.log("iterator return");

    if (!this.done) {
      this.done = true;
      this.list.iterstack.cur--;
    }

    this.ret.value = undefined;
    this.ret.done = true;

    return this.ret;
  }
}

export class LoopList extends Array {
  constructor() {
    super();

    this.flag = 0;
    this.l = undefined;

    this.iterstack = new Array(16);
    for (let i=0; i<this.iterstack.length; i++) {
      this.iterstack[i] = new LoopIter();
    }

    this.iterstack.cur = 0;
  }

  [Symbol.iterator]() {
    let stack = this.iterstack;

    stack.cur++;

    if (stack.cur < 0 || stack.cur >= stack.length) {
      let cur =  stack.cur;
      stack.cur = 0;
      throw new Error("iteration depth was too deep: " + cur);
    }

    return stack[stack.cur].init(this);
  }

  //used by STRUCT script
  get _loops() {
    return this;
  }
}

LoopList.STRUCT = `
mesh.LoopList {
  l : int | obj.l.eid;
}
`;
nstructjs.manager.add_class(LoopList);

export class Face extends Element {
  constructor() {
    super(MeshTypes.FACE);

    this.lists = [];

    this.flag |= MeshFlags.FLAT;

    this.no = new Vector3();
    this.cent = new Vector3();
  }

  get verts() {
    let this2 = this;
    return (function*() {
      for (let loop of this2.loops) {
        yield loop.v;
      }
    })();
  }

  get loops() {
    return this.lists[0];
  }

  get edges() {
    let this2 = this;
    return (function*() {
      for (let list of this2.lists) {
        for (let loop of list) {
          yield loop.e;
        }
      }
    })();
  }

  get uvs() {
    let this2 = this;
    return (function*() {
      for (let loop of this.loops) {
        yield loop.uv;
      }
    })();
  }

  calcNormal() {
    let t1 = calc_normal_temps.next(), t2 = calc_normal_temps.next();
    let t3 = calc_normal_temps.next(), sum = calc_normal_temps.next();

    sum.zero();

    this.calcCent();
    let c = this.cent;

    let _i = 0;
    let l = this.lists[0].l;
    do {
      let v1 = l.v, v2 = l.next.v;

      t1.load(v1).sub(c);
      t2.load(v2).sub(c);

      t1.cross(t2).normalize();
      sum.add(t1);

      if (_i++ > 100000) {
        console.warn("infinite loop detected");
        break;
      }
      l = l.next;
    } while (l !== this.lists[0].l);

    sum.normalize();
    this.no.load(sum);
    return this.no;
  }

  calcCent() {
    this.cent.zero();
    let tot = 0.0;

    for (let l of this.lists[0]) {
      this.cent.add(l.v);
      tot++;
    }

    this.cent.mulScalar(1.0 / tot);
    return this.cent;
  }
}
Face.STRUCT = STRUCT.inherit(Face, Element, "mesh.Face") + `
  lists : array(mesh.LoopList);
  cent  : vec3;
  no    : vec3;
}
`;
nstructjs.manager.add_class(Face);
