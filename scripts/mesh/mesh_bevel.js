import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshOp} from './mesh_ops_base.js';
import {ToolOp, FloatProperty, IntProperty, EnumProperty, FlagProperty, BoolProperty} from '../path.ux/scripts/pathux.js';
import {vertexSmooth} from './mesh_utils.js';
import {getArrayTemp, MAX_FACE_VERTS, MeshFlags, MeshTypes} from './mesh_base.js';

export function splitEdgeLoops_pre(mesh, edges=mesh.edges, vertWidthMap=new Map(), width=0.25, lctx) {
  if (!(edges instanceof Set)) {
    edges = new Set(edges);
  }

  let vs = new Set();
  let fs = new Set();

  for (let e of edges) {
    vs.add(e.v1);
    vs.add(e.v2);

    for (let l of e.loops) {
      fs.add(l.f);
    }
  }

  let lvmap = new Map();

  let alledges = new Set();

  let cornerMap = new Map();
  let origVertMap = new Map();
  let dirMap = new Map();
  let origEdgeMap = new Map();

  let flag = MeshFlags.MAKE_FACE_TEMP;
  let visit = new Set();

  let fs2 = new Set(fs);

  for (let e of edges) {
    visit.add(e);
  }

  let delvs = new Set();
  for (let e of edges) {
    delvs.add(e.v1);
    delvs.add(e.v2);
  }

  for (let e of edges) {
    for (let v of e.verts) {
      for (let e2 of v.edges) {
        alledges.add(e2);
      }
    }
  }

  for (let v of vs) {
    visit = new Set();

    for (let e2 of new Set(v.edges)) {
      for (let l of e2.loops) {
        fs2.add(l.f);
      }

      let key = "" + v.eid + ":" + e2.eid;

      if (visit.has(key) || edges.has(e2)) {
        continue;
      }

      let v1 = e2.v1, v2 = e2.v2;

      let t = v === e2.v1 ? 0.1 : 0.9;
      let [ne, nv] = mesh.splitEdge(e2, t, lctx);

      let e3 = v === e2.v1 ? e2 : ne;
      for (let l of e3.loops) {
        if (l.next.v === v) {
          l = l.next;
        } else if (l.prev.v === v) {
          l = l.prev;
        }

        lvmap.set(l, nv);
      }

      if (v1 !== v) {
        key = "" + v.eid + ":" + ne.eid;
      }

      visit.add(key)
      //visit.add(v.eid + ":" + ne.eid);

      //visit.add(e2);
      //visit.add(ne);
    }
  }

  for (let e of edges) {
    for (let v of e.verts) {
      for (let e2 of v.edges) {
        for (let l of e2.loops) {
          fs2.add(l.f);
        }
      }
    }
  }

  for (let f of fs2) {
    for (let l of f.loops) {
      mesh._radialRemove(l.e, l);
    }
  }

  for (let i=0; i<0; i++) {
    for (let f of fs2) {
      // break;
      for (let list of f.lists) {
        let l = list.l;
        let _i = 0;

        do {
          let next = l.next;

          if (_i++ > MAX_FACE_VERTS) {
            console.error("Infinite loop error");
            break;
          }

          if (delvs.has(l.v)) {
            l.prev.next = l.next;
            l.next.prev = l.prev;

            if (l === list.l) {
              list.l = l.next;
              if (_i > 1) {
                break;
              }
            }

            if (l === list.l) {
              list.l = undefined;
            }

            mesh._killLoop(l);
          }

          l = next;
        } while (l !== list.l);
      }

      let fi = 0;
      for (let i = 0; i < f.lists.length; i++) {
        let list = f.lists[i];
        if (list.l) {
          f.lists[fi++] = list;
          list._recount();
        }
      }

      f.lists.length = fi;
      if (fi === 0) {
        this.killFace(f);
      }
    }
  }

  for (let f of fs2) {
    for (let l of f.loops) {
      let olde = l.e;
      l.e = mesh.ensureEdge(l.v, l.next.v, lctx);
      mesh._radialInsert(l.e, l);

      if (olde && olde !== l.e) {
        mesh.copyElemData(l.e, olde);
      }
    }
  }

  return {
    cornerMap, origVertMap, dirMap, origEdgeMap, lvmap
  };
}

