
import {Vector2, Vector3} from '../../util/vectormath.js';
import {KeyMap, HotKey} from "../editor_base.js";
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from "../../core/simplemesh.js";
import {WidgetFlags} from "./widgets/widgets.js";
import {EnumProperty, FlagProperty} from "../../path.ux/scripts/toolsys/toolprop.js";
import {Icons} from '../icon_enum.js';
import {SelMask} from "./selectmode.js";
import '../../path.ux/scripts/util/struct.js';
import {TranslateWidget, WidgetSceneCursor} from "./widgets/widget_tools.js";
import {Node, NodeFlags} from '../../core/graph.js';

import '../../core/textsprite.js';

let STRUCT = nstructjs.STRUCT;

export class ToolMode extends Node {
  constructor(ctx) {
    super();

    this.ctx = ctx;
    this.flag |= WidgetFlags.ALL_EVENTS;

    this.drawlines = [];
    this.drawtexts = [];

    this.widgets = [];
    this._uniqueWidgets = {};
    this.transWidget = undefined;

    this.selectMask = this.constructor.toolModeDefine().selectMode;
    this._transProp = this.constructor.getTransformProp();

    this.storedSelectMask = -1; //used by scene

    this.keymap = new KeyMap();
    this.defineKeyMap();
  }

  drawsObjectIdsExclusively(ob) {
    return false;
  }

  setManager(widget_manager) {
    this.manager = widget_manager;
  }

  /** easy line drawing (in 3d)*/
  makeTempLine(v1, v2, color) {
    let dl = this.ctx.view3d.makeTempLine(v1, v2, color);
    this.drawlines.push(dl);
    return dl;
  }

  makeTempText(co, string, color) {
    let dt = this.ctx.view3d.makeTempText(co, string, color);
    this.drawtexts.push(dt);
    return dt;
  }

  resetTempGeom(ctx=this.ctx) {
    for (let dl of this.drawlines) {
      ctx.view3d.removeTempLine(dl);
    }
    for (let dt of this.drawtexts) {
      ctx.view3d.removeTempText(dt);
    }

    this.drawlines.length = 0;
  }

