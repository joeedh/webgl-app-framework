import {
  nstructjs, Vector2, Vector3, Vector4, ToolOp, StringProperty, Quat, Matrix4,
  haveModal, keymap, KeyMap, HotKey, ToolClasses, ToolFlags, ToolMacro
} from '../path.ux/scripts/pathux.js';

import * as units from '../path.ux/scripts/core/units.js';

//set base unit for world space data
units.Unit.baseUnit = "foot";

import './theme.js';

let STRUCT = nstructjs.STRUCT;
import {Area, ScreenArea, contextWrangler, areaclasses} from '../path.ux/scripts/screen/ScreenArea.js';
import {Screen} from '../path.ux/scripts/screen/FrameManager.js';
import {UIBase, saveUIData, loadUIData} from '../path.ux/scripts/core/ui_base.js';
import {Container} from '../path.ux/scripts/core/ui.js';
import * as util from '../util/util.js';
import {warning} from "../path.ux/scripts/widgets/ui_noteframe.js";
import {Icons} from './icon_enum.js';
import {PackFlags} from "../path.ux/scripts/core/ui_base.js";

export {keymap, KeyMap, HotKey} from '../path.ux/scripts/pathux.js';
import {DataBlock, BlockFlags, DataRefProperty} from '../core/lib_api.js';

export {VelPanFlags, VelPan} from './velpan.js';

/*default toolops for new/duplicate/unlinking datablocks*/
export class NewDataBlockOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "New",
      toolpath: "datalib.default_new",
      inputs  : {
        name         : new StringProperty(),
        blockType    : new StringProperty(),
        dataPathToSet: new StringProperty()
      },
      outputs : {
        block: new DataRefProperty()
      }
    }
  }

  exec(ctx) {
    let type = this.inputs.blockType.getValue();
    let cls = DataBlock.getClass(type);

    let ret = new cls();
    let name = this.inputs.name.getValue();

    if (name !== "") {
      ret.name = name;
    }

    ctx.datalib.add(ret);

    let path = this.inputs.dataPathToSet.getValue();
    let addUser = true;

    if (path !== "") {
      //try to intelligently add reference count with owner block ref. . .
      let rdef = ctx.api.resolvePath(ctx, path);

      if (rdef && rdef.obj && rdef.obj instanceof DataBlock && rdef.obj.lib_id >= 0) {
        if (rdef.obj !== ctx.api.getValue(ctx, path)) {
          ret.lib_addUser(rdef.obj);
          addUser = false
        }
      }


      ctx.api.setValue(ctx, path, ret);
    }

    //if pulling owner block from data api failed (e.g. the owner isn't a datablcok) increment the reference count
    //anyway; it will be regenerated on file load
    if (addUser) {
      ret.lib_addUser();
    }

    this.outputs.block.setValue(ret);
  }
}

ToolOp.register(NewDataBlockOp);

export class CopyDataBlockOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Copy",
      toolpath: "datalib.default_copy",
      inputs  : {
        block        : new DataRefProperty(),
        dataPathToSet: new StringProperty()
      },
      outputs : {
        block: new DataRefProperty()
      }
    }
  }

  exec(ctx) {
    let block = ctx.datalib.get(this.inputs.block.getValue());

    if (!block) {
      ctx.warning("failed to duplicated block", block);
      return;
    }

    let ret = block.copy();

    //just to be safe, add a user ref, it will be re-derived on load anyway
    ret.lib_users++;
    ret.name = block.name;

    ctx.datalib.add(ret);

    let path = this.inputs.dataPathToSet.getValue();
    if (path !== "") {
      ctx.api.setValue(ctx, path, ret);
    }

    this.outputs.block.setValue(ret);
  }
}

ToolOp.register(CopyDataBlockOp);

export class AssignDataBlock extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Assign",
      toolpath: "datalib.default_assign",
      inputs  : {
        block        : new DataRefProperty(),
        dataPathToSet: new StringProperty()
      }
    }
  }

  exec(ctx) {
    let block = ctx.datalib.get(this.inputs.block.getValue());

    let path = this.inputs.dataPathToSet.getValue();
    let rdef = ctx.api.resolvePath(path);

    if (rdef && rdef.obj && rdef.obj instanceof DataBlock && rdef.obj.lib_id >= 0) {
      let obj = rdef.obj;
      let old = ctx.api.getValue(ctx, path);

      if (old) {
        old.lib_remUser(obj);
      }

      if (block) {
        obj.lib_addUser(block);
      }
    }

    if (path !== "") {
      ctx.api.setValue(ctx, path, block);
    }
  }
}

