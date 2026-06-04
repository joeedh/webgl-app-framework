/**
 * Batch executor for the WebGPU backend — uploads wasm-owned `Buffer`s
 * into `GpuBuffer`s, caches a pipeline per shader, encodes draw calls
 * from a `DrawBatch` into a `GPURenderPassEncoder`. Parallel of
 * `WebGLBatchExecutor` in `scripts/webgl/batch.ts`.
 *
 *   * No VAO — vertex buffers are bound per-draw on the pass.
 *   * No attribute lookup by name — sculptcore's `ShaderDef.attrs`
 *     order is the source of truth for the matching `@location(n)`
 *     slots in WGSL.
 *   * Pipelines are immutable: every (shader, vertex layout, target
 *     format, blend, primitive) combination is its own
 *     `GPURenderPipeline`. The cache keys on sdef pointer + topology
 *     since the rest is fixed per executor instance.
 *   * Uniforms aren't bound by name — the caller supplies a
 *     `bindGroupForCommand` callback returning a ready `GPUBindGroup`.
 *
 * The wasm-side `ShaderDef` still carries GLSL sources used by the WebGL
 * fallback; this executor consumes the WGSL equivalent via the
 * `wgslForShader(sdef)` lookup the caller provides.
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

/** One `@group(n)` → `GPUBindGroup` binding the dispatch loop will set. */
export interface CommandBindGroup {
  group: number
  bindGroup: GPUBindGroup
}

export interface WebGPUBatchExecutorOptions {
  device: GPUDevice
  wasm: IWasmInterface
  pipelineCache?: PipelineCache
  wgslForShader: (sdef: ShaderDef) => string
  // Returns the bind group(s) the WGSL source declares, or `null` to skip this
  // draw command (the dispatch loop continues with the rest of the batch rather
  // than aborting the whole pass — see the "never throw on the render seam"
  // note: a throw here is swallowed as a drawObjects warning). A bare
  // `GPUBindGroup` is shorthand for `@group(0)`; return a `CommandBindGroup[]`
  // when the shader spans several groups (e.g. a material's frame/light/object
  // groups), and every entry is bound before the draw.
  bindGroupForCommand: (cmd: DrawCommand, pipeline: Pipeline) => GPUBindGroup | CommandBindGroup[] | null
  colorTargets: GPUColorTargetState[]
  depthStencil?: GPUDepthStencilState
}

export class WebGPUBatchExecutor {
  readonly device: GPUDevice
  readonly queue: GPUQueue
  readonly wasm: IWasmInterface
  readonly pipelineCache: PipelineCache
  private readonly bufferCache = new Map<number, CachedGpuBuffer>()
  private readonly pipelinesByShader = new Map<string, Pipeline>()
  private readonly opts: WebGPUBatchExecutorOptions
  // Shaders we've already logged a build/dispatch failure for, so a persistently
  // broken command warns once instead of every frame.
  private readonly warnedShaders = new Set<string>()


  constructor(opts: WebGPUBatchExecutorOptions) {
    this.device = opts.device
    this.queue = opts.device.queue
    this.wasm = opts.wasm
    this.pipelineCache = opts.pipelineCache ?? new PipelineCache(opts.device)
    this.opts = opts
  }

  // --- backend-agnostic seams (see TODO.md "native-electron: de-numbering") ---
  // WASM keeps a numeric heap `.ptr` + a numeric `buf.data` and reads the
  // linear-memory heap directly; the native (N-API) backend keeps real pointers
  // in C++, so identity comes from `objectAddress` (an opaque key) and bytes from
  // `pointerBytes` (a copy under the V8 sandbox). Vector *members* are array-like
  // on WASM but plain bound instances natively, so route them through
  // `getBoundVector`.

  /** Stable per-Buffer identity for the GPU-buffer cache. */
  private bufferKey(buf: Buffer): number {
    const wasmKey = (buf as unknown as BoundLike).ptr
    if (typeof wasmKey === 'number') return wasmKey
    const addr = this.wasm.objectAddress?.(buf as unknown as object)
    if (typeof addr === 'number') return addr
    throw new Error('WebGPUBatch: no stable buffer identity (objectAddress missing)')
  }

  /**
   * The buffer's backing bytes (WASM heap view vs native pointerBytes copy). An
   * empty view for a not-yet-filled buffer (`bytes === 0` / null `data`) — the
   * WASM path likewise yields a zero-length view there; do NOT throw, or the
   * first frame (before the spatial tree fills its buffers) would abort the
   * whole drawObjects pass.
   */
  private bufferBytes(buf: Buffer, bytes: number): Uint8Array<ArrayBuffer> {
    const heap = this.wasm.HEAPU8
    if (heap !== undefined) {
      const dataPtr = (buf as unknown as {data: number}).data
      return new Uint8Array(heap.buffer as ArrayBuffer, dataPtr, bytes)
    }
    if (bytes === 0) return new Uint8Array(0)
    const view = this.wasm.pointerBytes?.(buf as unknown as object, 'data', bytes)
    return (view as Uint8Array<ArrayBuffer>) ?? new Uint8Array(0)
  }

  /** A bound Vector member as array-like (`.length` + numeric index). */
  private vecMember<T>(v: unknown): ArrayLike<T> {
    if (this.wasm.HEAPU8 !== undefined) {
      return v as ArrayLike<T>
    }
    return this.wasm.getBoundVector('', v as object) as ArrayLike<T>
  }

