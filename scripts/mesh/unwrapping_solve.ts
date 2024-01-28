import {
  util, nstructjs, math, graphPack, PackNode, PackNodeVertex,
  Vector2, Vector3, Vector4, Matrix4, Quat, Number2, Number3
} from '../path.ux/scripts/pathux.js';
import {Constraint, Solver} from '../path.ux/scripts/util/solver.js'
import '../util/numeric.js';

import '../extern/Math.js';

window.module = undefined;
window.exports = undefined;

import {MeshTypes, MeshFlags, MeshSymFlags, MeshModifierFlags} from './mesh_base';
import {AttrRef, UVLayerElem} from './mesh_customdata';
import {UVWrangler} from './unwrapping';
import {Face, Loop, Mesh, Vertex} from "./mesh";

export function relaxUVs(mesh: Mesh, cd_uv: AttrRef<UVLayerElem>,
                         _loops: Iterable<Loop> = mesh.loops,
                         doPack                 = false,
                         boundaryWeight         = 400.0,
                         buildFromSeams         = false) {
  let loops = new Set<Loop>(_loops);

  let faces = new Set<Face>();
  for (let l of loops) {
    faces.add(l.f);
  }

  let wr = new UVWrangler(mesh, faces, cd_uv);
  wr.buildIslands(buildFromSeams);

  let cos = [];
  let vi = 0;

  let islandmap = new Map();
  let badset = new WeakSet();

  for (let island of wr.islands) {
    for (let v of island) {
      islandmap.set(v, island);
      let bad = true;

      for (let l of wr.vertMap.get(v)) {
        islandmap.set(l, island);
        if (bad && loops.has(l)) {
          bad = false;
        }
      }

      if (bad) {
        badset.add(v);
      }
    }
  }

  //for (let v of wr.uvMesh.verts) {
  //  cos.push(new Vector3(v));
  //  v.index = vi++;
  //}

  let avg = new Vector3();
  let cd_corner = wr.cd_corner;

  for (let island of wr.islands) {
    if (island.size < 5) {
      continue;
    }

    for (let v of island) {
      if (badset.has(v)) {
        continue;
      }

      let w = 1.0;
      let tot = 0.0;
      avg.zero();

      for (let l of wr.vertMap.get(v)) {
        l.f.flag |= MeshFlags.UPDATE;

        let seam = !!(l.e.flag & MeshFlags.SEAM);
        seam = seam || l === l.radial_next;
        seam = seam || (islandmap.get(l) !== islandmap.get(v));

        if (seam) {
          w = boundaryWeight;
          break;
        }

        if (cd_corner.get(v).hasPins) {
          w += boundaryWeight*2.0;
        }
      }

      avg.addFac(v.co, w);
      tot += w;

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);
        let w = 1.0;

        if (badset.has(v2)) {
          continue;
        }

        avg.addFac(v2.co, w);
        tot += w;
      }

      if (tot > 0) {
        avg.mulScalar(1.0/tot);
        v.co.load(avg);
        v.co[2] = 0.0;
      }
    }

    let area = island.area;
    wr.updateAABB(island);

    if (area === 0 || island.area === 0) {
      continue;
    }

    let ratio = Math.sqrt(area)/Math.sqrt(island.area);
    let cent = new Vector2(island.min).interp(island.max, 0.5);

    for (let v of island) {
      //v.sub(cent).mulScalar(ratio).add(cent);
      v.co[2] = 0.0;
    }
  }

  if (doPack) {
    wr.packIslands(true, true);
  }

  wr.finish();
}

class SolveTri {
  l1: Loop;
  l2: Loop;
  l3: Loop;

  v1: Vertex;
  v2: Vertex;
  v3: Vertex;

  area: number;
  worldArea: number;

  constructor(l1: Loop, l2: Loop, l3: Loop, v1: Vertex, v2: Vertex, v3: Vertex) {
    this.l1 = l1;
    this.l2 = l2;
    this.l3 = l3;

    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;

    this.area = math.tri_area(this.v1.co, this.v2.co, this.v3.co);
    this.worldArea = math.tri_area(l1.v.co, l2.v.co, l3.v.co);
  }
}

export class UnWrapSolver {
  preserveIslands: boolean;
  selLoopsOnly: boolean;
  mesh: Mesh;
  faces: Set<Face>;
  cd_uv: AttrRef<UVLayerElem>;
  uvw: UVWrangler;
  solvers: any[];
  tris: SolveTri[];
  tottri: number;
  saved = false;

