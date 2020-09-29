import {Edge} from "./mesh_types.js";
import {MeshError, MeshFlags, MeshTypes} from "./mesh_base.js";
import * as util from "../util/util.js";
import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {CustomData, CustomDataElem} from "./customdata.js";

export class SelectionSet extends util.set {
  constructor() {
    super();
  }

  get editable() {
    let this2 = this;

    return (function*() {
      for (let item of this2) {
        if (!(item.flag & MeshFlags.HIDE)) {
          yield item;
        }
      }
    })();
  }
}

let _arrcache = {};

function getArrayTemp(n) {
  if (n in _arrcache) {
    return _arrcache[n];
  }

  _arrcache[n] = new Array(n);
  return _arrcache[n];
}

export class ElementListIter {
  constructor() {
    this.ret = {done : false, value : undefined};
    this.i = 0;
    this.elist = undefined;
  }

  init(elist) {
    this.elist = elist;
    this.i = 0;
    this.ret.done = false;

    return this;
  }

  next() {
    let ret = this.ret;
    let elist = this.elist;

    while (this.i < elist.size && elist[this.i] === undefined) {
      this.i++;
    }

    if (this.i >= this.elist.size) {
      ret.done = true;
      ret.value = undefined;

      elist.iterstack.cur--;
      return ret;
    } else {
      ret.value = elist[this.i];
    }

    this.i++;

    return ret;
  }

  return() {
    if (!this.ret.done) {
      this.elist.iterstack.cur--;
    }
  }
}

export class ElementList {
  constructor(type) {
    this.length = 0;
    this.size = 0;
    this.freelist = [];

    this.customData = new CustomData();
    this.local_eidmap = {};

    this.iterstack = new Array(32);
    for (let i=0; i<this.iterstack.length; i++) {
      this.iterstack[i] = new ElementListIter();
    }
    this.iterstack.cur = 0;

    this.type = type;
    this.selected = new SelectionSet();
    this.on_selected = undefined;
    this.highlight = this.active = undefined;
  }

  [Symbol.iterator]() {
    if (this.iterstack.cur >= this.iterstack.length) {
      console.warn("deep nesting of ElementListIter detected; growing cache stack by one", this.iterstack.cur);
      this.iterstack.push(new ElementListIter());
    }

    return this.iterstack[this.iterstack.cur++].init(this);
  }

  filter(f) {
    let list = [];

    for (let item of this) {
      if (f(item))
        list.push(item);
    }

    return list;
  }

  map(f) {
    let list = new Array(this.length);
    let i = 0;

    for (let item of this) {
      list[i++] = f(item);
    }

    return list;
  }

  reduce(f, initial) {
    let i = 0;

    if (initial === undefined) {
      for (let item of this) {
        initial = item;
        break;
      }
    }

    for (let item of this) {
      initial = f(initial, item, i++, this);
    }

    return initial;
  }

  swap(a, b) {
    let i1 = this.indexOf(a);
    let i2 = this.indexOf(b);

    if (i1 < 0)
      throw new Error("element not in array " + a);
    if (i2 < 0)
      throw new Error("element not in array " + b);

    this[i2] = a;
    this[i1] = b;
    return this;
  }

  reverse() {
    for (let i=0; i<this.length>>1; i++) {
      let i2 = this.length - i - 1;

      let t = this[i];
      this[i] = this[i2];
      this[i2] = t;
    }

    return this;
  }

  get editable() {
    let this2 = this;

    return (function*() {
      for (let e of this2) {
        if (!(e.flag & MeshFlags.HIDE)) {
          yield e;
        }
      }
    })();
  }

  updateIndices() {
    let i = 0;

    for (let e of this) {
      e.index = i++;
    }
  }

  toJSON() {
    var arr = [];
    for (var i=0; i<this.length; i++) {
      arr.push(this[i]);
    }

    var sel = [];
    for (var v of this.selected) {
      sel.push(v.eid);
    }

    return {
      type      : this.type,
      array     : arr,
      selected  : sel,
      active    : this.active !== undefined ? this.active.eid : -1,
      highlight : this.highlight !== undefined ? this.highlight.eid : -1
    };
  }

  loadJSON(obj) {
    this.length = 0;
    this.selected = new SelectionSet();
    this.active = this.highlight = undefined;
    this.type = obj.type;

    for (var e of obj.array) {
      var e2 = undefined;

      switch (e.type) {
        case MeshTypes.VERTEX:
          e2 = new Vertex();
          break;
        case MeshTypes.EDGE:
          e2 = new Edge();
          break;
        default:
          console.log(e);
          throw new MeshError("bad element " + e);
      }

      e2.loadJSON(e);
      this._push(e2);

      if (e2.flag & MeshFlags.SELECT) {
        this.selected.add(e2);
      }

      if (e2.eid === obj.active) {
        this.active = e2;
      } else if (e2.eid === obj.highlight) {
        this.highlight = e2;
      }
    }
  }

  _push(e) {
    let i;

    if (this.freelist.length > 0) {
      i = this.freelist.pop();
    } else {
      i = this.size;
      this.size++;
    }

    this[i] = e;
    this.length++;
  }

