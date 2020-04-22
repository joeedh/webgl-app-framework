import {Area, BorderMask} from '../../path.ux/scripts/ScreenArea.js';
import {saveFile, loadFile} from '../../path.ux/scripts/html5_fileapi.js';

import {NoteFrame, Note} from '../../path.ux/scripts/ui_noteframe.js';

import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DataPathError} from '../../path.ux/scripts/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";

const menuSize = 48;

export class MenuBarEditor extends Editor {
  constructor() {
    super();

    this._switcher_key = "";
    this._ignore_tab_change = false;

    this.borderLock = BorderMask.TOP|BorderMask.BOTTOM;
  }

  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    let header = this.header;
    let strip = this._strip = header.strip();

    strip.menu("File", [
      ["New  ", () => {
        console.log("File new");
        if (confirm("Make new file?")) {
          _genDefaultFile(_appstate, false);
        }
      }],
      ["Save  ", () => {
        console.log("File save");
        saveFile(_appstate.createFile(), undefined, [".w3d"]);
      }],
      ["Load  ", () => {
        console.log("File load");

        loadFile(undefined, [".w3d"]).then((filedata) => {
          _appstate.loadFile(filedata);
        });
      }],
    ]);

    let tools = [
      "view3d.view_selected()",
      "mesh.toggle_select_all()",
      "light.new(position='cursor')"
    ];
    strip.menu("Edit", tools);

    strip.menu("Session", [
      ["Save Defalut File  ", () => {
        console.log("saving default file");
        _appstate.saveStartupFile();
      }],
      ["Clear Defalut File  ", () => {
        console.log("saving default file");
        _appstate.clearStartupFile();
      }]
    ]);

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

    let dpi = UIBase.getDPI();
    let h = Math.ceil(26); //menuSize);

    if (this.size[1] !== h) {
      this.size[1] = h;
      this.setCSS();
      this.ctx.screen.regenBorders();
    }

    /*
    let hash = this._makeSwitcherHash();
    if (hash !== this._switcher_key) {
      this.rebuildScreenSwitcher();
    }
    //*/
  }
  copy() {
    let ret = document.createElement("menu-editor-x");
    ret.ctx = this.ctx;

    return ret;
  }

  setCSS() {
    super.setCSS();

    let strip = this._strip;
    if (strip) {
      let margin = 45; // UIBase.getDPI();

      margin = ~~margin;
      //strip.style["margin-left"] = margin + "px";
    }
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
