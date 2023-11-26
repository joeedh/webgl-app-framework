import {Edge} from "./mesh_types.js";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {
  DEBUG_BAD_LOOPS, DEBUG_FREE_STACKS, getArrayTemp, MeshError, MeshFlags, MeshTypes, STORE_DELAY_CACHE_INDEX,
  WITH_EIDMAP_MAP, EmptyCDArray
} from "./mesh_base.js";
import * as util from "../util/util.js";

import {CDFlags, CustomData, CustomDataElem} from "./customdata";
import {Vertex, Loop, Face, Handle} from './mesh_types.js';

const sel_iter_stack = new Array(64);

window._sel_iter_stack = sel_iter_stack;

let typemap = {
  [MeshTypes.VERTEX]: Vertex,
  [MeshTypes.EDGE]  : Edge,
  [MeshTypes.HANDLE]: Handle,
  [MeshTypes.LOOP]  : Loop,
  [MeshTypes.FACE]  : Face
};

export class SelectedEditableIter {
  constructor(set) {
    this.ret = {done: true, value: undefined};
    this.listiter = undefined;
    this.done = true;
    this.set = set;
  }

  reset(set) {
    this.listiter = set[Symbol.iterator]();
    this.done = false;
    this.ret.done = false;
    this.set = set;

    return this;
  }

  [Symbol.iterator]() {
    this.reset(this.set);

    return this;
  }

  next() {
    if (this.done) {
      this.ret.done = true;
      this.ret.value = undefined;
      return this.ret;
    }

    let item = this.listiter.next();

    while (!item.done && (item.value.flag & (MeshFlags.HIDE))) {
      item = this.listiter.next();
    }

    if (item.done) {
      this.finish();
    }

    return item;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      this.set.eiterstack.cur--;
      this.set.eiterstack.cur = Math.max(this.set.eiterstack.cur, 0);
      this.ret.done = true;
      this.ret.value = undefined;
      this.listiter = undefined;
    }
  }

  return() {
    this.finish();
    return this.ret;
  }
}

export class SelectedEditableStack extends Array {
  constructor(set) {
    super();

    this.length = 32;
    this.cur = 0;
    this.set = set;

    for (let i = 0; i < this.length; i++) {
      this[i] = new SelectedEditableIter(set);
    }
  }

  [Symbol.iterator]() {
    return this.next().reset(this.set);
  }

  next() {
    return this[this.cur++];
  }
}

export class SelectionSet extends util.set {
  constructor() {
    super();

    this.eiterstack = new SelectedEditableStack(this);
  }

  get editable() {
    return this.eiterstack;
  }

  get editable_old() {
    let this2 = this;

    return (function* () {
      for (let item of this2) {
        if (!(item.flag & MeshFlags.HIDE)) {
          yield item;
        }
      }
    })();
  }
}

export class ElementListIter {
  constructor(elist) {
    this.ret = {done: false, value: undefined};
    this.i = 0;
    this.elist = elist;
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
    let list = elist.list;

    while (this.i < list.length && list[this.i] === undefined) {
      this.i++;
    }

    if (this.i >= list.length) {
      ret.done = true;
      ret.value = undefined;

      elist.iterstack.cur--;
      return ret;
    } else {
      ret.value = list[this.i];
    }

    this.i++;

    return ret;
  }

  return() {
    if (!this.ret.done) {
      this.elist.iterstack.cur--;
      this.elist.iterstack.cur = Math.max(this.elist.iterstack.cur, 0);
      this.ret.done = true;
    }

    this.ret.value = undefined;

    return this.ret;
  }
}

