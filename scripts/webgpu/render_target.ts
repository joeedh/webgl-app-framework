/**
 * `RenderTarget` — color + depth `GPUTextureView` bundle. Replaces the
 * role `FBO` plays in `scripts/webgl/fbo.ts`.
 *
 * Unlike a WebGL FBO, a WebGPU render target is **just a bundle of texture
 * views**; the actual render pass is encoded in `GPURenderPassEncoder` via
 * a `GPURenderPassDescriptor` (see Phase 5 for `RenderPass.exec()` swap).
 *
 * Phase 1 surface — Phase 5 builds this into the render pass graph.
 */

import {GpuTexture} from './texture.js'
import {TextureUsage} from './flags.js'

export interface RenderTargetOptions {
  device: GPUDevice
  width: number
  height: number
  /** One or more color attachment formats. */
  colorFormats: GPUTextureFormat[]
  /** Depth attachment format, or undefined for no depth. */
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

  /**
   * Build a `GPURenderPassDescriptor` for `commandEncoder.beginRenderPass()`.
   * Phase 5 uses this from `RenderPass.exec()`.
   */
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

  destroy(): void {
    for (const c of this.colors) c.destroy()
    this.depth?.destroy()
  }
}
