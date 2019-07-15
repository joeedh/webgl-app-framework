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

  clickselect(x, y) {
    throw new Error("implement me");
  }

  on_mousemove(x, y) {
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this editor (and was drawn)*/
  draw(gl, uniforms, object, mesh) {
    return false;
  }


  /*
  * called for all objects;  returns true
  * if an object is valid for this editor (and was drawn)*/
  drawIDs(gl, uniforms, object, mesh) {
    return false;
  }
}
