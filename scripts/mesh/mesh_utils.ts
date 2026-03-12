import {Vector2, Vector3, Vector4, Quat, Matrix4, util, math, nstructjs, Number3} from '../path.ux/scripts/pathux.js'

const {dist_to_line_2d, winding} = math

import {
  MeshFlags,
  MeshTypes,
  MeshFeatures,
  ReusableIter,
  LogContext,
  ChangeFlags,
  ArrayPool,
  MAX_FACE_VERTS,
  MeshError,
} from './mesh_base.js'

import {getArrayTemp} from './mesh_base.js'
import {applyTriangulation} from './mesh_tess.js'
import {getFaceSets, getFaceSetsAttr} from './mesh_facesets.js'
import {BVHVertFlags, getDynVerts, MDynVert} from '../util/bvh.js'
import {INumberList} from '../util/polyfill'
import {Edge, Element, Face, Loop, Vertex} from './mesh_types'
import {AttrRef, ColorLayerElem, IntElem, Mesh, UVLayerElem} from './mesh'

const mvc_tmps = util.cachering.fromConstructor(Vector3, 256)
const mvc_mats = util.cachering.fromConstructor(Matrix4, 16)
const mvc_pool = new ArrayPool()

//mean value coordinates
export function calcMVC(co: Vector3, neighbors: Iterable<Vertex>, normal?: Vector3, cosout?: Vector3[]): number[] {
  neighbors = ReusableIter.getSafeIter<Vertex>(neighbors)

  let val = 0
  for (const v2 of neighbors) {
    val++
  }

  let cos: Vector3[] = mvc_pool.get<Vector3>(val)
  const cent = mvc_tmps.next().zero()

  let i = 0
  for (const v2 of neighbors) {
    cos[i++] = mvc_tmps.next().load(v2.co)
    cent.add(v2.co)
  }

  const startco = co
  let cos2: Vector3[]

  if (val === 0) {
    return mvc_pool.get(0)
  } else if (val === 1) {
    const ws = mvc_pool.get<number>(1)
    ws[0] = 1.0
    return ws
  } else if (val === 2) {
    const v1 = mvc_tmps.next().load(co).sub(cos[0])
    const v2 = mvc_tmps.next().load(cos[1]).sub(cos[0]).normalize()
    const d = v1.dot(v2)

    const ws = mvc_pool.get<number>(2)
    ws[0] = d
    ws[1] = 1.0 - d

    return ws
  }

  co = mvc_tmps.next().load(co)

  let n = normal

  if (!n) {
    n = mvc_tmps.next()
    if (val > 3) {
      n.load(math.normal_quad(cos[0], cos[1], cos[2], cos[3]))
    } else {
      n.load(math.normal_tri(cos[0], cos[1], cos[2]))
    }
  }

  cent.mulScalar(1.0 / val)

  const mat = mvc_mats.next()
  mat.makeIdentity()
  mat.makeNormalMatrix(n)
  mat.transpose() //invert rotation matrix
  //mat.invert();

  const ths = mvc_pool.get<number>(val)
  let idxs = mvc_pool.get<number>(val)

  co.multVecMatrix(mat)

  for (let i = 0; i < val; i++) {
    const co2 = cos[i]

    co2.multVecMatrix(mat)
    co2.sub(co)

    ths[i] = Math.atan2(co2[1], co2[0])
    idxs[i] = i
  }

  if (cosout) {
    for (let i = 0; i < val; i++) {
      const co = mvc_tmps.next().load(cos[i])

      co.add(startco)

      cosout.push(co)
    }
  }

  idxs.sort((a, b) => ths[a] - ths[b])

  cos2 = mvc_pool.get<Vector3>(val)
  for (let i = 0; i < val; i++) {
    cos2[i] = cos[idxs[i]]
  }

  //invert idxs
  const idxs2 = mvc_pool.get<number>(val)
  for (let i = 0; i < val; i++) {
    idxs2[idxs[i]] = i
    //idxs2[i] = i;
  }

  idxs = idxs2
  cos = cos2

  const lens = mvc_pool.get<number>(val)
  const ws = ths

  for (let i = 0; i < val; i++) {
    const co2 = cos[i]
    const len = co2.vectorLength()

    if (len > 0.000001) {
      co2.mulScalar(1.0 / len)
    }

    lens[i] = len
  }

  const p = mvc_tmps.next()

  let totw = 0.0
  let avglen = 0.0

  for (let i = 0; i < val; i++) {
    const co1 = cos[(i + val - 1) % val]
    const co2 = cos[i]
    const co3 = cos[(i + 1) % val]

    const l1 = lens[(i + val - 1) % val]
    const l2 = lens[i]
    const l3 = lens[(i + 1) % val]

    avglen += l2

    let th1 = co1[0] * co2[0] + co1[1] * co2[1] + co1[2] * co2[2]
    let th2 = co2[0] * co3[0] + co2[1] * co3[1] + co2[2] * co3[2]

    th1 = Math.acos(th1 * 0.99999)
    th2 = Math.acos(th2 * 0.99999)

    let w = Math.tan(th1 * 0.5) + Math.tan(th2 * 0.5)
    if (l2 !== 0.0) {
      w /= l2
    }

    console.log(th1, th2, co1, co2, co3)

    ws[idxs[(i + val - 1) % val]] = w
    totw += w
  }

  avglen /= val

  if (totw > 0.0) {
    for (let i = 0; i < val; i++) {
      ws[i] *= 1.0 / totw
    }
  }

  if (avglen === 0.0) {
    return ws
  }

  if (0) {
    /*
    on factor;

    x := w1*x1 + w2*x2 + w3*x3 + w4*x4;
    y := w1*y1 + w2*y2 + w3*y3 + w4*y4;
    z := w1*z1 + w2*z2 + w3*z3 + w4*z4;

    f1 := (x-goalx)**2 + (y-goaly)**2 + (z-goalz)**2;
    f2 := w1 + w2 + w3 + w4 - 1.0;

    df(f1, w1);
    **/
    const gs = mvc_pool.get<number>(val)
    const df = 0.00001
    const dot3 = mvc_tmps.next(),
      dv = mvc_tmps.next()

    console.log('AVGLEN', avglen)

    function error() {
      let x = 0,
        y = 0,
        z = 0
      let totw = 0.0

      for (let i = 0; i < val; i++) {
        const w = ws[idxs[i]]

        x += cos[i][0] * w
        y += cos[i][1] * w
        z += cos[i][2] * w

        totw += w
      }

      return x ** 2 + y ** 2 + z ** 2 // + ((totw-1.0)**2)*15;
    }

    for (let i = 0; i < val; i++) {
      cos[i].mulScalar(1000.0 / avglen)
    }

    for (let step = 0; step < 24; step++) {
      dot3.zero()

      for (let i = 0; i < val; i++) {
        for (let j = 0 as Number3; j < 3; j++) {
          dot3[j] += ws[idxs[i]] * cos[i][j]
        }
      }

      dv.load(cos[i])

      let r1 = error() //dot3.dot(dot3);
      let totg = 0.0

      for (let i = 0; i < val; i++) {
        dv.load(dot3).mul(cos[i])
        let dw = 2.0 * (dv[0] + dv[1] + dv[2])

        const dw1 = dw
        //console.log("r1, error", r1, error());

        if (0) {
          const df = 0.0001
          const i2 = idxs[i]
          const r1 = error()
          const orig = ws[i2]
          ws[i2] += df
          const r2 = error()
          ws[i2] = orig

          dw = (r2 - r1) / df

          //console.log("dw1, dw2", dw1, dw);
        }

        totg += dw * dw
        gs[i] = dw
      }

      console.log(dot3)
      console.log('r1', r1.toFixed(5))

      if (totg !== 0.0) {
        r1 /= totg
      }

      const gk = 0.999
      totw = 0.0
      for (let i = 0; i < val; i++) {
        ws[idxs[i]] += -r1 * gs[i] * gk
        totw += ws[idxs[i]]
      }

      r1 = (totw - 1.0) / val

      console.log('r2', r1.toFixed(5))

      totw = 0.0
      for (let i = 0; i < val; i++) {
        const g = 1.0

        ws[idxs[i]] += -r1 * g * gk
        totw += ws[idxs[i]]
      }
    }

    console.log('AVGLEN', avglen)

    if (totw !== 0.0) {
      totw = 1.0 / totw

      for (let i = 0; i < ws.length; i++) {
        ws[i] *= totw
      }
    }
  }

  return ws
}

function mul_mat_vec(mat: INumberList, vec: INumberList, m: number) {
  const vec2 = mvc_tmps.next()

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < m; k++) {
        mat[i * m + j] += mat[i * m + k] * vec[k * m + j]
      }
    }
  }

  for (let i = 0; i < vec.length; i++) {
    vec[i] = vec2[i]
  }

  return vec
}

