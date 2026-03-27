import {Grid, GridVert, QRecalcFlags} from './mesh_grids.js'
import {AttrRef, CDRef} from './customdata'
import {ColorLayerElem, IntElem} from './mesh_customdata.js'
import {MeshError} from './mesh_base.js'
import {Patch4, CubicPatch, bernstein, PatchBase} from '../subsurf/subsurf_patch.js'
import {subdivide} from '../subsurf/subsurf_mesh.js'
import {Vector2, Vector3, util} from '../path.ux/scripts/pathux.js'
import {ccSmooth} from '../subsurf/subsurf_mesh.js'
import {getDynVerts, MDynVert} from '../util/bvh'
import {getFaceSets} from './mesh_facesets.js'
import {Loop, Mesh, Vertex} from './mesh'

export class PatchBuilder {
  mesh: Mesh
  quads: Map<Loop, Vector3[]>
  cd_grid: AttrRef<Grid>
  patches: Map<Loop, PatchBase>
  flens: Map<Loop, number>
  cd_dyn_vert: CDRef<MDynVert>
  cd_fset: CDRef<IntElem>

  constructor(mesh: Mesh, cd_grid: AttrRef<Grid>) {
    this.mesh = mesh
    this.quads = new Map()
    this.cd_grid = cd_grid
    this.patches = new Map()
    this.flens = new Map()

    this.cd_dyn_vert = getDynVerts(mesh)
    this.cd_fset = getFaceSets(mesh, false)
  }

  buildQuad(l: Loop, margin = 0.0): Vector3[] {
    const cd_fset = this.cd_fset,
      cd_dyn_vert = this.cd_dyn_vert

    function getv(l: Loop) {
      return ccSmooth(l.v, cd_fset, cd_dyn_vert)
      /*
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
       */
    }

    function edgev(l: Loop) {
      return l.v
      const co = new Vector3()

      co.load(l.v.co)
      return ccSmooth(l.v, cd_fset, cd_dyn_vert)
      return l.v
    }

    const p1 = new Vector3(l.f.cent)
    const p2 = new Vector3(l.v.co).interp(edgev(l.prev), 0.5)
    const p3 = new Vector3(getv(l))
    const p4 = new Vector3(l.v.co).interp(edgev(l.next), 0.5)

    const c = new Vector3(p1).add(p2).add(p3).add(p4).mulScalar(0.25)
    p1.sub(c)
      .mulScalar(1.0 + margin)
      .add(c)
    p2.sub(c)
      .mulScalar(1.0 + margin)
      .add(c)
    p3.sub(c)
      .mulScalar(1.0 + margin)
      .add(c)
    p4.sub(c)
      .mulScalar(1.0 + margin)
      .add(c)

    return [p1, p2, p3, p4]
  }

  getQuad(l: Loop): Vector3[] {
    let quad = this.quads.get(l)

    if (!quad) {
      for (const l2 of this.mesh.loops) {
        if (l2.eid === l.eid) {
          console.log(l2)
        }
      }
      console.warn(l, l.eid)

      throw new Error('eek')
    }

    return quad
  }

  buildPatch(l: Loop): void {
    const patch = new CubicPatch()

    let q1 = this.quads.get(l)

    q1 = this.buildQuad(l, 0.0)

    function setall(p: Vector3, x1: number, y1: number): void {
      for (let x = x1; x < x1 + 2; x++) {
        for (let y = y1; y < y1 + 2; y++) {
          patch.setPoint(x, y, p)
        }
      }
    }

    //*
    const q2 = this.buildQuad(l, 0.0)
    setall(q2[0], 0, 0)
    setall(q2[1], 0, 2)
    setall(q2[2], 2, 2)
    setall(q2[3], 2, 0)
    //*/

    //*
    patch.setPoint(1, 1, q1[0])
    patch.setPoint(1, 2, q1[1])
    patch.setPoint(2, 2, q1[2])
    patch.setPoint(2, 1, q1[3])
    //*/

    this.patches.set(l, patch as unknown as PatchBase)
    const bad = l.v.valence !== 4 || l.v.isBoundary() // || l.next.next.v.valence !== 4;

    if (bad) {
      patch.basis = bernstein
      return
    }
    //return;

    const nocheck = true

    if (nocheck || l.next.v.valence === 4) {
      let l2 = l.radial_next
      let q2 = this.getQuad(l2)

      patch.setPoint(3, 0, q2[1])
      patch.setPoint(3, 1, q2[0])

      l2 = l2.next
      q2 = this.getQuad(l2)

      patch.setPoint(3, 2, q2[3])
    }

    const flen = this.flens.get(l)

    if (nocheck || flen === 4) {
      let l2 = l.next
      let q2 = this.getQuad(l2)

      patch.setPoint(1, 0, q2[3])
      patch.setPoint(2, 0, q2[2])

      l2 = l.next.next
      q2 = this.getQuad(l2)
      patch.setPoint(0, 0, q2[2])
      patch.setPoint(0, 1, q2[3])

      l2 = l.prev
      q2 = this.getQuad(l2)
      patch.setPoint(0, 2, q2[2])
    }

    if (nocheck || l.prev.v.valence === 4) {
      let l2 = l.prev.radial_next
      let q2 = this.getQuad(l2)

      patch.setPoint(2, 3, q2[1])
      patch.setPoint(1, 3, q2[0])

      l2 = l2.next
      q2 = this.getQuad(l2)
      patch.setPoint(0, 3, q2[3])
    }

    if (nocheck || l.v.valence === 4) {
      const l2 = l.radial_next.next.radial_next.next
      const q2 = this.getQuad(l2)

      patch.setPoint(3, 3, q2[0])
    }
    this.patches.set(l, patch as unknown as PatchBase)
  }

