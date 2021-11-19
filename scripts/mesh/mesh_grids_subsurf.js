import {GridSettingFlags, GridBase, Grid, QRecalcFlags} from "./mesh_grids.js";
import {CustomData, CustomDataElem, LayerSettingsBase} from "./customdata.js";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {ChunkedSimpleMesh} from "../core/simplemesh.js";
import {FloatElem} from "./mesh_customdata.js";
import {MeshError} from "./mesh_base.js";
import {Patch4, CubicPatch, bernstein, bspline} from "../subsurf/subsurf_patch.js";
import {subdivide} from "../subsurf/subsurf_mesh.js";
import {BinomialTable} from "../util/binomial_table.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {ccSmooth} from '../subsurf/subsurf_mesh.js';
import {getDynVerts} from '../util/bvh.js';
import {getFaceSets} from './mesh_facesets.js';

export class PatchBuilder {
  constructor(mesh, cd_grid) {
    this.mesh = mesh;
    this.quads = new Map();
    this.cd_grid = cd_grid;
    this.patches = new Map();
    this.flens = new Map();

    this.cd_dyn_vert = getDynVerts(mesh);
    this.cd_fset = getFaceSets(mesh, false);
  }

  buildQuad(l, margin = 0.0) {
    const cd_fset = this.cd_fset, cd_dyn_vert = this.cd_dyn_vert;

    function getv(l) {
      return ccSmooth(l.v, cd_fset, cd_dyn_vert);
      let v = new Vector3();

      let tot = l.v.valence;
      v.addFac(l.v, tot);

      for (let e of l.v.edges) {
        let v2 = e.otherVertex(l.v);
        v.add(v2);
        tot++;
      }

      if (tot) {
        v.mulScalar(1.0 / tot);
        return v;
      } else {
        v.load(l.v);
      }

      return v;
    }

    function edgev(l) {
      return l.v;
      let co = new Vector3();

      co.load(l.v);
      return ccSmooth(l.v, cd_fset, cd_dyn_vert);
      return l.v;
    }

    let p1 = new Vector3(l.f.cent);
    let p2 = new Vector3(l.v).interp(edgev(l.prev), 0.5);
    let p3 = new Vector3(getv(l));
    let p4 = new Vector3(l.v).interp(edgev(l.next), 0.5);

    let c = new Vector3(p1).add(p2).add(p3).add(p4).mulScalar(0.25);
    p1.sub(c).mulScalar(1.0 + margin).add(c);
    p2.sub(c).mulScalar(1.0 + margin).add(c);
    p3.sub(c).mulScalar(1.0 + margin).add(c);
    p4.sub(c).mulScalar(1.0 + margin).add(c);

    return [p1, p2, p3, p4];
  }

  getQuad(l) {
    let quad = this.quads.get(l);

    if (!quad) {
      for (let l2 of this.mesh.loops) {
        if (l2.eid === l.eid) {
          console.log(l2);
        }
      }
      console.warn(l, l.eid)

      throw new Error("eek");
      quad = this.buildQuad(l);
      this.quads.set(l, quad);
    }

    return quad;
  }

