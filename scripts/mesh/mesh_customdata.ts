import {CustomDataElem, ICustomDataElemDef} from "./customdata";
import {MeshTypes} from "./mesh_base";
import '../util/floathalf.js';
import {
  nstructjs, util, Vector2, Vector3, Vector4,
  Quat, Matrix4, DataAPI, DataStruct, Number4
} from '../path.ux/scripts/pathux.js';
import {StructReader} from "../path.ux/scripts/path-controller/types/util/nstructjs";

import {half2float, float2half} from "../util/floathalf";
import type {Element} from "./mesh_types";

export enum UVFlags {
  PIN = 2
}

export class UVLayerElem extends CustomDataElem<Vector2> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.UVLayerElem {
  uv   : vec2;
  flag : byte;
}
`);

  static apiDefine(api, dstruct) {
    dstruct.vec2("uv", "uv", "uv");
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.LOOP,
      typeName: "uv",
      uiTypeName: "UV",
      defaultName: "UV Layer",
      valueSize: 2,
      flag: 0
    }
  };

  uv: Vector2;
  flag: number;

  constructor() {
    super();

    this.uv = new Vector2();
    this.flag = 0;
  }

  clear(): this {
    this.uv.zero();
    return this;
  }

  setValue(uv: Vector2) {
    this.uv.load(uv);
  }

  add(b: this): this {
    this.uv.add(b.uv);
    return this;
  }

  addFac(b: this, fac: number): this {
    this.uv.addFac(b.uv, fac);
    return this;
  }

  mulScalar(b: number): this {
    this.uv.mulScalar(b);
    return this;
  }

  getValue(): Vector2 {
    return this.uv;
  }

  copyTo(b: this) {
    b.flag = this.flag;
    b.uv.load(this.uv);
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let u = 0, v = 0;

    for (let i = 0; i < datas.length; i++) {
      u += ws[i] * datas[i].uv[0];
      v += ws[i] * datas[i].uv[1];
    }

    this.uv[0] = u;
    this.uv[1] = v;
  }

  validate() {
    return true;
  }
}

CustomDataElem.register(UVLayerElem);

export class Vector2LayerElem extends CustomDataElem<Vector2> {
  value: Vector2;

  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Vector2LayerElem {
  value   : vec2;
}
  `);

  constructor() {
    super();

    this.value = new Vector2();
  }

  static apiDefine(api: DataAPI, dstruct: DataStruct) {
    dstruct.vec2("value", "value", "value");
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.LOOP | MeshTypes.FACE,
      typeName: "vec2",
      uiTypeName: "vec2",
      defaultName: "Vector 2",
      valueSize: 2,
      flag: 0
    }
  };

  clear(): this {
    this.value.zero();
    return this;
  }

  setValue(value: Vector2) {
    this.value.load(value);
  }

  add(b: this): this {
    this.value.add(b.value);
    return this;
  }

  addFac(b: this, fac: number): this {
    this.value.addFac(b.value, fac);
    return this;
  }

  mulScalar(b: number): this {
    this.value.mulScalar(b);
    return this;
  }

  getValue(): Vector2 {
    return this.value;
  }

  copyTo(b: this) {
    b.value.load(this.value);
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let u = 0, v = 0;

    for (let i = 0; i < datas.length; i++) {
      u += ws[i] * datas[i].value[0];
      v += ws[i] * datas[i].value[1];
    }

    this.value[0] = u;
    this.value[1] = v;
  }

  validate(): boolean {
    return true;
  }
}

CustomDataElem.register(Vector2LayerElem);

export const ORIGINDEX_NONE = -1;