ToolOp.register(AssignDataBlock);


export class UnlinkDataBlockOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Unlink Block",
      toolpath: "datalib.default_unlink",
      inputs  : {
        block          : new DataRefProperty(),
        dataPathToUnset: new StringProperty()
      },
      outputs : {}
    }
  }

  exec(ctx) {
    let block = ctx.datalib.get(this.inputs.block.getValue());

    let path = this.inputs.dataPathToUnset.getValue();
    let rdef = ctx.api.resolvePath(ctx, path);

    if (block && rdef && rdef.obj && rdef.obj instanceof DataBlock && rdef.obj.lib_id >= 0) {
      rdef.obj.lib_remUser(block);
    }

    console.log(`setting ${path} to undefined`);
    ctx.api.setValue(ctx, path, undefined);
  }
}

ToolOp.register(UnlinkDataBlockOp);

/**
 * Requires attributes:
 *
 * \attribute datapath
 *
 * \prop blockClass class of data blocks for this browser
 * \prop newOp toolpath for op to make a new block (defaults to "datalib.default_new")
 * \prop duplicateOp toolpath for op to duplciate a block (defaults to "datalib.default_copy")
 * \prop unlinkOp toolpath for op to unlink a block from its owner (defualts to "datalib.default_unlink")
 */

export class DataBlockBrowser extends Container {
  constructor() {
    super();

    this.overrideClass("strip");

    this.blockClass = undefined;

    //if not undefined, path to "owner" of datapath
    //if undefined, will be derived via datapath api
    this.ownerPath = undefined;
    this.vertical = false;

    this._owner_exists = false;
    this._path_exists = false;
    this._needs_rebuild = true;
    this._last_mat_name = undefined;

    this.useDataPathUndo = false;

    /* if not undefined, is a function that filters blocks for visibility
    *  in menu*/
    this.filterFunc = undefined;
    this.onValidData = undefined;

    this.newOp = "datalib.default_new";
    this.duplicateOp = "datalib.default_copy";
    this.unlinkOp = "datalib.default_unlink";
    this.assignOp = "datalib.default_assign";
  }

  static define() {
    return {
      tagname: "data-block-browser-x"
    }
  }

  init() {
    super.init();

    this.flagRebuild();
  }

  setCSS() {
    super.setCSS();

    this.background = this.getDefault("background-color");

    let radius = this.getDefault("border-radius") ?? 10;
    let color = this.getDefault("border-color") ?? "black";
    let wid = this.getDefault("border-width") ?? 1;
    let padding = this.getDefault("padding") ?? 2;

    this.style["border"] = `${wid}px solid ${color}`;
    this.style["border-radius"] = radius + "px";
    this.style["padding"] = padding + "px";
  }

  flagRebuild() {
    console.warn("flagRebuild");
    this._needs_rebuild = true;
  }

  _getDataPath() { //image user widget overrides this
    return this.getAttribute("datapath");
  }

