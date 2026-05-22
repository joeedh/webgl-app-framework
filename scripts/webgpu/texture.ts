/**
 * Wraps `GPUTexture` + a default `GPUTextureView` + a default `GPUSampler`.
 * WebGPU equivalent of `Texture` in `scripts/webgl/webgl.ts:1339-1593`.
 */

import {TextureUsage} from './flags.js'

export interface GpuTextureOptions {
  label?: string
  width: number
  height: number
  depth?: number
  format: GPUTextureFormat
  usage?: number
  sampleCount?: number
  mipLevelCount?: number
  dimension?: GPUTextureDimension
}

export interface GpuSamplerOptions {
  magFilter?: GPUFilterMode
  minFilter?: GPUFilterMode
  mipmapFilter?: GPUMipmapFilterMode
  addressModeU?: GPUAddressMode
  addressModeV?: GPUAddressMode
  addressModeW?: GPUAddressMode
  compare?: GPUCompareFunction
  maxAnisotropy?: number
}

export class GpuTexture {
  readonly handle: GPUTexture
  readonly format: GPUTextureFormat
  readonly width: number
  readonly height: number
  readonly depth: number
  private _view: GPUTextureView | undefined
  private destroyed = false

  constructor(device: GPUDevice, opts: GpuTextureOptions) {
    this.format = opts.format
    this.width = opts.width
    this.height = opts.height
    this.depth = opts.depth ?? 1

    const usage =
      opts.usage ??
      TextureUsage.TEXTURE_BINDING |
      TextureUsage.COPY_DST |
      TextureUsage.RENDER_ATTACHMENT

    this.handle = device.createTexture({
      label: opts.label,
      size : {width: opts.width, height: opts.height, depthOrArrayLayers: this.depth},
      format       : opts.format,
      usage,
      sampleCount  : opts.sampleCount ?? 1,
      mipLevelCount: opts.mipLevelCount ?? 1,
      dimension    : opts.dimension ?? '2d',
    })
  }

  get view(): GPUTextureView {
    if (!this._view) this._view = this.handle.createView()
    return this._view
  }

  createView(desc?: GPUTextureViewDescriptor): GPUTextureView {
    return this.handle.createView(desc)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.handle.destroy()
  }
}

export function createSampler(device: GPUDevice, opts: GpuSamplerOptions = {}): GPUSampler {
  return device.createSampler({
    magFilter     : opts.magFilter ?? 'linear',
    minFilter     : opts.minFilter ?? 'linear',
    mipmapFilter  : opts.mipmapFilter ?? 'linear',
    addressModeU  : opts.addressModeU ?? 'clamp-to-edge',
    addressModeV  : opts.addressModeV ?? 'clamp-to-edge',
    addressModeW  : opts.addressModeW ?? 'clamp-to-edge',
    compare       : opts.compare,
    maxAnisotropy : opts.maxAnisotropy,
  })
}
