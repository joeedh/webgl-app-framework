import '../path.ux/scripts/struct.js';
import {IDGen} from '../util/util.js';
import {Node} from './graph.js';

let STRUCT = nstructjs.STRUCT;

export let BlockTypes = [];

export class DataBlock extends Node {
  constructor() {
    super();
    
    let def = this.constructor.blockDefine();
    
    this.lib_id = -1;
    this.name = def.defaultName;
    this.lib_flag = def.flag;
    this.lib_icon = def.icon;
    this.lib_type = def.type;
    this.lib_users= 0;
    this.lib_external_ref = undefined; //presently unused
  }
  
  [Symbol.keystr]() {
    return this.lib_id;
  }
  
  destroy() {
  }
  
  static blockDefine() { return {
    typeName    : "typename",
    defaultName : "unnamed",
    uiName   : "uiname",
    flag     : 0,
    icon     : -1
  }}
  
  //getblock_us gets a block and adds reference count to it
  dataLink(getblock, getblock_us) {
    
  }
  
  lib_addUser(user) {
    this.lib_users++;
  }
  
  lib_remUser(user) {
    this.lib_users--;
  }
  
  static fromSTRUCT(reader) {
    let ret = new this();
    reader(ret);
    return ret;
  }
  
  static register(cls) {
    BlockTypes.push(cls);
  }
  
  static getClass(typeName) {
    for (let type of BlockTypes) {
      if (type.blockDefine().typeName == typeName)
        return type;
    }
  }
}
DataBlock.STRUCT = STRUCT.inherit(DataBlock, Node) + `
  lib_id    : int;
  lib_flag  : int;
  lib_users : int;
  name      : string;
}
`
nstructjs.manager.add_class(DataBlock);

export class DataRef {
  constructor(block) {
    this.lib_type = undefined;
    this.lib_id = undefined;
    this.lib_name = undefined;
    this.lib_external_ref = undefined;
  }
  
  static fromBlock(block) {
    let ret = new DataRef();
    
    ret.lib_type = block.blockDefine().typeName;
    ret.lib_id = block.lib_id;
    ret.lib_name = block.name;
    ret.lib_external_ref = block.lib_external_ref;
    
    return ret;
  }
  
  static fromSTRUCT(reader) {
    let ret = new DataRef();
    reader(ret);
    return ret;
  }
}
DataRef.STRUCT = `
DataRef {
  lib_id    : int;
  lib_name : string;
  lib_type : string;
}
`;
nstructjs.manager.add_class(DataRef);

export class BlockSet extends Array {
  constructor(type, datalib) {
    super();
    
    this.datalib = datalib;
    this.type = type;
    this.active = undefined;
    this.idmap = {};
    this.namemap = {};
  }
  
  add(block) {
    return this.push(block);
  }
  
  push(block) {
    if (block.lib_id >= 0 && (block.id in this.idmap)) {
      console.warn("Block already in dataset");
      return;
    }
    
    super.push(block);
    
    if (block.lib_id == -1) {
      block.lib_id = this.datalib.idgen.next();
    }
    this.datalib.block_idmap[block.lib_id] = block;
    
    this.idmap[block.lib_id] = block;
    this.namemap[block.name] = block;
  }
  
  remove(block) {
    let bad = block === undefined || !(block instanceof DataBlock) || block.lib_id === undefined;
    bad = bad || !(block.lib_id in this.idmap);
    
    if (bad) {
      console.warn("Bad call to lib_api.BlockSet.prototype.remove(); block:", block);
      return;
    }
    
    delete this.idmap[block.lib_id];
    if (block.name in this.namemap) {
      delete this.namemap[block.name];
    }
    
    delete this.datalib.block_idmap[block.lib_id];
    block.lib_id = -1;
    
    if (block === this.active) {
      this.active = undefined;
    }
    
    super.remove(block);
  }
  
  destroy() {
    for (let block of this.blocks) {
      blockk.destroy();
    }
  }
  
  dataLink(getblock, getblock_us) {
    if (ret.active != -1) {
      ret.active = ret.idmap[ret.active];
    }
    
    return this;
  }
  
  static fromSTRUCT(reader) {
    let ret = new BlockSet();
    
    reader(ret);
    //blocks are saved/loaded seperately
    //to allow loading them individually
  }
  
  afterLoad(datalib, type) {
    this.type = type;
    this.datalib = datalib;
  }
}

//note that blocks are saved/loaded seperately
//to allow loading them individually
BlockSet.STRUCT = `
BlockSet {
  type   : string | obj.type.blockDefine().typeName;
  active : int | obj.active !== undefined ? obj.active.lib_id : -1;
}
`;
nstructjs.manager.add_class(BlockSet);

export class Library {
  constructor() {
    this.libs = [];
    this.libmap = {};
    this.idgen = new IDGen();
    this.block_idmap = {};
    
    for (let cls of BlockTypes) {
      let lib = new BlockSet(cls, this);
      
      this.libs.push(lib);
      this.libmap[cls.blockDefine().typeName] =  lib;
    }
  }
  
  get(id_or_dataref) {
    if (id_or_dataref instanceof DataRef) {
      id_or_dataref = id_or_dataref.lib_id;
    }
    
    return this.block_idmap[id_or_dataref];
  }
  
  add(block) {
    return this.getLibrary(block.constructor.blockDefine().typeName).add(block);
  }
  
  remove(block) {
    return this.getLibrary(block.constructor.blockDefine().typeName).remove(block);
  }
  
  getLibrary(typeName) {
    return this.libmap[typeName];
  }
  
  static fromSTRUCT(reader) {
    let ret = new Library();
    
    reader(ret);
    
    for (let lib of this.libs.slice(0, this.libs.length)) {
      let type = undefined;
      
      for (let cls of BlockTypes) {
        if (cls.blockDefine().typeName == lib.type) {
          type = cls;
        }
      }
      
      if (type === undefined) {
        console.warn("Failed to load library type", lib.type);
        
        this.libs.remove(lib);
        continue;
      }
      
      lib.afterLoad(this, type);
    }
    
    return ret;
  }
}

Library.STRUCT = `
Library {
  libs  : array(BlockSet);
  idgen : IDGen;
}
`;
nstructjs.manager.add_class(Library);
