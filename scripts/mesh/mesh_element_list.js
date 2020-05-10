import {Edge} from "./mesh_types.js";
import {MeshError, MeshFlags, MeshTypes} from "./mesh_base.js";
import * as util from "../util/util.js";
import '../path.ux/scripts/struct.js';
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

export class ElementList extends Array {
  constructor(type) {
    super();

    this.customData = new CustomData();
    this.local_eidmap = {};

    this.type = type;
    this.selected = new SelectionSet();
    this.on_selected = undefined;
    this.highlight = this.active = undefined;
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
    return super.reverse();
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
      super.push(e2);
      if (e2.flag & MeshFlags.SELECT) {
        this.selected.add(e2);
      }

      if (e2.eid == obj.active) {
        this.active = e2;
      } else if (e2.eid == obj.highlight) {
        this.highlight = e2;
      }
    }
  }

  push(v) {
    super.push(v);

    if (v.flag & MeshFlags.SELECT) {
      this.selected.add(v);
    }

    this.local_eidmap[v.eid] = v;

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

    super.remove(v);

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

  loadSTRUCT(reader) {
    reader(this);

    let act = this.active;
    let high = this.highlight;

    this.highlight = undefined;
    this.active = undefined;

    for (let item of this.items) {
      this.push(item)

      this.local_eidmap[item.eid] = item;

      if (item.eid == act) {
        this.active = item;
      }
      if (item.eid == high) {
        this.highlight = item;
      }
    }

    this.selected.clear();

    for (let item of this.items) {
      if (item.flag & MeshFlags.SELECT) {
        this.selected.add(item);
      }
    }
  }

  fixCustomData() {
    let cd = this.customData;

    for (let e of this) {
      if (e.customData.length === cd.flatlist.length) {
        continue;
      }

      console.warn("Element was missing customdata", e);

      for (let k in cd.layers) {
        let layerset = cd.layers[k];
        if (layerset.length === 0) {
          continue;
        }

        let count = 0;
        for (let cdl of e.customData) {
          if (cdl.typeName == layerset.typeName) {
            count++;
          }
        }

        let typecls = CustomDataElem.getTypeClass(layerset.typeName);

        for (let i = count; i < layerset.length; i++) {
          e.customData.push(new typecls());
        }
      }
    }
  }
};
ElementList.STRUCT = `
mesh.ElementList {
  items       : array(abstract(mesh.Element)) | obj;
  active      : int | obj.active !== undefined ? obj.active.eid : -1;
  highlight   : int | obj.highlight !== undefined ? obj.highlight.eid : -1;
  type        : int;
  customData  : mesh.CustomData; 
}
`;
nstructjs.manager.add_class(ElementList);
