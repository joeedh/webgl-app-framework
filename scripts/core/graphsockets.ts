import {
  EnumKeyPair,
  Matrix4,
  Vector2,
  Vector3,
  Vector4,
  util,
  nstructjs,
  DataAPI,
  DataStruct, ToolProperty
} from '../path.ux/scripts/pathux.js';
import {NodeSocketType, NodeFlags, SocketFlags, nodeSocket_api_uiname} from './graph.js';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";
import {Container} from "../path.ux/scripts/types/core/ui";

export class Matrix4Socket extends NodeSocketType<Matrix4> {
  static STRUCT = nstructjs.inlineRegister(this, `
graph.Matrix4Socket{
  value : mat4;
}`);

  value: Matrix4;

  constructor(uiname?: string, flag?: number, default_value?: Matrix4) {
    super(uiname, flag);

    this.value = new Matrix4(default_value);

    if (default_value === undefined) {
      this.value.makeIdentity();
    }
  }

  addToUpdateHash(digest: util.HashDigest) {
    digest.add(this.value);
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct) {
    let def = sockstruct.struct("value", "value", "Value", api.mapStruct(Matrix4));
    //def.on('change', function() { this.dataref.graphUpdate(true)});
  }

  static nodedef() {
    return {
      name: "mat4",
      uiname: "Matrix",
      color: [1, 0.5, 0.25, 1]
    }
  }

  copyTo(b: this) {
    super.copyTo(b);

    b.value.load(this.value);
  }

  cmpValue(b: Matrix4) {
    return -1;
  }

  copyValue(): Matrix4 {
    return new Matrix4(this.value);
  }

  diffValue(b: Matrix4): number {
    let m1 = this.value.$matrix;
    let m2 = b.$matrix;

    let diff = 0.0, tot = 0.0;

    for (let k in m1) {
      let a = m1[k], b = m2[k];

      diff += Math.abs(a - b);
      tot += 1.0;
    }

    return tot != 0.0 ? diff / tot : 0.0;
  }

  getValue(): Matrix4 {
    return this.value;
  }

  setValue(val: Matrix4): void {
    this.value.load(val);
  }
}

NodeSocketType.register(Matrix4Socket);

export class DependSocket extends NodeSocketType<boolean> {
  value: boolean;

  static STRUCT = nstructjs.inlineRegister(this, `
  graph.DependSocket {
    value : bool;
  }`);

  constructor(uiname?: string, flag?: number) {
    super(uiname, flag);

    this.value = false;
  }

  addToUpdateHash(digest: util.HashDigest) {
    //digest.add(0);
  }

  static nodedef() {
    return {
      name: "dep",
      uiname: "Dependency",
      color: [0.0, 0.75, 0.25, 1]
    }
  }

  diffValue(b: boolean): number {
    return (Boolean(this.value) !== Boolean(b)) ? 0.001 : 0.0;
  }

  copyValue() {
    return this.value;
  }

  getValue() {
    return this.value;
  }

  setValue(b) {
    this.value = !!b;
  }

  cmpValue(b: boolean): number {
    return Boolean(this.value) === Boolean(b) ? 0 : 1;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = Boolean(this.value);
  }
}

NodeSocketType.register(DependSocket);

export class IntSocket extends NodeSocketType<number> {
  static STRUCT = nstructjs.inlineRegister(this, `
graph.IntSocket {
  value : int;
}`);

  value: number;

  constructor(uiname?: string, flag?: number) {
    super(uiname, flag);

    this.value = 0;
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.int("value", "value", "value").noUnits();

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  static nodedef() {
    return {
      name: "int",
      uiname: "Integer",
      color: [0.0, 0.75, 0.25, 1],
      flag: 0
    }
  }

  diffValue(b: number) {
    return (this.value - b);
  }

  copyValue() {
    return ~~this.value;
  }

  getValue() {
    return ~~this.value;
  }

  setValue(b: number) {
    this.value = ~~b;
  }

  cmpValue(b: number): number {
    return ~~this.value === ~~b ? 0 : 1;
  }

  addToUpdateHash(digest: util.HashDigest) {
    digest.add(this.value);
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = ~~this.value;
  }
}

NodeSocketType.register(IntSocket);

export abstract class VecSocket<ValueType> extends NodeSocketType<ValueType> {
  buildUI(container: Container) {
    if (this.edges.length === 0) {
      container.vecpopup("value");
    } else {
      container.label(this.uiname);
    }
  }
}

export class Vec2Socket extends VecSocket<Vector2> {
  static STRUCT = nstructjs.inlineRegister(this, `
graph.Vec2Socket {
  value : vec2;
}`);

