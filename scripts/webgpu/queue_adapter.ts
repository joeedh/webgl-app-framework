/**
 * `WebGPUDrawQueueAdapter` — DrawQueue backend that records into a
 * `GPUCommandEncoder` / `GPURenderPassEncoder`. Parallel to
 * `WebGLDrawQueueAdapter` (see `scripts/render/queue.ts`).
 *
 * Phase 4a scaffold. Submissions currently throw — the actual draw
 * translation lands when (a) `SimpleIsland` learns to upload buffers to
 * `GpuBuffer` and (b) `WebGLBatchExecutor` is ported to
 * `WebGPUBatchExecutor`. Until then, `getRenderer()` returns `'webgl'` by
 * default and nothing constructs this adapter on the hot path.
 *
 * The adapter implements the same `DrawQueue` interface as the WebGL
 * adapter so the queue swap is a one-line change at the call site.
 *
 * `scheduleRawGLPass` *intentionally throws* — by the time we're on the
 * WebGPU backend, the per-stroke texpaint shim (Phase 6) is the only
 * legitimate caller, and it goes through its own bridge.
 */

import type {DrawQueue, FrameContext, Submission} from '../render/queue.js'
import type {IUniformsBlock} from '../webgl/webgl.js'
import type {Pipeline, PipelineCache} from './pipeline.js'
import {buildPipelineDescriptor, lookupWgslShader} from '../shaders/wgsl_shaders.js'
import {BufferUsage} from './flags.js'
import {UniformBindings} from './uniform_bindings.js'

export interface WebGPUFrameContext extends FrameContext {
  device: GPUDevice
  encoder: GPUCommandEncoder
  passEncoder: GPURenderPassEncoder
  pipelineCache: PipelineCache
  /**
   * Map from the WebGL-side `ShaderProgram` identity passed in
   * `Submission.pipeline` to the cached WebGPU `Pipeline`. Populated as
   * shaders get ported under Phase 4b.
   */
  pipelineBindings: Map<unknown, Pipeline>
  /** Surface format the canvas pass actually targets — used to rewrite
   *  the registry's default color target so the pipeline matches the
   *  open render pass attachment. */
  surfaceFormat?: GPUTextureFormat
}

/**
 * Per-`Pipeline` `UniformBindings` cache. Reflection of a pipeline's WGSL
 * uniform structs is amortized once per pipeline, and the GpuBuffers
 * + bind groups it owns are reused across submissions on every adapter
 * that targets the same pipeline.
 */
const uniformBindingsByPipeline = new WeakMap<Pipeline, UniformBindings>()

function getUniformBindings(device: GPUDevice, pipeline: Pipeline): UniformBindings {
  let bindings = uniformBindingsByPipeline.get(pipeline)
  if (!bindings) {
    bindings = new UniformBindings(device, pipeline.descriptor.wgsl, pipeline.descriptor.label)
    uniformBindingsByPipeline.set(pipeline, bindings)
  }
  return bindings
}

/**
 * One zero-filled vertex buffer per device, bound to any pipeline slot the
 * drawn mesh doesn't supply. Lets pipelines declare a fixed vertex-buffer
 * layout (positional `WGSL_VERTEX_SLOTS`) without forcing every drawable to
 * upload a NORMAL/UV/COLOR/ID buffer it doesn't actually use — the WGSL
 * shader still reads zeros from the missing attribute, which the fragment
 * stage discards or treats as a sensible default. Sized at 1 MiB which
 * covers ~65k vertices at stride 16; if a mesh exceeds that it will hit
 * a WebGPU validation error and we can grow this.
 */
const DUMMY_VERTEX_BUFFER_SIZE = 1024 * 1024
const dummyVertexBufferByDevice = new WeakMap<GPUDevice, GPUBuffer>()

function getDummyVertexBuffer(device: GPUDevice): GPUBuffer {
  let buf = dummyVertexBufferByDevice.get(device)
  if (!buf) {
    buf = device.createBuffer({
      label           : 'WebGPUDrawQueueAdapter.dummyVertexBuffer',
      size            : DUMMY_VERTEX_BUFFER_SIZE,
      usage           : BufferUsage.VERTEX,
      mappedAtCreation: true,
    })
    new Uint8Array(buf.getMappedRange()).fill(0)
    buf.unmap()
    dummyVertexBufferByDevice.set(device, buf)
  }
  return buf
}

export class WebGPUDrawQueueAdapter implements DrawQueue {
  readonly frame: WebGPUFrameContext

  constructor(frame: WebGPUFrameContext) {
    this.frame = frame
  }

