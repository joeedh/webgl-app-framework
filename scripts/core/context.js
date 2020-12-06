//import {ContextOverlay, Context} from "./context2.js";
import '../path.ux/scripts/util/struct.js';
import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {NodeViewer} from '../editors/node/NodeEditor_debug.js';
import {getContextArea, Editor, editorAccessor} from '../editors/editor_base.js';
import {ResourceBrowser} from "../editors/resbrowser/resbrowser.js";
import * as util from '../util/util.js';
import {Mesh} from '../mesh/mesh.js';
import {Light} from '../light/light.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {Scene} from '../scene/scene.js';
import {DataBlock, DataRef} from './lib_api.js';
import {DebugEditor} from "../editors/debug/DebugEditor.js";
import * as ui_noteframe from '../path.ux/scripts/widgets/ui_noteframe.js';
import {Matrix4} from "../util/vectormath.js";
import {MenuBarEditor} from "../editors/menu/MainMenu.js";
import {Context, ContextOverlay, ContextFlags} from "./context_base.js";
import {UIBase, Screen} from '../path.ux/scripts/pathux.js';
import {PropsEditor} from '../editors/properties/PropsEditor.js';
import {MaterialEditor} from "../editors/node/MaterialEditor.js";

let passthrus = new Set(["datalib", "gl", "graph", "last_tool", "toolstack", "api"]);

export class BaseOverlay extends ContextOverlay {
  constructor(appstate) {
    super(appstate);
  }

  get timeStart() {
    return this.scene ? this.scene.timeStart : 0;
  }

  get timeEnd() {
    return this.scene ? this.scene.timeEnd : 0;
  }

  validate() {
    return true;
  }

  //used by UI code
  //refers to last executed *ToolOp*, don't confused with tool *modes*
  get last_tool() {
    return this.state._last_tool;
  }

  copy() {
    return new BaseOverlay(this._state);
  }

  get material() {
    let ob = this.object;

    if (ob) {
      if (ob.data instanceof Mesh && ob.data.materials.length > 0) {
        return ob.data.materials[0];
      }
    }
  }

  get playing() {
    return this.state.playing;
  }

  get graph() { /** execution graph */
    return this.state.datalib.graph;
  }

  get toolmode() {
    let scene = this.scene;

    return scene !== undefined ? scene.toolmode : undefined;
  }

  get toolstack() {
    return this.state.toolstack;
  }

  get api() {
    return this.state.api;
  }

  get datalib() {
    return this.state.datalib;
  }

  toolmode_save() {
    if (this.scene === undefined)
      return 0;
    return this.scene.toolmode_i;
  }
  toolmode_load(ctx, data) {
    return ctx.scene.toolmode_map[data];
  }

  get scene() {
    let ret = this.datalib.scene.active;

    if (ret === undefined && this.datalib.scene.length > 0) {
      console.warn("Something happened to active scene; fixing...")
      this.datalib.scene.active = this.datalib.scene[0];
    }

    return this.datalib.scene.active;
  }

  get object() {
    return this.scene ? this.scene.objects.active : undefined;
  }

  get mesh() {
    let ob = this.object;
    if (ob !== undefined && ob.data instanceof Mesh) {
      return ob.data;
    }
  }

  get light() {
    let ob = this.object;

    if (ob !== undefined) {
      return ob.data instanceof Light ? ob.data : undefined;
    }
  }

  get selectedObjects() {
    if (this.scene === undefined) return [];
    
    return this.scene.objects.selected.editable;
  }

  /* unlike selectedMeshObjects, this returns all light objects
   * even if they share .data Light instances*/
  get selectedLightObjects() {
    let this2 = this;

    if (this.scene === undefined) {
      return [];
    }

    return (function*() {
      for (let ob of this2.scene.objects) {
        if (ob.data.type instanceof Light) {
          yield ob.data;
        }
      }
    })();
  }

  static contextDefine() {return {
    name : "base"
  }}

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
Context.register(BaseOverlay);

export class ViewOverlay extends ContextOverlay {
  constructor(state) {
    super(state);
  }