  value: Vector2;

  constructor(uiname?: string, flag?: number, default_value?: Vector2) {
    super(uiname, flag);

    this.value = new Vector2(default_value);
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.vec2('value', 'value', 'value').noUnits();

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  static nodedef() {
    return {
      name: "Vec2",
      uiname: "Vector",
      color: [0.25, 0.45, 1.0, 1],
      flag: 0
    }
  }

  addToUpdateHash(digest: util.HashDigest) {
    digest.add(this.value[0]);
    digest.add(this.value[1]);
  }

  copyTo(b: this) {
    super.copyTo(b);
    b.value.load(this.value);
  }

  diffValue(b: Vector2) {
    return this.value.vectorDistance(b);
  }

  copyValue() {
    return new Vector2(this.value);
  }

  getValue() {
    return this.value;
  }

  setValue(b: Vector2) {
    this.value.load(b);
  }

  //eh. . .dot product?
  cmpValue(b) {
    return this.value.dot(b);
  }
}

NodeSocketType.register(Vec2Socket);

export class Vec3Socket extends VecSocket<Vector3> {
  static STRUCT = nstructjs.inlineRegister(this, `
graph.Vec3Socket {
  value : vec3;
}`);

  value: Vector3;

  constructor(uiname?: string, flag?: number, default_value?: Vector3) {
    super(uiname, flag);

    this.value = new Vector3(default_value);
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.vec3('value', 'value', 'value')
      .uiNameGetter(nodeSocket_api_uiname)

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  static nodedef() {
    return {
      name: "vec3",
      uiname: "Vector",
      color: [0.25, 0.45, 1.0, 1],
      flag: 0
    }
  }

  addToUpdateHash(digest: util.HashDigest): void {
    digest.add(this.value[0]);
    digest.add(this.value[1]);
    digest.add(this.value[2]);
  }

  copyTo(b: this): void {
    super.copyTo(b);

    b.value.load(this.value);
  }

  diffValue(b: Vector3) {
    return this.value.vectorDistance(b);
  }

  copyValue(): Vector3 {
    return new Vector3(this.value);
  }

  getValue(): Vector3 {
    return this.value;
  }

  setValue(b: Vector3): void {
    this.value.load(b);
  }

  //eh. . .dot product?
  cmpValue(b: Vector3): number {
    return this.value.dot(b);
  }
}

NodeSocketType.register(Vec3Socket);

export class Vec4Socket extends NodeSocketType<Vector4> {
  static STRUCT = nstructjs.inlineRegister(this, `
graph.Vec4Socket {
  value : vec4;
}`);

  value: Vector4;

  constructor(uiname?: string, flag?: number, default_value?: Vector4) {
    super(uiname, flag);

    this.value = new Vector4(default_value);
  }

  static nodedef() {
    return {
      name: "vec4",
      uiname: "Vector4",
      color: [0.25, 0.45, 1.0, 1],
      flag: 0
    }
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.vec4('value', 'value', 'value').noUnits();

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  addToUpdateHash(digest: util.HashDigest): void {
    digest.add(this.value[0]);
    digest.add(this.value[1]);
    digest.add(this.value[2]);
    digest.add(this.value[3]);
  }


  diffValue(b: Vector4): number {
    return this.value.vectorDistance(b);
  }

  copyValue(): Vector4 {
    return new Vector4(this.value);
  }

  getValue(): Vector4 {
    return this.value;
  }

  copyTo(b: this) {
    super.copyTo(b);

    b.value.load(this.value);
  }

  setValue(b: Vector4): void {
    if (isNaN(this.value.dot(b))) {
      console.warn(this, b);
      throw new Error("NaN!");
    }
    this.value.load(b);
  }

  //eh. . .dot product?
  cmpValue(b: Vector4) {
    return this.value.dot(b);
  }
}

NodeSocketType.register(Vec4Socket);

export class RGBSocket extends Vec3Socket {
  /* We mostly inherit STRUCT script from Vec3Socket */
  static STRUCT = nstructjs.inlineRegister(this, `
graph.RGBSocket {
}`);

