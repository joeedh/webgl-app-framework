import {Area} from '../../path.ux/scripts/screen/ScreenArea.js';
import {Editor, VelPan, makeDataBlockBrowser} from '../editor_base.js';
import {Light} from "../../light/light.js";
import {Mesh} from "../../mesh/mesh.js";
import {Material} from "../../core/material.js";
import {PointSet} from "../../potree/potree_types.js";
import {PopupEditor} from '../popup_editor.js';
import {ToolModes} from '../view3d/view3d_toolmode.js';

import {Icons} from '../icon_enum.js';
import '../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DataPathError} from '../../path.ux/scripts/controller/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/util/simple_events.js';
import {UIBase, PackFlags, color2css, _getFont, css2color} from '../../path.ux/scripts/core/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";
import {PropTypes, PropFlags} from "../../path.ux/scripts/toolsys/toolprop.js";

import {UndoFlags} from "../../path.ux/scripts/toolsys/simple_toolsys.js";
import {DataPath, DataTypes} from "../../path.ux/scripts/controller/simple_controller.js";
import {AreaFlags} from "../../path.ux/scripts/screen/ScreenArea.js";
import {DrawerEditor} from "../DrawerEditor.js";
import '../lastToolPanel.js';

export class PropsEditor extends DrawerEditor {
  constructor() {
    super();

    this.inherit_packflag = PackFlags.SIMPLE_NUMSLIDERS;
    this.packflag = PackFlags.SIMPLE_NUMSLIDERS;

    this.openWidth = 305;
    this._last_toolmode_i = undefined;
  }

  init() {
    super.init();

    this.rebuild();
  }

  rebuild() {
    if (!this.ctx || !this.ctx.scene) {
      this.doOnce(this.rebuild);
      return;
    }

    let active = this.panes.active !== undefined ? this.panes.active.id : undefined;

    console.warn("rebuilding properties panel");

    this.clear();

    this.buildSettingsPanel(this.pane("Material", "MATERIAL"));
    this.showPane("MATERIAL", false);

    let pane = this.pane("LAST_TOOL");
    pane.add(document.createElement("last-tool-panel-x"));

    if (active !== undefined) {
      let open = !this._closed;

      this.close();
      this.showPane(active, open);
    }
  }

  buildSettingsPanel(pane) {
    pane.packflag |= this.packflag;
    pane.inherit_packflag |= this.packflag;

    let panel = pane.panel("Materal");
    this.buildMaterial(panel)

    if (this.ctx !== undefined && this.ctx.scene.toolmode !== undefined) {
      panel = pane.panel("Geometry");
      this.ctx.scene.toolmode.constructor.buildElementSettings(panel);
    }

    if (this.ctx !== undefined && this.ctx.scene.toolmode !== undefined) {
      panel = pane.panel("Tool Settings");
      this.ctx.scene.toolmode.constructor.buildSettings(panel);
    }
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

  update() {
    super.update();

    if (!this.ctx || !this.ctx.scene)
      return;

    if (this._last_toolmode_i !== this.ctx.scene.toolmode_i) {
      this._last_toolmode_i = this.ctx.scene.toolmode_i;
      this.rebuild();
    }
  }
  static define() {return {
    tagname : "props-editor-x",
    areaname : "PropsEditor",
    uiname   : "Properties",
    icon     : -1,
    flag     : DrawerEditor.define().flag,
  }}
}

PropsEditor.STRUCT = STRUCT.inherit(DrawerEditor, Editor) + `
}
`;

Editor.register(PropsEditor);
nstructjs.manager.add_class(PropsEditor);
