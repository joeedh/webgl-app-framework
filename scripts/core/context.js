import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {getContextArea} from '../editors/editor_base.js';
import * as util from '../util/util.js';
import {Mesh} from './mesh.js';

export class ToolContext {
  constructor(appstate=_appstate) {
    this._appstate = appstate;
  }

  get view3d() {
    return getContextArea(View3D);
  }
  
  get nodeEditor() {
    return getContextArea(NodeEditor);
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
}
