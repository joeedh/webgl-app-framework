import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {MeshDrawInterface} from "../editors/view3d/view3d_draw.js";
import {Mesh, MeshTypes, MeshFlags} from '../mesh/mesh.js';

import {subdivide} from './subsurf_mesh.js';

export class SubsurfMesh extends MeshDrawInterface {
  constructor(mesh) {
    super();

    this.mesh_ref = mesh.lib_id;
    this.smesh = undefined;

    this.ototvert = mesh.verts.length;
    this.ototedge = mesh.verts.length;
    this.ototface = mesh.verts.length;

    this.origverts = {};
    this.origfaces = {};
    this.origedges = {};

    this.patches = undefined;
  }

  draw(ctx, view3d, gl, object) {
    this.mesh_ref = object.data.lib_id;

    if (this.needsRecalc()) {

    }
  }

  needsRecalc(mesh) {
    if (this.smesh === undefined) {
      return true;
    }

    let m1 = mesh;
    let m2 = this.smesh;

    let bad = false;

    bad = bad || this.ototvert !== m1.verts.length;
    bad = bad || this.ototedge !== m1.edges.length;
    bad = bad || this.ototface !== m1.faces.length;

    if (bad) {
      return true;
    }

    let origverts = this.origverts;
    let origedges = this.origedges;
    let origfaces = this.origfaces;

    for (let v of m1.verts) {
      if (!(v.eid in origverts))
        return true;
    }
    for (let e of m1.edges) {
      if (!(e.eid in origedges))
        return true;
    }
    for (let f of m1.faces) {
      if (!(f.eid in origfaces))
        return true;
    }

    return false;
  }

  syncVerts(mesh) {
    let smesh = this.smesh;


  }

  generate(mesh) {
    this.ototedge = mesh.edges.length;
    this.ototface = mesh.faces.length;
    this.ototvert = mesh.verts.length;

    let ov = this.origverts = {};
    let oe = this.origedges = {};
    let of = this.origfaces = {};

    mesh.updateIndices();

    for (let v of mesh.verts) {
      ov[v.eid] = v.index;
    }

    for (let e of mesh.edges) {
      oe[e.eid] = e.index;
    }

    for (let f of mesh.faces) {
      of[f.eid] = f.index;
    }

    let smesh = mesh.copy();
    smesh.setOrigIndex();

    subdivide(smesh);

    this.patches = new Float64Array(smesh.faces.length*16*3);

  }

  update(ctx, view3d, gl, object) {
    this.mesh_ref = object.data.lib_id;

    if (!this.needsRecalc(object.data)) {
      this.syncVerts(object.data);
    } else {
      this.generate(object.data);
    }
  }
}

export class SubsurfDrawer extends MeshDrawInterface {
  constructor() {
    super();

    this.cache = {};
  }

  get(object) {
    if (!(object.data.eid in this.cache)) {
      this.cache[object.data.eid] = new SubsurfMesh(object.data);
    }

    return this.cache[object.data.eid];
  }

  draw(view3d, gl, object) {
    let ss = this.get(object);

    ss.update(view3d.ctx, view3d, gl, object);
    ss.draw(view3d.ctx, view3d, gl, object);
  }
}
