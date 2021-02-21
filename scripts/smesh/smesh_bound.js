import {CustomDataElem} from '../mesh/customdata.js';

import {
  SMeshFlags, SMeshTypes, MAX_VERT_EDGES, MAX_FACE_VERTS,
  SMeshRecalc, SMeshAttrFlags
} from './smesh_base.js';

import {BoundVector3} from './smesh_attributes.js';

export class BoundElem {
  constructor(smesh, index, bmesh) {
    this.smesh = smesh;
    this.i = index;
    this.bmesh = bmesh;
    this.list = undefined;
  }

  get eid() {
    return this.list.eid[this.i];
  }

  set eid(eid) {
    this.list.eid[this.i] = eid;
  }

  get flag() {
    return this.list.flag[this.i];
  }

  set flag(f) {
    this.list.flag[this.i] = f;
  }
}

//implements BoundElem
export class BoundVertex extends BoundVector3 {
  constructor(smesh, vi, bmesh) {
    super(smesh.verts.co[vi].buffer, vi*3*4);

    this.vi = vi;
    this.i = vi;

    this.type = SMeshTypes.VERTEX;

    this.no = smesh.verts.no[vi];
    this.customData = [];
    this.smesh = smesh;
    this.list = smesh.verts;
    this.bmesh = bmesh;
    this.blist = undefined;
  }

  get eid() {
    return this.list.eid[this.i];
  }

  set eid(eid) {
    this.list.eid[this.i] = eid;
  }

  get flag() {
    return this.list.flag[this.i];
  }

  set flag(f) {
    this.list.flag[this.i] = f;
  }

  get edges() {
    let this2 = this;

    return (function*() {
      let map = this2.bmesh.edges.boundMap;

      for (let ei of this2.list.edges(this2.vi)) {
        yield map[ei];
      }
    })();
  }

  get neighbors() {
    //return this.list.neighbors(this.vi);
  }

  get valence() {
    return this.list.valence[this.vi];
  }
}

export class BoundEdge extends BoundElem {
  constructor(smesh, ei, bmesh) {
    super(smesh, ei, bmesh);

    this.list = smesh.edges;
    this.type = SMeshTypes.EDGE;
  }

  get v1() {
    let v1 = this.list.v1[this.i];
    return this.bmesh.verts.boundMap[v1];
  }

  get v2() {
    let v2 = this.list.v2[this.i];
    return this.bmesh.verts.boundMap[v2];
  }
}

export class BoundElementSet extends Set {
  remove(elem) {
    return this.delete(elem);
  }
}

export class BoundElementList {
  constructor(type) {
    this.list = [];
    this.length = 0;
    this.idxMap = new Map();
    this.type = type;
    this.freelist = [];

    this.boundMap = [];

    this.selected = new BoundElementSet();
  }

  push(elem) {
    let i;

    if (this.idxMap.has(elem.eid)) {
      throw new Error("element " + elem.eid + " is already in array");
    }

    if (elem.i >= this.boundMap.length) {
      this.boundMap.length = elem.i+1;
    }

    this.boundMap[elem.i] = elem;

    elem.blist = this;

    if (this.freelist.length > 0) {
      i = this.freelist.pop();
    } else {
      i = this.list.length;
      this.list.push();
    }

    this.list[i] = elem;
    this.length++;
    this.idxMap.set(elem.eid, i);

    if (elem.flag & SMeshFlags.SELECT) {
      this.selected.add(elem);
    }
  }

  setSelect(elem, state) {
    if (state) {
      elem.flag |= SMeshFlags.SELECT;
      this.selected.add(elem);
    } else {
      elem.flag &= ~SMeshFlags.SELECT;
      this.selected.remove(elem);
    }
  }

  remove(elem) {
    let i = this.idxMap.get(elem.eid);

    if (i === undefined) {
      throw new Error("element " + elem.eid + " is not in array");
    }

    this.selected.remove(elem);

    this.idxMap.remove(elem.eid);
    this.list[i] = undefined;
    this.length--;
  }

  [Symbol.iterator]() {
    let this2 = this;
    let list = this.list;

    return (function* () {
      for (let i=0; i<list.length; i++) {
        let elem = list[i];

        if (elem) {
          yield elem;
        }
      }
    })();
  }
}

export class BoundMesh {
  constructor() {
    this.elists = {};

    this.initElists();

    this._update_key = "";
    this.smesh = undefined;
  }

  calcUpdateKey(smesh) {
    let key = "";

    for (let list of smesh.elists) {
      key += list.type + ":";
      key += list._size + ":";

      for (let attr of list.attrs) {
        key += attr.name + ":";
        key += attr.typeName + ":";
      }
    }

    return key;
  }

  update(smesh) {
    let key = this.calcUpdateKey(smesh);

    if (key === this._update_key) {
      return this;
    }

    console.log("rebinding smesh", smesh, this);
    this.bind(smesh);

    return this;
  }

  bind(smesh) {
    this.smesh = smesh;

    //clear any existing element lists
    this.elists = {};
    this.initElists();

    for (let vi of smesh.verts) {
      this.verts.push(new BoundVertex(smesh, vi, this));
    }

    for (let ei of smesh.edges) {
      this.edges.push(new BoundEdge(smesh, ei, this));
    }

    this._update_key = this.calcUpdateKey(smesh);
  }

  getElist(type) {
    if (type in this.elists) {
      return this.elists[type];
    }

    this.elists[type] = new BoundElementList(type);
    return this.elists[type];
  }

  initElists() {
    this.verts = this.getElist(SMeshTypes.VERTEX);
    this.edges = this.getElist(SMeshTypes.EDGE);
    this.loops = this.getElist(SMeshTypes.LOOP);
    this.faces = this.getElist(SMeshTypes.FACE);
  }
}
