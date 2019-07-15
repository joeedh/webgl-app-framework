import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Area} from '../path.ux/scripts/ScreenArea.js';
import {Screen} from '../path.ux/scripts/FrameManager.js';
import {UIBase} from '../path.ux/scripts/ui_base.js';
import * as util from '../util/util.js';

let areastacks = {};
let arealasts = {};

export {keymap} from '../path.ux/scripts/simple_events.js';
export class HotKey {
  /**action can be a callback or a toolpath string*/
  constructor(key, modifiers, action) {
    this.action = action;
    this.mods = modifiers;
    this.key = keymap[key];
  }

  exec(ctx) {
    if (typeof this.action == "string") {
      ctx.api.execTool(ctx, this.action);
    } else {
      this.action(ctx);
    }
  }
}

export class KeyMap extends Array {
  constructor(hotkeys=[]) {
    for (let hk of hotkeys) {
      this.add(hk);
    }
  }

  handle(ctx, e) {
    let mods = new util.set();
    if (e.shiftKey)
      mods.add("shift");
    if (e.altKey)
      mods.add("alt");
    if (e.ctrlKey) {
      mods.add("ctrl");
    }
    if (e.commandKey) {
      mods.add("command");
    }

    for (let hk of this) {
      let ok = e.keyCode == hk.key;
      if (!ok) continue;

      for (let m of hk.mods) {
        if (mods.has(m.lower().trim())) {
          ok = false;
          break;
        }
      }

      if (ok) {
        hk.exec(ctx);
      }
    }
  }

  add(hk) {
    this.push(hk);
  }

  push(hk) {
    super.push(hk);
  }
}
let getAreaStack = (cls) => {
  let name = cls.define().areaname;
  
  if (!(name in areastacks)) {
    areastacks[name] = [];
  }
  
  return areastacks[name];
}

export let allareas_stack = [];

export let getContextArea = (cls) => {
  if (cls === undefined) {
    return areastacks.length > 0 ? areastacks[areastacks.length-1] : undefined;
  }
  
  let stack = getAreaStack(cls);
  
  if (stack.length == 0) 
    return arealasts[cls.define().areaname];
  
  return stack[stack.length-1];
}

export class Editor extends Area {
  constructor() {
    super();
    
    this.container = document.createElement("container-x");
    
    this.shadow.appendChild(this.container);
  }

  defineKeyMap() {
    this.keymap = new KeyMap();

    return this.keymap;
  }

  push_ctx_active(ctx) {
    let stack = getAreaStack(this.constructor);
    
    arealasts[this.constructor.define().areaname] = this;
    
    stack.push(this);
    allareas_stack.push(this);
  }
  
  pop_ctx_active(ctx) {
    let stack = getAreaStack(this.constructor);
    
    stack.pop();
    allareas_stack.pop();
  }
  
  init() {
    super.init();
    
    this.container.ctx = this.ctx;
    this.makeHeader(this.container);
    this.setCSS();
  }
  
  getScreen() {
    return _appstate.screen;
  }
  
  static register(cls) {
    Area.register(cls);
  }
  
  static fromSTRUCT(reader) {
    let ret = document.createElement(this.define().tagname);
    reader(ret);
    return ret;
  }
};
Editor.STRUCT = STRUCT.inherit(Editor, Area) + `
}
`;
nstructjs.manager.add_class(Editor);

export class App extends Screen {
  static define() {return {
    tagname : "webgl-app-x"
  }}
  
  static fromSTRUCT(reader) {
    return super.fromSTRUCT(reader);
  }
  
  update() {
    super.update();
    
    let w = window.innerWidth;
    let h = window.innerHeight;
    
    if (w !== this.size[0] || h !== this.size[1]) {
      this.size[0] = w;
      this.size[1] = h;
      
      this.on_resize([w, h]);
    }
  }
};

App.STRUCT = STRUCT.inherit(App, Screen) + `
}`;
UIBase.register(App);
nstructjs.manager.add_class(App);