export function splitEdgeLoops(mesh, edges=mesh.edges, vertWidthMap=new Map(), width=0.25, lctx) {
  if (!(edges instanceof Set)) {
    edges = new Set(edges);
  }

  let {lvmap} = splitEdgeLoops_pre(...arguments);

  let vs = new Set();
  let fs = new Set();

  for (let e of edges) {
    vs.add(e.v1);
    vs.add(e.v2);

    for (let l of e.loops) {
      fs.add(l.f);
    }
  }

  let vmap = new Map();
  let vmap2 = new Map();
  let vlmap = new Set();

  for (let [l, v] of lvmap) {
    vlmap.add(v);
  }

  let dirmap = new Map();
  let origmap = new Map();

  let t1 = new Vector3();
  let t2 = new Vector3();
  let t3 = new Vector3();
  let n = new Vector3();

  function getv(v, e, l) {
    if (lvmap.has(l)) {
      return;
    }

    let v2;
    t1.zero();

    if (v.valence === 2) {
      let ei = 0;

      if (l.v === v) {
        t2.load(l.v).sub(l.prev.v).normalize();
        t1.add(t2);
        t2.load(l.next.v).sub(l.v).normalize();
        t1.add(t2);
      } else {
        t2.load(l.next.v).sub(l.v).normalize();
        t1.add(t2);
        t2.load(l.next.next.v).sub(l.next.v).normalize();
        t1.add(t2);
      }

      t1.negate();
      t1.cross(l.f.no).normalize();

      //let key = "" + Math.min(l.eid, l.prev.eid) + ":" + Math.max(l.eid, l.prev.eid);
      let key = v.eid + ":" + l.f.eid;
      v2 = vmap2.get(key);

      if (!v2) {
        v2 = mesh.makeVertex(v);
        mesh.copyElemData(v2, v);
        vmap2.set(key, v2);

        dirmap.set(v2, new Vector3(t1));
      }
    } else if (e === l.e && !edges.has(l.prev.e)) {
      let l1 = l.prev, l2 = l.prev.radial_next;
      let l3 = l.next, l4 = l.next.radial_next;

      let ls = [l1.eid, l2.eid, l3.eid, l4.eid];
      ls.sort();
      let key = "" + ls[0] + ":" + ls[1] + ":" + ls[2] + ":" + ls[3];
      //let key = "" + Math.min(l1.f.eid, l2.f.eid) + ":" + Math.max(l1.f.eid, l2.f.eid);

      key = "" + l.v.eid + ":" + l.prev.e.eid;
      console.log(key);
      v2 = vmap.get(key);

      if (!v2) {
        v2 = mesh.makeVertex(v);
        mesh.copyElemData(v2, v);
        vmap.set(key, v2);

        t2.load(l.prev.v).sub(l.v).normalize();
        dirmap.set(v2, new Vector3(t2));
      }
    } else if (e !== l.e && !edges.has(l.e)) {
      let key = "" + v.eid + ":" + l.e.eid;

      console.log(key);
      v2 = vmap.get(key);

      if (!v2) {
        v2 = mesh.makeVertex(v);
        mesh.copyElemData(v2, v);
        vmap.set(key, v2);

        t2.load(l.next.v).sub(l.v).normalize();
        dirmap.set(v2, new Vector3(t2));
      }
    } else {
      if (l.v === v) {
        t1.load(l.next.v).sub(l.v).normalize();
        t2.load(l.prev.v).sub(l.v).normalize();
        t1.add(t2).normalize();
      } else {
        t1.load(l.next.next.v).sub(l.next.v).normalize();
        t2.load(l.v).sub(l.next.v).normalize();
        t1.add(t2).normalize();
      }

      v2 = mesh.makeVertex(v);
      mesh.copyElemData(v2, v);
      dirmap.set(v2, new Vector3(t1));
    }

    if (l.prev.v === v) {
      l = l.prev;
    } else if (l.next.v === v) {
      l = l.next;
    }

    lvmap.set(l, v2);
    vlmap.add(v2);
    origmap.set(l, v);

    return v2;
  }

  let fs2 = new Set();
  let ls = new Set();

  let origEdgeMap = new Map();
  let emap = new Map();

  for (let e of edges) {
    for (let l of e.loops) {
      fs2.add(l.f);

      emap.set(l, e);

      getv(l.v, e, l);
      getv(l.next.v, e, l.next);
      //getv(l.next.v, e, l.next);
    }

    for (let v of e.verts) {
      for (let e2 of v.edges) {
        if (edges.has(e2)) {
          continue;
        }

        for (let l of e2.loops) {
          if (l.next.v === v) {
            l = l.next;
          } else if (l.prev.v === v) {
            l = l.prev;
          }

          //getv(l.v, e, l);
          fs2.add(l.f);
        }
      }
    }
  }

  let edges2 = new Set(edges);

  let flag = MeshFlags.MAKE_FACE_TEMP;

  for (let f of fs2) {
    let count = 0;
    for (let l of f.loops) {
      count++;

      if (lvmap.has(l)) {
        l.flag |= flag;
      } else {
        l.flag &= ~flag;
      }
    }

    let ls = getArrayTemp(count, false);
    let i = 0;
    for (let l of f.loops) {
      ls[i++] = l;
    }

    for (let l of ls) {
      if (lvmap.has(l)) {
        continue;
      }

      if (l.flag & flag) {
        continue;
      }

      l.flag |= flag;

      let v = l.v;

      let l1 = l.radial_next;
      let l2 = l.prev.radial_next;

      if (l1.next.v === v) {
        l1 = l1.next;
      } else if (l1.prev.v === v) {
        l1 = l1.prev;
      }

      if (l2.next.v === v) {
        l2 = l2.next;
      } else if (l2.prev.v === v) {
        l2 = l2.prev;
      }

      let v1 = lvmap.get(l1);
      let v2 = lvmap.get(l2);

      let s1 = v1 && l1.f !== l.f;
      let s2 = v2 && l2.f !== l.f;

      if (v1 === v2) {
        s1 = (v1 !== v) && (l1 !== l || l2 !== l);
        s2 = false;
      }

      if (!s1 && !s2) {
        continue;
      }

      emap.set(l, l.e);

      vs.add(l.v);

      if (l.e) {
        edges2.add(l.e);
      }

      if (l.prev.e) {
        edges2.add(l.prev.e);
      }

      if (l.next.e) {
        edges2.add(l.next.e);
      }

      console.log("S1, S2:", s1, s2, l1, l2, l);

      if (s1 && s2) {
        let e = l.e;

        let l2 = mesh._makeLoop();

        l2.v = lvmap.get(l1);
        l2.e = mesh.ensureEdge(v1, v2, lctx);
        l2.f = l.f;
        l2.list = l.list;

        l2.prev = l;
        l2.next = l.next;
        l.next.prev = l2;
        l.next = l2;

        l2.flag |= flag;
        l2.radial_next = l2.radial_prev = l2;

        origmap.set(l2, v);

        mesh.copyElemData(l2, l);

        l.list.length++;

        lvmap.set(l, v2);
        lvmap.set(l2, v1);

        vlmap.add(v1);
        vlmap.add(v2);
      } else if (s1) {
        //lvmap.set(l, lvmap.get(l1));
      } else if (s2) {
        //lvmap.set(l, lvmap.get(l2));
      }
    }
  }

  let cflag = MeshFlags.TEMP1;
  let fs3 = new Set();
  let delvs = new Set();

  for (let e of edges) {
    for (let v of e.verts) {
      for (let e2 of v.edges) {
        let split = false;

        for (let l2 of e2.loops) {
          if (l2.next.v === v) {
            l2 = l2.next;
          } else if (l2.prev.v === v) {
            l2 = l2.prev;
          }

          if (lvmap.has(l2) || edges.has(e2)) {
            continue;
          }

          split = true;
          continue;
          let l3 = l2.radial_next;

          if (l3.next.v === v) {
            l3 = l3.next;
          } else if (l3.prev.v === v) {
            l3 = l3.prev;
          }

          if (l3.f === l2.f || !edges.has(l3.e)) {
            continue;
          }

          continue;

          let v2 = lvmap.get(l3);
          if (v2 && v2 !== v) {
            edges2.add(e2);

            lvmap.set(l2, v2);
            vlmap.add(v2);
            fs2.add(l2.f);
          }
          //getv(v, e2, l2);
        }

        for (let l2 of e2.loops) {
          if (l2.next.v === v) {
            l2 = l2.next;
          } else if (l2.prev.v === v) {
            l2 = l2.prev;
          }

          split = split && !edges.has(l2.e);
          split = split && !edges.has(l2.prev.e);

          let v1, v2;

          if (edges.has(l2.e)) {
            v1 = lvmap.get(l2);
          }

          if (edges.has(l2.prev.e)) {
            v2 = lvmap.get(l2.prev);
          }

          for (let l3 of e2.loops) {
            let l4 = l3;

            if (l3.next.v === v) {
              l3 = l3.next;
            } else if (l3.prev.v === v) {
              l3 = l3.prev;
            }

            if (v1 && !lvmap.has(l3)) {
              lvmap.set(l3, v1);
            }


          }
        }

        if (split && !vlmap.has(v)) {
          if (!vlmap.has(v)) {
            delvs.add(v);
          }

          let v1 = e2.v1, v2 = e2.v2;
          let [ne, nv] = mesh.splitEdge(e2, e2.v1 === v ? 0.1 : 0.9);

          for (let l2 of e2.loops) {
            for (let l3 of l2.f.loops) {
              if (l3.v !== nv) {
                l3.flag &= ~cflag;
              } else {
                l3.flag |= cflag;
              }
            }

            fs2.add(l2.f);
            fs3.add(l2.f);
          }
        }
      }
    }
  }

  for (let [l, e] of emap) {
    let arr = origEdgeMap.get(e.eid);

    if (!arr) {
      arr = [];
      origEdgeMap.set(e.eid, arr);
    }

    arr.push(l);
  }

  let origmap2 = new Map();
  let origVertMap = new Map();

  for (let [l, v] of origmap) {
    origVertMap.set(l, v.eid);

    let arr = origmap2.get(v.eid);
    if (!arr) {
      arr = [];
      origmap2.set(v.eid, arr);
    }

    arr.push(l);
  }

  for (let f of fs2) {
    for (let l of f.loops) {
      if (l.e) {
        mesh._radialRemove(l.e, l);
      }
    }
  }

  for (let f of fs3) {
    fs2.add(f);

    for (let list of f.lists) {
      let l = list.l;
      let _i = 0;

      do {
        let next = l.next;

        if (_i++ > MAX_FACE_VERTS) {
          console.error("Infinite loop error");
          break;
        }

        if (!lvmap.has(l) && delvs.has(l.v)) {
          l.prev.next = l.next;
          l.next.prev = l.prev;

          if (l === list.l) {
            list.l = l.next;
          }

          if (l === list.l) {
            list.l = undefined;
          }

          mesh._killLoop(l);
        }

        l = next;
      } while (l !== list.l);
    }

    let fi = 0;
    for (let i=0; i<f.lists.length; i++) {
      let list = f.lists[i];
      if (list.l) {
        f.lists[fi++] = list;
        list._recount();
      }
    }

    f.lists.length = fi;
    if (fi === 0) {
      this.killFace(f);
    }
  }

  for (let f of fs2) {
    for (let l of f.loops) {
      let v = lvmap.get(l);

      if (v) {
        l.v = v;
      }
    }
  }

  for (let f of fs2) {
    for (let l of f.loops) {
      let olde = l.e;

      if (l.v === l.next.v) {
        mesh._fixFace(f, lctx);
        break;
      }

      l.e = mesh.ensureEdge(l.v, l.next.v, lctx);
      if (olde) {
        mesh.copyElemData(l.e, olde);
      }

      mesh._radialInsert(l.e, l);
    }
  }

  for (let e of edges2) {
    if (!e.l) {
      mesh.killEdge(e);
    }
  }

  for (let v of vs) {
    if (v.valence === 0) {
      //mesh.killVertex(v);
    }
  }

  return {dirMap : dirmap, cornerMap : origmap2, origEdgeMap, origVertMap : origVertMap};
}