  constructor(uiname?: string, flag?: number, default_value = new Vector3([0.5, 0.5, 0.5])) {
    super(uiname, flag, default_value);
  }

  static nodedef() {
    return {
      name: "rgb",
      uiname: "Color",
      color: [1.0, 0.7, 0.7, 1],
      flag: 0
    }
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct) {
    let def = sockstruct.color3('value', 'value', 'value')
      .uiNameGetter(nodeSocket_api_uiname)

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  buildUI(container: Container, onchange ?: any) {
    if (this.edges.length === 0) {
      container.colorbutton("value");
      /*
      container.button(this.uiname, () => {
        console.log("edit color, yay");

        let colorpicker = container.ctx.screen.popup(container);
        let widget = colorpicker.colorPicker("value");

        widget.onchange = onchange;
      });//*/
    } else {
      container.label(this.uiname);
    }
  }
}

NodeSocketType.register(RGBSocket);

export class RGBASocket extends Vec4Socket {
  /* We mostly inherit STRUCT script from Vec3Socket */
  static STRUCT = nstructjs.inlineRegister(this, `
graph.RGBASocket {
}`);

  constructor(uiname?: string, flag?: number, default_value = new Vector4([0.5, 0.5, 0.5, 1.0])) {
    super(uiname, flag, default_value);
  }

  static nodedef() {
    return {
      name: "rgba",
      uiname: "Color",
      color: [1.0, 0.7, 0.4, 1],
      flag: 0
    }
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.color4('value', 'value', 'value')
      .uiNameGetter(nodeSocket_api_uiname).noUnits();

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  buildUI(container: Container, onchange?: any): void {
    if (this.edges.length === 0) {
      container.colorbutton("value");
      /*
      container.button(this.uiname, () => {
        console.log("edit color, yay");

        let colorpicker = container.ctx.screen.popup(container);
        let widget = colorpicker.colorPicker("value");

        widget.onchange = onchange;
      });//*/
    } else {
      container.label(this.uiname);
    }
  }
}

NodeSocketType.register(RGBASocket);

export class FloatSocket extends NodeSocketType<number> {
  static STRUCT = nstructjs.inlineRegister(this, `
graph.FloatSocket {
  value : float;
}`);

  value: number;

  constructor(uiname?: string, flag?: number, default_value = 0.0) {
    super(uiname, flag);

    this.value = default_value;
  }

  addToUpdateHash(digest: util.HashDigest) {
    digest.add(this.value);
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.float('value', 'value', 'value').noUnits();

    def.on('change', function () {
      this.dataref.graphUpdate(true)
    });
  }

  static nodedef() {
    return {
      name: "float",
      uiname: "Value",
      color: [1.25, 0.45, 1.0, 1],
      flag: 0
    }
  }

  buildUI(container: Container, onchange: (this: GlobalEventHandlers, ev: Event) => any): void {
    if (this.edges.length === 0) {
      let ret = container.prop("value");
      ret.setAttribute("name", this.uiname);

      ret.onchange = onchange;
    } else {
      container.label(this.uiname);
    }
  }

  diffValue(b: number): number {
    return Math.abs(this.value - b);
  }

  copyValue(): number {
    return this.value;
  }

  getValue(): number {
    return this.value;
  }

  setValue(b: number) {
    if (isNaN(b)) {
      console.warn(this, b);
      throw new Error("NaN!");
    }

    this.value = b;
  }

  cmpValue(b: number): number {
    return this.value - b;
  }

  copyTo(b: this): void {
    super.copyTo(b);

    b.value = this.value;
  }
}

NodeSocketType.register(FloatSocket);

export class EnumSocket extends IntSocket {
  items: {};
  uimap: {};

  constructor(uiname?: string, items: {} = {}, flag = 0, default_value?: any) {
    super(uiname, flag);

    this.graph_flag |= SocketFlags.INSTANCE_API_DEFINE;

    this.items = {};
    this.value = 0;

    if (items !== undefined) {
      for (let k in items) {
        this.items[k] = items[k];
      }
    }

    if (default_value !== undefined) {
      this.value = default_value;
    }

    this.uimap = {};
    for (let k in this.items) {
      let k2 = k.split("-_ ");
      let uiname = "";

      for (let item of k2) {
        uiname += k[0].toUpperCase() + k.slice(1, k.length).toLowerCase() + " ";
      }

      let v = this.items[k];
      this.uimap[k] = uiname.trim();
    }
  }


