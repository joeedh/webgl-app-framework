import * as util from '../util/util.js';

export const AttrTypes = {
  FLOAT32: 1,
  FLOAT64: 2,
  INT32  : 4,
  INT16  : 8,
  INT8   : 16,
  UINT32 : 32,
  UINT16 : 64,
  UINT8  : 128
}

export const AttrSizes = {
  [AttrTypes.FLOAT32] : 4,
  [AttrTypes.FLOAT64] : 8,
  [AttrTypes.INT32] : 4,
  [AttrTypes.INT16] : 2,
  [AttrTypes.INT8] : 1,
  [AttrTypes.UINT32] : 4,
  [AttrTypes.UINT16] : 2,
  [AttrTypes.UINT8] : 1
};

export const AttrTypeClasses = {
  [AttrTypes.FLOAT32] : Float32Array,
  [AttrTypes.FLOAT64] : Float64Array,
  [AttrTypes.INT32] : Int32Array,
  [AttrTypes.INT16] : Int16Array,
  [AttrTypes.INT8] : Int8Array,
  [AttrTypes.UINT32] : Uint32Array,
  [AttrTypes.UINT16] : Uint16Array,
  [AttrTypes.UINT8] : Uint8Array
};

export const AttrFlags = {

};

export const arrayPool = new util.ArrayPool();

export const AttrClasses = [];

export class GeoAttr {
  constructor() {

  }

  static attrDefine() {
    return {
      typeName: "",
      uiName  : "",
      dataType : 0,//see AttrTypes
      dataCount: 0, //number of data entries per element
      flag : 0
    }
  }

  //used to e.g. bind float3 into individual vector3's
  static bind(array) {
    return array;
  }

  static _getAttrDef() {
    if (!this._attrDef) {
      this._attrDef = this.attrDefine();
    }

    return this._attrDef;
  }

  static interp(array, desti, sources, ws) {
    let def = this._getAttrDef();

    let count = def.dataCount;
    let tmp = arrayPool.get(sources.length*count);

    for (let i=0; i<tmp.length; i++) {
      tmp[i] = 0.0;
    }

    for (let i=0; i<sources.length; i++) {
      let si = sources[i]*count;
      let w = ws[i];

      for (let j=0; j<count; j++) {
        tmp[i] += array[si+j]*w;
      }
    }

    let ai = desti*count;

    for (let i=0; i<count; i++) {
      array[ai+i] = tmp[i];
    }
  }

  static copyTo(array, desti, srci) {
    let def = this._getAttrDef();
    let count = def.dataCount;

    desti *= count;
    srci *= count;

    for (let i=0; i<count; i++) {
      array[desti+i] = array[srci+i];
    }
  }

  static getClass(typeName) {
    for (let cls of AttrClasses) {
      if (cls._getAttrDef().typeName === typeName) {
        return cls;
      }
    }
  }

  static register(cls) {
    if (AttrClasses.indexOf(cls) >= 0) {
      throw new Error("cls is already registered");
    }

    if (!cls.hasOwnProperty("attrDefine") || cls.attrDefine === GeoAttr.attrDefine) {
      throw new Error("missing attrDefine method");
    }

    let def = cls._getAttrDef();

    if (!def.dataType) {
      throw new Error("missing dataType in attrDefine");
    }
    if (!def.dataCount) {
      throw new Error("missing dataCount in attrDefine");
    }

    AttrClasses.push(cls);
  }
}

import {F32BaseVector} from '../path.ux/pathux.js';

export class BoundVector3 extends F32BaseVector {
  constructor(buf, byteOffset) {
    super(buf, byteOffset, 3);
  }

  load(b) {
    this[0] = b[0];
    this[1] = b[1];
    this[2] = b[2];
    return this;
  }

  loadXYZ(x, y, z) {
    this[0] = x;
    this[1] = y;
    this[2] = z;
    return this;
  }

  dot(b) {
    return this[0]*b[0] + this[1]*b[1] + this[2]*b[2];
  }

  multVecMatrix(matrix, ignore_w) {
    if (ignore_w === undefined) {
      ignore_w = false;
    }
    var x = this[0];
    var y = this[1];
    var z = this[2];
    this[0] = matrix.$matrix.m41 + x*matrix.$matrix.m11 + y*matrix.$matrix.m21 + z*matrix.$matrix.m31;
    this[1] = matrix.$matrix.m42 + x*matrix.$matrix.m12 + y*matrix.$matrix.m22 + z*matrix.$matrix.m32;
    this[2] = matrix.$matrix.m43 + x*matrix.$matrix.m13 + y*matrix.$matrix.m23 + z*matrix.$matrix.m33;
    var w = matrix.$matrix.m44 + x*matrix.$matrix.m14 + y*matrix.$matrix.m24 + z*matrix.$matrix.m34;

    if (!ignore_w && w !== 1 && w !== 0 && matrix.isPersp) {
      this[0] /= w;
      this[1] /= w;
      this[2] /= w;
    }
    return w;
  }

  cross(v) {
    var x = this[1]*v[2] - this[2]*v[1];
    var y = this[2]*v[0] - this[0]*v[2];
    var z = this[0]*v[1] - this[1]*v[0];

    this[0] = x;
    this[1] = y;
    this[2] = z;

    return this;
  }

  //axis is optional, 0
  rot2d(A, axis) {
    var x = this[0];
    var y = this[1];

    if (axis === 1) {
      this[0] = x*cos(A) + y*sin(A);
      this[1] = y*cos(A) - x*sin(A);
    } else {
      this[0] = x*cos(A) - y*sin(A);
      this[1] = y*cos(A) + x*sin(A);
    }

    return this;
  }
}
F32BaseVector.inherit(BoundVector3, 3);

export class Float3Attr extends GeoAttr {
  static attrDefine() {return {
    typeName : "float3",
    dataType : AttrTypes.FLOAT32,
    dataCount : 3
  }}

  static bind(array) {
    let ret = [];

    for (let i=0; i<array.length; i += 3) {
      ret.push(new BoundVector3(array.buffer, i*4));
    }

    return ret;
  }
}
GeoAttr.register(Float3Attr);

export class Uint8Attr extends GeoAttr {
  static attrDefine() {return {
    typeName : "byte",
    dataType : AttrTypes.UINT8,
    dataCount : 1
  }}
}
GeoAttr.register(Uint8Attr);

export class Int32Attr extends GeoAttr {
  static attrDefine() {return {
    typeName : "int32",
    dataType : AttrTypes.INT32,
    dataCount : 1
  }}
}
GeoAttr.register(Int32Attr);
