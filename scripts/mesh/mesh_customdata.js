import {CustomDataElem} from "./customdata.js";
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../util/vectormath.js";
import {MeshTypes} from "./mesh_base.js";
import '../path.ux/scripts/util/struct.js';
import '../util/floathalf.js';

let STRUCT = nstructjs.STRUCT;

export const UVFlags = {
  PIN: 2
};

export class UVLayerElem extends CustomDataElem {
  constructor() {
    super();

    this.uv = new Vector2();
    this.flag = 0;
  }

  static apiDefine(api, dstruct) {
    dstruct.vec2("uv", "uv", "uv");
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.LOOP,
      typeName    : "uv",
      uiTypeName  : "UV",
      defaultName : "UV Layer",
      valueSize   : 2,
      flag        : 0
    }
  };

  clear() {
    this.uv.zero();
    return this;
  }

  setValue(uv) {
    this.uv.load(uv);
  }

  add(b) {
    this.uv.add(b.uv);
    return this;
  }

  addFac(b, fac) {
    this.uv.addFac(b.uv, fac);
    return this;
  }

  mulScalar(b) {
    this.uv.mulScalar(b);
    return this;
  }

  getValue() {
    return this.uv;
  }

  copyTo(b) {
    b.flag = this.flag;
    b.uv.load(this.uv);
  }

  copy() {
    let ret = new UVLayerElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    if (datas.length === 0) {
      return;
    }

    let u = 0, v = 0;

    for (let i = 0; i < datas.length; i++) {
      u += ws[i]*datas[i].uv[0];
      v += ws[i]*datas[i].uv[1];
    }

    this.uv[0] = u;
    this.uv[1] = v;
  }

  validate() {
    return true;
  }
}

