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

    if (datas.length == 0) {
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
    //elemSize : 3,
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
    //elemSize : 3,
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
    //elemSize : 3,
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
    //elemSize : 3,
    flag     : 0
  }};
}
IntElem.STRUCT = STRUCT.inherit(IntElem, CustomDataElem, "mesh.IntElem") + `
  value : int;
}
`;
nstructjs.manager.add_class(IntElem);
CustomDataElem.register(IntElem);
