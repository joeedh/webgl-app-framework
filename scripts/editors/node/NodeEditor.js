import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor} from '../editor_base.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class NodeEditor extends Editor {
  constructor() {
    super();
    
    this.activeTree = ""; //is a data path
  }
  
  init() {
    super.init();
    
    let header = this.header;
    
    header.prop("NodeEditor.selectmode");
  }

  copy() {
    let ret = document.createElement("node-editor-x");
    
    ret.camera = this.camera.copy();
    ret.selectmode = this.selectmode;
    ret.drawmode = this.drawmode;
    
    return ret;
  }
  
  static define() {return {
    tagname : "node-editor-x",
    areaname : "NodeEditor",
    uiname   : "Node Editor",
    icon     : -1
  }}
};
NodeEditor.STRUCT = STRUCT.inherit(NodeEditor, Editor) + `
  activeTree : string;
}
`
Editor.register(NodeEditor);
nstructjs.manager.add_class(NodeEditor);
