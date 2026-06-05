/**
 * WebGPU sibling of `RenderContext`
 * (`scripts/renderengine/renderpass.ts:72`). Bundles
 * `device + queue + commandEncoder + pipelineCache + fullscreen quad`
 * plus the same drawmats/size fields the WebGL `RenderContext` carries
 * so the shared `RenderPass` machinery can branch on which one it sees.
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
  pipelineCache?: PipelineCache
  // Fed into pipelines whose color target the queue adapter retargets
  // at draw time. Defaults to `'bgra8unorm'`, matching the registry.
  surfaceFormat?: GPUTextureFormat
}

// Full-screen blit quad: two triangles in clip space with UVs in 0..1.
// Layout: `vec2 position, vec2 uv` interleaved — stride 16 bytes.
//
// UV.y is intentionally flipped relative to the GL convention. In WebGPU
// both framebuffer (0,0) and texture (0,0) are top-left, AND NDC y=+1
// maps to framebuffer top. So a fragment at clip y=+1 lands at framebuffer
// top (y=0), which is where the source texture's (0,0) texel was written
// by an upstream pass. Pairing clip(-1,+1) with UV(0,0) (rather than
// UV(0,1) as the GL quad would) makes blits identity-preserving — texel
// in == texel out. With the GL-style UV mapping, every blit Y-flips, and
// the accumulator's `sampled + prior` sum on samples 2+ adds two
// differently-oriented buffers, producing a visible vertical-mirror ghost.
const FULLSCREEN_QUAD_DATA = new Float32Array([
  // tri 1
  -1, -1, 0, 1, 1, -1, 1, 1, 1, 1, 1, 0,
  // tri 2
  -1, -1, 0, 1, 1, 1, 1, 0, -1, 1, 0, 0,
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
  encoder: GPUCommandEncoder | undefined
  // Set by `renderStage`/`renderStageDesc` while a pass is in flight so
  // `createDrawQueue` can pick it up without the call site threading
  // the encoder through.
  currentPass: GPURenderPassEncoder | undefined
  // Color attachment format(s) of the pass currently in flight, so a draw
  // path that builds its own pipelines (the sculptcore LiteMesh batch
  // executor) can match the pass instead of assuming the swap-chain format.
  // Set alongside `currentPass`; offscreen passes are `rgba16float`, the
  // canvas pass is `surfaceFormat`.
  currentColorFormats: GPUTextureFormat[] | undefined
  // Bridge from a GLSL ShaderProgram identity to its WGSL `Pipeline`;
  // mirrors `pipelineBindings` in `WebGPUFrameContext`.
  readonly pipelineBindings: Map<unknown, Pipeline>
  readonly fullscreenQuad: GpuBuffer
  drawmats: DrawMats
  size: [number, number]
  surfaceFormat: GPUTextureFormat

  constructor(opts: WebGpuRenderContextOptions) {
    this.device = opts.device
    this.queue = opts.queue ?? opts.device.queue
    this.pipelineCache = opts.pipelineCache ?? new PipelineCache(opts.device)
    this.pipelineBindings = new Map()
    this.drawmats = opts.drawmats
    this.size = [opts.size[0], opts.size[1]]
    this.surfaceFormat = opts.surfaceFormat ?? 'bgra8unorm'
    this.currentPass = undefined
    this.currentColorFormats = undefined
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

  renderStage(
    target: RenderTarget,
    drawCb: (pass: GPURenderPassEncoder) => void,
    opts: {clearColor?: GPUColor; clearDepth?: number; label?: string} = {}
  ): void {
    if (!this.encoder) {
      throw new Error('WebGpuRenderContext.renderStage: no frame open — call beginFrame() first.')
    }
    target.beginPass(
      this.encoder,
      (pass) => {
        this.currentPass = pass
        this.currentColorFormats = target.colorFormats
        try {
          drawCb(pass)
        } finally {
          this.currentPass = undefined
          this.currentColorFormats = undefined
        }
      },
      opts
    )
  }

  // For color attachments that don't live on a `RenderTarget` — most
  // notably the canvas texture from `GPUCanvasContext.getCurrentTexture()`,
  // which is volatile per frame and not owned by a persistent object.
  renderStageDesc(desc: GPURenderPassDescriptor, drawCb: (pass: GPURenderPassEncoder) => void): void {
    if (!this.encoder) {
      throw new Error('WebGpuRenderContext.renderStageDesc: no frame open — call beginFrame() first.')
    }
    const pass = this.encoder.beginRenderPass(desc)
    this.currentPass = pass
    // renderStageDesc backs the canvas/swap-chain pass — its color
    // attachment is the surface format.
    this.currentColorFormats = [this.surfaceFormat]
    try {
      drawCb(pass)
    } finally {
      this.currentPass = undefined
      this.currentColorFormats = undefined
      pass.end()
    }
  }

  // Caller owns `setPipeline` + `setBindGroup`; this only binds the
  // vertex buffer and issues the 6-vertex draw.
  drawFullscreenQuad(pass: GPURenderPassEncoder): void {
    pass.setVertexBuffer(0, this.fullscreenQuad.handle)
    pass.draw(6, 1, 0, 0)
  }
}