  build() {
    const oldmesh = this.mesh

    /* Create mesh copy with no customdata layers. */
    const mesh = (this.mesh = oldmesh.copy(false))

    /* Copy over dyntopo verts. */
    const cd_dyn_vert_old = this.cd_dyn_vert
    const cd_dyn_vert_new = (this.cd_dyn_vert = getDynVerts(mesh))

    for (const v of mesh.verts) {
      const v2 = oldmesh.eidMap.get<Vertex>(v.eid)
      v2.customData[cd_dyn_vert_old].copyTo(v.customData[cd_dyn_vert_new])
    }

    const lmap = subdivide(mesh).oldLoopEidsToQuads

    mesh.recalcNormals()

    for (const l of mesh.loops) {
      let i = 0
      for (const l2 of l.f.loops) {
        i++
      }

      this.flens.set(l, i)
      this.quads.set(l, this.buildQuad(l))
    }

    for (const l of mesh.loops) {
      this.buildPatch(l)
    }

    const t = new Vector3()
    const co = new Vector3()
    const co2 = new Vector3()
    const co3 = new Vector3()
    const co4 = new Vector3()

    for (const f of mesh.faces) {
      f.calcCent()
    }

    const cd_fset = this.cd_fset,
      cd_dyn_vert = this.cd_dyn_vert

    function vsmooth(v: Vertex) {
      return ccSmooth(v, cd_fset, cd_dyn_vert)
      ;`
      const lco = new Vector3()
      const w1 = v.valence * 0.75
      const w2 = 1.0
      let tot = w1

      lco.zero().addFac(v.co, w1)

      for (const e of v.edges) {
        const v2 = e.otherVertex(v)
        lco.addFac(v2.co, w2)
        tot += w2
      }
      lco.mulScalar(1.0 / tot)

      return lco`
    }

    for (const l of mesh.loops) {
      if (l.v.valence === 4) {
        continue
      }

      const p = this.patches.get(l)!

      //XXX
      if (p.basis === bernstein) {
        continue
      }

      const lco = vsmooth(l.v)

      const l2 = l.radial_next.next
      const p2 = this.patches.get(l2)!

      const l3 = l.prev.radial_next
      //const p3 = this.patches.get(l3)!

      let w1, w2, w3
      w1 = 1
      w2 = 1.0 / 3.0
      w3 = w2
      co.zero()
      co.load(l.v.co).interp(l.next.v.co, 0.5).mulScalar(w1)
      co.addFac(l.f.cent, w2)
      co.addFac(l.radial_next.f.cent, w3)
      co.mulScalar(1.0 / (w1 + w2 + w3))

      p.setPoint(3, 0, co)
      p2.setPoint(0, 3, co)

      co2.load(lco).interp(co, 2.0 / 3.0)
      p.setPoint(3, 1, co2)
      p2.setPoint(1, 3, co2)

      co2.load(lco).interp(co, 1.0 / 3.0)
      p.setPoint(3, 2, co2)
      p2.setPoint(2, 3, co2)

      p.setPoint(3, 3, lco)
      p2.setPoint(3, 3, lco)
    }

    const brets = util.cachering.fromConstructor(Vector3, 64)
    const bt1 = new Vector3()
    const bt2 = new Vector3()

    function bilinear(v1: Vector3, v2: Vector3, v3: Vector3, v4: Vector3, u: number, v: number) {
      bt1.load(v1).interp(v2, v)
      bt2.load(v4).interp(v3, v)
      const ret = brets.next()

      ret.load(bt1).interp(bt2, u)
      return ret
    }

    for (const l of mesh.loops) {
      if (l.v.valence === 4) {
        continue
      }

      const p = this.patches.get(l)!

      //XXX
      if (p.basis === bernstein) {
        continue
      }

      const v1 = p.getPoint(0, 0)
      const v2 = p.getPoint(0, 3)
      const v3 = p.getPoint(3, 3)
      const v4 = p.getPoint(3, 0)

      const a = bilinear(v1, v2, v3, v4, 1.0 / 3.0, 1.0 / 3.0)
      const b = bilinear(v1, v2, v3, v4, 1.0 / 3.0, 2.0 / 3.0)
      const c = bilinear(v1, v2, v3, v4, 2.0 / 3.0, 2.0 / 3.0)
      const d = bilinear(v1, v2, v3, v4, 2.0 / 3.0, 1.0 / 3.0)

      p.setPoint(1, 1, a)
      p.setPoint(1, 2, b)
      p.setPoint(2, 2, c)
      p.setPoint(2, 1, d)
    }

    for (const l of mesh.loops) {
      if (l.v.valence === 4) {
        continue
      }

      const p = this.patches.get(l)!

      //XXX
      if (p.basis === bernstein) {
        continue
      }

      const l2 = l.radial_next.next
      const p2 = this.patches.get(l2)!

      const l3 = l.prev.radial_next
      //const p3 = this.patches.get(l3)

      const a = p.getPoint(3, 1)
      const b = p.getPoint(3, 2)

      const v1 = p.getPoint(2, 1)
      const v2 = p.getPoint(2, 2)
      const v3 = p2.getPoint(1, 2)
      const v4 = p2.getPoint(2, 2)

      const wt = 0.75

      t.load(v3).sub(v1).mulScalar(wt)
      const a2 = new Vector3(a).sub(t)
      const a3 = new Vector3(a).add(t)

      t.load(v4).sub(v2).mulScalar(wt)
      const b2 = new Vector3(b).sub(t)
      const b3 = new Vector3(b).add(t)

      p.setPoint(2, 1, a2)
      p.setPoint(2, 2, b2)

      p2.setPoint(1, 2, a3)
      p2.setPoint(2, 2, b3)
    }

    for (const l of mesh.loops) {
      const p = this.patches.get(l)!

      if (p.basis !== bernstein || l.v.isBoundary()) {
        continue
      }

      const uvs = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ].map((f) => new Vector2(f))

      let l2 = l.next
      let p2 = this.patches.get(l2)!

      if (l.v.valence !== 4) {
        function findClosest(u: number, v: number, dt: number, steps: number) {
          const list = []
          const m1 = new Vector2([u, v])
          const co1 = new Vector3(p.evaluate(m1[0], m1[1]))

          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              for (let j2 = 0; j2 < steps; j2++) {
                const u3 = uvs[j],
                  u4 = uvs[(j + 1) % 4]
                const m2 = new Vector2(u3).interp(u4, (j2 + 1) * dt)
                const co2 = p2.evaluate(m2[0], m2[1])

                list.push({
                  dist: co1.vectorDistance(co2),
                  u2  : m2[0],
                  v2  : m2[1],
                  //u1: m1[0],
                  //v1: m1[1],
                  //u : u,
                  //v : v
                })
              }
            }
          }

          list.sort((a, b) => a.dist - b.dist)
          return list[0]
        }

