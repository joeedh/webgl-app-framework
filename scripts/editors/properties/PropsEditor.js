import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor, VelPan} from '../editor_base.js';
import {Light} from "../../light/light.js";
import {Mesh} from "../../mesh/mesh.js";
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

export class PropsEditor extends Editor {
  constructor() {
    super();
  }

  init() {
    super.init();

    let header = this.header;
    let container = this.container;

    let col = container.col();

    let tabs = col.tabs("left");
    this.buildScene(tabs.tab("Scene"));

    tabs.tab("Material");
    this.buildObject(tabs.tab("Object"));
  }

  buildObject(tab) {
    tab.getContextKey = () => {
      let ctx = this.ctx;

      let ob = ctx.object;
      if (ob === undefined) {
        return "undefined";
      }

      let key = ob.data.constructor.blockDefine().typeName;
      return key;
    };

    tab._update = tab.update;
    tab.ctxkey = "";
    tab.update = () => {
      let key = tab.getContextKey();

      if (key != tab.ctxkey) {
        console.log("tab transformation");
        tab.ctxkey = key;
        tab.clear();

        let ob = this.ctx.object;
        if (ob === undefined) {
          tab._update();
          return;
        }

        if (ob.data instanceof Light) {
          tab.prop("light.inputs['power'].value");
        } else if (ob.data instanceof Mesh) {

        }
      }

      tab._update();
    }
  }

  buildScene(tab) {
    let l = tab.label("Scene Properties for: ");
    l.setAttribute("datapath", "scene.name");

    let panel = tab.panel("Ambient Light");
    panel.prop("scene.envlight.color");
    panel.prop("scene.envlight.power");

    panel = tab.panel("Ambient Occlusion");
    panel.prop("scene.envlight.ao_dist");
    panel.prop("scene.envlight.ao_fac");
  }

  on_area_active() {
    this.setCSS();
  }

  copy() {
    let ret = document.createElement("property-editor-x");

    return ret;
  }

  static define() {return {
    tagname : "property-editor-x",
    areaname : "PropsEditor",
    uiname   : "Properties",
    icon     : -1
  }}
}

PropsEditor.STRUCT = STRUCT.inherit(PropsEditor, Editor) + `
}
`;

Editor.register(PropsEditor);
nstructjs.manager.add_class(PropsEditor);