  buildPatch(l) {
    let patch = new CubicPatch();

    let q1 = this.quads.get(l);

    q1 = this.buildQuad(l, 0.0);

    function setall(p, x1, y1) {
      for (let x = x1; x < x1 + 2; x++) {
        for (let y = y1; y < y1 + 2; y++) {
          patch.setPoint(x, y, p);
        }
      }
    }

    //*
    let q2 = this.buildQuad(l, 0.0);
    setall(q2[0], 0, 0);
    setall(q2[1], 0, 2);
    setall(q2[2], 2, 2);
    setall(q2[3], 2, 0);
    //*/

    //*
    patch.setPoint(1, 1, q1[0]);
    patch.setPoint(1, 2, q1[1]);
    patch.setPoint(2, 2, q1[2]);
    patch.setPoint(2, 1, q1[3]);
    //*/

    this.patches.set(l, patch);
    let bad = l.v.valence !== 4 || l.v.isBoundary();// || l.next.next.v.valence !== 4;

    if (bad) {
      patch.basis = bernstein;
      return;
    }
    //return;

    let nocheck = true;

    if (nocheck || l.next.v.valence === 4) {
      let l2 = l.radial_next;
      let q2 = this.getQuad(l2);

      patch.setPoint(3, 0, q2[1]);
      patch.setPoint(3, 1, q2[0]);

      l2 = l2.next;
      q2 = this.getQuad(l2);

      patch.setPoint(3, 2, q2[3]);
    }

    let flen = this.flens.get(l);

    if (nocheck || flen === 4) {
      let l2 = l.next;
      let q2 = this.getQuad(l2);

      patch.setPoint(1, 0, q2[3]);
      patch.setPoint(2, 0, q2[2]);

      l2 = l.next.next;
      q2 = this.getQuad(l2);
      patch.setPoint(0, 0, q2[2]);
      patch.setPoint(0, 1, q2[3]);

      l2 = l.prev;
      q2 = this.getQuad(l2);
      patch.setPoint(0, 2, q2[2]);
    }

    if (nocheck || l.prev.v.valence === 4) {
      let l2 = l.prev.radial_next;
      let q2 = this.getQuad(l2);

      patch.setPoint(2, 3, q2[1]);
      patch.setPoint(1, 3, q2[0]);

      l2 = l2.next;
      q2 = this.getQuad(l2);
      patch.setPoint(0, 3, q2[3]);
    }

    if (nocheck || l.v.valence === 4) {
      let l2 = l.radial_next.next.radial_next.next;
      let q2 = this.getQuad(l2);

      patch.setPoint(3, 3, q2[0]);
    }
    this.patches.set(l, patch);
  }

  build() {
    let oldmesh = this.mesh;

    let mesh = this.mesh = oldmesh.copy(undefined, true);
    let lmap = subdivide(mesh).oldLoopEidsToQuads;

    mesh.recalcNormals();

    for (let l of mesh.loops) {
      let i = 0;
      for (let l2 of l.f.loops) {
        i++;
      }

      this.flens.set(l, i);
      this.quads.set(l, this.buildQuad(l));
    }

    for (let l of mesh.loops) {
      this.buildPatch(l);
    }

    let t = new Vector3();
    let co = new Vector3();
    let co2 = new Vector3();
    let co3 = new Vector3();
    let co4 = new Vector3();

    for (let f of mesh.faces) {
      f.calcCent();
    }

    const cd_fset = this.cd_fset, cd_dyn_vert = this.cd_dyn_vert;

    function vsmooth(v) {
      return ccSmooth(v, cd_fset, cd_dyn_vert);

      let lco = new Vector3();
      let w1 = v.valence*0.75;
      let w2 = 1.0;
      let tot = w1;

      lco.zero().addFac(v, w1);

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);
        lco.addFac(v2, w2);
        tot += w2;
      }
      lco.mulScalar(1.0 / tot);

