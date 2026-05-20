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
import type {Pipeline, PipelineCache} from './pipeline.js'

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
}

export class WebGPUDrawQueueAdapter implements DrawQueue {
  readonly frame: WebGPUFrameContext

  constructor(frame: WebGPUFrameContext) {
    this.frame = frame
  }

  submit(s: Submission): void {
    const pipeline = this.frame.pipelineBindings.get(s.pipeline)
    if (!pipeline) {
      const name = (s.pipeline as unknown as {name?: string}).name ?? '<unknown>'
      throw new Error(
        `WebGPUDrawQueueAdapter: pipeline "${name}" not yet ported to WGSL — ` +
          `register it in frame.pipelineBindings (Phase 4b).`
      )
    }
    // Real implementation lands once SimpleIsland uploads to GpuBuffers
    // and Drawable.drawGPU(passEncoder, pipeline) is defined.
    const meshName = (s.mesh as unknown as {constructor?: {name?: string}}).constructor?.name ?? '<unknown>'
    throw new Error(
      `WebGPUDrawQueueAdapter: mesh "${meshName}" not yet ported — needs ` +
        `Drawable.drawGPU(passEncoder, pipeline) (Phase 4c).`
    )
  }

  scheduleRawGLPass(): void {
    throw new Error(
      'WebGPUDrawQueueAdapter: scheduleRawGLPass is WebGL-only. The texpaint shim ' +
        '(Phase 6) bridges through readPixels → writeTexture instead.'
    )
  }
}
