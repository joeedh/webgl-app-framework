import {Vector2, Vector3} from '../../util/vectormath.js';
import {KeyMap, HotKey} from "../editor_base.js";
import {SimpleMesh} from "../../core/simplemesh.js";

export class MeshCache {
  constructor(meshid) {
    this.meshid = meshid;
    this.meshes = {};

    this.gen = undefined; //current generation, we know mesh has changed when mesh.updateGen is not this
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

  destroy(gl) {
    for (let k in this.meshes) {
      this.meshes[k].destroy(gl);
    }

    this.meshes = {};
  }
}

//each subeditor should fill in these tools
export const StandardTools = {
  SELECTONE         : undefined,
  TOGGLE_SELECT_ALL : undefined,
  CIRCLE_SELECT     : undefined,
  BOX_SELECT        : undefined,
  SELECT_LINKED     : undefined,
  DELETE            : undefined,
  DUPLICATE         : undefined
};

export let SubEditors = [];

export class FindnearestRet {
  constructor() {
    this.data = undefined;
    this.object = undefined;
    this.p2d = new Vector2();
    this.p3d = new Vector3();
    this.dis = undefined;
  }
}

export class View3D_SubEditorIF {
    constructor(view3d) {
      this.view3d = view3d;
      this.keymap = new KeyMap();
    }

    static register(cls) {
      SubEditors.push(cls);
    }

    static define() {return {
      apiname  : "unnamed",
      uiname   : "unnamed",
      icon     : -1,
      selmask  : undefined,
      stdtools : undefined //see StandardTools
    }}

    destroy() {
    }

    findnearest(ctx, x, y) {

    }

    clickselect(e, x, y, selmask, was_touch) {
      throw new Error("implement me");
    }
    
    on_mousedown(x, y, was_touch) {
    }

    on_mousemove(x, y, was_touch) {
    }

    on_mouseup(x, y, was_touch) {
    }

    on_drawstart(gl) {

    }
    on_drawend(gl) {

    }

    /*
    * called for all objects;  returns true
    * if an object is valid for this editor (and was drawn)*/
    draw(gl, uniforms, program, object, mesh) {
      return false;
    }

    /*
    * called for all objects;  returns true
    * if an object is valid for this editor (and was drawn)
    *
    * id_offset offsets the ids
    * */
    drawIDs(gl, uniforms, program, object, mesh, id_offset) {
      return false;
    }
}
