/*

UPDATE:
To avoid violating model-view-controller design, toolmode and widgets will
have to be moved to Scene.  That means all 3D viewports will have the same
widgets.

Toolmode refactor.

The old subeditor system is going to be replaced
with a more flexible toolmode system.

Logically tool modes handle events and selection.  They
inherit from WidgetTool to have a unified event system
for widgets/toolmodes.

TODO:
* DONE: Move toolmodes to Scene class.
  - Note this means toolmodes will now be shared across View3D instances.
* DONE: Refactor findnearest (screen picking) into its own module
* PARTIALLY DONE: Bundle some standard tools into StandardTools class
 - With appropriate changes to keymap definitions.
*  Move pick functionality (findnearest) to static methods in SceneObjectData.
* DONE Tools modes (editors) should inherent from WidgetTool
  - Note: not all widget tools must be tool modes
*/

import {Vector2, Vector3} from '../../util/vectormath.js';
import {KeyMap, HotKey} from "../editor_base.js";
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from "../../core/simplemesh.js";
import {WidgetTool, WidgetFlags, WidgetTools} from "./widgets.js";
import {EnumProperty, FlagProperty} from "../../path.ux/scripts/toolsys/toolprop.js";
import {Icons} from '../icon_enum.js';
import {SelMask} from "./selectmode.js";
import '../../path.ux/scripts/util/struct.js';
import {TranslateWidget, WidgetSceneCursor} from "./widget_tools.js";

import '../../core/textsprite.js';

let STRUCT = nstructjs.STRUCT;

export class ToolMode extends WidgetTool {
  constructor(manager) {
    super(manager);

    this.ctx = manager !== undefined ? manager.ctx : undefined;
    this.flag |= WidgetFlags.ALL_EVENTS;

    this.widgettool = undefined; //integer, index into WidgetTools list
    this.widgets = [];
    this._uniqueWidgets = {};

    this._transProp = this.constructor.getTransformProp();

    this.keymap = new KeyMap();
    this.defineKeyMap();
  }

  get typeName() {
    return this.constructor.widgetDefine().name;
  }

  getKeyMaps() {
    return [this.keymap];
  }

  defineKeyMap() {
    this.keymap = new KeyMap([]);
  }


  //returns a bounding box [min, max]
  //if toolmode has a preferred aabb to
  //zoom out on, otherwise returns undefined;
  getViewCenter() {
    return undefined;
  }

  static buildElementSettings(container) {

  }

  static buildSettings(container) {

  }

  dataLink(scene, getblock, getblock_addUser) {

  }

  static buildHeader (header, addHeaderRow) {

  }

  static getContextOverlayClass() {
    return undefined;
  }

  static register(cls) {
    ToolModes.push(cls);
    WidgetTool.register(cls);
  }

  static getTransformProp() {
    let classes = this.widgetDefine().transWidgets;
    classes = classes === undefined ? [] : classes;

    return WidgetTool.getToolEnum(classes, FlagProperty, true);
  }

