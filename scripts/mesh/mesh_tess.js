import {getArrayTemp, MeshFlags, MeshTypes} from './mesh_base.js';
import {Vector3, Vector2, Matrix4, Vector4, Quat} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';
import Delaunay from '../util/delaunay.js';
import {CustomDataElem} from './customdata.js';

let EPS = 0.000001;

export function setEPS(eps) {
  EPS = eps;
}

let Mesh = undefined;

let ORIG = MeshFlags.TEMP2;
let OUTER = MeshFlags.TEMP3;

export function setMeshClass(mesh) {
  Mesh = mesh;
}

export class CDT {
  constructor() {
    this.loops = [];
    this.calcWinding = false;

    this.fixWinding = true;
    this.triangles = undefined;

    this.min = new Vector2([1e17, 1e17]);
    this.max = new Vector2([-1e17, -1e17]);
  }

  /**
   *
   * @param loop Flat Array with (x, y, id) entires per vertex
   * */
  addLoop(loop) {
    let v1 = new Vector2();
    let v2 = new Vector2();

    let loop2 = [];

    for (let i = 0; i < loop.length; i += 3) {

      v1[0] = loop[i];
      v1[1] = loop[i + 1];

      if (i > 0 && v1.vectorDistance(v2) < EPS) {
        console.log("coincident vertex");
        continue;
      }

      this.min.min(v1);
      this.max.max(v1);

      loop2.push(loop[i]);
      loop2.push(loop[i + 1]);
      loop2.push(loop[i + 2]);

      let t = v1;
      v1 = v2;
      v2 = t;
    }

    this.loops.push(loop2);
  }

