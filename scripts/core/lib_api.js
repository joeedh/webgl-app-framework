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
    if (block !== undefined) {
      throw new Error("use DataRef.fromBlock (or get rid that idea altogether");
    }

    this.lib_type = undefined;
    this.lib_id = undefined;
    this.lib_name = undefined;
    this.lib_external_ref = undefined;
  }
  
  static fromBlock(block) {
    let ret = new DataRef();

    if (block === undefined) {
      ret.lib_id = -1;
      return ret;
    }

    ret.lib_type = block.constructor.blockDefine().typeName;
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

//this has to be in global namespace for struct scripts to work
window.DataRef = DataRef;

export class BlockSet extends Array {
  constructor(type, datalib) {
    super();
    
    this.datalib = datalib;
    this.type = type;
    this.__active = undefined;
    this.idmap = {};
    this.namemap = {};
  }

  get active() {
    return this.__active;
  }

  set active(val) {
    this.__active = val;
    console.trace("active set", this);
  }

  add(block) {
    return this.push(block);
  }
  
  push(block) {
    if (block.lib_id >= 0 && (block.lib_id in this.idmap)) {
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
    for (let block of this) {
      block.destroy();
    }
  }
  
  dataLink(getblock, getblock_us) {
    console.warn("Linking. . .", this.active, this.idmap);

    if (this.active != -1) {
      this.active = this.idmap[this.active];
    }

    for (let block of this) {
      block.dataLink(getblock, getblock_us);
    }
    
    return this;
  }
  
  static fromSTRUCT(reader) {
    let ret = new BlockSet();
    
    reader(ret);

    return ret;
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
    let typename = block.constructor.blockDefine().typeName;
    
    if (!(typename in this.libmap)) {
      console.log(block);
      throw new Error("invalid blocktype " + typename);
    }
    return this.getLibrary(typename).add(block);
  }
  
  remove(block) {
    return this.getLibrary(block.constructor.blockDefine().typeName).remove(block);
  }
  
  destroy() {
    for (let lib of this.libs) {
      lib.destroy();
    }
  }
  
  getLibrary(typeName) {
    return this.libmap[typeName];
  }
  
  static fromSTRUCT(reader) {
    let ret = new Library();

    ret.libmap = {};
    ret.libs.length = 0;

    reader(ret);
    
    for (let lib of ret.libs.slice(0, ret.libs.length)) {
      let type = undefined;

      ret.libmap[lib.type] = lib;

      for (let cls of BlockTypes) {
        if (cls.blockDefine().typeName == lib.type) {
          type = cls;
        }
      }
      
      if (type === undefined) {
        console.warn("Failed to load library type", lib.type);
        
        ret.libs.remove(lib);
        continue;
      }
      
      lib.afterLoad(ret, type);
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