export function _testMVC(mesh: Mesh): void {
  let cd_color: AttrRef<ColorLayerElem>

  function vsmooth(v: Vertex, fac = 0.5, proj = 0.5) {
    const co = new Vector3()
    const co2 = new Vector3()
    let totw = 0.0

    const cdata = new (Vertex as unknown as new () => Vertex)()
    for (const cd2 of v.customData) {
      const cd3 = cd2.copy()
      cd3.mulScalar(0.0)

      cdata.customData.push(cd3)
    }

    const vs = []
    let vi = 0
    for (const v2 of v.neighbors) {
      vs[vi] = v2
      vi++
    }

    const ws1 = calcMVC(v.co, v.neighbors, v.no)
    mesh.verts.customDataInterp(cdata, vs, ws1)

    const c = cd_color.get(v).color

    const c0 = new Vector4(cd_color.get(cdata).color)
    c0.sub(c)

    for (const v2 of v.neighbors) {
      co2.load(v2.co).sub(v.co)
      const d = co2.dot(v.no)
      co2.addFac(v.no, -d * proj).add(v.co)

      co.add(co2)
      totw++
    }

    if (totw !== 0) {
      co.mulScalar(1.0 / totw)
      v.co.interp(co, fac)
      v.flag |= MeshFlags.UPDATE
    }

    const ws = calcMVC(co, v.neighbors, v.no)

    mesh.verts.customDataInterp(v, vs, ws)
    c.add(c0)
  }

  const v = mesh.verts.active

  cd_color = mesh.verts.customData.getLayerRef(ColorLayerElem)

  for (const v of mesh.verts.selected.editable) {
    vsmooth(v)
  }

  mesh.regenAll()
  mesh.recalcNormals()
  mesh.graphUpdate()

  window.redraw_viewport(true)
}

export function* walkFaceLoop(e: Edge) {
  let l = e.l

  if (!l) {
    return
  }

  let visit = new WeakSet()
  let _i = 0

  while (1) {
    if (_i++ > 1000000) {
      console.error('infinite loop detected')
      break
    }
    if (visit.has(l)) {
      break
    }

    visit.add(l)

    l = l.prev.prev
    l = l.radial_next

    if (l === l.radial_next) {
      yield l
      visit.add(l)
      break
    }
  }

  _i = 0
  visit = new WeakSet()

  if (l === l.radial_next) {
    l = l.next.next
  }

  do {
    if (_i++ > 1000000) {
      console.error('infinite loop detected')
      break
    }

    if (visit.has(l)) {
      break
    }

    yield l

    visit.add(l)
    if (l === l.radial_next) {
      break
    }
    l = l.radial_next.next.next
  } while (_i++ < 1000000)
}

const _tritemp = new Array(3)

export function triangulateMesh(mesh: Mesh, facesIn: Iterable<Face> = mesh.faces, lctx?: LogContext) {
  const tri = _tritemp
  const faces: Set<Face> = facesIn instanceof Set ? facesIn : new Set(facesIn)

  for (const f of faces) {
    applyTriangulation(mesh, f, undefined, undefined, lctx)
  }
}

export function triangulateFan(mesh: Mesh, f: Face, newfaces?: Set<Face> | Face[], lctx?: LogContext) {
  const startl = f.lists[0].l
  let l = startl.next

  do {
    const v1 = startl.v
    const v2 = l.v
    const v3 = l.next.v

    const tri = mesh.makeTri(v1, v2, v3, lctx)
    const l2 = tri.lists[0].l

    mesh.copyElemData(l2, startl)
    mesh.copyElemData(l2.next, l)
    mesh.copyElemData(l2.prev, l.next)
    mesh.copyElemData(tri, f)

    if (newfaces !== undefined) {
      if (newfaces instanceof Set) {
        newfaces.add(tri)
      } else if (newfaces instanceof Array) {
        newfaces.push(tri)
      }
    }

    l = l.next
  } while (l !== startl.prev)

  mesh.killFace(f, lctx)
}

export function bisectMesh(
  mesh: Mesh,
  faces: Iterable<Face>,
  vec: Vector3,
  offset = new Vector3(),
  threshold = 0.00005
) {
  faces = new Set(faces)

  vec = new Vector3(vec)
  vec.normalize()

  const mat = new Matrix4()

  let up = new Vector3()
  const ax = Math.abs(vec[0]),
    ay = Math.abs(vec[1]),
    az = Math.abs(vec[2])
  if (ax >= ay && ax >= az) {
    up[1] = 1.0
    up[2] = 1.0
  } else if (ay >= ax && ay >= az) {
    up[0] = 1.0
    up[2] = 1.0
  } else {
    up[0] = 1.0
    up[1] = 1.0
  }

  console.log('Bisect mesh!', vec, up)
  up = up.cross(vec).normalize()

  mat.makeNormalMatrix(vec, up)
  mat.translate(offset[0], offset[1], offset[2])

  const imat = new Matrix4(mat)

  mat.invert()

  console.log('' + mat)

  const p1 = new Vector3()
  const p2 = new Vector3()
  const p3 = new Vector3()

  const edges = new Set<Edge>()
  const emap = new Map<Edge, Vertex>()
  const edges2 = new Set<Edge>()

  const tris = []

  const sign = (f: number) => (f >= 0 ? 1 : -1)
  const check = (a: Vector3, b: Vector3) => {
    let ok = sign(a[2]) !== sign(b[2]) && Math.abs(a[2] - b[2]) > threshold

    if (Math.abs(a[2]) < threshold) {
      ok = false
      a[2] = 0.0
    }

    if (Math.abs(b[2]) < threshold) {
      ok = false
      b[2] = 0.0
    }

    return ok
  }

  for (const f of faces) {
    for (const list of f.lists) {
      for (const l of list) {
        p1.load(l.v.co).multVecMatrix(mat)
        p2.load(l.next.v.co).multVecMatrix(mat)

        if (check(p1, p2)) {
          edges.add(l.e)
        }
      }
    }
  }

  //faces2 = new Set(triangulateMesh(mesh, faces2));

  const tmp1 = [0, 0, 0]
  const tmp2 = [0, 1, 2]
  const tmp3 = [0, 0, 0]
  const vtmp = [0, 0, 0]
  const vtmp2 = [0, 0, 0, 0]

  for (const l of mesh.loops) {
    const v1 = l.v,
      v2 = l.next.v
    const e = l.e

    if ((v1 !== e.v1 || v2 !== e.v2) && (v1 !== e.v2 || v2 !== e.v1)) {
      console.log('loop error!', l.eid)
    }
  }

  const verts2 = new Set<Vertex>()

  //*
  for (const e of edges) {
    p1.load(e.v1.co).multVecMatrix(mat)
    p2.load(e.v2.co).multVecMatrix(mat)

    if (!check(p1, p2)) {
      continue
    }

    //console.log(p1[2], p2[2]);

    p2.sub(p1)
    const t = -p1[2] / p2[2]

    p1.addFac(p2, t)
    p1[2] = 0.0
    p1.multVecMatrix(imat)

    //let v = mesh.makeVertex(p1);
    const nev = mesh.splitEdge(e, t)
    emap.set(e, nev[1])

    verts2.add(nev[1])
    edges2.add(nev[0])
  }

  for (const f of faces) {
    for (const list of f.lists) {
      let l1, l2

      for (const l of list) {
        if (verts2.has(l.v)) {
          if (!l1) {
            l1 = l
          } else if (l !== l1.prev && l !== l1.next) {
            l2 = l
            break
          }
        }
      }

      if (l1 && l2) {
        //console.log("SPLIT!");
        mesh.splitFace(f, l1, l2)
      }
    }
  }

  return {
    newVerts: verts2,
    newEdges: edges2,
  }
}

export function duplicateMesh(mesh: Mesh, geom: Iterable<Element>) {
  const vs = new Set<Vertex>()
  const fs = new Set<Face>()
  const es = new Set<Edge>()

  const sets = {
    [MeshTypes.VERTEX]: vs as Set<Element>,
    [MeshTypes.EDGE]  : es as Set<Element>,
    [MeshTypes.FACE]  : fs as Set<Element>,
  }

  for (const e of geom) {
    if (e.type === MeshTypes.LOOP) {
      continue
    }

    sets[e.type as keyof typeof sets].add(e)
  }

  const newvs = []
  const newmap = new Map()
  const oldmap = new Map()

  for (const f of fs) {
    for (const list of f.lists) {
      for (const l of list) {
        vs.add(l.v)
        es.add(l.e)
      }
    }
  }

  for (const e of es) {
    vs.add(e.v1)
    vs.add(e.v2)
  }

  for (const v of vs) {
    v.index = newvs.length

    const v2 = mesh.makeVertex(v)
    mesh.copyElemData(v2, v)

    newvs.push(v2)
    newmap.set(v, v2)
    oldmap.set(v2, v)
  }

  const newes = [] as Edge[]

  for (const e of es) {
    const v1 = newvs[e.v1.index]
    const v2 = newvs[e.v2.index]

    e.index = newes.length

    const e2 = mesh.makeEdge(v1, v2)
    mesh.copyElemData(e2, e)

    newmap.set(e, e2)
    oldmap.set(e2, e)
    newes.push(e2)
  }

  const newfs = [] as Face[]

  for (const f of fs) {
    const vs = []
    const ls = []

    let listi = 0
    let f2

    for (const list of f.lists) {
      vs.length = 0
      ls.length = 0

      for (const l of list) {
        vs.push(newvs[l.v.index])
        ls.push(l)
      }

      let list2
      if (listi === 0) {
        f2 = mesh.makeFace(vs)

        newfs.push(f2)
        oldmap.set(f, f2)
        newmap.set(f2, f)

        list2 = f2.lists[0]
      } else {
        mesh.makeHole(f, vs)
        list2 = f2!.lists[listi]
      }

      let l = list2.l
      for (let i = 0; i < ls.length; i++) {
        mesh.copyElemData(l, ls[i])
        l = l.next
      }

      listi++
    }
  }

  return {
    newVerts: newvs,
    newEdges: newes,
    newFaces: newfs,
    oldToNew: newmap,
    newToOld: oldmap,
  }
}

