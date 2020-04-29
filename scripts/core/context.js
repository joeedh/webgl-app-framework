import '../path.ux/scripts/struct.js';
import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {getContextArea, Editor} from '../editors/editor_base.js';
import {ResourceBrowser} from "../editors/resbrowser/resbrowser.js";
import * as util from '../util/util.js';
import {Mesh} from '../mesh/mesh.js';
import {Light} from '../light/light.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {Scene} from './scene.js';
import {DataRef} from './lib_api.js';
import {ToolStack, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {DebugEditor} from "../editors/debug/DebugEditor.js";
import * as ui_noteframe from '../path.ux/scripts/ui_noteframe.js';
import {PointSet} from '../potree/potree_types.js';
import {Matrix4} from "../util/vectormath.js";
import {MenuBarEditor} from "../editors/menu/MainMenu.js";
import {PropsEditor} from "../editors/properties/PropsEditor.js";

export class ToolContext {
  constructor(appstate=_appstate) {
    this._appstate = appstate;
  }

  //used by UI code
  get last_tool() {
    return _appstate._last_tool;
  }

  /***
   * Returns a new ctx with key overridden
   */
  override(overrides={}) {
    for (let k in overrides) {
      let v = overrides[k];

      if (typeof v === "object") {
        throw new Error("overrides must be function getters that looks up data in real time");
      }
    }

    let keys = new Set();

    for (let k in this) {
      keys.add(k);
    }

    for (let k in Object.getOwnPropertyDescriptors(this)) {
      keys.add(k);
    }

    for (let k in this.__proto__) {
      keys.add(k);
    }

    let proto = this;

    while (proto) {
      for (let k in proto) {
        keys.add(k);
      }

      for (let k in Object.getOwnPropertyDescriptors(proto)) {
        keys.add(k);
      }

      proto = proto.__proto__;
    }

    let ret = {};

    ret.error = this.error;
    ret.warning = this.warning;
    ret.message = this.message;
    ret.save = () => {};

    for (let k of keys) {
      if (!ret[k] && k !== "constructor" && k !== "appstate") {
        ret[k] = this[k];
      }
    }

    function setprop(k) {
      Object.defineProperty(ret, k, {
        get : function() {
          return overrides[k].call(this);
        }
      });
    }

    for (let k in overrides) {
      setprop(k);
    }

    return ret;
  }

  error(message, timeout=1500) {
    let state = this.state;

    console.warn(message);

    if (state && state.screen) {
      return ui_noteframe.error(state.screen, message, timeout);
    }
  }

  warning(message, timeout=1500) {
    let state = this.state;

    console.warn(message);

    if (state && state.screen) {
      return ui_noteframe.warning(state.screen, message, timeout);
    }
  }

  message(msg, timeout=1500) {
    let state = this.state;

    console.warn(msg);

    if (state && state.screen) {
      return ui_noteframe.message(state.screen, msg, timeout);
    }
  }

  progbar(msg, perc=0.0, timeout=1500, id=msg) {
    let state = this.state;

    if (state && state.screen) {
      //progbarNote(screen, msg, percent, color, timeout) {
      return ui_noteframe.progbarNote(state.screen, msg, perc, "green", timeout, id);
    }
  }

  get appstate() { /** application state */
    console.warn("Deprecated read of context.appstate; use context.state instead");
    return this._appstate;
  }

  get graph() { /** execution graph */
    return this._appstate.datalib.graph;
  }

  get toolmode() {
    let scene = this.scene;
    
    return scene !== undefined ? scene.toolmode : undefined;
  }

  get toolstack() {
    return this._appstate.toolstack;
  }

  get api() { /** get controller api */
    return this.state.api;
  }
  
  get state() {
    return this._appstate;
  }
  
  get datalib() { /** get main Library database*/
    return this.state.datalib;
  }
  
  get scene() { /** get active scene */
    return this.datalib.getLibrary("scene").active;
  }

  get object() { /** get active object */
    let scene = this.scene;
    return scene !== undefined ? scene.objects.active : undefined;
  }
  
  get mesh() { /** get active mesh, basically ctx.object.data */
    let ob = this.object;
    
    if (ob !== undefined) {
      return ob.data instanceof Mesh ? ob.data : undefined;
    }
  }

  get light() {
    let ob = this.object;

    if (ob !== undefined) {
      return ob.data instanceof Light ? ob.data : undefined;
    }
  }

  /* unlike selectedMeshObjects, this returns all light objects
   * even if they share .data Light instances*/
  get selectedLightObjects() {
    let this2 = this;

    return (function*() {
      for (let ob of this2.scene.objects) {
        if (ob.data.type instanceof Light) {
          yield ob.data;
        }
      }
    })();
  }

  /** get all selected (and visible) objects */
  get selectedObjects() {
    return this.scene.objects.selected.editable;
  }

  /**returns selected mesh objects,
    ignoring objects that use the same mesh
    instance (only one will get yielded in that case)
   */
  get selectedMeshObjects() {
    let this2 = this;
    return (function*() {
      let visit = new util.set();

      for (let ob of this2.selectedObjects) {
        let bad = ob.data === undefined;
        bad = bad || !(ob.data instanceof Mesh);
        bad = bad || visit.has(ob.data);

        if (bad) {
          continue;
        }

        yield ob;
      }
    })();
  }
}

/** includes UI stuff that ToolOps can't use
 *  unless in modal mode
 */
export class Context extends ToolContext {
  get view3d() {
    return getContextArea(View3D);
  }

  get propsbar() {
    return getContextArea(PropsEditor);
  }

  get menubar() {
    return getContextArea(MenuBarEditor);
  }

  get selectMask() {
    return this.scene.selectMask;
  }

  get resbrowser() {
    return getContextArea(ResourceBrowser);
  }

  get debugEditor() {
    return getContextArea(DebugEditor);
  }

  get gl() {
    return this.view3d.gl;
  }

  pset() {
    let obj = this.object;

    if (obj !== undefined && obj.data instanceof PointSet) {
      return pset;
    }
  }

  get material() {
    let pset = this.pset;

    if (pset !== undefined) {
      return pset.material;
    }
  }

  get nodeEditor() {
    return getContextArea(NodeEditor);
  }

  get area() {
    return Editor.getActiveArea();
  }

  get screen() {
    return this.state.screen;
  }
}

export class SavedContext extends ToolContext {
  constructor(ctx, datalib=ctx.state.datalib) {
    super(ctx.state);

    this._material = new DataRef();
    this._object = new DataRef();
    this._selectedObjects = [];
    this._selectedMeshObjects = [];
    this._selectedLightObjects = [];
    this._scene = new DataRef();
    this._mesh = new DataRef();
    this._cursor3D = new Matrix4();

    if (ctx.view3d !== undefined) {
      this._cursor3D.load(ctx.view3d.cursor3D);
    } else if (ctx.scene !== undefined) {
      this._cursor3D.load(ctx.scene.cursor3D);
    }

    this._toolmode_name = undefined;

    let toolmode = ctx.toolmode;
    if (toolmode !== undefined) {
      this._toolmode_name = toolmode.constructor.widgetDefine().name;
    }

    if (ctx.scene !== undefined) {
      this._scene.set(ctx.scene);
    }

    if (ctx.material !== undefined) {
      this._material.set(ctx.material);
    }

    if (ctx.object !== undefined) {
      this._object.set(ctx.object);
    }

    if (ctx._mesh !== undefined) {
      this._mesh.set(ctx.mesh);
    }

    this.ctx = ctx;
  }

  get cursor3D() {
    return this._cursor3D;
  }

  //might need to get rid of this save function in base class
  save() {
    this.lock();
    return this;
  }

  lock() {
    this.ctx = undefined;
    return this;
  }

  _getblock(key) {
    let key2 = "_" + key;

    if (this[key2].lib_id != -1) {
      return this.datalib.get(this[key2]);
    }

    if (this.ctx !== undefined) {
      this[key2] = DataRef.fromBlock(this.ctx[key]);
      return this.ctx[key];
    }
  }

  get material() {
    return this._getblock("material");
  }

  get scene() {
    return this._getblock("scene");
  }

  get object() {
    return this._getblock("object");
  }

  get toolmode() {
    let ctx = this.ctx;

    if (ctx !== undefined) {
      let toolmode = ctx.toolmode;
      if (toolmode !== undefined) {
        this._toolmode_name = toolmode.constructor.widgetDefine().name;
      }

      return toolmode;
    } else {
      let scene = this.scene;

      if (scene !== undefined && this._toolmode_name !== undefined) {
        return scene.toolmode_namemap[this._toolmode_name];
      }
    }

    return undefined;
  }

  get mesh() {
    return this._getblock("mesh");
  }

  get selectedLightObjects() {
    if (this._selectedLightObjects.length > 0) {
      let ret = [];

      for (let ob of this._selectedLightObjects) {
        ret.push(this.datalib.get(ob));
      }

      return ret;
    }

    if (this.ctx === undefined) {
      return this._selectedLightObjects;
    }

    let ret = this._selectedLightObjects = [];

    for (let ob of this.ctx.selectedLightObjects) {
      ret.push(DataRef.fromBlock(ob));
    }

    if (ret.length == 0) {
      return ret; //avoid infinite recursion if there aren't any results
    }

    return this.selectedLightObjects;
  }

  get selectedObjects() {
    if (this._selectedObjects.length > 0) {
      let ret = [];

      for (let ob of this._selectedObjects) {
        ret.push(this.datalib.get(ob));
      }

      return ret;
    }

    if (this.ctx === undefined) {
      return this._selectedObjects;
    }

    let ret = this._selectedObjects = [];

    for (let ob of this.ctx.selectedObjects) {
      ret.push(DataRef.fromBlock(ob));
    }

    if (ret.length == 0) {
      return ret; //avoid infinite recursion if there aren't any results
    }

    return this.selectedObjects;
  }

  get selectedMeshObjects() {
    if (this._selectedMeshObjects.length > 0) {
      let ret = [];

      for (let ob of this._selectedMeshObjects) {
        ret.push(this.datalib.get(ob));
      }

      return ret;
    }

    if (this.ctx === undefined) {
      return this._selectedMeshObjects;
    }

    let ret = this._selectedMeshObjects = [];

    for (let ob of this.ctx.selectedMeshObjects) {
      ret.push(DataRef.fromBlock(ob));
    }

    if (ret.length == 0) {
      return ret; //avoid infinite recursion if there aren't any results
    }

    return this.selectedMeshObjects;
  }
}
SavedContext.STRUCT = `
SavedContext {
  _scene               : DataRef;
  _mesh                : DataRef;
  _object              : DataRef;
  _selectedObjects     : array(DataRef);
  _selectedMeshObjects : array(DataRef);
}
`;
nstructjs.manager.add_class(SavedContext);

//modal tools have special context structures
//that save properties that might change inside a
//modal tool, like current area, etc.
export class ModalContext {
  constructor(ctx) {
    this.ctx = ctx;

    this._view3d = ctx.view3d;
    this._selectMask = ctx.selectMask;
    this._nodeEditor = ctx.nodeEditor;
    this._area = ctx.area;
  }

  get mesh() {
    return this.ctx.mesh;
  }

  get scene() {
    return this.ctx.scene;
  }

  get graph() {
    return this.ctx.graph;
  }

  get toolmode() {
    return this.ctx.toolmode;
  }

  get toolstack() {
    return this.ctx.toolstack;
  }

  progbar() {
    return this.ctx.progbar(...arguments);
  }

  warning() {
    return this.ctx.warning(...arguments);
  }

  error() {
    return this.ctx.error(...arguments);
  }

  get selectedLightObjects() {
    return this.ctx.selectedLightObjects;
  }

  get cursor3D() {
    return this.ctx.cursor3D;
  }

  message() {
    return this.ctx.message(...arguments);
  }

  get object() {
    return this.ctx.object;
  }

  get selectedObjects() {
    return this.ctx.selectedObjects;
  }

  get selectedMeshObjects() {
    return this.ctx.selectedMeshObjects;
  }

  get state() {
    return this.ctx.state;
  }

  get datalib() {
    return this.ctx.datalib;
  }

  get api() {
    return this.ctx.api;
  }

  get material() {
    return this.ctx.material;
  }

  get area() {
    return this._area;
  }

  get nodeEditor() {
    return this._nodeEditor;
  }

  get selectMask() {
    return this._selectMask;
  }

  get view3d() {
    return this._view3d;
  }

  get screen() {
    return this.state.screen;
  }
}

export class AppToolStack extends ToolStack {
  constructor(ctx) {
    super(ctx);

    this._undo_branch = undefined;
  }

  execTool(toolop, ctx=this.ctx) {
    if (!toolop.constructor.canRun(ctx)) {
      console.log("toolop.constructor.canRun returned false");
      return;
    }

    let tctx = ctx;

    let undoflag = toolop.constructor.tooldef().undoflag;
    if (toolop.undoflag !== undefined) {
      undoflag = toolop.undoflag;
    }
    undoflag = undoflag === undefined ? 0 : undoflag;

    //if (!(undoflag & UndoFlags.IS_UNDO_ROOT) && !(undoflag & UndoFlags.NO_UNDO)) {
      //tctx = new SavedContext(ctx, ctx.datalib);
    //}

    toolop.execCtx = tctx;

    //console.log(undoflag, "undoflag");
    if (!(undoflag & UndoFlags.NO_UNDO)) {
      this.cur++;

      //save branch for if tool cancel
      this._undo_branch = this.slice(this.cur+1, this.length);

      //truncate
      this.length = this.cur+1;

      this[this.cur] = toolop;
      toolop.undoPre(tctx);
    }

    if (toolop.is_modal) {
      ctx = toolop.modal_ctx = new ModalContext(ctx);

      this.modal_running = true;

      toolop._on_cancel = (function(toolop) {
        if (!(toolop.undoflag & UndoFlags.NO_UNDO)) {
          this.pop_i(this.cur);
          this.cur--;
        }
      }).bind(this);

      //will handle calling .exec itself
      toolop.modalStart(ctx);
    } else {
      toolop.execPre(tctx);
      toolop.exec(tctx);
      toolop.execPost(tctx);
    }
  }

  toolCancel(ctx, tool) {
    if (tool._was_redo) {
      //ignore tool cancel requests on redo
      return;
    }

    if (tool !== this[this.cur]) {
      console.warn("toolCancel called in error", this, tool);
      return;
    }

    this.undo();
    this.length = this.cur+1;

    if (this._undo_branch !== undefined) {
      for (let item of this._undo_branch) {
        this.push(item);
      }
    }
  }

  undo() {
    if (this.cur >= 0 && !(this[this.cur].undoflag & UndoFlags.IS_UNDO_ROOT)) {
      console.log("undo!", this.cur, this.length);

      let tool = this[this.cur];
      console.log(tool, tool.undo, "---");
      tool.undo(tool.execCtx);

      this.cur--;
    }
  }

  //reruns a tool if it's at the head of the stack
  rerun(tool) {
    if (tool === this[this.cur]) {
      this.undo();
      this.redo();
    } else {
      console.warn("Tool wasn't at head of stack", tool);
    }
  }

  redo() {
    console.log("redo!", this.cur, this.length);
    if (this.cur >= -1 && this.cur+1 < this.length) {
      //console.log("redo!", this.cur, this.length);

      this.cur++;
      let tool = this[this.cur];

      tool._was_redo = true;

      tool.undoPre(tool.execCtx);
      tool.execPre(tool.execCtx);
      tool.exec(tool.execCtx);
      tool.execPost(tool.execCtx);

      window.redraw_viewport();
    }
  }
}