export class OrigIndexElem extends CustomDataElem<number> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.OrigIndexElem {
  i : int;
}
  `);

  i: number;

  constructor() {
    super();

    this.i = ORIGINDEX_NONE;
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE,
      typeName: "origindex",
      uiTypeName: "Original Index",
      defaultName: "Original Index",
      valueSize: 1,
      flag: 0
    }
  };

  setValue(i: number) {
    this.i = i;
  }

  getValue(): number {
    return this.i;
  }

  copyTo(b: this) {
    b.i = this.i;
  }

  interp(dest: this, datas: this[], ws: number[]): void {
    if (datas.length === 0) {
      return;
    }

    dest.i = datas[0].i;
  }

  validate(): boolean {
    return true;
  }
}

CustomDataElem.register(OrigIndexElem);

export class FloatElem extends CustomDataElem<number> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.FloatElem {
  value : float;
}`);

  value: number;

  constructor(value = 0.0) {
    super();

    this.value = value;
  }

  add(b: this): this {
    this.value += b.value;
    return this;
  }

  addFac(b: this, fac: number): this {
    this.value += b.value * fac;
    return this;
  }

  clear(): this {
    this.value = 0.0;
    return this;
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.LOOP | MeshTypes.HANDLE | MeshTypes.FACE,
      typeName: "float",
      uiTypeName: "Float",
      defaultName: "Float Layer",
      valueSize: 1,
      flag: 0
    }
  };

  setValue(f: number) {
    this.value = f;
  }

  getValue(): number {
    return this.value;
  }

  copyTo(b: this) {
    b.value = this.value;
  }

  mulScalar(b: number) {
    this.value *= b;
    return this;
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let f = 0.0;

    for (let i = 0; i < datas.length; i++) {
      f += ws[i] * datas[i].value;
    }

    this.value = f;
  }

  validate() {
    return true;
  }
}

CustomDataElem.register(FloatElem);


export class IntElem extends CustomDataElem<number> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.IntElem {
  value : int;
}`);

  value: number;

  constructor() {
    super();

    this.value = 0;
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.LOOP | MeshTypes.HANDLE | MeshTypes.FACE,
      typeName: "int",
      uiTypeName: "Int",
      defaultName: "Int Layer",
      valueSize: 1,
      flag: 0
    }
  };

  setValue(i: number) {
    this.value = ~~i;
  }

  getValue(): number {
    return this.value;
  }

  clear(): this {
    this.value = 0;
    return this;
  }

  copyTo(b: this) {
    b.value = ~~this.value;
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let f = 0;

    for (let i = 0; i < datas.length; i++) {
      f += ws[i] * datas[i].value;
    }

    dest.value = ~~(f + 0.5); //round?
  }

  validate() {
    return true;
  }
}

CustomDataElem.register(IntElem);


export class NormalLayerElem extends CustomDataElem<Vector3> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.NormalLayerElem {
  no : vec3;
}`);

  no: Vector3;

  constructor() {
    super();

    this.no = new Vector3();
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.LOOP,
      typeName: "normal",
      uiTypeName: "Normal",
      defaultName: "Normal Layer",
      valueSize: 3,
      flag: 0
    }
  };

  setValue(n: Vector3): void {
    this.no.load(n);
  }

  getValue(): Vector3 {
    return this.no;
  }

  copyTo(b: this) {
    b.no.load(this.no);
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let nx = 0, ny = 0, nz = 0;

    for (let i = 0; i < datas.length; i++) {
      nx += ws[i] * datas[i].no[0];
      ny += ws[i] * datas[i].no[1];
      nz += ws[i] * datas[i].no[2];
    }

    dest.no[0] = nx;
    dest.no[1] = ny;
    dest.no[2] = nz;

    dest.no.normalize();
  }

  validate() {
    return true;
  }
}

CustomDataElem.register(NormalLayerElem);

