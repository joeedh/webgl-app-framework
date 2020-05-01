//import {ContextOverlay, Context} from "./context2.js";
import '../path.ux/scripts/struct.js';
import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {getContextArea, Editor} from '../editors/editor_base.js';
import {ResourceBrowser} from "../editors/resbrowser/resbrowser.js";
import * as util from '../util/util.js';
import {Mesh} from '../mesh/mesh.js';
import {Light} from '../light/light.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {Scene} from '../scene/scene.js';
import {DataRef} from './lib_api.js';
import {ToolStack, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {DebugEditor} from "../editors/debug/DebugEditor.js";
import * as ui_noteframe from '../path.ux/scripts/ui_noteframe.js';
import {PointSet} from '../potree/potree_types.js';
import {Matrix4} from "../util/vectormath.js";
import {MenuBarEditor} from "../editors/menu/MainMenu.js";
import {PropsEditor} from "../editors/properties/PropsEditor.js";
import {Context, ContextOverlay, ContextFlags} from "./context_base.js";

export class BaseOverlay extends ContextOverlay {
  constructor(appstate) {
    super(appstate);
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

  get scene() {
    let ret = this.datalib.scene.active;

    if (ret === undefined && this.datalib.scene.length > 0) {
      console.warn("Something happened to active scene; fixing...")
      this.datalib.scene.active = this.datalib.scene[0];
    }

    return this.datalib.scene.active;
  }

  get object() {
    return this.scene.objects.active;
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
    return this.scene.objects.selected.editable;
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
    return this.ctx.scene.selectMask;
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

  pointset() {
    let obj = this.object;

    if (obj !== undefined && obj.data instanceof PointSet) {
      return obj.data;
    }
  }

  get material() {
    let ptree = this.pointset;

    if (ptree !== undefined) {
      return ptree.material;
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

Context.register(ViewOverlay);

export class ToolContext extends Context {
  constructor(state) {
    super();
  
    this.state = state;
    this.reset();
  }

  reset(have_new_file=false) {
    super.reset(have_new_file);

    this.pushOverlay(new BaseOverlay(this.state));
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

export class ModalContext extends ViewContext {
};
