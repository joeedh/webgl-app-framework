import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor, VelPan, makeDataBlockBrowser} from '../editor_base.js';
import {Light} from "../../light/light.js";
import {Mesh} from "../../mesh/mesh.js";
import {Material} from "../../core/material.js";
import {PointSet} from "../../potree/potree_types.js";
import {PopupEditor} from '../popup_editor.js';
import {ToolModes} from '../view3d/view3d_toolmode.js';

import {Icons} from '../icon_enum.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DataPathError} from '../../path.ux/scripts/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase, PackFlags, color2css, _getFont, css2color} from '../../path.ux/scripts/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";

export class PropsEditor extends PopupEditor   {
  constructor() {
    super();

    this._needsBuild = 1;
    this.inherit_packflag = PackFlags.SIMPLE_NUMSLIDERS;
  }

  init() {
    super.init();

    this.background = "rgba(0,0,0,0)";

    let header = this.header;
    let container = this.container;

    //let col = container.col();

    this.build();
    this.close();
  }

  update() {
    super.update();

    if (this._needsBuild) {
      this.build();
    }
  }

  build() {
    let tabs = this;

    let bad = this.ctx === undefined || this.ctx.scene === undefined;
    bad = bad || this.ctx.scene.toolmode === undefined;

    if (bad) {
      return;
    }

    this._needsBuild = false;

    this.buildViews(tabs);
    this.buildViewTools(tabs);

    this.toolModeTab(tabs, "object", "Select Mode");

    this.buildMeasureTools(tabs);
    this.buildMaterial(tabs.tab("Material", Icons.MATERIAL));
  }

  buildMeasureTools(tabs) {
    let tab = tabs.tab("Measure Tools", Icons.MEASURE_TOOLS);

    this.buildToolMode(tab, "measure_angle", "Measure Angles");
    this.buildToolMode(tab, "measure_dist", "Measure Distance");
  }

  buildViews(tabs) {
    let tab = tabs.tab("Views", Icons.VIEWS);

    tab.button("Perspective");
    tab.button("Orthographic");
  }

  buildViewTools(tabs) {
    let tab = tabs.tab("View Tools", Icons.VIEW_TOOLS);

    this.buildToolMode(tab, "pan", "Pan");
  }

  buildToolMode(container, modename, name=modename) {
    let path = "scene.toolmode[" + modename + "]";

    let rdef = this.ctx.api.resolvePath(this.ctx, "scene.toolmode");

    let icon = rdef.prop.iconmap[modename];
    let descr = rdef.prop.descriptions[modename];
    let cls = ToolModes[rdef.prop.values[modename]];

    descr = descr === undefined ? name : descr;

    container.iconbutton(icon, descr, () => {
      this.ctx.api.setValue(this.ctx, "scene.toolmode", modename);
    });
  }

  toolModeTab(tabs, modename, name) {
    let path = "scene.toolmode[" + modename + "]";

    let rdef = this.ctx.api.resolvePath(this.ctx, "scene.toolmode");
    let icon = rdef.prop.iconmap[modename];
    let descr = rdef.prop.descriptions[modename];
    let cls = ToolModes[rdef.prop.values[modename]];

    let container = tabs.tritab(name, icon, descr, () => {
      console.log("toolmode set");
      this.ctx.api.setValue(this.ctx, "scene.toolmode", modename);
    });

    cls.buildSettings(container);
  }

  buildMaterial(tab) {
    makeDataBlockBrowser(tab, Material, "object.material", (container) => {
      container.prop("object.material.pointSize");
      container.prop("object.material.pointSizeType");
      container.prop("object.material.pointShape");
    });
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