  constrain(tris, verts, inedges, trimHoles) {
    let me = new Mesh();
    let verts2 = [];

    let i = 0;

    let _trihash = new Map();

    function trihash(a, b, c) {
      a = a.eid;
      b = b.eid;
      c = c.eid;

      if (a < b) {
        let t = a;
        a = b;
        b = t;
      }
      if (a < c) {
        let t = a;
        a = c;
        c = t;
      }
      if (b < a) {
        let t = b;
        b = a;
        a = t;
      }
      if (b < c) {
        let t = b;
        b = c;
        c = t;
      }
      if (c < a) {
        let t = c;
        c = a;
        a = t;
      }
      if (c < b) {
        let t = c;
        c = b;
        b = t;
      }

      //*
      let t1 = Math.min(Math.min(a, b), c);
      let t3 = Math.max(Math.max(a, b), c);
      let t2;
      if (a !== t1 && a !== t3) {
        t2 = a;
      }
      if (b !== t1 && b !== t3) {
        t2 = b;
      }
      if (c !== t1 && c !== t3) {
        t2 = c;
      }
      a = t1;
      b = t2;
      c = t3;
      //*/

      //return `${a}:${b}:${c}`;
      return a | (b<<13) | (c<<25);
    }

    function triexists(a, b, c) {
      let hash = trihash(a, b, c);
      return _trihash.has(hash);
    }

    function triadd(a, b, c, f) {
      _trihash.set(trihash(a, b, c), f);
    }

    let _vs = [0, 0, 0];

    function makeFace(a, b, c) {
      let f = _trihash.get(trihash(a, b, c));

      if (f) {
        //console.log("tri exists");
        return f;
      }

      _vs[0] = a;
      _vs[1] = b;
      _vs[2] = c;

      f = me.makeFace(_vs);
      triadd(a, b, c, f);
      return f;
    }

    for (let v of verts) {
      v = me.makeVertex(v);
      v.index = i;

      verts2.push(v);
      i++;
    }

    verts = verts2;

    let edges = [];

    for (let i = 0; i < inedges.length; i += 3) {
      let v1 = inedges[i], v2 = inedges[i + 1], is_outer = inedges[i + 2];
      v1 = verts[v1];
      v2 = verts[v2];

      if (v1 === v2) {
        continue;
      }

      let e = me.makeEdge(v1, v2);

      e.flag |= ORIG;

      if (is_outer) {
        e.flag |= OUTER;
      }

      edges.push(e);
    }


    let vs = [0, 0, 0];

    for (let i = 0; i < tris.length; i += 3) {
      let v1 = tris[i], v2 = tris[i + 1], v3 = tris[i + 2];
      v1 = verts[v1];
      v2 = verts[v2];
      v3 = verts[v3];

      me.ensureEdge(v1, v2);
      me.ensureEdge(v2, v3);
      me.ensureEdge(v3, v1);

      vs[0] = v1;
      vs[1] = v2;
      vs[2] = v3;

      let f = me.makeFace(vs);
      if (triexists(v1, v2, v3)) {
        console.warn("Tesselation error; duplicate tri from delauney detected");
      }
      triadd(v1, v2, v3, f);
    }

    let dellist = new util.set();

    let infloop_limit = me.edges.length>>1;
    let stopiter = false;
    for (let si = 0; !stopiter && si < infloop_limit; si++) {
      stopiter = true;

      for (let e1 of me.edges) {
        let eset = new util.set();

        for (let e2 of me.edges) {
          let bad = (e2 === e1 || (e2.flag & ORIG));
          bad = bad || e1.v1 === e2.v1 || e1.v1 === e2.v2;
          bad = bad || e1.v2 === e2.v1 || e1.v2 === e2.v2;
          if (bad) {
            continue;
          }

          if (math.line_line_cross(e1.v1, e1.v2, e2.v1, e2.v2)) {
            stopiter = false;

            if (e2.l) {
              let l = e2.l;
              let _i = 0;

              do {
                if (_i++ > 100) {
                  console.warn("infinite loop detected");
                  break;
                }

                for (let l2 of l.f.loops) {
                  eset.add(l2.e);
                }

                l = l.radial_next;
              } while (l !== e2.l);
            }

            me.killEdge(e2);
          }
        }

        if (eset.length === 0) {
          continue;
        }

        let eset2 = new util.set();
        for (let e2 of eset) {
          if (e2.eid >= 0 && me.eidMap.has(e2.eid)) {
            eset2.add(e2);
          }
        }

        for (let e2 of eset2) {
          let bad = e2.v1 === e1.v1 || e2.v2 === e1.v1;
          if (bad) {
            continue;
          }

          let w = math.winding(e1.v1, e2.v1, e2.v2);

          if (!w) {
            makeFace(e2.v2, e2.v1, e1.v1);
          } else {
            makeFace(e1.v1, e2.v1, e2.v2);
          }
        }
      }
    }

    if (trimHoles) {
      this.trimHoles(me);
    }

    for (let f of me.faces) {
      let v1 = f.lists[0].l.v;
      let v2 = f.lists[0].l.next.v;
      let v3 = f.lists[0].l.next.next.v;

      //console.log(math.normal_tri(v1, v2, v3));
    }
    //console.log("CDT DONE");

    let tris2 = [];
    for (let f of me.faces) {
      for (let v of f.verts) {
        tris2.push(v.index);
      }
    }
    tris = tris2;

    return tris;
  }

  estWinding(me) {
    let w = 0;

    let outer = me.edges.filter(e => e.flag & OUTER);

    let cent = new Vector3();
    let tot = 0.0;

    for (let e of outer) {
      cent.add(e.v1);
      cent.add(e.v2);
      tot++;
    }

    if (tot) {
      cent.mulScalar(1.0/tot);
    }

    for (let e of outer) {
      let startv = e.v1;
      let v = startv;
      let _i = 0;

      while (1) {
        if (_i++ > 10000) {
          console.warn("infinite loop error");
          break;
        }

        v = e.otherVertex(v);
        math.normal_tri(startv, v, cent);

        w += cent[2] < 0.0 ? -1 : 1;

        let nexte;
        for (let e2 of v.edges) {
          if (e2 !== e && (e2.flag & OUTER)) {
            nexte = e2;
            break;
          }
        }

        e = nexte;

        if (v === startv) {
          break;
        }
      }
    }

    if (0) {
      for (let i = 0; i < outer.length; i++) {
        let e1 = outer[i];
        let e2 = outer[(i + 1)%outer.length]

        let v1, v2, v3;

        if (e2.has(e1.v2)) {
          v1 = e1.v1;
          v2 = e1.v2;
          v3 = e2.otherVertex(v2);
        } else if (e2.has(e1.v1)) {
          v1 = e1.v2;
          v2 = e1.v1;
          v3 = e2.otherVertex(v2);
        } else {
          console.warn("Mesh Error");
        }

        w += math.winding(v1, v2, v3)*2.0 - 1.0;
      }
    }

    return w >= 0.0;
  }

