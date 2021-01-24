import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';

import {TetTypes, TetFlags, TetRecalcFlags} from './tetgen_base.js';
import {CustomData, CustomDataElem} from '../mesh/customdata.js';
import {getArrayTemp} from '../mesh/mesh_base.js';

export class TetSelectSet extends Set {
  constructor() {
    super();

    this.active = undefined;
    this.highlight = undefined;
  }

  get editable() {
    let this2 = this;

    return (function*() {
      for (let elem of this) {
        if (!(elem.flag & TetFlags.HIDE)) {
          yield elem;
        }
      }
    })();
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}
TetSelectSet.STRUCT = `
tet.TetSelectSet {
  active     : int | this.active ? this.active.eid : -1;
  highlight  : int | this.highlight ? this.highlight.eid : -1
  _list      : iter(e, int) | e.eid;
}
`
nstructjs.register(TetSelectSet);

let elemiters = new Array(512);
elemiters.cur = 0;

export class TetElementIter {
  constructor() {
    this.list = undefined;
    this.ret = {done : true, value : undefined};
    this.done = true;
    this.i = 0;
  }

  reset(list) {
    this.list = list;
    this.i = 0;
    this.ret.done = false;
    this.ret.value = undefined;
    this.done = false;

    return this;
  }

  finish() {
    if (!this.done) {
      elemiters.cur--;
      this.done = true;
      this.ret.done = true;
      this.list = undefined;
    }

    return this.ret;
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    let i = this.i, list = this.list.list;

    while (i < list.length && list[i] === undefined) {
      i++;
    }

    if (i >= list.length) {
      return this.finish();
    }

    let ret = this.ret;
    ret.done = false;
    ret.value = list[i];

    return ret;
  }

  return() {
    return this.finish();
  }
}

for (let i=0; i<elemiters.length; i++) {
  elemiters[i] = new TetElementIter();
}

export class TetElementList {
  constructor(type) {
    this.type = type;
    this.list = [];
    this.freelist = [];
    this.selected = new TetSelectSet();
    this.customData = new CustomData();
    this.length = 0;

    this.local_eidmap = {};
    this.idxmap = {};
  }

  [Symbol.iterator]() {
    return elemiters[elemiters.cur++].reset(this);
  }

  push(elem) {
    if (elem.eid < 0) {
      throw new Error("tried to add element with eid less then zero");
    }

    if (elem.eid in this.local_eidmap) {
      throw new Error("element already in list");
    }

    let i;

    if (this.freelist.length > 0) {
      i = this.freelist.pop();
    } else {
      i = this.list.length;
      this.list.length++;
    }

    this.list[i] = elem;
    this.local_eidmap[elem.eid] = elem;
    this.idxmap[elem.eid] = i;

    this.length++;

    return this;
  }

  initElem(elem) {
    elem.customData.length = 0;

    for (let layer of this.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      elem.customData.push(new cls());
    }
  }

  addCustomDataLayer(typecls_or_typename, name) {
    if (typeof typecls_or_typename === "string") {
      typecls_or_typename = CustomDataElem.getTypeClass(typecls_or_typename);
    }

    let layer = this.customData.addLayer(typecls_or_typename, name);

    for (let elem of this) {
      elem.customData.push(new typecls_or_typename());
    }

    return layer;
  }

  remCustomDataLayer(cd_idx) {
    this.customData.remLayer(this.customData.flatlist[cd_idx]);

    for (let elem of this) {
      let i = cd_idx;

      while (i < elem.customData.length-1) {
        elem.customData[i] = elem.customData[i+1];
        i++;
      }

      elem.customData.length--;
    }
  }

  customDataInterp(target, elems, ws) {
    let datas = getArrayTemp(elems.length);

    for (let ci=0; ci<target.customData.length; ci++) {
      let cd = target.customData[ci];

      let i = 0;
      for (let target of elems) {
        datas[i++] = target.customData[ci];
      }

      cd.interp(cd, datas, ws);
    }

    for (let i=0; i<datas.length; i++) {
      datas[i] = undefined;
    }

    return this;
  }

  remove(elem) {
    if (!(elem.eid in this.local_eidmap)) {
      throw new Error("element not in list");
    }

    let idx = this.idxmap[elem.eid];
    delete this.idxmap[elem.eid];

    this.list[idx] = undefined;
    this.length--;

    return this;
  }

  compact() {
    let list = this.list;
    this.freelist.length = 0;
    let idxmap = this.idxmap = {};

    let ei = 0;
    for (let i=0; i<list.length; i++) {
      let elem = list[i];

      if (elem) {
        list[ei] = elem;
        idxmap[elem.eid] = ei;
        ei++;
      }
    }

    list.length = ei;

    return this;
  }

  _save() {
    let ret = [];
    for (let item of this) {
      ret.push(item);
    }

    return ret;
  }
}

TetElementList.STRUCT = `
tet.TetElementList {
  type          : int;
  list          : array(abstract(tet.TetElement)) | this._save();
  selected      : tet.TetSelectSet;
  customData    : mesh.CustomData;
}
`;
nstructjs.register(TetElementList);
