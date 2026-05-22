/**
 * Color + depth `GPUTextureView` bundle. WebGPU equivalent of `FBO` in
 * `scripts/webgl/fbo.ts`. Unlike a WebGL FBO this is just the texture
 * views; the actual render pass is encoded via `GPURenderPassDescriptor`.
 */

import {GpuTexture} from './texture.js'
import {TextureUsage} from './flags.js'

export interface RenderTargetOptions {
  device: GPUDevice
  width: number
  height: number
  colorFormats: GPUTextureFormat[]
  // Undefined for no depth attachment.
  depthFormat?: GPUTextureFormat
  sampleCount?: number
  label?: string
}

export class RenderTarget {
  readonly width: number
  readonly height: number
  readonly sampleCount: number
  readonly colors: GpuTexture[]
  readonly depth: GpuTexture | undefined

  constructor(opts: RenderTargetOptions) {
    this.width = opts.width
    this.height = opts.height
    this.sampleCount = opts.sampleCount ?? 1

    this.colors = opts.colorFormats.map((format, i) =>
      new GpuTexture(opts.device, {
        label : `${opts.label ?? 'RenderTarget'}.color[${i}]`,
        width : opts.width,
        height: opts.height,
        format,
        sampleCount: this.sampleCount,
        usage : TextureUsage.RENDER_ATTACHMENT | TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_SRC,
      })
    )

    this.depth = opts.depthFormat
      ? new GpuTexture(opts.device, {
        label : `${opts.label ?? 'RenderTarget'}.depth`,
        width : opts.width,
        height: opts.height,
        format: opts.depthFormat,
        sampleCount: this.sampleCount,
        usage : TextureUsage.RENDER_ATTACHMENT | TextureUsage.TEXTURE_BINDING,
      })
      : undefined
  }

  passDescriptor(
    clearColor: GPUColor | undefined = {r: 0, g: 0, b: 0, a: 1},
    clearDepth: number | undefined = 1.0
  ): GPURenderPassDescriptor {
    return {
      colorAttachments: this.colors.map(tex => ({
        view      : tex.view,
        clearValue: clearColor,
        loadOp    : clearColor ? 'clear' : 'load',
        storeOp   : 'store',
      })),
      depthStencilAttachment: this.depth
        ? {
          view             : this.depth.view,
          depthClearValue  : clearDepth,
          depthLoadOp      : clearDepth !== undefined ? 'clear' : 'load',
          depthStoreOp     : 'store',
        }
        : undefined,
    }
  }

  // Matches the legacy `renderStage(fbo, size, drawCb)` shape on the
  // WebGL side. Wrapper handles `pass.end()`; the callback should not.
  beginPass(
    encoder: GPUCommandEncoder,
    drawCb: (pass: GPURenderPassEncoder) => void,
    opts: {clearColor?: GPUColor; clearDepth?: number; label?: string} = {}
  ): void {
    const desc = this.passDescriptor(
      'clearColor' in opts ? opts.clearColor : {r: 0, g: 0, b: 0, a: 1},
      'clearDepth' in opts ? opts.clearDepth : 1.0
    )
    if (opts.label) desc.label = opts.label
    const pass = encoder.beginRenderPass(desc)
    try {
      drawCb(pass)
    } finally {
      pass.end()
    }
  }

  destroy(): void {
    for (const c of this.colors) c.destroy()
    this.depth?.destroy()
  }
}