  rebuild() {
    this._needs_rebuild = false;

    let ctx = this.ctx;
    let path = this._getDataPath();

    this.clear();

    if (!this.doesOwnerExist()) {
      //this.label("Nothing selected");
      return;
    }

    console.warn("Data block browser recalc");

    let col = this.col();

    let val = this.getPathValue(ctx, path);
    let meta = this.ctx.api.resolvePath(this.ctx, path);

    this._last_mat_name = val === undefined ? undefined : val.name;

    let prop = ctx.datalib.getBlockListEnum(this.blockClass, this.filterFunc);
    let dropbox = document.createElement("dropbox-x")

    dropbox.prop = prop;
    dropbox.setAttribute("name", val !== undefined ? val.name : "");

    //listenum(inpath, name, enummap, defaultval, callback, iconmap, packflag=0) {
    dropbox.onselect = (id) => {
      let val = this.getPathValue(ctx, path);
      let meta = this.ctx.api.resolvePath(this.ctx, path);

      if (val !== undefined && val.lib_id === id) {
        return;
      }

      if (val !== undefined) {
        val.lib_remUser(meta.obj);
      }

      let block = ctx.datalib.get(id);
      block.lib_addUser(meta.obj);

      console.log("Assigning block");

      this.useDataPathUndo = false;
      this.setPathValue(ctx, path, block);
      this.flagRebuild();
    };

    let update = dropbox.update;
    dropbox.update = () => {
      dropbox.prop = ctx.datalib.getBlockListEnum(this.blockClass, this.filterFunc);
      update.apply(dropbox, arguments);
    };

    let row;
    if (!this.vertical) {
      row = col.row();
    } else {
      row = col.col();
    }

    row.add(dropbox);

    let type = this.blockClass.blockDefine().typeName;

    if (val) {
      row.tool(`${this.duplicateOp}(block=${val.lib_id} dataPathToSet="${path}")`, PackFlags.USE_ICONS);
      row.tool(`${this.unlinkOp}(block=${val.lib_id} dataPathToUnset="${path}")`, PackFlags.USE_ICONS);
    } else {
      row.tool(`${this.newOp}(blockType="${type}" dataPathToSet="${path}")`, PackFlags.USE_ICONS);
    }

    if (val !== undefined) {
      row.prop(`${path}.lib_flag[FAKE_USER]`, PackFlags.USE_ICONS);

      if (this.onValidData !== undefined) {
        col.inherit_packflag = this.inherit_packflag;
        this.onValidData(col);
      }
    } else {

    }
  }

  doesOwnerExist() {
    if (this.ownerPath !== undefined) {
      return this.ctx.api.getValue(this.ownerPath);
    }

    let path = this._getDataPath();
    let meta = this.ctx.api.resolvePath(this.ctx, path);

    if (meta === undefined) {
      return false;
    }

    return meta.obj !== undefined;
  }

  update() {
    let path = this._getDataPath();

    let exists = this.doesOwnerExist();
    let val = this.getPathValue(this.ctx, path);
    let name = val === undefined ? undefined : val.name;

    let rebuild = exists !== this._owner_exists || (!!val) !== this._path_exists;
    rebuild = rebuild || this._needs_rebuild;
    rebuild = rebuild || name !== this._last_mat_name;

    if (rebuild) {
      this._owner_exists = exists;
      this._path_exists = !!val;
      this._last_mat_name = name;

      this.rebuild();
    }

    super.update();
  }
}

UIBase.register(DataBlockBrowser);

export class ImageUserWidget extends DataBlockBrowser {
  constructor() {
    super();

    this.blockClass = ImageBlock;
  }

  static define() {
    return {
      tagname: "image-user-x"
    }
  }

  _getDataPath() {
    return this.getAttribute("datapath") + ".image";
  }
}

UIBase.register(ImageUserWidget);

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

//used by datapath system
export class EditorAccessor {
  constructor() {
    this._defined = new Set();
    this._namemap = {};

    this.update();
  }

  update() {
    let define = (k, cls) => {
      Object.defineProperty(this, k, {
        get() {
          return getContextArea(cls);
        }
      });
    }

    for (let k in areaclasses) {
      if (this._defined.has(k)) {
        continue;
      }

      this._defined.add(k);

      let cls = areaclasses[k];
      let def = cls.define();

      let name = def.apiname ?? def.areaname;
      name = name.replace(/[\- \t]/g, "_");

      this._namemap[name] = k;

      define(name, areaclasses[k]);
    }
  }
}

export let editorAccessor = new EditorAccessor();

export function rebuildEditorAccessor() {
  editorAccessor.update();
}

export function buildEditorsAPI(api, ctxStruct) {
  Editor.defineAPI(api);

  editorAccessor.update();

  let st = api.mapStruct(EditorAccessor, true);

  //let st = api.mapStruct(
  for (let k in areaclasses) {
    let cls = areaclasses[k];

    cls.defineAPI(api);

    let name = cls.define().apiname ?? cls.define().areaname;
    name = name.replace(/[\- \t]/g, "_");

    ctxStruct.struct("editors." + name, name, cls.define().uiname, api.mapStruct(cls));
    st.struct(name, name, cls.define().uiname, api.mapStruct(cls));
  }
}

export class EditorSideBar extends Container {
  constructor() {
    super();

    //expects this.editor to be set by Editor
    this.editor = undefined;


    this._closed = false;

    this.closedWidth = 25;
    this.openWidth = 250;

    this._height = 500;
    this._width = this.openWidth;

    this.clear();
  }

