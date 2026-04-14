import {CastModes, FindnearestClass, FindNearestRet} from '../findnearest.js'
import {SelMask} from '../selectmode.js'
import {Vector2, Vector3, Vector4, Matrix4, Quat, IVectorOrHigher} from '../../../util/vectormath.js'
import {Shaders} from '../../../shaders/shaders.js'
import * as util from '../../../util/util.js'
import {MeshTypes} from '../../../mesh/mesh_base.js'
import {Mesh, Vertex, Edge, Face, Element} from '../../../mesh/mesh.js'
import * as math from '../../../util/math.js'
import type {View3D} from '../view3d.js'
import type {ViewContext} from '../../../core/context.js'
import type {SceneObject} from '../../../sceneobject/sceneobject.js'
import type {IUniformsBlock} from '../../../webgl/webgl.js'

const _findnearest_rets = util.cachering.fromConstructor(FindNearestRet, 1024)
const _castray_rets = util.cachering.fromConstructor(FindNearestRet, 1024)

const _cache: {[key: number]: number[]} = {}

export class FindnearestMesh extends FindnearestClass {
  static define() {
    return {
      selectMask: SelMask.GEOM,
    }
  }

  static drawsObjectExclusively(view3d: View3D, object: SceneObject) {
    return false
  }

  /*
   * called for all objects;  returns true
   * if an object is valid for this class (and was drawn)
   *
   * When drawing pass the object id to red and any subdata
   * to green.
   * */
  //XXX is this method used anymore?
  static drawIDs(
    view3d: View3D,
    gl: WebGL2RenderingContext,
    uniforms: IUniformsBlock,
    object: SceneObject,
    mesh: Mesh
  ) {
    const program = Shaders.MeshIDShader

    if (object !== undefined) {
      uniforms.objectMatrix = object.outputs.matrix.getValue()
      uniforms.object_id = object.lib_id
    }

    ///view3d.ctx.selectMask
    //object.drawIds(view3d, gl, view3d.ctx.selectMask, uniforms);

    return true
  }

  static castViewRay_framebuffer(
    ctx: ViewContext,
    selectMask: number,
    p: IVectorOrHigher<3>,
    view3d: View3D,
    mode = CastModes.FRAMEBUFFER
  ) {
    const gl = view3d.gl
    const sbuf = view3d.selectbuf
    const x = ~~p[0]
    const y = ~~p[1]
    const ret = new FindNearestRet() //ref leak? _castray_rets.next().reset();
    let size = view3d.glSize

    const dpi = (view3d.gl.canvas as HTMLCanvasElement & {dpi: number}).dpi
    size = new Vector2(size)
    size.mulScalar(1.0 / dpi)

    const camera = view3d.camera
    const far = camera.far
    const near = camera.near

    const co = new Vector4()

    //this might already be in local mouse space
    //x -= view3d.glPos[0];
    //y -= view3d.glPos[1];

    const sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, 1, 1, true, selectMask)
    if (sample === undefined) {
      return
    }

    const obId = ~~(sample.data[0] + 0.5) - 1
    let depth = sample.depthData![0]

    const range = gl.getParameter(gl.DEPTH_RANGE)
    depth = (depth - range[0]) / (range[1] - range[0])

    if (obId < 0 || depth === 1.0 || depth === 0.0) return undefined

    const ob = ctx.datalib.get(obId)

    co[0] = (2.0 * x) / size[0] - 1.0
    co[1] = -((2.0 * y) / size[1] - 1.0)
    co[2] = depth * 2.0 - 1.0
    co[3] = 1.0

    //console.log(" ", co);
    co.multVecMatrix(view3d.camera.irendermat)

    if (co[3] !== 0.0 && view3d.camera.rendermat.isPersp) {
      co.mulScalar(1.0 / co[3])
    }

    depth = co[2]
    co[2] = depth

    ret.object = ob
    ret.p2d.load(p)
    ret.p3d.load(co)
    ret.dis = depth