  push(e) {
    if (e.eid in this.local_eidmap) {
      throw new Error("element " + e.eid + " is already in list");
    }
    this._push(e);

    if (e.flag & MeshFlags.SELECT) {
      this.selected.add(e);
    }

    this.local_eidmap[e.eid] = e;

    return this;
  }

  indexOf(e) {
    for (let i=0; i<this.size; i++) {
      if (this[i] === e) {
        return i;
      }
    }

    return -1;
  }

  _remove(e) {
    let i = this.indexOf(e);

    if (i >= 0) {
      this.freelist.push(i);
      this[i] = undefined;
      this.length--;
    } else {
      throw new Error("element " + e.eid + " is not in array");
    }
  }

  compact() {
    let list = [];
    for (let item of this) {
      list.push(item);
    }

    this.length = this.size = 0;

    for (let item of list) {
      this._push(item);
    }

    return this;
  }

  remove(v) {
    if (this.selected.has(v)) {
      this.selected.remove(v);
    }

    if (this.active === v)
      this.active = undefined;
    if (this.highlight === v)
      this.highlight = undefined;

    this._remove(v);

    delete this.local_eidmap[v.eid];
    return this;
  }

  selectNone() {
    for (var e of this) {
      this.setSelect(e, false);
    }
  }

  selectAll() {
    for (var e of this) {
      this.setSelect(e, true);
    }
  }

  customDataInterp(dest, sources, ws) {
    let sources2 = getArrayTemp(sources.length);

    for (let i=0; i<dest.customData.length; i++) {
      let cd = dest.customData[i];

      let j = 0;
      for (let e2 of sources) {
        sources2[j++] = e2.customData[i];
      }

      cd.interp(cd, sources2, ws);
    }
  }

  setSelect(e, state) {
    if (e.type != this.type) {
      throw new Error("wrong type " + e.type + " expected " + this.type);
    }
    if (state) {
      if (!this.selected.has(e)) {
        this.selected.add(e);
      }

      e.flag |= MeshFlags.SELECT;
    } else {
      e.flag &= ~MeshFlags.SELECT;

      if (this.selected.has(e)) {
        this.selected.remove(e, true);
      }
    }

    return this;
  }

  setHighlight(e) {
    this.highlight = e;
  }

  setActive(e) {
    this.active = e;
  }

  mergeCustomData(b) {
    let i=0, cdmap = {};
    for (let list of this.customData.flatlist) {
      cdmap[list[Symbol.keystr]()] = i;
      i++;
    }

    this.customData.merge(b.customData);

    let cdmap2 = {};

    let data = {};
    for (let e of this) {
      i = 0;

      for (let cd of e.customData) {
        data[i++] = cd;
      }

      e.customData.length = this.customData.flatlist.length;

      for (let i=0; i<e.customData.length; i++) {
        let list = this.customData.flatlist[i];

        let cd = cdmap[list[Symbol.keystr]()];

        if (cd !== undefined) {
          cdmap2[cd] = i;
          cd = data[cd];
        }

        if (!cd) {
          let cls = CustomDataElem.getTypeClass(this.customData.flatlist[i].typeName);

          cd = new cls();
        }

        e.customData[i] = cd;
      }
    }

    return cdmap2;
  }

  loadSTRUCT(reader) {
    reader(this);

    let act = this.active;
    let high = this.highlight;

    this.highlight = undefined;
    this.active = undefined;

    for (let item of this.items) {
      this._push(item)
      this.local_eidmap[item.eid] = item;

      if (item.eid === act) {
        this.active = item;
      }
      if (item.eid === high) {
        this.highlight = item;
      }
    }

    delete this.items;

    this.selected.clear();

    for (let item of this) {
      if (item.flag & MeshFlags.SELECT) {
        this.selected.add(item);
      }
    }
  }

  addCustomDataLayer(typecls, name) {
    let ret = this.customData.addLayer(typecls, name);

    for (let item of this) {
      item.customData.push(new typecls());
    }

    return ret;
  }

  fixCustomData() {
    let cd = this.customData;

    for (let e of this) {
      if (e.customData.length === cd.flatlist.length) {
        continue;
      }

      console.warn("Element was missing customdata", e, e.customData, cd.flatlist.length);

      for (let k in cd.layers) {
        let layerset = cd.layers[k];
        if (layerset.length === 0) {
          continue;
        }

        let count = 0;

        for (let cdl of e.customData) {
          if (cdl.typeName === layerset.typeName) {
            count++;
          }
        }

        let typecls = CustomDataElem.getTypeClass(layerset.typeName);

        if (!typecls) {
          console.warn("Missing customdata typeclass for " + layerset.typeName);
          continue;
        }

        for (let i = count; i < layerset.length; i++) {
          e.customData.push(new typecls());
        }
      }
    }
  }
};
ElementList.STRUCT = `
mesh.ElementList {
  items       : iter(abstract(mesh.Element)) | this;
  active      : int | this.active !== undefined ? this.active.eid : -1;
  highlight   : int | this.highlight !== undefined ? this.highlight.eid : -1;
  type        : int;
  customData  : mesh.CustomData; 
}
`;
nstructjs.register(ElementList);
