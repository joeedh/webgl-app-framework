import '../path.ux/scripts/struct.js';
import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {getContextArea, Editor} from '../editors/editor_base.js';
import {ResourceBrowser} from "../editors/resbrowser/resbrowser.js";
import * as util from '../util/util.js';
import {Mesh} from '../mesh/mesh.js';
import {Light} from '../light/light.js';
import {SceneObject} from './sceneobject.js';
import {Scene} from './scene.js';
import {DataRef} from './lib_api.js';
import {ToolStack, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {DebugEditor} from "../editors/debug/DebugEditor.js";

export class ToolContext {
  constructor(appstate=_appstate) {
    this._appstate = appstate;
  }

  get appstate() { /** application state */
    return this._appstate;
  }

  get graph() { /** execution graph */
    return this._appstate.datalib.graph;
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

  save() { /** deprecated */
    //XXX why does this method exist?
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

  get resbrowser() {
    return getContextArea(ResourceBrowser);
  }

  get debugEditor() {
    return getContextArea(DebugEditor);
  }

  get gl() {
    return this.view3d.gl;
  }

  get material() {
    let mesh = this.mesh;
    if (mesh === undefined) return undefined;

    if (mesh.materials.length === 1)
      return mesh.materials[0];
    else
      return mesh.materials.active;
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
  constructor(ctx, datalib) {
    super(ctx.appstate);

    this._material = new DataRef();
    this._object = new DataRef();
    this._selectedObjects = [];
    this._selectedMeshObjects = [];
    this._selectedLightObjects = [];
    this._scene = new DataRef();
    this._mesh = new DataRef();

    if (ctx.scene !== undefined) {
      this._scene.set(ctx.scene);
    }

    this.ctx = ctx;
  }

  //might need to get rid of this save function in base class
  save() {
    this.lock();
  }

  lock() {
    this.ctx = undefined;
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
export class ModalContext extends SavedContext {
  constructor(ctx) {
    super(ctx, ctx.datalib);
    this._view3d = ctx.view3d;
    this._nodeEditor = ctx.nodeEditor;
    this._area = ctx.area;
  }

  get area() {
    return this._area;
  }

  get nodeEditor() {
    return this._nodeEditor;
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

    if (!(undoflag & UndoFlags.IS_UNDO_ROOT) && !(undoflag & UndoFlags.NO_UNDO)) {
      tctx = new SavedContext(ctx, ctx.datalib);
    }

    toolop.execCtx = tctx;

    //console.log(undoflag, "undoflag");
    if (!(undoflag & UndoFlags.NO_UNDO)) {
      this.cur++;

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

  undo() {
    if (this.cur >= 0 && !(this[this.cur].undoflag & UndoFlags.IS_UNDO_ROOT)) {
      console.log("undo!", this.cur, this.length);

      let tool = this[this.cur];
      console.log(tool, tool.undo, "---");
      tool.undo(tool.execCtx);

      this.cur--;
      this.ctx.save();
    }
  }

  redo() {
    console.log("redo!", this.cur, this.length);
    if (this.cur >= -1 && this.cur+1 < this.length) {
      //console.log("redo!", this.cur, this.length);

      this.cur++;
      let tool = this[this.cur];

      tool.undoPre(tool.execCtx);
      tool.execPre(tool.execCtx);
      tool.exec(tool.execCtx);
      tool.execPost(tool.execCtx);

      window.redraw_viewport();

      this.ctx.save(); //XXX why does this exist?
    }
  }
}
