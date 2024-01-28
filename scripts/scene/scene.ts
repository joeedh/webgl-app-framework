import {DataBlock, DataRef, BlockFlags} from '../core/lib_api';
import {ToolModes, makeToolModeEnum, ToolMode} from '../editors/view3d/view3d_toolmode.js';
import {WidgetManager} from "../editors/view3d/widgets/widgets.js";
import {EnumProperty, nstructjs, util} from '../path.ux/scripts/pathux.js';

import {ObjectFlags, SceneObject} from '../sceneobject/sceneobject';
import {DependSocket, FloatSocket} from '../core/graphsockets.js';
import {Light} from '../light/light.js';
import {Vector3, Matrix4} from '../util/vectormath.js';

//import {WidgetSceneCursor} from "../editors/view3d/widgets/widget_tools.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {Collection} from "./collection";
import {SceneObjectData} from "../sceneobject/sceneobject_base";
import {SceneBVH} from '../sceneobject/scenebvh.js';

export enum EnvLightFlags {
  USE_AO = 1
}

export class EnvLight {
  static STRUCT = nstructjs.inlineRegister(this, `
  EnvLight {
    color      : vec3;
    power      : float;
    ao_dist    : float;
    ao_fac     : float;
    flag       : int;
    sunColor   : vec3;
    sunPower   : float;
    sunRadius  : float;
    sunDir     : vec3;
  }`);

  color = new Vector3([1.0, 1.0, 1]);
  power = 0.55;
  ao_dist = 25.0;
  ao_fac = 0.7;
  flag = EnvLightFlags.USE_AO;

  sunDir = (new Vector3([-0.14083751989292737, -0.4480698391806443, -0.8828353256451855])).normalize();

  sunPower = 0.33;
  sunRadius = 0.5;
  sunColor = new Vector3([1, 1, 1]);
  sunLight = undefined;

  _digest = new util.HashDigest();

  constructor() {
  }

  calcUpdateHash(): number {
    let ret = this._digest;

    ret.reset();

    for (let i = 0; i < 3; i++) {
      ret.add(this.color[i]*1024);
    }

    ret.add(this.ao_dist*1024);
    ret.add(this.ao_fac*1024);
    ret.add(this.flag*1024);
    ret.add(this.power*1024);

    for (let i = 0; i < 3; i++) {
      ret.add(this.sunDir[i]);
      ret.add(this.sunColor[i]);
    }

    ret.add(this.sunPower);
    ret.add(this.sunRadius);

    return ret.get();
  }
}

export const SceneFlags = {
  SELECT: 1
};

export class ObjectSet extends util.set<SceneObject> {
  list: ObjectList

  constructor(list: ObjectList, scene: Scene) {
    super();
    this.list = list;
  }

  get renderable(): Iterable<SceneObject> {
    let this2 = this;

    return (function* () {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE)) {
          continue;
        }

        yield ob;
      }
    })();
  }

  get editable(): Iterable<SceneObject> {
    let this2 = this;

    return (function* () {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE | ObjectFlags.LOCKED)) {
          continue;
        }

        yield ob;
      }
    })();
  }
}

export class ObjectList extends Array {
  static STRUCT = nstructjs.inlineRegister(this, `
  ObjectList {
    refs       : array(DataRef) | obj._getDataRefs();
    active     : DataRef |  DataRef.fromBlock(obj.active);
    highlight  : DataRef |  DataRef.fromBlock(obj.highlight);
  }`);

  scene: Scene
  selected: ObjectSet

  onselect?: (ob: SceneObject, state: boolean) => void = undefined;

  active?: SceneObject = undefined;
  highlight?: SceneObject = undefined;

  constructor(list = undefined, scene) {
    super();

    this.scene = scene;
    this.selected = new ObjectSet(this, scene);

    if (list !== undefined) {
      for (let ob of list) {
        super.push(ob);
      }
    }
  }

  has(ob: SceneObject): boolean {
    return this.indexOf(ob) >= 0;
  }

  clearSelection(): void {
    for (let ob of this) {
      this.setSelect(ob, false);
    }
  }

  remove(ob: SceneObject): void {
    if (this.selected.has(ob)) {
      this.selected.remove(ob);
    }

    if (ob === this.active) {
      this.active = undefined;
    }

    ob.lib_remUser(this.scene);
    return super.remove(ob);
  }

  push(ob: SceneObject): number {
    if (ob instanceof SceneObject) {
      ob.lib_addUser(this.scene);
    }

    return super.push(ob);
  }

