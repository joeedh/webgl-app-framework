import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {CDFlags, CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {applyTriangulation} from './mesh_tess.js';

export const Remeshers = {
};

export const RemeshClasses = [];
export const RemeshMap = {};

let cls_idgen = 0;

export class Remesher {
  constructor(mesh) {
    this.mesh = mesh;
    this.done = false;
  }

  step() {

  }

  finish() {

  }

  static remeshDefine() {
    return {
      type: -1,
    }
  }

  static register(cls) {
    RemeshClasses.push(cls);

    let code = cls_idgen++;
    let def = cls.remeshDefine();

    Remeshers[def.typeName] = code;
    RemeshMap[code] = cls;
  }
}

export class UniformTriRemesher extends Remesher {
  constructor(mesh) {
    super(mesh);
  }

  start() {
    let mesh = this.mesh;
    console.log("uniform remesh!");

    //triangulate
    for (let f of new Set(mesh.faces)) {
      if (f.lists.length > 1 || f.lists[0].length > 3) {
        applyTriangulation(mesh, f);
      }
    }
  }

  step() {
    this.done = true;

    let mesh = this.mesh;

    if (mesh.edges.length === 0) {
      return;
    }

    let max = mesh.edges.length;

    let es = [];
    let ws = [];

    let elen = 0;
    let tot = 0;

    for (let e of mesh.edges) {
      let w = e.v1.vectorDistance(e.v2);
      elen += w;
      tot++;

      es.push(e);
    }

    elen /= tot;

    let i = 0;

    for (let e of mesh.edges) {
      let w = e.v1.vectorDistance(e.v2);

      ws.push(w);
      e.index = i++;
    }

    es.sort((a, b) => ws[a.index] - ws[b.index]);

    elen *= 0.9;

    for (let i=0; i<max; i++) {
      let e = es[i];

      if (e.eid < 0) {
        continue; //edge was already deleted
      }

      let w = e.v1.vectorDistance(e.v2);

      if (ws[i] >= elen || w >= elen) {
        continue;
      }

      mesh.collapseEdge(e);
    }

    let co = new Vector3();

    for (let v of mesh.verts) {
      if (v.valence === 0) {
        mesh.killVertex(v);
      }

      let tot = 0.0;
      co.zero();

      for (let v2 of v.neighbors) {
        co.add(v2);
        tot++;
      }

      if (tot > 0.0) {
        co.mulScalar(1.0 / tot);

        v.interp(co, 0.5);
      }
    }
  }

  static remeshDefine() {
    return {
      typeName : "UNIFORM_TRI"
    }
  }

  finish() {

  }
}

Remesher.register(UniformTriRemesher);

export function remeshMesh(mesh, remesher = Remeshers.UNIFORM_TRI) {
  let cls = RemeshMap[remesher];

  let m = new cls(mesh);

  m.start();

  while (!m.done) {
    m.step();
  }

  m.finish();
}
