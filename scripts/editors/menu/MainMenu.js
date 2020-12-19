import {Area, BorderMask, AreaFlags} from '../../path.ux/scripts/screen/ScreenArea.js';
import {Icons} from "../icon_enum.js";

import {NoteFrame, Note} from '../../path.ux/scripts/widgets/ui_noteframe.js';

import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;

import {saveFile, loadFile, DataPathError, KeyMap, HotKey} from '../../path.ux/scripts/pathux.js';

import "../../mesh/mesh_createops.js";
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/core/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";
import * as cconst from '../../core/const.js';
import {Menu} from "../../path.ux/scripts/widgets/ui_menu.js";

const menuSize = 27;

import * as platform from '../../core/platform.js';

let electron_api;
if (window.haveElectron) {
  import("../../path.ux/scripts/platforms/electron/electron_api.js").then((api) => {
    electron_api = api;
  });
}

export class ToolHistoryConsole extends ColumnFrame {
  constructor() {
    super();

    this._buf = undefined;
    this.tooltable = undefined;
  }

  rebuild() {
    if (!this.tooltable) {
      return;
    }

    let table = this.tooltable;
    let toolstack = this.ctx.toolstack;

    let lines = [];
    let count = 28;

    for (let i=toolstack.length-1; i>=toolstack.length-count; i--) {
      if (i < 0) {
        break;
      }

      let l = toolstack[i].genToolString();
      l = {
        line : l,
        i    : i
      };

      lines = [l].concat(lines);
    }

    let buf = lines.join("\n") + toolstack.cur;
    if (buf !== this._buf) {
      this._buf = buf;

      table.clear();

      let focusrow, lastrow;

      for (let l of lines) {
        let row = table.row();

        if (l.i === toolstack.cur) {
          focusrow = row;
          row.style["background-color"] = "rgb(10, 100, 75, 0.5)";
        }

        row.label(""+(l.i+1));
        row.label(l.line);
        lastrow = row;
      }

      if (!focusrow)
        focusrow = lastrow;

      window.fp = focusrow;

      if (!this.hidden && focusrow !== undefined) {
        focusrow.scrollIntoView();
      }

      this.setCSS();
    }
  }

  init() {
    this.setCSS();

    this.tooltable = this.table();
    this.rebuild();

    this.style["background-color"] = "rgba(50, 50, 50, 0.5)";
  }

  update() {
    super.update();

    this.rebuild();
  }

  setCSS() {
    super.setCSS();
  }

  static define() {return {
    tagname : "tool-console-x"
  }}
}
UIBase.register(ToolHistoryConsole);

export class MenuBarEditor extends Editor {
  constructor() {
    super();

    this.needElectronRebuild = true;

    this.menuSize = menuSize;
    this.areaDragToolEnabled = false;

    this._switcher_key = "";
    this._ignore_tab_change = false;
    this._last_toolmode = undefined;

    this.borderLock = BorderMask.TOP|BorderMask.BOTTOM;
  }

  buildEditMenu() {
    this.needElectronRebuild = true;

    let def = this._editMenuDef;

    def.length = 0;
    def.push(["Undo", () => {
      _appstate.toolstack.undo();
    }, "Ctrl+Z", Icons.UNDO])
    def.push(["Redo", () => {
      _appstate.toolstack.undo();
    }, "Ctrl+Shift+Z", Icons.REDO])

    def.push(Menu.SEP);
    def.push("view3d.view_selected()");

    if (this.ctx && this.ctx.scene && this.ctx.toolmode) {
      let toolmode = this.ctx.toolmode;
      let def2 = toolmode.constructor.buildEditMenu();

      for (let item of def2) {
        def.push(item);
      }
    }
  }

  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    let header = this.header;
    let strip = this._strip = header.row();

    this.console = document.createElement("tool-console-x");
    this.container.add(this.console);
    this.console.hidden = true;

    let menubar = this._menubar = strip.row();

    menubar.menu("File", [
      ["New  ", () => {
        console.log("File new");
        if (confirm("Make new file?")) {
          _genDefaultFile(_appstate, false);
        }
      }],
      Menu.SEP,
      ["Save Project", () => {
        console.log("File save");

        platform.platform.showSaveDialog("Save File", _appstate.createFile(),{
          filters : [
            {
              defaultPath : "unnamed." + cconst.FILE_EXT,
              name : "Project Files",
              extensions : [cconst.FILE_EXT]
            }
          ]
        }).then(() => {
          this.ctx.message("File saved");
        });
        //saveFile(_appstate.createFile(), "unnamed."+cconst.FILE_EXT, ["."+cconst.FILE_EXT]);
      }],
      ["Load Project", () => {
        console.log("File load");

        platform.platform.showOpenDialog("Open File", {
          filters : [
            {
              name : "Project Files",
              extensions : [cconst.FILE_EXT]
            }
          ]
        }).then((paths) => {
          console.log("paths", paths);
          if (paths.length === 0) {
            return;
          }

          return platform.platform.readFile(paths[0], "application/x-octet-stream")
        }).then((data) => {
          console.log("got data!", data);
          _appstate.loadFileAsync(data);
        });

        //loadFile(undefined, ["."+cconst.FILE_EXT]).then((filedata) => {
          //_appstate.loadFile(filedata);
        //});
      }],
    ]);

