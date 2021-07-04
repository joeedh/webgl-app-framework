/*
How sculpt layers work:

Sculpt layers are stored in tangent space (except for the first one,
which is the base layer).  This tangent space
is generated from a geodesic distance field that's propegated over the mesh
when the first layer is created.

Each layer calculates its tangent space from the smoothed coordinates of the
prior layer.  The tangents are calculated from derivatives using the geodesic
distance layer (which is not smoothed) and the smoothed coordinates.

In addition, a simple uniform scale is derived per-vertex by averaging the edge
lengths using the same smoothed coordinates.
*/

import {CDFlags, LayerSettingsBase} from './customdata.js';
import {nstructjs, util, math} from '../path.ux/scripts/pathux.js';
import {CustomDataElem} from './customdata.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';

let Queue = util.Queue;
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {buildCotanVerts, getCotanData, VAREA, VCTAN1, VCTAN2, VW, VETOT} from './mesh_utils.js';
import {paramizeMesh, ParamizeModes} from './mesh_paramizer.js';


function smoothno(v, dv) {
  dv.no.load(v.no);
  for (let v2 of v.neighbors) {
    dv.no.load(v.no);
  }

  dv.no.normalize();
}

function getscale(v, dv, cd_disp) {
  let scale = 0.0;
  let tot = 0.0;
  for (let v2 of v.neighbors) {
    let dv2 = v2.customData[cd_disp];

    scale += dv2.smoothco.vectorDistance(dv.smoothco);
    tot++;
  }

  if (tot) {
    return Math.max(scale/tot, 0.00001);
  } else {
    return 1.0;
  }
}

/*
on factor;
off period;
*/

export class SmoothMemoizer {
  constructor(mesh, cd_disp) {
    this.smoothGen = 0;
    this.initGen = 0;

    this.cd_disp = cd_disp;
    this.cd_temps = [];

    this.tempKey = "__temp_sm";

    this.mesh = mesh;
    this.settings = mesh.verts.customData.flatlist[cd_disp].getTypeSettings();

    this.maxDepth = 3;

    this.tmp1 = new Vector3();
    this.tmp2 = new Vector3();
    this.tmp3 = new Vector3();
    this.tmp4 = new Vector3();
    this.tmp5 = new Vector3();
    this.tmp6 = new Vector3();
    this.mtmp1 = new Matrix4();
    this.mtmp2 = new Matrix4();
    this.mtmp3 = new Matrix4();

    this.vtmps = util.cachering.fromConstructor(Vector3, 5000);

    this.projection = 0.0;
    this.fac = 0.75;

    this.steps = 0;
    this.memoize = true;
  }

  checkTemps() {
    const mesh = this.mesh;

    this.cd_temps.length = 0;
    for (let i = 0; i < 3; i++) {
      let key = this.tempKey + (i + 1);

      let cd_temp = mesh.verts.customData.getNamedLayerIndex(key, "vec3");
      if (cd_temp < 0) {
        let layer = mesh.verts.addCustomDataLayer("vec3", key);

        layer.flag |= CDFlags.TEMPORARY;

        cd_temp = layer.index;
      }

      this.cd_temps.push(cd_temp);
    }

  }

  start(setSmoothGen = true, cd_disp = undefined, checkTemps = true) {
    let mesh = this.mesh;

    if (cd_disp !== undefined) {
      this.cd_disp = cd_disp;
      this.settings = this.mesh.verts.customData.flatlist[cd_disp].getTypeSettings();
    } else {
      cd_disp = this.cd_disp;
    }

    if (checkTemps) {
      let layer = this.mesh.verts.customData.flatlist[cd_disp];
      this.checkTemps();
      cd_disp = this.cd_disp = layer.index;
    }

    if (setSmoothGen) {
      for (let v of mesh.verts) {
        v.customData[cd_disp].smoothGen = this.settings.smoothGen;
        v.customData[cd_disp].initGen = this.settings.initGen;
      }

      this.settings.smoothGen++;
      this.settings.initGen++;
    }

    this.smoothGen = this.settings.smoothGen;
    this.initGen = this.settings.initGen;
  }

