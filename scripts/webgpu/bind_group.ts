/**
 * Bind-group conventions used across the WebGPU layer.
 *
 *   `@group(0)` per-frame   — view/projection matrices, time, viewport size.
 *   `@group(1)` per-material — textures, samplers, material params.
 *   `@group(2)` per-object  — model matrix, object id.
 *
 * `DrawQueue.submit()` (Phase 4 adapter) accepts the three groups as
 * separate fields so callers can rebind them at different cadences.
 *
 * Phase 1 surface — Phase 4 fills in the queue adapter that consumes
 * these.
 */

export const BindGroupSlot = {
  FRAME   : 0 as const,
  MATERIAL: 1 as const,
  OBJECT  : 2 as const,
}

export interface BindGroupEntry {
  binding: number
  resource: GPUBindingResource
}

export class BindGroupBuilder {
  private entries: BindGroupEntry[] = []
  private readonly device: GPUDevice
  private readonly layout: GPUBindGroupLayout
  private readonly label: string | undefined

  constructor(device: GPUDevice, layout: GPUBindGroupLayout, label?: string) {
    this.device = device
    this.layout = layout
    this.label = label
  }

  buffer(binding: number, buffer: GPUBuffer, offset = 0, size?: number): this {
    this.entries.push({binding, resource: {buffer, offset, size}})
    return this
  }

  texture(binding: number, view: GPUTextureView): this {
    this.entries.push({binding, resource: view})
    return this
  }

  sampler(binding: number, sampler: GPUSampler): this {
    this.entries.push({binding, resource: sampler})
    return this
  }

  build(): GPUBindGroup {
    return this.device.createBindGroup({
      label  : this.label,
      layout : this.layout,
      entries: this.entries,
    })
  }
}
