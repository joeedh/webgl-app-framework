/**
 * Owns the WebGPU `GPUDevice`, the canvas-backed `GPUCanvasContext`, and
 * the preferred surface format. WebGPU equivalent of
 * `WebGL2RenderingContext` in the `scripts/webgl/` layer.
 */

import {TextureUsage} from './flags.js'

export interface GpuContextOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas
  powerPreference?: GPUPowerPreference
  requiredFeatures?: GPUFeatureName[]
  requiredLimits?: Record<string, number>
}

export class GpuContext {
  readonly device: GPUDevice
  readonly adapter: GPUAdapter
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  readonly canvasContext: GPUCanvasContext
  readonly surfaceFormat: GPUTextureFormat

  private constructor(
    device: GPUDevice,
    adapter: GPUAdapter,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    canvasContext: GPUCanvasContext,
    surfaceFormat: GPUTextureFormat
  ) {
    this.device = device
    this.adapter = adapter
    this.canvas = canvas
    this.canvasContext = canvasContext
    this.surfaceFormat = surfaceFormat
  }

  static async create(opts: GpuContextOptions): Promise<GpuContext> {
    if (!('gpu' in navigator) || !navigator.gpu) {
      throw new Error('WebGPU not supported in this browser')
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: opts.powerPreference ?? 'high-performance',
    })
    if (!adapter) throw new Error('No WebGPU adapter available')

    // Opt into GPU pass timing when the adapter grants it (silently absent
    // otherwise) — the GPU brush HUD / perf instrumentation reads it
    // (gpuGlobalBrushes.md §9.7).
    const requiredFeatures: GPUFeatureName[] = [...(opts.requiredFeatures ?? [])]
    if (adapter.features.has('timestamp-query') && !requiredFeatures.includes('timestamp-query')) {
      requiredFeatures.push('timestamp-query')
    }
    const device = await adapter.requestDevice({
      requiredFeatures,
      requiredLimits: opts.requiredLimits,
    })

    const canvasContext = opts.canvas.getContext('webgpu') as GPUCanvasContext | null
    if (!canvasContext) throw new Error('Failed to acquire GPUCanvasContext')

    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat()

    canvasContext.configure({
      device,
      format   : surfaceFormat,
      alphaMode: 'premultiplied',
      // RENDER_ATTACHMENT is implicit; COPY_SRC lets the FBO debug editor
      // copyTextureToTexture() the canvas surface into a capture target.
      usage    : TextureUsage.RENDER_ATTACHMENT | TextureUsage.COPY_SRC,
    })

    return new GpuContext(device, adapter, opts.canvas, canvasContext, surfaceFormat)
  }

  resize(width: number, height: number): void {
    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.width = width
      this.canvas.height = height
    } else {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  destroy(): void {
    this.device.destroy()
  }
}