  trimHoles(me) {
    //estimate winding of outer loop
    let w = 0.0;
    let outer = me.edges.filter(e => e.flag & OUTER);

    //let co = outer.reduce((p, e) => {p.add(e.v1); p.add(e.v2); return p}, new Vector2());
    //co.mulScalar(1.0 / outer.length);

    //let co = new Vector2(outer[0]);

    //w = outer.reduce((w2, e) => math.winding(co, e.v1, e.v2)*2.0 - 1.0);
    //w = w < 0.0;

    if (this.calcWinding) {
      w = this.estWinding(me);
    } else {
      w = true;
    }

    //delete outer faces
    for (let e of outer) {
      if (!e.l) {
        continue;
      }

      let l = e.l;
      let _i = 0;
      do {
        if (_i++ > 100) {
          console.warn("infinite loop detected");
          break;
        }

        let v1 = l.v, v2 = l.next.v, v3 = l.next.next.v;
        let v;

        if (v2 !== e.v2 && v2 !== e.v1) {
          v = v2;
        } else {
          v = v3;
        }

        if (v === e.v1 || v === e.v2) {
          throw new Error("eek");
        }

        let w2 = math.winding(e.v1, e.v2, v);

        if (w2 !== w) {
          let f = l.f;

          l = l === l.radial_next ? undefined : l.radial_next;
          me.killFace(f);
        } else {
          l = l.radial_next;
        }
      } while (l && l !== e.l);
    }

    //tag inner faces
    let stack = [];
    let fset = new util.set();

    for (let e of outer) {
      if (!e.l) continue;
      if (fset.has(e.l.f)) continue;

      let f = e.l.f;
      stack.push(f);

      while (stack.length > 0) {
        f = stack.pop();

        f.flag |= MeshFlags.TEMP1;


        for (let l1 of f.lists[0]) {
          let e = l1.e;
          let l = e.l;
          let _i = 0;

          if (e.flag & ORIG) {
            continue;
          }

          do {
            if (!fset.has(l.f)) {
              fset.add(l.f);
              stack.push(l.f);
            }

            l = l.radial_next;
            if (_i++ > 100) {
              console.warn("infinite loop detected");
              break;
            }
          } while (l !== e.l);
        }
      }
    }

    for (let f of me.faces) {
      if (!(f.flag & MeshFlags.TEMP1)) {
        me.killFace(f)
      }
    }
  }

  unnormalize(co) {
    let scale = this._normScale;

    co[0] = co[0]/scale + this.min[0];
    co[1] = co[1]/scale + this.min[1];

    return co;
  }

  normalizeLoops() {
    let min = this.min, max = this.max;
    let co = new Vector2(max).sub(min);

    co[0] = co[0] === 0.0 ? 1.0 : co[0];
    co[1] = co[1] === 0.0 ? 1.0 : co[1];

    let scale = 100.0/Math.max(co[0], co[1]);

    this._normScale = scale;

    for (let loop of this.loops) {
      for (let i = 0; i < loop.length; i += 3) {
        loop[i] = (loop[i] - min[0])*scale;
        loop[i + 1] = (loop[i + 1] - min[1])*scale;
      }
    }
  }

