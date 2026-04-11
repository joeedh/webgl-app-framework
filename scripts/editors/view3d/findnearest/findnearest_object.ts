import {CastModes, FindnearestClass} from '../findnearest.js'
import {SelMask} from '../selectmode.js'
import {Vector2, Vector3, Vector4} from '../../../util/vectormath.js'
import {Shaders} from '../../../shaders/shaders.js'
import {FindNearestRet} from '../findnearest.js'
import {Mesh} from '../../../mesh/mesh.js'
import type {View3D} from '../view3d.js'
import type {ViewContext} from '../../../core/context.js'
import type {SceneObject} from '../../../sceneobject/sceneobject.js'
import type {IUniformsBlock} from '../../../webgl/webgl.js'
import type {IVectorOrHigher} from '../../../path.ux/scripts/pathux.js'

export class FindnearestObject extends FindnearestClass {
  static define() {
    return {
      selectMask: SelMask.OBJECT,
    }
  }

  /*
   * called for all objects;  returns true
   * if an object is valid for this class (and was drawn)
   *
   * When drawing pass the object id to red and any subdata
   * to green.
   * */
  static drawIDs(
    view3d: View3D,
    gl: WebGL2RenderingContext,
    uniforms: IUniformsBlock,
    object: SceneObject,
    mesh: Mesh
  ) {
    const program = Shaders.MeshIDShader

    uniforms.objectMatrix = object.outputs.matrix.getValue()
    uniforms.object_id = object.lib_id

    // threeCamera no longer exists on View3D — legacy code
    object.drawIds(view3d, gl, view3d.ctx.selectMask, uniforms)
  }

  static castViewRay_framebuffer(
    ctx: ViewContext,
    selectMask: number,
    p: IVectorOrHigher<2>,
    view3d: View3D,
    mode = CastModes.FRAMEBUFFER
  ): FindNearestRet[] | undefined {
    const gl = view3d.gl
    const sbuf = view3d.selectbuf
    const x = ~~p[0]
    const y = ~~p[1]
    const ret = new FindNearestRet()
    let size = view3d.glSize

    const dpi = (view3d.gl.canvas as HTMLCanvasElement & {dpi: number}).dpi
    size = new Vector2(size)
    size.mulScalar(1.0 / dpi)

    const camera = view3d.camera
    const far = camera.far
    const near = camera.near

    const co = new Vector4()

    const sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, 1, 1, true)
    if (sample === undefined) {
      return
    }

    const ob_id = ~~(sample.data[0] + 0.5) - 1
    let depth = sample.depthData![0]

    const range = gl.getParameter(gl.DEPTH_RANGE)
    depth = (depth - range[0]) / (range[1] - range[0])

    if (ob_id < 0 || depth === 1.0 || depth === 0.0) return undefined

    const ob = ctx.datalib.get(ob_id) as SceneObject

    /*
    comment: linear z
    f1 := (z - near) / (far - near);
    solve(f1 - depth, z);

    comment: inverse z;

    f1 := (1/z - 1/near) / (1/far - 1/near);
    solve(f1 - depth, z);
    */

    co[0] = (2.0 * x) / size[0] - 1.0
    co[1] = -((2.0 * y) / size[1] - 1.0)
    co[2] = depth * 2.0 - 1.0
    co[3] = 1.0

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

  static findnearest(
    ctx: ViewContext,
    selmask: number,
    mpos: IVectorOrHigher<2>,
    view3d: View3D,
    limit = 25
  ): FindNearestRet[] | undefined {
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

    const sample = sbuf.sampleBlock(ctx, view3d.gl, view3d, x, y, limit, limit)
    if (sample === undefined) {
      return
    }

    const block = sample.data
    const order = sample.order

    for (let i of order) {
      const x2 = i % limit
      const y2 = ~~(i / limit)
      i *= 4

      const ob_id = ~~(block[i] + 0.5) - 1
      const idx = ~~(block[i + 1] + 0.5) - 1

      if (ob_id < 0) continue

      const ob = ctx.datalib.get(ob_id) as SceneObject | undefined

      if (ob?.data === undefined) {
        continue
      }

      const ret = new FindNearestRet()

      ret.data = idx >= 0 ? idx : ob
      ret.object = ob
      ret.p3d = new Vector3()
      ret.p3d.multVecMatrix(ob.outputs.matrix.getValue())
      ret.dis = Math.sqrt(x2 * x2 + y2 * y2)

      const p = new Vector3(ret.p3d)
      view3d.project(p)

      ret.p2d.load(p)
      return [ret]
    }
  }
}

FindnearestClass.register(FindnearestObject)
