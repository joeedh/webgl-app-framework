import {CDFlags, LayerSettingsBase} from './customdata.js';
import {nstructjs, util, math} from '../path.ux/scripts/pathux.js';
import {CustomDataElem} from './customdata.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';

let Queue = util.Queue;
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {buildCotanVerts, getCotanData, VAREA, VCTAN1, VCTAN2, VW, VETOT} from './mesh_utils.js';
import {paramizeMesh, ParamizeModes} from './mesh_paramizer.js';

export const DispSpace = {
  WORLD  : 0,
  TANGENT: 1
}

export const DispLayerFlags = {
  ENABLED    : 1,
  NEEDS_INIT : 2
};

export class DispLayerSettings extends LayerSettingsBase {
  constructor() {
    super();

    this.dispSpace = DispSpace.TANGENT;
    this.base = 0;
    this.flag = DispLayerFlags.ENABLED | DispLayerFlags.NEEDS_INIT;

    this._updateGen = 0;
    this.lastUpdateGen = -1;
  }

  set updateGen(v) {
    console.warn("set updateGen", v);
    this._updateGen = v;
  }

  get updateGen() {
    return this._updateGen;
  }

  flagUpdate() {
    this.updateGen++;
    return this;
  }

  copyTo(b) {
    b.dispSpace = this.dispSpace;
    b.base = this.base;
    b.flag = this.flag;
    b.updateGen = this.updateGen;
    b.lastUpdateGen = this.lastUpdateGen;
  }
}

DispLayerSettings.STRUCT = nstructjs.inherit(DispLayerSettings, LayerSettingsBase) + `
  dispSpace     : int;
  base          : int;
  flag          : int;
  updateGen     : int;
  lastUpdateGen : int;
}`;
nstructjs.register(DispLayerSettings);

export const DispVertFlags = {
  SELECT    : 1,
  HIDE      : 2,
  NEEDS_INIT: 4,
  UPDATE    : 8
};

const itmp1 = new Vector3();
const itmp2 = new Vector3();
const itmp3 = new Vector3();
const itmp4 = new Vector3();
const itmp5 = new Vector3();
const itmp6 = new Vector3();
const itmp7 = new Vector3();
const itmp8 = new Vector3();

const mtmp1 = new Vector3();

const mat_temps = util.cachering.fromConstructor(Matrix4, 512);

export class DispLayerVert extends CustomDataElem {
  constructor() {
    super();

    this.baseco = new Vector3();
    this._worldco = new Vector3(); //world
    this.worldco = this._worldco;

    this.tanco = new Vector3(); //tangent
    this.parentTan = new Vector3();
    this.parentNo = new Vector3();

    this.no = new Vector3();
    this.tan = new Vector3();

    this.flag = DispVertFlags.NEEDS_INIT | DispVertFlags.UPDATE;
  }

  static define() {
    return {
      elemTypeMask : MeshTypes.VERTEX | MeshTypes.HANDLE,
      typeName     : "displace",
      uiTypeName   : "Displacement",
      defaultName  : "Disp Layer",
      valueSize    : 3,
      flag         : 0,
      settingsClass: DispLayerSettings
    }
  }

  static apiDefine(api, st) {
    return st;
  }

  updateWorldCo(owning_v, cd_disp, settings, cd_pvert, pvert_settings) {
    let tanmat = this.getTanMatrix(...arguments);

    if (Math.random() > 0.99) {
      console.warn(tanmat);
    }

    this.worldco.load(this.tanco).multVecMatrix(tanmat);
  }

  updateTanCo(owning_v, cd_disp, settings, cd_pvert, pvert_settings) {
    let tanmat = this.getTanMatrix(...arguments);
    tanmat.invert();

    this.tanco.load(this.worldco).multVecMatrix(tanmat);
  }

  getTanMatrix(owning_v, cd_disp, settings, cd_pvert, pvert_settings) {
    let mat = mat_temps.next();

    let m = mat.$matrix;
    let co = this.baseco, no = this.parentNo, tan = this.parentTan;

    m.m11 = tan[0];
    m.m21 = tan[1];
    m.m31 = tan[2];
    m.m41 = 0;

    let bin = mtmp1.load(tan).cross(no);
    bin.normalize();

    m.m12 = bin[0];
    m.m22 = bin[1];
    m.m32 = bin[2];
    m.m42 = 0;

    m.m13 = no[0];
    m.m23 = no[1];
    m.m33 = no[2];
    m.m43 = 0;

    m.m41 = co[0];
    m.m42 = co[1];
    m.m43 = co[2];
    m.m44 = 1.0;

    return mat;
  }

  calcMemSize() {
    return 3*3*4;
  }

