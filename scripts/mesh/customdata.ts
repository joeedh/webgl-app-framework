import {
  DataAPI, DataPathCallBack, nstructjs,
  ToolProperty, Vector3, DataStruct
} from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';

import {EmptyCDArray, ICustomDataCapable} from './mesh_base.js';
import {Icons} from '../editors/icon_enum.js';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import {Element} from "./mesh_types";

export type CDRef<type> = number;

export interface ICustomDataElemConstructor<type = CustomDataElem<any>> {
  new(): type;

  define(): ICustomDataElemDef;
}

export const CDFlags = {
  SELECT: 1,
  SINGLE_LAYER: 2,
  TEMPORARY: 4, //implies IGNORE_FOR_INDEXBUF
  IGNORE_FOR_INDEXBUF: 8,
  DISABLED: 16,
  NO_INTERP: 32,
  NO_INTERP_COPY_ONLY: 64
};

export let CDElemMap = {};
export let CDElemTypes = [];

export function cdLayerKey(typeName, name) {
  return typeName + ":" + name;
}

export interface ICustomDataElemDef {
  elemTypeMask: number, //see MeshTypes in mesh.js
  typeName: string,
  uiTypeName?: string,
  defaultName?: string,
  valueSize?: number;
  flag?: number; //see CDFlags

  //if not undefined, a LayerSettingsBase child class defining overall settings that's not per-element
  settingsClass?: any;
}

