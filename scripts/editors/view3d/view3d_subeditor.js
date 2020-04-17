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
import {WidgetTool, WidgetFlags} from "./widgets.js";
import {EnumProperty} from "../../path.ux/scripts/toolprop.js";
import {Icons} from '../icon_enum.js';
import {SelMask} from "./selectmode.js";
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

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

export class View3D_ToolMode extends WidgetTool {
    constructor(manager) {
      super(manager);

      this.flag |= WidgetFlags.ALL_EVENTS;

      this.view3d = manager !== undefined ? manager.view3d : undefined;
      this.keymap = new KeyMap();
    }

    getKeyMaps() {
      return [this.keymap];
    }

    static register(cls) {
      ToolModes.push(cls);
      WidgetTool.register(cls);
    }

    static widgetDefine() {return {
      name        : "name",
      uiname      : "uiname",
      icon        : -1,
      flag        : 0,
      description : "",
      selectMode  : undefined, //if set, preferred selectmode, see SelModes
      stdtools    : undefined, //if set, will override standard tools in inherited keymaps
    }}


    onActive() {

    }

    onInactive() {

    }

    destroy() {
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