  getValue() {
    return this.worldco;
  }

  setValue(v) {
    this.worldco.load(v);
  }

  clear() {
    this.worldco.zero();
    return this;
  }

  hash(snapLimit = 0.0001) {
    let x = 0;

    for (let i = 0; i < 3; i++) {
      x ^= (this.worldco[i]*1024*32);
      x ^= (this.tan[i]*3024*32);
      x ^= (this.no[i]*2024*32);
      x ^= (this.parentNo[i]*23432);
      x ^= (this.parentTan[i]*20234);
    }

    return x;
  }

  copyTo(b) {
    b.worldco.load(this.worldco);
    b.tanco.load(this.tanco);
    b.tan.load(this.tan);
    b.no.load(this.no);
    b.parentNo.load(this.parentNo);
    b.flag = this.flag;
    b.parentTan.load(this.parentTan);
  }

  interp(dest, srcs, ws) {
    let co = itmp1.zero();
    let no = itmp2.zero();
    let tan = itmp3.zero();
    let co2 = itmp4.zero();
    let pt = itmp5.zero();
    let pn = itmp6.zero();

    for (let i=0; i<srcs.length; i++) {
      if (i === 0) {
        this.flag = srcs[0].flag;
      }

      let w = ws[i];

      co.addFac(srcs[i].worldco, w);
      co2.addFac(srcs[i].tanco, w);
      no.addFac(srcs[i].no, w);
      tan.addFac(srcs[i].tan, w);
      pn.addFac(srcs[i].parentNo, w);
      pt.addFac(srcs[i].parentTan, w);
    }

    no.normalize();
    tan.addFac(no, -tan.dot(no));
    tan.normalize();

    this.parentTan.load(pt);
    this.worldco.load(co);
    this.tanco.load(co2);
    this.tan.load(tan);
    this.no.load(no);
    this.parentNo.load(pn);
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.worldco = this._worldco;
  }
}

DispLayerVert.STRUCT = nstructjs.inherit(DispLayerVert, CustomDataElem) + `
  flag     : int;
  _worldco : vec3;
  tanco    : vec3;
  baseco   : vec3;
  no       : vec3;
  tan      : vec3;
  parentTan: vec3;
  parentNo : vec3;
}`;
nstructjs.register(DispLayerVert);
CustomDataElem.register(DispLayerVert);

export function initDispLayers(mesh) {
  if (!(mesh.verts.customData.hasLayer("displace"))) {
    return;
  }

  let cd_pvert = mesh.verts.customData.getNamedLayerIndex("disp_pvert", "paramvert");

  if (cd_pvert < 0) {
    cd_pvert = mesh.verts.addCustomDataLayer("paramvert", "disp_pvert").index;
    paramizeMesh(mesh, cd_pvert, ParamizeModes.MAX_Z);
  }

  //ensure all displacement layers are initialized

  let layerset = mesh.verts.customData.getLayerSet("displace");
  let li = 0;

  let need_normals = true;

  let pvert_settings = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  for (let layer of layerset) {
    let settings = layer.getTypeSettings();
    let cd_disp = layer.index;

    if (settings.flag & DispLayerFlags.NEEDS_INIT) {
      settings.flag &= ~DispLayerFlags.NEEDS_INIT;

      if (need_normals) {
        mesh.recalcNormals();
        need_normals = false;
      }

      settings.flagUpdate();
      settings.base = li ? li - 1 : 0;

      for (let v of mesh.verts) {
        let dv = v.customData[cd_disp];

        //set dv.worldco to v?
        if (layer === layerset[0]) {
          dv._worldco.load(v);
        }

        dv.flag &= ~DispVertFlags.NEEDS_INIT;

        dv.tanco.zero();
        let pv = v.customData[cd_pvert];

        pv.updateTangent(pvert_settings, v, cd_pvert, true);

        dv.tan[0] = pv.disUV[1];
        dv.tan[1] = pv.disUV[2];
        dv.tan[2] = pv.disUV[3];

        dv.parentTan.load(dv.tan);

        dv.parentNo.load(v.no);
        dv.no.load(v.no);
      }
    }

    li++;
  }
}

export function checkDispLayers(mesh) {
  return initDispLayers(mesh);
}