  smoothco(v, maxDepth = this.maxDepth, noDisp = false) {
    const cd_disp = this.cd_disp;

    let dv = v.customData[cd_disp];

    const cd_temp = this.cd_temps[0];
    const cd_temp2 = this.cd_temps[1];
    const cd_temp3 = this.cd_temps[2];

    //dv.smoothGen++;

    const co = this.vtmps.next().zero();
    const co2 = this.vtmps.next().zero();

    let tot = 0;
    const projection = this.projection;
    const fac = this.fac;

    //let smask = (1<<30)-1;
    //let smoothGen = dv.smoothGen & ~smask;

    const initGen = this.initGen;

    function checkinit(v, dv, co) {
      if (co === undefined) {
        co = noDisp ? v : v.customData[cd_disp].worldco;
      }

      if (dv.initGen !== initGen) {
        v.customData[cd_temp].value.load(co);
        v.customData[cd_temp2].value.load(co);
        v.customData[cd_temp3].value.load(co);
        dv.initGen = initGen;
      }
    }

    checkinit(v, dv);

    for (let v2 of v.neighbors) {
      if (maxDepth > 1) {
        let dv2 = v2.customData[cd_disp];

        checkinit(v2, dv2);

        if (this.memoize && dv2.smoothGen === this.smoothGen) {
          co2.load(v2.customData[cd_temp3].value);
        } else {

          let tot2 = 0;
          co2.zero();

          for (let v3 of v2.neighbors) {
            let dv3 = v3.customData[cd_disp];
            checkinit(v3, dv3);

            co2.add(v3.customData[cd_temp2].value);
            tot2++;
            this.steps++;
          }

          if (tot2 === 0) {
            continue;
          }

          co2.mulScalar(1.0/tot2);
          co2.interp(v2.customData[cd_temp2].value, 1.0 - fac);
          v2.customData[cd_temp3].value.load(co2);
          dv2.smoothGen = this.smoothGen;
        }

        //v2.customData[

        //co.add(v2.customData[cd_disp].worldco);
        //co.add(v2.customData[cd_temp].value);
        co.add(co2);
      } else {
        co.add(v2.customData[cd_temp2].value);
        this.steps++;
      }

      //co.add(v2);
      tot++;
    }

    if (tot > 0.0) {
      co.mulScalar(1.0/tot);
      v.customData[cd_temp].value.interp(co, maxDepth > 1 ? 1.0 : fac);

      return co;
    } else {
      return v.customData[cd_temp].value;
    }
  }
}

export const DispSpace = {
  WORLD  : 0,
  TANGENT: 1
}

export const DispLayerFlags = {
  ENABLED   : 1,
  NEEDS_INIT: 2
};

export class DispLayerSettings extends LayerSettingsBase {
  constructor() {
    super();

    this.smoothGen = 0;
    this.initGen = 0;

    this.dispSpace = DispSpace.TANGENT;
    this.base = 0;
    this.flag = DispLayerFlags.ENABLED | DispLayerFlags.NEEDS_INIT;

    this._updateGen = 0;
    this.lastUpdateGen = -1;
  }

  get updateGen() {
    return this._updateGen;
  }

