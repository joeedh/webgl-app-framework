import {DataBlock, DataRef, BlockFlags} from '../core/lib_api.js';
import '../path.ux/scripts/struct.js';
import {ToolModes, makeToolModeEnum} from '../editors/view3d/view3d_toolmode.js';
import {WidgetManager, WidgetTool, WidgetTools} from "../editors/view3d/widgets.js";

let STRUCT = nstructjs.STRUCT;
import {Graph} from '../core/graph.js';
import * as util from '../util/util.js';
import {ObjectFlags, SceneObject} from '../sceneobject/sceneobject.js';
import {DependSocket} from '../core/graphsockets.js';
import {Light} from '../light/light.js';
import {Vector3, Matrix4} from '../util/vectormath.js';

import * as THREE from '../extern/three.js';
import {print_stack} from "../util/util.js";
import {WidgetSceneCursor} from "../editors/view3d/widget_tools.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {Collection} from "./collection.js";
import {SceneObjectData} from "../sceneobject/sceneobject_base.js";

export const EnvLightFlags = {
  USE_AO : 1
};

export class EnvLight {
  constructor() {
    this.color = new Vector3([0.5, 0.8, 1]);
    this.power = 0.5;
    this.ao_dist = 5.0;
    this.ao_fac = 5.0;
    this.flag = EnvLightFlags.USE_AO;
  }
}

