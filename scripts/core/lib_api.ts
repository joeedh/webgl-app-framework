import {
  Matrix4, Vector2, Vector3, Vector4, nstructjs, ToolProperty, PropTypes,
  EnumProperty, util
} from '../path.ux/scripts/pathux.js';

import {IDGen} from '../util/util.js';
import {Node, Graph, NodeFlags, SocketFlags, NodeSocketType, INodeConstructor} from './graph';
import {Icons} from "../editors/icon_enum.js";
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import type {ToolContext} from "../../types/scripts/core/context";

export let BlockTypes = [];

export interface IBlockRef {
  lib_id: number;
  lib_type: string;
  name: string;
}

export enum BlockFlags {
  SELECT = 1,
  HIDE = 2,
  FAKE_USER = 4,
  NO_SAVE = 8 //do not save
}

export interface IBlockDef {
  typeName: string;
  uiName?: string;
  defaultName?: string;
  icon?: number;
  flag?: number;
}

export interface IDataBlockConstructor<type extends DataBlock<InputSet, OutputSet>, InputSet, OutputSet> extends INodeConstructor<type, InputSet, OutputSet> {
  new(): type;

  blockDefine(): IBlockDef;
}

export interface BlockLoader {
  <type>(ref: DataRef | number): type;
}

export class DataBlock<InputSet = {}, OutputSet = {}> extends Node<InputSet, OutputSet> {
  static STRUCT = nstructjs.inlineRegister(this, `
DataBlock {
  lib_id       : int;
  lib_flag     : int;
  lib_users    : int;
  name         : string;
  lib_userData : string | JSON.stringify(this.lib_userData);
}
  `);

