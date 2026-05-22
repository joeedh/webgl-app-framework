/**
 * WebGPU sibling of the dispatch loop in `RenderGraph.exec`
 * (`scripts/renderengine/renderpass.ts:488`). Walks the same sorted
 * node list the WebGL graph uses but encodes each `RenderPass` via the
 * WGSL registry in `wgsl_render_passes.ts`. Bind-group construction is
 * delegated to a caller hook because input-texture wiring depends on
 * the upstream `FBOSocket` graph that only the caller has resolved.
 */

import type {WebGpuRenderContext} from './render_context.js'
import type {RenderTarget} from './render_target.js'
import {lookupWgslPass, buildPassPipelineDescriptor} from '../renderengine/wgsl_render_passes.js'
import type {Pipeline} from './pipeline.js'
import {getWebGpuDebug} from '../editors/debug/webgpu_debug.js'

// Direct swap-chain (canvas) attachment for the final OutputPass. Set on
// `GraphNodeRef.surface` to bypass the offscreen `RenderTarget` and write
// straight to the canvas texture, sized + scissored to the view3d region.
export interface SurfaceTarget {
  view: GPUTextureView
  format: GPUTextureFormat
  // Required when the pass writes @builtin(frag_depth) (OutputPass /
  // PassThruPass / SharpenPass / AccumPass). Format must match what the
  // registered pass entry's `depthStencil` declares (`depth24plus`).
  depthView?: GPUTextureView
  // View3d region inside the canvas. Omit to draw across the whole
  // attachment.
  viewport?: {x: number; y: number; w: number; h: number}
  clearColor?: GPUColor
}

export interface GraphNodeRef {
  // Pass-key matching a `registerWgslPass({key: ...})` entry.
  passKey: string
  // BlurPass / SharpenPass / DenoiseBlur drive preprocessor variants
  // (e.g. `BLUR_SAMPLES`, `BLUR_AXIS_Y`) through this map.
  defines?: Record<string, string | number | boolean>
  // Offscreen target. Required even when `surface` is set so the engine
  // can size buffers consistently and so the upstream-input resolution
  // logic has a stable handle. Ignored at exec time when `surface` is set.
  target: RenderTarget
  // Set per-frame to redirect the encode into the canvas swap-chain.
  surface?: SurfaceTarget
  clearColor?: GPUColor
  label?: string
}

export interface DispatchHooks {
  // Caller wires up `@group(0)` — input textures (`fbo_rgba_tex`,
  // `fbo_depth_tex`, `blue_mask_tex`, ...) and any pass-specific
  // uniforms (AOUniforms, AccumUniforms, SharpenUniforms).
  bindGroupForPass: (node: GraphNodeRef, pipeline: Pipeline) => GPUBindGroup

  // `NormalPass` delegates to a mesh render (no WGSL fragment) — the
  // caller encodes equivalent mesh draws into the supplied encoder.
  encodeMeshNormalPass?: (node: GraphNodeRef, pass: GPURenderPassEncoder) => void

  // `BasePass` renders scene materials (one pipeline per material,
  // compiled on demand from the shader-node graph). Caller resolves
  // each `Material → WGSL → Pipeline`, registers it in
  // `frame.pipelineBindings`, and issues the per-object draws.
  encodeMeshBasePass?: (node: GraphNodeRef, pass: GPURenderPassEncoder) => void

  // Fired once after every `GraphNodeRef` has been encoded into the open
  // frame and before `exec` returns. The encoder is still live so callers
  // can chain extra render passes (overlays: grid, widgets, drawDrawLines,
  // toolmode debug) onto the same submission. The caller owns opening
  // their own `renderStage` / `renderStageDesc` — the graph does no pass
  // management here.
  encodeOverlays?: (ctx: WebGpuRenderContext) => void
}

export class WebGpuRenderGraph {
  readonly ctx: WebGpuRenderContext

  constructor(ctx: WebGpuRenderContext) {
    this.ctx = ctx
  }