  constructor(mesh: Mesh, faces: Iterable<Face>, cd_uv = new AttrRef<UVLayerElem>(),
              preserveIslands                          = false, selLoopsOnly = false) {
    if (!cd_uv.exists) {
      cd_uv = mesh.loops.customData.getLayerRef(UVLayerElem);
    }

    this.preserveIslands = preserveIslands;
    this.selLoopsOnly = selLoopsOnly;

    this.mesh = mesh;
    this.faces = new Set(faces);
    this.cd_uv = cd_uv;
    this.uvw = new UVWrangler(mesh, faces, cd_uv);
    this.solvers = [];
    this.tris = [];
  }

  start(cd_uv?: AttrRef<UVLayerElem>): void {
    if (cd_uv !== undefined) {
      this.cd_uv = cd_uv;
    }

    let wr = this.uvw;

    console.log("this.preserveIslands", this.preserveIslands);

    wr.needTopo = true;
    wr.buildIslands(!this.preserveIslands);

    for (let island of wr.islands) {
      wr.updateAABB(island);

      island.oldmin = new Vector2(island.min);
      island.oldmax = new Vector2(island.max);
      island.oldsize = new Vector2(island.max).sub(island.min);
    }

    for (let island of wr.islands) {
      let ok = !(this.selLoopsOnly && !island.hasSelLoops);
      ok = ok && !island.hasPins;
      ok = ok && !this.preserveIslands;

      if (!ok) {
        continue;
      }

      let no = new Vector3();
      let co = new Vector3();
      let tot = 0.0;

      for (let v of island) {
        for (let l of wr.vertMap.get(v)) {
          no.add(l.f.no);
        }
      }

      if (no.dot(no) < 0.00001) {
        continue;
      }

      no.normalize();

      let variance = 0.0;
      tot = 0.0;

      for (let v of island) {
        for (let l of wr.vertMap.get(v)) {
          let th = Math.acos(no.dot(l.f.no)*0.99999);
          variance += th*th;
          tot++;
        }
      }

      if (tot !== 0.0) {
        variance = variance/tot;
      }

      console.log("normal variance of island patch:", variance);

      if (variance > 1.0) {
        //continue;
      }

      let mat = new Matrix4();
      mat.makeNormalMatrix(no);
      mat.invert();

      for (let v of island) {
        co.zero();
        let tot = 0.0;

        for (let l of wr.vertMap.get(v)) {
          co.add(l.v.co);
          tot++;
        }

        if (!tot) {
          continue;
        }

        co.mulScalar(1.0/tot);

        co.multVecMatrix(mat);
        co[2] = 0.0;
        v.co.load(co);

        //v.multVecMatrix(mat);
        //v.interp(co, 0.5);
      }

      wr.updateAABB(island);

      for (let v of island) {
        v.co.sub(island.min);
      }

      wr.updateAABB(island);
    }

    let cd_corner = wr.cd_corner;

    for (let v of this.uvw.uvMesh.verts) {
      let cv = cd_corner.get(v);

      cv.vel = new Vector2();
      cv.oldco = new Vector2();
      cv.oldvel = new Vector2();
    }

    if (!this.preserveIslands) {
      this.packIslands();
    }

    this.buildSolver();
    wr.finish();
  }

  packIslands() {
    this.uvw.packIslands(true, true);
  }

