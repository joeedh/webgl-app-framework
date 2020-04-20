import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class MeasureTool extends ToolMode {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;

    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }

  static register(cls) {
    ToolModes.push(cls);
    WidgetTool.register(cls);
  }

  static widgetDefine() {return {
    name        : "pan",
    uiname      : "Pan",
    icon        : Icons.PAN,
    flag        : 0,
    description : "Pan",
    selectMode  : SelMask.OBJECT|SelMask.GEOM, //if set, preferred selectmode, see SelModes
  }}

  onActive() {

  }

  onInactive() {

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

MeasureTool.STRUCT = STRUCT.inherit(MeasureTool, ToolMode) + `
}`;
nstructjs.manager.add_class(MeasureTool);

ToolMode.register(MeasureTool);