  get editable(): Iterable<SceneObject> {
    let this2 = this;

    return (function* () {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE | ObjectFlags.LOCKED)) {
          continue;
        }

        yield ob;
      }
    })();
  }

  get visible(): Iterable<SceneObject> {
    let this2 = this;

    return (function* () {
      for (let ob of this2) {
        if (ob.flag & (ObjectFlags.HIDE)) {
          continue;
        }

        yield ob;
      }
    })();
  }

  get renderable(): Iterable<SceneObject> {
    return this.visible;
  }

  setSelect(ob: SceneObject, state: boolean): void {
    const execCallback = !!(ob.flag & ObjectFlags.SELECT) === !!state;

    if (!state) {
      ob.flag &= ~ObjectFlags.SELECT;

      if (this.selected.has(ob)) {
        this.selected.remove(ob);
      }
    } else {
      ob.flag |= ObjectFlags.SELECT;
      this.selected.add(ob);
    }

    if (execCallback && this.onselect) {
      this.onselect(ob, state);
    }
  }

  setHighlight(ob: SceneObject): void {
    if (this.highlight !== undefined) {
      this.highlight.flag &= ~ObjectFlags.HIGHLIGHT;
    }

    this.highlight = ob;

    if (ob !== undefined) {
      ob.flag |= ObjectFlags.HIGHLIGHT;
    }
  }

  setActive(ob: SceneObject): void {
    if (this.active !== undefined) {
      this.active.flag &= ~ObjectFlags.ACTIVE;
    }

    this.active = ob;
    if (ob !== undefined) {
      ob.flag |= ObjectFlags.ACTIVE;
    }
  }

  dataLink(scene: Scene, getblock: (ref: any, owner: any) => any, getblock_addUser: (ref: any, owner: any) => any) {
    this.active = getblock(this.active, scene);

    if (this.highlight !== undefined) {
      this.highlight = getblock(this.highlight, scene);
    }

    for (let ob of ((this as unknown as any).refs) as any[]) {
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

    delete (this as unknown as { refs: any[] }).refs;
  }

  _getDataRefs(): DataRef[] {
    let ret: DataRef[] = [];

    for (let ob of this) {
      ret.push(DataRef.fromBlock(ob));
    }

    return ret;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
  }
}

export const SceneRecalcFlags = {
  OBJECTS: 1 //update flat object list
};

import messageBus from '../core/bus.js';
import {StructReader} from '../path.ux/scripts/path-controller/types/util/nstructjs.js';
import {ToolContext} from '../../types/scripts/core/context.js';

export class Scene<InputSet = {}, OutputSet = {}> extends DataBlock<
  InputSet & {},
  OutputSet &
  {
    onSelect: DependSocket,
    onToolModeChange: DependSocket,
    onTimeChange: FloatSocket
  }
