import {nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';

import * as units from '../path.ux/scripts/core/units.js';

//set base unit for world space data
units.Unit.baseUnit = "foot";

import './theme.js';

let STRUCT = nstructjs.STRUCT;
import {Area, ScreenArea} from '../path.ux/scripts/screen/ScreenArea.js';
import {Screen} from '../path.ux/scripts/screen/FrameManager.js';
import {UIBase, saveUIData, loadUIData} from '../path.ux/scripts/core/ui_base.js';
import {Container} from '../path.ux/scripts/core/ui.js';
import * as util from '../util/util.js';
import {haveModal} from "../path.ux/scripts/util/simple_events.js";
import {warning} from "../path.ux/scripts/widgets/ui_noteframe.js";
import {Icons} from './icon_enum.js';
import {PackFlags} from "../path.ux/scripts/core/ui_base.js";

export {keymap, KeyMap, HotKey} from '../path.ux/scripts/util/simple_events.js';
import {keymap, KeyMap, HotKey} from '../path.ux/scripts/util/simple_events.js';
import {DataBlock, BlockFlags} from '../core/lib_api.js';

export {VelPanFlags, VelPan} from './velpan.js';

/**
 * Expects a datapath DOM attribute
 */
export class DataBlockBrowser extends Container {
  constructor() {
    super();

    this.blockClass = undefined;
    this._owner_exists = false;
    this._path_exists = false;
    this._needs_rebuild = true;
    this._last_mat_name = undefined;

    this.onValidData = undefined;
  }

  init() {
    super.init();

    this.rebuild();
  }

  setCSS() {
    super.setCSS();
  }

  flagRebuild() {
    this._needs_rebuild = true;
  }

  rebuild() {
    this._needs_rebuild = false;

    let ctx = this.ctx;
    let path = this.getAttribute("datapath");

    console.warn("Data block browser recalc");

    this.clear();

    if (!this.doesOwnerExist()) {
      this.label("Nothing selected");
      return;
    }

    let col = this.col();

    let val = this.getPathValue(ctx, path);
    let meta = this.ctx.api.resolvePath(this.ctx, path);

    this._last_mat_name = val === undefined ? undefined : val.name;

    this.label("Block");

    let prop = ctx.datalib.getBlockListEnum(this.blockClass);
    let dropbox = document.createElement("dropbox-x")

    dropbox.prop = prop;
    dropbox.setAttribute("name", val !== undefined ? val.name : "");

    //listenum(inpath, name, enummap, defaultval, callback, iconmap, packflag=0) {
    dropbox.onselect = (id) => {
      let val = this.getPathValue(ctx, path);
      let meta = this.ctx.api.resolvePath(this.ctx, path);

      if (val !== undefined && val.lib_id == id) {
        return;
      }

      if (val !== undefined) {
        val.lib_remUser(meta.obj);
      }

      let block = ctx.datalib.get(id);
      block.lib_addUser(meta.obj);

      console.log("Assigning block");

      this.setPathValue(ctx, path, block);
      this.flagRebuild();
    };

    let update = dropbox.update;
    dropbox.update = () => {
      dropbox.prop = ctx.datalib.getBlockListEnum(this.blockClass);
      update.apply(dropbox, arguments);
    };

    let row = col.row();
    row.add(dropbox);

    row.tool(`material.new(dataPathToSet="${path}")`, PackFlags.USE_ICONS);
    row.tool(`material.unlink(dataPathToUnset="${path}")`, PackFlags.USE_ICONS);

    if (val !== undefined) {
      row.prop(`${path}.flag[FAKE_USER]`, PackFlags.USE_ICONS);

      if (this.onValidData !== undefined) {
        col.inherit_packflag = this.inherit_packflag;
        this.onValidData(col);
      }
    } else {

    }
  }

  doesOwnerExist() {
    let path = this.getAttribute("datapath");
    let meta = this.ctx.api.resolvePath(this.ctx, path);
    
    if (meta === undefined) {
      return false;
    }
    
    return meta.obj !== undefined;
  }

  update() {
    let path = this.getAttribute("datapath");

    let exists = this.doesOwnerExist();
    let val = this.getPathValue(this.ctx, path);
    let name = val === undefined ? undefined : val.name;

    let rebuild = exists !== this._owner_exists || (!!val) != this._path_exists;
    rebuild = rebuild || this._needs_rebuild;
    rebuild = rebuild || name !== this._last_mat_name;

    if (rebuild) {
      this._owner_exists = exists;
      this._path_exists = !!val;

      this.rebuild();
    }

    super.update();
  }

  static define() {return {
    tagname : "data-block-browser-x"
  }}
}
UIBase.register(DataBlockBrowser);

/**
 *
 * @param container
 * @param cls
 * @param path
 * @param onValidData : callback, gets a container as argument so you can build elements when valid data exists.
 * @returns {*}
 */
export function makeDataBlockBrowser(container, cls, path, onValidData) {
  let row = container.row();
  let ret = document.createElement("data-block-browser-x");

  ret.inherit_packflag = container.inherit_packflag;

  ret.setAttribute("datapath", path);
  ret.blockClass = cls;
  ret.onValidData = onValidData;

  row.add(ret);

  return row;
}

export let getContextArea = (cls) => {
  return Area.getActiveArea(cls);
}

export class Editor extends Area {
  constructor() {
    super();

    this.useDataPathUndo = true;

    this.swapParent = undefined;
    this.container = document.createElement("container-x");
    this.container.parentWidget = this;

    this.shadow.appendChild(this.container);
  }

  init() {
    super.init();

    this.container.useDataPathUndo = this.useDataPathUndo;

    this.style["overflow"] = "hidden";
  }

  swapBack() {
    let sarea = this.owning_sarea;

    if (this.swapParent) {
      this.swap(this.swapParent.constructor);
      this.swapParent = undefined;
    }

    return sarea.area;
  }

  swap(editor_cls, storeSwapParent=true) {
    let sarea = this.owning_sarea;

    sarea.switch_editor(editor_cls);
    if (storeSwapParent) {
      sarea.area.swapParent = this;
    }

    return sarea.area;
  }

  onFileLoad(isActive) {

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

  /*copy of code in Area clas in ScreenArea.js in path.ux.
    example of how to define an area.

  static define() {return {
    tagname  : undefined, // e.g. "areadata-x",
    areaname : undefined, //api name for area type
    uiname   : undefined,
    icon : undefined //icon representing area in MakeHeader's area switching menu. Integer.
    flag : see AreaFlags
  };}
  */

  on_keydown(e) {
    this.push_ctx_active();
    this.pop_ctx_active();
  }

  init() {
    super.init();
    this.defineKeyMap();

    this.container.ctx = this.ctx;
    this.makeHeader(this.container);
    this.setCSS();
  }
  
  getScreen() {
    return this.owning_sarea !== undefined && this.owning_sarea.screen !== undefined ? this.owning_sarea.screen : _appstate.screen;
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

import {ToolClasses, ToolFlags, ToolMacro} from "../path.ux/scripts/toolsys/simple_toolsys.js";
import {Menu} from "../path.ux/scripts/widgets/ui_menu.js";
import * as ui_base from "../path.ux/scripts/core/ui_base.js";
import {time_ms} from "../util/util.js";
import {MakeMaterialOp} from "../core/material.js";
import {SocketFlags} from "../core/graph.js";
import {DependSocket} from "../core/graphsockets.js";

function spawnToolSearchMenu(ctx) {
  let tools = [];
  let screen = ctx.screen;

  let menu = document.createElement("menu-x");

  for (let cls of ToolClasses) {
    if ((cls.tooldef().flag & ToolFlags.PRIVATE) || !cls.canRun(ctx)) {
      continue;
    }

    let tdef = cls.tooldef();
    let hotkey = undefined;

    if (tdef.toolpath) {
      hotkey = screen.getHotKey(tdef.toolpath);

      if (hotkey) {
        hotkey = hotkey.buildString();

        console.log("hotkey:", hotkey);
      }
    }

    menu.addItemExtra(tdef.uiname, tools.length, hotkey);
    tools.push(cls);
  }

  menu.setAttribute("title", "Tools");

  document.body.appendChild(menu);
  menu.startFancy();

  menu.float(screen.mpos[0], screen.mpos[1], 8);
  menu.style["width"] = "500px";

  menu.onselect = (item) => {
    console.log(item, "got item");

    let cls = tools[item];
    let tool = cls.invoke(ctx, {});

    if (tool === undefined) {
      warning("Tool failed");
      return;
    }

    ctx.toolstack.execTool(ctx, tool);
  }
  //ui.menu("Tools", [["Test", () => {}]]);
}

export class App extends Screen {
  constructor() {
    super();

    //this.testAllKeyMaps = true;
    this.useDataPathUndo = true;

    //last widget update time
    this._last_wutime = 0;

    //last dpi update time
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
      }),
      new HotKey("Space", [], () => {
        console.log("Space Bar!");

        spawnToolSearchMenu(_appstate.ctx);
      }),

      new HotKey("Left", [], () => {
        let time = this.ctx.scene.time;
        this.ctx.scene.changeTime(Math.max(time-1, 0));
      }),
      new HotKey("Right", [], () => {
        let time = this.ctx.scene.time;
        this.ctx.scene.changeTime(time+1);
      }),
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
    this.updateCanvasSize();
  }

  updateCanvasSize() {
    let dpi = this.getDPI();

    let size = this.size, canvas = document.getElementById("webgl");

    if (!canvas || size === undefined) {
      return;
    }

    let w = size[0], h = size[1];
    let w2 = ~~(w*dpi);
    let h2 = ~~(h*dpi);

    if (canvas.width === w2 && canvas.height === h2) {
      return;
    }

    canvas.width = w2;
    canvas.height = h2;

    let renderer = _appstate.three_render;

    if (renderer) {
      renderer.setSize(canvas.width, canvas.height);
      window.redraw_viewport();
    }

    canvas.style["width"] = w + "px";
    canvas.style["height"] = h + "px";
    canvas.style["position"] = "absolute";
    canvas.style["z-index"] = "-2";

    canvas.dpi = dpi;
  }

  on_resize(oldsize, newsize) {
    super.on_resize(oldsize, newsize);
    this.setCSS();
  }

  updateDPI() {
    if (this.getDPI() !== this._last_dpi) {
      this._last_dpi = this.getDPI();
      this.setCSS();
    }
  }

  updateWidgets() {
    if (time_ms() - this._last_wutime < 50) {
      return;
    }

    this._last_wutime = time_ms();
    let scene = this.ctx.scene;

    if (scene !== undefined && typeof scene === "object") {
      scene.updateWidgets();
    }
  }

  positionMenu() {
    return;

    if (this.ctx === undefined)
      return;

    let menu = this.ctx.menubar;
    let view3d = this.ctx.view3d;

    if (menu === undefined || view3d === undefined)
      return;

    let x = Math.floor(menu.pos[0]);
    let y = Math.floor(menu.pos[0] + menu.size[1]);

    let w = Math.ceil(this.size[0]);
    let h = Math.ceil(this.size[1] - menu.size[1]);

    let update = view3d.pos[0] !== x || view3d.pos[1] !== y;
    update = update || view3d.size[0] !== w || view3d.size[1] !== h;

    if (update) {
      console.log("menu update", x, y, w, h);

      view3d.pos[0] = x;
      view3d.pos[1] = y;
      view3d.size[0] = w;
      view3d.size[1] = h;

      view3d.setCSS();
      window.redraw_viewport();
    }
  }

  update() {
    super.update();

    this.positionMenu();

    this.updateCanvasSize();

    this.updateWidgets();
    this.updateDPI();
 }
};

window.setInterval(() => {
  if (window._appstate && _appstate.ctx && _appstate.screen) {
    window.updateDataGraph(true);
  }
}, 75);

App.STRUCT = STRUCT.inherit(App, Screen, 'App') + `
}`;
UIBase.register(App);
nstructjs.manager.add_class(App);

export class ScreenBlock extends DataBlock {
  constructor() {
    super();

    //this.screen = document.createElement("webgl-app-x");
  }

  static blockDefine() {return {
    typeName    : "screen",
    defaultName : "Screen",
    uiName      : "Screen",
    icon        : -1,
    flag        : BlockFlags.FAKE_USER //always have user count > 0
  }}

  copy() {
    let ret = new ScreenBlock();

    ret.screen = this.screen.copy();
    ret.name = this.name;
    ret.lib_flag = this.lib_flag;

    return ret;
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);
    reader(this);
  }
}
ScreenBlock.STRUCT = STRUCT.inherit(ScreenBlock, DataBlock) + `
  screen : App;
}
`;
nstructjs.manager.add_class(ScreenBlock);
DataBlock.register(ScreenBlock);

let last_time = util.time_ms();

window.setInterval(() => {
  if (window._appstate && _appstate.ctx && _appstate.ctx.scene && _appstate.ctx.view3d) {
    window.redraw_viewport();

    if (_appstate.playing) {
      let scene = _appstate.ctx.scene;
      if (scene.fps !== 30 && util.time_ms() - last_time < 1000.0/scene.fps) {
        return;
      }

      let t = scene.time;
      t++;

      if (t > _appstate.ctx.timeEnd) {
        t = _appstate.ctx.timeStart;
      } else if (t < _appstate.ctx.timeStart) {
        t = _appstate.ctx.timeStart;
      }

      scene.changeTime(t);
    }

    last_time = util.time_ms();
  }
}, 1000.0 / 30.0);

export class MeshMaterialChooser extends Container {
  constructor() {
    super();

    this.addButton = undefined;
    this._last_mesh_key = undefined;
    this._activeMatCache = [];
    this._activeMatCacheSize = 5;
  }

  init() {
    this.doOnce(this.rebuild);
  }

  getActive(mesh) {
    if (!mesh) return 0;

    for (let i=0; i<this._activeMatCache.length; i += 2) {
      if (this._activeMatCache[i] === mesh.lib_id) {
        let ret = this._activeMatCache[i+1];

        if (ret >= mesh.materials.length) {
          ret = this._activeMatCache[i+1] = mesh.materials.length-1;
        }

        return ret;
      }
    }

    this.setActive(mesh, 0);
    return 0;
  }

  saveData() {
    return Object.assign(super.saveData(), {
      _activeMatCache : this._activeMatCache
    });
  }

  loadData(data) {
    super.loadData(data);

    if (data._activeMatCache) {
      this._activeMatCache = data._activeMatCache;
    }

    return this;
  }

  setActive(mesh, mati) {
    let idx = -1;

    for (let i=0; i<this._activeMatCache.length; i += 2) {
      if (this._activeMatCache[i] === mesh.lib_id) {
        idx = i;
        break;
      }
    }

    if (idx < 0) {
      if (this._activeMatCache.length >= this._activeMatCacheSize) {
        this._activeMatCache.pop();
      }
      this._activeMatCache = [mesh.lib_id, mati].concat(this._activeMatCache);
    } else {
      this._activeMatCache[idx+1] = mati;
    }
  }

  rebuild() {
    let uidata = saveUIData(this, "material chooser");

    this.clear();
    let mesh = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));

    if (!mesh) {
      return;
    }

    this.label(mesh.name);

    if (this.onchange) {
      this.onchange(this.getActive(mesh));
    }

    if (mesh.materials.length === 0) {
      this.button("Add Material", () => {
        let mesh = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
        let op = new MakeMaterialOp();

        this.ctx.toolstack.execTool(this.ctx, op);
        let mat = op.outputs.materialID.getValue();
        mat = this.ctx.datalib.get(mat);

        mesh.materials.push(mat);
        mat.lib_addUser(mesh);

        if (this.onchange) {
          this.onchange(mesh.materials.length-1);
        }
      });

      return;
    }

    let box = this.listbox();
    let i = 0;
    for (let mat of mesh.materials) {
      box.addItem(mat.name, i);
      i++;
    }
    box.setActive(box.items[this.getActive(mesh)]);

    box.onchange = (id, item) => {
      if (this.onchange) {
        this.onchange(id);

        mesh = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
        this.setActive(mesh, id);
      }
    }

    loadUIData(this, uidata);
    this.flushUpdate();
  }

  update() {
    super.update();

    if (!this.ctx || !this.hasAttribute("datapath")) {
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    let key = "";

    if (mesh) {
      key += mesh.lib_id + ":" + mesh.name + ":" + mesh.materials.length;

      for (let mat of mesh.materials) {
        key += ":" + mat.lib_id;
      }
    }

    if (key !== this._last_mesh_key) {
      this._last_mesh_key = key;
      this.doOnce(this.rebuild);
    }
  }

  static define() {return {
    tagname : "mesh-material-chooser-x"
  }}
}