export class ColorLayerElem extends CustomDataElem<Vector4> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.ColorLayerElem {
  color : array(e, short) | float2half(e);
}
`);

  color: Vector4;

  constructor() {
    super();

    this.color = new Vector4().addScalar(1.0);
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.LOOP,
      typeName: "color",
      uiTypeName: "Color",
      defaultName: "Color",
      valueSize: 4,
      flag: 0
    }
  };

  clear(): this {
    this.color.zero();
    return this;
  }

  static apiDefine(api: DataAPI, dstruct: DataStruct): void {
    dstruct.color4("color", "color", "Color");
  }

  setValue(color: Vector4): void {
    this.color.load(color);
  }

  getValue(): Vector4 {
    return this.color;
  }

  copyTo(b: this): void {
    b.color.load(this.color);
  }

  add(b: this): this {
    this.color.add(b.color);
    return this;
  }

  addFac(b: this, fac: number): this {
    this.color.addFac(b.color, fac);
    return this;
  }

  mulScalar(b: number): this {
    this.color.mulScalar(b);
    return this;
  }

  interp(dest: this, datas: this[], ws: number[]): void {
    if (datas.length === 0) {
      return;
    }

    let r = 0, g = 0, b = 0, a = 0;

    for (let i = 0; i < datas.length; i++) {
      r += ws[i] * datas[i].color[0];
      g += ws[i] * datas[i].color[1];
      b += ws[i] * datas[i].color[2];
      a += ws[i] * datas[i].color[3];
    }

    dest.color[0] = r;
    dest.color[1] = g;
    dest.color[2] = b;
    dest.color[3] = a;
  }

  validate(): boolean {
    return true;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
    super.loadSTRUCT(reader);

    if ((this.color.constructor as any) === Array) {
      for (let i = 0 as Number4; i < 4; i++) {
        this.color[i] = half2float(this.color[i]);
      }

      this.color = new Vector4(this.color);
    } else {
      //old files
    }

  }
}

CustomDataElem.register(ColorLayerElem);

export class Vector3LayerElem extends CustomDataElem<Vector3> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Vector3LayerElem {
  value : vec3;
}`);

  value: Vector3;

  constructor() {
    super();

    this.value = new Vector3();
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.LOOP,
      typeName: "vec3",
      uiTypeName: "Vector3",
      defaultName: "Coordinates",
      valueSize: 4,
      flag: 0
    }
  };

  setValue(val: Vector3) {
    this.value.load(val);
  }

  getValue(): Vector3 {
    return this.value;
  }

  copyTo(b: this) {
    b.value.load(this.value);
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let x = 0, y = 0, z = 0;

    for (let i = 0; i < datas.length; i++) {
      x += ws[i] * datas[i].value[0];
      y += ws[i] * datas[i].value[1];
      z += ws[i] * datas[i].value[2];
    }

    dest.value[0] = x;
    dest.value[1] = y;
    dest.value[2] = z;
  }

  validate(): boolean {
    return true;
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

CustomDataElem.register(Vector3LayerElem);

export class Vector4LayerElem extends CustomDataElem<Vector4> {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.Vector4LayerElem {
  value : vec4;
}`);

  value: Vector4;

  constructor() {
    super();

    this.value = new Vector4();
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.LOOP,
      typeName: "vec4",
      uiTypeName: "Vector4",
      defaultName: "Coordinates4",
      valueSize: 4,
      flag: 0
    }
  };

  setValue(val: Vector4): void {
    this.value.load(val);
  }

  getValue(): Vector4 {
    return this.value;
  }

  copyTo(b: this) {
    b.value.load(this.value);
  }

  interp(dest: this, datas: this[], ws: number[]) {
    if (datas.length === 0) {
      return;
    }

    let x = 0, y = 0, z = 0;

    for (let i = 0; i < datas.length; i++) {
      x += ws[i] * datas[i].value[0];
      y += ws[i] * datas[i].value[1];
      z += ws[i] * datas[i].value[2];
    }

    dest.value[0] = x;
    dest.value[1] = y;
    dest.value[2] = z;
  }

  validate(): boolean {
    return true;
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

CustomDataElem.register(Vector4LayerElem);

export class MaskElem extends FloatElem {
  static STRUCT = nstructjs.inlineRegister(this, `
mesh.MaskElem {
}
  `);

  constructor() {
    super(1.0);
  }

  static define(): ICustomDataElemDef {
    return {
      elemTypeMask: MeshTypes.VERTEX,
      typeName: "mask",
      uiTypeName: "Paint Mask",
      defaultName: "Mask Layer",
      valueSize: 1,
      flag: 0
    }
  };
}

CustomDataElem.register(MaskElem);

export {AttrRef} from './customdata';

