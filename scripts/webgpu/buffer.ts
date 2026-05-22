/**
 * Thin wrapper over `GPUBuffer`. WebGPU equivalent of `VBO` in
 * `scripts/webgl/webgl.ts:1155-1281`, with explicit usage flags instead
 * of inferring `gl.ARRAY_BUFFER` vs `gl.ELEMENT_ARRAY_BUFFER` from call
 * site.
 */

import {BufferUsage} from './flags.js'

export type GpuBufferUsage =
  | 'vertex'
  | 'index'
  | 'uniform'
  | 'storage'
  | 'indirect'

const usageFlags: Record<GpuBufferUsage, number> = {
  vertex   : BufferUsage.VERTEX,
  index    : BufferUsage.INDEX,
  uniform  : BufferUsage.UNIFORM,
  storage  : BufferUsage.STORAGE,
  indirect : BufferUsage.INDIRECT,
}

export interface GpuBufferOptions {
  label?: string
  size: number
  usage: GpuBufferUsage | GpuBufferUsage[]
  /** When true, buffer can be written from CPU via `device.queue.writeBuffer`. */
  cpuWritable?: boolean
  mappedAtCreation?: boolean
}

export class GpuBuffer {
  readonly handle: GPUBuffer
  readonly size: number
  readonly usage: number
  private readonly device: GPUDevice
  private destroyed = false

  constructor(device: GPUDevice, opts: GpuBufferOptions) {
    this.device = device
    this.size = opts.size

    const usages = Array.isArray(opts.usage) ? opts.usage : [opts.usage]
    let flags = usages.reduce((acc, u) => acc | usageFlags[u], 0)
    if (opts.cpuWritable !== false) flags |= BufferUsage.COPY_DST

    this.usage = flags

    this.handle = device.createBuffer({
      label: opts.label,
      size : opts.size,
      usage: flags,
      mappedAtCreation: opts.mappedAtCreation ?? false,
    })
  }

  write(data: BufferSource, byteOffset = 0): void {
    if (this.destroyed) throw new Error('write to destroyed buffer')
    this.device.queue.writeBuffer(this.handle, byteOffset, data)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.handle.destroy()
  }
}