UVLayerElem.STRUCT = STRUCT.inherit(UVLayerElem, CustomDataElem, "mesh.UVLayerElem") + `
  uv   : vec2;
  flag : byte;
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

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE,
      typeName    : "origindex",
      uiTypeName  : "Original Index",
      defaultName : "Original Index",
      valueSize   : 1,
      flag        : 0
    }
  };

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

  interp(dest, datas, ws) {
    if (datas.length === 0) {
      return;
    }

    dest.i = datas[0].i;
  }

  validate() {
    return true;
  }
}

OrigIndexElem.STRUCT = STRUCT.inherit(OrigIndexElem, CustomDataElem, "mesh.OrigIndexElem") + `
  i : int;
}
`;

nstructjs.manager.add_class(OrigIndexElem);
CustomDataElem.register(OrigIndexElem);


export class FloatElem extends CustomDataElem {
  constructor(value = 0.0) {
    super();

    this.value = value;
  }

  add(b) {
    this.value += b;
    return this;
  }

  addFac(b, fac) {
    this.value += b*fac;
    return this;
  }

  clear() {
    this.value = 0.0;
    return this;
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.LOOP | MeshTypes.HANDLE | MeshTypes.FACE,
      typeName    : "float",
      uiTypeName  : "Float",
      defaultName : "Float Layer",
      valueSize   : 1,
      flag        : 0
    }
  };

  setValue(f) {
    this.value = f;
  }

  getValue() {
    return this.value;
  }

  copyTo(b) {
    b.value = this.value;
  }

  mulScalar(b) {
    this.value *= b;
    return this;
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    if (datas.length === 0) {
      return;
    }

    let f = 0.0;

    for (let i = 0; i < datas.length; i++) {
      f += ws[i]*datas[i].value;
    }

    this.value = f;
  }

  validate() {
    return true;
  }
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

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.LOOP | MeshTypes.HANDLE | MeshTypes.FACE,
      typeName    : "int",
      uiTypeName  : "Int",
      defaultName : "Int Layer",
      valueSize   : 1,
      flag        : 0
    }
  };

  setValue(i) {
    this.value = ~~i;
  }

  getValue() {
    return this.value;
  }

  clear() {
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
    if (datas.length === 0) {
      return;
    }

    let f = 0;

    for (let i = 0; i < datas.length; i++) {
      f += ws[i]*datas[i].value;
    }

    dest.value = ~~(f + 0.5); //round?
  }

  validate() {
    return true;
  }
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

  static define() {
    return {
      elemTypeMask: MeshTypes.LOOP,
      typeName    : "normal",
      uiTypeName  : "Normal",
      defaultName : "Normal Layer",
      valueSize   : 3,
      flag        : 0
    }
  };

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
    if (datas.length === 0) {
      return;
    }

    let nx = 0, ny = 0, nz = 0;

    for (let i = 0; i < datas.length; i++) {
      nx += ws[i]*datas[i].no[0];
      ny += ws[i]*datas[i].no[1];
      nz += ws[i]*datas[i].no[2];
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

NormalLayerElem.STRUCT = STRUCT.inherit(NormalLayerElem, CustomDataElem, "mesh.NormalLayerElem") + `
  no : vec3;
}
`;
nstructjs.manager.add_class(NormalLayerElem);
CustomDataElem.register(NormalLayerElem);

export class ColorLayerElem extends CustomDataElem {
  constructor() {
    super();

    this.color = new Vector4([1, 1, 1, 1]);
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.LOOP,
      typeName    : "color",
      uiTypeName  : "Color",
      defaultName : "Color",
      valueSize   : 4,
      flag        : 0
    }
  };

  clear() {
    this.color.zero();
    return this;
  }

  apiDefine(api, dstruct) {
    dstruct.color4("color", "color", "Color");
  }

  setValue(uv) {
    this.color.load(uv);
  }

  getValue() {
    return this.color;
  }

  copyTo(b) {
    b.color.load(this.color);
  }

  add(b) {
    this.color.add(b.color);
    return this;
  }

  addFac(b, fac) {
    this.color.addFac(b.color, fac);
    return this;
  }

  mulScalar(b) {
    this.color.mulScalar(b);
    return this;
  }

  copy() {
    let ret = new ColorLayerElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    if (datas.length === 0) {
      return;
    }

    let r = 0, g = 0, b = 0, a = 0;

    for (let i = 0; i < datas.length; i++) {
      r += ws[i]*datas[i].color[0];
      g += ws[i]*datas[i].color[1];
      b += ws[i]*datas[i].color[2];
      a += ws[i]*datas[i].color[3];
    }

    dest.color[0] = r;
    dest.color[1] = g;
    dest.color[2] = b;
    dest.color[3] = a;
  }

  validate() {
    return true;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    if (this.color.constructor === Array) {
      for (let i = 0; i < 4; i++) {
        this.color[i] = half2float(this.color[i]);
      }

      this.color = new Vector4(this.color);
    } else {
      //old files
    }

  }
}

ColorLayerElem.STRUCT = STRUCT.inherit(ColorLayerElem, CustomDataElem, "mesh.ColorLayerElem") + `
  color : array(e, short) | float2half(e);
}
`;
nstructjs.manager.add_class(ColorLayerElem);
CustomDataElem.register(ColorLayerElem);


export class Vector3LayerElem extends CustomDataElem {
  constructor() {
    super();

    this.value = new Vector3();
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX | MeshTypes.LOOP,
      typeName    : "vec3",
      uiTypeName  : "Vector3",
      defaultName : "Coordinates",
      valueSize   : 4,
      flag        : 0
    }
  };

  setValue(val) {
    this.value.load(val);
  }

  getValue() {
    return this.value;
  }

  copyTo(b) {
    b.value.load(this.value);
  }

  copy() {
    let ret = new Vector3LayerElem();
    this.copyTo(ret);
    return ret;
  }

  interp(dest, datas, ws) {
    if (datas.length === 0) {
      return;
    }

    let x = 0, y = 0, z = 0;

    for (let i = 0; i < datas.length; i++) {
      x += ws[i]*datas[i].value[0];
      y += ws[i]*datas[i].value[1];
      z += ws[i]*datas[i].value[2];
    }

    dest.value[0] = x;
    dest.value[1] = y;
    dest.value[2] = z;
  }

  validate() {
    return true;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}

Vector3LayerElem.STRUCT = STRUCT.inherit(Vector3LayerElem, CustomDataElem, "mesh.Vector3LayerElem") + `
  value : vec3;
}
`;
nstructjs.manager.add_class(Vector3LayerElem);
CustomDataElem.register(Vector3LayerElem);

export class MaskElem extends FloatElem {
  constructor() {
    super(1.0);
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.VERTEX,
      typeName    : "mask",
      uiTypeName  : "Paint Mask",
      defaultName : "Mask Layer",
      valueSize   : 1,
      flag        : 0
    }
  };
}

MaskElem.STRUCT = STRUCT.inherit(MaskElem, FloatElem, "mesh.MaskElem") + `
}
`;
nstructjs.manager.add_class(MaskElem);
CustomDataElem.register(MaskElem);
