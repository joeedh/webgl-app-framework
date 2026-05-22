import {Matrix4, nstructjs, Vector3} from '../path.ux/pathux'
import {AttrSet} from './litemesh_attrSet'
import {AttrType} from './litemesh_base'
import {
  BoolAttribute,
  Float3Attribute,
  Int2Attribute,
  Int4Attribute,
  IntAttribute,
  ShortAttribute,
} from './litemesh_types'
import {SceneObjectData} from '../sceneobject/sceneobject_base'
import {BlockLoader, BlockLoaderAddUser, DataBlock} from '../core/lib_api'
import {SelMask} from '../editors/view3d/selectmode'
import {NodeFlags} from '../core/graph'
import {DrawBatch, float3, SpatialNode, SpatialTree, Mesh as WasmMesh} from '@sculptcore/api'
import {getWasmImmediate, IWasmInterface} from '@sculptcore/api/api'
import {IUniformsBlock, ShaderProgram, WebGLBatchExecutor} from '../webgl/index'
import type {View3D} from '../editors/all'
import {SceneObject} from '../sceneobject/index'
import {Shaders} from '../shaders/shaders'
import {GenericIsect} from '../util/spatial'
import type {SculptCorePaintMode} from '../editors/view3d/tools/sculptcore'
import type {DrawQueue, FrameContext} from '../render/queue'
import {isWebGPU} from '../core/renderer_flag'
import {getActiveWebGpuContext} from '../render/queue_factory'
import {WebGPUBatchExecutor} from '../webgpu/batch'
import {UniformBindings} from '../webgpu/uniform_bindings'
import type {Pipeline} from '../webgpu/pipeline'
import {wgslForSpatialShader} from './litemesh_wgsl'

export class VertexData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.VertexData {}')

  constructor() {
    super()
  }

  get positions() {
    return this.attrs.get('positions') as Float3Attribute
  }
  get normals() {
    return this.attrs.get('normals') as Float3Attribute
  }
  get select() {
    return this.attrs.get('select') as BoolAttribute
  }
}

export class EdgeData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.EdgeData {}')

  constructor() {
    super()
  }

  get vs() {
    return this.attrs.get('.edge.vs') as Int2Attribute
  }
  get disk() {
    return this.attrs.get('.edge.vs.disk') as Int4Attribute
  }
  get select() {
    return this.attrs.get('.edge.select') as BoolAttribute
  }
  get c() {
    return this.attrs.get('.edge.c') as IntAttribute
  }
}

export class CornerData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.CornerData {}')
  constructor() {
    super()
    this.ensureAttr(AttrType.Int, '.corner.v')
    this.ensureAttr(AttrType.Int, '.corner.e')
    this.ensureAttr(AttrType.Int, '.corner.l')
    this.ensureAttr(AttrType.Int, '.corner.next')
    this.ensureAttr(AttrType.Int, '.corner.prev')
    this.ensureAttr(AttrType.Int, '.corner.radial_next')
    this.ensureAttr(AttrType.Int, '.corner.radial_prev')
  }
  get v() {
    return this.attrs.get('.corner.v') as IntAttribute
  }
  get e() {
    return this.attrs.get('.corner.e') as IntAttribute
  }
  get l() {
    return this.attrs.get('.corner.l') as IntAttribute
  }
  get next() {
    return this.attrs.get('.corner.next') as IntAttribute
  }
  get prev() {
    return this.attrs.get('.corner.prev') as IntAttribute
  }
  get radial_next() {
    return this.attrs.get('.corner.radial_next') as IntAttribute
  }
  get radial_prev() {
    return this.attrs.get('.corner.radial_prev') as IntAttribute
  }
}

/** Face boundary/hole list. */
export class ListData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.ListData {}')
  constructor() {
    super()
    this.ensureAttr(AttrType.Int, '.list.c')
    this.ensureAttr(AttrType.Int, '.list.f')
    this.ensureAttr(AttrType.Int, '.list.next')
    this.ensureAttr(AttrType.Int, '.list.size')
  }
  get c() {
    return this.attrs.get('.list.c') as IntAttribute
  }
  get f() {
    return this.attrs.get('.list.f') as IntAttribute
  }
  get next() {
    return this.attrs.get('.list.next') as IntAttribute
  }
  get size() {
    return this.attrs.get('.list.size') as IntAttribute
  }
}

