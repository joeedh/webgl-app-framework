import {SMeshTypes, SMeshFlags, SMeshRecalc, MAX_FACE_VERTS} from './smesh_base.js';
import {VertexList, EdgeList, ElementLists} from './smesh_element_list.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {NodeFlags} from '../core/graph.js';
import {DataBlock} from '../core/lib_api.js';
import {nstructjs} from '../path.ux/pathux.js';
import {LayerTypes, SimpleMesh} from '../core/simplemesh.js';
import {getArrayTemp} from '../mesh/mesh_base.js';
import {Node} from '../core/graph.js';
import {BoundMesh} from './smesh_bound.js';

export class EIDGen {
  static STRUCT = nstructjs.inlineRegister(this, `
smesh.EIDGen {
  _cur        : int;
  freelist    : array(int);
}`);

  constructor() {
    this._cur = 0;
    this.freelist = [];
  }

  next() {
    if (this.freelist.length) {
      return this.freelist.pop();
    }

    return this._cur++;
  }

  free(id) {
    this.freelist.push(id);
  }
}

export class SMesh extends SceneObjectData {

  static STRUCT = nstructjs.inlineRegister(SMesh, `
smesh.SMesh {
  elists : array(abstract(smesh.ElementList));
  eidgen : smesh.EIDGen;
}
`);

  constructor() {
    super();

    this.elists = [];
    this._ltris = [];

    this.binding = undefined;

    this.eidgen = new EIDGen();
    this.updateGen = 0;
    this.recalcFlag = SMeshRecalc.ALL;

    this.bindElists();
  }

  exec(ctx) {
    this._doUpdates();

    super.exec(...arguments);
    this.updateGen++;
  }

  static dataDefine() {
    return {
      name      : "SMesh",
      selectMask: SelMask.SGEOM
    }
  }

  wrap() {
    if (this.binding) {
      return this.binding.update(this);
    }

    this.binding = new BoundMesh();
    this.binding.bind(this);

    return this.binding;
  }

  getBoundingBox(matrix) {
    let min = new Vector3().addScalar(1e17);
    let max = new Vector3().addScalar(-1e17);

    let verts = this.verts;
    let co = verts.co;

    let tmp = new Vector3();

    for (let vi of this.verts) {
      tmp.load(co[vi]);

      if (matrix) {
        tmp.multVecMatrix(matrix);
      }

      min.min(tmp);
      max.max(tmp);
    }

    return [min, max];
  }

  static blockDefine() {
    return {
      typeName   : "SMesh",
      defaultName: "SMesh",
      uiName     : "SMesh",
      flag       : 0,
      icon       : -1
    }
  }

  static nodedef() {
    return {
      uiname : "SMesh",
      name   : "SMesh",
      inputs : Node.inherit({}),
      outputs: Node.inherit({}),
      flag   : NodeFlags.SAVE_PROXY
    }
  }

  bindElists() {
    this.verts = this.getElist(SMeshTypes.VERTEX);
    this.edges = this.getElist(SMeshTypes.EDGE);
    this.loops = this.getElist(SMeshTypes.LOOP);
    this.faces = this.getElist(SMeshTypes.FACE);

    return this;
  }

  getElist(type) {
    for (let elist of this.elists) {
      if (elist.type === type) {
        return elist;
      }
    }

    let elist = new ElementLists[type](this);
    this.elists.push(elist);

    return elist;
  }

  makeVertex(co, lctx) {
    let vi = this.verts.alloc();

    this.verts.eid[vi] = this.eidgen.next();
    this.verts.flag[vi] = SMeshFlags.UPDATE;
    this.verts.valence[vi] = 0;

    if (co) {
      this.verts.co[vi].load(co);
    }

    this.verts.e[vi] = -1;

    if (lctx) {
      lctx.newVertex(vi);
    }

    return vi;
  }

