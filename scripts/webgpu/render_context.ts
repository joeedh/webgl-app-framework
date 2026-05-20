/**
 * `WebGpuRenderContext` — the WebGPU sibling of
 * `RenderContext` (`scripts/renderengine/renderpass.ts:72`). Phase 5
 * scaffolding per the WebGL→WebGPU migration plan.
 *
 * The WebGL `RenderContext` bundles `gl + drawmats + size + smesh + a
 * blit shader` and gets passed to every `RenderPass.exec`. The WebGPU
 * sibling bundles `device + queue + commandEncoder + pipelineCache + a
 * full-screen quad GpuBuffer`, plus the same drawmats/size fields so the
 * shared `RenderPass` machinery can branch on which one it sees.
 *
 * Nothing wires this up yet — the per-pass ports under Phase 5b/5c will
 * extend each `RenderPass` subclass with a `renderInternGPU(ctx)` method
 * once their WGSL fragment lands in `wgsl_render_passes.ts`. Until then
 * `RenderGraph.exec` keeps dispatching through the WebGL branch.
 */

import type {DrawMats} from '../webgl/webgl.js'
import {GpuBuffer} from './buffer.js'
import {PipelineCache, type Pipeline} from './pipeline.js'
import {RenderTarget} from './render_target.js'

export interface WebGpuRenderContextOptions {
  device: GPUDevice
  queue?: GPUQueue
  size: [number, number]
  drawmats: DrawMats
  /** Optional pre-existing cache; otherwise one is created. */
  pipelineCache?: PipelineCache
}

/**
 * Vertex data for the full-screen blit quad — two triangles in clip
 * space (`-1..1`) with UVs in `0..1`. Mirrors the geometry that the
 * WebGL `RenderContext.smesh` carries (renderpass.ts:122-133).
 *
 * Layout: `vec2 position, vec2 uv` interleaved — stride 16 bytes.
 */
const FULLSCREEN_QUAD_DATA = new Float32Array([
  // tri 1
  -1, -1,  0, 0,
   1, -1,  1, 0,
   1,  1,  1, 1,
  // tri 2
  -1, -1,  0, 0,
   1,  1,  1, 1,
  -1,  1,  0, 1,
])

export const FULLSCREEN_QUAD_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 16,
  attributes: [
    {shaderLocation: 0, offset: 0, format: 'float32x2'}, // position
    {shaderLocation: 1, offset: 8, format: 'float32x2'}, // uv
  ],
}

export class WebGpuRenderContext {
  readonly device: GPUDevice
  readonly queue: GPUQueue
  readonly pipelineCache: PipelineCache
  /** Per-frame command encoder — set by `beginFrame`, cleared by `endFrame`. */
  encoder: GPUCommandEncoder | undefined
  /** Currently open render pass encoder — set by `renderStage` while a pass
   *  is in flight, cleared on return. The `createDrawQueue` factory reads
   *  this to build a `WebGPUFrameContext` without the call site having to
   *  thread the encoder through. */
  currentPass: GPURenderPassEncoder | undefined
  /** Owned by the per-pass `Pipeline`s; the bridge from a GLSL ShaderProgram
   *  to its WGSL `Pipeline` (mirrors `pipelineBindings` in `WebGPUFrameContext`). */
  readonly pipelineBindings: Map<unknown, Pipeline>
  readonly fullscreenQuad: GpuBuffer
  drawmats: DrawMats
  size: [number, number]

  constructor(opts: WebGpuRenderContextOptions) {
    this.device = opts.device
    this.queue = opts.queue ?? opts.device.queue
    this.pipelineCache = opts.pipelineCache ?? new PipelineCache(opts.device)
    this.pipelineBindings = new Map()
    this.drawmats = opts.drawmats
    this.size = [opts.size[0], opts.size[1]]
    this.currentPass = undefined
    this.fullscreenQuad = new GpuBuffer(opts.device, {
      label: 'WebGpuRenderContext.fullscreenQuad',
      size : FULLSCREEN_QUAD_DATA.byteLength,
      usage: 'vertex',
    })
    this.fullscreenQuad.write(FULLSCREEN_QUAD_DATA as unknown as BufferSource)
  }

  beginFrame(): GPUCommandEncoder {
    this.encoder = this.device.createCommandEncoder({label: 'WebGpuRenderContext.frame'})
    return this.encoder
  }

  endFrame(): void {
    if (!this.encoder) return
    this.queue.submit([this.encoder.finish()])
    this.encoder = undefined
  }

  /**
   * Encode a single render pass against `target` using `drawCb`. Throws
   * if no frame is open — call `beginFrame()` first.
   *
   * Replaces the role of `RenderContext.renderStage(fbo, size, drawCb)`
   * on the WebGPU side.
   */
  renderStage(
    target: RenderTarget,
    drawCb: (pass: GPURenderPassEncoder) => void,
    opts: {clearColor?: GPUColor; clearDepth?: number; label?: string} = {}
  ): void {
    if (!this.encoder) {
      throw new Error('WebGpuRenderContext.renderStage: no frame open — call beginFrame() first.')
    }
    target.beginPass(this.encoder, (pass) => {
      this.currentPass = pass
      try {
        drawCb(pass)
      } finally {
        this.currentPass = undefined
      }
    }, opts)
  }

  /**
   * Issue a full-screen blit using the bundled quad buffer. The caller
   * is responsible for `setPipeline` + `setBindGroup` — this method only
   * binds the vertex buffer and issues the 6-vertex draw.
   */
  drawFullscreenQuad(pass: GPURenderPassEncoder): void {
    pass.setVertexBuffer(0, this.fullscreenQuad.handle)
    pass.draw(6, 1, 0, 0)
  }
}