  get width() {
    return this._width;
  }

  set width(v) {
    this._width = v;
    this.style["width"] = this._width + "px";
  }

  get height() {
    return this._height;
  }

  set height(v) {
    this._height = v;
  }

  set closed(v) {
    if (!!v === !!this._closed) {
      return;
    }

    if (v) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  static define() {
    return {
      tagname: "editor-sidebar-x",
      style  : "sidebar"
    }
  }

  clear() {
    super.clear();

    this._icon = this.iconbutton(Icons.SHIFT_RIGHT, "Collapse/Expand", () => {
      if (this._closed) {
        this.expand();
      } else {
        this.collapse();
      }
    }, undefined, PackFlags.SMALL_ICON);


    let tabs = this.tabpanel = this.tabs("left");

    //make tabs smaller
    tabs.tabFontScale = 0.75;
  }

  collapse() {
    if (this._closed) {
      return;
    }

    console.log("collapse");
    this._closed = true;

    this.animate().goto("width", this.closedWidth, 500).then(() => {
      this._icon.icon = Icons.SHIFT_LEFT;
    });
  }

  expand() {
    if (!this._closed) {
      return;
    }

    console.log("expand");
    this._closed = false;
    this.animate().goto("width", this.openWidth, 500).then(() => {
      this._icon.icon = Icons.SHIFT_RIGHT;
    });
  }

  update() {
    super.update();

    if (!this.editor.size) {
      return;
    }

    let h = this.editor.size[1];

    if (h !== this._height) {
      this._height = h;
      this.style["height"] = "" + this._height + "px";
      this.flushUpdate();
      console.log("Sidebar height update");
    }
  }

  setCSS() {
    this.style["height"] = "" + this._height + "px";
    this.style["width"] = "" + this._width + "px";
    this.background = this.getDefault("background-color");
  }

  saveData() {
    let ret = super.saveData();

    ret.closed = this._closed;

    return ret;
  }

  loadData(obj) {
    if (!obj) {
      return;
    }

    this.closed = obj.closed;
  }
}

UIBase.register(EditorSideBar);

export class Editor extends Area {
  constructor() {
    super();

    this.useDataPathUndo = true;

    this.swapParent = undefined;
    this.container = document.createElement("container-x");
    this.container.parentWidget = this;

    this.shadow.appendChild(this.container);
  }

  static defineAPI(api) {
    let st = api.mapStruct(this, true);

    st.vec2("pos", "pos", "Position", "Position of editor in window");
    st.vec2("size", "size", "Size", "Size of editor");
    st.string("type", "type", "Type", "Editor type").customGetSet(function () {
      let obj = this.dataref;
      return obj.constructor.define().areaname;
    }).readOnly();

    return st;
  }

  static register(cls) {
    if (!nstructjs.manager.isRegistered(cls)) {
      throw new Error("You must register editors with nstructjs: " + cls.name);
    }

    Area.register(cls);
  }

  static newSTRUCT() {
    return document.createElement(this.define().tagname);
  }

  makeSideBar() {
    let sidebar = document.createElement("editor-sidebar-x");
    sidebar.editor = this;

    this.container.add(sidebar);

    return sidebar;
  }

  dataLink(owner, getblock, getblock_addUser) {

  }

  init() {
    super.init();

    this.tabIndex = 1;
    this.setAttribute("tabindex", "-1");

    this.container.useDataPathUndo = this.useDataPathUndo;

    this.style["overflow"] = "hidden";

    let cb = () => {
      this.push_ctx_active();
      this.pop_ctx_active();
    }

    this.addEventListener("dragover", cb, {passive: true});
    this.addEventListener("mouseenter", cb, {passive: true});
    this.addEventListener("mouseover", cb, {passive: true});
    this.addEventListener("mousein", cb, {passive: true});
    this.addEventListener("focus", cb, {passive: true});

    this.defineKeyMap();

    this.container.ctx = this.ctx;
    this.makeHeader(this.container, false);
    this.setCSS();
  }

  swapBack() {
    let sarea = this.owning_sarea;

    if (this.swapParent) {
      this.swap(this.swapParent.constructor);
      this.swapParent = undefined;
    }

    return sarea.area;
  }

