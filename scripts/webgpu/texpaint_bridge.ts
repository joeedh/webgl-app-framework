/**
 * Isolation shim that keeps the texpaint tool on WebGL2 even when the
 * rest of the renderer is on WebGPU. Texpaint
 * (`scripts/editors/view3d/tools/pbvh_texpaint.ts`,
 * `pbvh_texpaint_blur.ts`) leans hard on raw GL state and FBO ops, so
 * porting it is out of scope for the migration's first cut.
 *
 * Flow per stroke:
 *   1. texpaint draws into `texture._drawFBO` (WebGL) as always
 *   2. `texture.swapWithFBO(gl)` rotates the result into `texture.glTex`
 *   3. `syncFromGL` `gl.readPixels` → CPU staging buffer
 *   4. `queue.writeTexture` uploads into the paired `GpuTexture` the
 *      WGSL sculpt shaders sample from
 *
 * End-of-stroke (not per-dot) sync is enough for the visible sculpt
 * result; the per-dot path stays GL-only because the CPU round-trip
 * is the dominant cost.
 */

import {GpuTexture} from './texture.js'
import {TextureUsage} from './flags.js'

export interface BridgedTexture {
  // Logical id from the `ImageBlock`.
  key: unknown
  width: number
  height: number
  format: GPUTextureFormat
  // Reused across syncs.
  staging: Float32Array
  gpu: GpuTexture
  // Set lazily by `attachFBO`.
  glFbo: WebGLFramebuffer | undefined
}

export class TexpaintBridge {
  readonly device: GPUDevice
  readonly queue: GPUQueue
  private readonly pairs: Map<unknown, BridgedTexture> = new Map()

  constructor(device: GPUDevice, queue?: GPUQueue) {
    this.device = device
    this.queue = queue ?? device.queue
  }

  // Must be called once before `syncFromGL` / `attachFBO`.
  ensurePair(
    key: unknown,
    width: number,
    height: number,
    format: GPUTextureFormat = 'rgba32float'
  ): BridgedTexture {
    let pair = this.pairs.get(key)
    if (pair && pair.width === width && pair.height === height && pair.format === format) {
      return pair
    }
    pair?.gpu.destroy()
    const gpu = new GpuTexture(this.device, {
      label : 'TexpaintBridge.gpu',
      width,
      height,
      format,
      usage : TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST,
    })
    pair = {
      key,
      width,
      height,
      format,
      staging: new Float32Array(width * height * 4),
      gpu,
      glFbo: undefined,
    }
    this.pairs.set(key, pair)
    return pair
  }

  attachFBO(key: unknown, fbo: WebGLFramebuffer): void {
    const pair = this.pairs.get(key)
    if (!pair) {
      throw new Error('TexpaintBridge.attachFBO: call ensurePair() first.')
    }
    pair.glFbo = fbo
  }

  // Returns false if no pair is registered or the FBO isn't attached.
  syncFromGL(gl: WebGL2RenderingContext, key: unknown): boolean {
    const pair = this.pairs.get(key)
    if (!pair || !pair.glFbo) return false

    const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pair.glFbo)
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    gl.readPixels(0, 0, pair.width, pair.height, gl.RGBA, gl.FLOAT, pair.staging)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev)

    this.queue.writeTexture(
      {texture: pair.gpu.handle},
      pair.staging,
      {bytesPerRow: pair.width * 16, rowsPerImage: pair.height},
      {width: pair.width, height: pair.height, depthOrArrayLayers: 1}
    )
    return true
  }

  getGpuTexture(key: unknown): GpuTexture | undefined {
    return this.pairs.get(key)?.gpu
  }

  releasePair(key: unknown): void {
    const pair = this.pairs.get(key)
    if (!pair) return
    pair.gpu.destroy()
    this.pairs.delete(key)
  }

  destroy(): void {
    for (const pair of this.pairs.values()) pair.gpu.destroy()
    this.pairs.clear()
  }
}