  addToUpdateHash(digest: util.HashDigest): void {
    digest.add(this.value);
  }

  apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    let def = sockstruct.enum('value', 'value', this.items, this.uiname).uiNames(this.uimap);
    def.on('change', function () {
      this.dataref.graphUpdate(true);
    });
  }

  addUiItems(items: {}): this {
    for (let k in items) {
      this.uimap[k] = items[k];
    }

    return this
  }

  static nodedef() {
    return {
      name: "enum",
      uiname: "Enumeration",
      graph_flag: SocketFlags.INSTANCE_API_DEFINE,
      color: [0.0, 0.75, 0.25, 1],
      flag: 0,
    }
  }

  diffValue(b: number): number {
    return (this.value - b);
  }

  copyValue(): number {
    return ~~this.value;
  }

  copyTo(b: this) {
    super.copyTo(b);

    b.items = Object.assign({}, this.items);
    b.uimap = Object.assign({}, this.uimap);
  }

  getValue(): number {
    return ~~this.value;
  }

  setValue(b: number): void {
    if (typeof b !== "number" && !b) {
      return;
    }

    if (typeof b === "string") {
      let s = b as unknown as string;
      if (s in this.items) {
        b = this.items[s];
      } else {
        throw new Error("bad enum item" + b);
      }
    }

    this.value = ~~b;
  }

  _saveMap(obj: {}): any[] {
    obj = obj === undefined ? {} : obj;
    let ret = [];

    for (let k in obj) {
      ret.push(new EnumKeyPair(k, obj[k]));
    }

    return ret;
  }

  onFileLoad(socketTemplate: { items: {}, uimap: {} }): void {
    this.items = Object.assign({}, socketTemplate.items);
    this.uimap = Object.assign({}, socketTemplate.uimap);
    //console.log("Enumeration type load!", this.graph_id, this.items);
  }

  _loadMap(obj: any[]): {} {
    if (!obj || !Array.isArray(obj)) {
      return {};
    }

    let ret = {};
    for (let k of obj) {
      ret[k.key] = k.val;
    }

    return ret;
  }

  /*
  get items() {
    return this._items;
  }
  set items(v) {
    console.error(this.graph_id, "items set", v);
    this._items = v;
  }//*/

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);

    //note that onFileLoad overwrites this in
    //most cases
    this.items = this._loadMap(this.items as unknown as any[]);
    this.uimap = this._loadMap(this.uimap as unknown as any[]);

    //force this flag
    this.graph_flag |= SocketFlags.INSTANCE_API_DEFINE;
  }

  cmpValue(b: number): number {
    return ~~this.value === ~~b ? 0 : 1;
  }
}

EnumSocket.STRUCT = nstructjs.inherit(EnumSocket, IntSocket, "graph.EnumSocket") + `
  items : array(EnumKeyPair) | this._saveMap(this.items);
  uimap : array(EnumKeyPair) | this._saveMap(this.uimap);
}
`;
nstructjs.register(EnumSocket);
NodeSocketType.register(EnumSocket);

export class BoolSocket extends NodeSocketType<boolean> {
  value: boolean;

  static STRUCT = nstructjs.inlineRegister(this, `
graph.BoolSocket {
  value : bool;
}`);

  constructor(uiname ?: string, flag = 0) {
    super(uiname, flag);

    this.value = false;
  }

  static apiDefine(api: DataAPI, sockstruct: DataStruct): void {
    sockstruct.bool("value", "value", "value");
  }

  static nodedef() {
    return {
      name: "bool",
      uiname: "Boolean",
      color: [0.0, 0.75, 0.25, 1],
      flag: 0
    }
  }

  addToUpdateHash(digest: util.HashDigest): void {
    digest.add(Number(this.value));
  }

  diffValue(b: boolean) {
    return Boolean(this.value) === Boolean(b) ? 0 : 1;
  }

  copyValue(): boolean {
    return this.value;
  }

  getValue(): boolean {
    return !!this.value;
  }

  setValue(b: boolean): void {
    this.value = !!b;
  }

  cmpValue(b: boolean): number {
    return !!this.value === !!b ? 0 : 1;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = !!this.value;
  }
}

NodeSocketType.register(BoolSocket);
