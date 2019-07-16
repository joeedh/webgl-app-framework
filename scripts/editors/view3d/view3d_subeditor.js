import {Vector2, Vector3} from '../../util/vectormath.js';

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

    findnearest(ctx, x, y) {

    }

    clickselect(e, x, y, selmask) {
      throw new Error("implement me");
    }
    
    on_mousemove(x, y) {
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