  validate() {
    return true;
  }

  static contextDefine() {return {
    name : "base",
    flag : ContextFlags.IS_VIEW
  }}


  get modalFlag() {
    return this.state.modalFlags;
  }

  setModalFlag(f) {
    this.state.modalFlags |= f;
  }

  clearModalFlag(f) {
    this.state.modalFlags &= ~f;
  }

  copy() {
    return new ViewOverlay(this.state);
  }

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
    if (!this.ctx || !this.ctx.scene)
      return 0;

    return this.ctx.scene.selectMask;
  }

  set selectMask(val) {
    if (!this.ctx || !this.ctx.scene)
      return;

    this.ctx.scene.selectMask = val;
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

  get nodeEditor() {
    return getContextArea(NodeEditor);
  }

  get shaderEditor() {
    return getContextArea(MaterialEditor);
  }

  get nodeViewer() {
    return getContextArea(NodeViewer);
  }

  get editors() {
    return editorAccessor;
  }

  editors_save() {
    let editors = this.editors;

    let ret = {};

    for (let k in editors._namemap) {
      ret[k] = editors[k];
    }

    return ret;
  }

  editors_load(ctx, data) {
    return data;
  }

  get area() {
    return this.editor;
  }

  get editor() {
    return Editor.getActiveArea();
  }

  get screen() {
    return this.state.screen;
  }
}

Context.register(ViewOverlay);

class KeyPassThruProp {
  constructor(key) {
    this.key = key;
  }
}

export class ToolContext extends Context {
  constructor(state) {
    super(state);
  
    this._state = state;
    this.reset();
  }

  play() {
    this.state.playing = true;
  }

  stop() {
    this.state.playing = false;
  }

  set state(val) {
    console.warn("context.state was set");
    this._state = val;
  }

  get state() {
    return this._state;
  }

  saveProperty(key) {
    let val = this[key];

    if (passthrus.has(key) || val instanceof UIBase || val instanceof Screen) {
      return new KeyPassThruProp(key);
    }

    //console.log("saveProperty called", key);
    return this.saveProperty_intern(this[key], key);
  }

  saveProperty_intern(val, owning_key) {
    if (owning_key === "editors") {
      //let editors = val;

      //return val;
    }

    if (typeof val !== "object")
      return val;

    if (typeof val === "function" && !val[Symbol.iterator]) {
      return val;
    }

    if (val instanceof DataBlock) {
      return DataRef.fromBlock(val);
    }

    let isiter = typeof val === "function" || typeof val === "object";
    isiter = isiter && val[Symbol.iterator];

    if (isiter) {
      let ret = [];

      for (let item of val) {
        ret.push(this.saveProperty_intern(item, owning_key));
      }

      return ret;
    }

    console.warn("Warning, unknown data in ToolContext.prototype.savePropertyIntern()", owning_key);
    return val;
  }

  loadProperty(ctx, key, data) {
    return this.loadProperty_intern(ctx, data);
  }

  loadProperty_intern(ctx, data) {
    if (typeof data !== "object") {
      return data;
    }

    if (data instanceof KeyPassThruProp) {
      return ctx[data.key];
    } else if (data instanceof DataRef) {
      return ctx.state.datalib.get(data);
    } else if (data.constructor === Array) {
      let ret = new Array(data.length);

      for (let i=0; i<data.length; i++) {
        ret[i] = this.loadProperty_intern(ctx, data[i]);
      }

      return ret;
    } else {
      return data;
    }
  }

  reset(have_new_file=false) {
    super.reset(have_new_file);

    this.pushOverlay(new BaseOverlay(this.state));
  }
}

export class ViewContext extends ToolContext {
  constructor(state) {
    super(state); //ToolContext constructor will call .reset() for us
  }

  reset(have_new_file=false) {
    super.reset(have_new_file);

    this.pushOverlay(new ViewOverlay(this.state));
  }
}