  buildSolver(includeArea = true) {
    this.solvers = [];
    let totw = 0;

    let mesh = this.mesh;
    let cd_uv = this.cd_uv;

    let ltris = mesh.loopTris;
    this.tris.length = 0;
    let trimap = new Map();
    let uvw = this.uvw;

    let cd_corner = uvw.cd_corner;

    for (let v of uvw.uvMesh.verts) {
      cd_corner.get(v).tris = [];
    }

    let faces = this.faces;
    console.log(faces);

    for (let i = 0; i < ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

      if (!faces.has(l1.f) || !faces.has(l2.f) || !faces.has(l3.f)) {
        continue;
      }

      let v1 = uvw.loopMap.get(l1);
      let v2 = uvw.loopMap.get(l2);
      let v3 = uvw.loopMap.get(l3);

      if (v1 === v2 || v1 === v3 || v2 === v3) {
        continue;
      }

      let tri = new SolveTri(l1, l2, l3, v1, v2, v3);
      this.tris.push(tri);

      trimap.set(l1, tri);
      trimap.set(l2, tri);
      trimap.set(l3, tri);

      for (let j = 0; j < 3; j++) {
        let v = uvw.loopMap.get(ltris[i + j]);
        cd_corner.get(v).tris.push(tri);
      }

    }

    //console.log(this.tris);

    for (let v of uvw.uvMesh.verts) {
      v.co[2] = 0.0;
    }

    for (let v of uvw.uvMesh.verts) {
      let tot = 0;
      let totarea = 0;

      for (let tri of cd_corner.get(v).tris) {
        let w = math.winding(tri.v1.co, tri.v2.co, tri.v3.co);
        tot += w ? 1 : -1;

        totarea += math.tri_area(tri.v1.co, tri.v2.co, tri.v3.co);
      }

      cd_corner.get(v).area = totarea;
      cd_corner.get(v).wind = tot >= 0.0;
    }

    `
    on factor;
    
    load_package "avector";
    load_package "trigsimp";
    
    let (v1x-v2x)**2 + (v1y - v2y)**2 = 1.0;
    
    v1 := avec(v1x, v1y, 0.0);
    v2 := avec(v2x, v2y, 0.0);
    v3 := avec(v3x, v3y, 0.0);
    
    t1 := v2 - v1;
    t2 := v3 - v2;
    t3 := v1 - v3;
         
    l1 := VMOD t1;
    l2 := VMOD t2;
    l3 := VMOD t3;
        
    s := (l1+l2+l3)/2.0;
    f := sqrt(s*(s-l1)*(s-l2)*(s-l3));
    f := (f*wind - goal)*kmul;
    
    on fort;
    dv1x := trigsimp df(f, v1x);
    dv1y := trigsimp df(f, v1y);
    dv2x := trigsimp df(f, v2x);
    dv2y := trigsimp df(f, v2y);
    dv3x := trigsimp df(f, v3x);
    dv3y := trigsimp df(f, v3y);
    off fort;
    
    `

    function area_c(params) {
      let w1 = params[0];
      let v1 = params[1];
      let v2 = params[2];
      let v3 = params[3];
      let goal = params[4];
      let mul = params[5];

      v1[2] = v2[2] = v3[2] = 0.0;

      let w2 = math.winding(v1, v2, v3) ? 1.0 : -1.0;
      let ret = (math.tri_area(v1, v2, v3)*w2 - goal)*mul;

      //ret *= ret;
      ret = Math.abs(ret);

      return ret;
      //return Math.abs(ret);
    }

    function badnum(n) {
      return isNaN(n) || !isFinite(n) ? 0.0 : n;
    }

    function area_c_df(params, gs) {
      let ans1, ans2, ans3, ans4, ans5;

      let sqrt = Math.sqrt;

      let w1 = params[0];
      let v1 = params[1];
      let v2 = params[2];
      let v3 = params[3];
      let goal = params[4];
      let kmul = params[5];

      v1[2] = v2[2] = v3[2] = 0.0;

      let v1x = v1[0], v1y = v1[1];
      let v2x = v2[0], v2y = v2[1];
      let v3x = v3[0], v3y = v3[1];

      let wind = math.winding(v1, v2, v3) ? 1.0 : -1.0;

      ans1 = ((2.0*sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(sqrt((v2x - v3x)**2 + (
        v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)) + (sqrt((v2x -
        v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(
        sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y
        )**2)))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2
        + (v1y - v3y)**2)) - (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x
        - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 +
        sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)
        **2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)))*(v1x - v3x)*kmul*wind
      let dv1x = ans1/(8.0*sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*sqrt(-(sqrt((v2x
        - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(
        sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y
        )**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 +
        (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x -
        v3x)**2 + (v1y - v3y)**2))))

      ans1 = ((2.0*sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(sqrt((v2x - v3x)**2 + (
        v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)) + (sqrt((v2x -
        v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(
        sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y
        )**2)))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2
        + (v1y - v3y)**2)) - (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x
        - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 +
        sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)
        **2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)))*(v1y - v3y)*kmul*wind
      let dv1y = ans1/(8.0*sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*sqrt(-(sqrt((v2x
        - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(
        sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y
        )**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 +
        (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x -
        v3x)**2 + (v1y - v3y)**2))))

      ans1 = -((2.0*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)
          **2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0) + (sqrt
        ((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2
        ))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y
          - v3y)**2)))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x
        )**2 + (v1y - v3y)**2)) + (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt(
          (v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) -
          1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y -
          v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)))*(v2x - v3x)*kmul*
        wind
      let dv2x = ans1/(8.0*sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*sqrt(-(sqrt((v2x
        - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(
        sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y
        )**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 +
        (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x -
        v3x)**2 + (v1y - v3y)**2))))

      ans1 = -((2.0*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)
          **2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0) + (sqrt
        ((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2
        ))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y
          - v3y)**2)))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x
        )**2 + (v1y - v3y)**2)) + (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt(
          (v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) -
          1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y -
          v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)))*(v2y - v3y)*kmul*
        wind
      let dv2y = ans1/(8.0*sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*sqrt(-(sqrt((v2x
        - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(
        sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y
        )**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 +
        (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x -
        v3x)**2 + (v1y - v3y)**2))))

      ans1 = -((2.0*sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(sqrt((v2x - v3x)**2 +
          (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x -
            v3x)**2 + (v2y - v3y)**2)*v1x - sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*v2x +
          v2x - v3x) + (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**
          2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((
          v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*(
          v1x - v3x) - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(v2x - v3x)))*(sqrt((
          v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))
        - (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y -
          v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)
          **2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((
          v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*(
          v1x - v3x) + sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(v2x - v3x)))*kmul*wind
      let dv3x = ans1/(8.0*sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*sqrt((v1x - v3x)**
        2 + (v1y - v3y)**2)*sqrt(-(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 +
        sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)
        **2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (
        v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x -
        v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2))))

      ans1 = -((2.0*sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(sqrt((v2x - v3x)**2 +
          (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x -
            v3x)**2 + (v2y - v3y)**2)*v1y - sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*v2y +
          v2y - v3y) + (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**
          2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((
          v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*(
          v1y - v3y) - sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(v2y - v3y)))*(sqrt((
          v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))
        - (sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y -
          v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)
          **2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((
          v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*(
          v1y - v3y) + sqrt((v1x - v3x)**2 + (v1y - v3y)**2)*(v2y - v3y)))*kmul*wind
      let dv3y = ans1/(8.0*sqrt((v2x - v3x)**2 + (v2y - v3y)**2)*sqrt((v1x - v3x)**
        2 + (v1y - v3y)**2)*sqrt(-(sqrt((v2x - v3x)**2 + (v2y - v3y)**2) + 1.0 +
        sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (v2y - v3y)
        **2) + 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x - v3x)**2 + (
        v2y - v3y)**2) - 1.0 + sqrt((v1x - v3x)**2 + (v1y - v3y)**2))*(sqrt((v2x -
        v3x)**2 + (v2y - v3y)**2) - 1.0 - sqrt((v1x - v3x)**2 + (v1y - v3y)**2))))


      gs[0][0] = badnum(dv1x);
      gs[0][1] = badnum(dv1y);
      gs[1][0] = badnum(dv2x);
      gs[1][1] = badnum(dv2y);
      gs[2][0] = badnum(dv3x);
      gs[2][1] = badnum(dv3y);
    }

    let t1 = new Vector2();
    let t2 = new Vector2();

    function angle_c(params: [Vertex, Vertex, Vertex, number, number]): number {
      let v1 = params[0];
      let v2 = params[1];
      let v3 = params[2];
      let goalth = params[3];
      let wind = params[4];

      v1.co[2] = v2.co[2] = v3.co[2] = 0.0;

      let w = math.winding(v1.co, v2.co, v3.co) ? 1.0 : -1.0;

      t1.load(v1.co).sub(v2.co).normalize();
      t2.load(v3.co).sub(v2.co).normalize();

      let th = -(t1[1]*t2[0] - t1[0]*t2[1]);
      th = Math.asin(th*0.99999);

      //let ret = Math.acos(t1.dot(t2)*0.999999)*w - goalth;
      let ret = th - goalth;

      //ret = Math.abs(ret);
      //ret *= ret;

      return ret*ret;
    }

    //console.log(this.uvw.islands);

    this.tottri = 0;

    let wr = this.uvw;
    for (let island of wr.islands) {
      wr.updateAABB(island);

      let ok = !island.hasPins && !this.preserveIslands;
      ok = ok && !(this.selLoopsOnly && !island.hasSelLoops);

      if (ok) {
        for (let v of island) {
          v.co.sub(island.min).div(island.boxsize);
          v.co[2] = 0.0;
        }
      }
    }

    for (let island of this.uvw.islands) {
      if (this.selLoopsOnly && !island.hasSelLoops) {
        continue;
      }

      let tris = new Set<SolveTri>();
      let solver = new Solver();

      this.solvers.push(solver);

      for (let v of island) {
        for (let tri of cd_corner.get(v).tris) {
          tris.add(tri);
        }
      }

      let totw = 0.0;
      let totarea = 0.0;
      let totarea2 = 0.0;

      for (let tri of tris) {
        this.tottri++;

        let w = math.winding(tri.v1.co, tri.v2.co, tri.v3.co);
        totw += w ? 1 : -1;
        totarea += tri.area;
        totarea2 += tri.worldArea;
      }

      let wind = 1.0; //totw >= 0 ? 1 : -1;

      let t3 = new Vector3();
      let t4 = new Vector3();

      let df = 0.0001;
      let maxarea = 0.0;

      function makeAngleCon(l1: Loop, l2: Loop, l3: Loop, v1: Vertex, v2: Vertex, v3: Vertex, wind: number): void {
        t3.load(l1.v.co).sub(l2.v.co).normalize();
        t4.load(l3.v.co).sub(l2.v.co).normalize();

        //let goalth = Math.acos(t3.dot(t4));
        let w = math.winding(v1.co, v2.co, v3.co) ? 1.0 : -1.0;

        t3.cross(t4);
        let goalth = t3.vectorLength()*wind;

        if (w !== wind) {
          //goalth = -goalth;
        }

        goalth = Math.asin(goalth*0.9999999);

        //if (w !== wind) {
        //goalth = Math.PI - goalth;
        //}

        let params = [v1, v2, v3, goalth, wind];
        let klst = [v1, v2, v3]
          .filter(v => !cd_corner.get(v).hasPins)
          .map(v => v.co);

        if (klst.length > 0) {
          let con = new Constraint("angle_c", angle_c, klst, params);
          let r = con.evaluate();

          con.df = df;

          //con.k = 1.0 / (1.0 + Math.abs(r));
          //con.k = 1/(1.0+math.tri_area(v1, v2, v3) / maxarea);

          solver.add(con);
        }
      }

      let ratio = 1.0/totarea2;
      //console.log("totarea", totarea, totarea2, ratio);

      if (totarea === 0.0) {
        for (let tri of tris) {
          for (let j = 0 as Number2; j < 2; j++) {
            tri.v1.co[j] = Math.random();
            tri.v2.co[j] = Math.random();
            tri.v3.co[j] = Math.random();
          }

          tri.area = math.tri_area(tri.v1.co, tri.v2.co, tri.v3.co);
          totarea += tri.area;
        }
      } else if (isNaN(totarea)) {
        console.error("UVs had NaNs in them; fixing. . .");
        for (let tri of tris) {
          for (let j = 0 as Number2; j < 2; j++) {
            tri.v1.co[j] = Math.random();
            tri.v2.co[j] = Math.random();
            tri.v3.co[j] = Math.random();
          }
        }
      } else if (totarea2 === 0.0) {
        continue;
      }

      for (let tri of tris) {
        tri.area = math.tri_area(tri.v1.co, tri.v2.co, tri.v3.co);
        maxarea = Math.max(tri.area, maxarea);
      }

      for (let tri of tris) {
        let goal = tri.worldArea*ratio*wind*1.0;
        let params = [wind, tri.v1.co, tri.v2.co, tri.v3.co, goal, 100.0/totarea];
        let klst = [tri.v1, tri.v2, tri.v3]
          .filter(v => !cd_corner.get(v).hasPins)
          .map(v => v.co);

        if (includeArea && klst.length > 0) {
          let con = new Constraint("area_c", area_c, klst, params);
          con.df = df;
          let r = Math.abs(con.evaluate());
          con.threshold = 0.0001;
          //con.k = 1/(1.0+tri.area/maxarea);

          //solver.add(con);
        }

        solver.simple = false;

        //con.funcDv = area_c_df;
        makeAngleCon(tri.l1, tri.l2, tri.l3, tri.v1, tri.v2, tri.v3, wind);
        makeAngleCon(tri.l2, tri.l3, tri.l1, tri.v2, tri.v3, tri.v1, wind);
        makeAngleCon(tri.l3, tri.l1, tri.l2, tri.v3, tri.v1, tri.v2, wind);
      }
    }

    //console.log("Islands: ", this.uvw.islands.length);
    //console.log(slv);
  }

  solveIntern(slv, count, gk) {
    let doneset = new WeakSet();
    let idxmap = new Map();

    let start = util.time_ms();

    //return slv.solve(count, gk);

    function log(...args: any[]): void {
      //console.log(...args);
    }

    let pmap = new Set();
    let tot = 0;
    let vec = [];

    if (slv.constraints.length === 0) {
      return 0.0;
    }

    for (let con of slv.constraints) {
      for (let v of con.klst) {
        if (!pmap.has(v)) {
          pmap.add(v);
          tot++;
        }
      }
    }

    log("CS", slv.constraints.length, tot*2);

    slv.randCons = true;
    //return slv.solve(count, gk, false);

    let ki = 0;

    for (let con of slv.constraints) {
      for (let uv of con.klst) {
        if (!doneset.has(uv)) {
          idxmap.set(uv, ki);
          doneset.add(uv)
          vec.push(uv);
          ki += 2;
        }
      }
    }

    let rowsize = ki;

    log("rowsize", rowsize);

    if (slv.constraints.length === 0) {
      log("empty solver detected");
      return;
    }

    let matrix = new Array(slv.constraints.length);

    for (let i = 0; i < slv.constraints.length; i++) {
      let row = new Array(rowsize);
      matrix[i] = row;

      for (let j = 0; j < row.length; j++) {
        row[j] = 0;
      }
    }

    let col = [];

    let toterr = 0.0;

    for (let i = 0; i < slv.constraints.length; i++) {
      let con = slv.constraints[i];
      let r1 = con.evaluate();

      toterr += Math.abs(r1);

      col.push(r1);

      if (isNaN(r1)) {
        log(con);
        throw new Error("NaN");
      }

      let row = matrix[i];

      for (let j = 0; j < con.klst.length; j++) {
        let uv = con.klst[j];
        let gs = con.glst[j];

        let idx = idxmap.get(uv);

        if (idx === undefined) {
          throw new Error();
        }

        if (isNaN(gs[0]) || isNaN(gs[1])) {
          log(con);
          throw new Error("NaN2!");
        }

        row[idx] = gs[0];
        row[idx + 1] = gs[1];
      }
    }

    let totrows = matrix.length;

    //matrix = numeric.ccsSparse(matrix);

    const numeric = (window as unknown as any)["numeric"] as any;

    let matrixT = numeric.transpose(matrix);
    //let matrix1 = numeric.dotMMsmall(matrixT, matrix);
    let matrix1 = numeric.dot(matrixT, matrix);

    let svd = numeric.svd(matrix1);

    let rows = matrix1.length;

    function makeMatrix(rows, cols, setIdentity = true) {
      let ret = new Array(rows);

      for (let i = 0; i < rows; i++) {
        ret[i] = new Array(cols);

        for (let j = 0; j < cols; j++) {
          ret[i][j] = 0.0;
        }

        if (setIdentity) {
          ret[i][i] = 1.0;
        }
      }

      return ret;
    }

    totrows = svd.S.length;
    let sigma = makeMatrix(totrows, totrows, false);
    let S = svd.S;

    //window.sigma = sigma;

    for (let i = 0; i < S.length; i++) {
      let f = S[i];
      f = f !== 0.0 ? 1.0/f : 0.0;

      sigma[i][i] = f;
    }
    //sigma = numeric.transpose(sigma);

    (matrix as unknown as any).slv = slv;

    /*
    window.sigma = sigma;
    window.col = col;
    window.mat1 = matrix1;
    window.mat = matrix;
    window.matT = matrixT;
    */

    let V = numeric.transpose(svd.V);
    log("psuedo inverse");
    let pinv = numeric.dotMMsmall(numeric.dotMMsmall(svd.U, sigma), V);
    let b = numeric.dotMMsmall(pinv, matrix1);

    let c = numeric.dotMMsmall(pinv, matrixT);

    log("B", b);
    log("C", c);
    log("col", col);
    let col2 = numeric.dot(c, col);
    log("result", col2);

    for (let i = 0; i < col2.length; i += 2) {
      let x = col2[i], y = col2[i + 1];
      let v = vec[i>>1];

      v[0] += -x*gk;
      v[1] += -y*gk;
    }

    log(vec);
    return toterr;

    return slv.solve(count, gk, false);
    /*
      matrix = MathJS.matrix(matrix, 'sparse');
      //matrix = MathJS.transpose(matrix);

      let matrixT = MathJS.transpose(matrix);
      let matrix1 = MathJS.multiply(matrixT, matrix);
      let matrixI;

      window.mat = matrix1;
      window.col = col;

      let ok = true;
      let col2;

      try {
        matrixI = MathJS.inv(matrix1);
      } catch (error) {
        util.print_stack(error);
        ok = false;
      }

      if (ok) {
        console.log("Inversion worked");

        window.imat = matrixI;
        let matrixF = MathJS.multiply(matrixI, matrixT);
        window.fmat = matrixF;
      }
    }

    //return this.solver.solve(count, gk, false);
    return toterr; //slv.solve(count, gk, false);
    */
  }

  solve(count, gk) {
    let err = 0.0;

    let uvmesh = this.uvw.uvMesh;
    let damp = 0.95;

    let cd_corner = this.uvw.cd_corner;

    for (let v of uvmesh.verts) {
      let cv = cd_corner.get(v);

      v.co[0] += cv.vel[0]*damp;
      v.co[1] += cv.vel[1]*damp;

      cv.oldco.load(v.co);
      v.co[2] = 0.0;
    }

    for (let slv of this.solvers) {
      //iterate guess-seidel
      slv.solve(1, gk);

      //least squares
      //err += this.solveIntern(slv, count, gk);

      //guess-seidel
      slv.solve(1, gk);
    }

    for (let v of uvmesh.verts) {
      let cv = cd_corner.get(v);

      cv.vel.load(v.co).sub(cv.oldco);
    }

    return err;
  }

  step(countUnused, gk) {
    let flen = this.faces.size;
    let count, count2;

    if (flen > 5000) {
      count = 1;
      count2 = 1;
    } else if (flen > 1000) {
      count = 5;
      count2 = 3;
    } else {
      count = 5;
      count2 = 3;
    }

    //XXX
    count = 1;
    count2 = 3;

    let time = util.time_ms();

    gk = gk ?? (window as unknown as any)["gk"] ?? 0.75;
    let err;

    let uvmesh = this.uvw.uvMesh;

    console.log("Islands", this.uvw.islands.length);

    for (let v of uvmesh.verts) {
      //v[0] += (Math.random()-0.5)*0.1;
      //v[1] += (Math.random()-0.5)*0.1;
    }

    let si = 0;
    let tmp = new Vector3();

    let smoothvs = new Set<Vertex>();
    for (let island of this.uvw.islands) {
      if (this.selLoopsOnly && !island.hasSelLoops) {
        continue;
      }

      for (let v of island) {
        smoothvs.add(v);
      }
    }

    let cd_corner = this.uvw.cd_corner;

    let vsmooth = (fac: number): void => {
      for (let v of smoothvs) {
        if (cd_corner.get(v).hasPins) {
          continue;
        }

        tmp.zero();
        let w = 1.0;

        if (cd_corner.get(v).corner) {
          w = 10;
        }

        tmp.addFac(v.co, w);
        let tot = w

        for (let e of v.edges) {
          let w = 1.0;
          let v2 = e.otherVertex(v);
          let cv = cd_corner.get(v2);

          if (cv.hasPins) {
            w = 10000.0;
          } else if (cv.corner) {
            //w = 10;
          }

          tmp.addFac(v2.co, w);
          tot += w;
        }

        if (tot === 0) {
          continue;
        }

        tmp.mulScalar(1.0/tot);
        v.co.interp(tmp, fac);
        v.co[2] = 0.0;
      }
    }

    let solvestep = (gk, damp = 0.95) => {
      //this.buildSolver();

      let cd_corner = this.uvw.cd_corner;

      for (let i = 0; i < count; i++) {
        for (let v of uvmesh.verts) {
          let cv = cd_corner.get(v);

          v.co[0] += cv.vel[0]*damp;
          v.co[1] += cv.vel[1]*damp;

          cv.oldco.load(v.co);
        }

        err = this.solve(count, gk);
        //vsmooth(0.05);

        for (let v of uvmesh.verts) {
          let cv = cd_corner.get(v);

          cv.vel.load(v.co).sub(cv.oldco);
        }

        si++;
      }

      return gk;
    }

    for (let i = 0; i < count2; i++) {
      vsmooth(0.75);
    }

    this.solve(count, gk);
    console.log("gk", gk);
    //solvestep(gk);

    if (0) {
      for (let i = 0; i < count2; i++) {
        //gk = solvestep(gk);
      }
      //solvestep(0.05, 0.0);

      for (let i = 0; i < count2; i++) {
        //  vsmooth(0.5);
      }

      this.buildSolver(false);

      for (let i = 0; i < 2; i++) {
        //XXX
        //gk = solvestep(gk*0.3);
      }
    }

    time = util.time_ms() - time;
    console.log("time:", time.toFixed(2) + "ms");

    console.log("error", err);
    console.log("tottri", this.tottri);

    let cd_uv = this.cd_uv;

    for (let v of this.uvw.uvMesh.verts) {
      let ls = this.uvw.vertMap.get(v);

      for (let l of ls) {
        cd_uv.get(l).uv.load(v.co);
      }
    }
  }

  save() {
    if (this.saved) {
      console.error("Already saved");
      return;
    }

    this.saved = true;
    (this.mesh as unknown as number) = this.mesh.lib_id;

    this.uvw.save();

    for (let tri of this.tris) {
      (tri.l1 as unknown as number) = tri.l1.eid;
      (tri.l2 as unknown as number) = tri.l2.eid;
      (tri.l3 as unknown as number) = tri.l3.eid;
    }
    ;

    this.faces = this.faces.map((f) => f.eid);

    this.solvers.length = 0;

    return this;
  }

  restore(mesh: Mesh): boolean {
    if (!this.saved) {
      console.error("UnwrapSolver is not saved");
      return false;
    }

    if ((this.mesh as unknown as number) !== mesh.lib_id) {
      console.warn("Meshes differ");
      return false;
    }

    let fs = new Set<Face>();
    for (let feid of this.faces as unknown as Set<number>) {
      let f = mesh.eidMap.get<Face>(feid);
      if (!f || f.type !== MeshTypes.FACE) {
        console.warn("Missing face " + feid);
        return false;
      }

      fs.add(f);
    }

    this.faces = fs;

    for (let tri of this.tris) {
      tri.l1 = mesh.eidMap.get<Loop>(tri.l1 as unknown as number);
      tri.l2 = mesh.eidMap.get<Loop>(tri.l2 as unknown as number);
      tri.l3 = mesh.eidMap.get<Loop>(tri.l3 as unknown as number);

      if (!tri.l1 || !tri.l2 || !tri.l3) {
        console.warn("Missing tri loops");
        return false;
      }
    }

    if (!this.uvw.restore(mesh)) {
      return false;
    }

    this.mesh = mesh;
    this.saved = false;

    this.buildSolver();

    return true;
  }

  static restoreOrRebuild(mesh, faces, solver, cd_uv, preserveIslands = false, selLoopsOnly = false) {
    faces = new Set(faces);

    if (cd_uv === undefined) {
      cd_uv = mesh.loops.customData.getLayerIndex("uv");
    }

    let count = 0;
    for (let f of faces) {
      count++;
    }

    let bad = false;

    if (!solver) {
      console.warn("No solver");
      bad = true;
    } else if (solver.preserveIslands !== preserveIslands) {
      console.log("preserveIslands differs");
      bad = true;
    } else if (!!solver.selLoopsOnly !== !!selLoopsOnly) {
      console.log("selLoopsOnly differ");
      bad = true;
    } else if (solver.faces.size !== faces.size) {
      console.log("Face list size differs; old:", solver.faces.size, "new:", faces.size);
      bad = true;
    } else if (solver.cd_uv !== cd_uv) {
      console.warn("new UV layer");
      bad = true;
    } else {
      for (let f of faces) {
        if (!(f.eid in solver.faces)) {
          console.warn("New face " + f.eid, f);
          bad = true;
          break;
        }
      }
    }

    bad = bad || !solver.restore(mesh);

    if (bad) {
      console.warn("Making new solver");
      solver = new UnWrapSolver(mesh, faces, cd_uv, preserveIslands, selLoopsOnly);
      solver.start();
    }

    return solver;
  }

  finish() {
    let wr = this.uvw;

    for (let f of this.faces) {
      f.flag |= MeshFlags.UPDATE;
    }

    for (let island of wr.islands) {
      wr.updateAABB(island);
    }

    if (!this.preserveIslands) {
      this.packIslands();
    } else {
      for (let island of wr.islands) {
        /*
        let ok = this.preserveIslands;
        ok = ok || (this.selLoopsOnly && !island.hasSelLoops);
        ok = ok && !island.hasPins;
        ok = ok && island.oldsize !== undefined && island.oldmin;

        if (!ok) {
          continue;
        }

        wr.updateAABB(island);

        for (let v of island) {
          v.sub(island.min).div(island.boxsize).mul(island.oldsize).add(island.oldmin);
        }

        wr.updateAABB(island);
        */
      }
    }

    wr.finish();
  }
}


export function fixSeams(mesh, cd_uv) {
  let wrangler = new UVWrangler(mesh, mesh.faces, new AttrRef(cd_uv));
  wrangler.buildIslands();

  let seams = new Set();

  let tmp1 = new Vector2();
  let tmp2 = new Vector2();
  let tmp3 = new Vector2();
  let tmp4 = new Vector2();
  let tmp5 = new Vector2();

  function error(params) {
    let e = params[0];

    let l1 = e.l, l2 = l1.radial_next;
    let uv1a = l1.customData[cd_uv].uv;
    let uv1b = l1.next.customData[cd_uv].uv;
    let uv2a = l2.next.customData[cd_uv].uv;
    let uv2b = l2.customData[cd_uv].uv;

    let texSize = 1024.0;

    function round(n) {
      return Math.floor(n + 0.01);
    }

    tmp1.load(uv1a).sub(uv2a);
    tmp2.load(uv1b).sub(uv2b);

    tmp1.mulScalar(texSize);
    tmp2.mulScalar(texSize);

    let len1 = uv1a.vectorDistance(uv2a)*texSize;
    let len2 = uv1b.vectorDistance(uv2b)*texSize;

    let err = 0.0;

    //err += Math.abs(len1 - round(len1));
    //err += Math.abs(len2 - round(len2));
    err += Math.abs(tmp1[0] - round(tmp1[0]))**2;
    err += Math.abs(tmp1[1] - round(tmp1[1]))**2;
    err += Math.abs(tmp2[0] - round(tmp2[0]))**2;
    err += Math.abs(tmp2[1] - round(tmp2[1]))**2;

    return err;
  }

  let solver = new Solver();

  for (let l1 of mesh.loops) {
    if (l1.radial_next === l1) {
      continue;
    }

    let l2 = l1.radial_next;
    let uv1a = l1.customData[cd_uv].uv;
    let uv1b = l1.next.customData[cd_uv].uv;
    let uv2a = l2.next.customData[cd_uv].uv;
    let uv2b = l2.customData[cd_uv].uv;

    let d1 = uv1a.vectorDistance(uv2a);
    let d2 = uv1b.vectorDistance(uv2b);

    if (d1 > 0.0001 || d2 > 0.0001) {
      let e = l1.e;

      if (!seams.has(e)) {
        let con = new Constraint("", error, [uv1a, uv1b, uv2a, uv2b], [e], 1.0);
        solver.add(con);
      }

      seams.add(l1.e);
    }
  }

  //for (let e of seams) {
  //let err = error([e]);
  //console.log("err", err);
  //}

  //XXX this is absurdly small. . .
  const gk = 0.000005;
  solver.solve(500, gk, true);
  console.log(solver, gk);

  console.log("Wrangler", wrangler);
  console.log("Seams", seams);
}
