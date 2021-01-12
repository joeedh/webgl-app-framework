import '../path.ux/scripts/util/struct.js';
import * as util from '../util/util.js';

export const CDFlags = {
  SELECT             : 1,
  SINGLE_LAYER       : 2,
  TEMPORARY          : 4, //implies IGNORE_FOR_INDEXBUF
  IGNORE_FOR_INDEXBUF: 8
};

export let CDElemMap = {};
export let CDElemTypes = [];

export function cdLayerKey(typeName, name) {
  return typeName + ":" + name;
}


export class CustomDataElem {
  constructor() {
    this.constructor.typeName = this.constructor.define().typeName;
    this.constructor.prototype.typeName = this.constructor.define().typeName;
  }

  calcMemSize() {
    let data = this.getValue();

    let pad = 16; //assume some padding

    if (typeof data === "number") {
      return 8 + pad;
    }

    if (Array.isArray(data)) {
      return data.length * 8 + pad;
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

  static apiDefine(api, dstruct) {

  }

  setValue(b) {
    throw new Error("implement me");
  }

  getValue() {
    throw new Error("implement me");
  }

  load(b) {
    b.copyTo(this);
    return this;
  }

  //used for building island meshes
  hash(snapLimit = 0.01) {
    let val = this.getValue();

    if (typeof val === "object" && typeof val[0] === "number") {
      let f = 0;
      let dimen = 4196;

      for (let i=0; i<val.length; i++) {
        let f2 = Math.floor(val[i]/snapLimit);
        //f = f ^ f2;

        f += f2*Math.pow(dimen, i);
        f = f & ((1<<30)-1);
      }

      return f;
    } else if (typeof val === "number") {
      return Math.floor(val/snapLimit);
    } else {
      throw new Error("implement me!");
    }
  }

  copyTo(b) {
    throw new Error("implement me");
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    //for default implementation, just copy first item in datas
    for (let cd of datas) {
      cd.copyTo(dest);
      break;
    }
  }

  validate() {
    return true;
  }

  static define() {
    return {
      elemTypeMask: 0, //see MeshTypes in mesh.js
      typeName    : "typeName",
      uiTypeName  : "uiTypeName",
      defaultName : "defaultName",
      valueSize   : undefined,
      flag        : 0,

      //if not undefined, a LayerSettingsBase child class defining overall settings that's not per-element
      settingsClass: undefined,
    }
  };

  static register(cls) {
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

  loadSTRUCT(reader) {
    reader(this);
  }

  static getTypeClass(typeName) {
    return CDElemMap[typeName];
  }
}

CustomDataElem.STRUCT = `
mesh.CustomDataElem {
}
`;
nstructjs.manager.add_class(CustomDataElem);

export function buildCDAPI(api) {
  let layerst = api.mapStruct(CustomDataLayer, true);

  layerst.string("name", "name", "Name");
  layerst.dynamicStruct("typeSettings", "settings", "Settings");
  let def = layerst.pathmap["settings"];
  def.customGet(function () {
    return this.dataref.getTypeSettings();
  });

  layerst.int("index", "index", "index").readOnly();
  layerst.string("typeName", "typeName", "Type").readOnly();

  let st = api.mapStruct(CustomData, true);

  function makeGetter(typeName) {
    return function () {
      let customData = this.dataref;
      return customData.getActiveLayer(typeName);
    }
  }

  for (let cls of CDElemTypes) {
    let ldef = cls.define();

    //let def = st.struct
    if (ldef.settingsClass) {
      ldef.settingsClass.apiDefine(api);
    }

    st.struct(ldef.typeName, ldef.typeName, "Active " + ldef.typeName + " layer", layerst);
    let def = st.pathmap[ldef.typeName];

    def.customGetSet(makeGetter(ldef.typeName));
  }

  st.list("flatlist", "layers", [
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
      return obj !== undefined ? obj.list : -1;
    },
    function getStruct(api, list, key) {
      return api.mapStruct(CustomDataLayer, false);
    }
  ]);
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
  copyTo(b) {
    throw new Error("implement me");
  }

  static apiDefine(api) {

  }

  copy() {
    let ret = new this.constructor();

    this.copyTo(ret);

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

LayerSettingsBase.STRUCT = `
LayerSettingsBase {
}
`;
nstructjs.register(LayerSettingsBase);

class _Nothing extends LayerSettingsBase {
}

_Nothing.STRUCT = nstructjs.inherit(_Nothing, LayerSettingsBase) + `
}`;
nstructjs.register(_Nothing);

export class CustomDataLayer {
  constructor(typename, name = this.constructor.name, flag = 0, id = -1) {
    this.elemTypeMask = 0;
    this.typeName = typename;
    this.name = name;
    this.flag = flag;
    this.id = id;
    this.typeSettings = undefined;
    this.islandSnapLimit = 0.0001;
    this.index = 0; //index in flat list of layers in elements
  }

  getTypeSettings() {
    if (this.typeSettings === undefined) {
      let cls = CustomDataElem.getTypeClass(this.typeName);
      let def = cls.define();

      if (def.settingsClass) {
        this.typeSettings = new def.settingsClass();
      }
    }

    return this.typeSettings;
  }

  [Symbol.keystr]() {
    return cdLayerKey(this.typeName, this.name);
  }

  //used by struct script
  __getNothing() {
    return new _Nothing();
  }

  copy() {
    let ret = new CustomDataLayer(this.typeName, this.name, this.flag, this.id);

    if (this.typeSettings) {
      ret.typeSettings = this.typeSettings.copy();
    }

    ret.index = this.index;
    ret.elemTypeMask = this.elemTypeMask;

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);

    if (this.typeSettings instanceof _Nothing) {
      this.typeSettings = undefined;
    }
  }
}

CustomDataLayer.STRUCT = `
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
`;
nstructjs.manager.add_class(CustomDataLayer);

export class CDElemArray extends Array {
  constructor(items) {
    super();

    if (items !== undefined) {
      for (let item of items) {
        this.push(item);
      }
    }
  }

  hasLayer(cls) {
    for (let item of this) {
      if (item instanceof cls) {
        return true;
      }
    }

    return false;
  }

  getLayer(cls, idx = 0) {
    let j = 0;

    for (let i = 0; i < this.length; i++) {
      let item = this[i];
      if (item instanceof cls) {
        if (j === idx) {
          return item;
        }
        j++;
      }
    }
  }

  updateLayout() {

  }

  loadSTRUCT(reader) {
    reader(this);

    for (let item of this._items) {
      this.push(item);
    }

    delete this._items;
  }
}

CDElemArray.STRUCT = `
mesh.CDElemArray {
  _items : array(abstract(mesh.CustomDataElem)) | this;
}
`;
nstructjs.register(CDElemArray);

export class LayerSet extends Array {
  constructor(typeName) {
    super();

    this.typeName = typeName;
    this.active = undefined;
    this.idmap = {};
  }

  push(layer) {
    super.push(layer);
    this.idmap[layer.id] = layer;
  }

  has(layer) {
    return layer.id in this.idmap;
  }

  remove(layer) {
    if (!(layer.id in this.idmap)) {
      console.warn("layer already removed from set", layer.id);
      return;
    }

    super.remove(layer);

    if (layer === this.active) {
      this.active = this.length > 0 ? this[0] : undefined;
    }

    delete this.idmap[layer.id];

    return this;
  }

  copy() {
    let ret = new LayerSet(this.typeName);

    for (let layer of this) {
      let layer2 = layer.copy();

      if (layer === this.active) {
        ret.active = layer2;
      }

      ret.add(layer2);
    }

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let layer of this._layers) {
      this.push(layer);
    }

    if (this.active >= 0) {
      this.active = this.idmap[this.active];
    }
    delete this._layers;
  }
}

LayerSet.STRUCT = `
mesh.LayerSet {
  _layers  : array(abstract(mesh.CustomDataLayer)) | obj;
  active   : int | obj.active !== undefined ? obj.active.id : undefined;
  typeName : string;
}
`;
nstructjs.manager.add_class(LayerSet);

export class CustomData {
  constructor() {
    this.layers = {};
    this.flatlist = [];
    this.on_layeradd = undefined;
    this.on_layerremove = undefined;
    this.idgen = new util.IDGen();
  }

  _clear() {
    this.layers = {};
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

  addLayer(cls, name) {
    if (!cls.define || !cls.define() || !cls.define().typeName) {
      throw new Error("Invalid customdata class " + cls.name);
    }

    if (!cls.define().typeName in CDElemMap) {
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
    e.customData.length = 0;

    for (let layer of this.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      e.customData.push(new cls(e));
    }
  }

  hasLayer(typename_or_cls) {
    let typename = typename_or_cls;

    if (typeof typename !== "string") {
      typename = typename.define().typeName;
    }

    return this.layers[typename] && this.layers[typename].length > 0;
  }

  getLayerIndex(typename_or_cls) {
    let typename = typename_or_cls;

    if (typeof typename !== "string") {
      typename = typename.define().typeName;
    }

    let lset = this.layers[typename];
    if (!lset) {
      return -1;
    }

    if (!lset.active && lset.length > 0) {
      lset.active = lset[0];
    }

    return lset.active ? lset.active.index : -1;
  }

  getActiveLayer(typecls_or_name) {
    let typeName = typecls_or_name;

    if (typeof typeName !== "string") {
      typeName = typeName.define().typeName;
    }

    let set = this.layers[typeName];
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
    let set = this.layers[layer.typeName];

    set.active = layer;
  }

  remLayer(layer) {
    let set = this.layers[layer.typeName];

    if (set.active === layer) {
      set.active = set.length > 1 ? set[(set.indexOf(layer) + 1)%set.length] : undefined;
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

  getLayerSet(typename) {
    if (!(typename in this.layers)) {
      this.layers[typename] = new LayerSet(typename);
      this.layers[typename].active = undefined;
    }

    return this.layers[typename];
  }

  hasNamedLayer(name, opt_cls_or_typeName = undefined) {
    return this.getNamedLayer(name, opt_cls_or_typeName) !== undefined;
  }

  getNamedLayerIndex(name, opt_cls_or_typeName) {
    let layer = this.getNamedLayer(name, opt_cls_or_typeName);
    if (!layer) {
      return -1;
    }

    return layer.index;
  }

  getNamedLayer(name, opt_cls_or_typeName) {
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

  loadSTRUCT(reader) {
    reader(this);

    let idmap = {};

    for (let layerset of this._layers) {
      this.layers[layerset.typeName] = layerset;

      for (let layer of layerset) {
        idmap[layer.id] = layer;
      }
    }

    for (let i = 0; i < this.flatlist.length; i++) {
      this.flatlist[i] = idmap[this.flatlist[i]];
    }

    delete this._layers;
  }

  _getLayers() {
    let ret = [];

    for (let k in this.layers) {
      ret.push(this.layers[k]);
    }

    return ret;
  }
}

CustomData.STRUCT = `
mesh.CustomData {
  _layers  : array(mesh.LayerSet) | obj._getLayers();
  flatlist : array(layer, int) | layer.id;
  idgen    : IDGen;
}
`;
nstructjs.manager.add_class(CustomData);