export function bevelEdges(mesh, edges, width=0.5, lctx) {
  edges = new Set(edges);

  let {dirMap, cornerMap, origEdgeMap, origVertMap} = splitEdgeLoops(mesh, edges, undefined, width, lctx);

  console.log("dirMap", dirMap);
  console.log("cornerMap", cornerMap);
  console.log("origEdgeMap", origEdgeMap);
  console.log("origVertMap", origVertMap);

  for (let [v, dir] of dirMap) {
    //console.log(v, dir);

    v.addFac(dir, 0.5);
    v.flag |= MeshFlags.UPDATE;
  }

  for (let [eid, ls] of origEdgeMap) {
    if (ls.length < 2) {
      continue;
    }

    let len = ls.length === 2 ? 1 : ls.length;

    for (let i=0; i<len; i++) {
      let l1 = ls[i];
      let l2 = ls[(i+1) % ls.length];

      let v1 = origVertMap.get(l1.v);
      let v2 = origVertMap.get(l2.v);

      if (l1.f === l2.f) {
        continue;
      }

      if (v1 === v2) {
        try {
          mesh.makeQuad(l1.v, l2.next.v, l2.v, l1.next.v);
        } catch (error) {
          util.print_stack(error);
        }
      } else {

      }
    }

  }
  //for (let
}

export class BevelOp extends MeshOp {
  static tooldef() {return {
    uiname : "Bevel",
    toolpath : "mesh.bevel",
    inputs : ToolOp.inherit({
    })
  }}

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      bevelEdges(mesh, mesh.edges.selected.editable);

      mesh.regenAll();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}
ToolOp.register(BevelOp);
