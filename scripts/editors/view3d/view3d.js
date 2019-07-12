import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor} from '../editor_base.js';
import {Camera} from '../../core/webgl.js';
import {SelMask} from './selectmode.js';
import '../../path.ux/scripts/struct.js';
import {DrawModes} from './drawmode.js';
let STRUCT = nstructjs.STRUCT;

export class View3D extends Editor {
  constructor() {
    super();
    
    this.camera = new Camera();
    this.selectmode = SelMask.OBJECT|SelMask.VERTEX;
    this.drawmode = DrawModes.TEXTURED;
  }
  
  init() {
  }

  copy() {
    let ret = document.createElement("view3d-editor-x");
    
    ret.camera = this.camera.copy();
    ret.selectmode = this.selectmode;
    ret.drawmode = this.drawmode;
    
    return ret;
  }
  
  static define() {return {
    tagname : "view3d-editor-x",
    areaname : "view3d",
    uiname   : "Viewport",
    icon     : -1
  }}
};
View3D.STRUCT = STRUCT.inherit(View3D, Editor) + `
  camera      : Camera;
  selectmode  : int;
  drawmode    : int;
}
`
Editor.register(View3D);
nstructjs.manager.add_class(View3D);
