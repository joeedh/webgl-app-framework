import {SMeshTypes, SMeshFlags} from './smesh_base.js';
import {VertexList, EdgeList, ElementLists} from './smesh_element_list.js';

export class SMesh {
  constructor() {
    this.elists = [];

    this.eidgen = 0;

    this.bindElists();
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

  makeVertex(co) {
    let vi = this.verts.alloc();

    this.verts.eid[vi] = this.eidgen++;
    this.verts.co[vi].load(co);
    this.verts.e[vi] = -1;
  }

  _diskInsert(v, e) {
    let vs = this.verts, es = this.edges;

    if (vs.e[v] === -1) {
      if (v === es.v1[e]) {
        es.v1_next[e] = es.v1_prev[e] = e;
      } else {
        es.v2_next[e] = es.v2_prev[e] = e;
      }

      vs.e[v] = e;
    } else {
      if (v === es.v1[e]) {
        es.v1_prev[e] = vs.e[v];
        es.v1_next[e] = es.v1_next[vs.e[v]];
        es.v1_prev[es.v1_next[vs.e[v]]] = e;
        es.v1_next[vs.e[v]] = e;
      } else {
        es.v2_prev[e] = vs.e[v];
        es.v2_next[e] = es.v2_next[vs.e[v]];
        es.v2_prev[es.v2_next[vs.e[v]]] = e;
        es.v2_next[vs.e[v]] = e;
      }
    }
  }

  _diskRemove(v, e) {
    throw new Error("_diskRemove: implement me!");
  }

  makeEdge(v1, v2) {
    let ei = this.edges.alloc();

    this.edges.eid[ei] = this.eidgen++;
    this.edges.v1[ei] = v1;
    this.edges.v2[ei] = v2;
    this.edges.l[ei] = -1;

    this._diskInsert(v1, ei);
    this._diskInsert(v2, ei);
  }

  loadSTRUCT(reader) {
    reader(this);

    this.bindElists();
  }
}
SMesh.STRUCT = `
SMesh {
  elists : array(abstract(smesh.ElementList));
  eidgen : int;
}
`;
