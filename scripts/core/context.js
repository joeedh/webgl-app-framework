
export class ToolContext {
  constructor(appstate=_appstate) {
    this._appstate = appstate;
  }

  get api() {
    return this.appstate.api;
  }
  
  get appstate() {
    return this._appstate;
  }
  
  get datalib() {
    return this.appstate.datalib;
  }
  
  get scene() {
    return this.lib.getLibrary("scene").active;
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
}

/** includes UI stuff that ToolOps can't use
 *  unless in modal mode
 */
export class Context extends ToolContext {
}
