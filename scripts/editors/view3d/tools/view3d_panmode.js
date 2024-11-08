import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {KeyMap} from "../../editor_base.ts";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import {TranslateWidget} from "../widgets/widget_tools.js";
import {nstructjs} from '../../../path.ux/scripts/pathux.js';

export class PanToolMode extends ToolMode {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;

    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }

  static register(cls) {
    ToolModes.push(cls);
    //WidgetTool.register(cls);
  }

  static toolModeDefine() {return {
    name        : "pan",
    uiname      : "Pan",
    icon        : Icons.PAN,
    flag        : 0,
    description : "Pan",
    selectMode  : SelMask.OBJECT, //if set, preferred selectmode, see SelModes
    transWidgets: []
  }}

  static buildSettings(container) {

  }

  static buildHeader(header, addHeaderRow) {
    super.buildHeader(header, addHeaderRow);

    //let strip = header.strip();
  }

  destroy() {
  }

  /*
  * called for all objects;  returns true
  * if an object if the toolmode drew the object
  * itself
  */
  drawObject(gl, uniforms, program, object, mesh) {
    return false;
  }
}

PanToolMode.STRUCT = nstructjs.inherit(PanToolMode, ToolMode) + `
}`;
nstructjs.register(PanToolMode);

ToolMode.register(PanToolMode);
