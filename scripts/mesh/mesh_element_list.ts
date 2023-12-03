import {Edge, Element, MeshIterStack} from "./mesh_types";
import {nstructjs, util} from '../path.ux/scripts/pathux.js';
import {
  DEBUG_BAD_LOOPS, getArrayTemp, MeshError, MeshFlags, MeshTypes, STORE_DELAY_CACHE_INDEX,
  WITH_EIDMAP_MAP, EmptyCDArray, CDElemArray
} from "./mesh_base";

import {CDFlags, CustomData, CustomDataElem, CustomDataLayer, ICustomDataElemConstructor} from "./customdata";
import {Vertex, Loop, Face, Handle} from './mesh_types.js';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";

const sel_iter_stack = new Array(64);

let typemap = {
  [MeshTypes.VERTEX]: Vertex,
  [MeshTypes.EDGE]: Edge,
  [MeshTypes.HANDLE]: Handle,
  [MeshTypes.LOOP]: Loop,
  [MeshTypes.FACE]: Face
};

export class SelectedEditableIter<type extends Element> {
  ret: IteratorResult<type>
  listiter: Iterator<type>
  done: boolean;
  set: SelectionSet<type>;

  constructor(set: SelectionSet<type> | undefined) {
    this.ret = {done: true, value: undefined};
    this.listiter = undefined;
    this.done = true;
    (this.set as SelectionSet<type> | undefined) = set;
  }

