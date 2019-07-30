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
let last_area = undefined;
let laststack = [];

export {keymap, KeyMap, HotKey} from '../path.ux/scripts/simple_events.js';
import {keymap, KeyMap, HotKey} from '../path.ux/scripts/simple_events.js';
import {Matrix4, Vector2} from "../util/vectormath.js";

export {VelPanFlags, VelPan} from './velpan.js';

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

  onFileLoad() {

  }

  getKeyMaps() {
    return [this.keymap];
  }

  defineKeyMap() {
    this.keymap = new KeyMap();

    return this.keymap;
  }

  getID() {
    return this.ctx.screen.sareas.indexOf(this.owning_sarea);
  }

  static getActiveArea() {
    return last_area;
  }

  on_area_active() {
    Editor.setLastArea(this);
  }

  static setLastArea(area) {
    let tname = area.constructor.define().areaname;
    //console.warn("call to setLastArea", area._area_id, tname);
    arealasts[tname] = area;
    last_area = area;
  }

  push_ctx_active(ctx) {
    let stack = getAreaStack(this.constructor);

    let tname = this.constructor.define().areaname;
    if (arealasts[tname] === undefined) {
      Editor.setLastArea(this);
    }
    
    stack.push(this);
    allareas_stack.push(this);
    //laststack.push(last_area);
    //last_area = this;
  }
  
  pop_ctx_active(ctx) {
    let stack = getAreaStack(this.constructor);
    
    stack.pop();
    allareas_stack.pop();

    //let ret = laststack.pop();
    //if (ret !== undefined) {
    //  last_area = ret;
    //}
  }

  /*copy of code in Area clas in ScreenArea.js in path.ux.
    example of how to define an area.

  static define() {return {
    tagname  : undefined, // e.g. "areadata-x",
    areaname : undefined, //api name for area type
    uiname   : undefined,
    icon : undefined //icon representing area in MakeHeader's area switching menu. Integer.
  };}
  */

  on_keydown(e) {
    console.log(e.keyCode);

    Editor.setLastArea(this);
  }

  init() {
    super.init();
    this.defineKeyMap();

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

  static define() {return {
    tagname : "webgl-app-x"
  }}

  static newSTRUCT() {
    return document.createElement(this.define().tagname);
  }

  setCSS() {
    super.setCSS();
    let dpi = this.getDPI();

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
    if (this.getDPI() !== this._last_dpi) {
      this._last_dpi = this.getDPI();
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