  generate(trimHoles = true) {
    this.triangles = [];
    return this.generate_intern();
  }

  generate_intern(trimHoles = true) {
    this.normalizeLoops();

    let verts = [];
    this.verts = [];
    let vset = new util.set();

    for (let l of this.loops) {
      for (let i = 0; i < l.length; i += 3) {
        let v2 = [l[i], l[i + 1], l[i + 2]];

        verts.push(v2);
        this.verts.push(v2);
      }
    }

    let tris = Delaunay.triangulate(verts);

    //make consistent winding
    for (let i = 0; this.fixWinding && i < tris.length; i += 3) {
      let v1 = tris[i], v2 = tris[i + 1], v3 = tris[i + 2];

      v1 = verts[v1];
      v2 = verts[v2];
      v3 = verts[v3];

      let w = math.winding(v1, v2, v3);

      if (w) {
        let t = tris[i];
        tris[i] = tris[i + 2];
        tris[i + 2] = t;
      }
    }

    let vmap = {};
    let i = 0;
    for (let v of verts) {
      vmap[v[2]] = i;
      i++;
    }

    let edges = this.edges = [];
    for (let l of this.loops) {
      let outer = l === this.loops[0];

      for (let i = 0; i < l.length; i += 3) {
        let a = (i + 3)%l.length;
        let b = i;

        a = l[a + 2];
        b = l[b + 2];

        a = vmap[a];
        b = vmap[b];

        edges.push(a);
        edges.push(b);
        edges.push(outer);
      }
    }

    tris = this.constrain(tris, verts, edges, trimHoles);

    for (let i = 0; i < tris.length; i++) {
      tris[i] = verts[tris[i]][2];
    }

    this.triangles = tris;
  }
}

let fco1 = new Vector3();
let fco2 = new Vector3();

let mtmp = new Matrix4();

function fillFace(f, loopTris) {
  let m = mtmp;

  if (f.no.dot(f.no) === 0.0) {
    f.calcNormal();
  }

  m.makeIdentity();
  m.makeNormalMatrix(f.no);
  m.invert();

  let idmap = {};

  let co = fco1;
  let cdt = new CDT();

  function vsmooth(v, fac = 0.5) {
    let co = fco2;
    let tot = 0;

    co.zero();
    for (let v2 of v.neighbors) {
      co.add(v2);
      tot++;
    }

    if (tot < 2) {
      return co.load(v);
    } else {
      co.mulScalar(1.0/tot);
      co.interp(v, 1.0 - fac);
      return co;
    }
  }

  let loops = [];

  let minx = 1e17, miny = 1e17;
  let maxx = -1e17, maxy = -1e17;

  f.ensureBoundaryFirst();

  for (let list of f.lists) {
    let vs = [];

    loops.push(vs);

    for (let l of list) {
      co.load(l.v);
      //co.load(vsmooth(l.v, 0.15));

      co.multVecMatrix(m);
      co[2] = 0.0;

      idmap[l.eid] = l;

      //co[0] += (Math.random()-0.5)*0.001;
      //co[1] += (Math.random()-0.5)*0.001;

      minx = Math.min(minx, co[0]);
      miny = Math.min(miny, co[1]);
      maxx = Math.max(maxx, co[0]);
      maxy = Math.max(maxy, co[1]);

      vs.push(co[0]);
      vs.push(co[1]);
      vs.push(l.eid);
    }

    cdt.addLoop(vs);
  }

  for (let vs of loops) {
    let sx = maxx - minx, sy = maxy - miny;
    if (sx > 0 && sy > 0) {
      for (let i = 0; i < vs.length; i += 3) {
        vs[i] = (vs[i] - minx)/sx;
        vs[i + 1] = (vs[i + 1] - miny)/sy;

        if (isNaN(vs[i]) | isNaN(vs[i + 1])) {
          console.error(vs[i].toFixed(4), vs[i + 1].toFixed(4));
          throw new Error("NaN!");
        }
      }
    }
  }

  cdt.generate();
  console.log(cdt.triangles.length/3);

  for (let eid of cdt.triangles) {
    let l = idmap[eid];

    loopTris.push(l);
  }
}

