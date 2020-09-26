import '../path.ux/scripts/util/struct.js';
import * as util from '../util/util.js';
import {Node} from "../core/graph.js";
let STRUCT = nstructjs.STRUCT;

export const CDFlags = {
  SELECT       : 1,
  SINGLE_LAYER : 2
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

  static define() {return {
    elemTypeMask : 0, //see MeshTypes in mesh.js
    typeName     : "typeName",
    uiTypeName   : "uiTypeName",
    defaultName  : "defaultName",
    valueSize    : undefined,
    flag         : 0
  }};

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

export function buildCDAPI(api, dstruct) {
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
      for (let i=0; i<list.length; i++) {
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

export class CustomDataLayer {
  constructor(typename, name=this.constructor.name, flag=0, id=-1) {
    this.elemTypeMask = 0;
    this.typeName = typename;
    this.name = name;
    this.flag = flag;
    this.id = id;
    this.index = 0; //index in flat list of layers in elements
  }

  [Symbol.keystr]() {
    return cdLayerKey(this.typeName, this.name);
  }

  copy() {
    let ret = new CustomDataLayer(this.typeName, this.name, this.flag, this.id);

    ret.index = this.index;
    ret.elemTypeMask = this.elemTypeMask;

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}

CustomDataLayer.STRUCT = `
mesh.CustomDataLayer {
  typeName      : string;
  name          : string;
  flag          : int;
  id            : int;
  index         : int;
  elemTypeMask  : int;
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

  getLayer(cls, idx=0) {
    let j = 0;

    for (let i=0; i<this.length; i++) {
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

  copy() {
    let ret = new CustomData();
    ret.idgen = this.idgen.copy();

    for (let layer of this.flatlist) {
      let layer2 = layer.copy();
      let lset = ret.getLayerSet(layer.typeName);

      layer2.index = ret.flatlist.length;
      ret.flatlist.push(layer2);

      lset.push(layer2);
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
      e.customData.push(new cls());
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

    let i = 0;
    for (let layer of this.flatlist) {
      if (layer.typeName === typename) {
        return i;
      }

      i++;
    }

    return -1;
  }

  remLayer(layer) {
    let set = this.layers[layer.typeName];

    if (set.active === layer) {
      set.active = set.length > 1 ? set[(set.indexOf(layer)+1) % set.length] : undefined;
    }

    set.remove(layer);

    this._updateFlatList();

    if (this.on_layerremove) {
      this.on_layerremove(layer, set);
    }
  }

  _updateFlatList() {
    for (let i=0; i<this.flatlist.length; i++) {
      this.flatlist[i].index = i;
    }
  }

  _getUniqueName(name) {
    let count = (name) => {
      let c = 0;
      for (let layer of this.flatlist) {
        if (layer.name === name) {
          c++;
        }
      }

      return c;
    }

    let name2 = name;
    let i = 2;

    while (count(name2) > 0) {
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

  hasNamedLayer(name, opt_cls_or_typeName=undefined) {
    return this.getNamedLayer(name, opt_cls_or_typeName) !== undefined;
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
        return name;
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

    for (let i=0; i<this.flatlist.length; i++) {
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
