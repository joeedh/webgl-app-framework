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

const LastKey = Symbol("LastToolPanelId");
let tool_idgen = 0;

export class LastToolPanel extends ColumnFrame {
  constructor() {
    super();

    this._tool_id = undefined;
    this.useDataPathUndo = false;
  }

  init() {
    super.init();

    this.useDataPathUndo = false;
    this.rebuild();
  }

  rebuild() {
    let ctx = this.ctx;
    if (ctx === undefined) {
      this._tool_id = -1; //wait for .ctx
      return;
    }

    this.clear();

    this.label("Recent Tool Settings");

    //don't process the root toolop
    let bad = ctx.toolstack.length === 0;
    bad = bad || ctx.toolstack[ctx.toolstack.cur].undoflag & UndoFlags.IS_UNDO_ROOT;

    if (bad) {
      this.setCSS();
      return;
    }

    let tool = ctx.toolstack[ctx.toolstack.cur];
    let def = tool.constructor.tooldef();
    let name = def.uiname !== undefined ? def.uiname : def.name;

    let panel = this.panel(def.uiname);

    let fakecls = {};
    fakecls.constructor = fakecls;

    //in theory it shouldn't matter if multiple last tool panels
    //override _last_tool, since they all access the same data
    this.ctx.state._last_tool = fakecls;
    let lastkey = tool[LastKey];

    let getTool = () => {
      let tool = this.ctx.toolstack[this.ctx.toolstack.cur];
      if (!tool || tool[LastKey] !== lastkey) {
        return undefined;
      }

      return tool;
    };

    let st = this.ctx.api.mapStruct(fakecls, true);
    let paths = [];

    function defineProp(k, key) {
      Object.defineProperty(fakecls, key, {
        get : function() {
          let tool = getTool();
          if (tool) {
            return tool.inputs[k].getValue();
          }
        },

        set : function(val) {
          let tool = getTool();
          if (tool) {
            tool.inputs[k].setValue(val);
            ctx.toolstack.rerun(tool);

            window.redraw_viewport();
          }
        }
      });
    }

    for (let k in tool.inputs) {
      let prop = tool.inputs[k];

      console.log("PROP FLAG", prop.flag, k);
      if (prop.flag & (PropFlags.PRIVATE|PropFlags.READ_ONLY)) {
        continue;
      }

      let uiname = prop.uiname !== undefined ? prop.uiname : k;

      prop.uiname = uiname;
      let apikey = k.replace(/[\t ]/g, "_");

      let dpath = new DataPath(apikey, apikey, prop, DataTypes.PROP);
      st.add(dpath);

      paths.push(dpath);

      defineProp(k, apikey);
    }

    for (let dpath of paths) {
      let path = "last_tool." + dpath.path;

      panel.label(dpath.data.uiname);
      panel.prop(path);
    }
    this.setCSS();

    console.log("Building last tool settings");
  }

  update() {
    super.update();
    let ctx = this.ctx;

    if (ctx.toolstack.length == 0) {
      return;
    }

    let tool = ctx.toolstack[ctx.toolstack.cur];
    if (!(LastKey in tool) || tool[LastKey] !== this._tool_id) {
      tool[LastKey] = tool_idgen++;
      this._tool_id = tool[LastKey];

      this.rebuild();
    }
  }

  static define() {return {
    tagname : "last-tool-panel-x"
  }}
}
UIBase.register(LastToolPanel);

//export class LastToolPanel extends
export class PropsEditor extends PopupEditor   {
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
    this.buildSettingsPanel(tabs);

    let tab = tabs.tab("Last Run Tool", Icons.LAST_TOOL_PANEL);
    tab.add(document.createElement("last-tool-panel-x"));
  }

  buildSettingsPanel(tabs) {
    tabs.packflag |= this.packflag;
    tabs.inherit_packflag |= this.packflag;

    let tab = tabs.tab("Settings", Icons.MATERIAL);

    let panel;

    panel = tab.panel("Materal");
    this.buildMaterial(panel)

    panel = tab.panel("Elements");
    if (this.ctx !== undefined && this.ctx.scene.toolmode !== undefined) {
      this.ctx.scene.toolmode.constructor.buildElementSettings(panel);
    }
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