export class CustomDataElem<ValueType> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.CustomDataElem {
}`);

  ['constructor']: ICustomDataElemConstructor<this>;

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: 0, //see MeshTypes in mesh.js
      typeName: "typeName",
      uiTypeName: "uiTypeName",
      defaultName: "defaultName",
      valueSize: undefined,
      flag: 0, //see CDFlags

      //if not undefined, a LayerSettingsBase child class defining overall settings that's not per-element
      settingsClass: undefined,
    }
  };

  static typeName = this.define().typeName;
  typeName: string;
  onRemoveLayer: (cls: new () => this, layer_i: number) => void;
  onNewLayer: (cls: new () => CustomDataElem<any>, i?: number) => void;

  constructor() {
    this.typeName = this.constructor.define().typeName;
  }

  calcMemSize() {
    let data = this.getValue();

    let pad = 16; //assume some padding

    if (typeof data === "number") {
      return 8 + pad;
    }

    if (Array.isArray(data)) {
      return (data as unknown as Array<any>).length * 8 + pad;
    }

    return 64; //just assume some largish size
  }

  /*if defined in a subclass, will be called whenever a new data layer is created
    even if of another type
  onNewLayer(layer_class, layer_index) {

  }
  onRemoveLayer(layercls, layer_i=undefined) {
  }
  */

  static apiDefine(api: DataAPI, dstruct: DataStruct) {
  }

  setValue(b: ValueType) {
    throw new Error("implement me");
  }

  getValue(): ValueType {
    throw new Error("implement me");
  }

  load(b: this): this {
    b.copyTo(this);
    return this;
  }

  clear(): this {
    return this;
  }

  //used for building island meshes
  hash(snapLimit = 0.01) {
    let value = this.getValue();

    function hashArray<type extends number[]>(array: type) {
      let f = 0;
      let dimen = 4196;

      for (let i = 0; i < array.length; i++) {
        let f2 = Math.floor(array[i] / snapLimit);
        //f = f ^ f2;

        f += f2 * Math.pow(dimen, i);
        f = f & ((1 << 30) - 1);
      }

      return f;
    }

    if (typeof value === "object" && (Array.isArray(value))) {
      hashArray<number[]>(value as number[]);
    } else if (typeof value === "object" && ArrayBuffer.isView(value)) {
      hashArray<number[]>(value as number[]);
    } else if (typeof value === "number") {
      return Math.floor(value / snapLimit);
    } else {
      throw new Error("implement me!");
    }
  }

  copyTo(b): void {
    throw new Error("implement me");
  }

  copy(): this {
    let ret = new (this.constructor as unknown as (new () => this))();
    this.copyTo(ret);
    return ret;
  }

  interp(dest: this, datas: this[], ws: number[]): void {
    //for default implementation, just copy first item in datas
    for (let cd of datas) {
      cd.copyTo(dest);
      break;
    }
  }

  mulScalar(f: number): this {
    //implement me
    return this;
  }

  add(b: this): this {
    //implement me
    return this;
  }

  addFac(b: this, fac: number): this {
    //implement me
    return this;
  }

  sub(b: this): this {
    return this.addFac(b, -1.0);
  }

  validate(): boolean {
    return true;
  }

  static register(cls: any) {
    if (!cls.hasOwnProperty("STRUCT")) {
      throw new Error("You forgot to make a STRUCT script for " + cls.name);
    }
    if (!cls.hasOwnProperty("structName")) {
      throw new Error("You forgot to register " + cls.name + " with nstruct.register()");
    }
    if (cls.define === CustomDataElem.define) {
      throw new Error("You forgot to add a static define function for " + cls.name);
    }

    //if (cls.define().valueSize === undefined) {
    //  throw new Error("You forget to add valid valueSize to define() for customdata");
    //}

    CDElemTypes.push(cls);
    CDElemMap[cls.define().typeName] = cls;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
  }

  static getTypeClass(typeName: string): ICustomDataElemConstructor | undefined {
    if (!(typeName in CDElemMap)) {
      debugger;
      throw new Error("Unknown customdata type " + typeName);
    }
    return CDElemMap[typeName];
  }
}

export function buildCDAPI(api: DataAPI) {
  let layerst = api.mapStruct(CustomDataLayer, true);

  layerst.string("name", "name", "Name");
  layerst.dynamicStruct("typeSettings", "settings", "Settings");
  layerst.enum("flag", "flag", CDFlags, "Flags").icons({
    DISABLED: Icons.DISABLED
  });

  let def = layerst.pathmap["settings"];
  def.customGetSet(function (this: any) {
    let ret = this.dataref.getTypeSettings();

    if (!ret) {
      return undefined;
    }

    let cls = ret.constructor;

    if (!api.hasStruct(cls)) {
      cls.apiDefine(api, api.mapStruct(cls, true));
    }

    return ret;
  }, undefined);

  layerst.int("index", "index", "index").readOnly();
  layerst.string("typeName", "typeName", "Type").readOnly();

  let st = api.mapStruct(CustomData, true);

  function makeGetter(typeName): DataPathCallBack {
    return function () {
      let customData = this.dataref;
      return customData.getActiveLayer(typeName);
    }
  }

  for (let cls of CDElemTypes) {
    let ldef = cls.define();

    //settings classes can be shared among customdata types
    if (ldef.settingsClass && !api.hasStruct(ldef.settingsClass)) {
      ldef.settingsClass.apiDefine(api);
    }

    st.struct(ldef.typeName, ldef.typeName, "Active " + ldef.typeName + " layer", layerst);
    let def = st.pathmap[ldef.typeName];

    def.customGetSet(makeGetter(ldef.typeName));
  }

  st.list<CustomDataLayer<any>[], number, CustomDataLayer<any>>
  ("flatlist", "layers", {
    getIter(api, list: CustomDataLayer<any>[]) {
      return list;
    },
    getLength(api: DataAPI, list: CustomDataLayer<any>[]) {
      return list.length;
    },

    get(api: DataAPI, list: CustomDataLayer<any>[], key: number) {
      return list[key];
    },
    getKey(api: DataAPI, list: CustomDataLayer<any>[], obj: CustomDataLayer<any>) {
      return obj !== undefined ? obj.index : -1;
    },
    getStruct(api, list, key) {
      return api.mapStruct(CustomDataLayer, false);
    }
  });
}

export function buildElementAPI(api, dstruct) {
  for (let cls of CDElemTypes) {
    let cstruct = api.mapStruct(cls, true);
    cls.apiDefine(api, cstruct);
  }

  dstruct.list("customData", "dataLayers", [
    function getIter(api, list) {
      return list;
    },
    function getLength(api, list) {
      return list.length;
    },
    function get(api, list, key) {
      return list[key];
    },
    function getKey(api, list, obj) {
      return list.indexOf(obj);
    },
    function getActive(api, list) {
      return undefined;
    },
    function setActive(api, list, key) {
      return;
    },
    function getStruct(api, list, key) {
      return api.mapStruct(list[key].constructor, false);
    }
  ]);

  dstruct.list("customData", "namedLayers", [
    function getIter(api, list) {
      return list;
    },
    function getLength(api, list) {
      return list.length;
    },
    function get(api, list, key) {
      if (list === undefined) {
        return undefined;
      }
      for (let i = 0; i < list.length; i++) {
        if (list[i].typeName === key) {
          return list[i];
        }
      }
    },
    function getKey(api, list, obj) {
      return obj.typeName;
    },
    function getActive(api, list) {
      return undefined;
    },
    function setActive(api, list, key) {
      return;
    },
    function getStruct(api, list, key) {
      return api.mapStruct(CustomDataElem.getTypeClass(key), false);
    }
  ]);
}

export class LayerSettingsBase {
  static STRUCT = nstructjs.inlineRegister(this, `
