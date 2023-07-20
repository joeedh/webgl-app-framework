import {CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs, util} from '../path.ux/scripts/pathux.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';

export class DFieldSettings extends LayerSettingsBase {
  constructor() {
    super();
  }

  copyTo(b) {

  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    return st;
  }
}

DFieldSettings.STRUCT = nstructjs.inherit(DFieldSettings, LayerSettingsBase) + `
}`;
nstructjs.register(DFieldSettings);

let interp_v1 = new Vector3();
let interp_v2 = new Vector3();
let interp_v3 = new Vector3();
let interp_v4 = new Vector3();
let interp_v5 = new Vector3();
let interp_v6 = new Vector3();
let interp_v7 = new Vector3();

export const DFieldFlags = {
  SINGULARITY : 1
};

export class DFieldElem extends CustomDataElem {
  constructor() {
    super();

    this.vec = new Vector3();
    this.flag = 0;
  }

  copyTo(b) {
    b.vec.load(this.vec);
    b.flag = this.flag & ~DFieldFlags.SINGULARITY;
  }

  interp(dst, srcs, ws) {
    let vec = interp_v1.zero();

    for (let i=0; i<srcs.length; i++) {
      if (i === 0) {
        dst.flag = srcs[i].flag & ~DFieldFlags.SINGULARITY;
      }

      vec.addFac(srcs[i].vec, ws[i]);
    }

    dst.vec.load(vec);
  }

  calcMemSize() {
    return 3*8;
  }

  getValue() {
    return this.vec;
  }

  setValue(vec) {
    this.vec.load(vec);
    return this;
  }

  clear() {
    this.vec.zero();
    return this;
  }

  hash() {
    return super.hash();
  }

  mulScalar(b) {
    this.vec.mulScalar(b);
    return this;
  }

  add(b) {
    this.vec.add(b);
    return this;
  }

  addFac(b, f) {
    this.vec.addFac(b, f);
    return this;
  }

  sub(b) {
    this.vec.sub(b);
    return this;
  }

  static define() {
    return {
      typeName     : "dfield",
      uiTypeName   : "dfield",
      defaultName  : "dfield",
      valueSize    : 3,
      settingsClass: DFieldSettings
    }
  }
}
DFieldElem.STRUCT = nstructjs.inherit(DFieldElem, CustomDataElem) + `
  flag               : int;
  vec                : vec3;
}`;
nstructjs.register(DFieldElem);
CustomDataElem.register(DFieldElem);

export function getCDFieldOffsets(mesh) {
  let cd_vfield = mesh.verts.customData.getLayerIndex("dfield");
  if (cd_vfield < 0) {
    cd_vfield = mesh.verts.addCustomDataLayer("dfield").index;
  }

  let cd_efield = mesh.verts.customData.getLayerIndex("dfield");
  if (cd_efield < 0) {
    cd_efield = mesh.verts.addCustomDataLayer("dfield").index;
  }

  let cd_ffield = mesh.verts.customData.getLayerIndex("dfield");
  if (cd_ffield < 0) {
    cd_ffield = mesh.verts.addCustomDataLayer("dfield").index;
  }

  return {cd_vfield, cd_efield, cd_ffield};
}

export function makeDField(mesh, fs=mesh.faces) {
  let vs = new Set();
  let es = new Set();
  fs = new Set(fs);

  for (let f of fs) {
    for (let l of f.loops) {
      es.add(l.e);
      vs.add(l.v);
    }
  }

  let {cd_vfield, cd_efield, cd_ffield} = getCDFieldOffsets(mesh);
  for (let f of fs) {

  }
}