/**
 mergeMap maps deleting vertices to ones that will be kept.

 */
export function weldVerts(mesh: Mesh, mergeMap: Map<Vertex, Vertex>) {
  const vs = new Set<Vertex>(mergeMap.keys())
  const es = new Set<Edge>()
  const fs = new Set<Face>()

  for (const v of mergeMap.values()) {
    v.flag |= MeshFlags.UPDATE
    vs.add(v)
  }

  for (const v of vs) {
    for (const e of v.edges) {
      es.add(e)

      for (const l of e.loops) {
        fs.add(l.f)
      }
    }
  }

  //unlink loops from edges;
  for (const f of fs) {
    for (const l of f.loops) {
      mesh._radialRemove(l.e, l)
    }
  }

  const killes = new Set<Edge>()

  //substitute merge verts into edges
  for (const e of es) {
    const v1 = mergeMap.get(e.v1)
    const v2 = mergeMap.get(e.v2)

    if (v1 && v2) {
      killes.add(e)
    } else if (v1) {
      killes.add(e)

      const e2 = mesh.ensureEdge(v1, e.v2)
      mesh.copyElemData(e2, e)
    } else if (v2) {
      killes.add(e)

      const e2 = mesh.ensureEdge(e.v1, v2)
      mesh.copyElemData(e2, e)
    }
  }

  //substitute merge verts into faces
  for (const f of fs) {
    for (const l of f.loops) {
      const v2 = mergeMap.get(l.v)
      if (v2) {
        l.v = v2
      }
    }
  }

  //eliminate duplicate verts
  for (const f of fs) {
    const flag = MeshFlags.TEMP2
    const flag2 = MeshFlags.TEMP3

    for (const l of f.loops) {
      l.flag &= ~flag
      l.v.flag &= ~flag
    }

    for (const list of new Set(f.lists)) {
      let l = list.l,
        _i = 0

      for (const l of list) {
        l.v.flag &= ~flag2
      }

      do {
        if (l.v.flag & (flag2 | flag)) {
          if (!(l.v.flag & flag2)) {
            //hrm, holes are sharing verts, what to do.  the same?
          }

          l.prev.next = l.next
          l.next.prev = l.prev

          //do not allow killLoop to mess with l.e
          l.e = undefined as unknown as Edge
          mesh._killLoop(l)

          if (l === list.l) {
            list.l = l.next
          }

          if (l === list.l) {
            list.l = undefined as unknown as Loop
            list.length = 0
            break
          } else {
            list.length--
          }
        }
        l.v.flag |= flag
        l.v.flag |= flag2

        l = l.next
        if (_i++ > 1000000) {
          console.warn('infinite loop error')
          break
        }
      } while (l !== list.l)

      if (list.length === 0) {
        if (list === f.lists[0]) {
          //delete entire face
          mesh.killFace(f)
          continue
        } else {
          f.lists.remove(list)
        }
      }
    }
  }

  //remove deleted faces
  for (const f of fs) {
    if (f.eid < 0) {
      continue
    }

    let bad = f.lists.length === 0
    for (const list of f.lists) {
      list._recount()
      bad = bad || list.length < 3
    }

    if (bad) {
      mesh.killFace(f)
      continue
    }
  }

  //relink face loops to edges
  for (const f of fs) {
    if (f.eid < 0) {
      continue
    }

    for (const l of f.loops) {
      l.e = mesh.ensureEdge(l.v, l.next.v)
      mesh._radialInsert(l.e, l)
    }
  }

  //remove deleted edges
  for (const e of killes) {
    if (e.eid >= 0) {
      mesh.killEdge(e)
    }
  }

  for (const v of mergeMap.keys()) {
    if (v.eid >= 0) {
      mesh.killVertex(v)
    }
  }

  mesh.fixDuplicateFaces(false)
}

export function symmetrizeMesh(
  mesh: Mesh,
  faces: Set<Face>,
  axis: Number3,
  sign: number,
  mergeThreshold = 0.0001
): void {
  const vs = new Set<Vertex>()
  const es = new Set<Edge>()

  for (const f of faces) {
    for (const list of f.lists) {
      for (const l of list) {
        vs.add(l.v)
        es.add(l.e)
      }
    }
  }

  const vec = new Vector3()
  vec[axis] = sign

  bisectMesh(mesh, faces, vec, undefined, mergeThreshold)

  const vs2 = new Set<Vertex>()
  const mergeMap = new Map<Vertex, Vertex>()

  for (const v of vs) {
    if (Math.sign(v[axis]) !== Math.sign(sign) && Math.abs(v[axis]) > 0.0001) {
      for (const f of v.faces) {
        faces.delete(f)
      }

      mesh.killVertex(v)
    } else {
      vs2.add(v)
    }
  }

  const geom = new Set<Element>()

  for (const v of vs2) {
    for (const e of v.edges) {
      geom.add(e)

      for (const l of e.loops) {
        geom.add(l.f)
      }
    }
  }

  const ret = duplicateMesh(mesh, geom)
  for (const v of ret.newVerts) {
    v[axis] = -v[axis]

    if (Math.abs(v[axis]) < mergeThreshold) {
      mergeMap.set(v, ret.newToOld.get(v))
    }
  }

  for (const f of ret.newFaces) {
    mesh.reverseWinding(f)
  }

  console.log('mergeMap', mergeMap)

  weldVerts(mesh, mergeMap)
}

//export function rotateEdge(mesh, e) {
//}

export function flipLongTriangles(mesh: Mesh, facesIterable: Iterable<Face>, lctx?: LogContext): void {
  const es = new Set<Edge>()
  const faces = new Set<Face>()

  for (const f of facesIterable) {
    let count = 0
    for (const l of f.loops) {
      count++
    }

    if (count !== 3 || f.lists.length > 1) {
      continue
    }

    faces.add(f)
  }

  for (const f of faces) {
    for (const l of f.loops) {
      if (l.radial_next !== l && faces.has(l.radial_next.f)) {
        es.add(l.e)
      }
    }
  }

  console.log(es, faces)
  const deles = new Set<Edge>()

  for (const e of es) {
    if (e.eid < 0) {
      continue
    }

    const l1 = e.l!
    const l2 = e.l!.radial_next

    let ok = true

    const w1 = winding(l1.v.co, l2.prev.v.co, l1.prev.v.co)
    const w2 = winding(l1.prev.v.co, l2.prev.v.co, l1.next.v.co)

    ok = ok && w1 === w2
    ok = ok && l1.prev.v.co.vectorDistanceSqr(l2.prev.v.co) < e.v1.co.vectorDistanceSqr(e.v2.co)
    ok = ok && l1.prev.v !== l2.prev.v

    if (ok) {
      es.delete(e)

      const f1 = mesh.makeTri(l1.v, l2.prev.v, l1.prev.v, lctx, true)
      const f2 = mesh.makeTri(l1.prev.v, l2.prev.v, l1.next.v, lctx, true)

      const e2 = mesh.ensureEdge(l1.prev.v, l2.prev.v, lctx)

      mesh.copyElemData(e2, e)

      deles.add(e)

      if (f1) {
        const lb1 = f1.lists[0].l
        mesh.copyElemData(f1, l1.f)
        mesh.copyElemData(lb1, lb1)
        mesh.copyElemData(lb1.next, l2.prev)
        mesh.copyElemData(lb1.prev, l1.prev)

        f1.calcNormal()
      }

      if (f2) {
        mesh.copyElemData(f2, l2.f)
        const lb2 = f2.lists[0].l
        mesh.copyElemData(lb2, l1.prev)
        mesh.copyElemData(lb2.next, l2.prev)
        mesh.copyElemData(lb2.prev, l1.next)
        f2.calcNormal()
      }

      if (e.eid >= 0) {
        e.v1.flag |= MeshFlags.UPDATE
        e.v2.flag |= MeshFlags.UPDATE
        mesh.killEdge(e, lctx)
      }
    }
  }

  for (const e of deles) {
    if (e.eid < 0) {
      continue
    }

    e.v1.flag |= MeshFlags.UPDATE
    e.v2.flag |= MeshFlags.UPDATE

    mesh.killEdge(e, lctx)
  }

  console.log('done')
}

export const TriQuadFlags = {
  NICE_QUADS  : 1,
  COLOR       : 2,
  SEAM        : 4,
  UVS         : 8,
  MARK_ONLY   : 16,
  MARKED_EDGES: 32,
  FACE_SETS   : 64,
  DEFAULT     : 1 | 4 | 32 | 64,
}

