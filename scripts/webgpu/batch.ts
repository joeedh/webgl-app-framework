/**
 * `WebGPUBatchExecutor` — WebGPU sibling of
 * `WebGLBatchExecutor` (`scripts/webgl/batch.ts:82`). Phase 4d.
 *
 * Mirrors the WebGL executor's responsibilities: uploads wasm-owned
 * `Buffer`s into `GpuBuffer`s, caches a pipeline per shader, encodes
 * draw calls from a `DrawBatch` into a `GPURenderPassEncoder`.
 *
 * The major WebGPU shifts vs the WebGL path:
 *
 *   * No VAO — vertex buffers are bound per-draw on the pass.
 *   * No attribute lookup by name — the caller must hand us a
 *     `vertexLayout` matching the attribute order the WGSL source
 *     expects. Sculptcore's `ShaderDef.attrs` ordering is the source of
 *     truth for the matching `@location(n)` slots in WGSL.
 *   * Pipelines are immutable: every (shader, vertex layout, target
 *     format, blend, primitive) combination is its own
 *     `GPURenderPipeline`. The cache here keys on the sdef pointer +
 *     primitive topology since the rest is fixed per executor instance.
 *   * Uniforms aren't bound by name — the caller supplies a
 *     `bindGroupForCommand` callback that returns a ready
 *     `GPUBindGroup` for the active draw.
 *
 * The wasm-side `ShaderDef` still carries GLSL sources for the WebGL
 * path; the WGSL equivalent must be plumbed in via the
 * `wgslForShader(sdef)` lookup the caller provides. Phase 4d only sets
 * up the execution plumbing — wiring sculptcore's shaders through to
 * WGSL strings is a follow-on once `wgsl_shaders.ts` covers the
 * sculptcore basic-mesh/line variants.
 */

import {Buffer, DrawBatch, DrawCommand, ShaderDef} from '@sculptcore/api'
import {} from '@litestl/typescript-runtime'
import {GPUType} from '@sculptcore/api/sculptcore/gpu/GPUType'
import {GPUCmdType} from '@sculptcore/api/sculptcore/gpu/GPUCmdType'
import {IWasmInterface} from '@sculptcore/api/api'

import {GpuBuffer} from './buffer.js'
import {Pipeline, PipelineCache, type PipelineDescriptor} from './pipeline.js'

interface BoundLike {
  ptr: number
}

interface CachedGpuBuffer {
  buf: GpuBuffer
  uploadedSize: number
  uploadedDataPtr: number
}

function gpuTypeBytes(t: GPUType): number {
  switch (t) {
    case GPUType.FLOAT16:
    case GPUType.INT16:
    case GPUType.UINT16:
      return 2
    case GPUType.FLOAT32:
    case GPUType.INT32:
    case GPUType.UINT32:
      return 4
    case GPUType.FLOAT64:
      return 8
    case GPUType.INT8:
    case GPUType.UINT8:
      return 1
    default:
      return 4
  }
}

function gpuTypeWGSLFormat(t: GPUType, elemsize: number): GPUVertexFormat {
  switch (t) {
    case GPUType.FLOAT32:
      return (`float32x${Math.max(1, Math.min(elemsize, 4))}` as GPUVertexFormat)
    case GPUType.FLOAT16:
      return (elemsize >= 4 ? 'float16x4' : 'float16x2') as GPUVertexFormat
    case GPUType.UINT8:
      return (elemsize >= 4 ? 'unorm8x4' : 'unorm8x2') as GPUVertexFormat
    case GPUType.UINT16:
      return (elemsize >= 4 ? 'uint16x4' : 'uint16x2') as GPUVertexFormat
    case GPUType.UINT32:
      return (`uint32x${Math.max(1, Math.min(elemsize, 4))}` as GPUVertexFormat)
    case GPUType.INT32:
      return (`sint32x${Math.max(1, Math.min(elemsize, 4))}` as GPUVertexFormat)
    default:
      return 'float32x4'
  }
}

function cmdTypeToTopology(t: GPUCmdType): GPUPrimitiveTopology {
  switch (t) {
    case GPUCmdType.DRAW_TRIS:
      return 'triangle-list'
    case GPUCmdType.DRAW_TRI_STRIP:
      return 'triangle-strip'
    case GPUCmdType.DRAW_LINES:
      return 'line-list'
    case GPUCmdType.DRAW_POINTS:
      return 'point-list'
    default:
      return 'triangle-list'
  }
}

export interface WebGPUBatchExecutorOptions {
  device: GPUDevice
  wasm: IWasmInterface
  pipelineCache?: PipelineCache
  /** Returns the WGSL source for a given sculptcore `ShaderDef`. The
   *  executor caches the resulting pipeline keyed on `sdef.ptr` +
   *  topology. */
  wgslForShader: (sdef: ShaderDef) => string
  /** Per-draw bind group provider. Receives the active `DrawCommand`
   *  and pipeline; returns a `GPUBindGroup` matching `@group(0)` of the
   *  WGSL source. */
  bindGroupForCommand: (cmd: DrawCommand, pipeline: Pipeline) => GPUBindGroup
  /** Color target state for every pipeline this executor builds. */
  colorTargets: GPUColorTargetState[]
  depthStencil?: GPUDepthStencilState
}