LayerSettingsBase {
}`);

  copyTo(b) {
    throw new Error("implement me");
  }

  static apiDefine(api) {
    return api.mapStruct(this, true);
  }

  copy() {
    let ret = new (this.constructor as new () => this)();

    this.copyTo(ret);

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

class _Nothing extends LayerSettingsBase {
  static STRUCT = nstructjs.inlineRegister(this, `
_Nothing {
}
  `);
}

export class CustomDataLayer<CDType extends CustomDataElem<any>> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.CustomDataLayer {
  typeName        : string;
  name            : string;
  flag            : int;
  id              : int;
  islandSnapLimit : float;
  index           : int;
  elemTypeMask    : int;
  typeSettings    : abstract(Object) | this.typeSettings === undefined ? this.__getNothing() : this.typeSettings;
}
  `);

  elemTypeMask: number;
  typeName: string;
  name: string;
  flag: number;
  id: number;
  typeSettings: any;
  islandSnapLimit: number;
  index: number
  layerSet: LayerSet<CDType>

  constructor(typename, name: string | undefined = undefined, flag = 0, id = -1) {
    if (name === undefined) {
      name = this.constructor.name;
    }

    this.elemTypeMask = 0;
    this.typeName = typename;
    this.name = name;
    this.flag = flag;
    this.id = id;
    this.typeSettings = undefined;
    this.islandSnapLimit = 0.0001;
    this.index = 0; //index in flat list of layers in elements

    this.layerSet = undefined;
  }

  getTypeSettings(): any {
    if (this.typeSettings === undefined) {
      let cls = CustomDataElem.getTypeClass(this.typeName);
      let def = cls.define();

      if (def.settingsClass) {
        this.typeSettings = new def.settingsClass();
      }
    }

    return this.typeSettings;
  }

  [Symbol.keystr](): string {
    return cdLayerKey(this.typeName, this.name);
  }

  //used by struct script
  __getNothing() {
    return new _Nothing();
  }

  copy(): CustomDataLayer<CDType> {
    let ret = new CustomDataLayer<CDType>(this.typeName, this.name, this.flag, this.id);

    if (this.typeSettings) {
      ret.typeSettings = this.typeSettings.copy();
    }

    ret.index = this.index;
    ret.elemTypeMask = this.elemTypeMask;

    return ret;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);

    if (this.typeSettings instanceof _Nothing) {
      this.typeSettings = undefined;
    }
  }
}

