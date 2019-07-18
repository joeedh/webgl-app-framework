import '../path.ux/scripts/struct.js';
import {IDGen} from '../util/util.js';
import {Node} from './graph.js';
import {ToolProperty, PropFlags} from '../path.ux/scripts/toolprop.js';

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

  /**getblock_us gets a block and adds reference count to it
   * getblock just gets a block and doesn't add a reference to it*/
  dataLink(getblock, getblock_us) {

  }

  /**increment reference count*/
  lib_addUser(user) {
    this.lib_users++;
  }

  /**decrement reference count*/
  lib_remUser(user) {
    this.lib_users--;
  }

  /**
   * subclasses must call this from their own
   * fromSTRUCT methods.  note that it might be
   * made automatic in the future (refactor me!)
   * */
  afterSTRUCT() {
    super.afterSTRUCT();
  }

  /**
   * subclasses must implement this; here is an example
   * */
  static fromSTRUCT(reader) {
    let ret = new this();
    reader(ret);
    ret.afterSTRUCT();
    return ret;
  }

  /**call this to register a subclass*/
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
    this.lib_id = -1;
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

  set(ob) {
    this.lib_id = ob.lib_id;
    this.lib_name = ob.lib_name;
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
        console.warn("Failed to load library type", lib.type);3
        
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

export class DataRefProperty extends ToolProperty {
  constructor(type, apiname, uiname, description, flag, icon) {
    super(undefined, apiname, uiname, description, flag, icon)

    this.blockType = type;
    this.data = new DataRef();
  }

  setValue(val) {
    if (val === undefined || val === -1) {
      this.data.lib_id = -1;
      return;
    }

    if (typeof val == "object" && (val.constructor.blockDefine().typeName !== this.blockType)) {
      throw new Error("invalid block type " + val.constructor.blockDefine().typeName + "; expected" + this.blockType + ".");
      this.data.lib_id = val.lib_id;
      this.data.lib_name = val.lib_name;
    } else if (typeof val == "number") {
      console.warn("Warning, DataRefProperty.setValue was fed a number; can't validate it's type")
      //can't validate in this case

      this.data.lib_id = val;
      this.data.lib_name = "";
    } else if (typeof val == "object") {
      this.data.lib_id = val.lib_id;
      this.data.lib_name = val.lib_name;
    } else {
      console.warn("failed to set DataRefProperty; arguments:", arguments);
    }

    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    super.copyTo(b);
    b.blockType = this.blockType;
  }

  copy() {
    let ret = new DataRefProperty();
    this.copyTo(ret);
    return ret;
  }
}
ToolProperty.register(DataRefProperty);

export class DataRefListProperty extends ToolProperty {
  constructor(typeName, apiname, uiname, description, flag, icon) {
    super(undefined, apiname, uiname, description, flag, icon)

    this.blockType = typeName;
    this.data = [];
  }

  setValue(val) {
    if (val === undefined) {
      this.data.length = 0;
      return;
    }

    this.data.length = 0;

    for (let block of val) {
      if (block instanceof DataBlock) {
        block = DataRef.fromBlock(block);
      } else if (typeof block == "number") {
        let ref = new DataRef();

        ref.lib_id = block;
        block = ref;
      }

      this.data.push(block);
    }

    return this;
  }

  getValue() {
    return this.data;
  }

  copyTo(b) {
    super.copyTo(b);
    b.blockType = this.blockType;
  }

  copy() {
    let ret = new DataRefListProperty();
    this.copyTo(ret);
    return ret;
  }
}
ToolProperty.register(DataRefListProperty);
