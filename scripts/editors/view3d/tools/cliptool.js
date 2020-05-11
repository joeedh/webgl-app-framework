import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import {nstructjs} from '../../../path.ux/scripts/pathux.js';

let STRUCT = nstructjs.STRUCT;

export class ClipTool extends ToolMode {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;

    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }


  static buildSettings(container) {

  }

  static buildHeader(header, addHeaderRow) {
  }

  static widgetDefine() {return {
    name        : "clip",
    uiname      : "Clip",
    icon        : Icons.CLIP_TOOLS,
    flag        : 0,
    description : "Clip Tool"
  }}
}

ClipTool.STRUCT = STRUCT.inherit(ClipTool, ToolMode) + `
}`;
nstructjs.manager.add_class(ClipTool);

ToolMode.register(ClipTool);