  _diskInsert(v, e) {
    let vs = this.verts, es = this.edges;

    if (vs.e[v] === -1) {
      if (v === es.v1[e]) {
        es.v1_next[e] = es.v1_prev[e] = e;
      } else if (v === es.v2[e]) {
        es.v2_next[e] = es.v2_prev[e] = e;
      } else {
        throw new Error("vertex " + v + " is not in edge " + e);
      }

      vs.e[v] = e;
    } else {
      let ve = vs.e[v];

      if (es.v1[e] === v) {
        es.v1_prev[e] = ve;
      } else if (es.v2[e] === v) {
        es.v2_prev[e] = ve;
      } else {
        throw new Error("vertex " + v + " is not in edge " + e);
      }

      let next;

      if (v === es.v1[ve]) {
        next = es.v1_next[ve];
        es.v1_next[ve] = e;
      } else {
        next = es.v2_next[ve];
        es.v2_next[ve] = e;
      }

      if (v === es.v1[next]) {
        es.v1_prev[next] = e;
      } else {
        es.v2_prev[next] = e;
      }

      if (es.v1[e] === v) {
        es.v1_next[e] = next;
      } else {
        es.v2_next[e] = next;
      }
    }

    vs.valence[v]++;
  }

  _diskRemove(v, e) {
    let vs = this.verts, es = this.edges;
    vs.valence[v]--;

    throw new Error("_diskRemove: implement me!");
  }

  regenRender() {
    this.recalcFlag |= SMeshRecalc.RENDER;
  }

  regenAll() {
    this.recalcFlag |= SMeshRecalc.ALL;
  }

  regenNormals() {
    this.recalcFlag |= SMeshRecalc.NORMALS;
  }

  recalcNormals() {
    this.recalcFlag &= ~SMeshRecalc.NORMALS;

    let faces = this.faces, loops = this.loops, verts = this.verts;

    for (let vi of this.verts) {
      verts.no[vi].zero();
    }

    for (let fi of this.faces) {
      faces.recalcNormal(fi);

      let no = faces.no[fi];

      for (let li of faces.loops(fi)) {
        let vi = loops.v[li];
        verts.no[vi].add(no);
      }
    }

    for (let vi of this.verts) {
      verts.no[vi].normalize();
    }
  }

  genRender() {
    this.recalcFlag &= ~SMeshRecalc.RENDER;

    let layerflag = LayerTypes.LOC | LayerTypes.ID | LayerTypes.NORMAL | LayerTypes.COLOR;

    let sm = this.smesh = new SimpleMesh(layerflag);
    let wm = this.wmesh = new SimpleMesh(layerflag);
    let w = [1, 1, 1, 1];

    let ltris = this.loopTris;
    let loops = this.loops, faces = this.faces, verts = this.verts;

    for (let i = 0; i < ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

      let v1 = loops.v[l1], v2 = loops.v[l2], v3 = loops.v[l3];
      let co1 = verts.co[v1], co2 = verts.co[v2], co3 = verts.co[v3];
      let n1 = verts.no[v1], n2 = verts.no[v2], n3 = verts.no[v3];
      let feid = faces.eid[loops.f[l1]] + 1;

      let tri = sm.tri(co1, co2, co3);

      tri.colors(w, w, w);
      tri.normals(n1, n2, n3);
      tri.ids(feid, feid, feid);
    }
  }

  get loopTris() {
    if (this.recalcFlag & SMeshRecalc.TESSELLATION) {
      this.tessellate();
    }

    return this._ltris;
  }

  tessellate() {
    this.recalcFlag &= ~SMeshRecalc.TESSELLATION;

    let ltris = this._ltris = [];
    let faces = this.faces, loops = this.loops, verts = this.verts;

    for (let fi of faces) {
      let startli = faces.l[fi];
      let _i = 0;
      let endli = loops.prev[startli];

      let startvi = loops.v[startli];
      let li = loops.next[startli];

      do {
        if (_i++ > MAX_FACE_VERTS) {
          console.error("Infinite loop error");
          break;
        }

        ltris.push(startli);
        ltris.push(li);
        ltris.push(loops.next[li]);

        li = loops.next[li];
      } while (li !== endli);
    }
  }

  _doUpdates(gl) {
    if (this.recalcFlag & SMeshRecalc.NORMALS) {
      this.recalcNormals();
    }

    if (this.recalcFlag & SMeshRecalc.TESSELLATION) {
      this.tessellate();
    }

    if (gl && this.recalcFlag & SMeshRecalc.RENDER) {
      this.genRender();
    }
  }

