import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Icons} from '../icon_enum.js';
import {warning} from "../../path.ux/scripts/ui_noteframe.js";
import * as util from '../../util/util.js';
import {ResourceType, resourceManager} from '../../core/resource.js';
import {PointSetResource} from '../../potree/potree_resource.js'
import {ResourcePageType, ResourcePages} from './resbrowser_types.js';

import {Editor} from '../editor_base.js';
import {KeyMap} from "../../path.ux/scripts/simple_events.js";
import {Area} from "../../path.ux/scripts/ScreenArea.js";
import {UIBase} from "../../path.ux/scripts/ui_base.js";

let ResIconStyle =`
.resicon {
  border: 2px solid rgba(200, 200, 200, 1.0);
  border-radius: 15px;
  background-color : rgba(175, 175, 175, 1.0);
}

.resicon:hover {
  border: 2px solid rgba(100, 175, 255, 1.0);
  border-radius: 15px;
  background-color : rgba(175, 175, 175, 1.0);
}

.resicon_active {
  border: 2px solid rgba(180, 200, 255, 1.0);
  border-radius: 15px;
  background-color : rgba(180, 200, 255, 1.0);
}

.resicon_active:hover {
  border: 2px solid rgba(100, 175, 255, 1.0);
  border-radius: 15px;
  background-color : rgba(180, 200, 255, 1.0);
}

`.trim();

export class ResourceIcon extends UIBase {
  constructor() {
    super();
    this._last_cellsize = undefined;
  }

  init() {
    super.init();

    // border-radius: 5px;

    let span = this.span = document.createElement("span");
    span.setAttribute("class", "DefaultText");
    span.textContent = this.getAttribute("name");

    this.shadow.appendChild(span);

    this.setAttribute("class", "resicon");
    this.setCSS();
  }

  setCSS() {
    super.setCSS();

    let cellsize = parseFloat(this.getAttribute("cellsize"));

    let span = this.span;

    span.style["position"] = "absolute";
    span.style["top"] = (cellsize - 35) + "px";

    this.style["position"] = "absolute";
    this.style["width"] = cellsize + "px";
    this.style["height"] = cellsize + "px";
  }

  static define() {return {
    tagname : "resource-icon-x"
  }}

  updateCellSize() {
    if (this.getAttribute("cellsize") !== this._last_cellsize) {
      this._last_cellsize= this.getAttribute("cellsize");
      this.setCSS();
    }
  }

  update() {
    super.update();
    this.updateCellSize();
  }
}

UIBase.register(ResourceIcon);

export class ResourceBrowser extends Editor {
  constructor() {
    super();

    this.resourceType = "pointset";
    this.needsRebuild = true;
    this.icons = [];
    this.icons.active = undefined;
    this.swapCallback = undefined;
    this.swapCancelled = undefined;
    this.cellsize = 128;
  }

  static openResourceBrowser(area, resourceType, oncancel) {
    return new Promise((accept, reject) => {
      let newarea = area.swap(ResourceBrowser);

      newarea.swapCallback = accept;
      newarea.resourceType = resourceType;
      newarea.needsRebuild = true;
      newarea.swapCancelled = oncancel;
    });
  }

  init() {
    super.init();

    this.table = this.container.table();

    let header = this.header;
    //this.typeWidget = header.prop("resbrowser.resourceType");

    header.button("Load", () => {
      let res = this.icons.active;

      console.log("res", res);

      if (res === undefined) {
        return;
      }

      this.swapBack();

      if (this.swapCallback !== undefined) {
        this.swapCallback(res.res);
      }
    });

    header.button("Cancel", () => {
      this.swapBack();
      if (this.swapCancelled !== undefined) {
        this.swapCancelled();
      }
    });

    this.rebuild();
  }

  makeResIcon() {
    let ret = document.createElement("resource-icon-x");
    ret.setAttribute("cellsize", this.cellsize);
    return ret;
  }

  on_area_inactive() {
    super.on_area_inactive();

    this.table.clear();
    this.icons = [];
    this.icons.active = undefined;
    this.needsRebuild = false;
  }

  on_area_active() {
    super.on_area_active();
    this.needsRebuild = true;
  }

  rebuild() {
    if (this.table === undefined) {
      return;
    }

    this.setCSS();

    let rect = this.getClientRects()[0];

    //probably been disconnected from the dom
    if (rect === undefined) {
      this.needsRebuild = true;
      return;
    }

    let width = rect.width;
    let cells = Math.floor(width / this.cellsize);
    cells = Math.max(cells, 1);

    this.needsRebuild = false;

    console.log("rebuilding resource browser", width)

    this.icons = [];
    this.icons.active = undefined;

    let table = this.table;
    table.clear();

    if (!(this.resourceType in ResourcePages)) {
      console.log("Invalid resource type", this.resourceType);
      return;
    }

    let page = ResourcePages[this.resourceType];

    let setActive = (icon) => {
      if (this.icons.active !== undefined) {
        this.icons.active.setAttribute("class", "resicon");
      }

      icon.setAttribute("class", "resicon_active");
      this.icons.active = icon;
    };

    let icon_click = (e) => {
      //console.log(e.target, e.srcElement);
      setActive(e.target);
    };

    let i = 0;
    let row = table.row();

    for (let res of page.getResources()) {
      let cell = row.cell();

      cell.style["background-color"] = "rgba(0,0,0,0.0)";
      cell.style["padding"] = "5px";

      cell.overrideDefault("DefaultPanelBG", "rgba(0,0,0,0.0)");

      cell.style["width"] = this.cellsize + "px";
      cell.style["height"] = this.cellsize + "px";

      /*this is the stupidest thing.
      * why do I have to insert the stylesheet node *here*?*/
      let style = document.createElement("style");
      style.textContent = ResIconStyle;
      cell.shadow.prepend(style);

      let name = res.name !== undefined ? res.name : res.url;

      let icon = this.makeResIcon();
      icon.setAttribute("name", name);
      icon.res = res;

      cell.shadow.appendChild(icon);

      this.icons.push(icon);

      icon.addEventListener("click", icon_click);

      i++;
      if (i == cells) {
        row = table.row();
        i = 0;
      }
    }
  }

  update() {
    super.update();

    if (this.needsRebuild) {
      this.rebuild();
    }
  }

  copy() {
    let ret = document.createElement("resource-browser-x");
    ret.resourceType = this.resourceType;
    return ret;
  }

  defineKeyMap() {
    this.keymap = new KeyMap();

    return this.keymap;
  }

  setCSS() {
    super.setCSS();

    if (this.table === undefined) {
      return;
    }

    let table = this.table;

    table.style["background-color"] = "rgba(100, 100, 100, 1.0)";
    //table.style["background-color"] = "rgba(100, 100, 100, 1.0)";
    table.style["position"] = "absolute";
    table.style["width"] = "100%";
    table.style["height"] = "100%";
  }

  static define() {return {
    tagname : "resource-browser-x",
    areaname : "resbrowser",
    uiname : "Resource Browser"
  }}

  static newSTRUCT() {
    return document.createElement(this.define().tagname);
  }
}

ResourceBrowser.STRUCT = STRUCT.inherit(ResourceBrowser, Editor) + `
  resourceType : string;
}
`;
nstructjs.manager.add_class(ResourceBrowser);

Editor.register(ResourceBrowser);