      return lco;
    }

    for (let l of mesh.loops) {
      if (l.v.valence === 4) {
        continue;
      }

      let p = this.patches.get(l);

      //XXX
      if (p.basis === bernstein) {
        continue
      }

      let lco = vsmooth(l.v);

      let l2 = l.radial_next.next;
      let p2 = this.patches.get(l2);

      let l3 = l.prev.radial_next;
      let p3 = this.patches.get(l3);

      let w1, w2, w3;
      w1 = 1;
      w2 = 1.0 / 3.0;
      w3 = w2;
      co.zero();
      co.load(l.v).interp(l.next.v, 0.5).mulScalar(w1);
      co.addFac(l.f.cent, w2);
      co.addFac(l.radial_next.f.cent, w3);
      co.mulScalar(1.0 / (w1 + w2 + w3));

      p.setPoint(3, 0, co);
      p2.setPoint(0, 3, co);

      co2.load(lco).interp(co, 2.0 / 3.0);
      p.setPoint(3, 1, co2);
      p2.setPoint(1, 3, co2);

      co2.load(lco).interp(co, 1.0 / 3.0);
      p.setPoint(3, 2, co2);
      p2.setPoint(2, 3, co2);

      p.setPoint(3, 3, lco);
      p2.setPoint(3, 3, lco);
    }

    let brets = util.cachering.fromConstructor(Vector3, 64);
    let bt1 = new Vector3();
    let bt2 = new Vector3();
    function bilinear(v1, v2, v3, v4, u, v) {
      bt1.load(v1).interp(v2, v);
      bt2.load(v4).interp(v3, v);
      let ret = brets.next();

      ret.load(bt1).interp(bt2, u);
      return ret;
    }

    for (let l of mesh.loops) {
      if (l.v.valence === 4) {
        continue;
      }

      let p = this.patches.get(l);

      //XXX
      if (p.basis === bernstein) {
        continue
      }

      let v1 = p.getPoint(0, 0);
      let v2 = p.getPoint(0, 3);
      let v3 = p.getPoint(3, 3);
      let v4 = p.getPoint(3, 0);

      let a = bilinear(v1, v2, v3, v4, 1.0/3.0, 1.0/3.0);
      let b = bilinear(v1, v2, v3, v4, 1.0/3.0, 2.0/3.0);
      let c = bilinear(v1, v2, v3, v4, 2.0/3.0, 2.0/3.0);
      let d = bilinear(v1, v2, v3, v4, 2.0/3.0, 1.0/3.0);

      p.setPoint(1, 1, a);
      p.setPoint(1, 2, b);
      p.setPoint(2, 2, c);
      p.setPoint(2, 1, d);
    }

    for (let l of mesh.loops) {
      if (l.v.valence === 4) {
        continue;
      }

      let p = this.patches.get(l);

      //XXX
      if (p.basis === bernstein) {
        continue;
      }

      let l2 = l.radial_next.next;
      let p2 = this.patches.get(l2);

      let l3 = l.prev.radial_next;
      let p3 = this.patches.get(l3);

      let a = p.getPoint(3, 1);
      let b = p.getPoint(3, 2);

      let v1 = p.getPoint(2, 1);
      let v2 = p.getPoint(2, 2);
      let v3 = p2.getPoint(1, 2);
      let v4 = p2.getPoint(2, 2);

      let wt = 0.75;

      t.load(v3).sub(v1).mulScalar(wt);
      let a2 = new Vector3(a).sub(t);
      let a3 = new Vector3(a).add(t);

      t.load(v4).sub(v2).mulScalar(wt);
      let b2 = new Vector3(b).sub(t);
      let b3 = new Vector3(b).add(t);

      p.setPoint(2, 1, a2);
      p.setPoint(2, 2, b2);

      p2.setPoint(1, 2, a3);
      p2.setPoint(2, 2, b3);
    }

    for (let l of mesh.loops) {
      //XXX
      //break;

      let p = this.patches.get(l);

      if (p.basis !== bernstein || l.v.isBoundary()) {
        continue;
      }

      let uvs = [[0, 0], [0, 1], [1, 1], [1, 0]];
      uvs = uvs.map(f => new Vector2(f));

      let l2 = l.next;
      let p2 = this.patches.get(l2);

      if (l.v.valence !== 4) {
        function findClosest(u, v, dt, steps) {
          let list = [];
          let m1 = new Vector2([u, v]);
          let co1 = new Vector3(p.evaluate(m1[0], m1[1]));

          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              for (let j2 = 0; j2 < steps; j2++) {
                let u3 = uvs[j], u4 = uvs[(j + 1) % 4];
                let m2 = new Vector2(u3).interp(u4, (j2 + 1) * dt);
                let co2 = p2.evaluate(m2[0], m2[1]);

                list.push({
                  dist: co1.vectorDistance(co2),
                  u2: m2[0],
                  v2: m2[1],
                  //u1: m1[0],
                  //v1: m1[1],
                  //u : u,
                  //v : v
                });
              }

            }
          }

          list.sort((a, b) => a.dist - b.dist);
          return list[0];
        }

        //console.log("-", findClosest(1.0 / 3.0, 0.0, 1.0 / 3.0, 2));
        //console.log("=", findClosest(2.0 / 3.0, 0.0, 1.0 / 3.0, 2));

        let v1 = p2.evaluate(0.0, 1.0 / 3.0);
        let v2 = p2.evaluate(0.0, 2.0 / 3.0);

        p.setPoint(1, 0, v1);
        p.setPoint(2, 0, v2);

        v1 = p2.evaluate(0.0, 0.0);
        v2 = p2.evaluate(0.0, 1.0);

        let a = new Vector3(v1);
        p.setPoint(0, 0, v1);
        p.setPoint(3, 0, v2);

        //console.log(p2.basis);
        //console.log("-", findClosest(0.0, 0.0, 1.0 / 6.0, 5));
        //console.log("=", findClosest(1.0, 0.0, 1.0 / 6.0, 5));

        l2 = l.prev;
        p2 = this.patches.get(l2);

        /*
        console.log("1", findClosest(0.0, 0.0, 1.0 / 6.0, 5));
        console.log("2", findClosest(0.0, 1 / 3, 1.0 / 6.0, 5));
        console.log("3", findClosest(0.0, 2 / 3, 1.0 / 6.0, 5));
        console.log("4", findClosest(0.0, 1.0, 1.0 / 6.0, 5));
        */

        v1 = p2.evaluate(0.0, 0.0);
        a.interp(v1, 0.5);
        p.setPoint(0, 0, a);

        v1 = p2.evaluate(1.0 / 3.0, 0.0);
        v2 = p2.evaluate(2.0 / 3.0, 0.0);

        p.setPoint(0, 1, v1);
        p.setPoint(0, 2, v2);

        v1 = p2.evaluate(1.0, 0.0);
        p.setPoint(0, 3, v1);

        //p.setPoint(1, 1, v1);
        //p.setPoint(2, 1, v2);

        //console.log(p2.basis);
      }

      let pb = p._patch;
      let old = [];
      for (let i=0; i<pb.length; i++) {
        old.push(pb[i]);
      }

      for (let x = 1; x <= 2; x++) {
        break;
        for (let y = 1; y <= 2; y++) {
          let idx1 = (y*4 + x)*3;
          let sum = new Vector3();
          let tot = 0.0;

          if (x === 0 || y === 0) {
            continue;
          }
          for (let x2 = x - 1; x2 <= x + 1; x2++) {
            for (let y2 = y - 1; y2 < y + 1; y2++) {
              if (x2 < 0 || y2 < 0 || x2 > 3 || y2 > 3) {
                continue;
              }
              let idx2 = (y2*4 + x2)*3;

              sum[0] += old[idx2];
              sum[1] += old[idx2+1];
              sum[2] += old[idx2+2];
              tot++;

            }
          }

          sum.mulScalar(1.0/tot);
          //console.log(sum);

          let fac = 0.5;
          pb[idx1] += (sum[0] - pb[idx1])*fac
          pb[idx1+1] += (sum[1] - pb[idx1+1])*fac
          pb[idx1+2] += (sum[2] - pb[idx1+2])*fac
        }
      }
    }


    let patches = this.patches;

    this.patches = new Map();
    this.quads = new Map();

    this.mesh = oldmesh;

    for (let [eid, f] of lmap) {
      let l = oldmesh.eidmap[eid];

      if (!l) {
        throw new Error("l was undefined");
      }

      let l2 = f.lists[0].l;
      let p1 = patches.get(l2);
      let p2 = patches.get(l2.next);
      let p3 = patches.get(l2.next.next);
      let p4 = patches.get(l2.prev);

      //this.patches.set(l, p2);
      this.patches.set(l, new Patch4(p1, p2, p3, p4));
      //this.patches.set(l, new Patch4(p4, p3, p3, p1));
    }
  }
}