export function trianglesToQuads(
  mesh: Mesh,
  facesIter: Iterable<Face>,
  flag = TriQuadFlags.DEFAULT,
  lctx?: LogContext,
  newfaces?: Set<Face>
): void {
  let faces = facesIter instanceof Set ? facesIter : new Set(facesIter)
  const es = new Set<Edge>()
  const faces2 = new Set<Face>()

  const mark_only = flag & TriQuadFlags.MARK_ONLY
  if (mark_only) {
    flag &= ~TriQuadFlags.MARK_ONLY
  }

  const eflag = MeshFlags.TEMP3
  const fflag = MeshFlags.TEMP3
  const quadflag = MeshFlags.QUAD_EDGE
  const cd_fset = new AttrRef<IntElem>()

  if (flag & TriQuadFlags.FACE_SETS) {
    cd_fset.i = getFaceSets(mesh, false)
  }

  for (const f of faces) {
    f.flag &= ~fflag

    let count = 0
    for (const l of f.loops) {
      count++
    }

    if (count !== 3 || f.lists.length > 1) {
      if (mark_only) {
        for (const l of f.loops) {
          l.e.flag &= ~quadflag
        }
      }
      continue
    }

    faces2.add(f)
  }
  faces = faces2

  const have_fsets = cd_fset.exists

  for (const f of faces) {
    const fset = have_fsets ? cd_fset.get(f).value : 0

    for (const l of f.loops) {
      if (have_fsets && Math.abs(cd_fset.get(l.radial_next.f).value) !== fset) {
        continue
      }

      if (mark_only) {
        //save last quadflag state in eflag
        if (l.e.flag & quadflag) {
          l.e.flag |= eflag
        } else {
          l.e.flag &= ~eflag
        }

        l.e.flag &= ~quadflag
      }

      if (l.radial_next !== l && faces.has(l.radial_next.f)) {
        es.add(l.e)
      }
    }
  }

  const cd_color = mesh.verts.customData.getLayerRef(ColorLayerElem)
  const cd_uv = mesh.loops.customData.getLayerRef(UVLayerElem)
  const have_color = cd_color.exists
  const have_uv = cd_uv.exists

  const t1 = new Vector3()
  const t2 = new Vector3()
  const t3 = new Vector3()

  const dot3 = (v1: Vector3, v2: Vector3, v3: Vector3, n: Vector3): number => {
    let dx1 = v1[0] - v2[0],
      dy1 = v1[1] - v2[1],
      dz1 = v1[2] - v2[2]
    let dx2 = v3[0] - v2[0],
      dy2 = v3[1] - v2[1],
      dz2 = v3[2] - v2[2]

    /*
    let d1 = dx1*n[0] + dy1*n[1] + dz1*n[2];
    let d2 = dx2*n[0] + dy2*n[1] + dz2*n[2];

    d1 = -d1;
    dx1 += d1*n[0];
    dy1 += d1*n[1];
    dz1 += d1*n[2];

    d2 = -d2;
    dx2 += d2*n[0];
    dy2 += d2*n[1];
    dz2 += d2*n[2];//*/

    let l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1 + dz1 * dz1)
    let l2 = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2)

    if (l1 > 0.00001) {
      l1 = 1.0 / l1
      dx1 *= l1
      dy1 *= l1
      dz1 *= l1
    }

    if (l2 > 0.00001) {
      l2 = 1.0 / l2
      dx2 *= l2
      dy2 *= l2
      dz2 *= l2
    }

    const f = dx1 * dx2 + dy1 * dy2 + dz1 * dz2
    return Math.abs(Math.acos(f * 0.9999) - Math.PI * 0.5)
    //return f*f;
    return Math.abs(f)
  }

  const no = new Vector3()

  const errorNiceQuad = (e: Edge, v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex) => {
    //no.load(v1.no).add(v2.no).add(v3.no).add(v4.no).normalize();

    const th1 = dot3(v4.co, v1.co, v2.co, no)
    const th2 = dot3(v1.co, v2.co, v3.co, no)
    const th3 = dot3(v2.co, v3.co, v4.co, no)
    const th4 = dot3(v3.co, v4.co, v1.co, no)

    //t1.load(v1.no).add(v3.no).normalize();
    //t2.load(v2.no).add(v4.no).normalize();

    let f = (th1 + th2 + th3 + th4) * 0.25

    f += (1.0 - math.dihedral_v3_sqr(v1.co, v2.co, v3.co, v4.co)) * 0.25
    f += (1.0 - math.dihedral_v3_sqr(v2.co, v3.co, v4.co, v1.co)) * 0.25

    //let th = t1.dot(t2);
    //f += th*35.0;
    //return th*10.0+f;

    //return Math.abs(th);

    //f += Math.abs(th)*0.25;

    return Math.abs(f)
  }

  if (flag & TriQuadFlags.UVS && !have_uv) {
    flag &= ~TriQuadFlags.UVS
  }

  if (flag & TriQuadFlags.COLOR && !have_color) {
    flag &= ~TriQuadFlags.COLOR
  }

  const errorSeam = (e: Edge, v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex) => {
    return e.flag & MeshFlags.SEAM ? 100000 : 0.0
  }

  const errorUv = (e: Edge, v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex) => {
    const l1 = e.l!
    const l2 = e.l!.radial_next

    const u1 = cd_uv.get(l1).uv
    const u2 = cd_uv.get(l2).uv
    const u3 = cd_uv.get(l1.next).uv
    const u4 = cd_uv.get(l1.next.radial_next).uv

    return u1.vectorDistanceSqr(u2) + u3.vectorDistanceSqr(u4)
  }

  const errorColor = (e: Edge, v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex): number => {
    const l1 = e.l!
    const l2 = l1.radial_next

    const u1 = cd_color.get(l1.v).color
    const u2 = cd_color.get(l2.v).color
    const u3 = cd_color.get(l1.next.v).color
    const u4 = cd_color.get(l1.next.radial_next.v).color

    return u1.vectorDistanceSqr(u2) + u3.vectorDistanceSqr(u4)
  }

  const errorQuadFlag = (e: Edge, v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex): number => {
    return e.flag & MeshFlags.QUAD_EDGE ? -100000 : 0.0
  }

  const funcs1 = {
    [TriQuadFlags.COLOR]       : errorColor,
    [TriQuadFlags.UVS]         : errorUv,
    [TriQuadFlags.SEAM]        : errorSeam,
    [TriQuadFlags.NICE_QUADS]  : errorNiceQuad,
    [TriQuadFlags.MARKED_EDGES]: errorQuadFlag,
  }

  const funcs = [] as (typeof funcs1)[keyof typeof funcs1][]

  for (const k in TriQuadFlags) {
    if (k === 'DEFAULT' || k === 'FACE_SETS') {
      continue
    }

    const v = TriQuadFlags[k as keyof typeof TriQuadFlags]

    if (flag & v) {
      funcs.push(funcs1[v])
    }
  }

  const error = (e: Edge, v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex) => {
    let sum = 0.0
    for (const f of funcs) {
      sum += f(e, v1, v2, v3, v4)
    }

    return sum
  }

  let i = 0
  const edges = []
  for (const e of es) {
    edges.push(i++)
  }

  const ETOT = 6

  const edata = [] as (Edge | Loop | number)[]
  for (const e of es) {
    const la = e.l!
    const lb = la.radial_next

    const l4 = la.prev
    const l3 = la.next
    const l2 = lb.prev
    const l1 = la

    const a = edata.length

    edata.push(e)
    edata.push(l1)
    edata.push(l2)
    edata.push(l3)
    edata.push(l4)

    const w = error(
      e,
      (edata[a + 1] as Loop).v,
      (edata[a + 2] as Loop).v,
      (edata[a + 3] as Loop).v,
      (edata[a + 4] as Loop).v
    )
    edata.push(w)
  }

  edges.sort((a, b) => {
    a *= ETOT
    b *= ETOT

    const w1 = edata[a + 5] as number
    const w2 = edata[b + 5] as number

    return w1 - w2
  })

  const ws = [0.5, 0.5]
  const fs: Face[] = new Array(2)
  const chflag = ChangeFlags.FLAG

  for (let i of edges) {
    i *= ETOT

    const e = edata[i] as Edge

    if (!e.l || !faces.has(e.l.f) || !faces.has(e.l.radial_next.f)) {
      continue
    }

    const l1 = edata[i + 1] as Loop
    const l2 = edata[i + 2] as Loop
    const l3 = edata[i + 3] as Loop
    const l4 = edata[i + 4] as Loop

    const f1 = e.l.f
    const f2 = e.l.radial_next.f

    faces.delete(f1)
    faces.delete(f2)

    if (mark_only) {
      if (!(f1.flag & fflag) && !(f2.flag & fflag)) {
        e.flag |= quadflag

        f1.flag |= fflag
        f2.flag |= fflag

        if (lctx && !!(e.flag & eflag) !== !!(e.flag & quadflag)) {
          lctx.changeEdge(e, chflag)
        }
      }

      continue
    }

    fs[0] = f1
    fs[1] = f2

    const vflag = MeshFlags.TEMP2
    l1.v.flag &= ~vflag
    l2.v.flag &= ~vflag
    l3.v.flag &= ~vflag
    l4.v.flag &= ~vflag

    let bad = false

    l1.v.flag |= vflag
    bad = bad || !!(l2.v.flag & vflag)

    l2.v.flag |= vflag
    bad = bad || !!(l3.v.flag & vflag)

    l3.v.flag |= vflag
    bad = bad || !!(l4.v.flag & vflag)

    if (bad) {
      continue
    }

    const f = mesh.makeQuad(l1.v, l2.v, l3.v, l4.v)
    if (!f) {
      continue
    }

    if (newfaces) {
      newfaces.add(f)
    }

    if (lctx) {
      lctx.newFace(f)
    }

    const l = f.lists[0].l

    mesh.copyElemData(f, f1)
    mesh.faces.customDataInterp(f, fs, ws)

    mesh.copyElemData(l, l1)
    mesh.copyElemData(l.next, l2)
    mesh.copyElemData(l.next.next, l3)
    mesh.copyElemData(l.prev, l4)

    mesh.killEdge(e, lctx)

    f.calcNormal()
  }
}

