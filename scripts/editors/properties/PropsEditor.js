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
import {Menu} from "../../path.ux/scripts/widgets/ui_menu.js";
import {MeshTypes} from "../../mesh/mesh_base.js";

export class CDLayerPanel extends ColumnFrame {
  constructor() {
    super();
    this._lastUpdateKey = undefined;
  }

  init() {
    super.init();
    this.doOnce(this.rebuild);
  }

  rebuild() {
    if (!this.ctx) {
      this._lastUpdateKey = undefined;
      return;
    }

    this.clear();

    let meshpath = this.getAttribute("datapath");
    let type = this.getAttribute("type");
    let layertype = this.getAttribute("layer");

    if (!this.hasAttribute("datapath") || !this.hasAttribute("type") || !this.hasAttribute("layer")) {
      this.ctx.error("Expected 'datapath' 'type' and 'layer' attributes'");
      return;
    }
    type = type.toUpperCase().trim();
    type = MeshTypes[type];

    if (!type) {
      this.ctx.error("Bad mesh type " + this.getAttribute("type"));
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, meshpath);
    if (!mesh) {
      this.ctx.error("data api error", meshpath);
      return;
    }
    let elist = mesh.getElemList(type);
    if (!elist) {
      this.ctx.error("Mesh api error " + type);
      return;
    }

    let panel = this.panel(layertype + " Layers");

    this.list = panel.listbox();
    let actlayer = elist.customData.getActiveLayer(layertype);

    let checks = [];

    for (let layer of elist.customData.flatlist) {
      if (layer.typeName === layertype) {
        let item = this.list.addItem(layer.name);

        let check = item.iconcheck(undefined, Icons.CIRCLE_SEL);
        check.checked = layer === actlayer;
        check.layerIndex = layer.index;

        checks.push(check);

        check.onchange = function () {
          if (this.checked) {
            elist.customData.setActiveLayer(this.layerIndex);

            for (let c of checks) {
              if (c !== this) {
                c.checked = false;
              }
            }
          } else {
            if (elist.customData.getActiveLayer(layertype).index === this.layerIndex) {
              let chg = this.onchange;
              this.checked = true;
              this.onchange = chg;
            }
          }
        }


      }
    }

    panel.useIcons(false);
    panel.tool(`mesh.add_cd_layer(elemType=${type} layerType="${layertype}")`);
  }

  updateDataPath() {
    if (!this.ctx) {
      return;
    }

    let meshpath = this.getAttribute("datapath");
    let type = this.getAttribute("type");
    let layertype = this.getAttribute("layer");

    if (!this.hasAttribute("datapath")
      || !this.hasAttribute("type")
      || !this.hasAttribute("layer")) {
      return;
    }

    type = type.toUpperCase().trim();
    type = MeshTypes[type];

    if (!type) {
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, meshpath);
    if (!mesh) {
      return;
    }

    let key = mesh.lib_id + ":";
    let elist = mesh.getElemList(type);

    if (!elist) {
      return;
    }

    for (let layer of elist.customData.flatlist) {
      if (layer.typeName === layertype) {
        key += layer.name + ":";
      }
    }

    if (key !== this._lastUpdateKey) {
      this._lastUpdateKey = key;

      //console.log("rebuilding mesh layers list");
      this.rebuild();
    }
  }

  update() {
    super.update();

    this.updateDataPath();
  }

  static define() {
    return {
      tagname: "cd-layer-panel-x"
    }
  }
}

UIBase.register(CDLayerPanel);

export class ObjectPanel extends ColumnFrame {
  constructor() {
    super();

    this._last_update_key = "";
  }

  init() {
    super.init();
    this.rebuild();
    //this.doOnce(this.rebuild);
  }

  rebuild() {
    if (!this.ctx) {
      if (!this.isDead()) {
        this.doOnce(this.rebuild);
      }

      return;
    }

    this.clear();
    this.pathlabel("object.name");

    this.label("Rotation");
    this.prop('object.inputs["rot"].value');
    this.prop('object.inputs["rotOrder"].value');

    let ob = this.ctx.object;
    if (!ob) {
      return;
    }

    let data = ob.data;
    if (data instanceof Mesh) {
      let panel = this.panel("Data Layers");
      let cd = UIBase.createElement("cd-layer-panel-x")

      cd.setAttribute("datapath", "mesh");
      cd.setAttribute("type", "VERTEX");
      cd.setAttribute("layer", "color");

      panel.add(cd);
    }
  }

  update() {
    super.update();

    if (!this.ctx || !this.ctx.object) {
      return;
    }


    let ob = this.ctx.object;
    let key = "" + ob.lib_id + ":" + ob.data.lib_id;

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.rebuild();
    }
  }

  static define() {
    return {
      tagname: "scene-object-panel-x"
    }
  }
}

UIBase.register(ObjectPanel);

export class PropsEditor extends Editor {
  constructor() {
    super();

    this._last_toolmode = undefined;
  }

  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    let header = this.header;
    let container = this.container;

    this.tabs = container.tabs("left");
    let tab;

    this.workspaceTab = this.tabs.tab("Workspace");

    tab = this.tabs.tab("Scene");
    let panel = tab.panel("Render Settings");
    panel.prop("scene.envlight.color");
    panel.prop("scene.envlight.power");
    panel.prop("scene.envlight.flag");
    panel.prop("scene.envlight.ao_dist");
    panel.prop("scene.envlight.ao_fac");

    tab = this.tabs.tab("Material");
    this.materialPanel(tab);

    tab = this.objTab = this.tabs.tab("Object");
    let obpanel = UIBase.createElement("scene-object-panel-x");
    tab.add(obpanel);

    this._last_obj = undefined;

    tab = this.tabs.tab("Last Command");
    let last = document.createElement("last-tool-panel-x")
    tab.add(last);
  }

  materialPanel(tab) {
    let panel = document.createElement("mesh-material-panel-x");
    panel.setAttribute("datapath", "mesh");
    tab.add(panel);
  }

  updateToolMode() {
    if (!this.ctx || !this.ctx.toolmode || !this.workspaceTab) {
      return;
    }

    let toolmode = this.ctx.toolmode;

    if (toolmode === this._last_toolmode) {
      return;
    }

    this._last_toolmode = toolmode;

    this.workspaceTab.clear();
    toolmode.constructor.buildSettings(this.workspaceTab);
  }

  update() {
    this.updateToolMode();

    super.update();
  }

  copy() {
    let ret = document.createElement("props-editor-x");
    ret.ctx = this.ctx;

    return ret;
  }

  setCSS() {
    super.setCSS();
  }

  static define() {
    return {
      tagname: "props-editor-x",
      areaname: "props",
      uiname: "Properties",
      icon: -1
    }
  }
}

PropsEditor.STRUCT = STRUCT.inherit(PropsEditor, Editor) + `
}
`;

Editor.register(PropsEditor);
nstructjs.manager.add_class(PropsEditor);
