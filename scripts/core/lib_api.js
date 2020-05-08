import '../path.ux/scripts/struct.js';
import {IDGen} from '../util/util.js';
import {Node, Graph, NodeFlags, SocketFlags, NodeSocketType} from './graph.js';
import {ToolProperty, PropTypes, PropFlags, EnumProperty} from '../path.ux/scripts/toolprop.js';
import {Check1} from "../path.ux/scripts/ui_widgets.js";
import {Icons} from "../editors/icon_enum.js";

let STRUCT = nstructjs.STRUCT;

export let BlockTypes = [];
export const BlockFlags = {
  SELECT : 1,
  HIDE   : 2,
  FAKE_USER : 4
};

export class DataBlock extends Node {
  //loads contents of obj into this datablock
  //but doesn't touch the .lib_XXXX properties or .name
  swapDataBlockContents(obj) {
    for (let k in obj) {
      if (k.startsWith("lib_") || k == "name") {
        continue;
      }

      this[k] = obj[k];
    }

    return this;
  }

  constructor() {
    super();

    //make sure we're not saving the whole block inside of Library.graph
    this.graph_flag |= NodeFlags.SAVE_PROXY;

    let def = this.constructor.blockDefine();
    
    this.lib_id = -1;
    this.name = def.defaultName;
    this.lib_flag = def.flag;
    this.lib_icon = def.icon;
    this.lib_type = def.type;
    this.lib_users= 0;
    this.lib_external_ref = undefined; //presently unused

    if (this.lib_flag & BlockFlags.FAKE_USER) {
      this.lib_users = 1;
    }
  }

  [Symbol.keystr]() {
    return this.lib_id;
  }
  
  destroy() {
  }

  /**
    returns type info for a datablock

   @returns {{typeName: string, defaultName: string, uiName: string, flag: number, icon: number}}
   @example
   static blockDefine() { return {
      typeName    : "typename",
      defaultName : "unnamed",
      uiName      : "uiname",
      flag        : 0,
      icon        : -1 //some icon constant in icon_enum.js.Icons
    }}
   */
  static blockDefine() { return {
    typeName    : "typename",
    defaultName : "unnamed",
    uiName   : "uiname",
    flag     : 0,
    icon     : -1
  }}

  /**
   * @param getblock: gets a block
   * @param getblock_addUser:  gets a block but increments reference count
   *
   * note that the reference counts of all blocks are re-built at file load time,
   * so make sure to choose between these two functions correctly.
   */
  dataLink(getblock, getblock_addUser) {
  }

  /**increment reference count*/
  lib_addUser(user) {
    this.lib_users++;
  }

  /**decrement reference count*/
  lib_remUser(user) {
    this.lib_users--;

    if (this.lib_users < 0) {
      console.warn("Warning, a datablock had negative users", this.lib_users, this);
    }

    if (this.lib_users <= 0 && (this.lib_flag & BlockFlags.FAKE_USER)) {
      console.log("Warning, somehow fake user was cleared", this);
      this.lib_users = 1;
    }
  }

  afterSTRUCT() {
    super.afterSTRUCT();
  }

  /**all subclasses must call STRUCT.Super
    instead of read inside their loadSTRUCTs,
    that's how afterSTRUCT is invoked*/
  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.afterSTRUCT();
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
  constructor(lib_id = -1, lib_type = 0) {
    if (typeof lib_id === "object") {
      lib_id = lib_id.lib_id;
    }

    this.lib_type = lib_id;
    this.lib_id = lib_id;
    this.name = undefined;
    this.lib_external_ref = undefined;
  }

  copy() {
    let ret = new DataRef();

    ret.lib_type = this.lib_type;
    ret.lib_id = this.lib_id;
    ret.name = this.name;
    ret.lib_external_ref = this.lib_external_ref;

    return ret;
  }
  
  static fromBlock(block) {
    if (block instanceof DataRef) {
      return block.copy();
    }

    let ret = new DataRef();

    if (block === undefined) {
      ret.lib_id = -1;
      return ret;
    }

    if (!block.constructor || !block.constructor.blockDefine) {
      console.warn("Invalid block in fromBlock: ", block);

    } else {
      ret.lib_type = block.constructor.blockDefine().typeName;
    }

    ret.lib_id = block.lib_id;
    ret.name = block.name;
    ret.lib_external_ref = block.lib_external_ref;
    
    return ret;
  }