export function recalcWindings(mesh: Mesh, facesIter: Iterable<Face> = mesh.faces, lctx?: LogContext): void {
  const faces = new Set(facesIter)

  const shells: Set<Face>[] = []
  const stack: Face[] = []
  const flag = MeshFlags.TEMP3

  for (const f of faces) {
    f.flag &= ~flag
  }

  for (const f of faces) {
    if (f.flag & flag) {
      continue
    }

    stack.length = 0
    stack.push(f)
    f.flag |= flag

    const shell: Face[] = []

    while (stack.length > 0) {
      const f2 = stack.pop()!

      shell.push(f2)
      f2.flag |= flag

      for (const l of f2.loops) {
        let lr = l.radial_next
        let _i = 0

        while (lr !== l) {
          if (!(lr.f.flag & flag) && faces.has(lr.f)) {
            stack.push(lr.f)
            lr.f.flag |= flag
          }

          lr = lr.radial_next

          if (_i++ > 100) {
            console.error('Infinite loop error')
            break
          }
        }
      }
    }

    shells.push(new Set(shell))
  }

  console.log('shells:', shells)

  for (const shell of shells) {
    const cent = new Vector3()
    let tot = 0.0

    for (const f of shell) {
      cent.add(f.cent)

      tot++
    }

    if (!tot) {
      continue
    }

    cent.mulScalar(1.0 / tot)
    let maxdis: number | undefined = undefined
    let maxf: Face | undefined = undefined

    for (const f of shell) {
      const dis = f.cent.vectorDistance(cent)

      if (maxdis === undefined || dis > maxdis) {
        maxf = f
        maxdis = dis
      }

      f.flag &= ~flag
    }

    if (maxf === undefined) {
      continue
    }

    stack.length = 0

    maxf.calcNormal()
    const n = new Vector3(maxf.cent).sub(cent).normalize()

    if (maxf.no.dot(n) < 0) {
      mesh.reverseWinding(maxf)
    }

    stack.push(maxf)
    maxf.flag |= flag

    while (stack.length > 0) {
      const f = stack.pop()!

      for (const l of f.loops) {
        let lr = l.radial_next

        let _i = 0

        while (lr !== l) {
          let ok = lr !== l && shell.has(lr.f)
          ok = ok && !(lr.f.flag & flag)

          const next = lr.radial_next

          if (ok) {
            lr.f.flag |= flag
            stack.push(lr.f)

            if (lr.v === l.v) {
              mesh.reverseWinding(lr.f)
            }
          }

          if (_i++ > 100) {
            console.error('Infinite loop error', lr, l.eid)
            break
          }

          lr = next
        }
      }
    }
  }
}

/** XXX untested */
export function splitNonManifoldEdge(mesh: Mesh, e: Edge, l1: Loop, l2: Loop, lctx?: LogContext): void {
  if (!e.l || e.l === e.l.radial_next || e.l === e.l.radial_next.radial_next) {
    return
  }

  let count = 0
  for (const l of e.loops) {
    count++
  }

  const v1 = mesh.makeVertex(e.v1)
  const v2 = mesh.makeVertex(e.v2)

  if (lctx) {
    lctx.newVertex(v1)
    lctx.newVertex(v2)
  }

  v1.no.load(e.v1.no)
  v2.no.load(e.v2.no)

  mesh.copyElemData(v1, e.v1)
  mesh.copyElemData(v2, e.v2)

  const e2 = mesh.makeEdge(v1, v2)
  mesh.copyElemData(e2, e)

  if (lctx) {
    lctx.newEdge(e2)
  }

  let f2: Face | undefined
  for (let i = 0; i < count - 2; i++) {
    // why do we need this type annotation? TS gives
    // a weird error, a bug?
    let minl: Loop = e.l!
    let _i = 0

    do {
      if (_i++ > 100) {
        console.warn('infinite loop error')
        break
      }

      if (minl !== l1 && minl !== l2) {
        break
      }

      minl = minl.radial_next
    } while (minl !== e.l)

    if (minl === l1 || minl === l2) {
      break
    }

    const f = minl.f

    for (const list of f.lists) {
      const vs = []

      for (const l of list) {
        if (l.v === e.v1) {
          vs.push(v1)
        } else if (l.v === e.v2) {
          vs.push(v2)
        } else {
          vs.push(l.v)
        }
      }

      if (list === f.lists[0]) {
        f2 = mesh.makeFace(vs, undefined, undefined, lctx)
        mesh.copyElemData(f2, f)
        f2.index = f.index
      } else {
        mesh.makeHole(f2!, vs)
      }
    }

    for (let i = 0; i < f.lists.length; i++) {
      const list1 = f.lists[i]
      const list2 = f2!.lists[i]

      let l1 = list1.l
      let l2 = list2.l
      let _i = 0

      do {
        mesh.copyElemData(l2, l1)

        l1 = l1.next
        l2 = l2.next
        if (_i++ > 100000) {
          console.error('Infinite loop error')
          break
        }
      } while (l1 !== list1.l)
    }

    //make sure we nuke any wire edges
    const es2 = []
    for (const l of f.loops) {
      if (l.radial_next === l) {
        es2.push(l.e)
      }
    }

    if (f.eid >= 0) {
      mesh.killFace(f, lctx)
    }

    for (const e of es2) {
      mesh.killEdge(e, lctx)
    }
  }
}

export function pruneLooseGeometry(mesh: Mesh, lctx?: LogContext, minShellVerts = 5) {
  const flag = MeshFlags.NOAPI_TEMP1

  for (const e of mesh.edges) {
    if (!e.l) {
      mesh.killEdge(e, lctx)
    }
  }

  for (const v of mesh.verts) {
    if (v.valence === 0) {
      mesh.killVertex(v, undefined, lctx)
    } else {
      v.flag &= ~flag
    }
  }

  const shells: Vertex[][] = []
  const stack: Vertex[] = []

  for (const v of mesh.verts) {
    if (v.flag & flag) {
      continue
    }

    const shell = [] as Vertex[]
    shells.push(shell)

    stack.length = 0
    stack.push(v)
    v.flag |= flag

    while (stack.length > 0) {
      const v2 = stack.pop()!
      shell.push(v2)

      for (const v3 of v2.neighbors) {
        if (v3.flag & flag) {
          continue
        }

        v3.flag |= flag
        stack.push(v3)
      }
    }
  }

  console.log('Shells:', shells)
  for (const shell of shells) {
    if (shell.length < minShellVerts) {
      for (const v of shell) {
        mesh.killVertex(v, undefined, lctx)
      }
    }
  }
}

export function fixManifold(mesh: Mesh, lctx?: LogContext) {
  function isnan(f: number) {
    return isNaN(f) || !isFinite(f)
  }

  let bad = 0

  for (const v of mesh.verts) {
    for (let i = 0; i < 3; i++) {
      if (isnan(v.co[i])) {
        v.co[i as 0 | 1 | 2] = (Math.random() - 0.5) * 0.001
        v.flag |= MeshFlags.UPDATE
        mesh.verts.setSelect(v, true)
        bad |= 1
      }
    }

    if (isnan(v.no.dot(v.no))) {
      v.no.zero()
      v.no[2] = 1.0
      bad |= 2
      v.flag |= MeshFlags.UPDATE
      mesh.verts.setSelect(v, true)
    }
  }

  mesh.fixLoops(lctx)

  if (bad) {
    console.log('NaN error!', bad)
    mesh.regenTessellation()
    mesh.recalcNormals()
  }

  const es = new Set<Edge>()

  for (const e of mesh.edges) {
    let c = 0
    for (const l of e.loops) {
      c++
    }

    if (c > 2) {
      es.add(e)
    }
  }

  const stack = [] as Face[]
  const flag = MeshFlags.TEMP3
  for (const f of mesh.faces) {
    f.flag &= ~flag
  }

  const shells = []

  for (const f of mesh.faces) {
    if (f.flag & flag) {
      continue
    }

    const shell = [] as Face[]

    stack.length = 0
    stack.push(f)
    shell.push(f)

    f.flag |= flag

    while (stack.length > 0) {
      const f2 = stack.pop()!
      shell.push(f2)

      for (const l of f2.loops) {
        let count = 0
        for (const l2 of l.e.loops) {
          count++
        }

        let ok = count === 2
        ok = ok && !(l.radial_next.f.flag & flag)

        if (ok) {
          stack.push(l.radial_next.f)
          l.radial_next.f.flag |= flag
        }
      }
    }

    shells.push(shell)
  }

  for (const shell of shells) {
    for (const f of shell) {
      f.index = shell.length
    }
  }

  console.log('shells', shells)
  console.log('non-manifold edges:', es)

  if (es.size === 0) {
    return false
  }

  for (const e of es) {
    let count = 0
    for (const l of e.loops) {
      count++
    }

    const v1 = mesh.makeVertex(e.v1)
    const v2 = mesh.makeVertex(e.v2)

    v1.no.load(e.v1.no)
    v2.no.load(e.v2.no)

    mesh.copyElemData(v1, e.v1)
    mesh.copyElemData(v2, e.v2)

    let e2 = mesh.getEdge(v1, v2)

    if (!e2) {
      e2 = mesh.makeEdge(v1, v2)

      if (lctx) {
        lctx.newEdge(e2)
      }
    }

    mesh.copyElemData(e2, e)

    let minl: Loop | undefined, minw: number | undefined

    for (let i = 0; i < count - 2; i++) {
      for (const l of e.loops) {
        if (minl === undefined || l.f.index < minw!) {
          minl = l
          minw = l.f.index
        }
      }

      let f2
      const f = minl!.f

      for (const list of f.lists) {
        const vs = []

        for (const l of list) {
          if (l.v === e.v1) {
            vs.push(v1)
          } else if (l.v === e.v2) {
            vs.push(v2)
          } else {
            vs.push(l.v)
          }
        }

        if (list === f.lists[0]) {
          f2 = mesh.makeFace(vs)
          mesh.copyElemData(f2, f)
          f2.index = f.index
        } else {
          mesh.makeHole(f2!, vs)
        }
      }

      for (let i = 0; i < f.lists.length; i++) {
        const list1 = f.lists[i]
        const list2 = f2!.lists[i]

        let l1 = list1.l
        let l2 = list2.l
        let _i = 0

        do {
          mesh.copyElemData(l2, l1)

          l1 = l1.next
          l2 = l2.next
          if (_i++ > 100000) {
            console.error('Infinite loop error')
            break
          }
        } while (l1 !== list1.l)
      }

      if (f2 && lctx) {
        lctx.newFace(f2)
      }

      //make sure we nuke any wire edges
      const es2 = []
      for (const l of f.loops) {
        if (l.radial_next === l) {
          es2.push(l.e)
        }
      }

      if (f.eid >= 0) {
        mesh.killFace(f, lctx)
      }

      for (const e of es2) {
        mesh.killEdge(e, lctx)
      }
    }
  }

  mesh.regenTessellation()
  mesh.recalcNormals()

  return true
}

