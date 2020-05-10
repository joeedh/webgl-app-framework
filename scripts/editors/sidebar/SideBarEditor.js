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
import {PropTypes, PropFlags} from "../../path.ux/scripts/toolprop.js";

import {UndoFlags} from "../../path.ux/scripts/simple_toolsys.js";
import {DataPath, DataTypes} from "../../path.ux/scripts/simple_controller.js";
import {AreaFlags} from "../../path.ux/scripts/ScreenArea.js";
import * as cconst from "../../core/const.js";
import {toggleDebugNodePanel} from "../node/NodeEditor_debug.js";

import '../lastToolPanel.js';

//export class LastToolPanel extends
export class SideBarEditor extends PopupEditor   {
  constructor() {
    super();

    this._needsBuild = 1;

    this.inherit_packflag = PackFlags.SIMPLE_NUMSLIDERS;
    this.packflag = PackFlags.SIMPLE_NUMSLIDERS;
  }

  init() {
    super.init();

    this.useDataPathUndo = true;

    this.background = "rgba(0,0,0,0)";

    let header = this.header;
    let container = this.container;

    //let col = container.col();

    this.build();
    this.close();
  }

  update() {
    super.update();

    if (this.ctx.scene.toolmode_i !== this._toolmode_i) {
      this._toolmode_i = this.ctx.scene.toolmode_i;
      this._needsBuild = true;
    }

    if (this._needsBuild) {
      this.build();
    }
  }

  build() {
    let tabs = this;

    this.clear();

    let bad = !this._needsBuild;
    bad = bad || this.ctx === undefined || this.ctx.scene === undefined;
    bad = bad || this.ctx.scene.toolmode === undefined;

    if (bad) {
      return;
    }

    console.warn("BUILD");
    this._needsBuild = false;

    this.buildViews(tabs);
    this.buildViewTools(tabs);

    this.toolModeTab(tabs, "object", "Select Mode");

    this.buildMeasureTools(tabs);

    this.iconbutton(Icons.MATERIAL, "Point Settings", () => this.callPropsPane("MATERIAL"));
    this.iconbutton(Icons.LAST_TOOL_PANEL, "Last Tool Settings", () => this.callPropsPane("LAST_TOOL"));

    if (cconst.DEBUG.enableDebugGraphPanel) {
      this.iconbutton(Icons.NODE_EDITOR, "(Debug) Show Scene Graph", () => {
        toggleDebugNodePanel(this.ctx.screen);
      })
    }
    //let tab = tabs.tab("Last Run Tool", Icons.LAST_TOOL_PANEL);

  }

  callPropsPane(id) {
    let ctx = this.ctx;

    if (!ctx || !ctx.propsbar) {
      return;
    }

    ctx.propsbar.togglePane(id);
  }

  buildMeasureTools(tabs) {
    let tab = tabs.tab("Measure Tools", Icons.MEASURE_TOOLS);

    let strip = tab.row();
    this.buildToolMode(strip, "measure_angle", "Measure Angles");
    this.buildToolMode(strip, "measure_dist", "Measure Distance");

    strip = tab.row();
    this.buildToolMode(strip, "measure_circle", "Measure Circle");
  }

  buildViews(tabs) {
    let tab = tabs.tab("Views", Icons.VIEWS);

    tab.useIcons(false);
    tab.checkenum_panel("view3d.cameraMode");
  }

  buildViewTools(tabs) {
    let tab = tabs.tab("View Tools", Icons.VIEW_TOOLS);

    tab.useIcons();
    
    this.buildToolMode(tab, "pan", "Pan");
    tab.tool("view3d.view_selected()");
    tab.tool("view3d.center_at_mouse()");

    tab.prop("scene.toolmode[camera_path]");

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
    //makeDataBlockBrowser(tab, Material, "object.material", (container) => {
    let container = tab.col();
    console.log("tabwer", tab.packflag, container.packflag, PackFlags.SIMPLE_NUMSLIDERS);

    container.style["padding"] = "10px";

    container.prop("pointset.material.quality");
    container.prop("pointset.material.pointSize");
    container.checkenum_panel("pointset.material.pointSizeType", undefined, PackFlags.VERTICAL);
    container.checkenum_panel("pointset.material.pointShape", undefined, PackFlags.VERTICAL);
    //});
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
    tagname : "sidebar-editor-x",
    areaname : "SideBarEditor",
    uiname   : "Sidebar",
    icon     : -1,
    flag     : AreaFlags.FLOATING|AreaFlags.INDEPENDENT
  }}
}

SideBarEditor.STRUCT = STRUCT.inherit(SideBarEditor, Editor) + `
}
`;

Editor.register(SideBarEditor);
nstructjs.manager.add_class(SideBarEditor);
