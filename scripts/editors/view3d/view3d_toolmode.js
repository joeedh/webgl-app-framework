/*

Toolmode refactor.

The old subeditor system is going to be replaced
with a more flexible toolmode system.

Logically tool modes handle events and selection.  They
inherit from WidgetTool to have a unified event system
for widgets/toolmodes.

TODO:
* DONE: Refactor findnearest (screen picking) into its own module
* PARTIALLY DONE: Bundle some standard tools into StandardTools class
 - With appropriate changes to keymap definitions.
*  Move pick functionality (findnearest) to static methods in SceneObjectData.
* Tools modes (editors) should inherent from WidgetTool
  - Note: not all widget tools must be tool modes
*/

import {Vector2, Vector3} from '../../util/vectormath.js';
import {KeyMap, HotKey} from "../editor_base.js";
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from "../../core/simplemesh.js";
import {WidgetTool, WidgetFlags, WidgetTools} from "./widgets.js";
import {EnumProperty} from "../../path.ux/scripts/toolprop.js";
import {Icons} from '../icon_enum.js';
import {SelMask} from "./selectmode.js";
import '../../path.ux/scripts/struct.js';
import {WidgetSceneCursor} from "./widget_tools.js";

let STRUCT = nstructjs.STRUCT;

export class View3D_ToolMode extends WidgetTool {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;
    this.widgettool = undefined; //integer, index into WidgetTools list
    this._widget = undefined;

    this.view3d = manager !== undefined ? manager.view3d : undefined;
    this.keymap = new KeyMap();
  }

  get typeName() {
    return this.constructor.widgetDefine().name;
  }

  getKeyMaps() {
    return [this.keymap];
  }

  buildHeader (header, addHeaderRow) {

  }

  static register(cls) {
    ToolModes.push(cls);
    WidgetTool.register(cls);
  }

  static defineAPI(api) {
    let cls = this;

    let tstruct = api.mapStruct(cls, true);
    tstruct.string("typeName", "type", "Type", "Tool Mode Type");

    return tstruct;
  }

  static widgetDefine() {
    return {
      name: "name",
      uiname: "uiname",
      icon: -1,
      flag: 0,
      description: "",
      selectMode: undefined, //if set, preferred selectmode, see SelModes
      stdtools: undefined, //if set, will override standard tools in inherited keymaps
    }
  }

  /**
   * Checks if widgettool has changed, and, if widget is supported by this toolmode,
   * spawns new widget accordingly.
   * @param widgettool : integer, index in WidgetTools list
   */
  updateWidgetTool(view3d, widgettool) {
    this.ctx = view3d.ctx;
    this.view3d = view3d;

    let manager = view3d.widgets;

    if (this.ctx === undefined)
      return;

    let tool = WidgetTools[widgettool];
    if (tool === undefined) {
      return;
    }

    let valid = tool.validate(this.ctx);

    if (this._widget !== undefined) {
      let bad = !(this._widget instanceof tool) || (this._widget.manager !== manager);
      bad = bad || !valid;

      if (bad) {
        this._widget.remove();
        this._widget = undefined;
      }
    }

    if (this._widget === undefined && valid) {
      this._widget = new tool(manager);

      console.log("making widget instance", this._widget);

      this._widget.create(this.ctx, manager);

      let def = this._widget.constructor.widgetDefine();

      if (def.selectMode !== undefined && this.selectmode != def.selectMode) {
        this.selectmode = def.selectMode;
        window.redraw_viewport();
      }

      this.widgettool = widgettool;
    } else if (tool && this._widget === undefined) {
      let def = tool.widgetDefine();

      if (def.selectMode !== undefined && this.selectmode != def.selectMode) {
        this.selectmode = def.selectMode;
        window.redraw_viewport();
      }
    }


    if (this._widget !== undefined) {
      this._widget.update();
    }
  }

  onActive() {

  }

  onInactive() {
    if (this._widget) {
      this._widget.remove();
      this._widget = undefined;
      this.widgettool = undefined;
    }
  }

  destroy() {
    if (this._widget) {
      this._widget.remove();
      this._widget = undefined;
      this.widgettool = undefined;
    }
  }

  on_mousedown(e, x, y, was_touch) {
  }

  on_mousemove(e, x, y, was_touch) {
  }

  on_mouseup(e, x, y, was_touch) {
  }

  on_drawstart(gl) {

  }

  on_drawend(gl) {

  }

  /*
get view3d() {
  return this._view3d;
}

set view3d(val) {
  console.warn("view3d set", val !== undefined ? val.constructor.name : undefined);
  this._view3d = val;
}
//*/

  /*
  * called for all objects;  returns true
  * if an object if the toolmode drew the object
  * itself
  */
  drawObject(gl, uniforms, program, object, mesh) {
    return false;
  }
}

View3D_ToolMode.STRUCT = `
View3D_ToolMode {
  
}
`;
nstructjs.manager.add_class(View3D_ToolMode);

export class MeshCache {
  constructor(meshid) {
    this.meshid = meshid;
    this.meshes = {};
    this.drawer = undefined;

    this.gen = undefined; //current generation, we know mesh has changed when mesh.updateGen is not this
  }

  getMesh(name) {
    return this.meshes[name];
  }

  makeMesh(name, layers) {
    if (layers === undefined) {
      throw new Error("layers cannot be undefined");
    }

    if (!(name in this.meshes)) {
      this.meshes[name] = new SimpleMesh(layers);
    }

    return this.meshes[name];
  }

  makeChunkedMesh(name, layers) {
    if (layers === undefined) {
      throw new Error("layers cannot be undefined");
    }

    if (!(name in this.meshes)) {
      this.meshes[name] = new ChunkedSimpleMesh(layers);
    }

    return this.meshes[name];
  }

  destroy(gl) {
    this.drawer.destroy(gl);

    for (let k in this.meshes) {
      this.meshes[k].destroy(gl);
    }

    this.meshes = {};
  }
}

export let ToolModes = [];

export function makeToolModeEnum() {
  let map = {};
  let icons = {};
  let descr = {};
  let uinames = {};
  let i = 0;

  for (let cls of ToolModes) {
    let def = cls.widgetDefine();

    let key = def.name;

    map[key] = i;
    icons[key] = def.icon !== undefined ? def.icon : -1;
    descr[key] = "" + def.description;
    uinames[key] = "" + def.uiname;

    i++;
  }

  let prop = new EnumProperty(undefined, map, "toolmode", "Tool Mode", "Active tool mode");

  prop.addIcons(icons);
  prop.addDescriptions(descr);
  prop.addUINames(uinames);

  return prop;
}
