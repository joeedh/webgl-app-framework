import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

import {Area} from '../path.ux/scripts/ScreenArea.js';
import {Screen} from '../path.ux/scripts/FrameManager.js';
import {UIBase} from '../path.ux/scripts/ui_base.js';

export class Editor extends Area {
  static register(cls) {
    Area.register(cls);
  }
  
  static fromSTRUCT(reader) {
    let ret = document.createElement(this.define().tagname);
    reader(ret);
    return ret;
  }
};
Editor.STRUCT = STRUCT.inherit(Editor, Area) + `
}
`;
nstructjs.manager.add_class(Editor);

export class App extends Screen {
  static define() {return {
    tagname : "webgl-app-x"
  }}
  
  static fromSTRUCT(reader) {
    return super.fromSTRUCT(reader);
  }
};

App.STRUCT = STRUCT.inherit(App, Screen) + `
}`;
UIBase.register(App);
nstructjs.manager.add_class(App);
