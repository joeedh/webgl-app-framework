/**
 * `GpuContext` — owns the WebGPU `GPUDevice`, the canvas-backed
 * `GPUCanvasContext`, and the preferred surface formats. Mirrors the role
 * `WebGL2RenderingContext` plays in the existing `scripts/webgl/` layer.
 *
 * Phase 1 surface: device init + format introspection. Phase 4 wires the
 * context into `DrawQueue` via `WebGPUDrawQueueAdapter`.
 */

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

    const device = await adapter.requestDevice({
      requiredFeatures: opts.requiredFeatures,
      requiredLimits: opts.requiredLimits,
    })

    const canvasContext = opts.canvas.getContext('webgpu') as GPUCanvasContext | null
    if (!canvasContext) throw new Error('Failed to acquire GPUCanvasContext')

    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat()

    canvasContext.configure({
      device,
      format: surfaceFormat,
      alphaMode: 'premultiplied',
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
