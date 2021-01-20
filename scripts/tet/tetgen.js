import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';

import {TetTypes, TetFlags, TetRecalcFlags} from './tetgen_base.js';
import {TetElementList} from './tet_element_list.js';
import {TetVertex, TetElement, TetEdge, TetFace, TetLoop, TetTet} from './tetgen_types.js';

export class TetMesh {
  constructor() {
    this.elists = {};
    this.verts = this.edges = this.faces = this.tets = undefined;
    this.eidgen = new util.IDGen();
    this.eidmap = {};

    this.makeElists();
  }

  makeElists() {
    this.elists = {};

    for (let k in TetTypes) {
      this.elists[k] = new TetElementList(TetTypes[k]);
    }

    this.verts = this.elists[TetTypes.VERTEX];
    this.edges = this.elists[TetTypes.EDGE];
    this.loops = this.elists[TetTypes.LOOP];
    this.faces = this.elists[TetTypes.FACE];
    this.tets = this.elists[TetTypes.TET];
  }

  _elementPush(elem, custom_eid=undefined) {
    if (custom_eid === undefined) {
      elem.eid = this.eidgen.next();
    } else {
      elem.eid = custom_eid;
    }

    this.eidmap[elem.eid] = elem;
    let list = this.elists[elem.type];

    list.initElem(elem);
    list.push(elem);
  }

  makeVertex(co, custom_eid=undefined) {
    let v = new TetVertex(co);

    this._elementPush(v, custom_eid);

    return v;
  }

  getEdge(v1, v2) {
    for (let e of v1.edges) {
      if (e.otherVertex === v2) {
        return e;
      }
    }

    return undefined;
  }

  makeEdge(v1, v2, checkExist=true, custom_eid=undefined, lctx) {
    if (checkExist) {
      let e = this.getEdge(v1, v2);

      if (e) {
        return e;
      }
    }

    let e = new TetEdge();
    this._elementPush(e, custom_eid);

    e.v1 = v1;
    e.v2 = v2;

    if (lctx) {
      lctx.newEdge(e);
    }

    v1.edges.push(e);
    v2.edges.push(e);

    return e;
  }

  _radialInsert(e, l) {
    if (e.l === undefined) {
      e.l = l;
      l.radial_next = l.radial_prev = l;
    } else {
      l.radial_prev = e.l;
      l.radial_next = e.l.radial_next;
      e.l.radial_next.radial_prev = l;
      e.l.radial_next = l;
    }
  }

  _radialRemove(e, l) {
    if (e.l === l) {
      e.l = l === l.radial_next ? undefined : l.radial_next;
    }

    l.radial_next.radial_prev = l.radial_prev;
    l.radial_prev.radial_next = l.radial_next;
  }

  makeFace(v1, v2, v3, lctx, custom_eid, custom_eid_l1, custom_eid_l2, custom_eid_l3) {
    let l1 = new TetLoop();
    let l2 = new TetLoop();
    let l3 = new TetLoop();

    this._elementPush(l1, custom_eid_l1);
    this._elementPush(l2, custom_eid_l2);
    this._elementPush(l3, custom_eid_l3);

    l1.v = v1;
    l2.v = v2;
    l3.v = v3;

    l1.next = l2;
    l2.next = l3;
    l3.next = l1;

    l1.prev = l3;
    l2.prev = l1;
    l3.prev = l2;

    let f = new TetFace();

    this._elementPush(f, custom_eid);

    f.l = l1;
    f.loops[0] = l1;
    f.loops[1] = l2;
    f.loops[2] = l3;

    l1.f = l2.f = l3.f = f;
    l1.e = this.getEdge(v1, v2, true, undefined, lctx);
    l2.e = this.getEdge(v2, v3, true, undefined, lctx);
    l3.e = this.getEdge(v3, v1, true, undefined, lctx);

    this._radialInsert(l1.e, l1);
    this._radialInsert(l2.e, l2);
    this._radialInsert(l3.e, l3);

    if (lctx) {
      lctx.newFace(f);
    }

    return f;
  }

  makeTet(v1, v2, v3, v4, custom_eid, eid1, eid2, eid3, eid4, lctx) {
    let f1 = this.makeFace(v1, v2, v4, lctx, eid1);
    let f2 = this.makeFace(v2, v3, v4, lctx, eid2);
    let f3 = this.makeFace(v3, v1, v4, lctx, eid3);
    let f4 = this.makeFace(v1, v2, v3, lctx, eid4);

    let tet = new TetTet();
    this._elementPush(tet, custom_eid);

    tet.faces[0] = f1;
    tet.faces[1] = f2;
    tet.faces[2] = f3;
    tet.faces[3] = f4;

    tet.verts[0] = v1;
    tet.verts[1] = v2;
    tet.verts[2] = v3;
    tet.verts[3] = v4;

    let flag = TetFlags.MAKEFACE_TEMP;

    for (let f of tet.faces) {
      f.t = tet;

      for (let l of f.loops) {
        l.t = tet;
        l.e.flag &= ~flag;
      }
    }

    for (let f of tet.faces) {
      for (let l of f.loops) {
        if (!(l.e.flag & flag)) {
          l.e.flag |= flag;
          tet.edges.push(l.e);
        }
      }
    }

    if (lctx) {
      lctx.newTet(tet);
    }

    return tet;
  }

  loadSTRUCT(reader) {
    let eidmap = this.eidmap = {};

    for (let k in this.elists) {
      let list = this.elists[k];

      for (let elem of list) {
        eidmap[elem.eid] = elem;
      }
    }

    for (let v of this.verts) {
      for (let i=0; i<v.edges.length; i++) {
        v.edges[i] = eidmap[v.edges[i]];
      }
    }

    for (let e of this.edges) {
      e.v1 = eidmap[e.v1];
      e.v2 = eidmap[e.v2];
      e.l = eidmap[e.l];
    }

    for (let l of this.loops) {
      l.v = eidmap[l.v];
      l.next = eidmap[l.next];
      l.prev = eidmap[l.prev];
    }

    for (let f of this.faces) {
      f.loops[0] = eidmap[f.loops[0]];
      f.loops[1] = eidmap[f.loops[1]];
      f.loops[2] = eidmap[f.loops[2]];

      f.l = f.loops[0];

      for (let l of f.loops) {
        l.e = this.getEdge(l.v, l.next.v);
        l.f = f;

        this._radialInsert(l.e, l);
      }
    }

    for (let t of this.tets) {
      for (let i=0; i<t.faces.length; i++) {
        t.verts[i] = eidmap[t.verts[i]];
        t.faces[i] = eidmap[t.faces[i]];
      }

      t._regenEdges();

      for (let f of tet.faces) {
        f.t = t;

        for (let l of f.loops) {
          l.t = t;
        }
      }
    }
  }
}
TetMesh.STRUCT = `
tet.TetMesh {
  eidgen : IDGen;
  verts  : tet.TetElementList;
  edges  : tet.TetElementList;
  loops  : tet.TetElementList;
  faces  : tet.TetElementList;
  tets   : tet.TetElementList;
}
`;