        //console.log("-", findClosest(1.0 / 3.0, 0.0, 1.0 / 3.0, 2));
        //console.log("=", findClosest(2.0 / 3.0, 0.0, 1.0 / 3.0, 2));

        let v1 = p2.evaluate(0.0, 1.0 / 3.0)
        let v2 = p2.evaluate(0.0, 2.0 / 3.0)

        p.setPoint(1, 0, v1)
        p.setPoint(2, 0, v2)

        v1 = p2.evaluate(0.0, 0.0)
        v2 = p2.evaluate(0.0, 1.0)

        const a = new Vector3(v1)
        p.setPoint(0, 0, v1)
        p.setPoint(3, 0, v2)

        //console.log(p2.basis);
        //console.log("-", findClosest(0.0, 0.0, 1.0 / 6.0, 5));
        //console.log("=", findClosest(1.0, 0.0, 1.0 / 6.0, 5));

        l2 = l.prev
        p2 = this.patches.get(l2)!

        /*
        console.log("1", findClosest(0.0, 0.0, 1.0 / 6.0, 5));
        console.log("2", findClosest(0.0, 1 / 3, 1.0 / 6.0, 5));
        console.log("3", findClosest(0.0, 2 / 3, 1.0 / 6.0, 5));
        console.log("4", findClosest(0.0, 1.0, 1.0 / 6.0, 5));
        */