  static defineAPI(api) {
    let cls = this;

    let tstruct = api.mapStruct(cls, true);
    tstruct.name = this.name !== undefined ? this.name : this.widgetDefine().name;

    tstruct.string("typeName", "type", "Type", "Tool Mode Type");

    let prop = this.getTransformProp();
    if (prop !== undefined) {
      tstruct.enum("transformWidget", "transformWidget", prop, "Transform Widget", "Current transformation widget");
    }

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
      transWidgets: [], //list of widget classes tied to this.transformWidget
    }
  }

  /**
   * Checks if widgettool has changed, and, if widget is supported by this toolmode,
   * spawns new widget accordingly.
   * @param widgettool : integer, index in WidgetTools list
   */
  ensureUniqueWidget(widgetclass) {
    if (this.ctx === undefined)
      return;

    let ctx = this.ctx;
    let view3d = this.ctx.view3d;
    let manager = this.ctx.scene.widgets;

    let valid = widgetclass.validate(this.ctx);
    let def = widgetclass.widgetDefine();

    if (!valid && def.name in this._uniqueWidgets) {
      this.removeUniqueWidget(this.getUniqueWidget(widgetclass));
      window.redraw_viewport();

      return;
    } else if (valid && !(def.name in this._uniqueWidgets)) {
      console.log("adding new widget", def.name);

      let widget = new widgetclass(manager);
      manager.add(widget);

      if (widget instanceof WidgetTool) {
        //stupid, WidgetTools have this create() method,
        //need to finish refactoring WidgetTool to be proper
        //subclass of WidgetBase
        widget.create(this.ctx, manager);
      }

      this.widgets.push(widget);
      this._uniqueWidgets[def.name] = widget;

      if (def.selectMode !== undefined && this.scene.selectMask !== def.selectMode) {
        this.scene.selectMask = def.selectMode;
      }

      window.redraw_viewport();
    }
  }

  addWidget(widget) {
    this.widgets.push(widget);
    this.ctx.scene.widgets.add(widget);
  }

  removeWidget(widget) {
    for (let k in this._uniqueWidgets) {
      if (this._uniqueWidgets[k] === widget) {
        delete thie._uniqueWidgets[k];
      }
    }

    this.widgets.remove(widget);
    this.ctx.scene.widgets.remove(widget);
  }

  hasUniqueWidget(cls) {
    return this.getUniqueWidget(cls) !== undefined;
  }

  getUniqueWidget(cls) {
    let def = cls.widgetDefine();
    return this._uniqueWidgets[def.name];
  }

  removeUniqueWidget(widget) {
    let def = widget.constructor.widgetDefine();

    if (this.widgets.indexOf(widget) >= 0) {
      this.widgets.remove(widget);
    }

    delete this._uniqueWidgets[def.name];
    widget.remove();
  }

  updateTransWidgets() {
    let prop = this._transProp;
    let mask = this.transformWidget;

    for (let key in prop.values) {
      let bit = prop.values[key];
      let toolcls = WidgetTool.getTool(key);

      if (mask & bit) {
        this.ensureUniqueWidget(toolcls);
      } else if (this.hasUniqueWidget(toolcls)) {
        this.removeUniqueWidget(this.getUniqueWidget(toolcls));
        window.redraw_viewport();
      }
    }
  }

  update() {
    super.update();

    if (!this.ctx) {
      return;
    }

    let cls = this.constructor.getContextOverlayClass();
    if (cls !== undefined && !this.ctx.hasOverlay(cls)) {
      this.ctx.pushOverlay(new cls(this.ctx.state, this));
    }

    this.updateTransWidgets();

    /*
    for (let widget of this.widgets) {
      widget.update(this.ctx.scene.widgets);
    }
    //*/
  }

  onActive() {

  }

  clearWidgets() {
    if (!this.ctx || !this.ctx.scene) {
      return;
    }

    let manager = this.ctx.scene.widgets;

    for (let widget of this.widgets) {
      manager.remove(widget);
    }

    this._uniqueWidgets = {};
    this.widgets = [];

  }

  onInactive() {
    let cls = this.constructor.getContextOverlayClass();

    if (this.ctx && cls && this.ctx.hasOverlay(cls)) {
      this.ctx.removeOverlay(this.ctx.getOverlay(cls));
    }

    this.clearWidgets();
  }

  destroy() {
    this.clearWidgets();
  }

  onContextLost(e) {
    return super.onContextLost(e);
  }

  on_mousedown(e, x, y, was_touch) {
  }

  on_mousemove(e, x, y, was_touch) {
  }

  on_mouseup(e, x, y, was_touch) {
  }

  on_drawstart(view3d, gl) {

  }

  on_drawend(view3d, gl) {

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

  /**
   * draw any extra ids the toolmode needs
   * */
  drawIDs(view3d, gl, uniforms) {
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

ToolMode.STRUCT = `
ToolMode {
  transformWidget : int;
}
`;
nstructjs.manager.add_class(ToolMode);

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
