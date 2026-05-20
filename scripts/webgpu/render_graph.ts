/**
 * `WebGpuRenderGraph` — WebGPU sibling of the dispatch loop in
 * `RenderGraph.exec` (`scripts/renderengine/renderpass.ts:488`). Phase 5
 * closeout.
 *
 * Walks the same sorted node list the WebGL graph uses, but encodes
 * each `RenderPass` via the WGSL registry in `wgsl_render_passes.ts`
 * instead of `RenderPass.renderInternGPU`. Routes by `constructor.name`
 * so unported passes raise a clear error rather than silently no-op.
 *
 * The actual bind-group construction lives at the call site since the
 * input-texture wiring depends on the upstream `FBOSocket` graph the
 * caller already resolved. We just hand the encoder + pipeline to a
 * caller-provided `bindGroupForPass` hook, mirroring the same seam the
 * `WebGPUBatchExecutor` uses.
 */

import type {WebGpuRenderContext} from './render_context.js'
import type {RenderTarget} from './render_target.js'
import {lookupWgslPass, buildPassPipelineDescriptor} from '../shaders/wgsl_render_passes.js'
import type {Pipeline} from './pipeline.js'

/**
 * Identifies a render-pass node as the WebGPU graph walks it. The
 * WebGL graph uses `constructor.name`; we mirror that and add an
 * optional preprocess `defines` map (BlurPass uses `BLUR_SAMPLES` +
 * `BLUR_AXIS_Y`, SharpenPass + DenoiseBlur use similar variants).
 */
export interface GraphNodeRef {
  /** Pass-key matching a `registerWgslPass({key: ...})` entry. */
  passKey: string
  defines?: Record<string, string | number | boolean>
  /** Render target this pass writes into. */
  target: RenderTarget
  /** Optional clear color override; defaults to opaque black. */
  clearColor?: GPUColor
  /** Optional pass label for the encoder + render bundle. */
  label?: string
}

export interface DispatchHooks {
  /** Returns the `@group(0)` bind group for the given pass + pipeline.
   *  The caller wires up the input textures (`fbo_rgba_tex`,
   *  `fbo_depth_tex`, `blue_mask_tex`, etc.) and any pass-specific
   *  uniforms (AOUniforms, AccumUniforms, SharpenUniforms). */
  bindGroupForPass: (node: GraphNodeRef, pipeline: Pipeline) => GPUBindGroup

  /** Called for `NormalPass` — that node delegates to a mesh render on
   *  the WebGL side; on WebGPU the caller encodes the equivalent mesh
   *  draws into the supplied pass encoder. Skip the WGSL fragment. */
  encodeMeshNormalPass?: (node: GraphNodeRef, pass: GPURenderPassEncoder) => void
}

export class WebGpuRenderGraph {
  readonly ctx: WebGpuRenderContext

  constructor(ctx: WebGpuRenderContext) {
    this.ctx = ctx
  }

  /**
   * Encode `nodes` in order against the open frame. Caller must have
   * already called `ctx.beginFrame()`; finish with `ctx.endFrame()`.
   */
  exec(nodes: GraphNodeRef[], hooks: DispatchHooks): void {
    if (!this.ctx.encoder) {
      throw new Error('WebGpuRenderGraph.exec: no frame open — call ctx.beginFrame() first.')
    }

    for (const node of nodes) {
      const entry = lookupWgslPass(node.passKey)
      if (!entry) {
        throw new Error(`WebGpuRenderGraph: no WGSL pass registered for key "${node.passKey}"`)
      }

      this.ctx.renderStage(node.target, (pass) => {
        if (node.passKey === 'NormalPass') {
          if (!hooks.encodeMeshNormalPass) {
            throw new Error('WebGpuRenderGraph: NormalPass requires hooks.encodeMeshNormalPass')
          }
          hooks.encodeMeshNormalPass(node, pass)
          return
        }

        const desc = buildPassPipelineDescriptor(entry, node.defines)
        const pipeline = this.ctx.pipelineCache.get(desc)
        pass.setPipeline(pipeline.handle)
        pass.setBindGroup(0, hooks.bindGroupForPass(node, pipeline))
        this.ctx.drawFullscreenQuad(pass)
      }, {clearColor: node.clearColor ?? {r: 0, g: 0, b: 0, a: 1}, label: node.label})
    }
  }
}