        v1 = p2.evaluate(0.0, 0.0)
        a.interp(v1, 0.5)
        p.setPoint(0, 0, a)

        v1 = p2.evaluate(1.0 / 3.0, 0.0)
        v2 = p2.evaluate(2.0 / 3.0, 0.0)

        p.setPoint(0, 1, v1)
        p.setPoint(0, 2, v2)

        v1 = p2.evaluate(1.0, 0.0)
        p.setPoint(0, 3, v1)

        //p.setPoint(1, 1, v1);
        //p.setPoint(2, 1, v2);

        //console.log(p2.basis);
      }

      const pb = p._patch
      const old = []
      for (let i = 0; i < pb.length; i++) {
        old.push(pb[i])
      }

      /*
      for (let x = 1; x <= 2; x++) {
        for (let y = 1; y <= 2; y++) {
          let idx1 = (y * 4 + x) * 3;
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
              let idx2 = (y2 * 4 + x2) * 3;

              sum[0] += old[idx2];
              sum[1] += old[idx2 + 1];
              sum[2] += old[idx2 + 2];
              tot++;

            }
          }

          sum.mulScalar(1.0 / tot);
          //console.log(sum);

          let fac = 0.5;
          pb[idx1] += (sum[0] - pb[idx1]) * fac
          pb[idx1 + 1] += (sum[1] - pb[idx1 + 1]) * fac
          pb[idx1 + 2] += (sum[2] - pb[idx1 + 2]) * fac
        }
      }
      */
    }

    const patches = this.patches

    this.patches = new Map()
    this.quads = new Map()

    this.mesh = oldmesh

    for (const [eid, f] of lmap) {
      const l = oldmesh.eidMap.get<Loop>(eid)

      if (!l) {
        throw new Error('l was undefined')
      }

      const l2 = f.lists[0].l
      const p1 = patches.get(l2)!
      const p2 = patches.get(l2.next)!
      const p3 = patches.get(l2.next.next)!
      const p4 = patches.get(l2.prev)!

      //this.patches.set(l, p2);
      this.patches.set(l, new Patch4(p1, p2, p3, p4))
      //this.patches.set(l, new Patch4(p4, p3, p3, p1));
    }
  }
}

export function buildGridsSubSurf(mesh: Mesh, setColor = false) {
  //let cd_grid = GridBase.meshGridOffset(mesh);
  const gridAttr = mesh.loops.customData.getLayerRef(Grid)

  if (gridAttr.i < 0) {
    throw new MeshError('No grids')
  }

  const builder = new PatchBuilder(mesh, gridAttr)

  builder.build()

  console.log('patches', builder.patches)

  for (const l of mesh.loops) {
    const grid = l.customData[gridAttr.i] as Grid
    grid.recalcFlag |= QRecalcFlags.ALL
    grid.update(mesh, l, gridAttr)
  }

  let cd_color = mesh.loops.customData.getLayerIndex('color')
  if (!setColor) {
    cd_color = -1
  }

  for (const l of mesh.loops) {
    const grid = l.customData[gridAttr.i] as Grid
    grid.update(mesh, l, gridAttr)

    const ps = grid.points
    const dimen = grid.dimen

    const patch = builder.patches.get(l)!

    for (let x = 0; x < dimen; x++) {
      const u = x / (dimen - 1)

      for (let y = 0; y < dimen; y++) {
        const v = y / (dimen - 1)

        const pi = y * dimen + x
        const p = ps[pi]

        if (cd_color >= 0) {
          const color = (p.customData[cd_color] as ColorLayerElem).color
          color[0] = u
          color[1] = v
        }

        const co = patch.evaluate(u, v)
        p.load(co, true)
      }
    }

    grid.recalcFlag |= QRecalcFlags.ALL
  }

  for (const l of mesh.loops) {
    const grid = l.customData[gridAttr.i] as Grid
    grid.update(mesh, l, gridAttr)
  }
}