UIBase.register(MeshMaterialChooser);

export class MeshMaterialPanel extends Container {
  constructor() {
    super();
  }

  init() {
    this.chooser = document.createElement("mesh-material-chooser-x");
    if (this.hasAttribute("datapath")) {
      this.chooser.setAttribute("datapath", this.getAttribute("datapath"));
    }
    this.add(this.chooser);

    this.subpanel = this.col();

    this.chooser.onchange = () => {
      this.doOnce(this.rebuild);
    };
  }

  rebuild() {
    if (!this.ctx || !this.hasAttribute("datapath")) {
      console.error("eek!");
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));

    console.log("Material panel rebuild");

    let uidata = saveUIData(this.subpanel, "mesh material panel");
    this.subpanel.clear();

    if (!mesh) {
      loadUIData(this.subpanel, uidata);
      return;
    }

    let mati = this.chooser.getActive(mesh);
    let datapath = this.getAttribute("datapath");
    let mat = mesh.materials[mati];

    if (!mat) {
      loadUIData(this.subpanel, uidata);
      return;
    }

    let dataPrefix = this.subpanel.dataPrefix = `${datapath}.materials[${mati}].`;

    console.warn("PREFIX", this.subpanel.dataPrefix, "yay", mesh);

    this.subpanel.prop("has_shader");

