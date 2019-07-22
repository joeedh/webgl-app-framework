import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Area} from '../path.ux/scripts/ScreenArea.js';
import {Screen} from '../path.ux/scripts/FrameManager.js';
import {UIBase} from '../path.ux/scripts/ui_base.js';
import * as util from '../util/util.js';
import {haveModal} from "../path.ux/scripts/simple_events.js";

import {Icons} from './icon_enum.js';

let areastacks = {};
let arealasts = {};

export {keymap} from '../path.ux/scripts/simple_events.js';
import {keymap} from '../path.ux/scripts/simple_events.js';

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
    super();

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

      let count = 0;
      for (let m of hk.mods) {
        m = m.toLowerCase().trim();

        if (!mods.has(m)) {
          ok = false;
          break;
        }

        count++;
      }

      if (count != mods.length) {
        ok = false;
      }

      if (ok) {
        try {
          hk.exec(ctx);
        } catch (error) {
          util.print_stack(error);
          console.log("failed to execute a hotkey", keymap[e.keyCode]);
        }
        return true;
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

  getKeyMaps() {
    return [this.keymap];
  }

  defineKeyMap() {
    this.keymap = new KeyMap();

    return this.keymap;
  }

  on_area_active() {
    Editor.setLastArea(this);
  }

  static setLastArea(area) {
    let tname = area.constructor.define().areaname
    //console.warn("call to setLastArea", area._area_id, tname);
    arealasts[tname] = area;
  }

  push_ctx_active(ctx) {
    let stack = getAreaStack(this.constructor);

    let tname = this.constructor.define().areaname;
    if (arealasts[tname] === undefined) {
      Editor.setLastArea(this);
    }
    
    stack.push(this);
    allareas_stack.push(this);
  }
  
  pop_ctx_active(ctx) {
    let stack = getAreaStack(this.constructor);
    
    stack.pop();
    allareas_stack.pop();
  }

  on_keydown(e) {
    console.log(e.keyCode);

    Editor.setLastArea(this);
  }

  init() {
    super.init();
    
    this.container.ctx = this.ctx;
    this.makeHeader(this.container);
    this.setCSS();

    this.defineKeyMap();
  }
  
  getScreen() {
    return _appstate.screen;
  }
  
  static register(cls) {
    Area.register(cls);
  }

  static newSTRUCT() {
    return document.createElement(this.define().tagname);
  }
};
Editor.STRUCT = STRUCT.inherit(Editor, Area) + `
}
`;
nstructjs.manager.add_class(Editor);

export class App extends Screen {
  constructor() {
    super();
    this._last_dpi = undefined;

    this.keymap = new KeyMap([
      new HotKey("Z", ["CTRL"], () => {
        _appstate.toolstack.undo();
        window.redraw_viewport();
      }),
      new HotKey("Z", ["CTRL", "SHIFT"], () => {
        _appstate.toolstack.redo();
        window.redraw_viewport();
      }),
      new HotKey("Y", ["CTRL"], () => {
        console.log("redo!");
        _appstate.toolstack.redo();
        window.redraw_viewport();
      })
    ]);
  }

  getHotKey(toolpath) {
    let test = (keymap) => {
      for (let hk of keymap) {
        if (typeof hk.action != "string")
          continue;

        if (hk.action.trim() == toolpath.trim()) {
          return hk;
        }
      }
    }

    let ret = test(this.keymap);
    if (ret)
      return ret;

    if (this.sareas.active && this.sareas.active.keymap) {
      ret = test(this.sareas.active.area.keymap);
      if (ret)
        return ret;
    }

    if (ret === undefined) {
      //just to be safe, check all areas in case the
      //context is confused as to which area is currently "active"

      for (let sarea of this.sareas) {
        if (sarea.area.keymap) {
          ret = test(sarea.area.keymap);

          if (ret)
            return ret;
        }
      }
    }

    return undefined;
  }

  execKeyMap(e) {
    let handled = false;

    if (this.sareas.active && this.sareas.active.area.keymap) {
      let area = this.sareas.active.area;
      //console.log(area.getKeyMaps());
      for (let keymap of area.getKeyMaps()) {
        if (keymap.handle(this.ctx, e)) {
          handled = true;
          break;
        }
      }
    }

    handled = handled || this.keymap.handle(this.ctx, e);

    return handled;
  }

  on_keydown(e) {
    if (!haveModal() && this.execKeyMap(e)) {
      e.preventDefault();
      return;
    }

    return super.on_keydown(e);
  }

  static define() {return {
    tagname : "webgl-app-x"
  }}

  static newSTRUCT() {
    return document.createElement(this.define().tagname);
  }

  setCSS() {
    super.setCSS();
    let dpi = UIBase.getDPI();

    let size = this.size, canvas = document.getElementById("webgl");

    if (!canvas || size === undefined) {
      return;
    }

    let w = size[0], h = size[1];
    let w2 = ~~(w*dpi);
    let h2 = ~~(h*dpi);

    if (canvas.width == w2 && canvas.height == h2) {
      return;
    }

    console.log("resizing canvas");
    canvas.width = w2;
    canvas.height = h2;

    canvas.style["width"] = w + "px";
    canvas.style["height"] = h + "px";
    canvas.style["position"] = "absolute";
    canvas.style["z-index"] = "-2";

    canvas.dpi = dpi;
  }

  on_resize(newsize) {
    super.on_resize(newsize);
    this.setCSS();
  }

  updateDPI() {
    if (UIBase.getDPI() !== this._last_dpi) {
      this._last_dpi = UIBase.getDPI();
      this.setCSS();
    }
  }

  update() {
    super.update();
    this.updateDPI();

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