export class LayerSet<CDType extends CustomDataElem<any>> extends Array<CustomDataLayer<CDType>> {
  typeName: string;
  active: CustomDataLayer<CDType>;
  active_i: number; /* Used by STRUCT script. */
  idmap: Map<number, CustomDataLayer<CDType>>;

  /* Set by old files. */
  _layers: CustomDataLayer<CDType>[]

  static STRUCT = nstructjs.inlineRegister(this, ` 
mesh.LayerSet {
  this      : array(abstract(mesh.CustomDataLayer)) | obj;
  active_i  : int | obj.active !== undefined ? obj.active.id : undefined;
  typeName  : string;
}
`);

  constructor(typeName) {
    super();

    this.typeName = typeName;
    this.active = undefined;
    this.idmap = new Map();
  }

  add(layer: CustomDataLayer<CDType>): void {
    this.push(layer);
  }

  push(...items: CustomDataLayer<CDType>[]): number {
    super.push(...items);

    for (let layer of items) {
      layer.layerSet = this;
      this.idmap.set(layer.id, layer);
    }

    return this.length;
  }

  has(layer): boolean {
    return this.idmap.has(layer);
  }

  remove(layer: CustomDataLayer<CDType>) {
    if (this.idmap.has(layer.id)) {
      console.warn("layer already removed from set", layer.id);
      return;
    }

    super.remove(layer);

    if (layer === this.active) {
      this.active = this.length > 0 ? this[0] : undefined;
    }

    this.idmap.delete(layer.id);

    return this;
  }

  copy(): LayerSet<CDType> {
    let ret = new LayerSet<CDType>(this.typeName);

    for (let layer of this) {
      let layer2 = layer.copy();

      if (layer === this.active) {
        ret.active = layer2;
      }

      ret.add(layer2);
    }

    return ret;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);

    for (let layer of this) {
      this.idmap.set(layer.id, layer);
    }

    /* Detect old files. */
    if (typeof this.active === "number") {
      this.active = this.idmap.get(this.active as number);
    }

    if (this.active_i >= 0) {
      this.active = this.idmap.get(this.active_i);
    }

    if (this._layers !== undefined && this._layers.length > 0) {
      this.push(...this._layers);
      this._layers.length = 0;
    }
  }
}

export class CustomData {
  flatlist: CustomDataLayer<any>[];
  idgen: util.IDGen;
  layers: Map<string, LayerSet<any>>;

  on_layeradd?: (layer: CustomDataLayer<any>, lset: LayerSet<any>) => void;
  on_layerremove?: (layer: CustomDataLayer<any>, lset: LayerSet<any>) => void;

  /* Used by struct script. */
  _layers: LayerSet<any>[];

  static STRUCT = nstructjs.inlineRegister(this, `
mesh.CustomData {
  _layers  : array(mesh.LayerSet) | this._getLayers();
  flatlist : array(layer, int) | layer.id;
  idgen    : IDGen;
}
  `);

  constructor() {
    this.layers = new Map();
    this.flatlist = [];
    this.idgen = new util.IDGen();
  }

  _clear() {
    this.layers = new Map();
    this.flatlist = [];

    return this;
  }

  stripTempLayers() {
    let newlist = [];

    for (let layer of new Set(this.flatlist)) {
      let lset = this.getLayerSet(layer.typeName);

      if (layer.flag & CDFlags.TEMPORARY) {
        lset.remove(layer);
        continue;
      }

      layer.index = newlist.length;
      newlist.push(layer);
    }

    this.flatlist = newlist;

    return this;
  }

  copy() {
    let ret = new CustomData();

    ret.idgen = this.idgen.copy();

    for (let layer of this.flatlist) {
      let layer2 = layer.copy();
      let lset = ret.getLayerSet(layer.typeName);

      layer2.index = ret.flatlist.length;
      ret.flatlist.push(layer2);

      let oldlset = this.getLayerSet(layer.typeName);

      lset.push(layer2);
      if (layer === oldlset.active) {
        lset.active = layer2;
      }
    }

    return ret;
  }

