import {Area, AreaFlags, ScreenArea} from "../path.ux/scripts/ScreenArea.js";
import {Editor} from "./editor_base.js";
import {Vector2} from "../path.ux/scripts/vectormath.js";
import * as util from '../util/util.js';
import {UIBase} from "../path.ux/scripts/ui_base.js";
import * as nstructjs from '../path.ux/scripts/struct.js';

export class DrawerEditor extends Editor {
  constructor() {
    super();

    this.floating = true;

    this.panes = [];
    this.panes.active = undefined;

    this.openWidth = 445;
    this.minWidth = 325;

    this.closedWidth = 5;
    this._closed = true;
  }

  pane(name, id=name) {
    let con = document.createElement("colframe-x");

    con.ctx = this.ctx;
    con._init();
    con.style["width"] = "100%";

    let pane = {
      contents : con,
      name : name,
      id : id
    };

    this.panes.push(pane);
    return pane.contents;
  }

  togglePane(id) {
    if (this._closed) {
      this.showPane(id);
    } else {
      if (this.panes.active === undefined || this.panes.active.id !== id) {
        this.showPane(id);
      } else {
        this.close();
      }
    }
  }

  showPane(id, autoOpen=true) {
    let p;

    for (let p2 of this.panes) {
      if (p2.id === id) {
        p = p2;
        break;
      }
    }

    if (!p) {
      console.warn("Unknown pane " + p);
      return;
    }

    if (p === this.panes.active) {
      if (autoOpen) {
        this.open();
      }

      return;
    }


    if (autoOpen && this._closed) {
      this.panes.active = p;
      this.open();
    } else if (!this._closed) {
      if (this.panes.active) {
        this.contents.clear(false);
      }

      this.panes.active = p;
      this.contents.add(p.contents);
    } else {
      this.panes.active = p;
    }
  }

  init() {
    super.init();

    let con = this.container;
    con.clear();

    let row = con.row();
    //row.label("Properties");

    this.contents = con.row();
    this.contents.style["width"] = "100%";
    con.style["width"] = "100%";
  }

  open() {
    if (!this._closed) {
      return;
    }

    this.minSize[0] = this.minWidth;
    this.maxSize[0] = undefined;
    this.size[0] = this.openWidth;

    if (this.owning_sarea) {
      this.owning_sarea.loadFromPosSize();
    }

    this._closed = false;

    if (this.panes.active) {
      this.contents.add(this.panes.active.contents);
    }
  }

  close() {
    if (this._closed) {
      return;
    }

    this.openWidth = this.size[0];

    this.minSize[0] = this.maxSize[0] = this.closedWidth;
    this._closed = true;

    this.size[0] = this.closedWidth;
    this.owning_sarea.loadFromPosSize();

    this.contents.clear(false);
  }

  update() {
    super.update();

    if (!this.ctx || !this.ctx.screen)
      return;

    let screen = this.ctx.screen;

    let pos = new Vector2();

    pos[0] = screen.size[0] - this.size[0];
    pos[1] = 0;

    if (pos.vectorDistance(this.pos) > 1) {
      console.log("repositioning drawer", this.pos, pos);

      this.pos[0] = pos[0];
      this.pos[1] = pos[1];

      this.owning_sarea.loadFromPosSize();
      screen.regenBorders();
    }

  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    if (this.activePane && this.activePane.length > 0) {
      this.doOnce(() => {
        this.showPane(this.activePane);
        delete this.activePane;
      })
    }
  }

  setCSS() {
    super.setCSS();
  }

  static define() {return {
    flag     : AreaFlags.INDEPENDENT|AreaFlags.FLOATING
  }}
}

DrawerEditor.STRUCT = nstructjs.inherit(DrawerEditor, Editor) + `
  openWidth  : float;
  activePane : string | obj.panes.active ? obj.panes.active.id : String() ; 
;}
`;

nstructjs.register(DrawerEditor);