  static toolModeDefine() {
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

  static nodedef() {return {
    name    : "tool",
    uiname  : "tool",
    inputs  : {},
    outputs : {}
  }}


  get typeName() {
    return this.constructor.toolModeDefine().name;
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

  static buildEditMenu() {
    return [];
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
    if (cls.toolModeDefine === this.toolModeDefine) {
      throw new Error("cls is missing its toolModeDefine");
    }
    ToolModes.push(cls);
  }

  static getTransformProp() {
    let classes = this.toolModeDefine().transWidgets;
    classes = classes === undefined ? [] : classes;

    let enumdef = {};
    let uinames = {};
    let icons = {};
    let descr = {};

    enumdef.NONE = 0;
    icons.NONE = -1;
    uinames.NONE = "disable"
    descr.NONE = "Hide transform widgets"

    let i = 1;

    for (let cls of classes) {
      let def = cls.widgetDefine();

      let k = def.name || cls.name;

      enumdef[k] = i++;
      uinames[k] = def.uiname ? def.uiname : k;
      descr[k] = def.description ? def.description : uinames[k];
      icons[k] = def.icon ? def.icon : -1;
    }

    let prop = new EnumProperty(undefined, enumdef);
    prop.addIcons(icons);
    prop.addUINames(uinames);
    prop.addDescriptions(descr);

    return prop;
    //return WidgetTool.getToolEnum(classes, FlagProperty, true);
  }

  static defineAPI(api) {
    let cls = this;

    let tstruct = api.mapStruct(cls, true);
    tstruct.name = this.name !== undefined ? this.name : this.toolModeDefine().name;

    tstruct.string("typeName", "type", "Type", "Tool Mode Type");

    let prop = this.getTransformProp();
    if (prop !== undefined) {
      tstruct.enum("transformWidget", "transformWidget", prop, "Transform Widget", "Current transformation widget");
    }

    return tstruct;
  }

  addWidget(widget) {
    this.ctx.scene.widgets.add(widget);
    this.widgets.push(widget);
  }

  removeWidget(widget) {
    this.ctx.scene.widgets.remove(widget);
    this.widgets.remove(widget);
  }

  hasWidgetWithKey(key) {
    return this.getWidgetWithKey(key) !== undefined;
  }

  getWidgetWithKey(key) {
    let widget = this.ctx.scene.widgets.getWidgetWithKey(key);

    if (widget && !widget.isDead && this.widgets.indexOf(widget) >= 0) {
      return widget;
    }

    return undefined;
  }

  /**
   * Spawn a unique widget
   * @param widgetclass : widget class
   */
  ensureUniqueWidget(widgetclass) {
    if (this.ctx === undefined)
      return;

    let ctx = this.ctx;
    let view3d = this.ctx.view3d;
    let manager = this.ctx.scene.widgets;

    let valid = widgetclass.validate(this.ctx);
    let def = widgetclass.widgetDefine();

    if (def.name in this._uniqueWidgets && this._uniqueWidgets[def.name].isDead) {
      this.removeUniqueWidget(this.getUniqueWidget(widgetclass));
    }

    if (!valid && def.name in this._uniqueWidgets) {
      this.removeUniqueWidget(this.getUniqueWidget(widgetclass));
      window.redraw_viewport();

      return;
    } else if (valid && !(def.name in this._uniqueWidgets)) {
      console.log("adding new widget", def.name);

      let widget = new widgetclass(manager);
      manager.add(widget);

      this.widgets.push(widget);
      this._uniqueWidgets[def.name] = widget;

      if (def.selectMode !== undefined && this.scene.selectMask !== def.selectMode) {
        this.scene.selectMask = def.selectMode;
      }

      window.redraw_viewport();
      return widget;
    } else {
      return this._uniqueWidgets[def.name];
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

  getWidgetHighlight() {
    return this.ctx.scene.widgets.widgets.highlight;
  }

  hasWidgetHighlight() {
    return this.getWidgetHighlight() !== undefined;
  }

  update() {
    if (!this.ctx) {
      return;
    }

    let cls = this.constructor.getContextOverlayClass();
    if (cls !== undefined && !this.ctx.hasOverlay(cls)) {
      this.ctx.pushOverlay(new cls(this.ctx.state, this));
    }

    let del = [];

    for (let widget of this.widgets) {
      if (widget.isDead) {
        del.push(widget);
      }
    }

    for (let widget of del) {
      this.widgets.remove(widget);
    }

    let tws = this.constructor.toolModeDefine().transWidgets || [];
    let tcls, ti = this.transformWidget-1;


    if (ti >= 0 && ti < tws.length) {
      tcls = tws[ti];
    }

    if (this.transWidget && tcls !== this.transWidget.constructor) {
      console.log("removign transform widget");
      this.removeUniqueWidget(this.transWidget);
      this.transWidget = undefined;
    }


    if (!this.transWidget && tcls) {
      this.transWidget = this.ensureUniqueWidget(tcls);
      console.log("making transform widget", tcls.name, this.transformWidget, this.transWidget);
    }

    /*
    for (let widget of this.widgets) {
      widget.update(this.ctx.scene.widgets);
    }
    //*/
  }

  onActive() {

  }

  clearWidgets(gl) {
    if (!this.ctx || !this.ctx.scene) {
      return;
    }

    let manager = this.ctx.scene.widgets;

    for (let widget of this.widgets) {
      manager.remove(widget);
    }

    this.transWidget = undefined;

    this._uniqueWidgets = {};
    this.widgets = [];
  }

  onInactive() {
    let cls = this.constructor.getContextOverlayClass();

    if (this.ctx && cls && this.ctx.hasOverlay(cls)) {
      this.ctx.removeOverlay(this.ctx.getOverlay(cls));
    }

    this.clearWidgets();

    if (this.ctx) {
      this.resetTempGeom();
    }
  }

  graphDisconnect() {
    for (let sock of this.allsockets) {
      sock.disconnect();
    }
  }

  destroy(gl) {
    this.clearWidgets(gl);
    this.graphDisconnect();
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

  draw(view3d, gl) {

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

  drawsObjectIds(obj) {
    return false;
  }

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

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

ToolMode.STRUCT = `
ToolMode {
  transformWidget  : int;
  storedSelectMask : int;
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

ToolMode.dataPath = "scene.tool";

export let ToolModes = [];

export function makeToolModeEnum() {
  let map = {};
  let icons = {};
  let descr = {};
  let uinames = {};
  let i = 0;

  for (let cls of ToolModes) {
    let def = cls.toolModeDefine();

    let key = def.name || cls.name;

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

window._ToolModes = ToolModes;
window._makeToolModeEnum = makeToolModeEnum;