  merge(cd) {
    let cdmap = {};

    this._updateFlatList();

    for (let list of cd.flatlist) {
      let ok = this.hasNamedLayer(list.name, list.typeName);

      if (!ok) {
        let cls = CDElemMap[list.typeName];
        if (!cls) {
          throw new Error("unregistered CustomData detected");
        }

        let list2 = this.addLayer(cls, list.name);
      }
    }

    for (let list of this.flatlist) {
      cdmap[cdLayerKey(list.typeName, list.name)] = list.index;
    }

    return cdmap;
  }

  getLayerSettings(typecls_or_name) {
    return this.getActiveLayer(typecls_or_name).getTypeSettings();
  }

  addLayer(cls: ICustomDataElemConstructor, name: string | undefined = undefined) {
    if (!cls.define || !cls.define() || !cls.define().typeName) {
      throw new Error("Invalid customdata class " + cls.name);
    }

    if (!(cls.define().typeName in CDElemMap)) {
      throw new Error("Unregistered customdata class " + cls.name);
    }

    name = !name ? cls.define().defaultName : name;
    name = !name ? cls.name : name;
    name = this._getUniqueName(name);

    let type = cls.define().typeName;
    let layer = new CustomDataLayer(type, name, undefined, this.idgen.next());
    let lset = this.getLayerSet(type);

    layer.index = this.flatlist.length;
    layer.elemTypeMask = cls.define().elemTypeMask;
    layer.name = name;
    layer.flag = cls.define().flag || 0;

    this.flatlist.push(layer);
    lset.push(layer);

    if (this.on_layeradd) {
      this.on_layeradd(layer, lset);
    }

    return layer;
  }

  initElement(e) {
    if (this.flatlist.length === 0) {
      return;
    }

    if (e.customData === EmptyCDArray) {
      e.customData = new CDElemArray();
    }

    e.customData.length = 0;

    for (let layer of this.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      e.customData.push(new cls());
    }
  }

  //TODO: just pass in classes?
  hasLayer(typename_or_cls: any): boolean {
    let typename: string;

    if (typeof typename_or_cls === "string") {
      typename = typename_or_cls as string;
    } else {
      let cls = typename_or_cls as unknown as ICustomDataElemConstructor;
      typename = cls.define().typeName;
    }

    return this.layers.has(typename) && this.layers.get(typename).length > 0;
  }

  getLayerRef<type extends CustomDataElem<any>>(cls: new() => type): AttrRef<type> {
    return AttrRef.create<type>(this.getLayerIndex(cls));
  }

  getLayerIndex(typename_or_cls: any): number {
    let typename: string;

    if (typeof typename_or_cls === "string") {
      typename = typename_or_cls as string;
    } else {
      let cls = typename_or_cls as unknown as ICustomDataElemConstructor;
      typename = cls.define().typeName;
    }

    let lset = this.layers.get(typename);
    if (!lset) {
      return -1;
    }

    if (!lset.active && lset.length > 0) {
      lset.active = lset[0];
    }

    return lset.active ? lset.active.index : -1;
  }

  getActiveLayer<type = any>(typecls_or_name: any): CustomDataLayer<any> {
    let typeName: string;

    if (typeof typecls_or_name === "string") {
      typeName = typecls_or_name as unknown as string;
    } else {
      let cls = typecls_or_name as unknown as ICustomDataElemConstructor;
      typeName = cls.define().typeName;
    }


    let set = this.layers.get(typeName);
    if (!set) {
      return undefined;
    }

    if (set.active === undefined && set.length > 0) {
      set.active = set[0];
    }

    return set.active;
  }

