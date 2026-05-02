import {getWasm, getWasmImmediate, type IWasmInterface} from '@sculptcore/api/api'
import type {DrawBatch, Mesh, SpatialTree} from '@sculptcore/api/index'
import {IUniformsBlock, WebGLBatchExecutor} from './webgl'
import {Shaders} from './shaders/shaders'
import {Matrix4} from './path.ux/pathux'

export interface SculptcoreDemo {
  wasm: IWasmInterface
  mesh: Mesh
  tree: SpatialTree
  batch: DrawBatch
  executor: WebGLBatchExecutor
}

let demo: SculptcoreDemo | undefined
let demoPromise: Promise<SculptcoreDemo> | undefined

// avoid the use of async here for debuggability
export function initSculptcoreDemo(
  gl: WebGL2RenderingContext,
  opts: {dimen?: number; size?: number; sphereFac?: number; leafLimit?: number} = {}
): SculptcoreDemo {
  if (demo !== undefined) {
    return demo
  }

  const dimen = opts.dimen ?? 128
  const size = opts.size ?? 1.0
  const sphereFac = opts.sphereFac ?? 0.0
  const leafLimit = opts.leafLimit ?? 64

  const wasm = getWasmImmediate()!
  const mesh = wasm.Mesh_createCube(dimen, size, sphereFac)
  const tree = wasm.Mesh_buildSpatialTree(mesh, leafLimit)
  const batch = tree.buildLeafBoundsBatch(wasm.gpu) as DrawBatch
  const executor = new WebGLBatchExecutor(gl, wasm, Shaders.BasicLineShader2)

  demo = {wasm, mesh, tree, batch, executor}
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
  const uniforms: IUniformsBlock = {
    drawMatrix,
    uColor: [1, 1, 1, 1],
  }
  demo!.executor.dispatch(demo!.batch, uniforms)
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