  submit(s: Submission): void {
    let pipeline = this.frame.pipelineBindings.get(s.pipeline)
    if (!pipeline) {
      // Fall back to the registry: a ShaderProgram tagged with `.wgslKey`
      // resolves directly into a pipeline descriptor, no per-frame
      // wiring required.
      const key = (s.pipeline as unknown as {wgslKey?: string}).wgslKey
      const entry = key ? lookupWgslShader(key) : undefined
      if (!entry) {
        const name = (s.pipeline as unknown as {name?: string}).name ?? '<unknown>'
        throw new Error(
          `WebGPUDrawQueueAdapter: pipeline "${name}" not yet ported to WGSL — ` +
            `tag the ShaderProgram with .wgslKey or register it in ` +
            `frame.pipelineBindings (Phase 4b).`
        )
      }
      const desc = buildPipelineDescriptor(entry)
      // The registry color targets default to 'bgra8unorm', but Chrome
      // on some platforms prefers 'rgba8unorm' for the canvas. Override
      // the format on each color target so the pipeline matches the
      // open canvas-targeted render pass.
      const surfaceFormat = this.frame.surfaceFormat
      if (surfaceFormat) {
        // Don't rewrite formats that look like they were chosen on purpose
        // (e.g. ID picking uses 'rgba32float'). Treat the default 8-bit
        // unorm formats as interchangeable; leave others untouched.
        const interchangeable = new Set<GPUTextureFormat>(['bgra8unorm', 'rgba8unorm'])
        desc.colorTargets = desc.colorTargets.map((t) =>
          interchangeable.has(t.format) ? {...t, format: surfaceFormat} : t
        )
      }
      pipeline = this.frame.pipelineCache.get(desc)
      this.frame.pipelineBindings.set(s.pipeline, pipeline)
    }
    if (!s.mesh.drawGPU) {
      const meshName = (s.mesh as unknown as {constructor?: {name?: string}}).constructor?.name ?? '<unknown>'
      throw new Error(
        `WebGPUDrawQueueAdapter: mesh "${meshName}" has no drawGPU() — ` +
          `implement Drawable.drawGPU(pass, pipeline, uniforms) (Phase 4c).`
      )
    }
    // SimpleMesh / SimpleIsland exposes `_uploadGpuBuffers(device)` — call
    // it ahead of drawGPU so the per-attribute GpuBuffers are populated.
    // Other Drawable implementers manage their own uploads internally and
    // skip this hook.
    const uploader = (s.mesh as unknown as {_uploadGpuBuffers?: (device: GPUDevice) => void})._uploadGpuBuffers
    if (uploader) uploader.call(s.mesh, this.frame.device)
    // Mirror the WebGL adapter's `s.pipeline.bind(gl, uniforms)`: legacy
    // ShaderProgram-style call sites stash per-draw values on
    // `program.uniforms` (Light.drawQ sets `color` there) instead of
    // threading them through `Submission.uniforms`. Merge that bag in
    // ahead of the explicit submission/frame uniforms so the WebGPU
    // bindings see the same final value the WebGL bind would.
    const pipelineUniforms = (s.pipeline as unknown as {uniforms?: IUniformsBlock}).uniforms
    const uniforms: IUniformsBlock = pipelineUniforms
      ? {...pipelineUniforms, ...this.frame.uniforms, ...(s.uniforms ?? {})}
      : (s.uniforms ?? this.frame.uniforms)
    // Bind the pipeline first — every subsequent setBindGroup /
    // setVertexBuffer / draw call on the encoder is interpreted
    // relative to it.
    this.frame.passEncoder.setPipeline(pipeline.handle)
    // Write per-frame / per-object uniform buffers and attach their
    // bind groups. The material slot (group 1) holds textures + samplers
    // and must still be set by the caller (or the Drawable's drawGPU)
    // before issuing draws.
    const bindings = getUniformBindings(this.frame.device, pipeline)
    if (!bindings.isEmpty) {
      bindings.bind(this.frame.passEncoder, pipeline.handle, uniforms)
    }
    // Pre-bind a shared zero buffer to every non-null pipeline slot.
    // `drawGPU` overwrites slots the mesh actually provides; slots the
    // pipeline declares but the mesh lacks stay bound to the zero buffer
    // so WebGPU validation passes.
    const dummy = getDummyVertexBuffer(this.frame.device)
    const slots = pipeline.descriptor.vertexBuffers
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]) this.frame.passEncoder.setVertexBuffer(i, dummy)
    }
    s.mesh.drawGPU(this.frame.passEncoder, pipeline.handle, uniforms)
  }

  scheduleRawGLPass(): void {
    throw new Error(
      'WebGPUDrawQueueAdapter: scheduleRawGLPass is WebGL-only. The texpaint shim ' +
        '(Phase 6) bridges through readPixels → writeTexture instead.'
    )
  }
}