  swap(editor_cls, storeSwapParent = true) {
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

  /*copy of code in Area clas in ScreenArea.js in path.ux.
    example of how to define an area.

  static define() {return {
    tagname  : "areaname-x", //the -x is required by html
    areaname : "areaname", //api name for area type
    apiname  : undefined, //if undefined, will override api instance name, e.g. if you want ctx.areaName instead of ctx.areaname
    uiname   : undefined,
    icon : undefined //icon representing area in MakeHeader's area switching menu. Integer.
    flag : see AreaFlags
  };}
  */

  defineKeyMap() {
    this.keymap = new KeyMap();

    return this.keymap;
  }

  getID() {
    return this.ctx.screen.sareas.indexOf(this.owning_sarea);
  }

  on_keydown(e) {
    this.push_ctx_active();
    this.pop_ctx_active();
  }

  getScreen() {
    return this.owning_sarea !== undefined && this.owning_sarea.screen !== undefined ? this.owning_sarea.screen
                                                                                     : _appstate.screen;
  }
};
Editor.STRUCT = STRUCT.inherit(Editor, Area) + `
}
`;
nstructjs.register(Editor);

import {Menu} from "../path.ux/scripts/widgets/ui_menu.js";
import * as ui_base from "../path.ux/scripts/core/ui_base.js";
import {time_ms} from "../util/util.js";
import {MakeMaterialOp} from "../core/material.js";
import {SocketFlags} from "../core/graph.js";
import {DependSocket} from "../core/graphsockets.js";
import {ImageBlock} from '../image/image.js';

export function spawnToolSearchMenu(ctx) {
  let tools = [];
  let screen = ctx.screen;

  let menu = document.createElement("menu-x");

  for (let cls of ToolClasses) {
    let ok = !(cls.tooldef().flag & ToolFlags.PRIVATE);

    try {
      ok = cls.canRun(ctx);
    } catch (error) {
      util.print_stack(error);
      ok = false;
    }

    if (!ok) {
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
      /*
      new HotKey("T", ["ALT"], () => {
        if (window.__stest) {
          window.__stest.stop();
          window.__stest = undefined;
        } else {
          window.__stest = window._testSculpt(undefined, {sort : 1});
          window.__stest.start();
        }
      }),
      new HotKey("I", ["ALT"], () => {
        if (window.__stest) {
          window.__stest.stop();
          window.__stest = undefined;
        } else {
          window.__stest = window._testSculpt(undefined, {sort : 0});
          window.__stest.start();
        }
      }),*/
      new HotKey("S", ["CTRL"], "app.save(forceDialog=false)"),
      new HotKey("O", ["CTRL"], "app.open()"),
      new HotKey("N", ["CTRL"], "app.new()"),
      new HotKey("N", ["CTRL", "ALT"], "app.new()"),

      new HotKey("Left", [], () => {
        let time = this.ctx.scene.time;
        this.ctx.scene.changeTime(Math.max(time - 1, 0));
      }),
      new HotKey("Right", [], () => {
        let time = this.ctx.scene.time;
        this.ctx.scene.changeTime(time + 1);
      }),
    ]);
  }

  static define() {
    return {
      tagname: "webgl-app-x"
    }
  }

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

  ToolOp.onTick();
}, 50);

window.setInterval(() => {
  if (window._appstate && _appstate.ctx) {
    _appstate.ctx.messagebus.validateSubscribers();
  }
}, 5000);

App.STRUCT = STRUCT.inherit(App, Screen, 'App') + `
}`;
UIBase.register(App);
nstructjs.register(App);

export class ScreenBlock extends DataBlock {
  constructor() {
    super();

    //this.screen = document.createElement("webgl-app-x");
  }

  static blockDefine() {
    return {
      typeName   : "screen",
      defaultName: "Screen",
      uiName     : "Screen",
      icon       : -1,
      flag       : BlockFlags.FAKE_USER //always have user count > 0
    }
  }