  getEdge(v1, v2) {
    let verts = this.verts, edges = this.edges;

    for (let ei of verts.edges(v1)) {
      if (edges.otherVertex(ei, v1) === v2) {
        return ei;
      }
    }
  }

  ensureEdge(v1, v2, lctx, exampleEdge) {
    let ei = this.getEdge(v1, v2);
    if (ei !== undefined) {
      return ei;
    }

    let e = this.makeEdge(v1, v2, lctx);

    if (exampleEdge) {
      this.copyElemData(e, exampleEdge);
    }

    return e;
  }

  makeEdge(v1, v2, lctx) {
    let ei = this.edges.alloc();

    console.log("ei", ei, v1, v2);

    this.edges.flag[ei] = SMeshFlags.UPDATE;
    this.edges.eid[ei] = this.eidgen.next();
    this.edges.v1[ei] = v1;
    this.edges.v2[ei] = v2;
    this.edges.l[ei] = -1;

    this.edges.v1_next[ei] = this.edges.v1_prev[ei] = -1;
    this.edges.v2_next[ei] = this.edges.v2_prev[ei] = -1;

    this._diskInsert(v1, ei);
    this._diskInsert(v2, ei);

    if (lctx) {
      lctx.newEdge(ei);
    }

    return ei;
  }

  _newLoop() {
    let li = this.loops.alloc();
    let loops = this.loops;

    loops.eid[li] = this.eidgen.next();
    return li;
  }

  _killLoop(li) {
    this.loops.free(li);
  }

  _radialInsert(ei, li) {
    let loops = this.loops, edges = this.edges;

    if (edges.l[ei] === -1) {
      loops.radial_next[li] = loops.radial_prev[li] = edges.l[ei] = li;
      return;
    }

    let l = edges.l[ei];

    loops.radial_prev[li] = l;
    loops.radial_next[li] = loops.radial_next[l];

    loops.radial_prev[loops.radial_next[l]] = li;
    loops.radial_next[l] = li;
  }

  _radialRemove(ei, li) {
    let loops = this.loops, edges = this.edges;

    if (li === edges.l[ei]) {
      edges.l[ei] = loops.radial_next[li];
    }

    if (li === edges.l[ei]) {
      edges.l[ei] = -1;
      return;
    }

    let ln = loops.radial_next[li];
    let lp = loops.radial_prev[li];

    loops.radial_next[lp] = ln;
    loops.radial_prev[ln] = lp;
  }

  makeFace(vs, lctx) {
    let ls = getArrayTemp(vs.length, false);

    let loops = this.loops;
    let faces = this.faces;

    for (let i = 0; i < vs.length; i++) {
      let li = this._newLoop();

      loops.v[li] = vs[i];
      ls[i] = li;
    }

    let fi = faces.alloc();
    faces.eid[fi] = this.eidgen.next();

    faces.l[fi] = ls[0];
    faces.flag[fi] = SMeshFlags.UPDATE;

    for (let i = 0; i < ls.length; i++) {
      let li = ls[i], li2 = ls[(i + 1)%ls.length];
      let li0 = ls[(i - 1 + ls.length)%ls.length];

      let v1 = loops.v[li], v2 = loops.v[li2];

      loops.f[li] = fi;
      loops.e[li] = this.ensureEdge(v1, v2, lctx);
      loops.next[li] = li2;
      loops.prev[li] = li0;

      this._radialInsert(loops.e[li], li);
    }

    if (lctx) {
      lctx.newFace(fi);
    }

    return fi;
  }

  draw(view3d, gl, uniforms, program, object) {
    this._doUpdates(gl);
    this.smesh.draw(gl, uniforms, program);
  }

  drawWireframe(view3d, gl, uniforms, program, object) {
    this._doUpdates(gl);
    this.wmesh.draw(gl, uniforms, program);
  }

  testSave() {
    let data = [];
    nstructjs.writeObject(data, this);
    data = new Uint8Array(data);
    data = new DataView(data.buffer);

    let json = JSON.stringify(nstructjs.writeJSON(this), undefined, 2);

    let smesh2 = nstructjs.readObject(data, SMesh);

    console.log(json);
    console.log(smesh2);
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    for (let elist of this.elists) {
      elist.smesh = this;
    }

    this.bindElists();
  }
}

DataBlock.register(SMesh);
SceneObjectData.register(SMesh);
