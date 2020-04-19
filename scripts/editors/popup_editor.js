import {Editor} from "./editor_base.js";
import {UIBase} from "../path.ux/scripts/ui_base.js";
import {keymap} from '../path.ux/scripts/events.js';

export class PopupEditor extends Editor {
  constructor() {
    super();

    this.toolbar = undefined;
    this.tabs = [];
    this.tab_idmap = {};
    this.tabs.active = undefined;
    this.tab_idgen = 0;

    this.open = false;

    this.openSize = 350;
    this.contents = undefined;
    this.lastContents = undefined;
  }

  clear() {
    this.tabs = [];
    this.tabs.active = undefined;
    this.toolbar.clear();

    if (this.contents !== undefined) {
      this.contents.remove();
      this.contents = undefined;
      this.open = false;
    }

    this.setCSS();
    this.ctx.screen.regenBorders();

    return this;
  }

  toggleTab(tab) {
    console.log("toggle tab", tab.name);

    this.lastContents = tab;

    if (this.contents !== undefined) {
      this.contents.remove();
      this.openSize = this.size[0];

      if (this.contents === tab) {
        this.contents = undefined;
        this.setCSS();
        this.update();
        this.open = false;
        this.ctx.screen._internalRegenAll();
        return;
      }
    }

    this.open = true;
    this.tabs.active = tab;
    this.contents = tab;
    this.container.add(this.contents);

    //this.shadow.appendChild(this.contents);
    this.size[0] = this.openSize;

    this.ctx.screen._internalRegenAll();
    this.ctx.screen.setCSS();
    this.setCSS();
    this.update();
  }

  shrinkToFit() {
    let rect = this.getClientRects()[0];
    if (rect !== undefined) {
      let w = ~~(rect.width+0.5);
      let h = ~~(rect.height+0.5);

      if (w !== this.size[0] || h !== this.size[1]) {
        this.size[0] = w;
        this.size[1] = h;

        this.ctx.screen.regenBorders();
        this.setCSS();
      }
    }
  }

  update() {
    super.update();

    if (!this.open) {
      this.shrinkToFit();
    }
  }

  setCSS() {
    super.setCSS();

    if (this.contents === undefined) {
      this.style["width"] = "min-content";
      this.container.style["width"] = "min-content";
    } else {
      this.container.style["width"] = "auto";
    }
  }

  tab(name, icon=-1, description=name) {
    let container = document.createElement("container-x");

    container.ctx = this.ctx;
    container.init();
    container.style["height"] = "min-content";
    container.style["width"] = "100%";

    container._tab_id = this.tab_idgen++;
    container.name = name;

    this.tabs.push(container);
    this.tab_idmap[container._tab_id] = container;

    let id = container._tab_id;
    let cb = () => {
      this.toggleTab(this.tab_idmap[id]);
    };

    if (icon >= 0) {
      this.toolbar.iconbutton(icon, description, cb);
    } else {
      let button = this.toolbar.button(name, cb);
      button.title = description;
    }

    return container;
  }

  on_keydown(e) {
    super.on_keydown(e);
    console.log("key down!");

    switch (e.keyCode) {
      case keymap["Escape"]:
        if (this.open) {
          this.toggleTab(this.tabs.active);
        }
        break;
    }
  }

  makeHeader() {
    return;
  }

  init() {
    super.init();

    this.container.remove();

    let container = this.container = document.createElement("rowframe-x");
    container.ctx = this.ctx;
    container.init();
    container.parentWidget = this;
    this.shadow.appendChild(container);

    let toolbar = this.toolbar = container.col();

    container.style["width"] = "auto";
    container.style["height"] = "min-content";
    toolbar.style["width"] = "min-content";
    toolbar.style["height"] = "min-content";
  }
}
