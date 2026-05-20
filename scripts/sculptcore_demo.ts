import {getWasm, getWasmImmediate, type IWasmInterface} from '@sculptcore/api/api'
import type {DrawBatch, Mesh, SpatialTree} from '@sculptcore/api/index'
import {IUniformsBlock, WebGLBatchExecutor} from './webgl/index'
import {Shaders} from './shaders/shaders'
import {Matrix4} from './path.ux/pathux'
import {StructType} from '@litestl/typescript-runtime'
import {MeshBatchManager} from '@sculptcore/api'

export interface SculptcoreDemo {
  wasm: IWasmInterface
  mesh: Mesh
  tree: SpatialTree
  batch: DrawBatch
  executor: WebGLBatchExecutor
  meshBatch: DrawBatch
  meshExecutor: WebGLBatchExecutor
}

let demo: SculptcoreDemo | undefined
let demoPromise: Promise<SculptcoreDemo> | undefined

// avoid the use of async here for debuggability
export function initSculptcoreDemo(
  gl: WebGL2RenderingContext,
  opts: {
    dimen?: number // number of quads on each face
    size?: number
    sphereFac?: number
    leafLimit?: number
    depthLimit?: number
  } = {}
): SculptcoreDemo {
  if (demo !== undefined) {
    return demo
  }

  const dimen = opts.dimen ?? 128
  const size = opts.size ?? 2.0
  const sphereFac = opts.sphereFac ?? 1.0
  const leafLimit = opts.leafLimit ?? 512
  const depthLimit = opts.depthLimit ?? 10

  const wasm = getWasmImmediate()!
  const mesh = wasm.Mesh_createCube(dimen, size, sphereFac)
  mesh.recalc_normals()
  const tree = wasm.Mesh_buildSpatialTree(mesh, leafLimit, depthLimit)
  const batch = tree.buildLeafBoundsBatch(wasm.gpu)
  const executor = new WebGLBatchExecutor(gl, wasm, Shaders.BasicLineShader2)

  const st = wasm.manager.get('sculptcore::mesh::gpu::MeshBatchManager') as StructType
  const ctor = st.findConstructor('main')!

  const meshBatchManager = wasm.manager.constructWith(ctor, mesh) as MeshBatchManager
  const meshBatch = meshBatchManager.createMeshBatch(wasm.gpu)!

  const meshExecutor = new WebGLBatchExecutor(gl, wasm, Shaders.BasicLitMesh2)
  console.log('meshBatch', meshBatch, meshExecutor)

  demo = {wasm, mesh, tree, batch, executor, meshBatch, meshExecutor}
  return demo
}

export function drawSculptcoreDemo(
  gl: WebGL2RenderingContext,
  drawMatrix: Matrix4,
  aspect: number,
  near: number,
  far: number,
  size: ArrayLike<number>
) {
  if (demo === undefined) {
    return
  }
  const normalMatrix = drawMatrix.copy().makeRotationOnly()

  const uniforms: IUniformsBlock = {
    drawMatrix,
    normalMatrix,
    uColor: [1, 1, 1, 1],
  }
  //gl.depthMask(false)
  //gl.disable(gl.DEPTH_TEST)
  //gl.enable(gl.CULL_FACE)
  demo!.executor.dispatch(demo!.batch, uniforms)
  demo!.meshExecutor.dispatch(demo!.meshBatch, uniforms)
  //gl.depthMask(true)
  //gl.enable(gl.DEPTH_TEST)
}

export function getSculptcoreDemo(): SculptcoreDemo | undefined {
  return demo
}

const g = globalThis as unknown as {
  initSculptcoreDemo: typeof initSculptcoreDemo
  drawSculptcoreDemo: typeof drawSculptcoreDemo
  getSculptcoreDemo: typeof getSculptcoreDemo
}
g.initSculptcoreDemo = initSculptcoreDemo
g.drawSculptcoreDemo = drawSculptcoreDemo
g.getSculptcoreDemo = getSculptcoreDemo

g.reinitSculptcoreDemo = (leafLimit?: number, depthLimit?: number) => {
  demo = undefined
  demoPromise = undefined
  initSculptcoreDemo(_gl, {leafLimit, depthLimit})

  window.redraw_viewport()
}
