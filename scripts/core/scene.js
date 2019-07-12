import {DataBlock, DataRef} from './lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Graph} from './graph.js';

export const SceneFlags = {
  SELECT : 1
};

export class Scene extends DataBlock {
  constructor(objects) {
    super();
    
    this.objects = [];
    this.objects.active = undefined;
    this.flag = 0;
    
    this.time = 0.0;
    this.graph = new Graph();
    
    if (objects !== undefined) {
      for (let ob of objects) {
        this.add(ob);
      }
    }
  }
  
  add(ob) {
    this.objects.push(ob);
    ob.lib_addUser();
  }
  
  remove(ob) {
    if (ob === undefined || this.objects.indexOf(ob) < 0) {
      console.log("object not in scene", ob);
      return;
    }
    
    ob.lib_remUser(ob);
    this.objects.remove(ob);
  }
  
  destroy() {
    for (let ob of this.objects) {
      ob.lib_remUser();
    }
  }
  
  static blockDefine() { return {
    typeName    : "scene",
    defaultName : "Scene",
    uiName   : "Scene",
    flag     : 0,
    icon     : -1
  }}
  
  static fromSTRUCT(reader) {
    let ret = new Scene();
    
    reader(ret);
    
    return ret;
  }
  
  dataLink(getblock, getblock_us) {
    for (let i=0; i<this.objects.length; i++) {
      this.objects[i] = getblock_us(this.objects[i]);
      if (this.objects[i].lib_id == this.active) {
        this.objects.active = this.objects[i];
      }
    }
    
    delete this.active;
  }
}
DataBlock.register(Scene);
Scene.STRUCT = STRUCT.inherit(Scene, DataBlock) + `
  flag      : int;
  objects   : array(e, DataRef) | new DataRef(e);
  active    : int | obj.active !== undefined ? obj.active.lib_id : -1;
  time      : float;
}
`;