const ftmp = [] as Face[]

export function connectVerts(mesh: Mesh, v1: Vertex, v2: Vertex) {
  const fs = ftmp
  fs.length = 0

  for (const f of v1.faces) {
    fs.push(f)
  }

  for (const f of fs) {
    outer: for (const list of f.lists) {
      for (const l of list) {
        if (l.v === v2) {
          mesh.splitFaceAtVerts(f, v1, v2)
          break outer
        }
      }
    }
  }
  //let heap = new util.MinHeapQueue();
}

const tmp1 = new Vector3()
const tmp2 = new Vector3()
const tmp3 = new Vector3()

export function vertexSmooth(
  mesh: Mesh,
  verts: Iterable<Vertex> = mesh.verts,
  fac = 0.5,
  proj = 0.0,
  useBoundary = true
) {
  verts = ReusableIter.getSafeIter(verts)

  const cd_dyn_vert = getDynVerts(mesh)
  const fsetsAttr = getFaceSetsAttr(mesh, false) as AttrRef<IntElem>
  useBoundary = true

  for (const v of verts) {
    const co = tmp1.zero()
    let totw = 0

    const mv = v.customData[cd_dyn_vert] as MDynVert
    mv.check(v, fsetsAttr)

    let bound = useBoundary ? v.flag & MeshFlags.BOUNDARY : 0
    bound |= mv.flag & BVHVertFlags.BOUNDARY_ALL

    for (const v2 of v.neighbors) {
      const mv2 = v2.customData[cd_dyn_vert] as MDynVert

      const co2 = tmp2.load(v2.co)
      let w = 0.0

      mv2.check(v2, fsetsAttr)

      let bound2 = v2.flag & MeshFlags.BOUNDARY
      bound2 |= mv2.flag & BVHVertFlags.BOUNDARY_ALL

      if (bound && bound != bound2) {
        continue
      }

      if (proj !== 0.0) {
        const w2 = 1.0 - proj
        w = v2.co.vectorDistance(v.co)

        w += (1.0 - w) * w2

        co2.sub(v.co)
        const d = co2.dot(v.no)

        co2.addFac(v.no, -d).add(v.co)
      } else {
        w = 1.0
      }

      co.addFac(co2, w)
      totw += w
    }

    if (totw > 0.0) {
      co.mulScalar(1.0 / totw)
      v.co.interp(co, fac)
      v.flag |= MeshFlags.UPDATE
    }
  }
}

const smat = new Matrix4()
const stmp1 = new Vector3()
const stmp2 = new Vector3()
const stmp3 = new Vector3()

export function sortVertEdges(v: Vertex, edges = Array.from(v.edges), matout?: Matrix4): Edge[] {
  if (!Array.isArray(edges)) {
    edges = Array.from(edges)
  }

  const d = v.no.dot(v.no)
  if (d === 0.0 || isNaN(d) || !isFinite(d)) {
    v.calcNormal(true)
  }

  let ok = false

  for (const v2 of v.neighbors) {
    stmp1.load(v2.co).sub(v.co)

    if (stmp1.dot(stmp1) > 0.0) {
      stmp1.cross(v.no).normalize()
      ok = true
    }
  }

  const tan = ok ? stmp1 : undefined

  smat.makeIdentity()
  smat.makeNormalMatrix(v.no, tan)
  smat.invert()

  const co1 = stmp1.load(v.co)
  co1.multVecMatrix(smat)

  const ths = getArrayTemp<number>(edges.length)
  const idxs = getArrayTemp<number>(edges.length)

  let thi = 0

  for (const v2 of v.neighbors) {
    const co2 = stmp2.load(v2.co)
    co2.multVecMatrix(smat)

    co2.sub(co1)
    const th = Math.atan2(co2[1], co2[0])

    ths[thi++] = th
  }

  //if (Math.random() > 0.99) {
  //console.log(""+ths, ths);
  //}

  let i = 0
  for (const e of edges) {
    idxs[i] = e.index
    e.index = i++
  }

  edges.sort((a, b) => ths[a.index] - ths[b.index])

  for (let i = 0; i < idxs.length; i++) {
    edges[i].index = idxs[i]
  }

  if (matout) {
    matout.load(smat)
  }

  return edges
}

/*
        /|\
      /  | \
    / \--|  \
  /      |   \
/ -------|----\

vdata entries are:

number of edges
for each edge:
  x/y/z     : vertex coordinates
  area  : area of triangle formed with cotangent rules
  angle : cot weight
  w     : final weight
 */
const ctmp1 = new Vector3()
const ctmp2 = new Vector3()
const ctmp3 = new Vector3()
const ctmp4 = new Vector3()
const ctmp5 = new Vector3()
const ctmp6 = new Vector3()
const ctmp7 = new Vector3()
const ctmp8 = new Vector3()
const ctmp9 = new Vector3()
const ctmp10 = new Vector3()
const ctmp11 = new Vector3()
const ctmp12 = new Vector3()
const ctmp13 = new Vector3()
const ctmp14 = new Vector3()
const smat2 = new Matrix4()

export const VAREA = 0,
  VCTAN1 = 1,
  VCTAN2 = 2,
  VW = 3,
  VETOT = 4

export type CotanData = number[]