export class ElementList {
  constructor(type, storeFreedElems=false) {
    this.list = [];

    this._update_req = undefined;

    this._totAdded = 0;
    this._totRemoved = 0;

    this.length = 0;
    this.size = 0;
    this.freelist = [];
    this.free_elems = new util.Queue(256);
    this.delayed_free_queue = [];

    if (!STORE_DELAY_CACHE_INDEX) {
      this.dqueue_idxmap = new Map();
    }

    this.storeFreedElems = storeFreedElems;

    this.customData = new CustomData();

    this.local_eidMap = new Map();
    this.idxmap = new Map();

    this.iterstack = new Array(64);
    for (let i = 0; i < this.iterstack.length; i++) {
      this.iterstack[i] = new ElementListIter(this);
    }
    this.iterstack.cur = 0;

    this.type = type;
    this.selected = new SelectionSet();
    this.on_selected = undefined;
    this.highlight = this.active = undefined;
  }

  _getDebugTot() {
    return {
      added : this._totAdded,
      removed : this._totRemoved
    }
  }

  /*sanity alias to this.customData*/
  get cd() {
    return this.customData;
  }

  set cd(v) {
    this.customData = v;
  }

  [Symbol.iterator]() {
    //console.log(this.type, "iterator read");

    if (this.iterstack.cur >= this.iterstack.length) {
      console.warn("deep nesting of ElementListIter detected; growing cache stack by one", this.iterstack.cur);
      this.iterstack.push(new ElementListIter(this));
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

    this.list[i2] = a;
    this.list[i1] = b;
    return this;
  }

  reverse() {
    let len = this.list.length;

    for (let i = 0; i < (len>>1); i++) {
      let i2 = len - i - 1;

      let t = this.list[i];
      this.list[i] = this.list[i2];
      this.list[i2] = t;
    }

    return this;
  }

  get editable() {
    let this2 = this;

    return (function* () {
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
    for (let item of this) {
      arr.push(item);
    }

    var sel = [];
    for (var v of this.selected) {
      sel.push(v.eid);
    }

    return {
      type     : this.type,
      array    : arr,
      selected : sel,
      active   : this.active !== undefined ? this.active.eid : -1,
      highlight: this.highlight !== undefined ? this.highlight.eid : -1
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

  setEID(e, neweid) {
    let sel = this.selected.has(e); //e.flag & MeshFlags.SELECT;

    if (sel) {
      this.selected.remove(e);
    }

    this.local_eidMap.delete(e.eid);
    let i = this.idxmap.get(e.eid);

    e.eid = neweid;
    e._old_eid = neweid;

    this.local_eidMap.set(neweid, e);
    this.idxmap.set(neweid, i);

    if (sel) {
      this.selected.add(e);
    }

    return this;
  }

  _push(e) {
    let i;

    /*
    if (e.eid in this.idxmap) {
      let e2 = this.idxmap.get(e.eid);

      if (e2 !== undefined && this.list[e2] === e) {
        console.warn("Attempted to add save face twice");
        return;
      }
    }//*/

    this._totAdded++;

    if (this.freelist.length > 0) {
      i = this.freelist.pop();
    } else {
      i = this.list.length;
      this.size++;
      this.list.push();
    }

    this.idxmap.set(e.eid, i);

    this.list[i] = e;
    this.length++;
  }

  push(e) {
    let e2 = this.local_eidMap.get(e.eid);

    if (e2) {
      if (e === e2) {
        throw new MeshError("element " + e.eid + " is already in list");
      } else {
        throw new MeshError("another element with eid " + e.eid + " is already in list");
      }
    }

    this._push(e);

    if (e.flag & MeshFlags.SELECT) {
      this.selected.add(e);
    }

    this.local_eidMap.set(e.eid, e);

    return this;
  }

  indexOf(e) {
    let idx = this.idxmap.get(e.eid);
    return idx !== undefined ? idx : -1;
  }

  _flagQueuedUpdate() {
    if (this._update_req !== undefined) {
      return;
    }

    this._update_req = true;

    window.setTimeout(() => {
      this._update_req = undefined;

      this._runDelayedFreeQueue();
    });
  }

  _remove(e, no_error=false) {
    let i = this.indexOf(e);

    this.local_eidMap.delete(e.eid);

    if (i >= 0) {
      this.idxmap.delete(e.eid);
      this.freelist.push(i);

      if (this.storeFreedElems) {
        e.eid = -1;

        this.free_elems.enqueue(e);

        //we delay call to e._free to
        //make mesh_log.js happy

        let index = this.delayed_free_queue.length;

        if (STORE_DELAY_CACHE_INDEX) {
          e._didx = index;
        } else {
          this.dqueue_idxmap.set(e, index);
        }

        this.delayed_free_queue.push(e);
        this._flagQueuedUpdate();

        if (DEBUG_BAD_LOOPS && Math.random() > 0.5) {
          this._checkFreeElems();
        }

        //e._free();
      } else {
        e.eid = -1;
      }

      this.list[i] = undefined;
      this.length--;
      this._totRemoved++;
    } else {
      if (no_error) {
        console.error("mesh element " + e.eid + " is not in array");
        e.eid = -1;
      } else {
        throw new Error("element " + e.eid + " is not in array");
      }
    }
  }

  forEach(cb, thisvar) {
    for (let item of this) {
      if (thisvar) {
        cb.call(thisvar, item);
      } else {
        cb(item);
      }
    }
  }

  compact() {
    this.clearFreeElems();

    let list = [];
    for (let item of this) {
      list.push(item);
    }

    this.length = this.size = 0;
    this.freelist.length = 0;
    this.list.length = 0;
    this.idxmap = new Map();

    for (let item of list) {
      this._push(item);
    }

    this.selected.clear();

    for (let item of this) {
      if (item.flag & MeshFlags.SELECT) {
        this.selected.add(item);
      }
    }

    return this;
  }

  remove(elem, no_error=false) {
    if (elem.eid < 0) {
      if (no_error) {
        console.error("elem was already deleted");
        return;
      } else {
        throw new Error("elem was already deleted");
      }
    }

    if (this.selected.has(elem)) {
      this.selected.remove(elem);
    }

    if (this.active === elem)
      this.active = undefined;
    if (this.highlight === elem)
      this.highlight = undefined;

    this._remove(elem, no_error);

    return this;
  }


  selectNone() {
    for (let elem of this.selected) {
      elem.flag &= ~MeshFlags.SELECT;
      elem.flag |= MeshFlags.UPDATE;
    }

    this.selected.clear();

    return this;
  }

  selectAll() {
    for (var e of this) {
      if (!(e.flag & MeshFlags.SELECT)) {
        e.flag |= MeshFlags.UPDATE;
      }

      this.setSelect(e, true);
    }
  }

  _fixcd(dest) {
    if (dest.customData.length !== this.customData.flatlist.length) {
      console.error("customdata error! trying to fix. . .", dest.eid);

      let old = dest.customData.concat([]);

      dest.customData.length = 0;
      this.customData.initElement(dest);

      for (let data1 of old) {
        for (let i = 0; i < dest.customData.length; i++) {
          let data2 = dest.customData[i];

          if (data2.constructor === data1.constructor) {
            dest.customData[i] = data2;
            break;
          }
        }
      }
    }
  }

  customDataInterp(dest, sources, ws) {
    let sources2 = getArrayTemp(sources.length);

    this._fixcd(dest);

    for (let elem of sources) {
      if (elem === undefined) {
        console.error(".customDataInterp error: an element was undefined", sources);
        return;
      }
      this._fixcd(elem);
    }

    const flatlist = this.customData.flatlist;
    const nointerp = CDFlags.NO_INTERP;
    const copyonly = CDFlags.NO_INTERP_COPY_ONLY;

    for (let i = 0; i < dest.customData.length; i++) {
      let cd = dest.customData[i];

      const flag = flatlist[i].flag;

      if (flag & copyonly) {
        if (sources.length > 0) {
          sources[0].customData[i].copyTo(dest.customData[i]);
        }

        continue;
      }

      if (flag & nointerp) {
        continue;
      }

      let j = 0;
      for (let e2 of sources) {
        sources2[j++] = e2.customData[i];
      }

      cd.interp(cd, sources2, ws);
    }

    for (let i=0; i<sources2.length; i++) {
      sources2[i] = undefined;
    }
  }

  get first() {
    for (let item of this) {
      return item;
    }
  }

  get last() {
    let list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      let ret = list[i];

      if (ret) {
        return ret;
      }
    }
  }

  setSelect(e, state) {
    if (e.type !== this.type) {
      throw new Error("wrong type " + e.type + " expected " + this.type);
    }

    if (!!state !== !!(e.flag & MeshFlags.SELECT)) {
      e.flag |= MeshFlags.UPDATE;
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
    this.clearCustomData();

    let i = 0, cdmap = {};
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

      for (let i = 0; i < e.customData.length; i++) {
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

  _get_compact() {
    let ret = [];

    for (let item of this) {
      ret.push(item);
    }

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);

    let act = this.active;
    let high = this.highlight;

    this.highlight = undefined;
    this.active = undefined;

    let i = 0;

    //old file?
    if (this.items !== undefined) {
      this.list = this.items;
      delete this.items;
    }

    this.length = 0;

    for (let item of this.list) {
      this.idxmap.set(item.eid, i);
      this.local_eidMap.set(item.eid, item);

      if (item.eid === act) {
        this.active = item;
      }

      if (item.eid === high) {
        this.highlight = item;
      }

      i++;
      this.length++;
    }

    this.selected.clear();

    for (let item of this) {
      if (item.flag & MeshFlags.SELECT) {
        this.selected.add(item);
      }
    }
  }

  removeCustomDataLayer(layer_i) {
    this.clearFreeElems();

    if (layer_i < 0 || layer_i === undefined) {
      throw new Error("bad call to removeCustomDataLayer");
    }

    let layer = this.customData.flatlist[layer_i];

    let cls = CustomDataElem.getTypeClass(layer.typeName);
    let ret = this.customData.remLayer(layer);

    let haveOnRemoveLayer = false;

    for (let layer of this.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);

      if (new cls().onRemoveLayer) {
        haveOnRemoveLayer = true;
      }
    }

    for (let e of this) {
      let i = layer_i;
      let cd = e.customData;

      while (i < cd.length - 1) {
        cd[i] = cd[i + 1];
        i++;
      }

      cd[i] = undefined;
      cd.length--;

      if (haveOnRemoveLayer) {
        for (let data of cd) {
          if (data.onRemoveLayer) {
            data.onRemoveLayer(cls, layer_i);
          }
        }
      }
    }

    return ret;
  }

  clearCustomData() {
    this.clearFreeElems();

    for (let e of this) {
      e.customData = [];
      //CD e.cd = e.customData;
    }

    this.customData._clear();
  }

  prealloc(count) {
    let cls = typemap[this.type];

    for (let i=0; i<count; i++) {
      let elem = new cls();

      this.customData.initElement(elem);
      elem.eid = -1;

      if (STORE_DELAY_CACHE_INDEX) {
        elem._didx = -1;
      }

      this.free_elems.enqueue(elem);
    }

    return this;
  }

  _runDelayedFreeQueue() {
    if (this.delayed_free_queue === 0) {
      return;
    }

    for (let elem of this.delayed_free_queue) {
      if (elem === undefined) {
        continue;
      }

      if (elem.eid >= 0) {
        console.error("Element in delayed_free_queue is apparently not freed");
      }

      elem._free();
      elem.flag = 0;
      elem.eid = -1;
      elem._didx = -1;
    }

    if (!STORE_DELAY_CACHE_INDEX) {
      this.dqueue_idxmap = new Map();
    }

    this.delayed_free_queue.length = 0;
  }

  _checkFreeElems() {
    let visit = new WeakSet();
    let i = 0;

    for (let elem of this.free_elems.queue) {
      if (!elem) {
        continue;
      }

      if (elem.eid >= 0) {
        console.warn("Element was somehow reused but is still in free list", i, elem);
      }

      if (visit.has(elem)) {
        console.warn("Element in free list twice", i, elem);
      }

      visit.add(elem);

      i++;
    }
  }

  alloc(cls) {
    //add some pad so mesh log code works properly,
    //which keeps freed elements around briefly (but not instananeously)
    if (this.free_elems.length > 512) {
      let ret = this.free_elems.dequeue();

      if (ret.eid >= 0) {
        throw new Error("elem was somehow unfreed already");
      }

      if (DEBUG_FREE_STACKS) {
        try {
          throw new Error();
        } catch (error) {
          ret._allocStack = error.stack;
        }
      }

      let ok;

      if (STORE_DELAY_CACHE_INDEX) {
        ok = ret._didx >= 0;
      } else {
        ok = ret.flag === -2;
      }

      if (ok) {
        //element is inside of delayed_free_queue?
        let index;

        if (STORE_DELAY_CACHE_INDEX) {
          index = ret._didx;
        } else {
          index = this.dqueue_idxmap.get(ret);
        }

        if (index === undefined || this.delayed_free_queue[index] !== ret) {
          console.warn(ret, index);
          throw new MeshError("Mesh corruption error");
        }

        this.delayed_free_queue[index] = undefined;

        ret._free();
      }

      if (STORE_DELAY_CACHE_INDEX) {
        ret._didx = -1;
      }

      ret.flag = 0;
      ret.eid = -1;
      ret.index = -1;

      for (let i=0; i<ret.customData.length; i++) {
        ret.customData[i].clear();
      }

      return ret;
    }

    let ret = new cls();
    this.customData.initElement(ret);

    ret.eid = -1;
    ret.flag = 0;
    ret.index = -1;

    if (STORE_DELAY_CACHE_INDEX) {
      ret._didx = -1;
    }

    return ret;
  }

  clearFreeElems() {
    this.free_elems.clear();
    return this;
  }

  addCustomDataLayer(typecls_or_name, name) {
    this.clearFreeElems();

    let typecls = typecls_or_name;
    if (typeof typecls === "string") {
      typecls = CustomDataElem.getTypeClass(typecls);
    }

    let ret = this.customData.addLayer(typecls, name);

    let haveOnNewLayer = false;

    for (let layer of this.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);

      if (new cls().onNewLayer) {
        haveOnNewLayer = true;
      }
    }

    for (let item of this) {
      if (item.customData === EmptyCDArray) {
        item.customData = [];
      }

      item.customData.push(new typecls());
    }

    for (let item of this) {
      if (haveOnNewLayer) {
        for (let cd of item.customData) {
          if (cd.onNewLayer) {
            cd.onNewLayer(typecls, item.customData.length - 1);
          }
        }
      }
    }

    return ret;
  }

  fixCustomData() {
    let cd = this.customData;

    for (let e of this) {
      if (e.customData.length === cd.flatlist.length) {
        continue;
      }

      util.console.warn("Element was missing customdata", e.constructor.name, e.eid, e.customData, cd.flatlist.length);

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

  stripTempLayers(saveState = false) {
    this.clearFreeElems();

    let state = {
      cdata: this.customData.copy(),
      elems: []
    };

    let cdata = this.customData;
    let layers = cdata.flatlist;
    let map = new Array(layers.length);
    let j = 0;

    for (let i = 0; i < layers.length; i++) {
      let layer = layers[i];

      map[i] = !(layer.flag & CDFlags.TEMPORARY) ? j++ : undefined;
    }

    this.customData.stripTempLayers();

    for (let elem of this) {
      let customData = elem.customData;

      if (saveState) {
        state.elems.push(customData.slice(0, customData.length));
      }

      let j = 0;
      for (let i = 0; i < customData.length; i++) {
        if (map[i] === undefined) {
          continue;
        }

        customData[j++] = customData[i];
      }

      customData.length = j;
    }

    return state;
  }

  unstripTempLayers(state) {
    this.customData = state.customData;

    let i = 0;
    for (let elem of this) {
      elem.customData = state.elems[i++];
    }
  }
};

ElementList.STRUCT = `
mesh.ElementList {
  list        : iter(abstract(Object)) | this._get_compact();
  active      : int | this.active !== undefined ? this.active.eid : -1;
  highlight   : int | this.highlight !== undefined ? this.highlight.eid : -1;
  type        : int;
  customData  : mesh.CustomData; 
}
`;
nstructjs.register(ElementList);