export function triangulateQuad(mesh, f, lctx, newfaces) {
  if (!f.isQuad()) {
    throw new Error("f was not a quad");
  }

  let l = f.lists[0].l;

  let d1 = l.v.vectorDistance(l.next.next.v);
  let d2 = l.next.v.vectorDistance(l.prev.v);
  let f1, f2;

  let l1 = l, l2 = l.next;
  let l3 = l2.next, l4 = l3.next;

  let th1 = math.dihedral_v3_sqr(l1.v, l2.v, l3.v, l4.v);
  let th2 = math.dihedral_v3_sqr(l4.v, l1.v, l2.v, l3.v);
  th1 = 2.0 - (th1*0.5 + 0.5);
  th2 = 2.0 - (th2*0.5 + 0.5);

  d1 *= th1;
  d2 *= th2;

  let side = d1 <= d2 || mesh.getEdge(l4.v, l2.v) !== undefined;

  /*
  let limit = 0.001;
  side = side || math.colinear(l4.v, l1.v, l2.v, limit);
  side = side || math.colinear(l4.v, l2.v, l3.v, limit);

  side = side && !math.colinear(l1.v, l2.v, l3.v, limit);
  side = side && !math.colinear(l1.v, l3.v, l4.v, limit);
  */

  if (side && !mesh.getEdge(l1.v, l3.v)) {
    f1 = mesh.makeTri(l1.v, l2.v, l3.v, lctx);
    f2 = mesh.makeTri(l1.v, l3.v, l4.v, lctx);

    l = f1.lists[0].l;
    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.prev, l3);

    l = f2.lists[0].l;
    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l3);
    mesh.copyElemData(l.prev, l4);
  } else {
    f1 = mesh.makeTri(l4.v, l1.v, l2.v, lctx);
    f2 = mesh.makeTri(l4.v, l2.v, l3.v, lctx);
    //f1 = mesh.makeTri(l2.v, l1.v, l4.v, lctx);
    //f2 = mesh.makeTri(l3.v, l2.v, l4.v, lctx);

    l = f1.lists[0].l;
    mesh.copyElemData(l, l4);
    mesh.copyElemData(l.next, l1);
    mesh.copyElemData(l.prev, l2);

    l = f2.lists[0].l;
    mesh.copyElemData(l, l4);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.prev, l3);
  }

  mesh.copyElemData(f1, f);
  mesh.copyElemData(f2, f);

  if (newfaces) {
    if (newfaces instanceof Set) {
      newfaces.add(f1);
      newfaces.add(f2);
    } else {
      newfaces.push(f1);
      newfaces.push(f2);
    }
  }

  mesh.killFace(f, lctx);
}

export function triangulateFace(f, loopTris = []) {
  if (f.lists[0].length === 3 && f.lists.length === 1) {
    let l = f.lists[0].l;

    loopTris.push(l);
    loopTris.push(l.next);
    loopTris.push(l.next.next);

    return loopTris;
  }

  if (f.lists[0].length === 4 && f.lists.length === 1) {
    let l = f.lists[0].l;

    let d1 = l.v.vectorDistance(l.next.next.v);
    let d2 = l.next.v.vectorDistance(l.prev.v);

    if (d1 <= d2) {
      loopTris.push(l);
      loopTris.push(l.next);
      loopTris.push(l.next.next);

      loopTris.push(l);
      loopTris.push(l.next.next);
      loopTris.push(l.prev);
    } else {
      loopTris.push(l.prev);
      loopTris.push(l);
      loopTris.push(l.next);

      loopTris.push(l.prev);
      loopTris.push(l.next);
      loopTris.push(l.next.next);
    }

    return loopTris;
  }

  fillFace(f, loopTris);

  return loopTris;
}