    return [ret]
  }

  static castViewRay(
    ctx: ViewContext,
    selectMask: number,
    p: IVectorOrHigher<3>,
    view3d: View3D,
    mode = CastModes.FRAMEBUFFER
  ) {
    if (mode === CastModes.FRAMEBUFFER) {
      return this.castViewRay_framebuffer(ctx, selectMask, p, view3d, mode)
    }
  }

  static getSearchOrder(n: number) {
    if (n in _cache) {
      return _cache[n]
    }

    const ret: number[] = (_cache[n] = [])

    for (let i = 0; i < n * n; i++) {
      ret.push(i)
    }

    ret.sort((a, b) => {
      let x1 = a % n
      let y1 = ~~(a / n)
      let x2 = b % n
      let y2 = ~~(b / n)

      x1 -= n * 0.5
      y1 -= n * 0.5
      x2 -= n * 0.5
      y2 -= n * 0.5

      const w1 = /*Math.atan2(y1, x1) */ x1 * x1 + y1 * y1
      const w2 = /*Math.atan2(y2, x2) */ x2 * x2 + y2 * y2

      return w1 - w2
    })

    return ret
  }

  static castScreenCircle(ctx: ViewContext, selmask: number, mpos: IVectorOrHigher<2>, radius: number, view3d: View3D) {
    let x = mpos[0]
    let y = mpos[1]

    x = ~~x
    y = ~~y

    let objects
    if (selmask & SelMask.GEOM) {
      objects = new Set(ctx.selectedObjects).filter((ob) => ob.data instanceof Mesh)
    } else {
      objects = new Set(ctx.scene.objects.editable).filter((ob) => ob.data instanceof Mesh)
      selmask |= SelMask.FACE
    }

    const distOut = [0]
    const report = Math.random() > 0.998
    const origin3 = new Vector3()
    const origin = new Vector4()
    const tmp1 = new Vector3()
    const tmp2 = new Vector3()
    const tmp3 = new Vector3()

    let selmask2 = selmask
    let foundmask = 0

    const ret_elems: Element[] = []
    const ret_objects: SceneObject[] = []
    const ret_dists: number[] = []
    const visit = new WeakSet()

    function elemDist(mat: Matrix4, ob: SceneObject, elem: Element) {
      foundmask |= elem.type

      if (!(elem.type & selmask2) || visit.has(elem)) {
        return Number.MAX_SAFE_INTEGER
      }

      if (elem.type === MeshTypes.VERTEX) {
        tmp1.load(elem.co).multVecMatrix(mat)
        view3d.project(tmp1)

        tmp2.load(mpos as IVectorOrHigher<3>)
        tmp2[2] = 0.0
        tmp1[2] = 0.0

        return tmp1.vectorDistance(tmp2)
      } else if (elem.type === MeshTypes.EDGE) {
        const e = elem

        tmp1.load(e.v1.co).multVecMatrix(mat)
        tmp2.load(e.v2.co).multVecMatrix(mat)

        view3d.project(tmp1)
        view3d.project(tmp2)

        tmp3.load(mpos as IVectorOrHigher<3>)
        tmp3[2] = 0.0

        return math.dist_to_line_2d(tmp3, tmp1, tmp2, true)
      } else if (elem.type === MeshTypes.FACE) {
        const f = elem
        tmp1.load(f.cent).multVecMatrix(mat)
        view3d.project(tmp1)

        tmp2.load(mpos as IVectorOrHigher<3>)
        tmp2[2] = 0.0
        tmp1[2] = 0.0

        return tmp1.vectorDistance(tmp2)
      }
      return Number.MAX_SAFE_INTEGER
    }
    function tubeTest(mat: Matrix4, ob: SceneObject, elem: Element, disOut: number[]) {
      if (!(elem.type & selmask2) || visit.has(elem)) {
        return false
      }
      const dist = elemDist(mat, ob, elem)
      disOut[0] = dist
      return dist < radius
    }

    function push(ob: SceneObject, elem: Element, dist: number) {
      if (visit.has(elem)) {
        return
      }
      visit.add(elem)
      ret_elems.push(elem)
      ret_objects.push(ob)
      ret_dists.push(dist)
    }

    selmask2 = selmask
    foundmask = 0

    const x2 = x
    const y2 = y
    for (const ob of objects) {
      const me = ob.data
      const bvh = me.getLastBVH(true, false, false, true)

      const obmatrix = ob.outputs.matrix.getValue()
      const imat = new Matrix4(obmatrix)
      imat.multiply(view3d.activeCamera.rendermat)
      imat.invert()

      //set up cone tracing fallback
      const p1 = new Vector4()
      const p2 = new Vector4()

      const d = 0.9999
      const znear = -1.0 * d // -(view3d.activeCamera.near * 1.001)
      const zfar = 1.0 * d //-(view3d.activeCamera.far * 0.999)

      p1[0] = x2
      p1[1] = y2
      p1[2] = znear
      p1[3] = 1.0
      view3d.unproject(p1, imat)
      p1[3] = 0.0

      origin.load3(p1)
      origin[3] = 1.0

      p2[0] = x2 + 1.0
      p2[1] = y2 + 1.0
      p2[2] = znear
      p2[3] = 1.0
      view3d.unproject(p2, imat)
      p2[3] = 0.0

      const radius1 = (p2.vectorDistance(p1) * radius) / Math.sqrt(2) // (radius * p1[3]) / size[1] //p2.vectorDistance(p1)
      p1[0] = x2
      p1[1] = y2
      p1[2] = zfar
      p1[3] = 1.0
      view3d.unproject(p1, imat)
      p1[3] = 0.0

      const dest = new Vector3(p1)
      const ray2 = new Vector3().load(dest).sub(origin)

      p2[0] = x2 + 1.0
      p2[1] = y2 + 1.0
      p2[2] = zfar
      p2[3] = 1.0
      view3d.unproject(p2, imat)
      p2[3] = 0.0

      const radius2 = (p2.vectorDistance(p1) * radius) / Math.sqrt(2) //(radius * p1[3]) / size[1]
      //view3d.makeDrawCone(origin, dest, radius1, radius2, [1, 0, 1, 1], 8)

      origin3.load(origin)

      const fs = bvh.facesInCone(origin3, ray2, radius1, radius2, true, false)
      for (const f of fs) {
        // find other elements using faces
        if (selmask & SelMask.FACE) {
          push(ob, f, elemDist(obmatrix, ob, f))
        }
        const doVert = selmask & SelMask.VERTEX
        const doEdge = selmask & SelMask.EDGE
        if (doVert || doEdge) {
          for (const list of f.lists) {
            for (const l of list) {
              if (doVert && tubeTest(obmatrix, ob, l.v, distOut)) {
                push(ob, l.v, distOut[0])
              }
              if (doEdge && tubeTest(obmatrix, ob, l.e, distOut)) {
                push(ob, l.e, distOut[0])
              }
            }
          }
        }
      }

      if (selmask & SelMask.VERTEX) {
        const vs = bvh.vertsInCone(origin3, ray2, radius1, radius2, false)
        for (const v of vs) {
          let skip = false

          // find wires/vertices not part of faces
          for (const e of v.edges) {
            if (e.l) {
              skip = true
              break
            }
          }

          if (skip) {
            continue
          }

          if (selmask & SelMask.VERTEX) {
            push(ob, v, elemDist(obmatrix, ob, v))
          }

          if (selmask & SelMask.EDGE) {
            for (const e of v.edges) {
              if (tubeTest(obmatrix, ob, e, distOut)) {
                push(ob, e, distOut[0])
              }
            }
          }
        }
      }
    }

    return {
      elements      : ret_elems,
      elementObjects: ret_objects,
      elementDists  : ret_dists,
    }
  }

  static findnearest_pbvh(
    ctx: ViewContext,
    selmask: number,
    mpos: IVectorOrHigher<2>,
    view3d: View3D,
    limit = 25,
    depth = 0
  ): FindNearestRet[] {
    const results = new Map<number, FindNearestRet>()

    function getFindRet(type: number) {
      let ret = results.get(type)
      if (ret === undefined) {
        ret = new FindNearestRet()
        ret.dis = Number.MAX_SAFE_INTEGER
        results.set(type, ret)
      }
      return ret!
    }

    const ret = this.castScreenCircle(ctx, selmask, mpos, limit, view3d)
    const p1 = new Vector3()
    const p2 = new Vector3()

    for (let i = 0; i < ret.elements.length; i++) {
      const ob = ret.elementObjects[i]
      const elem = ret.elements[i]
      const dist = ret.elementDists[i]

      if (selmask & SelMask.OBJECT) {
        const f = getFindRet(SelMask.OBJECT)
        if (dist < f.dis!) {
          f.data = ob
          f._object = ob.lib_id
          f.p3d.zero().multVecMatrix(ob.outputs.matrix.getValue())
          f.p2d.load(f.p3d)
          view3d.project(f.p2d)
          f.dis = dist
        }
      }

      switch (elem.type) {
        case MeshTypes.VERTEX: {
          const ft = getFindRet(SelMask.VERTEX)
          if (dist < ft.dis!) {
            ft.data = elem
            ft._object = ob.lib_id
            ft._mesh = ob.data.lib_id
            ft.p3d.load(elem.co)
            ft.p2d.load(ft.p3d)
            view3d.project(ft.p2d)
            ft.dis = dist
          }
          break
        }
        case MeshTypes.EDGE: {
          const ft = getFindRet(SelMask.EDGE)
          if (dist < ft.dis!) {
            ft.data = elem
            ft._object = ob.lib_id
            ft._mesh = ob.data.lib_id
            p1.load(elem.v1.co)
            p2.load(elem.v2.co)
            p1.multVecMatrix(ob.outputs.matrix.getValue())
            p2.multVecMatrix(ob.outputs.matrix.getValue())
            ft.p3d.load(p1).interp(p2, 0.5)
            ft.p2d.load(ft.p3d)
            view3d.project(ft.p2d)
            ft.dis = dist
          }
          break
        }
        case MeshTypes.FACE: {
          const ft = getFindRet(SelMask.FACE)
          if (dist < ft.dis!) {
            ft._object = ob.lib_id
            ft._mesh = ob.data.lib_id
            ft.data = elem
            ft.p3d.load(elem.cent).multVecMatrix(ob.outputs.matrix.getValue())
            ft.p2d.load(ft.p3d)
            view3d.project(ft.p2d)
            ft.dis = dist
          }
          break
        }
      }
    }

    return Array.from(results.values())
  }

  static findnearest(ctx: ViewContext, selmask: number, mpos: IVectorOrHigher<2>, view3d: View3D, limit = 25) {
    return this.findnearest_pbvh(ctx, selmask, mpos, view3d, limit)

    let x = mpos[0]
    let y = mpos[1]
    const sbuf = view3d.selectbuf

    limit = Math.max(~~limit, 1)

    x = ~~x
    y = ~~y

    x -= limit >> 1
    y -= limit >> 1

    if (sbuf === undefined) {
      return undefined
    }

    const sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, limit, limit, false, selmask)

    if (sample === undefined) {
      return
    }

    const block = sample!.data
    const order = sample!.order

    for (let i of order) {
      const x2 = i % limit
      const y2 = ~~(i / limit)
      i *= 4

      const obId2 = ~~(block[i] + 0.25) - 1
      const idx = ~~(block[i + 1] + 0.25) - 1

      if (obId2 < 0 || idx <= 0) continue

      //console.log(ob, idx);

      const ob = ctx.datalib.get(obId2) as SceneObject | undefined
      let mesh: Mesh

      if (ob !== undefined) {
        if (!(ob!.data instanceof Mesh)) {
          continue
        }

        mesh = ob!.data as Mesh
      } else {
        //pull from ctx.mesh
        //HACKISH!
        mesh = ctx.mesh as Mesh
      }

      //if (Math.random() > 0.998) {
      //  console.log(idx, mesh.eidmap[idx-3], mesh.eidmap[idx-2], mesh.eidmap[idx-1], mesh.eidmap[idx], mesh.eidmap[idx+1], mesh.eidmap[idx+2], mesh.eidmap[idx+3]);
      //}

      const e = mesh.eidMap.get(idx)

      if (e === undefined) {
        //console.warn(`Corruption in findnearest_mesh implemented; e=${e}, ob=${ob}, idx=${idx}`, ob);
        continue
      }

      //console.log(e.type, selmask);
      if (!(e.type & selmask)) {
        continue
      }

      /*we now allow this, so meshtool.js derived classes work
      if (ob === undefined || ob.data === undefined) {
        //console.warn("warning, invalid object", id);
        continue;
      }*/

      const ret = new FindNearestRet() //ref leaf? _findnearest_rets.next().reset();

      ret.data = e
      ret.object = ob
      ret.p3d = new Vector3()

      if (e.type === MeshTypes.VERTEX || e.type === MeshTypes.HANDLE) {
        ret.p3d.load((e as Vertex).co)
      } else if (e.type === MeshTypes.EDGE) {
        ret.p3d.load((e as Edge).v1.co).interp((e as Edge).v2.co, 0.5)
      } else if (e.type === MeshTypes.FACE) {
        let tot = 0.0
        for (const v of (e as Face).verts) {
          ret.p3d.add(v.co)
        }

        tot++
        if (tot > 0) {
          ret.p3d.mulScalar(1.0 / tot)
        }
      }

      if (ob !== undefined) {
        ret.p3d.multVecMatrix(ob!.outputs.matrix.getValue())
      }

      ret.dis = Math.sqrt(x2 * x2 + y2 * y2)

      const p = new Vector3(ret.p3d)
      view3d.project(p)

      ret.mesh = mesh
      ret.p2d.load(p)
      return [ret]
    }
  }
}

FindnearestClass.register(FindnearestMesh)