  reset(set: SelectionSet<type>): this {
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

export class SelectedEditableStack<type extends Element> {
  cur: number;
  set: SelectionSet<type>;
  stack: SelectedEditableIter<type>[] = [];

  constructor(set) {
    this.stack.length = 64;
    this.cur = 0;
    this.set = set;

    for (let i = 0; i < this.stack.length; i++) {
      this.stack[i] = new SelectedEditableIter<type>(set);
    }
  }

  [Symbol.iterator]() {
    return this.next().reset(this.set);
  }

  next(): SelectedEditableIter<type> {
    return this.stack[this.cur++];
  }
}

export class SelectionSet<type extends Element> extends Set<type> {
  eiterstack: SelectedEditableStack<type>;

  constructor() {
    super();

    this.eiterstack = new SelectedEditableStack<type>(this);
  }

  remove(item: type) {
    return this.delete(item);
  }

  get editable() {
    return this.eiterstack;
  }
}

export class ElementListIter<type extends Element> {
  ret: IteratorResult<type>;
  i: number;
  elist: ElementList<type>;

  constructor(elist: ElementList<type>) {
    this.ret = {done: false, value: undefined};
    this.i = 0;
    this.elist = elist;
  }

  init(elist: ElementList<type>) {
    this.elist = elist;
    this.i = 0;
    this.ret.done = false;

    return this;
  }

  next(): IteratorResult<type> {
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

  return(): IteratorResult<type> {
    if (!this.ret.done) {
      this.elist.iterstack.cur--;
      this.elist.iterstack.cur = Math.max(this.elist.iterstack.cur, 0);
      this.ret.done = true;
    }

    this.ret.value = undefined;

    return this.ret;
  }
}

export class ElementList<type extends Element> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.ElementList {
  list        : iter(abstract(Object)) | this._get_compact();
  active      : int | this.active !== undefined ? this.active.eid : -1;
  highlight   : int | this.highlight !== undefined ? this.highlight.eid : -1;
  type        : int;
  customData  : mesh.CustomData; 
}`);

  selected: SelectionSet<type>;
  list: (type | undefined)[] = [];
  length = 0;
  size = 0;
  storeFreedElems = false;
  customData = new CustomData();
  local_eidMap = new Map<number, type>();
  type: MeshTypes;
  on_selected: (() => void) | undefined;
  highlight: type | undefined;
  active: type | undefined;
  iterstack = new MeshIterStack<ElementListIter<type>>(64);
  idxmap = new Map<number, number>();

  private _update_req: boolean | undefined = undefined;
  private _totAdded = 0;
  private _totRemoved = 0;
  private freelist: number[] = [];
  private free_elems = new util.Queue<type>(256);
  private delayed_free_queue: type[] = [];
  private dqueue_idxmap: Map<type, number>;

  constructor(type: MeshTypes, storeFreedElems = false) {
    if (!STORE_DELAY_CACHE_INDEX) {
      this.dqueue_idxmap = new Map();
    }

    for (let i = 0; i < this.iterstack.length; i++) {
      this.iterstack[i] = new ElementListIter(this);
    }
    this.iterstack.cur = 0;

    this.type = type;
    this.selected = new SelectionSet<type>();
    this.on_selected = undefined;
    this.highlight = this.active = undefined;
  }

  _getDebugTot() {
    return {
      added: this._totAdded,
      removed: this._totRemoved
    }
  }

  /*sanity alias to this.customData*/
  get cd(): CustomData {
    return this.customData;
  }

  set cd(v: CustomData) {
    this.customData = v;
  }

  [Symbol.iterator](): ElementListIter<type> {
    //console.log(this.type, "iterator read");

    if (this.iterstack.cur >= this.iterstack.length) {
      console.warn("deep nesting of ElementListIter detected; growing cache stack by one", this.iterstack.cur);
      this.iterstack.push(new ElementListIter<type>(this));
    }

    return this.iterstack[this.iterstack.cur++].init(this);
  }

  filter(f: (item: type) => boolean): type[] {
    let list: type[] = [];

    for (let item of this) {
      if (f(item))
        list.push(item);
    }

    return list;
  }

  map<MapType>(f: (item: type) => MapType): MapType[] {
    let list = new Array(this.length);
    let i = 0;

    for (let item of this) {
      list[i++] = f(item);
    }

    return list;
  }

  reduce<Initial>(f: (val: Initial, item: type, i: number, list: this) => Initial,
                  initial: Initial): Initial {
    let i = 0;

    if (initial === undefined) {
      for (let item of this) {
        initial = item as unknown as Initial;
        break;
      }
    }

    for (let item of this) {
      initial = f(initial, item, i++, this);
    }

    return initial;
  }

  swap(a: type, b: type): this {
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

  reverse(): this {
    let len = this.list.length;

    for (let i = 0; i < (len >> 1); i++) {
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

  setEID(e: type, neweid: number) {
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

  _push(e: type): void {
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

  push(e: type): this {
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

  indexOf(e: type): number {
    let idx = this.idxmap.get(e.eid);
    return idx !== undefined ? idx : -1;
  }

  _flagQueuedUpdate(): void {
    if (this._update_req !== undefined) {
      return;
    }

    this._update_req = true;

    window.setTimeout(() => {
      this._update_req = undefined;

      this._runDelayedFreeQueue();
    });
  }

  _remove(e: type, no_error = false): void {
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

  forEach(cb: (item: type) => void, thisvar: any): void {
    for (let item of this) {
      if (thisvar) {
        cb.call(thisvar, item);
      } else {
        cb(item);
      }
    }
  }

  compact(): this {
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

  remove(elem: type, no_error = false): this {
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


  selectNone(): this {
    for (let elem of this.selected) {
      elem.flag &= ~MeshFlags.SELECT;
      elem.flag |= MeshFlags.UPDATE;
    }

    this.selected.clear();

    return this;
  }

  selectAll(): this {
    for (var e of this) {
      if (!(e.flag & MeshFlags.SELECT)) {
        e.flag |= MeshFlags.UPDATE;
      }

      this.setSelect(e, true);
    }

    return this;
  }

  _fixcd(dest: type): void {
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

  customDataInterp(dest: type, sources: type[], ws: number[]): void {
    let sources2 = getArrayTemp<CustomDataElem<any>>(sources.length);

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

    for (let i = 0; i < sources2.length; i++) {
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

  setSelect(e: type, state: boolean): this {
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
        this.selected.remove(e);
      }
    }

    return this;
  }

  setHighlight(e: type | undefined): this {
    this.highlight = e;
    return this;
  }

  setActive(e: type | undefined): this {
    this.active = e;
    return this;
  }

  _get_compact(): type[] {
    let ret: type[] = [];

    for (let item of this) {
      ret.push(item);
    }

    return ret;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);

    let act = this.active as unknown as number;
    let high = this.highlight as unknown as number;

    this.highlight = undefined;
    this.active = undefined;

    let i = 0;

    //old file?
    let oldthis = this as unknown as any;
    if (oldthis["items"] !== undefined) {
      this.list = oldthis["items"];
      delete oldthis["items"];
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

  removeCustomDataLayer(layer_i: number): void {
    this.clearFreeElems();

    if (layer_i < 0 || layer_i === undefined) {
      throw new Error("bad call to removeCustomDataLayer");
    }

    let layer = this.customData.flatlist[layer_i];

    let cls = CustomDataElem.getTypeClass(layer.typeName);
    this.customData.remLayer(layer);

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
  }

  clearCustomData(): void {
    this.clearFreeElems();

    for (let e of this) {
      e.customData.clear();
    }

    this.customData._clear();
  }

  prealloc(count: number): this {
    let cls = typemap[this.type] as unknown as (new() => type);

    for (let i = 0; i < count; i++) {
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

  _runDelayedFreeQueue(): void {
    if (this.delayed_free_queue.length === 0) {
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

  _checkFreeElems(): void {
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

  alloc(cls: new () => type): type {
    //add some pad so mesh log code works properly,
    //which keeps freed elements around briefly (but not instananeously)
    if (this.free_elems.length > 512) {
      let ret = this.free_elems.dequeue();

      if (ret.eid >= 0) {
        throw new Error("elem was somehow unfreed already");
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

      for (let i = 0; i < ret.customData.length; i++) {
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

  addCustomDataLayer(cls_or_typestring: any,
                     name?: string): CustomDataLayer<any> {
    this.clearFreeElems();

    let typecls: ICustomDataElemConstructor | undefined;

    if (typeof cls_or_typestring === "string") {
      typecls = CustomDataElem.getTypeClass(cls_or_typestring);
    } else {
      typecls = cls_or_typestring as unknown as ICustomDataElemConstructor;
    }

    if (typecls === undefined) {
      throw new Error("Unknown customdata type");
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
        item.customData = new CDElemArray();
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

  fixCustomData(): void {
    let cd = this.customData;

    for (let e of this) {
      if (e.customData.length === cd.flatlist.length) {
        continue;
      }

      console.warn("Element was missing customdata", e.constructor.name, e.eid, e.customData, cd.flatlist.length);

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

  stripTempLayers(saveState = false): any {
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
}

