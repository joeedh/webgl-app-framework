import {getWasm, WebGLBatchExecutor, type IWasmInterface} from '@sculptcore/api/api'
import type {DrawBatch, Mesh, SpatialTree} from '@sculptcore/api/index'

export interface SculptcoreDemo {
  wasm: IWasmInterface
  mesh: Mesh
  tree: SpatialTree
  batch: DrawBatch
  executor: WebGLBatchExecutor
}

let demo: SculptcoreDemo | undefined
let demoPromise: Promise<SculptcoreDemo> | undefined

export async function initSculptcoreDemo(
  gl: WebGL2RenderingContext,
  opts: {dimen?: number; size?: number; sphereFac?: number; leafLimit?: number} = {}
): Promise<SculptcoreDemo> {
  if (demo !== undefined) {
    return demo
  } else if (demoPromise !== undefined) {
    return await demoPromise
  }

  demoPromise = (async () => {
    const dimen = opts.dimen ?? 8
    const size = opts.size ?? 1.0
    const sphereFac = opts.sphereFac ?? 0.0
    const leafLimit = opts.leafLimit ?? 64

    const wasm = await getWasm()
    const mesh = wasm.Mesh_createCube(dimen, size, sphereFac)
    const tree = wasm.Mesh_buildSpatialTree(mesh, leafLimit)
    const batch = tree.buildLeafBoundsBatch(wasm.gpu) as DrawBatch
    const executor = new WebGLBatchExecutor(gl, wasm)

    demo = {wasm, mesh, tree, batch, executor}
    return demo
  })()
  return await demoPromise
}

export function drawSculptcoreDemo(gl: WebGL2RenderingContext, drawMatrix: Float32Array, color?: Float32Array) {
  if (demo === undefined) {
    return
  }
  demo!.executor.dispatch(demo!.batch, drawMatrix, color)
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