  set(ob) {
    this.lib_id = ob.lib_id;
    this.name = ob.name;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}
DataRef.STRUCT = `
DataRef {
  lib_id   : int;
  name     : string;
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

  uniqueName(name=this.type.blockDefine().defaultName) {
    if (!(name in this.namemap)) {
      return name;
    }

    let name2 = name;

    let i = 2;
    while (name2 in this.namemap) {
      name2 = name + i;
      i++;
    }

    return name2;
  }

  get active() {
    return this.__active;
  }

  set active(val) {
    this.__active = val;
    //console.trace("active set", this);
  }

  setActive(val) {
    this.active = val;
  }

  add(block, _inside_file_load=false) {
    let added = this.push(block);

    if (added && !_inside_file_load) {
      this.datalib.graph.add(block);
    }

    return added;
  }
  
  push(block) {
    block.name = this.uniqueName(block.name);

    if (block.lib_id >= 0 && (block.lib_id in this.idmap)) {
      console.warn("Block already in dataset");
      return false;
    }
    
    super.push(block);
    
    if (block.lib_id == -1) {
      block.lib_id = this.datalib.idgen.next();
    }

    this.datalib.block_idmap[block.lib_id] = block;
    
    this.idmap[block.lib_id] = block;
    this.namemap[block.name] = block;

    return true;
  }

  /**
   *
   * @param name_or_id : can be a string with block name, integer with block id, or DataRef instance
   * @returns boolean
   */
  has(name_or_id) {
    if (typeof name_or_id == "number") {
      return name_or_id in this.idmap;
    } else if (typeof name_or_id == "string") {
      return name_or_id in this.namemap;
    } else if (name_or_id instanceof DataRef) {
      return name_or_id.lib_id in this.idmap;
    } else {
      return false;
    }
  }

  /**
   *
   * @param name_or_id : can be a string with block name, integer with block id, or DataRef instance
   * @returns DataBlock
   */
  get(name_or_id) {
    if (typeof name_or_id == "number") {
      return this.idmap[name_or_id];
    } else if (typeof name_or_id == "string") {
      return this.namemap[name_or_id];
    } else if (name_or_id instanceof DataRef) {
      return this.idmap[name_or_id.lib_id];
    } else {
      throw new Error("invalid value in lib_api.js:BlockSet.get")
    }
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

    block.destroy();
  }

  destroy() {
    for (let block of this) {
      block.destroy();
    }
  }
  
  dataLink(getblock, getblock_addUser) {
    let type = this.type.blockDefine().typeName;
    
    if (DEBUG.DataLink) {
      console.warn("Linking " + type + ". . .", this.active, this.idmap);
    }

    if (this.active != -1) {
      this.active = this.idmap[this.active];
    } else {
      this.active = undefined;
    }

    for (let block of this) {
      block.dataLink(getblock, getblock_addUser);
    }
    
    return this;
  }

  loadSTRUCT(reader) {
    reader(this);
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
    //master graph
    this.graph = new Graph();

    this.libs = [];
    this.libmap = {};
    this.idgen = new IDGen();
    this.block_idmap = {};
    
    for (let cls of BlockTypes) {
      let lib = new BlockSet(cls, this);
      
      this.libs.push(lib);
      this.libmap[cls.blockDefine().typeName] =  lib;

      let tname = cls.blockDefine().typeName;
      Object.defineProperty(this, tname, {
        get : function() {
          return this.libmap[tname];
        }
      });
    }
  }

  //builds enum property of active blocks
  //for path.ux.  does not include ones that are hidden.
  getBlockListEnum(blockClass) {
    let tname = blockClass.blockDefine().typeName;
    let uiname = blockClass.blockDefine().uiName;
    let lib = this.libmap[tname];

    let ret = {};
    let icons = {};

    for (let block of lib) {
      if (block.lib_flag & BlockFlags.HIDE) {
        continue;
      }

      let icon = -1;

      if (block.lib_users <= 0)
        icon = Icons.DELETE;
      else if (block.lib_flag & BlockFlags.FAKE_USER)
        icon = Icons.FAKE_USER;

      ret[block.name] = block.lib_id;
      icons[block.name] = icon;
    }

    let prop = new EnumProperty(undefined, ret, tname, uiname + "s", uiname + "s");
    prop.addIcons(icons);

    return prop;
  }

  setActive(block) {
    let tname = block.constructor.blockDefine().typeName;

    this.getLibrary(tname).active = block;
  }

  get allBlocks() {
    let this2 = this;
    return (function*() {
      for (let lib of this2.libs) {
        for (let block of lib) {
          yield block;
        }
      }
    })();
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
      //see if we're missing a legitimate block type
      for (let cls of BlockTypes) {
        if (cls.blockDefine().typeName === typename) {
          let lib = new BlockSet(cls, this);
          this.libs.push(lib);
          this.libmap[typename] = lib;

          return lib.add(block);
        }
      }
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

  afterSTRUCT() {
    for (let block of this.allBlocks) {
      this.graph.relinkProxyOwner(block);
    }
  }

  loadSTRUCT(reader) {
    this.libmap = {};
    this.libs.length = 0;

    reader(this);
    
    for (let lib of this.libs.slice(0, this.libs.length)) {
      let type = undefined;

      this.libmap[lib.type] = lib;

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

    for (let cls of BlockTypes) {
      let type = cls.blockDefine().typeName;

      if (!(type in this.libmap)) {
        this.libmap[type] = new BlockSet(cls, this);
        this.libs.push(this.libmap[type]);
      }
    }
  }
}

Library.STRUCT = `
Library {
  libs  : array(BlockSet);
  idgen : IDGen;
  graph : graph.Graph;
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
      this.data.name = val.name;
    } else if (typeof val == "number") {
      console.warn("Warning, DataRefProperty.setValue was fed a number; can't validate it's type")
      //can't validate in this case

      this.data.lib_id = val;
      this.data.name = "";
    } else if (typeof val == "object") {
      this.data.lib_id = val.lib_id;
      this.data.name = val.name;
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
PropTypes.DATAREF = ToolProperty.register(DataRefProperty);

export class DataRefListProperty extends ToolProperty {
  constructor(typeName, apiname, uiname, description, flag, icon) {
    super(PropTypes.DATAREFLIST, apiname, uiname, description, flag, icon)

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
PropTypes.DATAREFLIST = ToolProperty.register(DataRefListProperty);

export class DataRefList extends Array {
  constructor(iterable) {
    super();

    this.idmap = {};

    if (iterable !== undefined) {
      for (let item of iterable) {
        this.push(item);
      }
    }
  }

  push(item) {
    if (typeof item === "number") {
      item = new DataRef(item);
    } else if (item instanceof DataBlock) {
      item = new DataRef(item.lib_id, item.lib_type)
    } else {
      throw new Error("Non-datablock passed to DataRefList: " + item);
    }

    if (item.lib_id < 0) {
      throw new Error("DataBlock hasn't been added to a datalib yet");
    }

    this.idmap[item.lib_id] = item;
    super.push(item);

    return this;
  }

  * blocks(ctx) {
    for (let ref of this) {
      yield ctx.datalib.get(ref);
    }
  }

  remove(item) {
    let lib_id;

    if (typeof item === "number") {
      lib_id = item;
    } if (item instanceof DataBlock) {
      lib_id = item.lib_id;
    } else {
      throw new Error("Non-datablock passed to DataRefList: " + item);
    }

    if (!(lib_id in this.idmap)) {
      throw new Error("Item not in list: " + lib_id);
    }

    super.remove(this.lib_id[lib_id]);
    delete this.lib_id[lib_id];

    return this;
  }

  has(item) {
    if (item === undefined) {
      return false;
    }

    let lib_id;

    if (typeof item === "number") {
      lib_id = item;
    } if (item instanceof DataBlock) {
      lib_id = item.lib_id;
    } else {
      throw new Error("Non-datablock passed to DataRefList: " + item);
    }

    return lib_id in this.idmap;
  }
}
