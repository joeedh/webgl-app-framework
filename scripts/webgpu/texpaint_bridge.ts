/**
 * `TexpaintBridge` — Phase 6 isolation shim for the texpaint tool.
 *
 * Texpaint (`scripts/editors/view3d/tools/pbvh_texpaint.ts` and
 * `pbvh_texpaint_blur.ts`) is deeply tied to WebGL2: FBO binds, raw
 * `gl.blendFunc`/`gl.scissor`/`gl.depthMask` state, `SimpleMesh.draw`
 * with custom shaders, `gl.blitFramebuffer` for the undo path. Porting
 * it to WebGPU is out of scope for the migration's first cut.
 *
 * Instead this bridge keeps texpaint on WebGL even when the rest of the
 * renderer is on WebGPU. The flow:
 *
 *   1. Texpaint draws into `texture._drawFBO` (WebGL) as always.
 *   2. `texture.swapWithFBO(gl)` rotates the result into `texture.glTex`.
 *   3. `bridge.syncFromGL(gl, texture)` reads the FBO color attachment
 *      back into a CPU staging buffer via `gl.readPixels`.
 *   4. `queue.writeTexture` uploads the staged pixels into a paired
 *      `GpuTexture` that the WGSL sculpt shaders sample from.
 *
 * The CPU round-trip is the price of the isolation. End-of-stroke (not
 * per-dot) sync is enough for the visible sculpt result; the per-dot
 * path stays GL-only.
 */

import {GpuTexture} from './texture.js'
import {TextureUsage} from './flags.js'

/** A texpaint-managed texture pair. */
export interface BridgedTexture {
  /** Logical id from the `ImageBlock` — used to look up the pair. */
  key: unknown
  width: number
  height: number
  format: GPUTextureFormat
  /** Float32 staging buffer reused across syncs. */
  staging: Float32Array
  gpu: GpuTexture
  /** The GL framebuffer to read from. Set lazily by `attachFBO`. */
  glFbo: WebGLFramebuffer | undefined
}

export class TexpaintBridge {
  readonly device: GPUDevice
  readonly queue: GPUQueue
  /** key (usually `ImageBlock` instance) → bridged pair. */
  private readonly pairs: Map<unknown, BridgedTexture> = new Map()

  constructor(device: GPUDevice, queue?: GPUQueue) {
    this.device = device
    this.queue = queue ?? device.queue
  }

  /**
   * Get-or-create the `GpuTexture` paired with a texpaint-managed
   * `ImageBlock`. Must be called once before `syncFromGL`.
   */
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

  /** Associate the GL framebuffer that texpaint writes into. */
  attachFBO(key: unknown, fbo: WebGLFramebuffer): void {
    const pair = this.pairs.get(key)
    if (!pair) {
      throw new Error('TexpaintBridge.attachFBO: call ensurePair() first.')
    }
    pair.glFbo = fbo
  }

  /**
   * Read pixels from the WebGL framebuffer and upload them into the
   * paired `GpuTexture`. Call at end-of-stroke (not per-dot) — the
   * read/upload is the dominant cost.
   *
   * Returns false if no pair is registered or the FBO isn't attached.
   */
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

  /** Look up the bridged `GpuTexture` for a key — used by sculpt shaders. */
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