  private uploadBuffer(buf: Buffer): GpuBuffer {
    const key = this.bufferKey(buf)
    const bytes = buf.size * buf.elemsize * gpuTypeBytes(buf.type)

    let cached = this.bufferCache.get(key)
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
      this.bufferCache.set(key, cached)
    }

    // WASM tracks the data pointer to detect a realloc; native relies on the
    // engine's `update_buffer` dirty flag (the pointer stays in C++).
    const dataPtr =
      this.wasm.HEAPU8 !== undefined ? (buf as unknown as {data: number}).data : undefined
    const needsWrite =
      (dataPtr !== undefined && cached.uploadedDataPtr !== dataPtr) || buf.update_buffer
    if (needsWrite) {
      const view = this.bufferBytes(buf, bytes)
      cached.buf.write(view)
      if (dataPtr !== undefined) cached.uploadedDataPtr = dataPtr
      buf.update_buffer = false
    }

    return cached.buf
  }

  releaseBuffer(buf: Buffer): void {
    const key = this.bufferKey(buf)
    const cached = this.bufferCache.get(key)
    if (cached) {
      cached.buf.destroy()
      this.bufferCache.delete(key)
    }
  }

  private getPipeline(sdef: ShaderDef, cmd: DrawCommand, cmdAttrs: Buffer[]): Pipeline {
    const sdefPtr = (sdef as unknown as BoundLike).ptr
    const topology = cmdTypeToTopology(cmd.type)

    // Build the per-slot layout from the *actual* buffer shape, not the
    // shader's declared `elemSize`. WebGPU tolerates a narrower vertex
    // format than the WGSL variable (e.g. `float32x3` data into a
    // `vec4f` slot — missing components default to 0, w to 1). Keying
    // off the buffer shape lets sculptcore feed vec3 normals into a
    // WGSL `vec4f` declaration without the pipeline rejecting the bind.
    const attrs = Array.from(this.vecMember<{name: string}>(sdef.attrs))
    const slotShape: Array<{stride: number; format: GPUVertexFormat} | null> = attrs.map((a) => {
      const found = cmdAttrs.find((b) => b.name === a.name)
      if (!found) return null
      const elemsize = found.elemsize
      const stride = elemsize * gpuTypeBytes(found.type)
      return {stride, format: gpuTypeWGSLFormat(found.type, elemsize)}
    })

    const shapeKey = slotShape.map((s) => (s ? `${s.format}@${s.stride}` : '_')).join(',')
    const cacheKey = `${sdefPtr}|${topology}|${shapeKey}`

    let pipeline = this.pipelinesByShader.get(cacheKey)
    if (pipeline) return pipeline

    const vertexBuffers: Array<GPUVertexBufferLayout | null> = slotShape.map((s, slot) => {
      if (!s) return null
      return {
        arrayStride: s.stride,
        attributes: [{shaderLocation: slot, offset: 0, format: s.format}],
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

  // Caller must already have opened the pass and set the viewport.
  dispatch(batch: DrawBatch, pass: GPURenderPassEncoder): void {
    const commands = this.vecMember<DrawCommand>(batch.commands)
    if (commands.length === 0) return

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]
      if (!cmd.shader) continue

      // Skip a single bad draw command rather than letting a throw abort the
      // whole pass: on the native backend a render-path throw is swallowed as a
      // drawObjects warning, blanking every object in the frame. Build/upload
      // failures (e.g. an unported WGSL shader, a not-yet-filled buffer) are
      // logged once per shader and skipped.
      try {
        // `cmd.attrs` arrives from the WASM/Embind (or native N-API) boundary as
        // a Vector-like, not a JS Array — `.find()` isn't on the prototype, and
        // the native member wrapper isn't even array-like. Normalize once per
        // command (vecMember handles the native case) so the lookups below work.
        const cmdAttrs = Array.from(this.vecMember<Buffer>(cmd.attrs))

        const pipeline = this.getPipeline(cmd.shader, cmd, cmdAttrs)
        const bindGroup = this.opts.bindGroupForCommand(cmd, pipeline)
        if (!bindGroup) continue // callback declined this command; skip, don't abort
        const sdefAttrs = Array.from(this.vecMember<{name: string}>(cmd.shader.attrs))
        const count = cmd.end - cmd.start

        pass.setPipeline(pipeline.handle)
        const groups: CommandBindGroup[] = Array.isArray(bindGroup)
          ? bindGroup
          : [{group: 0, bindGroup}]
        for (const e of groups) pass.setBindGroup(e.group, e.bindGroup)
        for (let slot = 0; slot < sdefAttrs.length; slot++) {
          const found = cmdAttrs.find((a) => a.name === sdefAttrs[slot].name)
          if (!found) continue
          pass.setVertexBuffer(slot, this.uploadBuffer(found).handle)
        }
        pass.draw(count, 1, cmd.start, 0)
      } catch (e) {
        const key = (cmd.shader as {name?: string}).name ?? String(i)
        if (!this.warnedShaders.has(key)) {
          this.warnedShaders.add(key)
          console.error(`WebGPUBatchExecutor: skipping draw command for shader "${key}" after error`, e)
        }
      }
    }
  }

  dispose(): void {
    for (const cached of this.bufferCache.values()) cached.buf.destroy()
    this.bufferCache.clear()
    this.pipelinesByShader.clear()
  }
}