    if (this.ctx.api.getValue(this.ctx, this.subpanel.dataPrefix+"has_shader")) {
      let node = this.ctx.api.getValue(this.ctx, this.subpanel.dataPrefix+"shader");

      for (let k in node.inputs) {
        let sock = node.inputs[k];
        let bad = sock.edges.length > 0;
        bad = bad || (sock.graph_flag & SocketFlags.PRIVATE);
        bad = bad || sock instanceof DependSocket;

        if (bad) {
          continue;
        }

        let subpath = dataPrefix + `shader.inputs["${k}"].`;
        this.subpanel.dataPrefix = subpath;
        this.subpanel.inherit_packflag |= PackFlags.NO_NUMSLIDER_TEXTBOX;

        sock.buildUI(this.subpanel, () => {});
      }

      this.subpanel.dataPrefix = dataPrefix;
    }


    loadUIData(this.subpanel, uidata);
  }

  getShadingNode() {
    if (!this.hasAttribute("datapath")) {
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    if (!mesh) {
      return;
    }

    let mat = this.chooser.getActive(mesh);
    return this.ctx.api.getValue(this.ctx, this.getAttribute("datapath") + `.materials[${mat}].shader`);
  }
  update() {
    if (!this.chooser || !this.ctx) {
      return;
    }

    super.update();

    let rebuild = false;

    if (this.hasAttribute("datapath")) {
      if (this.getAttribute("datapath") !== this.chooser.getAttribute("datapath")) {
        this.chooser.setAttribute("datapath", this.getAttribute("datapath"));
        rebuild = true;
      }
    }

    let node = this.getShadingNode();
    let name = node ? node.constructor.name : "undefined";

    if (name !== this._lastnode_name) {
      this._lastnode_name = name;
      rebuild = true;
    }

    if (rebuild) {
      this.doOnce(this.rebuild);
    }
  }

  static define() {return {
    tagname : "mesh-material-panel-x"
  }}
}
UIBase.register(MeshMaterialPanel);