export class WebGPUBatchExecutor {
  readonly device: GPUDevice
  readonly queue: GPUQueue
  readonly wasm: IWasmInterface
  readonly pipelineCache: PipelineCache
  private readonly bufferCache = new Map<number, CachedGpuBuffer>()
  /** sdef.ptr | topology → Pipeline. */
  private readonly pipelinesByShader = new Map<string, Pipeline>()
  private readonly opts: WebGPUBatchExecutorOptions

  constructor(opts: WebGPUBatchExecutorOptions) {
    this.device = opts.device
    this.queue = opts.device.queue
    this.wasm = opts.wasm
    this.pipelineCache = opts.pipelineCache ?? new PipelineCache(opts.device)
    this.opts = opts
  }

  private uploadBuffer(buf: Buffer): GpuBuffer {
    const ptr = (buf as unknown as BoundLike).ptr
    const dataPtr = buf.data
    const size = buf.size
    const elemsize = buf.elemsize
    const bytes = size * elemsize * gpuTypeBytes(buf.type)

    let cached = this.bufferCache.get(ptr)
    if (!cached || cached.uploadedSize !== bytes) {
      cached?.buf.destroy()
      cached = {
        buf: new GpuBuffer(this.device, {
          label: 'WebGPUBatch.vbo',
          size : Math.max(bytes, 4),
          usage: 'vertex',
        }),
        uploadedSize   : bytes,
        uploadedDataPtr: -1,
      }
      this.bufferCache.set(ptr, cached)
    }

    if (cached.uploadedDataPtr !== dataPtr || buf.update_buffer) {
      const view = new Uint8Array(this.wasm.HEAPU8.buffer as ArrayBuffer, dataPtr, bytes)
      cached.buf.write(view)
      cached.uploadedDataPtr = dataPtr
      buf.update_buffer = false
    }

    return cached.buf
  }

  releaseBuffer(buf: Buffer): void {
    const ptr = (buf as unknown as BoundLike).ptr
    const cached = this.bufferCache.get(ptr)
    if (cached) {
      cached.buf.destroy()
      this.bufferCache.delete(ptr)
    }
  }

  private getPipeline(sdef: ShaderDef, cmd: DrawCommand): Pipeline {
    const sdefPtr = (sdef as unknown as BoundLike).ptr
    const topology = cmdTypeToTopology(cmd.type)
    const cacheKey = `${sdefPtr}|${topology}`

    let pipeline = this.pipelinesByShader.get(cacheKey)
    if (pipeline) return pipeline

    const attrs = Array.from(sdef.attrs)
    const vertexBuffers: GPUVertexBufferLayout[] = attrs.map((a, slot) => {
      const elemsize = (a as unknown as {elemSize: number}).elemSize
      const stride = elemsize * gpuTypeBytes(a.type)
      return {
        arrayStride: stride,
        attributes: [{
          shaderLocation: slot,
          offset        : 0,
          format        : gpuTypeWGSLFormat(a.type, elemsize),
        }],
      }
    })

    const desc: PipelineDescriptor = {
      label        : `WebGPUBatch.pipeline[${sdefPtr}]`,
      wgsl         : this.opts.wgslForShader(sdef),
      vertexBuffers,
      colorTargets : this.opts.colorTargets,
      depthStencil : this.opts.depthStencil,
      primitive    : {topology, cullMode: 'none'},
    }

    pipeline = this.pipelineCache.get(desc)
    this.pipelinesByShader.set(cacheKey, pipeline)
    return pipeline
  }

  /**
   * Encode `batch` into `pass`. The pass must already be open and the
   * viewport set by the caller.
   */
  dispatch(batch: DrawBatch, pass: GPURenderPassEncoder): void {
    const commands = batch.commands
    if (commands.length === 0) return

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]
      if (!cmd.shader) continue

      const pipeline = this.getPipeline(cmd.shader, cmd)
      pass.setPipeline(pipeline.handle)
      pass.setBindGroup(0, this.opts.bindGroupForCommand(cmd, pipeline))

      const sdefAttrs = Array.from(cmd.shader.attrs)
      for (let slot = 0; slot < sdefAttrs.length; slot++) {
        const expected = sdefAttrs[slot].name
        const found = cmd.attrs.find((a) => a.name === expected)
        if (!found) continue
        const gpuBuf = this.uploadBuffer(found)
        pass.setVertexBuffer(slot, gpuBuf.handle)
      }

      const count = cmd.end - cmd.start
      pass.draw(count, 1, cmd.start, 0)
    }
  }

  dispose(): void {
    for (const cached of this.bufferCache.values()) cached.buf.destroy()
    this.bufferCache.clear()
    this.pipelinesByShader.clear()
  }
}