const LCMD = 0, LTOT = 8;

const CGOTO = 0, CRADIAL_NEXT = 1, CNEXT = 2, CPREV = 3, CLIST_START = 4,
      CMARKL1                                                        = 5, CMARKL2                                           = 6, CMARKL3 = 7, CPUSHCD_VERTEX = 8,
      CPUSHCD_LOOP                                                   = 9, CRESETCD = 10, CPUSHCO                       = 11, CRESETCO = 12,
      CINTERPV                                                       = 13, CINTERPL = 14, CMAKETRI                         = 15;

function execCommands(mesh, lst, loop, tri, cd_color, cd_uv, maketri) {
  let l = loop;
  let l1, l2, l3;

  let totreg = 5;

  let cd_regs = new Array(totreg);
  let co_regs = new Array(totreg);
  let tempvert = 32;
  let cd_dst_verts = new Array(tempvert);
  let cd_dst_loops = new Array(tempvert);

  let vdata = mesh.verts.customData;
  let ldata = mesh.loops.customData;

  for (let i = 0; i < cd_regs.length; i++) {
    let cdata = [];

    for (let layer of mesh.verts.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      cdata.push(new cls());
    }

    cd_regs[i] = [[], []];
    co_regs[i] = [new Vector3(), 0];
    cd_dst_verts[i] = {
      no   : new Vector3(),
      co   : new Vector3(),
      cdata: cdata,
      index: i
    }

    cdata = [];
    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      cdata.push(new cls());
    }

    cd_dst_loops[i] = {
      cdata: cdata,
      v    : 0,
      index: i
    }
  }

  for (let ci = 0; ci < lst.length; ci += LTOT) {
    let cmd = lst[ci];

    switch (cmd) {
      case CGOTO: {
        let tot = lst[ci + 1];
        let prev = tot < 0.0;
        tot = prev ? -tot : tot;

        for (let i = 0; i < tot; i++) {
          if (prev) {
            l = l.prev;
          } else {
            l = l.next;
          }
        }

        break;
      }
      case CRADIAL_NEXT:
        l = l.radial_next;
        break;
      case CNEXT:
        l = l.next;
        break;
      case CPREV:
        l = l.prev;
        break;
      case CLIST_START:
        l = l.list.l;
        break;
      case CMARKL1:
        l1 = l;
        break;
      case CMARKL2:
        l2 = l;
        break;
      case CMARKL3:
        l3 = l;
        break;
      case CPUSHCD_VERTEX:
      case CPUSHCD_LOOP: {
        let reg = lst[ci + 1];
        let w = lst[ci + 2];

        let elem = cmd === CPUSHCD_VERTEX ? l.v : l;

        cd_regs[reg][0].push(elem.customData);
        cd_regs[reg][1].push(w);
        break;
      }
      case CRESETCD: {
        let reg = lst[ci + 1];
        cd_regs[reg][0].length = 0;
        cd_regs[reg][1].length = 0;
        break;
      }
      case CPUSHCO: {
        let reg = lst[ci + 1];
        let w = lst[ci + 2];

        co_regs[reg][0].addFac(l.v, w);
        co_regs[reg][1] += w;
        break;
      }
      case CRESETCO: {
        let reg = lst[ci + 1];

        co_regs[reg][0].zero();
        co_regs[reg][1] = 0.0;
        break;
      }

      case CINTERPV: {
        let reg = lst[ci + 1];
        let dstv = lst[ci + 2];

        let v = cd_dst_verts[dstv];
        let r = cd_regs[reg];

        vdata.interp(v.cdata, r[0], r[1]);
        v.co.load(co_regs[reg][0]).mulScalar(1.0/co_regs[reg][1]);

        break;
      }

      case CINTERPL: {
        let reg = lst[ci + 1];
        let dstl = lst[ci + 2];
        let v = lst[ci + 3];
        let r = cd_regs[reg];

        let l = cd_dst_loops[dstl];

        ldata.interp(l.cdata, reg[0], reg[1]);
        l.v = cd_dst_verts[v];

        break;
      }

      case CMAKETRI: {
        let l1 = lst[ci + 1];
        let l2 = lst[ci + 2];
        let l3 = lst[ci + 3];

        let vcd, lcd, no, co, uv, color;

        function getLoop(l) {
          if (l < 0) {
            l = mesh.eidMap.get(-l);
            co = l.v;
            no = l.v.no;
            vcd = l.v.customData;
            lcd = l.customData;
          } else {
            l = cd_dst_loops[l];

            co = l.v.co;
            no = l.v.no;
            vcd = l.v.cdata;
            lcd = l.cdata;
          }

          if (cd_color >= 0) {
            color = lcd.customData[cd_color].color;
          }

          if (cd_uv >= 0) {
            uv = lcd.customData[cd_uv].uv;
          }

          return l;
        }

        getLoop(l1);
        let c1 = color, uv1 = uv;
        let v1 = co, n1 = no;

        getLoop(l2);
        let c2 = color, uv2 = uv;
        let v2 = co, n2 = no;

        getLoop(l3);
        let c3 = color, uv3 = uv;
        let v3 = co, n3 = no;

        let tri = maketri(v1, v2, v3);
        tri.normals(n1, n2, n3);

        if (uv1) {
          tri.uvs(uv1, uv2, uv3);
        }

        if (c1) {
          tri.colors(c1, c2, c3);
        }

        break;
      }
    }
  }
}

