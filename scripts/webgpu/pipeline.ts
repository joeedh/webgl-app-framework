/**
 * `Pipeline` + `PipelineCache` — immutable render pipeline objects keyed
 * by (wgsl-hash, vertex-layout, target-format, blend-state, primitive
 * topology). Replaces the role `ShaderProgram` plays in
 * `scripts/webgl/webgl.ts:442-1150` with the major mental shift that
 * state which varies per-draw goes into a separate pipeline variant.
 *
 * Phase 1 surface — Phase 2 fills in WGSL reflection / uniform layout,
 * Phase 4 wires this into `WebGPUDrawQueueAdapter`.
 */

export interface PipelineDescriptor {
  label?: string
  wgsl: string
  vertexEntry?: string
  fragmentEntry?: string
  vertexBuffers: GPUVertexBufferLayout[]
  colorTargets: GPUColorTargetState[]
  depthStencil?: GPUDepthStencilState
  primitive?: GPUPrimitiveState
  multisample?: GPUMultisampleState
  bindGroupLayouts?: GPUBindGroupLayout[]
}

export class Pipeline {
  readonly handle: GPURenderPipeline
  readonly module: GPUShaderModule
  readonly descriptor: PipelineDescriptor
  readonly cacheKey: string

  constructor(device: GPUDevice, desc: PipelineDescriptor, cacheKey: string) {
    this.descriptor = desc
    this.cacheKey = cacheKey

    this.module = device.createShaderModule({
      label: desc.label ? `${desc.label}.module` : undefined,
      code : desc.wgsl,
    })

    const layout: GPUPipelineLayout | 'auto' = desc.bindGroupLayouts
      ? device.createPipelineLayout({
        label             : desc.label ? `${desc.label}.layout` : undefined,
        bindGroupLayouts  : desc.bindGroupLayouts,
      })
      : 'auto'

    this.handle = device.createRenderPipeline({
      label : desc.label,
      layout,
      vertex: {
        module     : this.module,
        entryPoint : desc.vertexEntry ?? 'vs_main',
        buffers    : desc.vertexBuffers,
      },
      fragment: {
        module     : this.module,
        entryPoint : desc.fragmentEntry ?? 'fs_main',
        targets    : desc.colorTargets,
      },
      depthStencil: desc.depthStencil,
      primitive   : desc.primitive ?? {topology: 'triangle-list'},
      multisample : desc.multisample,
    })
  }
}

/**
 * Cheap structural hash of a `PipelineDescriptor`. Stable enough to use as
 * a `Map` key — WGSL source contributes to the key, so a `#define`
 * variant produces a distinct entry. (Phase 2 preprocessor expands defines
 * upstream of this point.)
 */
function hashDescriptor(desc: PipelineDescriptor): string {
  const parts = [
    desc.wgsl,
    desc.vertexEntry ?? 'vs_main',
    desc.fragmentEntry ?? 'fs_main',
    JSON.stringify(desc.vertexBuffers),
    JSON.stringify(desc.colorTargets),
    JSON.stringify(desc.depthStencil ?? null),
    JSON.stringify(desc.primitive ?? null),
    JSON.stringify(desc.multisample ?? null),
  ]
  return parts.join('|')
}

export class PipelineCache {
  private readonly device: GPUDevice
  private readonly entries = new Map<string, Pipeline>()

  constructor(device: GPUDevice) {
    this.device = device
  }

  get(desc: PipelineDescriptor): Pipeline {
    const key = hashDescriptor(desc)
    let pipeline = this.entries.get(key)
    if (!pipeline) {
      pipeline = new Pipeline(this.device, desc, key)
      this.entries.set(key, pipeline)
    }
    return pipeline
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