  //loads contents of obj into this datablock
  //but doesn't touch the .lib_XXXX properties or .name
  swapDataBlockContents(obj: this): this {
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

  name: string;

  lib_userData: {} = {};
  lib_id: number;
  lib_flag: number;
  lib_icon: number;
  lib_type: string;
  lib_users: number;
  lib_userlist: DataBlock[];
  lib_external_ref: any;

  ['constructor']: IDataBlockConstructor<this, InputSet, OutputSet>;

  constructor() {
    super();

    this.lib_userData = {}; //json-compatible custom data

    //make sure we're not saving the whole block inside of Library.graph
    this.graph_flag |= NodeFlags.SAVE_PROXY;

    let def = this.constructor.blockDefine();

    this.lib_id = -1;
    this.name = def.defaultName ?? def.uiName ?? def.typeName;
    this.lib_flag = def.flag !== undefined ? def.flag : 0;
    this.lib_icon = def.icon;
    this.lib_type = def.typeName;
    this.lib_users = 0;
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
  copy(addLibUsers = false, owner?: DataBlock): this {
    let ret = new this.constructor();

    this.copyTo(ret);
    //forcibly call DataBlock.ptotoype.copyTo
    DataBlock.prototype.copyTo.call(this, ret, false);

    if (addLibUsers) {
      //ret.lib_addUser(owner);

      ret.lib_users++;
      if (owner) {
        ret.lib_userlist.push(owner);
      }
    }

    return ret;
  }

  destroy() {
  }

  //like swapDataBlockContents but copies a few lib_ and graph_ fields
  //and also copys over default socket values
  //
  //note that like swapDataBlockContents, this is a "shallow" copy
  copyTo(b: this, copyContents = true): void {
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

      (b.inputs[k] as NodeSocketType).setValue((this.inputs[k] as NodeSocketType).getValue());
    }

    for (let k in this.outputs) {
      if (!b.outputs[k]) {
        continue;
      }

      (b.outputs[k] as NodeSocketType).setValue((this.outputs[k] as NodeSocketType).getValue());
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
  static blockDefine() {
    return {
      typeName: "typename",
      defaultName: "unnamed",
      uiName: "uiname",
      flag: 0,
      icon: -1
    }
  }

  /**
   * @param getblock: gets a block
   * @param getblock_addUser:  gets a block but increments reference count
   *
   * note that the reference counts of all blocks are re-built at file load time,
   * so make sure to choose between these two functions correctly.
   */
  dataLink(getblock: BlockLoader, getblock_addUser: BlockLoader): void {
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
          this.lib_userlist.remove(block);
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
  lib_addUser(user?: DataBlock): void {
    if (user) {
      let bad = typeof user !== "object";
      bad = bad || !(user instanceof DataBlock);

      //this condition wreaks havoc in the common case
      //of building an object graph prior to adding to a datalib
      //bad = bad || user.lib_id < 0;

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
  lib_remUser(user?: DataBlock): void {
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

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
    super.loadSTRUCT(reader);

    if (typeof this.lib_userData === "string") {
      try {
        this.lib_userData = JSON.parse(this.lib_userData);
      } catch (error) {
        util.print_stack(error);
        console.error("Error parsing lib_userData!", this.lib_userData);
      }
    }

    this.afterSTRUCT();
  }

  /**call this to register a subclass*/
  static register(cls: IDataBlockConstructor<any, {}, {}>) {
    if (cls.blockDefine === DataBlock.blockDefine) {
      throw new Error(cls.name + " is missing its blockDefine static method");
    }

    BlockTypes.push(cls);
  }

  static unregister(cls: IDataBlockConstructor<any, {}, {}>) {
    BlockTypes.remove(cls);
  }

  static getClass<type extends DataBlock = DataBlock>(typeName: string): IDataBlockConstructor<type, {}, {}> {
    for (let type of BlockTypes) {
      if (type.blockDefine().typeName === typeName)
        return type;
    }
  }
}

export class DataRef<BlockType extends DataBlock = DataBlock> implements IBlockRef {
  static STRUCT = nstructjs.inlineRegister(this, `
DataRef {
  lib_id   : int;
  name     : string;
  lib_type : string;
}
`);

  lib_id: number;
  lib_type: string;
  name: string;
  lib_external_ref?: any;

  constructor(lib_id = -1, lib_type = undefined) {
    if (typeof lib_id === "object") {
      lib_id = (lib_id as unknown as DataRef).lib_id;
    }

    this.lib_type = lib_type;
    this.lib_id = lib_id;
    this.name = "";
  }

  copy(): this {
    let ret = new (this.constructor as new() => this)();

    ret.lib_type = this.lib_type;
    ret.lib_id = this.lib_id;
    ret.name = this.name;
    ret.lib_external_ref = this.lib_external_ref;

    return ret;
  }

  static fromBlock(block: DataBlock): DataRef {
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

  set(block: BlockType) {
    if (!this.lib_type) {
      this.lib_type = block.constructor.blockDefine().typeName;
    }

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

//this has to be in global namespace for struct scripts to work
window.DataRef = DataRef as unknown as () => void;

export class BlockSet<BlockType extends DataBlock> extends Array<BlockType> {
  //note that blocks are saved/loaded seperately
  //to allow loading them individually
  static STRUCT = nstructjs.inlineRegister(this, `
BlockSet {
  type   : string | this.type.blockDefine().typeName;
  active : int | this.active !== undefined ? obj.active.lib_id : -1;
}
  `);

  datalib: Library;
  type: IDataBlockConstructor<BlockType, {}, {}>;
  __active?: BlockType;
  idmap: { [k: number]: BlockType };
  namemap: { [k: string]: BlockType };

  constructor(type: IDataBlockConstructor<BlockType, {}, {}>, datalib: Library) {
    super();

    this.datalib = datalib;
    this.type = type;
    this.__active = undefined;
    this.idmap = {};
    this.namemap = {};
  }

  clear() {
    for (let block of new Set(this)) {
      this.datalib.remove(block);
    }

    return this;
  }

  create(name = undefined) {
    let cls = this.type;

    name = name ?? cls.blockDefine().defaultName ?? cls.blockDefine().uiName ?? cls.blockDefine().typeName;
    name = name ?? cls.name;

    let block = new cls();
    block.name = name;

    this.datalib.add(block);

    return block;
  }

  uniqueName(name = this.type.blockDefine().defaultName) {
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

  setActive(val?: BlockType): void {
    this.active = val;
  }

  add(block: BlockType, _inside_file_load = false, force_unique_name = true): boolean {
    if (force_unique_name) {
      block.name = this.uniqueName(block.name);
    }

    let added = this.push(block);

    if (added && !_inside_file_load) {
      this.datalib.graph.add(block);
    }

    return added !== 0;
  }

  rename(block: BlockType, name: string): string {
    if (!block || block.lib_id < 0 || !(block.lib_id in this.idmap) || !name || ("" + name).trim().length === 0) {
      throw new Error("bad call to datalib rename API");
    }

    name = this.uniqueName(name);

    for (let i = 0; i < 2; i++) {
      let map = i ? this.datalib.block_namemap : this.namemap;
      for (let k in map) {
        if (map[k] as unknown as BlockType === block) {
          delete map[k];
        }
      }
    }

    block.name = name;

    this.datalib.block_namemap[name] = block;
    this.namemap[name] = block;

    return name;
  }

  push(block: BlockType): number {
    block.name = this.uniqueName(block.name);

    if (block.lib_id >= 0 && (block.lib_id in this.idmap)) {
      console.warn("Block already in dataset");
      return 0;
    }

    super.push(block);

    if (block.lib_id === -1) {
      block.lib_id = this.datalib.idgen.next();
    }

    this.datalib.block_idmap[block.lib_id] = block;
    this.datalib.block_namemap[block.name] = block;

    this.idmap[block.lib_id] = block;
    this.namemap[block.name] = block;

    return 1;
  }

  /**
   *
   * @param name_or_id_or_dataref : can be a string with block name, integer with block id, or DataRef instance
   * @returns boolean
   */
  has(name_or_id_or_dataref: any): boolean {
    if (typeof name_or_id_or_dataref == "number") {
      return name_or_id_or_dataref in this.idmap;
    } else if (typeof name_or_id_or_dataref == "string") {
      return name_or_id_or_dataref in this.namemap;
    } else if (name_or_id_or_dataref instanceof DataRef) {
      return name_or_id_or_dataref.lib_id in this.idmap;
    } else {
      return false;
    }
  }

  /**
   *
   * @param name_or_id_or_dataref : can be a string with block name, integer with block id, or DataRef instance
   * @returns DataBlock
   */
  get(name_or_id_or_dataref: any): BlockType | undefined {
    if (typeof name_or_id_or_dataref === "number") {
      return this.idmap[name_or_id_or_dataref];
    } else if (typeof name_or_id_or_dataref === "string") {
      return this.namemap[name_or_id_or_dataref];
    } else if (name_or_id_or_dataref instanceof DataRef) {
      return this.idmap[name_or_id_or_dataref.lib_id];
    } else {
      throw new Error("invalid value in lib_api.js:BlockSet.get")
    }
  }

  remove(block: BlockType): void {
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

    if (window.DEBUG["DataLink"]) {
      console.warn("Linking " + type + ". . .", this.active, this.idmap);
    }

    if (this.active as unknown as number !== -1) {
      this.active = this.idmap[this.active as unknown as number];
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

  afterLoad(datalib: Library, type: IDataBlockConstructor<any, any, any>) {
    this.type = type;
    this.datalib = datalib;
  }
}

export class Library {
  static STRUCT = nstructjs.inlineRegister(this, `
Library {
  libs  : array(BlockSet);
  idgen : IDGen;
  graph : graph.Graph;
}
`);

  graph: Graph<ToolContext>
  libs: BlockSet<any>[];
  libmap: { [k: string]: BlockSet<any> };
  idgen: IDGen;
  block_idmap: { [k: number]: DataBlock };
  block_namemap: { [k: string]: DataBlock };

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
      this.libmap[cls.blockDefine().typeName] = lib;

      let tname = cls.blockDefine().typeName;
      Object.defineProperty(this, tname, {
        get: function (this: Library) {
          return this.libmap[tname];
        }
      });
    }
  }

  //builds enum property of active blocks
  //for path.ux.  does not include ones that are hidden.
  getBlockListEnum(blockClass: IDataBlockConstructor<any, any, any>,
                   filterfunc: (block: DataBlock) => boolean): EnumProperty {
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

  setActive(block: DataBlock) {
    let tname = block.constructor.blockDefine().typeName;

    this.getLibrary(tname).active = block;
  }

  get allBlocks() {
    let this2 = this;
    return (function* () {
      for (let lib of this2.libs) {
        for (let block of lib) {
          yield block;
        }
      }
    })();
  }

  get<BlockType = DataBlock>(id_or_dataref_or_name: any): BlockType | undefined {
    let f = id_or_dataref_or_name;

    if (f === undefined || f === null) {
      return undefined;
    }

    if (typeof f === "number") {
      return this.block_idmap[f] as unknown as BlockType | undefined;
    } else if (typeof f === "string") {
      return this.block_namemap[f] as unknown as BlockType | undefined;
    } else if (typeof f === "object" && (f instanceof DataRef)) {
      return this.block_idmap[f.lib_id] as unknown as BlockType | undefined;
    } else {
      throw new Error("bad parameter passed to Library.get()");
    }
  }

  has<BlockType = DataBlock>(id_or_dataref_or_block_or_name: any): boolean {
    let f = id_or_dataref_or_block_or_name;

    if (f === undefined || f === null) {
      return false;
    }

    if (typeof f === "number") {
      return this.block_idmap[f] !== undefined;
    } else if (typeof f === "string") {
      return this.block_namemap[f] !== undefined;
    } else if (typeof f === "object" && (f instanceof DataRef)) {
      return this.block_idmap[f.lib_id] !== undefined;
    } else if (typeof f === "object" && (f instanceof DataBlock)) {
      return f.lib_id >= 0 && this.block_idmap[f.lib_id] === f;
    } else {
      throw new Error("bad parameter passed to Library.get()");
    }
  }

  add<BlockType extends DataBlock = DataBlock>(block: BlockType, force_unique_name = true): boolean {
    let typename = block.constructor.blockDefine().typeName;

    if (!(typename in this.libmap)) {
      //see if we're missing a legitimate block type
      for (let cls of BlockTypes) {
        if (cls.blockDefine().typeName === typename) {
          let lib = new BlockSet(cls, this);
          this.libs.push(lib);
          this.libmap[typename] = lib;

          return lib.add(block as unknown as DataBlock, undefined, force_unique_name);
        }
      }
      throw new Error("invalid blocktype " + typename);
    }

    return this.getLibrary<BlockType>(typename).add(block, undefined, force_unique_name);
  }

  remove(block: DataBlock) {
    return this.getLibrary(block.constructor.blockDefine().typeName).remove(block);
  }

  destroy() {
    for (let lib of this.libs) {
      lib.destroy();
    }
  }

  getLibrary<BlockType extends DataBlock = DataBlock>(typeName: string): BlockSet<BlockType> {
    return this.libmap[typeName] as unknown as BlockSet<BlockType>;
  }

  afterSTRUCT() {
    for (let block of this.allBlocks) {
      this.graph.relinkProxyOwner(block);
    }
  }

  loadSTRUCT(reader: StructReader<this>) {
    this.libmap = {};
    this.libs.length = 0;

    reader(this);

    for (let lib of this.libs.slice(0, this.libs.length)) {
      let type = undefined;

      this.libmap[lib.type as unknown as string] = lib;

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

export class DataRefProperty extends ToolProperty<DataRef> {
  static STRUCT = nstructjs.inlineRegister(this, `
DataRefProperty {
  blockType : string;
  data      : DataRef;
}`);

  blockType: string;
  data: DataRef;

  constructor(type?: IDataBlockConstructor<any, any, any>, apiname = "", uiname = "", description = "", flag = 0, icon = -1) {
    super(PropTypes.DATAREF);

    this.apiname = apiname;
    this.uiname = uiname;
    this.description = description;
    this.flag = flag;
    this.icon = icon;

    if (typeof type === "string") {
      type = DataBlock.getClass(type as unknown as string);
    }

    if (type !== undefined) {
      this.blockType = type.blockDefine().typeName;
    }

    this.data = new DataRef();
  }

  calcMemSize() {
    return super.calcMemSize() + (this.blockType ? this.blockType.length * 4 + 8 : 8) + 64;
  }

  setValue(val: any) {
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

    if (typeof val === "object" && val instanceof DataRef) {
      this.data.lib_id = val.lib_id;
      this.data.name = val.name;
      this.data.lib_type = val.lib_type;
    } else if (typeof val == "object" && val instanceof DataBlock && (val.constructor.blockDefine().typeName !== this.blockType)) {
      throw new Error("invalid block type " + val.constructor.blockDefine().typeName + "; expected" + this.blockType + ".");
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

  copyTo(b: this) {
    super.copyTo(b);
    b.blockType = this.blockType;
  }

  copy(): this {
    let ret = new (this.constructor as new() => this)();
    this.copyTo(ret);
    return ret;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    if (this.blockType === "undefined") {
      this.blockType = undefined;
    }
  }
}

PropTypes.DATAREF = ToolProperty.register(DataRefProperty);

export class DataRefListProperty extends ToolProperty<DataRef[]> {
  blockType: string;
  data: DataRef[];

  constructor(typeName: string, apiname: string, uiname = "", description = "", flag = 0, icon = -1) {
    super(PropTypes.DATAREFLIST)

    this.blockType = typeName;
    this.data = [];
  }

  calcMemSize() {
    let tot = super.calcMemSize();

    tot += this.blockType ? this.blockType.length + 4 : 0;
    tot += 8;

    tot += this.data.length * 64; //64 is probably incorrect for size of DataRef
    return tot;
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

  copyTo(b): void {
    super.copyTo(b);
    b.blockType = this.blockType;
  }

  copy(): this {
    let ret = new (this.constructor as new() => this)();
    this.copyTo(ret);
    return ret;
  }
}

PropTypes.DATAREFLIST = ToolProperty.register(DataRefListProperty);

export class DataRefList extends Array<DataRef> {
  static STRUCT = nstructjs.inlineRegister(this, `
DataRefList {
  _array    : array(DataRef) | obj;
  active    : DataRef | obj;
  highlight : DataRef | obj;
  lib_type  : string;  
}`);

  idmap: { [k: number]: DataRef };
  lib_type: string;
  active: DataRef;
  highlight: DataRef;

  /* used by STRUCT system. */
  _array?: DataRef[];

  constructor(iterable, blockTypeName = "") {
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

  push(item: any) {
    let ref: DataRef;

    if (typeof item === "number") {
      ref = new DataRef(item);
    } else if (item instanceof DataBlock) {
      ref = new DataRef(item.lib_id, item.lib_type)
    } else {
      throw new Error("Non-datablock passed to DataRefList: " + item);
    }

    if (ref.lib_id < 0) {
      throw new Error("DataBlock hasn't been added to a datalib yet");
    }

    this.idmap[ref.lib_id] = ref;
    return super.push(ref);
  }

  getActive(ctx: ToolContext) {
    return ctx.datalib.get(this.active);
  }

  getHighlight(ctx: ToolContext) {
    return ctx.datalib.get(this.active);
  }

  setActive(ctx: ToolContext, val?: IBlockRef): this {
    if (val === undefined) {
      this.active.lib_id = -1;
    } else {
      this.active.lib_id = val.lib_id;
    }

    return this;
  }

  setHighlight(ctx: ToolContext, val?: IBlockRef): this {
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

  remove(item: any) {
    let lib_id;

    if (typeof item === "number") {
      lib_id = item;
    }
    if (item instanceof DataBlock) {
      lib_id = item.lib_id;
    } else {
      throw new Error("Non-datablock passed to DataRefList: " + item);
    }

    if (!(lib_id in this.idmap)) {
      throw new Error("Item not in list: " + lib_id);
    }

    super.remove(this.idmap[lib_id]);
    delete this.idmap[lib_id];
  }

  has(item: any): boolean {
    if (item === undefined) {
      return false;
    }

    let lib_id;

    if (typeof item === "number") {
      lib_id = item;
    }
    if (item instanceof DataBlock) {
      lib_id = item.lib_id;
    } else {
      throw new Error("Non-datablock passed to DataRefList: " + item);
    }

    return lib_id in this.idmap;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);

    this.idmap = {};

    for (let ref of this._array) {
      super.push(ref);
      this.idmap[ref.lib_id] = ref;
    }

    this._array = undefined;
  }
}
