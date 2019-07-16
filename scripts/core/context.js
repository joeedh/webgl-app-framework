import '../path.ux/scripts/struct.js';
import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {getContextArea} from '../editors/editor_base.js';
import * as util from '../util/util.js';
import {Mesh} from './mesh.js';
import {DataRef} from './lib_api.js';
import {ToolStack, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';

export class ToolContext {
  constructor(appstate=_appstate) {
    this._appstate = appstate;
  }

  get toolstack() {
    return this._appstate.toolstack;
  }

  get api() {
    return this.state.api;
  }
  
  get state() {
    return this._appstate;
  }
  
  get datalib() {
    return this.state.datalib;
  }
  
  get scene() {
    return this.datalib.getLibrary("scene").active;
  }

  save() {
    //XXX why does this method exist?
  }

  get object() {
    return this.scene.objects.active;
  }
  
  get mesh() {
    let ob = this.object;
    
    if (ob !== undefined) {
      return ob.data;
    }
  }

  get selectedObjects() {
    return this.scene.objects.selected.editable;
  }

  /**returns selected mesh objects,
    ignoring objects that use the same mesh
    instance (only one will get yield in that case)
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

  get nodeEditor() {
    return getContextArea(NodeEditor);
  }
}

export class SavedContext extends ToolContext {
  constructor(ctx, datalib) {
    super(ctx.appstate);

    this._object = new DataRef();
    this._selectedObjects = [];
    this._selectedMeshObjects = [];
    this._scene = new DataRef();
    this._mesh = new DataRef();

    this._scene.set(ctx.scene);

    this.ctx = ctx;
  }

  //might need to get rid of this save function in base
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

  get scene() {
    return this._getblock("scene");
  }

  get object() {
    return this._getblock("object");
  }

  get mesh() {
    return this._getblock("mesh");
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

class ModalContext extends SavedContext {
  constructor(ctx) {
    super(ctx, ctx.datalib);
    this._view3d = ctx.view3d;
  }

  get view3d() {
    return this._view3d;
  }
}

export class AppToolStack extends ToolStack {
  constructor(ctx) {
    super(ctx);
  }

  execTool(toolop, ctx=this.ctx) {
    if (!toolop.canRun(ctx)) {
      console.log("toolop.canRun returned false");
      return;
    }

    let tctx = ctx;

    if (!(toolop.constructor.tooldef().undoflag & UndoFlags.IS_UNDO_ROOT)) {
      tctx = new SavedContext(ctx, ctx.datalib);
    }

    toolop.execCtx = tctx;

    if (!(toolop.undoflag & UndoFlags.NO_UNDO)) {
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
        this.pop_i(this.cur);
        this.cur--;
      }).bind(this);

      //will handle calling .exec itself
      toolop.modalStart(ctx);
    } else {
      toolop.exec(tctx);
    }
  }

  undo() {
    if (this.cur >= 0 && !(this[this.cur].undoflag & UndoFlags.IS_UNDO_ROOT)) {
      console.log("undo!", this.cur, this.length);

      let tool = this[this.cur];
      tool.undo(tool.execCtx);

      this.cur--;
      this.ctx.save();
    }
  }

  redo() {
    if (this.cur >= -1 && this.cur+1 < this.length) {
      console.log("redo!", this.cur, this.length);

      this.cur++;
      let tool = this[this.cur];

      tool.undoPre(tool.execCtx);
      tool.exec(tool.execCtx);

      window.redraw_viewport();

      this.ctx.save(); //XXX why does this exist?
    }
  }
}