    this._editMenuDef = [];

    menubar.menu("Edit", this._editMenuDef);

    this.buildEditMenu();

    let tools = [
      "view3d.view_selected()",
      //"light.new(position='cursor')",
    ];

    menubar.menu("Add", [
      "mesh.make_cube()",
      "light.new()",
    ]);

    menubar.menu("Session", [
      ["Save Default File  ", () => {
        console.log("saving default file");
        _appstate.saveStartupFile();
      }],
      ["Clear Default File  ", () => {
        console.log("saving default file");
        _appstate.clearStartupFile();
      }]
    ]);

    menubar.update();

    strip.iconbutton(Icons.CONSOLE, "Show Console", () => {
      if (this.menuSize !== menuSize) {
        this.menuSize = menuSize;
        this.console.hidden = true;
        this.console.style["overflow"] = "hidden";
      } else {
        this.menuSize = 200;
        this.console.hidden = false;
        this.console.style["overflow"] = "scroll";
      }
    }).iconsheet = 0;

    strip.noteframe();
    //this.makeScreenSwitcher(this.container);

    this.setCSS();
    this.flushUpdate();

    if (window.haveElectron) {
      menubar.style["display"] = "none";
    }
  }

  onFileLoad() {
    super.onFileLoad();
    //this.rebuildScreenSwitcher();
  }

  rebuildScreenSwitcher() {
    if (this.tabs !== undefined) {
      this.tabs.remove();
    }

    //this.makeScreenSwitcher(this.container);
  }

  _on_tab_change(tab) {
    if (this._ignore_tab_change) {
      return;
    }

    console.warn("Screen tab change!", tab, this.ctx.datalib.getLibrary("screen").active.lib_id);

    if (tab.id == "maketab") {
      console.log("new screen!");

      let lib = this.ctx.datalib.getLibrary("screen");
      let sblock = lib.active;

      if (sblock === undefined) {
        sblock = lib[0];
      }

      let sblock2 = sblock.copy();
      sblock2.name = lib.uniqueName(sblock2.name);

      lib.add(sblock2);
      lib.setActive(sblock2);

      _appstate.switchScreen(sblock2);
      //this.rebuildScreenSwitcher();
    } else {
      console.log(tab.id);
      let sblock = this.ctx.datalib.get(tab.id);

      if (sblock !== undefined) {
        this.ctx.state.switchScreen(sblock);
      } else {
        console.log("failed to load screen", tab.id, tab);
      }
    }
  }


  _makeSwitcherHash() {
    let ret = "";
    for (let k of _appstate.datalib.screen) {
      ret += k + "|";
    }

    return ret;
  }

  makeScreenSwitcher(container) {
    let tabs = this.tabs = container.tabs();

    this._switcher_key = this._makeSwitcherHash();
    //console.log("rebuilding screen switcher tabs");

    tabs.onchange = (tab) => {
      this._on_tab_change(tab);
    };

    let lib = this.ctx.datalib.getLibrary("screen");

    this._ignore_tab_change = true;

    for (let sblock of lib) {
      let screen = sblock.screen;

      let tab = tabs.tab(sblock.name, sblock.lib_id);

      if (sblock === lib.active) {
        tabs.setActive(tab);
      }
    }

    let tab = tabs.tab("+", "maketab");
    this._ignore_tab_change = false;
  }

  on_area_active() {
    //this.rebuildScreenSwitcher();
    this.setCSS();
  }

  update() {
    super.update();

    if (this.needElectronRebuild && window.haveElectron && electron_api) {
      this.needElectronRebuild = false;
      electron_api.initMenuBar(this, true);
      this._menubar.style["display"] = "none";

    }

    if (this.ctx && this.ctx.toolmode && this.ctx.toolmode.constructor && this.ctx.toolmode.constructor.name !== this._last_toolmode) {
      console.warn("Rebuilding edit menu");
      this._last_toolmode = this.ctx.toolmode.constructor.name;
      this.buildEditMenu();
    }

    if (this.minSize[1] !== this.menuSize) {
      this.minSize[1] = this.menuSize;
      this.maxSize[1] = this.menuSize;

      this.ctx.screen.solveAreaConstraints();
      this.ctx.screen.snapScreenVerts();
      this.ctx.screen.regenBorders();
      this.setCSS();
    }
  }

  copy() {
    let ret = document.createElement("menu-editor-x");
    ret.ctx = this.ctx;

    return ret;
  }

  setCSS() {
    if (this.console) {
      this.console.style["width"] = this.size[0] + "px";
      this.console.style["height"] = (this.size[1] - menuSize) + "px";
    }

    super.setCSS();
  }

  static define() {return {
    tagname : "menu-editor-x",
    areaname : "MenuBarEditor",
    uiname   : "Main Menu",
    icon     : Icons.EDITOR_MENU,
    flag     : AreaFlags.HIDDEN|AreaFlags.NO_SWITCHER
  }}
}

MenuBarEditor.STRUCT = STRUCT.inherit(MenuBarEditor, Editor) + `
}
`;

Editor.register(MenuBarEditor);
nstructjs.manager.add_class(MenuBarEditor);