  set updateGen(v) {
    console.warn("set updateGen", v);
    this._updateGen = v;
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

export class DispContext {
  constructor() {
    this.reset();
  }

  reset(mesh, cd_disp, cd_pvert) {
    this.owning_v = undefined;
    this.cd_disp = cd_disp;
    this.settings = cd_disp >= 0 ? mesh.verts.customData.flatlist[cd_disp].getTypeSettings() : undefined;

    this.cd_pvert = cd_pvert;
    if (cd_pvert >= 0) {
      this.pvert_settings = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();
    } else {
      this.pvert_settings = undefined;

    }

    this.mesh = mesh;
    this.smemo = undefined;

    return this;
  }
}

let disp_contexts = util.cachering.fromConstructor(DispContext, 32);
let tmptmp = new Vector3();

export class DispLayerVert extends CustomDataElem {
  constructor() {
    super();

    this.baseco = new Vector3();

    this._worldco = new Vector3(); //world
    this.worldco = this._worldco;
    this.smoothco = new Vector3();

    this.tanco = new Vector3(); //tangent

    this.parentTan = new Vector3();
    this.parentNo = new Vector3();
    this.parentScale = 1.0;

    this.tan = new Vector3();
    this.no = new Vector3();
    this.scale = 1.0;

    //used by smooth memoizer
    this.smoothGen = 0;
    this.initGen = 0;

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

  updateWorldCo(dctx) {
    let {owning_v, cd_disp, settings, cd_pvert, pvert_settings} = dctx;

    let tanmat = this.getTanMatrix(dctx);

    if (Math.random() > 0.99) {
      //console.warn(tanmat);
    }

    tmptmp.load(this.tanco).multVecMatrix(tanmat);

    let t = tmptmp.dot(tmptmp);
    if (isNaN(t) || !isFinite(t)) {
      console.warn("NaN!", this.tanco, this);

      t = this.tanco.dot(this.tanco);
      if (isNaN(t) || !isFinite(t)) {
        this.tanco.zero();
      }
    } else {
      this.worldco.load(tmptmp);
    }
  }

  updateTanCo(dctx) {
    let {owning_v, cd_disp, settings, cd_pvert, pvert_settings} = dctx;

    let tanmat = this.getTanMatrix(dctx);
    tanmat.invert();

    tmptmp.load(this.worldco).multVecMatrix(tanmat);
    let t = tmptmp.dot(tmptmp);

    if (isNaN(t) || !isFinite(t)) {
      if (Math.random() > 0.997) {
        console.warn("NaN!", this.worldco, tanmat.toString());
      }
    } else {
      this.tanco.load(tmptmp);
    }
  }

  getTanMatrix(dctx) {
    let {owning_v, cd_disp, settings, cd_pvert, pvert_settings} = dctx;

    let mat = mat_temps.next();

    let m = mat.$matrix;
    let co = this.baseco, no = this.parentNo, tan = this.parentTan;
    let scale = this.parentScale;

    m.m11 = tan[0]*scale;
    m.m21 = tan[1]*scale;
    m.m31 = tan[2]*scale;
    m.m41 = 0;

    let bin = mtmp1.load(tan).cross(no);
    bin.normalize();

    m.m12 = bin[0]*scale;
    m.m22 = bin[1]*scale;
    m.m32 = bin[2]*scale;
    m.m42 = 0;

    m.m13 = no[0]*scale;
    m.m23 = no[1]*scale;
    m.m33 = no[2]*scale;
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
      x ^= (this.parentScale*20234);
      x ^= (this.scale*20234);
    }

    return x;
  }

  copyTo(b) {
    b.flag = this.flag;
    b.worldco.load(this.worldco);
    b.smoothco.load(this.smoothco);

    b.tanco.load(this.tanco);
    b.tan.load(this.tan);
    b.parentTan.load(this.parentTan);

    b.no.load(this.no);
    b.parentNo.load(this.parentNo);

    b.smoothGen = this.smoothGen;
    b.initGen = this.initGen;

    b.parentScale = this.parentScale;
    b.scale = this.scale;
  }

  interp(dest, srcs, ws) {
    let co = itmp1.zero();
    let no = itmp2.zero();
    let tan = itmp3.zero();
    let co2 = itmp4.zero();
    let pt = itmp5.zero();
    let pn = itmp6.zero();
    let sco = itmp7.zero();
    let scale = 0.0;
    let parentScale = 0.0;

    for (let i = 0; i < srcs.length; i++) {
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
      sco.addFac(srcs[i].smoothco, w);

      scale += srcs[i].scale*w;
      parentScale += srcs[i].parentScale*w;
    }

    no.normalize();
    tan.addFac(no, -tan.dot(no));
    tan.normalize();

    this.parentScale = parentScale;
    this.scale = scale;

    this.parentTan.load(pt);
    this.worldco.load(co);
    this.tanco.load(co2);
    this.tan.load(tan);
    this.no.load(no);
    this.smoothco.load(sco);
    this.parentNo.load(pn);

    this.parentNo.normalize();
    this.parentTan.normalize();
    this.tan.normalize();
    this.no.normalize();
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.worldco = this._worldco;
  }
}

DispLayerVert.STRUCT = nstructjs.inherit(DispLayerVert, CustomDataElem) + `
  flag        : int;
  _worldco    : vec3;
  tanco       : vec3;

  no          : vec3;
  tan         : vec3;
  scale       : float;

  baseco      : vec3;
  parentTan   : vec3;
  parentNo    : vec3;
  parentScale : float;

  smoothco    : vec3;
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

  let dctx = disp_contexts.next().reset(mesh, undefined, cd_pvert);

  //ensure all displacement layers are initialized

  let layerset = mesh.verts.customData.getLayerSet("displace");
  let li = 0;

  let need_normals = true;

  let pvert_settings = mesh.verts.customData.flatlist[cd_pvert].getTypeSettings();

  for (let layer of layerset) {
    let settings = layer.getTypeSettings();
    let cd_disp = layer.index;

    dctx.reset(mesh, cd_disp, cd_pvert);

    if (settings.flag & DispLayerFlags.NEEDS_INIT) {
      settings.flag &= ~DispLayerFlags.NEEDS_INIT;

      if (need_normals) {
        mesh.recalcNormals();
        need_normals = false;
      }

      settings.flagUpdate();
      settings.base = li ? li - 1 : 0;

      let smemo;
      if (layer === layerset[0]) {
        settings.smoothGen++;
        settings.initGen++;

        smemo = getSmoothMemo(mesh, cd_disp);
        cd_disp = layer.index; //in case getSmoothMemo modified customdata layout

        for (let v of mesh.verts) {
          let dv = v.customData[cd_disp];

          dv._worldco.load(v);
        }

        for (let v of mesh.verts) {
          let dv = v.customData[cd_disp];
          dv.smoothco.load(smemo.smoothco(v));
        }
      }

      let cd_base = layerset[0].index;

      for (let v of mesh.verts) {
        let dv = v.customData[cd_disp];
        dctx.owning_v = v;

        dv.flag &= ~DispVertFlags.NEEDS_INIT;

        dv.tanco.zero();
        let pv = v.customData[cd_pvert];

        //smooth normals
        dv.no.zero();
        for (let v2 of v.neighbors) {
          dv.no.add(v2.no);
        }
        dv.no.normalize();

        pv.updateTangent(pvert_settings, v, cd_pvert, true, undefined, false);

        dv.tan[0] = pv.disUV[1];
        dv.tan[1] = pv.disUV[2];
        dv.tan[2] = pv.disUV[3];

        dv.scale = getscale(v, dv, cd_disp); //Math.max(dv.tan.vectorLength(), 0.00001);
        //dv.tan.normalize();

        dv.parentTan.load(dv.tan);
        dv.parentNo.load(dv.no);

        let dvbase = v.customData[cd_base];
        if (dvbase !== dv) {
          dv.smoothco.load(dvbase.smoothco);
          //dv.baseco.load(dvbase.smoothco);
          dv.baseco.load(dvbase.worldco);
          dv.parentScale = dvbase.scale;
          dv.parentTan.load(dvbase.parentTan);
          dv.parentNo.load(dvbase.parentNo);
        }
      }
    }

    li++;
  }

  //prevent reference leaks
  dctx.reset();
}

export function checkDispLayers(mesh) {
  return initDispLayers(mesh);
}

export function getSmoothMemo(mesh, cd_disp) {
  if (!mesh.smemo) {
    mesh.smemo = new SmoothMemoizer(mesh, cd_disp);
    mesh.smemo.cd_disp = -1;
  }

  if (mesh.smemo.cd_disp !== cd_disp) {
    mesh.smemo.start(false, cd_disp);
    //cd_disp = mesh.smemo.cd_disp;
  }

  let settings = mesh.smemo.settings;
  mesh.smemo.smoothGen = settings.smoothGen;
  mesh.smemo.initGen = settings.initGen;

  return mesh.smemo;
}

export function updateDispLayers(mesh, activeLayerIndex = undefined) {
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

  let dctx1 = disp_contexts.next().reset();
  let dctx2 = disp_contexts.next().reset();

  let idx = layers.indexOf(actlayer);
  if (idx !== mesh.lastDispActive && mesh.lastDispActive < layers.length) {
    console.error("lastDispActive changed!", idx, mesh.lastDispActive);

    let s1 = actlayer.getTypeSettings();
    let s2 = layers[mesh.lastDispActive].getTypeSettings();

    let next = mesh.lastDispActive + 1;
    if (next >= layers.length) {
      next = undefined;
    }

    //get smoother updater
    s2.smoothGen++;
    s2.initGen++;
    let smemo = getSmoothMemo(mesh, layers[mesh.lastDispActive].index);

    let cd_disp1 = actlayer.index;
    let cd_disp2 = layers[mesh.lastDispActive].index;

    dctx1.reset(mesh, cd_disp1, cd_pvert);
    dctx2.reset(mesh, cd_disp2, cd_pvert);

    for (let v of mesh.verts) {
      dctx1.v = v;
      dctx2.v = v;

      let dv1 = v.customData[cd_disp1];
      let dv2 = v.customData[cd_disp2];
      let pv = v.customData[cd_pvert];

      dv2.smoothco.load(smemo.smoothco(v));
      smoothno(v, dv2);
    }

    for (let v of mesh.verts) {
      dctx1.v = v;
      dctx2.v = v;

      let dv1 = v.customData[cd_disp1];
      let dv2 = v.customData[cd_disp2];
      let pv = v.customData[cd_pvert];

      pv.updateTangent(pvert_settings, v, cd_pvert, true, cd_disp2, false);

      dv2.tan[0] = pv.disUV[1];
      dv2.tan[1] = pv.disUV[2];
      dv2.tan[2] = pv.disUV[3];

      dv2.scale = getscale(v, dv2, cd_disp2);//*Math.max(dv2.tan.vectorLength(), 0.00001);
      //dv2.tan.normalize();

      v.flag |= MeshFlags.UPDATE;

      if (cd_disp2 !== cd_baselayer) {
        dv2.worldco = v;
        dv2.updateTanCo(dctx2);

        //if (dv2.tanco.vectorLength() > 0.0) {
        //if (Math.random() > 0.97) {
        //console.log(dv2.tanco.vectorLength());
        //}
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

        //dv1.baseco.load(dvbase.smoothco);
        dv1.baseco.load(dvbase.worldco);

        dv1.parentTan.load(dvbase.tan);
        dv1.parentNo.load(dvbase.no);
        dv1.parentScale = dvbase.scale;

        //if (s1.dispSpace === DispSpace.TANGENT) {
        dv1.updateWorldCo(dctx1);
        //}
      } else {
        dv1.worldCo = v;

        let t = dv1._worldco.dot(dv1._worldco);
        if (isNaN(t) || !isFinite(t)) {
          console.warn("NaN!", v, dv1);
          dv1._worldco.load(v);
        }

        v.load(dv1._worldco);
      }

      //let dvnext =
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
      dctx1.reset(mesh, cd_disp, cd_pvert);

      for (let v of mesh.verts) {
        dctx1.v = v;
        if (settings.dispSpace === DispSpace.TANGENT) {
          v.customData[cd_disp].updateWorldCo(dctx1);
        } else {
          v.customData[cd_disp].updateTanCo(dctx1);
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
        //dv.baseco.load(dvbase.smoothco); //= dvbase.smoothco; //.load(dvbase.worldco);
        dv.baseco.load(dvbase.worldco);
        dv.parentTan.load(dvbase.tan);
        dv.parentNo.load(dvbase.no);
        dv.parentScale = dvbase.scale;
      }
    }

    mesh.recalcNormals(cd_disp);

    //dctx1.reset(mesh, cd_disp, cd_pvert);

    //calc no/tangents
    for (let v of mesh.verts) {
      let pv = v.customData[cd_pvert];
      let dv = v.customData[cd_disp];

      smoothno(v, dv);

      pv.updateTangent(pvert_settings, v, cd_pvert, true, cd_disp);

      dv.tan[0] = pv.disUV[1];
      dv.tan[1] = pv.disUV[2];
      dv.tan[2] = pv.disUV[3];
    }

    li++;
  }

  for (let layer of layers) {
    let cd_disp = layer.index;
    let settings = layer.getTypeSettings();

    settings.lastUpdateGen = settings.updateGen;
  }

  mesh.recalcNormals();

  //prevent reference leaks
  dctx1.reset();
  dctx2.reset();
}