export class FaceData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.FaceData {}')
  constructor() {
    super()
    this.ensureAttr(AttrType.Short, '.face.list_count')
    this.ensureAttr(AttrType.Int, '.face.list')
    this.ensureAttr(AttrType.Float3, '.face.normal')
  }
  get list_count() {
    return this.attrs.get('.face.list_count') as ShortAttribute
  }
  get list() {
    return this.attrs.get('.face.list') as IntAttribute
  }
  get normal() {
    return this.attrs.get('.face.normal') as Float3Attribute
  }
}

export class LiteMesh extends SceneObjectData {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.LiteMesh {
    }
    `
  )

  static nodedef() {
    return {
      name   : 'litemesh',
      uiname : 'LiteMesh',
      flag   : NodeFlags.SAVE_PROXY,
      inputs : {...super.nodedef().inputs},
      outputs: {...super.nodedef().outputs},
    }
  }

  static blockDefine() {
    return {
      typeName   : 'litemesh',
      defaultName: 'LiteMesh',
      uiName     : 'LiteMesh',
      flag       : 0,
      icon       : -1,
    }
  }

  static dataDefine() {
    return {
      name      : 'LiteMesh',
      selectMask: SelMask.MESH,
      tools     : undefined,
      dataKind  : 'mesh',
    }
  }

  afterSTRUCT(): void {
    super.afterSTRUCT()
  }

  dataLink(getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser) {
    return super.dataLink(getblock, getblock_addUser)
  }

  loadSTRUCT(reader: nstructjs.StructReader<this>): void {
    super.loadSTRUCT(reader)
  }

  mesh: WasmMesh
  spatial: SpatialTree
  wasm: IWasmInterface
  drawBatch?: DrawBatch
  treeBatch?: DrawBatch
  drawBatchExecutor?: WebGLBatchExecutor
  drawBatchExecutorGPU?: WebGPUBatchExecutor
  private gpuUniforms?: IUniformsBlock

  constructor(wasmMesh?: WasmMesh) {
    super()

    // this code cannot run before wasm loads
    this.wasm = getWasmImmediate()!

    this.mesh = wasmMesh ?? getWasmImmediate()!.Mesh_createCube(120, 1.0, 1.0)
    this.spatial = this.wasm.Mesh_buildSpatialTree(this.mesh, 1024, 20)
    this.spatial.update(this.wasm.gpu)
    this.drawBatch = this.spatial.getDrawBatch()
    this.treeBatch = this.spatial.buildLeafBoundsBatch(this.wasm.gpu)
  }

  rayCast(origin: Vector3, dir: Vector3): GenericIsect | undefined {
    const isectOut = this.wasm.manager.construct('sculptcore::spatial::CastRayIsect')
    const originPtr = this.wasm._rawAlloc(3 * 4)
    const dirPtr = this.wasm._rawAlloc(3 * 4)

    const f32 = this.wasm.HEAPF32
    const fshift = this.wasm.F32SHIFT

    let idx = originPtr >> fshift
    f32[idx++] = origin[0]
    f32[idx++] = origin[1]
    f32[idx++] = origin[2]

    idx = dirPtr >> fshift
    f32[idx++] = dir[0]
    f32[idx++] = dir[1]
    f32[idx++] = dir[2]

    const result = this.spatial.castRay(originPtr as unknown as float3, dirPtr as unknown as float3, isectOut)

    let isect: GenericIsect | undefined
    if (result) {
      isect = new GenericIsect()
      for (let i = 0; i < 3; i++) {
        isect.p[i] = isectOut.p.vec[i]
        isect.normal[i] = isectOut.normal.vec[i]
      }
      isect.tri = isectOut.triIndex
      isect.dis = isectOut.t
      isect.uv[0] = isectOut.uv.vec[0]
      isect.uv[1] = isectOut.uv.vec[1]
      return isect
    }

    this.wasm._rawRelease(originPtr)
    this.wasm._rawRelease(dirPtr)
    isectOut[Symbol.dispose]()
    return isect
  }

  regenTreeBatch() {
    if (this.treeBatch) {
      this.wasm.gpu.destroyBatch(this.treeBatch, true, true)
      this.treeBatch = undefined
    }
    return this
  }

  drawQ(view3d: View3D, queue: DrawQueue, frame: FrameContext, object: SceneObject) {
    const drawBVH = (view3d.ctx?.scene?.toolmode as SculptCorePaintMode)?.drawBVH
    if (this.spatial.update(this.wasm.gpu)) {
      if (this.treeBatch) {
        this.wasm.gpu.destroyBatch(this.treeBatch, true, true)
        if (drawBVH) {
          this.treeBatch = this.spatial.buildLeafBoundsBatch(this.wasm.gpu)
        }
      }
    }
    this.drawBatch = this.spatial.getDrawBatch()

    if (drawBVH && !this.treeBatch) {
      this.treeBatch = this.spatial.buildLeafBoundsBatch(this.wasm.gpu)
    }

    const uniforms = frame.uniforms
    const drawMatrix = new Matrix4(uniforms.projectionMatrix)
    if (uniforms.objectMatrix instanceof Matrix4) {
      drawMatrix.multiply(uniforms.objectMatrix)
    }

    const normalMatrix = drawMatrix.copy().makeRotationOnly()

    const uniforms2 = {
      uColor: [1, 1, 1, 1],
      ...uniforms,
      drawMatrix,
      normalMatrix,
    }

    if (isWebGPU()) {
      this.drawQGPU(uniforms2, drawBVH)
      return
    }

    queue.scheduleRawGLPass((gl: WebGL2RenderingContext) => {
      let exec = this.drawBatchExecutor
      if (exec === undefined) {
        exec = new WebGLBatchExecutor(gl, this.wasm, Shaders.BasicLineShader2)
        this.drawBatchExecutor = exec
      }
      if (this.drawBatch) {
        exec.dispatch(this.drawBatch, uniforms2)
      }
      if (drawBVH && this.treeBatch) {
        exec.dispatch(this.treeBatch, uniforms2)
      }
    })
  }

  /**
   * WebGPU sibling of the `scheduleRawGLPass` body above. Runs against
   * the active `WebGpuRenderContext`'s currently-open render pass,
   * routing sculptcore `DrawBatch`es through `WebGPUBatchExecutor`.
   * `bindGroupForCommand` lazily reflects each pipeline's WGSL via
   * `UniformBindings` and returns the `@group(0)` bind group with
   * `drawMatrix`/`normalMatrix`/`uColor` already written.
   */
  private drawQGPU(uniforms: IUniformsBlock, drawBVH: boolean): void {
    const ctx = getActiveWebGpuContext()
    if (!ctx || !ctx.currentPass) return
    const pass = ctx.currentPass
    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat()

    // The bindGroupForCommand callback runs inside `exec.dispatch()` —
    // route the per-frame uniforms through an instance field so the
    // closure (built once on first dispatch) always reads the active
    // frame's values.
    this.gpuUniforms = uniforms

    let exec = this.drawBatchExecutorGPU
    if (exec === undefined) {
      const bindingsCache = new WeakMap<Pipeline, UniformBindings>()
      const self: LiteMesh = this
      exec = new WebGPUBatchExecutor({
        device             : ctx.device,
        wasm               : this.wasm,
        pipelineCache      : ctx.pipelineCache,
        wgslForShader      : wgslForSpatialShader,
        colorTargets: [
          {
            format: surfaceFormat,
            blend: {
              color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
              alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
            },
          },
        ],
        depthStencil: {
          format           : 'depth24plus',
          depthWriteEnabled: true,
          depthCompare     : 'less-equal',
        },
        bindGroupForCommand: (_cmd, pipeline) => {
          let bindings = bindingsCache.get(pipeline)
          if (!bindings) {
            bindings = new UniformBindings(ctx.device, pipeline.descriptor.wgsl, pipeline.descriptor.label)
            bindingsCache.set(pipeline, bindings)
          }
          bindings.write(self.gpuUniforms!)
          const bg = bindings.getBindGroup(pipeline.handle, 0)
          if (!bg) {
            throw new Error('litemesh: spatial pipeline declares no @group(0) uniform bindings')
          }
          return bg
        },
      })
      this.drawBatchExecutorGPU = exec
    }

    if (this.drawBatch) exec.dispatch(this.drawBatch, pass)
    if (drawBVH && this.treeBatch) exec.dispatch(this.treeBatch, pass)
  }

  regenRender() {
    //
  }
  regenTessellation() {
    //
  }
  regenElementsDraw() {}
}

DataBlock.register(LiteMesh)
SceneObjectData.register(LiteMesh)
