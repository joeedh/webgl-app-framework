import {Matrix4, Vector2, Vector3, Vector4, nstructjs, ToolProperty, PropTypes, PropFlags,
  EnumProperty} from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';

import {IDGen} from '../util/util.js';
import {Node, Graph, NodeFlags, SocketFlags, NodeSocketType} from './graph.js';
import {Icons} from "../editors/icon_enum.js";

let STRUCT = nstructjs.STRUCT;

export let BlockTypes = [];
export const BlockFlags = {
  SELECT    : 1,
  HIDE      : 2,
  FAKE_USER : 4,
  NO_SAVE   : 8 //do not save
};

export class DataBlock extends Node {
  //loads contents of obj into this datablock
  //but doesn't touch the .lib_XXXX properties or .name
  swapDataBlockContents(obj) {
    for (let k in obj) {
      if (k.startsWith("lib_") || k === "name") {
        continue;
      }

      if (k.startsWith("graph_")) {
        continue;
      }

      if (k === "inputs" || k === "outputs") {
        continue;
      }

      this[k] = obj[k];
    }

    return this;
  }

  graphDisplayName() {
    return this.name;
  }

  constructor() {
    super();

    this.lib_userData = {}; //json-compatible custom data

    //make sure we're not saving the whole block inside of Library.graph
    this.graph_flag |= NodeFlags.SAVE_PROXY;

    let def = this.constructor.blockDefine();

    this.lib_id = -1;
    this.name = def.defaultName;
    this.lib_flag = def.flag !== undefined ? def.flag : 0;
    this.lib_icon = def.icon;
    this.lib_type = def.typeName;
    this.lib_users= 0;
    this.lib_external_ref = undefined; //presently unused

    //note that this is regenerated on file load
    this.lib_userlist = []; //list of things using us

    if (this.lib_flag & BlockFlags.FAKE_USER) {
      this.lib_users = 1;
    }
  }

  [Symbol.keystr]() {
    return this.lib_id;
  }

  //deep duplicates block, except for references to other data block which aren't copied
  //(e.g. a sceneobject doesn't duplicate .data)
  //if addLibUsers is true, references to other datablocks will get lib_addUser called,
  copy(addLibUsers=false) {
    let ret = new this.constructor();
    DataBlock.prototype.copyTo.call(this, ret, false);
    return ret;
  }

  destroy() {
  }