EnvLight.STRUCT = `
EnvLight {
  color      : vec3;
  power      : float;
  ao_dist    : float;
  ao_fac     : float;
  flag       : int;
}
`;
nstructjs.manager.add_class(EnvLight);

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
  constructor(list=undefined, scene) {
    super();

    this.scene = scene;

    this.selected = new ObjectSet(this, scene);
    this.onselect = undefined;

    if (list !== undefined) {
      for (let ob of list) {
        super.push(ob);
      }
    }

    this.active = this.highlight = undefined;
  }

  has(ob) {
    return this.indexOf(ob) >= 0;
  }

  clearSelection() {
    for (let ob of this) {
      this.setSelect(ob, false);
    }
  }

  remove(ob) {
    if (this.selected.has(ob)) {
      this.selected.remove(ob);
    }

    ob.lib_remUser(this.scene);
    return super.remove(ob);
  }

  push(ob) {
    if (ob instanceof SceneObject) {
      ob.lib_addUser(this.scene);
    }

    return super.push(ob);
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

  get renderable() {
    return this.visible;
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

  dataLink(scene, getblock, getblock_addUser) {
    this.active = getblock(this.active, scene);

    this.collection = getblock_addUser(this.collection);

    if (this.highlight !== undefined) {
      this.highlight = getblock(this.highlight, scene);
    }

    for (let ob of this.refs) {
      let ob2 = getblock_addUser(ob, scene);

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

export const SceneRecalcFlags = {
  OBJECTS : 1 //update flat object list
};

export class Scene extends DataBlock {
  constructor(objects) {
    super();

    this.collection = undefined;

    this.widgets = new WidgetManager();
    this.widgets.ctx = _appstate.ctx;
    this.cursor3D = new Matrix4();

    this.selectMask = SelMask.OBJECT;
    this.toolmodes = []; //we cache toolmode instances, these are saved in files too
    this.toolmode_map = {};
    this.toolmode_namemap = {};

    this.envlight = new EnvLight();
    this.recalc = 0;

    this.objects = new ObjectList(undefined, this);
    this.objects.onselect = this._onselect.bind(this);
    this.flag = 0;
    this._loading = false;
    
    this.time = 0.0;

    if (objects !== undefined) {
      for (let ob of objects) {
        this.add(ob);
      }
    }

    this.toolModeProp = makeToolModeEnum();
    this.toolmode_i = this.toolModeProp.values["object"];
  }

  get toolmode() {
    if (!(this.toolmode_i in this.toolmode_map)) {
      this.switchToolMode(this.toolmode_i);
    }

    return this.toolmode_map[this.toolmode_i];
  }

  get objects() {
    return this._objects;
  }

  set objects(ob) {
    if (this.recalc && !this._loading) {
      this.updateObjectList();
    }

    this._objects = ob;
  }

  regenObjectList() {
    this.recalc |= SceneRecalcFlags.OBJECTS;
  }

  get lights() {
    let this2 = this;

    let ret = (function*() {
      for (let ob of this2.objects) {
        if (ob.data instanceof Light) {
          yield ob;
        }
      }
    })();

    ret.visible = (function*() {
      for (let ob of this2.objects) {
        if (ob.flag & ObjectFlags.HIDE) {
          continue;
        }

        if (ob.data instanceof Light) {
          yield ob;
        }
      }
    })();

    //the the future they'll be a seperate flag for
    //whether something shows up in renders and shows up
    //while editing in the viewport.
    //for now just alias to ret.visible.
    ret.renderable = ret.visible;

    return ret;
  }

  //get a child collection, or may
  //a new one if necassary
  getCollection(ctx, name) {
    let cl = this.collection.getChild(name);

    let add = cl === undefined;

    //check if it exists in the datalib somewhere
    cl = cl === undefined ? ctx.datalib.collection.get(name) : cl;

    if (cl === undefined) {
      cl = new Collection(name);
      ctx.datalib.add(cl);
    }

    if (add) {
      this.collection.add(cl);
    }

    return cl;
  }

  getInternalObject(ctx, key, dataclass_or_instance) {
    let cname = "[Internal " + this.lib_id + "]";
    let name = cname + " " + key;

    let cl = this.getCollection(ctx, cname);

    let ob = ctx.datalib.object.get(name);

    if (ob === undefined) {
      ob = new SceneObject();
      ob.name = name;

      let data;

      if (dataclass_or_instance instanceof SceneObjectData) {
        data = dataclass_or_instance;
      } else {
        data = new dataclass_or_instance();
      }

      ctx.datalib.add(ob);
      ctx.datalib.add(data);

      ob.data = data;
    }
    
    ob.flag |= ObjectFlags.INTERNAL;

    if (!cl.has(ob)) {
      cl.add(ob);
      this.updateObjectList();
    }

    return ob;
  }

  updateObjectList() {
    this.recalc &= ~SceneRecalcFlags.OBJECTS;

    if (this.collection === undefined) {
      console.warn("No collection in scene!!!");
      return;
    }

    let set = new util.set();

    let rec = (cl) => {
      for (let ob of cl.objects) {
        set.add(ob);
      }

      for (let child of cl.children) {
        rec(child);
      }
    };

    rec(this.collection);

    for (let ob of this.objects) {
      if (!set.has(ob)) {
        this.objects.remove(ob);
      }
    }

    for (let ob of set) {
      if (!this.objects.has(ob)) {
        this.objects.push(ob);
        ob.lib_addUser(this);

        if (this.objects.active === undefined) {
          this.objects.active = ob;
        }
      }
    }

    rec(this.collection);
  }

  add(ob) {
    this.objects.push(ob);
    this.collection.add(ob);

    if (this.objects.active === undefined) {
      this.objects.active = ob;
    }
  }

  switchToolMode(mode) {
    console.warn("switchToolMode called");

    if (mode === undefined) {
      throw new Error("switchToolMode: mode cannot be undefined");
    }

    let i = typeof mode == "number" ? mode : this.toolModeProp.values[mode];

    if (i === undefined) {
      throw new Error("invalid tool mode " + mode);
    }

    let cls = ToolModes[i];
    let ret;

    if (this.toolmode_i in this.toolmode_map) {
      console.log("calling old tool inactive", this.toolmode, this.toolmode.onInactive);
      this.widgets.remove(this.toolmode);
      console.log(this.toolmode.widgets);

      this.toolmode.onInactive();
    }

    for (let mode of this.toolmodes) {
      if (mode.constructor === cls) {
        ret = mode;
        break;
      }
    }

    if (ret === undefined) {
      ret = new cls(this.widgets);

      let def = cls.widgetDefine();

      this.toolmodes.push(ret);
      this.toolmode_map[i] = ret;
      this.toolmode_namemap[def.name] = ret;
    }

    this.toolmode_i = i;
    this.widgets.add(ret);

    ret.onActive();

    if (this.outputs.onToolModeChange.hasEdges) {
      this.outputs.onToolModeChange.update();
    }

    return ret;
  }

  remove(ob) {
    if (ob === undefined || this.objects.indexOf(ob) < 0) {
      console.log("object not in scene", ob);
      return;
    }
    
    this.objects.remove(ob);
  }

  destroy() {
    try {
      this.destroyIntern();
    } catch (error) {
      util.print_stack(error);
      console.log("got error in Scene.prototype.destroy");
    }
  }

  destroyIntern() {
    for (let ob of this.objects) {
      ob.lib_remUser();
    }

    this.objects = new ObjectSet(undefined, this);
    this.objects.onselect = this._onselect.bind(this);

    for (let tool of this.toolmodes) {
      //tool.
    }

    this.widgets.destroy(this.widgets.gl);
  }
  
  static blockDefine() { return {
    typeName    : "scene",
    defaultName : "Scene",
    uiName   : "Scene",
    flag     : BlockFlags.FAKE_USER, //always have user count > 0
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
      onSelect : new DependSocket("Selection Change"),
      onToolModeChange : new DependSocket("Toolmode Change")
    }
  }}

  loadSTRUCT(reader) {
    this._loading = true;

    //very important these three lines go *before*
    //call to reader(this)
    this.toolmodes = [];
    this.toolmode_map = {};
    this.toolmode_namemap = {};

    reader(this);
    super.loadSTRUCT(reader);

    this.objects.scene = this;
    this.objects.onselect = this._onselect.bind(this);

    this.widgets.ctx = _appstate.ctx;
    this.widgets.clear();

    let found = 0;

    this.toolmode_i = this.toolModeProp.values[this.toolmode_i];

    for (let mode of this.toolmodes) {
      mode.setManager(this.widgets);

      let def = mode.constructor.widgetDefine();
      let i = this.toolModeProp.values[def.name];

      if (i === this.toolmode_i) {
        this.widgets.add(mode);
        found = 1;
      }

      this.toolmode_map[i] = mode;
      this.toolmode_namemap[def.name] = mode;
    }

    if (!found) {
      let i = this.toolmode_i;
      this.toolmode_i = -1;

      this.switchToolMode(i);
    }
  }
  
  dataLink(getblock, getblock_addUser) {
    super.dataLink(...arguments);

    if (this._linked) {
      console.log("DOUBLE CALL TO dataLink");
      return;
    }

    this._linked = true;

    this.objects.dataLink(this, getblock, getblock_addUser);
    delete this.active;

    this._loading = false;
    this.regenObjectList();

    for (let tool of this.toolmodes) {
      tool.dataLink(this, getblock, getblock_addUser);
    }
  }

  updateWidgets() {
    let ctx = this.widgets.ctx;

    if (ctx === undefined || ctx.scene === undefined) {
      return;
    }

    try {
      this.updateWidgets_intern();
    } catch (error) {
      print_stack(error);
      console.warn("updateWidgets() failed");
    }
  }

  updateWidgets_intern() {
    let ctx = this.widgets.ctx;
    if (ctx === undefined)
      return;

    this.widgets.update(this);
    if (this.toolmode !== undefined) {
      this.toolmode.update();
    }
  }
}
DataBlock.register(Scene);
Scene.STRUCT = STRUCT.inherit(Scene, DataBlock) + `
  flag       : int;
  objects    : ObjectList;
  active     : int | obj.active !== undefined ? obj.active.lib_id : -1;
  time       : float;
  selectMask : int;
  cursor3D   : mat4;
  envlight   : EnvLight;
  toolmode_i : string | obj.toolModeProp.keys[obj.toolmode_i];
  toolmodes  : array(abstract(ToolMode));
  collection : DataRef | DataRef.fromBlock(obj.collection);
}
`;

nstructjs.manager.add_class(Scene);