export function updateDispLayers(mesh, activeLayerIndex=undefined) {
  if (!mesh.verts.customData.hasLayer("displace")) {
    return;
  }

  if (activeLayerIndex === undefined) {
    activeLayerIndex = mesh.verts.customData.getLayerIndex("displace");
  }

  let cd_pvert = mesh.verts.customData.getNamedLayerIndex("disp_pvert", "paramvert");
  let pvert_settings = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  let layers = mesh.verts.customData.getLayerSet("displace");
  let actlayer = undefined;

  let cd_baselayer = layers[0].index;

  if (activeLayerIndex === undefined) {
    actlayer = layers.active;
  } else {
    actlayer = mesh.verts.customData.flatlist[activeLayerIndex];
  }

  let idx = layers.indexOf(actlayer);
  if (idx !== mesh.lastDispActive && mesh.lastDispActive < layers.length) {
    console.error("lastDispActive changed!", idx, mesh.lastDispActive);

    let s1 = actlayer.getTypeSettings();
    let s2 = layers[idx].getTypeSettings();

    let cd_disp1 = actlayer.index;
    let cd_disp2 = layers[mesh.lastDispActive].index;

    for (let v of mesh.verts) {
      let dv1 = v.customData[cd_disp1];
      let dv2 = v.customData[cd_disp2];
      let pv = v.customData[cd_pvert];

      pv.updateTangent(pvert_settings, v, cd_pvert, true, cd_disp2);

      dv2.tan[0] = pv.disUV[1];
      dv2.tan[1] = pv.disUV[2];
      dv2.tan[2] = pv.disUV[3];
      dv2.no.load(v.no);

      v.flag |= MeshFlags.UPDATE;

      if (cd_disp2 !== cd_baselayer) {
        dv2.worldco = v;
        dv2.updateTanCo(v, cd_disp2, s2, cd_pvert, pvert_settings);

        //if (dv2.tanco.vectorLength() > 0.0) {
        if (Math.random() > 0.97) {
          console.log(dv2.tanco.vectorLength());
        }
        //}
      } else {
        dv2.worldco.load(v);
      }

      dv2._worldco.load(dv2.worldco);
      dv2.worldco = dv2._worldco;

      if (cd_disp1 !== cd_baselayer) {
        dv1.worldco = v;
        let cd_parent = layers[s1.base].index;
        let dvbase = v.customData[cd_parent];

        dv1.baseco.load(dvbase.worldco);
        dv1.parentTan.load(dvbase.tan);
        dv1.parentNo.load(dvbase.no);

        //if (s1.dispSpace === DispSpace.TANGENT) {
          dv1.updateWorldCo(v, cd_disp1, s1, cd_pvert, pvert_settings);
        //}
      } else {
        dv1.worldCo = v;
        v.load(dv1._worldco);
      }
    }

    //s1.updateGen++;
    //s2.updateGen++;

    s1.dispSpace = DispSpace.WORLD;
    s2.dispSpace = DispSpace.TANGENT;
    mesh.lastDispActive = idx;

    mesh.regenRender();
    mesh.regenBVH();
    mesh.recalcNormals();
  }

  let update = false;

  for (let layer of layers) {
    let cd_disp = layer.index;
    let settings = layer.getTypeSettings();

    if (cd_disp === cd_baselayer) {
      continue;
    }

    if (settings.updateGen !== settings.lastUpdateGen) {
      update = true;

      /*
      for (let v of mesh.verts) {
        if (settings.dispSpace === DispSpace.TANGENT) {
          v.customData[cd_disp].updateWorldCo(v, cd_disp, settings, cd_pvert, pvert_settings);
        } else {
          v.customData[cd_disp].updateTanCo(v, cd_disp, settings, cd_pvert, pvert_settings);
        }
      }*/
    }
  }


  if (!update) {
    return;
  }

  let li = 0;
  for (let layer of layers) {
    let cd_disp = layer.index;
    let settings = layer.getTypeSettings();

    settings.lastUpdateGen = settings.updateGen;

    for (let v of mesh.verts) {
      let pv = v.customData[cd_pvert];
      let dv = v.customData[cd_disp];
      let dvbase = v.customData[layers[settings.base].index];

      if (li > 0) {
        dv.baseco = dvbase._worldco; //.load(dvbase.worldco);
        dv.parentTan[0] = pv.disUV[1];
        dv.parentTan[1] = pv.disUV[2];
        dv.parentTan[2] = pv.disUV[3];
        dv.parentNo.load(v.no);
      }
    }

    mesh.recalcNormals(cd_disp);

    for (let v of mesh.verts) {
      let pv = v.customData[cd_pvert];
      let dv = v.customData[cd_disp];

      pv.updateTangent(pvert_settings, v, cd_pvert, true, cd_disp);

      dv.tan[0] = pv.disUV[1];
      dv.tan[1] = pv.disUV[2];
      dv.tan[2] = pv.disUV[3];

      dv.no.load(v.no);
    }

    li++;
  }

  for (let layer of layers) {
    let cd_disp = layer.index;
    let settings = layer.getTypeSettings();

    settings.lastUpdateGen = settings.updateGen;
  }
}