export function getCotanData(v: Vertex, _edges?: Edge[], _vdata: CotanData = []): CotanData {
  const vdata: CotanData = _vdata
  let edges = _edges
  let te

  if (edges === undefined) {
    edges = te = getArrayTemp<Edge>(v.valence)

    edges.length = 0
    for (const e of v.edges) {
      edges.push(e)
    }
  }

  let vi = vdata.length

  vdata.push(v[0])
  vdata.push(v[1])
  vdata.push(v[2])
  vdata.push(edges.length)

  //try to make sane values for pathological 1 and 2-valence cases
  if (edges.length === 1) {
    vi = vdata.length
    vdata.length += VETOT

    vdata[vi] = Math.PI
    vdata[vi + 1] = 0.00001
    vdata[vi + 2] = 0.5
    vdata[vi + 3] = 0.00001
  } else if (edges.length === 2) {
    vi = vdata.length
    vdata.length += VETOT * 2

    for (let i = 0; i < 2; i++) {
      vdata[vi] = Math.PI
      vdata[vi + 1] = 0.00001
      vdata[vi + 2] = 0.5
      vdata[vi + 3] = 0.00001

      vi += VETOT
    }
  } else {
    const mat = smat2
    mat.makeIdentity()

    sortVertEdges(v, edges, mat)

    let i = 0
    for (const e of v.edges) {
      e.index = i++
    }

    vdata.length += edges.length * VETOT
    let totw = 0.0
    let totarea = 0.0

    for (let i = 0; i < edges.length; i++) {
      const i1 = i,
        i2 = (i + 1) % edges.length
      const i3 = (i + 2) % edges.length

      const e1 = edges[i1],
        e2 = edges[i2]
      const e3 = edges[i3]

      const v1 = ctmp1.load(v.co)
      const v2 = ctmp2.load(e1.otherVertex(v).co)
      const v3 = ctmp3.load(e2.otherVertex(v).co)
      const v4 = ctmp4.load(e3.otherVertex(v).co)

      const t1 = ctmp6.load(v2).sub(v.co).normalize()
      const t2 = ctmp7.load(v3).sub(v.co).normalize()

      const angle = Math.acos(t1.dot(t2) * 0.99999)
      let area = math.tri_area(v1, v2, v3)

      v1.multVecMatrix(mat)
      v2.multVecMatrix(mat)
      v3.multVecMatrix(mat)
      v4.multVecMatrix(mat)

      //v1[2] = v2[2] = v3[2] = v4[2] = 0.0;

      const angle1 = Vector3.normalizedDot3(v1, v2, v3)
      const angle2 = Vector3.normalizedDot3(v1, v4, v3)

      //build voronoi area
      if (1) {
        //angle < Math.PI*0.5) {
        const l1 = ctmp8.load(v2).sub(v1)
        const l2 = ctmp9.load(v3).sub(v1)

        const c1 = ctmp10.load(v2).interp(v1, 0.5)
        const c2 = ctmp11.load(v3).interp(v1, 0.5)

        l1.load(c1).sub(v1).swapAxes(0, 1)
        l2.load(c2).sub(v1).swapAxes(0, 1)
        l1[1] = -l1[1]
        l2[1] = -l2[1]

        l1.add(c1)
        l2.add(c2)

        const oldarea = area
        area = 0
        let ok = false

        let p = math.line_line_isect(c1, l1, c2, l2)
        if (p !== math.COLINEAR_ISECT && typeof p === 'object') {
          p[2] = v1[2] = v2[2] = v3[2] = 0.0

          ok = true
          area += math.tri_area(v1, p, v2)
          area += math.tri_area(v1, p, v3)
        }

        c1.load(v3).interp(v1, 0.5)
        c2.load(v4).interp(v1, 0.5)

        l1.load(c1).sub(v1).swapAxes(0, 1)
        l2.load(c2).sub(v1).swapAxes(0, 1)
        l1[1] = -l1[1]
        l2[1] = -l2[1]

        p = math.line_line_isect(c1, l1, c2, l2)
        if (p !== math.COLINEAR_ISECT && typeof p === 'object') {
          p[2] = v1[2] = v2[2] = v3[2] = 0.0

          ok = true
          area += math.tri_area(v1, p, v3)
          area += math.tri_area(v1, p, v4)
        }

        if (!ok) {
          area = oldarea
        }
      } // else {

      //}

      if (area === 0.0) {
        area = 0.000001
      }

      const vi2 = vi + 4 + e1.index * VETOT
      vdata[vi2 + VAREA] = area

      let cot1 = Math.abs(Math.cos(angle1) / Math.sin(angle1))
      let cot2 = Math.abs(Math.cos(angle2) / Math.sin(angle2))

      if (isNaN(cot1) || !isFinite(cot1)) {
        cot1 = 1000000.0
      }
      if (isNaN(cot2) || !isFinite(cot2)) {
        cot2 = 100000.0
      }

      const cot = cot1 + cot2

      if (cot < 0) {
        //cot = Math.abs(cot)*1.5;
      }

      vdata[vi2 + VCTAN1] = cot1
      vdata[vi2 + VCTAN2] = cot2
      vdata[vi2 + VW] = cot

      totarea += area * area

      totw += vdata[vi2 + 3] * area
    }

    if (totarea !== 0.0) {
      totarea = 1.0 / totarea
    }

    totw = 0.0
    for (let i = 0; i < edges.length; i++) {
      const e1 = edges[i]
      const vi2 = vi + 4 + e1.index * VETOT

      //vdata[vi2+VW] *= totarea;

      totw += vdata[vi2 + VW]
    }

    if (totw !== 0.0) {
      totw = 1.0 / totw
    }

    for (let i = 0; i < edges.length; i++) {
      const e1 = edges[i]
      const vi2 = vi + 4 + e1.index * VETOT

      vdata[vi2 + VW] *= totw
    }
  }

  //avoid reference leaks
  if (te) {
    for (let i = 0; i < te.length; i++) {
      te[i] = undefined as unknown as Edge
    }
  }

  return vdata
}

export function buildCotanVerts(mesh: Mesh, vertsIter: Iterable<Vertex>) {
  const verts = ReusableIter.getSafeIter<Vertex>(vertsIter)

  let i = 0
  const vdata = [] as CotanData

  const vs = new Set<Vertex>()
  for (const v of verts) {
    vs.add(v)
    for (const v2 of v.neighbors) {
      vs.add(v2)
    }
  }

  for (const v of vs) {
    const edges = getArrayTemp<Edge>(v.valence)

    let j = 0
    for (const e of v.edges) {
      edges[j++] = e
    }

    v.index = vdata.length
    getCotanData(v, edges, vdata)

    //avoid reference leaks
    for (let i = 0; i < edges.length; i++) {
      edges[i] = undefined as unknown as Edge
    }
    i++
  }

  return {vertexData: vdata, allVerts: vs}
}

export class CotanMap extends Map<Vertex, number[]> {
  recordSize = VETOT
}

export function buildCotanMap(mesh: Mesh, verts: Iterable<Vertex>): CotanMap {
  const map = new CotanMap()

  const vs = new Set<Vertex>(verts)

  for (const v of verts) {
    for (const v2 of v.neighbors) {
      vs.add(v2)
    }
  }

  for (const v of vs) {
    let list = getCotanData(v)
    list = list.slice(0, list.length)
    map.set(v, list)
  }

  return map
}

const cvtmp1 = new Vector3()
const cvtmp2 = new Vector3()
const cvtmp3 = new Vector3()
const ccrets = util.cachering.fromConstructor(Vector3, 512)
const cctmps = util.cachering.fromConstructor(Vector3, 16)

export function cotanMeanCurvature(v: Vertex, vdata: any, vi: number): Vector3 {
  if (!vdata) {
    vdata = getCotanData(v)
    vi = 0
  }

  vi += 4

  let totarea = 0
  const totw = 0.0

  const sum1 = ccrets.next().zero()
  let sum2 = 0.0

  for (const v2 of v.neighbors) {
    const cot1 = vdata[vi + VCTAN1]
    const cot2 = vdata[vi + VCTAN2]
    const area = vdata[vi + VAREA]

    totarea += area * area
  }

  const n = cctmps.next()

  let i = 0
  for (const v2 of v.neighbors) {
    const cot1 = vdata[vi + VCTAN1]
    const cot2 = vdata[vi + VCTAN2]
    const area = vdata[vi + VAREA]

    const w = cot1 + cot2
    //w = Math.abs(w);

    n.load(v.no).add(v2.no).normalize()

    sum1.addFac(n, w * area)

    //sum1 += w*area;
    sum2 += w * totarea

    vi += VETOT
    i++
  }

  //let sum = sum2 !== 0.0 ? sum1 / sum2 : 10000000.0;
  if (sum2 !== 0.0) {
    sum1.mulScalar(2.0 / sum2)
  }

  return sum1
}

export function cotanVertexSmooth(mesh: Mesh, verts: Iterable<Vertex> = mesh.verts, fac = 0.5, proj = 0.0) {
  const ret = buildCotanVerts(mesh, verts)

  const vdata = ret.vertexData
  const vs = ret.allVerts

  console.log(vs, vdata)

  for (const v of verts) {
    let totw = 0.0
    const co1 = cvtmp1.zero()

    let vi = v.index + 4
    //let etot = vdata[vi];

    const report = Math.random() > 0.99
    if (report) {
      console.log('start')
    }

    for (const v2 of v.neighbors) {
      const cot = vdata[vi + VW]
      const area = vdata[vi + VAREA]

      let w = cot * 0.5 + 0.5

      if (w < 0) {
        w = Math.abs(w)
      }

      const co2 = cvtmp2
      const vi2 = v2.index

      co2[0] = vdata[vi2]
      co2[1] = vdata[vi2 + 1]
      co2[2] = vdata[vi2 + 2]

      if (proj > 0.0) {
        co2.sub(v.co)

        const d = co2.dot(v.no)
        co2.addFac(v.no, -d).add(v.co)
      }

      if (report) {
        console.log('  ' + w.toFixed(5))
      }

      co1.addFac(co2, w)
      totw += w

      vi += VETOT
    }

    if (totw !== 0.0) {
      co1.mulScalar(1.0 / totw)
      v.co.interp(co1, fac)
      v.flag |= MeshFlags.UPDATE
    }
  }
}

const quad_lctx = new LogContext()

export function quadrilateFaces(mesh: Mesh, faces: Iterable<Face>, quadflag = TriQuadFlags.DEFAULT, lctx?: LogContext) {
  faces = ReusableIter.getSafeIter(faces)

  const flag = MeshFlags.TEMP3

  for (const f of faces) {
    f.flag &= ~flag

    if (!f.isQuad() && !f.isTri()) {
      f.flag |= flag
    }
  }

  let oldnew

  if (lctx) {
    oldnew = lctx.onnew
  } else {
    lctx = quad_lctx.reset()
  }

  let newfaces: Set<Face> | undefined

  lctx.onnew = function onnew(e) {
    if (e.type === MeshTypes.FACE) {
      if (!newfaces) {
        newfaces = new Set()
      }

      newfaces.add(e as Face)
    }
  }

  for (const f of faces) {
    if (f.eid < 0) {
      continue
    }

    applyTriangulation(mesh, f, undefined, undefined, lctx)
  }

  lctx.onnew = oldnew

  if (newfaces) {
    for (const f of faces) {
      if (f.eid >= 0) {
        newfaces.add(f)
      }
    }

    for (const f of newfaces) {
      if (f.eid < 0) {
        console.error('Eek!')
        newfaces.delete(f)
      }
    }
  } else {
    newfaces = new Set()

    for (const f of faces) {
      if (f.eid >= 0) {
        newfaces.add(f)
      }
    }
  }

  trianglesToQuads(mesh, newfaces, quadflag, lctx)
}

