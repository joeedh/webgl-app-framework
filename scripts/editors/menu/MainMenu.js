import {Area, BorderMask} from '../../path.ux/scripts/screen/ScreenArea.js';
import {saveFile, loadFile} from '../../path.ux/scripts/util/html5_fileapi.js';
import {Icons} from "../icon_enum.js";

import {NoteFrame, Note} from '../../path.ux/scripts/widgets/ui_noteframe.js';

import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;

import {DataPathError} from '../../path.ux/scripts/controller/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/util/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/core/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";
import * as cconst from '../../core/const.js';
import {AddPointSetOp} from "../../potree/potree_ops.js";
import {Menu} from "../../path.ux/scripts/widgets/ui_menu.js";

const menuSize = 52;

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

    this.menuSize = menuSize;

    this._switcher_key = "";
    this._ignore_tab_change = false;

    this.borderLock = BorderMask.TOP|BorderMask.BOTTOM;
  }

  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    let header = this.header;
    let strip = this._strip = header.strip();

    this.console = document.createElement("tool-console-x");
    this.container.add(this.console);
    this.console.hidden = true;

    strip.menu("File", [
      ["New  ", () => {
        console.log("File new");
        if (confirm("Make new file?")) {
          _genDefaultFile(_appstate, false);
        }
      }],
      Menu.SEP,
      ["Import...", () => {
        console.warn("Import dialog");

        let screen  =this.ctx.screen;
        let dialog = this.ctx.screen.popup(this, screen.mpos[0], screen.mpos[1], false);

        dialog.style["padding"] = "15px";
        dialog.label("Import");

        let row = dialog.row();
        row.label("URL:");
        dialog.urlbox = row.textbox(undefined, "https://");

        dialog.urlbox.disabled = false;
        window.urlbox = dialog.urlbox;

        row.button("Import", () => {
          let url = dialog.urlbox.text;
          url = url.trim();

          /*
          if (url.toLowerCase().startsWith("http://"))
            url = url.slice(7, url.length);
          if (url.toLowerCase().startsWith("https://"))
            url = url.slice(8, url.length);
          //*/

          console.log("importing", url);
          dialog.end();

          let toolop = new AddPointSetOp();
          toolop.inputs.url.setValue(url);
          this.ctx.toolstack.execTool(this.ctx, toolop);
        });

        row.button("Cancel", () => dialog.end());

        console.log("import!");
      }],
      ["Save Project", () => {
        console.log("File save");
        saveFile(_appstate.createFile(), "unnamed."+cconst.FILE_EXT, ["."+cconst.FILE_EXT]);
      }],
      ["Load Project", () => {
        console.log("File load");

        loadFile(undefined, ["."+cconst.FILE_EXT]).then((filedata) => {
          _appstate.loadFile(filedata);
        });
      }],
    ]);

    let tools = [
      "view3d.view_selected()",
      //"light.new(position='cursor')",
      "pointset.pack()"
    ];

    strip.menu("Edit", tools);

    strip.menu("Session", [
      ["Save Default File  ", () => {
        console.log("saving default file");
        _appstate.saveStartupFile();
      }],
      ["Clear Default File  ", () => {
        console.log("saving default file");
        _appstate.clearStartupFile();
      }]
    ]);

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
    });

    strip.noteframe();
    //this.makeScreenSwitcher(this.container);
    this.setCSS();
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
    icon     : -1
  }}
}

MenuBarEditor.STRUCT = STRUCT.inherit(MenuBarEditor, Editor) + `
}
`;

Editor.register(MenuBarEditor);
nstructjs.manager.add_class(MenuBarEditor);