  //like swapDataBlockContents but copies a few lib_ and graph_ fields
  //and also copys over default socket values
  //
  //note that like swapDataBlockContents, this is a "shallow" copy
  copyTo(b, copyContents=true) {
    if (copyContents) {
      b.swapDataBlockContents(this);
    }

    b.graph_flag = this.graph_flag;
    b.lib_flag = this.lib_flag;
    b.lib_userData = JSON.parse(JSON.stringify(this.lib_userData));
    b.lib_external_ref = this.lib_external_ref;

    //load default graph socket values
    for (let k in this.inputs) {
      if (!b.inputs[k]) {
        continue;
      }

      b.inputs[k].setValue(this.inputs[k].getValue());
    }

    for (let k in this.outputs) {
      if (!b.outputs[k]) {
        continue;
      }

      b.outputs[k].setValue(this.outputs[k].getValue());
    }
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

  _validate_userlist() {
    let stop = false;
    let _i = 0; //infinite loop guard

    while (!stop && _i++ < 10000) {
      stop = true;

      for (let block of this.lib_userlist) {
        if (block.lib_id < 0) {
          console.log("Dead block in user list");
          this.lib_users--;
          this.lib_users.remove(block);
          stop = false;
        }
      }
    }
  }

  lib_getUsers() {
    this._validate_userlist();

    return this.lib_userlist;
  }

  /**increment reference count.
   * if user is not undefined and is a datablock,
   * it will be added to this.lib_userlist
   * */
  lib_addUser(user) {
    if (user) {
      let bad = typeof user !== "object";
      bad = bad || !(user instanceof DataBlock);
      bad = bad || user.lib_id < 0;

      if (bad) {
        console.error(`
Bad owner passed to lib_addUser; ref count will be increased,
but owner will not be added to this.lib_userlist`.trim());
        console.warn("this:", this, "owner:", user);
      } else {
        this.lib_userlist.push(user);
      }
    }

    this.lib_users++;
  }

  /**decrement reference count*/
  lib_remUser(user) {
    this.lib_users--;

    if (user && this.lib_userlist.indexOf(user) >= 0) {
      this.lib_userlist.remove(user);
    }

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

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    try {
      this.lib_userData = JSON.parse(this.lib_userData);
    } catch (error) {
      console.error("Error parsing lib_userData!");
    }

    this.afterSTRUCT();
  }

  /**call this to register a subclass*/
  static register(cls) {
    BlockTypes.push(cls);
  }

  static getClass(typeName) {
    for (let type of BlockTypes) {
      if (type.blockDefine().typeName === typeName)
        return type;
    }
  }
}
DataBlock.STRUCT = STRUCT.inherit(DataBlock, Node) + `
  lib_id       : int;
  lib_flag     : int;
  lib_users    : int;
  name         : string;
  lib_userData : string | JSON.stringify(this.lib_userData);
}
`;

nstructjs.manager.add_class(DataBlock);

export class DataRef {
  constructor(lib_id = -1, lib_type = undefined) {
    if (typeof lib_id === "object") {
      lib_id = lib_id.lib_id;
    }

    this.lib_type = lib_type;
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

  set(block) {
    if (!block) {
      this.lib_id = -1;
      this.name = "";
    } else {
      this.lib_id = block.lib_id;
      this.name = block.name;
    }

    return this;
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

  create(name=undefined) {
    let cls = this.type;

    name = name ?? cls.blockDefine().defaultName ?? cls.blockDefine().uiName ?? cls.blockDefine().typeName;
    name = name ?? cls.name;

    let block = new cls();
    block.name = name;

    this.datalib.add(block);

    return block;
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

  add(block, _inside_file_load=false, force_unique_name=true) {
    if (force_unique_name) {
      block.name = this.uniqueName(block.name);
    }

    let added = this.push(block);

    if (added && !_inside_file_load) {
      this.datalib.graph.add(block);
    }

    return added;
  }

  rename(block, name) {
    if (!block || block.lib_id < 0 || !(block.lib_id in this.idmap) || !name || (""+name).trim().length === 0) {
      throw new Error("bad call to datalib rename API");
    }

    name = this.uniqueName(name);

    for (let i=0; i<2; i++) {
      let map = i ? this.datalib.block_namemap : this.namemap;
      for (let k in map) {
        if (map[k] === block) {
          delete map[k];
        }
      }
    }

    block.name = name;

    this.datalib.block_namemap[name] = block;
    this.namemap[name] = block;

    return name;
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
    this.datalib.block_namemap[block.name] = block;

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
    if (typeof name_or_id === "number") {
      return this.idmap[name_or_id];
    } else if (typeof name_or_id === "string") {
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

    /*
    if (block.name in this.namemap) {
      delete this.namemap[block.name];
    }//*/

    for (let k in this.namemap) {
      if (this.namemap[k] === block) {
        delete this.namemap[k];
      }
    }

    for (let k in this.datalib.block_namemap) {
      if (this.datalib.block_namemap[k] === block) {
        delete this.datalib.block_namemap[k];
      }
    }

    delete this.idmap[block.lib_id];
    delete this.datalib.block_idmap[block.lib_id];

    block.lib_id = -1;

    if (block === this.active) {
      this.active = undefined;
    }

    super.remove(block);

    try {
      block.destroy();
    } catch (error) {
      util.print_stack(error);
      console.log("block.destroy() callback failed", block);
    }

    //remove form dependency graph
    this.datalib.graph.remove(block);
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
  type   : string | this.type.blockDefine().typeName;
  active : int | this.active !== undefined ? obj.active.lib_id : -1;
}
`;
nstructjs.register(BlockSet);

export class Library {
  constructor() {
    //master graph
    this.graph = new Graph();

    this.libs = [];
    this.libmap = {};

    this.idgen = new IDGen();

    this.block_idmap = {};
    this.block_namemap = {};

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
  getBlockListEnum(blockClass, filterfunc) {
    let tname = blockClass.blockDefine().typeName;
    let uiname = blockClass.blockDefine().uiName;
    let lib = this.libmap[tname];

    let ret = {};
    let icons = {};

    for (let block of lib) {
      if (filterfunc && !filterfunc(block)) {
        continue;
      }
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

  get(id_or_dataref_or_name) {
    let f = id_or_dataref_or_name;

    if (f === undefined || f === null) {
      return false;
    }

    if (typeof f === "number") {
      return this.block_idmap[f];
    } else if (typeof f === "string") {
      return this.block_namemap[f];
    } else if (typeof f === "object" && (f instanceof DataRef)) {
      return this.block_idmap[f.lib_id];
    } else {
      throw new Error("bad parameter passed to Library.get()");
    }
  }

  has(id_or_dataref_or_block_or_name) {
    let f = id_or_dataref_or_block_or_name;

    if (f === undefined | f === null) {
      return false;
    }

    if (typeof f === "number") {
      return this.block_idmap[f];
    } else if (typeof f === "string") {
      return this.block_namemap[f];
    } else if (typeof f === "object" && (f instanceof DataRef)) {
      return this.block_idmap[f.lib_id];
    } else if (typeof f === "object" && (f instanceof DataBlock)) {
      return f.lib_id >= 0 && this.block_idmap[f.lib_id] === f;
    } else {
      throw new Error("bad parameter passed to Library.get()");
    }
  }

  add(block, force_unique_name=true) {
    let typename = block.constructor.blockDefine().typeName;

    if (!(typename in this.libmap)) {
      //see if we're missing a legitimate block type
      for (let cls of BlockTypes) {
        if (cls.blockDefine().typeName === typename) {
          let lib = new BlockSet(cls, this);
          this.libs.push(lib);
          this.libmap[typename] = lib;

          return lib.add(block, undefined, force_unique_name);
        }
      }
      throw new Error("invalid blocktype " + typename);
    }

    return this.getLibrary(typename).add(block, undefined, force_unique_name);
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

    if (typeof type === "object" || typeof type === "function") {
      type = type.blockDefine().typeName;
    }

    this.blockType = type;
    this.data = new DataRef();
  }

  setValue(val) {
    if (val === undefined || val === -1) {
      this.data.lib_id = -1;
      return;
    }

    //are we typed?
    if (this.blockType === undefined) {
      if (typeof val === "number") {
        this.data.lib_id = val;
      } else {
        this.data.set(val);
      }

      return;
    }

    console.log("VAL", val);

    if (typeof val === "object" && val instanceof DataRef) {
      this.data.lib_id = val.lib_id;
      this.data.name = val.name;
      this.data.lib_type = val.lib_type;
    } else if (typeof val == "object" && val instanceof DataBlock && (val.constructor.blockDefine().typeName !== this.blockType)) {
      throw new Error("invalid block type " + val.constructor.blockDefine().typeName + "; expected" + this.blockType + ".");

      this.data.lib_id = val.lib_id;
      this.data.name = val.name;
    } else if (typeof val == "number") {
      console.warn("Warning, DataRefProperty.setValue was fed a number; can't validate it's type")
      //can't validate in this case

      this.data.lib_id = val;
      this.data.name = "";
    } else if (typeof val === "object" && val instanceof DataBlock) {
      this.data.set(val);
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
  constructor(iterable, blockTypeName="") {
    super();

    this.idmap = {};
    this.lib_type = blockTypeName;

    //optional active and highlight references
    //if client code wants them
    this.active = new DataRef();
    this.highlight = new DataRef();

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

  getActive(ctx) {
    return ctx.datalib.get(this.active);
  }
  getHighlight(ctx) {
    return ctx.datalib.get(this.active);
  }

  setActive(ctx, val) {
    if (val === undefined) {
      this.active.lib_id = -1;
    } else {
      this.active.lib_id = val.lib_id;
    }

    return this;
  }

  setHighlight(ctx, val) {
    if (val === undefined) {
      this.highlight.lib_id = -1;
    } else {
      this.highlight.lib_id = val.lib_id;
    }

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

  loadSTRUCT(reader) {
    reader(this);

    this.idmap = {};

    for (let ref of this._array) {
      super.push(ref);
      this.idmap[ref.lib_id] = ref;
    }

    delete this._array;
  }
}
DataRefList.STRUCT = `
DataRefList {
  _array    : array(DataRef) | obj;
  active    : DataRef | obj;
  highlight : DataRef | obj;
  lib_type  : string;  
}
`;
nstructjs.register(DataRefList);