  // Caller must already have opened the frame with `ctx.beginFrame()`
  // and must call `ctx.endFrame()` afterwards.
  exec(nodes: GraphNodeRef[], hooks: DispatchHooks): void {
    if (!this.ctx.encoder) {
      throw new Error('WebGpuRenderGraph.exec: no frame open — call ctx.beginFrame() first.')
    }

    // Capture every pass output into the WebGPU debug registry so the
    // DebugEditor can blit any intermediate buffer. `pushTexture` short-
    // circuits to a no-op when no DebugEditor is open in the screen, so
    // this is a free observation when the editor isn't active. The
    // canvas/surface branch is skipped since the swap-chain texture isn't
    // copyable to our internal history texture (no COPY_SRC usage).
    const debug = getWebGpuDebug(this.ctx.device)
    const encoder = this.ctx.encoder

    for (const node of nodes) {
      const entry = lookupWgslPass(node.passKey)
      if (!entry) {
        throw new Error(`WebGpuRenderGraph: no WGSL pass registered for key "${node.passKey}"`)
      }

      const drawFsQuad = (pass: GPURenderPassEncoder) => {
        const desc = buildPassPipelineDescriptor(entry, node.defines)
        if (node.surface) {
          // Pipeline must be rebuilt against the swap-chain format —
          // entries are registered for `rgba16float` and the canvas is
          // typically `bgra8unorm`. The cache keys on colorTargets so
          // this transparently produces a distinct variant.
          desc.colorTargets = desc.colorTargets.map(t => ({...t, format: node.surface!.format}))
        }
        const pipeline = this.ctx.pipelineCache.get(desc)
        pass.setPipeline(pipeline.handle)
        pass.setBindGroup(0, hooks.bindGroupForPass(node, pipeline))
        this.ctx.drawFullscreenQuad(pass)
      }

      if (node.surface) {
        // Canvas-bound pass — build a render-pass descriptor pointing at
        // the swap-chain view and (optional) shared depth, then scissor
        // to the view3d region inside the full-canvas attachment.
        const surface = node.surface
        const colorDesc: GPURenderPassColorAttachment = {
          view      : surface.view,
          clearValue: surface.clearColor ?? node.clearColor ?? {r: 0, g: 0, b: 0, a: 1},
          loadOp    : 'clear',
          storeOp   : 'store',
        }
        const desc: GPURenderPassDescriptor = {
          label           : node.label,
          colorAttachments: [colorDesc],
        }
        if (surface.depthView) {
          desc.depthStencilAttachment = {
            view             : surface.depthView,
            depthClearValue  : 1.0,
            depthLoadOp      : 'clear',
            depthStoreOp     : 'store',
          }
        }
        this.ctx.renderStageDesc(desc, (pass) => {
          if (surface.viewport) {
            const {x, y, w, h} = surface.viewport
            if (w > 0 && h > 0) {
              pass.setViewport(x, y, w, h, 0, 1)
              pass.setScissorRect(x, y, w, h)
            }
          }
          drawFsQuad(pass)
        })
        continue
      }

      this.ctx.renderStage(node.target, (pass) => {
        if (node.passKey === 'NormalPass') {
          if (!hooks.encodeMeshNormalPass) {
            throw new Error('WebGpuRenderGraph: NormalPass requires hooks.encodeMeshNormalPass')
          }
          hooks.encodeMeshNormalPass(node, pass)
          return
        }

        if (node.passKey === 'BasePass') {
          if (!hooks.encodeMeshBasePass) {
            throw new Error('WebGpuRenderGraph: BasePass requires hooks.encodeMeshBasePass')
          }
          hooks.encodeMeshBasePass(node, pass)
          return
        }

        drawFsQuad(pass)
      }, {clearColor: node.clearColor ?? {r: 0, g: 0, b: 0, a: 1}, label: node.label})

      // Snapshot the pass's color output. Key on label (which the engine
      // disambiguates per-pass, e.g. "SharpenPass.x" vs "SharpenPass.y")
      // and fall back to the registry key. AccumPass / PassThruPass ping-
      // pong overwrites both A/B slots through the same label each frame,
      // which is what we want — the editor sees the per-pass output, not
      // the underlying ring slot.
      const color = node.target.colors[0]
      if (color) {
        debug.pushTexture(node.label ?? node.passKey, color.handle, encoder)
      }
    }

    hooks.encodeOverlays?.(this.ctx)
  }
}
