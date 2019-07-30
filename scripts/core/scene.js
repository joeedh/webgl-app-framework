import {DataBlock, DataRef} from './lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Graph} from './graph.js';
import * as util from '../util/util.js';
import {ObjectFlags} from './sceneobject.js';
import {DependSocket} from './graphsockets.js';

export const SceneFlags = {
  SELECT : 1
};

export class ObjectSet extends util.set {
  constructor(oblist) {
    super();
    this.list = oblist;
  }

  get editable() {
    let this2 = this;

    return (function*() {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE|ObjectFlags.LOCKED)) {
          continue;
        }

        yield ob;
      }
    })();
  }
}

export class ObjectList extends Array {
  constructor(list=undefined) {
    super();

    this.selected = new ObjectSet(this);
    this.onselect = undefined;

    if (list !== undefined) {
      for (let ob of list) {
        super.push(ob);
      }
    }

    this.active = this.highlight = undefined;
  }

  clearSelection() {
    for (let ob of this) {
      this.setSelect(ob, false);
    }
  }

  get editable() {
    let this2 = this;

    return (function*() {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE|Object.LOCKED)) {
          continue;
        }

        yield ob;
      }
    })();
  }

  get visible() {
    let this2 = this;

    return (function*() {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE)) {
          continue;
        }

        yield ob;
      }
    })();
  }

  setSelect(ob, state) {
    if (!state) {
      ob.flag &= ~ObjectFlags.SELECT;
      this.selected.remove(ob);
    } else {
      ob.flag |= ObjectFlags.SELECT;
      this.selected.add(ob);
    }

    if (!!(ob.flag & ObjectFlags.SELECT) == !!state) {
      return;
    }

    //. . .exec callbacks?
    if (this.onselect) {
      this.onselect(ob, state);
    }
  }

  setHighlight(ob) {
    if (this.highlight !== undefined) {
      this.highlight.flag &= ~ObjectFlags.HIGHLIGHT;
    }

    this.highlight = ob;

    if (ob !== undefined) {
      ob.flag |= ObjectFlags.HIGHLIGHT;
    }
  }

  setActive(ob) {
    if (this.active !== undefined) {
      this.active.flag &= ~ObjectFlags.ACTIVE;
    }

    this.active = ob;
    if (ob !== undefined) {
      ob.flag |= ObjectFlags.ACTIVE;
    }
  }

  dataLink(scene, getblock, getblock_us) {
    this.active = getblock(this.active, scene);

    if (this.highlight !== undefined) {
      this.highlight = getblock(this.highlight, scene);
    }

    for (let ob of this.refs) {
      let ob2 = getblock_us(ob, scene);

      if (ob2 === undefined) {
        console.warn("Warning: missing SceneObject in scene");
        continue;
      }

      super.push(ob2);

      if (ob2.flag & ObjectFlags.SELECT) {
        this.selected.add(ob2);
      }
    }

    delete this.refs;
  }

  _getDataRefs() {
    let ret = [];

    for (let ob of this) {
      ret.push(DataRef.fromBlock(ob));
    }

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
};

ObjectList.STRUCT = `
ObjectList {
  refs       : array(DataRef) | obj._getDataRefs();
  active     : DataRef |  DataRef.fromBlock(obj.active);
  highlight  : DataRef |  DataRef.fromBlock(obj.highlight);
}
`;
nstructjs.manager.add_class(ObjectList);

export class Scene extends DataBlock {
  constructor(objects) {
    super();
    
    this.objects = new ObjectList();
    this.objects.onselect = this._onselect.bind(this);
    this.flag = 0;
    
    this.time = 0.0;

    if (objects !== undefined) {
      for (let ob of objects) {
        this.add(ob);
      }
    }
  }

  add(ob) {
    this.objects.push(ob);
    
    if (this.objects.active === undefined) {
      this.objects.active = ob;
    }
    
    ob.lib_addUser(this);
  }
  
  remove(ob) {
    if (ob === undefined || this.objects.indexOf(ob) < 0) {
      console.log("object not in scene", ob);
      return;
    }
    
    ob.lib_remUser(ob);
    this.objects.remove(ob);
  }
  
  destroy() {
    for (let ob of this.objects) {
      ob.lib_remUser();
    }
  }
  
  static blockDefine() { return {
    typeName    : "scene",
    defaultName : "Scene",
    uiName   : "Scene",
    flag     : 0,
    icon     : -1
  }}

  _onselect(obj, state) {
    if (this.outputs.onSelect.hasEdges) {
      this.outputs.onSelect.update();
    }
  }

  static nodedef() {return {
    name    : "scene",
    uiname  : "Scene",
    flag    : 0,
    outputs : {
      onSelect : new DependSocket("Selection Change")
    }
  }}

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.objects.onselect = this._onselect.bind(this);
  }
  
  dataLink(getblock, getblock_us) {
    this.objects.dataLink(this, getblock, getblock_us);

    delete this.active;
  }
}
DataBlock.register(Scene);
Scene.STRUCT = STRUCT.inherit(Scene, DataBlock) + `
  flag      : int;
  objects   : ObjectList;
  active    : int | obj.active !== undefined ? obj.active.lib_id : -1;
  time      : float;
}
`;

nstructjs.manager.add_class(Scene);