export function buildGridsSubSurf(mesh, setColor) {
  //let cd_grid = GridBase.meshGridOffset(mesh);
  let cd_grid = mesh.loops.customData.getLayerIndex(Grid);

  if (cd_grid < 0) {
    throw new MeshError("No grids");
  }

  let builder = new PatchBuilder(mesh, cd_grid);

  builder.build();

  console.log("patches", builder.patches);

  for (let l of mesh.loops) {
    let grid = l.customData[cd_grid];
    grid.recalcFlag |= QRecalcFlags.ALL;
    grid.update(mesh, l, cd_grid);
  }

  let cd_color = mesh.loops.customData.getLayerIndex("color");
  if (!setColor) {
    cd_color = -1;
  }

  for (let l of mesh.loops) {
    let grid = l.customData[cd_grid];
    grid.update(mesh, l, cd_grid);

    let ps = grid.points;
    let dimen = grid.dimen;

    let patch = builder.patches.get(l);

    for (let x = 0; x < dimen; x++) {
      let u = x / (dimen - 1);

      for (let y = 0; y < dimen; y++) {
        let v = y / (dimen - 1);

        let pi = y * dimen + x;
        let p = ps[pi];

        if (cd_color >= 0) {
          let color = p.customData[cd_color].color;
          color[0] = u;
          color[1] = v;
        }

        let co = patch.evaluate(u, v);
        p.load(co, true);
      }
    }

    grid.recalcFlag |= QRecalcFlags.ALL;
  }

  for (let l of mesh.loops) {
    let grid = l.customData[cd_grid];
    grid.update(mesh, l, cd_grid);
  }
}
