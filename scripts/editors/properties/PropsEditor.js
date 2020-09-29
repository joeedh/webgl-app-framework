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

export class PropsEditor extends Editor {
  constructor() {
    super();
  }

  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    let header = this.header;
    let container = this.container;

    this.tabs = container.tabs("left");
    let tab;

    tab = this.tabs.tab("Scene");
    let panel = tab.panel("Render Settings");
    panel.prop("scene.envlight.color");
    panel.prop("scene.envlight.power");
    panel.prop("scene.envlight.flag");
    panel.prop("scene.envlight.ao_dist");
    panel.prop("scene.envlight.ao_fac");

    tab = this.tabs.tab("Material");
    this.materialPanel(tab);

    tab = this.tabs.tab("Object");

    tab = this.tabs.tab("Last Command");
    let last = document.createElement("last-tool-panel-x")
    tab.add(last);
  }

  materialPanel(tab) {
    let panel = document.createElement("mesh-material-panel-x");
    panel.setAttribute("datapath", "mesh");
    tab.add(panel);
  }

  update() {
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

  static define() {return {
    tagname : "props-editor-x",
    areaname : "props",
    uiname   : "Properties",
    icon     : -1
  }}
}

PropsEditor.STRUCT = STRUCT.inherit(PropsEditor, Editor) + `
}
`;

Editor.register(PropsEditor);
nstructjs.manager.add_class(PropsEditor);
