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

export class CustomDataElem {
  constructor() {
    this.constructor.typeName = this.constructor.define().typeName;
    this.constructor.prototype.typeName = this.constructor.define().typeName;
  }

  static apiDefine(api, dstruct) {

  }

  load(b) {
    b.copyTo(this);
    return this;
  }

  copyTo(b) {
    throw new Error("implement me");
  }
  
  copy() {
    throw new Error("implement me");
  }
    
  interp(dest, datas, ws) {
  }
  
  validate() {
    return true;
  }
  
  static define() {return {
    elemTypeMask : 0, //see MeshTypes in mesh.js
    typeName     : "typeName",
    uiTypeName   : "uiTypeName",
    defaultName  : "defaultName",
    //elemSize     : 3,
    flag         : 0
  }};
  
  static register(cls) {
    if (!cls.hasOwnProperty("STRUCT")) {
      throw new Error("You forgot to make a STRUCT script for " + cls.name);
    }
    if (!cls.structName) {
      throw new Error("You forgot to register " + cls.name + " with nstruct.manager.add_class()");
    }

    CDElemTypes.push(cls);
    CDElemMap[cls.define().typeName] = cls;
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
  constructor(typename, name, flag, id) {
    this.elemTypeMask = 0;
    this.typeName = typename;
    this.name = name;
    this.flag = flag;
    this.id = id;
    this.index = 0; //index in flat list of layers in elements
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

    for (let list of ret.flatlist) {
      let list2 = list.copy();
      ret.layers[list2.typeName] = list2;
      ret.flatlist.push(list2);
    }

    ret.idgen = this.idgen.copy();
    return ret;
  }

  addLayer(cls, name=cls.define().defaultName) {
    let type = cls.define().typeName;
    let layer = new CustomDataLayer(type, name, undefined, this.idgen.next());
    let set = this.getLayerSet(type);
    
    layer.index = this.flatlist.length;
    this.flatlist.push(layer);
    
    layer.elemTypeMask = cls.define().elemTypeMask;
    
    set.push(layer);
    
    if (this.on_layeradd) {
      this.on_layeradd(layer, set);
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

  hasLayerType(typename) {
    let set = this.getLayerSet(typename);
    return set.length > 0;
  }

  remLayer(layer) {
    let set = this.layers[layer.typeName];
    if (set.active === layer) {
      set.active = set.length > 1 ? set[(set.indexOf(layer)+1) % set.length] : undefined;
    }
    
    set.remove(layers);
    
    if (this.on_layerremove) {
      this.on_layerremove(layer, set);
    }
  }
  
  getLayerSet(typename) {
    if (!(typename in this.layers)) {
      this.layers[typename] = new LayerSet(typename);
      this.layers[typename].active = undefined;
    }
    
    return this.layers[typename];
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