> {
  static STRUCT = nstructjs.inlineRegister(this, `
Scene {
  flag         : int;
  objects      : ObjectList;
  active       : int | obj.active !== undefined ? obj.active.lib_id : -1;
  time         : float;
  selectMask   : int;
  cursor3D     : mat4;
  envlight     : EnvLight;
  toolmode_i   : string | obj.toolModeProp.keys[obj.toolmode_i];
  toolmodes    : array(abstract(ToolMode));
  collection   : DataRef | DataRef.fromBlock(obj.collection);
  fps          : int;
  propMode     : int;
propIslandOnly : bool;
  propRadius   : float;
  propEnabled  : bool;
}
  `);

  #linked?: boolean

  ctx: ToolContext;
  collection?: Collection = undefined;
  sbvh: SceneBVH;
  //magnet transform settings
  propRadius = 1.0;
  propMode = 0;
  propEnabled = false;
  propIslandOnly = true;

  widgets = new WidgetManager();
  cursor3D = new Matrix4();

  selectMask = SelMask.OBJECT;
  toolmodes: ToolMode[] = []; //we cache toolmode instances, these are saved in files too
  toolmode_map: { [k: string]: ToolMode } = {};
  toolmode_namemap: { [k: string]: ToolMode } = {};
  toolModeProp = makeToolModeEnum();
  toolmode_i: number;

  envlight = new EnvLight();
  recalc = 0;

  _objects: ObjectList;
  get objects() {
    return this._objects;
  }

  set objects(ob) {
    if (this.recalc && !this.#loading) {
      this.updateObjectList();
    }
    this._objects = ob;
  }

  flag = 0;
  #loading = false;
  time = 0.0;
  fps = 30.0;
  timeStart = 0.0; //in seconds
  timeEnd = 10.0; //in seconds

  constructor(objects: Iterable<SceneObject> = []) {
    super();


    this.sbvh = new SceneBVH(this);

    //XXX hack!
    this.widgets.ctx = window._appstate.ctx;

    this.objects = new ObjectList(undefined, this);
    this.objects.onselect = this._onselect.bind(this);

    if (objects !== undefined) {
      for (let ob of objects) {
        this.add(ob);
      }
    }

    this.toolmode_i = this.toolModeProp.values["object"] as number;

    let busgetter = () => {
      if (!window._appstate || !window._appstate.datalib) {
        return undefined;
      }

      //check if scene is still in datalib
      let block = window._appstate.datalib.get(this.lib_id);
      if (block !== this) {
        return undefined;
      }

      return this;
    }

    messageBus.subscribe(busgetter, ToolMode, () => {
      let key = this.toolModeProp.keys[this.toolmode_i];

      this.toolModeProp = makeToolModeEnum();
      this.toolmode_i = this.toolModeProp.values[key] as number;

      if (this.toolmode_i === undefined) {
        this.switchToolMode(0);
      }

      //update enum property in data api
      if (window._appstate && window._appstate.api) {
        let st = window._appstate.api.mapStruct(Scene, false);

        st.pathmap.toolmode.data.updateDefinition(this.toolModeProp);
      }
    }, ["REGISTER", "UNREGISTER"], 1)
  }

  get toolmode() {
    if (!(this.toolmode_i in this.toolmode_map)) {
      this.switchToolMode(this.toolmode_i);
    }

    return this.toolmode_map[this.toolmode_i];
  }

  regenObjectList() {
    this.recalc |= SceneRecalcFlags.OBJECTS;
  }

  get lights() {
    let this2 = this;

    let ret = (function* () {
      for (let ob of this2.objects) {
        if (ob.data instanceof Light) {
          yield ob;
        }
      }
    })() as unknown as Iterable<Light> & { visible: Iterable<Light>, renderable: Iterable<Light> };

    ret.visible = (function* () {
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
  getCollection(ctx: ToolContext, name: string): Collection {
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

  getInternalObject(ctx: ToolContext, key: string | number,
                    dataclass_or_instance: SceneObjectData["constructor"] | SceneObjectData): SceneObject {
    let cname = "[Internal " + this.lib_id + "]";
    let name = cname + " " + key;

    console.warn("getInternalObject called");

    let cl = this.getCollection(ctx, cname);

    let ob = ctx.datalib.object.get(name);

    if (ob === undefined) {
      ob = new SceneObject();
      ob.name = name;

      let data: SceneObjectData;

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

  updateObjectList(): void {
    this.recalc &= ~SceneRecalcFlags.OBJECTS;

    if (this.collection === undefined) {
      console.warn("No collection in scene!!!");
      return;
    }

    let set = new Set<SceneObject>();

    let rec = (cl: Collection): void => {
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

  add(ob: SceneObject): void {
    this.objects.push(ob);
    this.collection.add(ob);

    if (this.objects.active === undefined) {
      this.objects.active = ob;
    }
  }

  switchToolMode(mode: boolean | number | string, _file_loading = false) {
    console.warn("switchToolMode called");

    if (mode === undefined) {
      throw new Error("switchToolMode: mode cannot be undefined");
    }

    if (typeof mode === "boolean") {
      mode = mode ? 1 : 0;
    }

    let i = typeof mode == "number" ? mode : this.toolModeProp.values[mode] as number;

    if (i === undefined) {
      throw new Error("invalid tool mode " + mode);
    }

    let old: ToolMode;
    let cls = ToolModes[i];
    let ret: ToolMode;

    if (this.toolmode_i in this.toolmode_map) {
      console.log("calling old tool inactive", this.toolmode, this.toolmode.onInactive);

      if (!_file_loading) {
        this.toolmode.onInactive();
      }
    }

    for (let mode of this.toolmodes) {
      if (mode.constructor === cls) {
        ret = mode;
        break;
      }
    }

    if (this.toolmode_i < this.toolmodes.length && this.toolmode_i >= 0) {
      old = this.toolmodes[this.toolmode_i];
      old.storedSelectMask = this.selectMask;
    }

    if (ret === undefined) {
      ret = new cls(this.widgets);

      let def = cls.toolModeDefine();

      this.toolmodes.push(ret);
      this.toolmode_map[i] = ret;
      this.toolmode_namemap[def.name] = ret;
    }

    ret.ctx = this.ctx;
    this.toolmode_i = i;

    if (ret.storedSelectMask === -1 || ret.storedSelectMask === undefined) {
      let def = cls.toolModeDefine();

      if (def.selectMode !== undefined) {
        ret.storedSelectMask = def.selectMode;
      }
    }

    if (ret.storedSelectMask >= 0) {
      this.selectMask = ret.storedSelectMask;
    }

    if (_file_loading) {
      window.setTimeout(() => {
        if (ret === this.toolmode) {
          ret.onActive();
        }
      }, 10);
    } else {
      ret.onActive();
    }

    if (!_file_loading && this.outputs.onToolModeChange.hasEdges) {
      this.outputs.onToolModeChange.graphUpdate();
    }

    return ret;
  }

  remove(ob: SceneObject) {
    if (ob === undefined || this.objects.indexOf(ob) < 0) {
      console.log("object not in scene", ob);
      return;
    }

    this.objects.remove(ob);
    this.collection.remove(ob);
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

    this.objects = new ObjectList(undefined, this);
    this.objects.onselect = this._onselect.bind(this);

    for (let tool of this.toolmodes) {
      //tool.
    }

    this.widgets.destroy(this.widgets.gl);
  }

  static blockDefine() {
    return {
      typeName   : "scene",
      defaultName: "Scene",
      uiName     : "Scene",
      flag       : BlockFlags.FAKE_USER, //always have user count > 0
      icon       : -1
    }
  }

  _onselect(obj: SceneObject, state: boolean): void {
    if (this.outputs.onSelect.hasEdges) {
      this.outputs.onSelect.graphUpdate();
    }
  }

  static nodedef() {
    return {
      name   : "scene",
      uiname : "Scene",
      flag   : 0,
      inputs : {},
      outputs: {
        onSelect        : new DependSocket("Selection Change"),
        onToolModeChange: new DependSocket("Toolmode Change"),
        onTimeChange    : new FloatSocket("Time Change")
      }
    }
  }

  changeTime(newtime: number): void {
    let oldtime = this.time;

    console.log("time change!", newtime);

    this.time = newtime;
    for (let ob of this.objects) {
      ob.graphUpdate();
    }

    if (this.collection) {
      this.collection.update();
      for (let c of this.collection.flatChildren) {
        c.graphUpdate();
      }
    }

    this.outputs.onTimeChange.graphUpdate();
    window.updateDataGraph(true);
  }

  loadSTRUCT(reader: StructReader<this>): void {
    this.#loading = true;

    //very important these three lines go *before*
    //call to reader(this)
    this.toolmodes = [];
    this.toolmode_map = {};
    this.toolmode_namemap = {};

    reader(this);
    super.loadSTRUCT(reader);

    this.objects.scene = this;
    this.objects.onselect = this._onselect.bind(this);

    this.widgets.ctx = window._appstate.ctx;
    this.widgets.clear();

    let found = 0;

    //detected dead toolmodes
    this.toolmodes = this.toolmodes.filter(mode => mode.setManager);
    this.toolmode_i = this.toolModeProp.values[this.toolmode_i] as number;

    //sanity check
    if (this.toolmode_i === undefined) {
      this.toolmode_i = 0;
    }

    for (let mode of this.toolmodes) {
      mode.setManager(this.widgets);

      let def = (mode.constructor as unknown as { toolModeDefine(): { name: string } }).toolModeDefine();
      let i = this.toolModeProp.values[def.name];

      if (i === this.toolmode_i) {
        found = 1;
      }

      this.toolmode_map[i] = mode;
      this.toolmode_namemap[def.name] = mode;
    }

    if (!found) {
      let i = this.toolmode_i;
      this.toolmode_i = -1;

      this.switchToolMode(0, true);
    }
  }

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);

    this.collection = getblock_addUser(this.collection, this);

    if (this.#linked) {
      console.log("DOUBLE CALL TO dataLink");
      return;
    }

    this.#linked = true;

    this.objects.dataLink(this, getblock, getblock_addUser);
    delete (this as unknown as any).active;

    this.#loading = false;
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

    let toolmode = this.toolmode;
    if (toolmode) {
      toolmode.ctx = ctx;
    }

    try {
      this.updateWidgets_intern();
    } catch (error) {
      util.print_stack(error);
      console.warn("updateWidgets() failed");
    }
  }

  updateWidgets_intern() {
    let ctx = this.widgets.ctx;
    if (ctx === undefined)
      return;

    this.ctx = ctx;

    this.widgets.update(this);
    if (this.toolmode !== undefined) {
      this.toolmode.ctx = ctx;
      this.toolmode.update();
    }
  }
}

DataBlock.register(Scene);