export function genCommands(mesh, ltri) {

}

export function applyTriangulation(mesh, f, newfaces, newedges, lctx) {
  if (f.isQuad()) {
    triangulateQuad(mesh, f, lctx, newfaces);
    return;
  } else if (f.isTri()) {
    return;
  }

  let ltris = triangulateFace(f);

  for (let i = 0; i < ltris.length; i += 3) {
    let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

    let e1, e2, e3;
    if (newedges) {
      e1 = mesh.getEdge(l1.v, l2.v);
      e2 = mesh.getEdge(l2.v, l3.v);
      e3 = mesh.getEdge(l3.v, l1.v);
    }

    if (l1.v === l2.v || l1.v === l3.v || l2.v === l3.v) {
      continue;
    }

    let tri = mesh.makeTri(l1.v, l2.v, l3.v, lctx);
    if (lctx) {
      //lctx.newFace(tri);
    }

    let l = tri.lists[0].l;

    tri.calcNormal();

    let lr = l.radial_next;
    if (lr.f === f) {
      lr = lr.radial_next;
    }

    if (lr.v === l.v && lr !== l && lr.f !== f) {
      mesh.reverseWinding(tri);
    }
    //if (tri.no.dot(f.no) < 0) {
    //mesh.reverseWinding(tri);
    //}

    tri.flag |= MeshFlags.UPDATE;

    mesh.copyElemData(tri, l1.f);
    mesh.copyElemData(l, l1);
    mesh.copyElemData(l.next, l2);
    mesh.copyElemData(l.prev, l3);

    if (f.flag & MeshFlags.SELECT) {
      mesh.setSelect(tri, true);
    }

    if (newfaces) {
      newfaces.add(tri);
    }

    if (newedges) {
      if (!e1) {
        newedges.add(l.e);

        if (e2) {
          mesh.copyElemData(e1, e2, true);
        } else if (e3) {
          mesh.copyElemData(e1, e3, true);
        }
      }

      if (!e2) {
        newedges.add(l.next.e);

        if (e1) {
          mesh.copyElemData(e2, e1, true);
        } else if (e3) {
          mesh.copyElemData(e2, e3, true);
        }
      }

      if (!e3) {
        newedges.add(l.prev.e);

        if (e1) {
          mesh.copyElemData(e3, e1, true);
        } else if (e2) {
          mesh.copyElemData(e3, e2, true);
        }
      }
    }
  }

  mesh.killFace(f, lctx);
}