export function dissolveEdgeLoops(mesh: Mesh, edges: Iterable<Edge>, quadrilate = false, lctx?: LogContext): void {
  const vs = new Set<Vertex>()
  let fs

  if (quadrilate) {
    fs = new Set()

    for (const e of edges) {
      for (const l of e.loops) {
        fs.add(l.f)
        l.v.flag |= MeshFlags.UPDATE
        l.e.flag |= MeshFlags.UPDATE
        l.f.flag |= MeshFlags.UPDATE
      }
    }
  }

  edges = ReusableIter.getSafeIter(edges)

  const flag1 = MeshFlags.TEMP2

  /*
  for (let e of edges) {
    for (let i=0; i<2; i++) {
      let v = i ? e.v2 : e.v1;

      for (let e2 of v.edges) {
        e2.flag &= ~flag1;
      }
    }
  }

  for (let e of edges) {
    e.flag |= flag1;
  }*/

  for (const e of edges) {
    vs.add(e.v1)
    vs.add(e.v2)
  }

  for (const e of edges) {
    mesh.dissolveEdge(e, lctx)
  }

  for (const v of vs) {
    if (v.valence === 2) {
      mesh.joinTwoEdges(v, lctx)
    } else if (v.valence === 0) {
      mesh.killVertex(v, undefined, lctx)
    }
  }

  if (quadrilate) {
    fs = fs?.filter((f) => f.eid >= 0)
    quadrilateFaces(mesh, fs, undefined, lctx)
  }
}

export function getEdgeLoop(e: Edge) {
  let startl = e.l

  if (!startl) {
    return getArrayTemp(0)
  }

  if (startl.v.edges.length !== 4) {
    startl = startl.radial_next
  }

  const list = []

  let l = startl
  let _i = 0
  do {
    //break;
    if (_i++ > 1000000) {
      console.warn('Infinite loop detected')
      break
    }

    if (l.v.edges.length !== 4) {
      break
    }

    list.push(l.e)

    if (l.next.v.edges.length !== 4) {
      break
    }

    l = l.next

    if (l.radial_next.v === l.v) {
      l = l.radial_next
    } else {
      l = l.radial_next.next
    }
  } while (l !== e.l)

  list.reverse()

  //now go backwards
  l = startl
  do {
    if (_i++ > 1000000) {
      console.warn('Infinite loop detected')
      break
    }

    if (l !== startl) {
      list.push(l.e)
    }

    if (l.v.edges.length !== 4) {
      break
    }
    l = l.prev

    if (l.radial_next.v === l.v) {
      l = l.radial_next.next
    } else {
      l = l.radial_next.prev
    }
  } while (l !== e.l)

  const flag = MeshFlags.TEMP1

  for (const e of list) {
    e.flag &= ~flag
  }
  let ei = 0
  for (const e of list) {
    if (!(e.flag & flag)) {
      list[ei++] = e
    }
  }

  if (ei !== list.length) {
    list.length = ei
  }

  if (list.length === 0) {
    list.push(e)
  }

  return list
}

export function dissolveFaces(mesh: Mesh, facesIter: Iterable<Face>, lctx?: LogContext): void {
  //faces = ReusableIter.getSafeIter(faces);
  const faces = facesIter instanceof Set ? facesIter : new Set(facesIter)

  const flag = MeshFlags.TEMP1
  const flag2 = MeshFlags.TEMP2

  for (const f of faces) {
    f.flag &= ~flag

    if (f.lists.length > 1) {
      f.flag |= flag
    }
  }

  const stack = [] as Face[]
  for (const f of faces) {
    if (f.flag & flag) {
      continue
    }

    stack.length = 0
    stack.push(f)

    f.flag |= flag

    const region = [] as Face[]

    while (stack.length > 0) {
      const f2 = stack.pop()!

      region.push(f2)

      for (const l of f2.loops) {
        let bad = l.radial_next === l || l !== l.radial_next.radial_next
        bad = bad || !!(l.radial_next.f.flag & flag)
        bad = bad || !faces.has(l.radial_next.f)

        if (bad) {
          continue
        }

        const f3 = l.radial_next.f
        f3.flag |= flag

        stack.push(f3)
      }
    }

    for (const f of region) {
      for (const l of f.loops) {
        for (const e of l.v.edges) {
          e.flag &= ~flag
          e.flag |= flag2
        }
      }
    }

    let startv: Vertex | undefined, startl: Loop | undefined
    let totbound = 0
    const ls = new Set<Loop>()

    for (const f of region) {
      for (const l of f.loops) {
        l.v.flag &= ~flag

        let ok = l.radial_next === l
        ok = ok || !faces.has(l.radial_next.f)

        if (ok) {
          ls.add(l)

          l.e.flag |= flag
          l.e.flag &= ~flag2

          totbound++

          if (!startv) {
            startv = l.v
            startl = l
          }
        }
      }
    }

    if (!totbound) {
      throw new MeshError('Dissolve face error')
    }

    const loops: Array<[Vertex[], Loop[]]> = []

    for (const l1 of ls) {
      if (!(l1.e.flag & flag)) {
        continue
      }

      let _i = 0
      let v = l1.v
      let l = l1

      const loop: Loop[] = []
      const verts: Vertex[] = []

      loops.push([verts, loop])

      v.flag |= flag

      do {
        verts.push(v)
        let l2 = l

        if (l2.next.v === v) {
          l2 = l2.next
        } else if (l2.prev.v === v) {
          l2 = l2.prev
        }
        loop.push(l2)

        v = l.e.otherVertex(v)
        l.e.flag &= ~flag

        let ok = false
        let count = 0

        for (const e of v.edges) {
          if (e.flag & flag) {
            count++

            for (const l2 of e.loops) {
              if (faces.has(l2.f)) {
                l = l2
                ok = true
                break
              }
            }
          }
        }

        if (count > 1) {
          throw new MeshError('could not dissolve face')
        }

        if (!ok) {
          break
        }

        if (_i++ > MAX_FACE_VERTS) {
          console.log('Infinite loop error')
          break
        }
      } while (v !== startv)
    }

    let outer: number | undefined, maxlen: number | undefined
    let i = 0

    for (const [vs, ls] of loops) {
      let dis = 0.0
      for (let i = 0; i < vs.length; i++) {
        dis += vs[i].co.vectorDistanceSqr(vs[(i + 1) % vs.length].co)
      }

      if (maxlen === undefined || dis > maxlen) {
        outer = i
        maxlen = dis
      }
    }

    if (outer === undefined) {
      throw new MeshError('could not dissolve face')
    }

    //move outer boundary to first
    const t = loops[0]
    loops[0] = loops[outer]
    loops[outer] = t

    console.log('Loops:', loops)

    const outerLoop = loops[outer]

    const f2 = mesh.makeFace(outerLoop[0], undefined, undefined, lctx)
    mesh.copyElemData(f2, f)
    f2.flag |= MeshFlags.UPDATE

    let totbad = 0
    i = 0

    for (const l of f2.loops) {
      l.v.flag |= MeshFlags.UPDATE

      const l0 = outerLoop[1][i]
      mesh.copyElemData(l, l0)

      let l2 = l.radial_next
      if (faces.has(l2.f)) {
        l2 = l2.radial_next
      }

      if (l2 === l) {
        i++
        continue
      }

      totbad += l2.v === l.v ? 1 : -1
      i++
    }

    if (totbad > 0) {
      mesh.reverseWinding(f2, lctx)
    }

    f2.calcNormal()

    for (let i = 1; i < loops.length; i++) {
      //hole loops should go in opposite direction from boundary

      const n = math.normal_poly(loops[i][0].map((v) => v.co))

      console.log(n.dot(f2.no), n, f2.no)

      if (n.dot(f2.no) > 0) {
        loops[i][0].reverse()
      }

      const list = mesh.makeHole(f2, loops[i][0], undefined, lctx)

      let li = 0
      const ls = loops[i][1]
      for (const l of list) {
        const l2 = ls[li]

        mesh.copyElemData(l, l2)
        li++
      }
    }

    console.log('F2', f2)
    f2.calcNormal()
  }

  const vs = new Set<Vertex>()
  const es = new Set<Edge>()

  for (const f of faces) {
    for (const l of f.loops) {
      vs.add(l.v)
      es.add(l.e)
    }
  }

  for (const f of faces) {
    mesh.killFace(f, lctx)
  }

  for (const e of es) {
    if (e.flag & flag2) {
      mesh.killEdge(e, lctx)
    }
  }

  for (const v of vs) {
    if (v.valence === 0) {
      mesh.killVertex(v, undefined, lctx)
    }
  }
}

export function delauney3D(mesh: Mesh, vs: Iterable<Vertex> = mesh.verts, lctx?: LogContext) {
  const bvh = mesh.getBVH({
    autoUpdate: true,
    wireVerts : true,
    deformMode: false,
    leafLimit : 32,
    force     : false,
    useGrids  : false,
  })

  let i = 0

  for (const v of mesh.verts) {
    const nearestVs = bvh.nearestVertsN(v.co, 7) as Set<Vertex>
    for (const v2 of nearestVs) {
      if (v2 === v) {
        continue
      }

      mesh.ensureEdge(v, v2, lctx)
    }
    i++
    if (i > 515) {
      break
    }
  }
}
