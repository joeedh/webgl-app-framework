import {CustomDataElem} from "./customdata.js";
import {Vector2} from "../util/vectormath.js";
import {MeshTypes} from "./mesh_base.js";
import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;

export class UVLayerElem extends CustomDataElem {
  constructor() {
    super();

    this.uv = new Vector2();
  }

  setValue(uv) {
    this.uv.load(uv);
  }

  getValue() {
    return this.uv;
  }

  copyTo(b) {
    b.uv.load(this.uv);
  }

  copy() {
    let ret = new UVLayerElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    dest.uv.zero();

    if (datas.length === 0) {
      return;
    }

    for (let i=0; i<datas.length; i++) {
      dest.uv[0] += ws[i]*datas[i].uv[0];
      dest.uv[1] += ws[i]*datas[i].uv[1];
    }
  }

  validate() {
    return true;
  }

  static define() {return {
    elemTypeMask: MeshTypes.LOOP,
    typeName    : "uv",
    uiTypeName  : "UV",
    defaultName : "UV Layer",
    valueSize : 2,
    flag     : 0
  }};
}
UVLayerElem.STRUCT = STRUCT.inherit(UVLayerElem, CustomDataElem, "mesh.UVLayerElem") + `
  uv : vec2;
}
`;
nstructjs.manager.add_class(UVLayerElem);
CustomDataElem.register(UVLayerElem);

export const ORIGINDEX_NONE = -1;

export class OrigIndexElem extends CustomDataElem {
  constructor() {
    super();

    this.i = ORIGINDEX_NONE;
  }

  setValue(i) {
    this.i = i;
  }

  getValue() {
    return this.i;
  }

  copyTo(b) {
    b.i = this.i;
  }

  copy() {
    let ret = new OrigIndexElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, ws, datas) {
    if (datas.length == 0) {
      return;
    }

    dest.i = datas[0].i;
  }

  validate() {
    return true;
  }

  static define() {return {
    elemTypeMask: MeshTypes.VERTEX|MeshTypes.EDGE|MeshTypes.FACE,
    typeName    : "origindex",
    uiTypeName  : "Original Index",
    defaultName : "Original Index",
    valueSize : 1,
    flag     : 0
  }};
}
OrigIndexElem.STRUCT = STRUCT.inherit(OrigIndexElem, CustomDataElem, "mesh.OrigIndexElem") + `
  i : int;
}
`;

nstructjs.manager.add_class(OrigIndexElem);
CustomDataElem.register(OrigIndexElem);


export class FloatElem extends CustomDataElem {
  constructor() {
    super();

    this.value = new Vector2();
  }

  setValue(f) {
    this.value = f;
  }

  getValue() {
    return this.value;
  }

  copyTo(b) {
    b.value = this.value;
  }

  copy() {
    let ret = new FloatElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    dest.value = 0.0;

    if (datas.length === 0) {
      return;
    }

    for (let i=0; i<datas.length; i++) {
      dest.value += ws[i]*datas[i].value;
    }
  }

  validate() {
    return true;
  }

  static define() {return {
    elemTypeMask: MeshTypes.VERTEX|MeshTypes.EDGE|MeshTypes.LOOP|MeshTypes.HANDLE|MeshTypes.FACE,
    typeName    : "float",
    uiTypeName  : "Float",
    defaultName : "Float Layer",
    valueSize : 1,
    flag     : 0
  }};
}
FloatElem.STRUCT = STRUCT.inherit(FloatElem, CustomDataElem, "mesh.FloatElem") + `
  value : float;
}
`;
nstructjs.manager.add_class(FloatElem);
CustomDataElem.register(FloatElem);


export class IntElem extends CustomDataElem {
  constructor() {
    super();

    this.value = 0;
  }

  setValue(i) {
    this.value = ~~i;
  }

  getValue() {
    return this.value;
  }

  copyTo(b) {
    b.value = ~~this.value;
  }

  copy() {
    let ret = new IntElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    dest.value = 0.0;

    if (datas.length === 0) {
      return;
    }

    for (let i=0; i<datas.length; i++) {
      dest.value += ws[i]*datas[i].value;
    }

    dest.value = ~~(dest.value + 0.5); //round?
  }

  validate() {
    return true;
  }

  static define() {return {
    elemTypeMask: MeshTypes.VERTEX|MeshTypes.EDGE|MeshTypes.LOOP|MeshTypes.HANDLE|MeshTypes.FACE,
    typeName    : "int",
    uiTypeName  : "Int",
    defaultName : "Int Layer",
    valueSize : 1,
    flag     : 0
  }};
}
IntElem.STRUCT = STRUCT.inherit(IntElem, CustomDataElem, "mesh.IntElem") + `
  value : int;
}
`;
nstructjs.manager.add_class(IntElem);
CustomDataElem.register(IntElem);


export class NormalLayerElem extends CustomDataElem {
  constructor() {
    super();

    this.no = new Vector3();
  }

  setValue(n) {
    this.no.load(n);
  }

  getValue(n) {
    return this.no;
  }

  copyTo(b) {
    b.no.load(this.no);
  }

  copy() {
    let ret = new NormalLayerElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    dest.no.zero();

    if (datas.length === 0) {
      return;
    }

    for (let i=0; i<datas.length; i++) {
      dest.no[0] += ws[i]*datas[i].no[0];
      dest.no[1] += ws[i]*datas[i].no[1];
      dest.no[2] += ws[i]*datas[i].no[2];
    }

    dest.no.normalize();
  }

  validate() {
    return true;
  }

  static define() {return {
    elemTypeMask: MeshTypes.LOOP,
    typeName    : "normal",
    uiTypeName  : "Normal",
    defaultName : "Normal Layer",
    valueSize : 3,
    flag     : 0
  }};
}
NormalLayerElem.STRUCT = STRUCT.inherit(NormalLayerElem, CustomDataElem, "mesh.NormalLayerElem") + `
  no : vec3;
}
`;
nstructjs.manager.add_class(NormalLayerElem);
CustomDataElem.register(NormalLayerElem);