  copy() {
    let ret = new ScreenBlock();

    ret.screen = this.screen.copy();
    ret.name = this.name;
    ret.lib_flag = this.lib_flag;

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

ScreenBlock.STRUCT = STRUCT.inherit(ScreenBlock, DataBlock) + `
  screen : App;
}
`;
nstructjs.register(ScreenBlock);
DataBlock.register(ScreenBlock);

let last_time = util.time_ms();

if (0) {
  window.setInterval(() => {
    if (window._appstate && _appstate.ctx && _appstate.ctx.scene && _appstate.ctx.view3d) {
      //for debugging purposes, check if screen is listening
      if (_appstate.screen.listen_timer === undefined) {
        return;
      }

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
  }, 1000.0/30.0);
}

export class MeshMaterialChooser extends Container {
  constructor() {
    super();

    this.addButton = undefined;
    this._last_mesh_key = undefined;
    this._activeMatCache = [];
    this._activeMatCacheSize = 5;
  }

  static define() {
    return {
      tagname: "mesh-material-chooser-x"
    }
  }

  init() {
    this.doOnce(this.rebuild);
  }

  getActive(mesh) {
    if (!mesh) return 0;

    for (let i = 0; i < this._activeMatCache.length; i += 2) {
      if (this._activeMatCache[i] === mesh.lib_id) {
        let ret = this._activeMatCache[i + 1];

        if (ret >= mesh.materials.length) {
          ret = this._activeMatCache[i + 1] = mesh.materials.length - 1;
        }

        return ret;
      }
    }

    this.setActive(mesh, 0);
    return 0;
  }

  saveData() {
    return Object.assign(super.saveData(), {
      _activeMatCache: this._activeMatCache
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

    for (let i = 0; i < this._activeMatCache.length; i += 2) {
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
      this._activeMatCache[idx + 1] = mati;
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
          this.onchange(mesh.materials.length - 1);
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
}

UIBase.register(MeshMaterialChooser);

export class MeshMaterialPanel extends Container {
  constructor() {
    super();
  }

  static define() {
    return {
      tagname: "mesh-material-panel-x"
    }
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

    if (this.ctx.api.getValue(this.ctx, this.subpanel.dataPrefix + "has_shader")) {
      let node = this.ctx.api.getValue(this.ctx, this.subpanel.dataPrefix + "shader");

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

        sock.buildUI(this.subpanel, () => {
        });
      }

      this.subpanel.dataPrefix = dataPrefix;
    }


    loadUIData(this.subpanel, uidata);
  }

  getShadingNode() {
    if (!this.hasAttribute("datapath")) {
      return;
    }

    let mesh = this.getPathValue(this.ctx, this.getAttribute("datapath"));
    if (!mesh) {
      return;
    }

    let mat = this.chooser.getActive(mesh);
    return this.getPathValue(this.ctx, this.getAttribute("datapath") + `.materials[${mat}].shader`);
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
}

UIBase.register(MeshMaterialPanel);

export class DirectionChooser extends UIBase {
  constructor() {
    super();

    this._last_dpi = undefined;
    this.size = 128;
    this.canvas = document.createElement("canvas");
    this.shadow.appendChild(this.canvas);
    this.mdown = false;
    this.modaldata = undefined;
    this._highlight = false;
    this.last_th = 0;
    this.start_th = 0;

    this.flip = [1, 1];

    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.value = new Vector3([0, 0.1, 1]);

    this.g = this.canvas.getContext("2d");
  }

  get highlight() {
    return this._highlight;
  }

  set highlight(v) {
    let render = !!v !== !!this._highlight;

    this._highlight = v;
    if (render) {
      this.doOnce(this.render);
    }
  }

  get disabled() {
    return this._disabled;
  }

  set disabled(v) {
    let render;

    if (this._disabled !== v) {
      this.render();
    }

    this._disabled = v;
  }

  static define() {
    return {
      tagname: "direction-chooser-3d-x"
    }
  }

  endModal() {
    if (this.modaldata) {
      console.log("end modal");
      popModalLight(this.modaldata);
    }

    this.modaldata = undefined;
    this.mdown = false;
    return;
  }

  init() {
    super.init();

    this.noMarginsOrPadding();
    this.setCSS();
    this._disabled = false;

    this.addEventListener("mouseover", (e) => {
      this.highlight = true;
    })
    this.addEventListener("mouseleave", (e) => {
      this.highlight = false;
      //this.mdown = false;
    })
    this.addEventListener("mouseout", (e) => {
      this.highlight = false;
      //this.mdown = false;
    })
    this.addEventListener("focus", (e) => {
      this.highlight = true;
    })
    this.addEventListener("blur", (e) => {
      this.highlight = false;
      this.mdown = false;
    })

    let mousedown = (e, x, y) => {
      this.mdown = true;
      this.last_th = 0;
      this.first = true;
      this.start_value = new Vector3(this.value);
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;

      this.flip = [1, 1];

      let table = [-1, 1, -1, -1];

      let a = this.value[0] >= 0.0;
      let b = this.value[1] >= 0.0;
      let m = a | (b<<1);

      let r = this.getBoundingClientRect();
      let dx2 = x - (r.x + r.width*0.5), dy2 = y - r.y - r.height*0.5;
      let s = dx2*this.value[1] - dy2*this.value[0];

      //this.flip[0] = s < 0.0 ? -1.0 : 1.0;
      //this.flip[0] = table[m];

      if (this.modaldata) {
        this.endModal();
      }

      this.modaldata = pushModalLight({
        on_mousedown  : (e) => {
          if (e.button === 2) {
            this.endModal();
            this.setValue(this.start_value);
          }
        },
        on_mousemove  : (e) => {
          let mat = new Matrix4();

          //mat.multiply(rmat);

          let r = this.canvas.getBoundingClientRect();
          let rx = r.x + r.width*0.5;
          let ry = r.y + r.height*0.5;

          let dx2 = e.x - rx, dy2 = e.y - ry;
          let sdx2 = this.start_mpos[0] - rx, sdy2 = this.start_mpos[1] - ry;

          let scale = 1.0/(0.5*this.size*Math.sqrt(3.0));
          let rawlen = Math.sqrt(dx2*dx2 + dy2*dy2)/(Math.sqrt(2.0)*this.size);

          sdx2 = Math.min(Math.max(sdx2, -this.size), this.size);
          sdy2 = Math.min(Math.max(sdy2, -this.size), this.size);
          dx2 = Math.min(Math.max(dx2, -this.size), this.size);
          dy2 = Math.min(Math.max(dy2, -this.size), this.size);

          let v1 = new Vector3([sdx2*scale, sdy2*scale, 0]);
          let v2 = new Vector3([dx2*scale, dy2*scale, 0]);


          v1[2] = 1.0 - (v1[0] + v1[1]);
          v2[2] = 1.0 - (v2[0] + v2[1]);

          v1.normalize();
          v2.normalize();

          if (v1.vectorDistance(v2) < 0.05) {
            return;
          }

          let axis = new Vector3(v1).cross(v2).normalize();
          rawlen *= 4.0;

          let th = Math.acos(v1.dot(v2)*0.999999);
          th += rawlen*Math.sign(th);

          let quat = new Quat();
          quat.axisAngleToQuat(axis, th);
          quat.normalize();
          mat = quat.toMatrix();

          this.value.load(this.start_value);
          this.value.multVecMatrix(mat);

          //*
          if (this.hasAttribute("datapath")) {
            this.setPathValue(this.ctx, this.getAttribute("datapath"), this.value);
          }
          if (this.onchange) {
            this.onchange(this.value);
          }//*/

          this.last_mpos[0] = e.x;
          this.last_mpos[1] = e.y;
          this.render();
        },
        on_mouseup    : (e) => {
          this.endModal();
        },
        on_touchend   : (e) => {
          this.endModal();
        },
        on_touchcancel: (e) => {
          this.endModal();
          this.setValue(this.start_value);
        },

        on_keydown: (e) => {
          console.log(e.keyCode, this.modaldata);

          switch (e.keyCode) {
            case keymap["Escape"]:
              this.setValue(this.start_value);
            case keymap["Enter"]:
              this.endModal();
              break;
          }
        }
      })
    }

    this.addEventListener("touchstart", (e) => {
      if (e.touches.length === 0) {
        return;
      }

      mousedown(e, e.touches[0].pageX, e.touches[0].pageY);
    });
    this.addEventListener("touchend", (e) => {
      if (this.modaldata) {
        this.endModal();
      }
    });

    this.addEventListener("mousedown", (e) => {
      mousedown(e, e.x, e.y);
    })


    this.tabIndex = 0;
  }

  _getRMat() {
    let quat = new Quat();
    let axis = new Vector3();
    let av = new Vector3(this.value);
    let value = new Vector3(this.value).normalize();

    av.abs();

    if (1 || av[0] > av[1] && av[0] > av[2]) {
      axis[2] = 1.0;
    } else {
      axis[0] = 1.0;
    }

    axis.cross(value).normalize();

    let vth = Math.acos(value[2]*0.99999);
    quat.axisAngleToQuat(axis, vth);
    quat.normalize();
    let rmat = quat.toMatrix();

    return rmat;
  }

  setCSS() {
    super.setCSS();

    let dpi = UIBase.getDPI();

    this._last_dpi = dpi;

    let w = ~~(this.size*dpi);
    this.canvas.width = w;
    this.canvas.height = w;

    this.canvas.style.width = (w/dpi) + "px";
    this.canvas.style.height = (w/dpi) + "px";

    this.canvas.style["border-radius"] = "5px";
    this.canvas.style["background-color"] = "white";

    this.render();
  }

  render() {
    //console.log("rendering direction chooser");

    let g = this.g, canvas = this.canvas, size = canvas.width;

    g.clearRect(0, 0, size, size);

    if (this.disabled) {
      g.fillStyle = "rgb(55,55,55)";
      g.beginPath();
      g.rect(0, 0, size, size);
      g.fill();
      return;
    }

    g.save();
    g.scale(size, size);
    g.beginPath();

    let steps;
    let p = new Vector4();
    let r = 0.04;

    let mat = new Matrix4();

    let rmat = this._getRMat();

    mat.perspective(25, 1.0, 0.01, 10.0);

    function proj(p) {
      p[3] = 1.0;
      //p[2] = -p[2];
      p[2] -= 4.0;

      p.multVecMatrix(mat);
      let w = p[3];

      if (Math.abs(w) > 0.00001) {
        p.mulScalar(1.0/w);
        p[3] = w;
      }

      p[0] = p[0]*0.5 + 0.5;
      p[1] = p[1]*0.5 + 0.5;

      return w;
    }

    g.beginPath();
    g.fillStyle = "rgba(55,55,55,0.35)";

    steps = 64;
    let th = -Math.PI, dth = (Math.PI*2.0)/steps;
    r *= 1.5;

    for (let i = 0; i < steps; i++, th += dth) {
      //break;
      for (let j = 0; j < 3; j++) {
        let r2 = 0.33;
        p[j] = Math.sin(th)*r2;
        p[(j + 1)%3] = Math.cos(th)*r2;
        p[(j + 2)%3] = 0.0;

        p.multVecMatrix(rmat);

        let w = proj(p);

        if (w < 0) continue;

        //console.log("XY",p[0].toFixed(3), p[1].toFixed(3), th, i, dth);

        g.moveTo(p[0], p[1]);
        g.arc(p[0], p[1], r/w, -Math.PI, Math.PI);
      }
    }

    g.fill();

    g.beginPath();
    if (this.highlight) {
      g.fillStyle = "rgba(250, 128, 55, 0.5)";
    } else {
      g.fillStyle = "rgba(55,55,55,0.5)";
    }

    steps = 64;
    let s = 0, ds = 1.0/steps;

    for (let i = 0; i < steps; i++, s += ds) {
      p.zero().interp(this.value, s).mulScalar(1.5);

      let w = proj(p);

      let x = p[0];
      let y = p[1];

      if (w < 0.0) {
        continue;
      }
      g.moveTo(x, y);
      g.arc(x, y, r/w, -Math.PI, Math.PI);
    }

    g.fill();

    g.restore();
  }

  setValue(v) {
    this.value.load(v);

    if (this.hasAttribute("datapath")) {
      this.setPathValue(this.ctx, this.getAttribute("datapath"), this.value);
      this.render();
    }

    if (this.onchange) {
      this.onchange(this.value);
    }
  }

  updateDataPath() {
    if (!this.hasAttribute("datapath") || !this.ctx) {
      return;
    }

    let val = this.getPathValue(this.ctx, this.getAttribute("datapath"));

    if (val === undefined) {
      this.disabled = true;
      return;
    }

    this.disabled = false;
    if (this.value.vectorDistance(val) > 0.0001) {
      console.log("path update");

      this.value.load(val);
      if (this.onchange) {
        this.onchange(val);
      }

      this.render();
    }
  }

  updateDPI() {
    let dpi = UIBase.getDPI();

    if (this._last_dpi !== dpi) {
      this._last_dpi = dpi;
      this.setCSS();
    }
  }

  update() {
    super.update();

    this.updateDPI();
    this.updateDataPath();
  }
}

UIBase.register(DirectionChooser);