  setActiveLayer(layerIndex) {
    let layer = this.flatlist[layerIndex];
    let set = this.layers.get(layer.typeName);

    set.active = layer;
  }

  remLayer(layer) {
    let set = this.layers.get(layer.typeName);

    if (set.active === layer) {
      set.active = set.length > 1 ? set[(set.indexOf(layer) + 1) % set.length] : undefined;
    }

    set.remove(layer);

    this.flatlist.remove(layer);

    this._updateFlatList();

    if (this.on_layerremove) {
      this.on_layerremove(layer, set);
    }
  }

  _updateFlatList() {
    for (let i = 0; i < this.flatlist.length; i++) {
      this.flatlist[i].index = i;
    }
  }

  _getUniqueName(name) {
    let taken = (name) => {
      for (let layer of this.flatlist) {
        if (layer.name === name) {
          return true;
        }
      }

      return false;
    }

    let name2 = name;
    let i = 2;

    while (taken(name2)) {
      name2 = name + i;
      i++;
    }

    return name2;
  }

  getLayerSet<CDType extends CustomDataElem<any>>(typename, autoCreate = true): LayerSet<CDType> {
    if (autoCreate && !this.layers.has(typename)) {
      this.layers.set(typename, new LayerSet(typename));
      this.layers.get(typename).active = undefined;
    }

    return this.layers.get(typename);
  }

  hasNamedLayer(name, opt_cls_or_typeName = undefined) {
    return this.getNamedLayer(name, opt_cls_or_typeName) !== undefined;
  }

  getNamedLayerRef<type extends CustomDataElem<any>>(name, opt_cls_or_typeName): AttrRef<type> {
    let layer = this.getNamedLayer(name, opt_cls_or_typeName);
    if (!layer) {
      return AttrRef.create<type>(-1);
    }

    return AttrRef.create<type>(layer.index);
  }

  getNamedLayerIndex(name, opt_cls_or_typeName) {
    let layer = this.getNamedLayer(name, opt_cls_or_typeName);
    if (!layer) {
      return -1;
    }

    return layer.index;
  }

  getNamedLayer<CDType extends CustomDataElem<any> = CustomDataElem<any>>(name, opt_cls_or_typeName): CustomDataLayer<CDType> | undefined {
    let typeName = opt_cls_or_typeName;

    if (typeof typeName !== "string") {
      typeName = typeName.define().typeName;
    }

    for (let layer of this.flatlist) {
      if (typeName && layer.typeName !== typeName) {
        continue;
      }

      if (layer.name === name) {
        return layer;
      }
    }
  }

  getLayerFromIndex<CDType extends CustomDataElem<any>>(i: number): CustomDataLayer<CDType> {
    return this.flatlist[i] as CustomDataLayer<CDType>;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);

    let idmap = new Map<number, CustomDataLayer<any>>;

    for (let layerset of this._layers) {
      this.layers.set(layerset.typeName, layerset);

      for (let layer of layerset) {
        idmap.set(layer.id, layer);
      }
    }

    for (let i = 0; i < this.flatlist.length; i++) {
      this.flatlist[i] = idmap.get(this.flatlist[i] as unknown as number);
    }
  }

  _getLayers() {
    let ret = [];

    for (let k of this.layers.keys()) {
      ret.push(this.layers.get(k));
    }

    return ret;
  }
}

export class AttrRef<type extends CustomDataElem<any>> {
  public i: number = -1;

  constructor(index: number = -1) {
    this.i = index;
  }

  static create<type extends CustomDataElem<any>>(index: number): AttrRef<type> {
    return new AttrRef<type>(index);
  }

  get exists() {
    return this.i >= 0;
  }

  get(elem: ICustomDataCapable): type {
    return elem.customData.get<type>(this.i);
  }

  layerInfo(cdata: CustomData): CustomDataLayer<type> {
    return cdata.getLayerFromIndex<type>(this.i);
  }
}


import {CDElemArray} from "./mesh_base.js";