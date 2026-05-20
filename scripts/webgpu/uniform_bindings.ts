/**
 * `UniformBindings` — auto-builds `GPUBindGroup`s for the uniform-buffer
 * slots a WGSL pipeline declares, writing per-draw values from the loose
 * `IUniformsBlock` that the GLSL-era render code already threads through.
 *
 * The bridge has two pieces:
 *
 *   1. `reflectPipelineBindings(wgsl)` parses every
 *      `@group(N) @binding(M) var<uniform> NAME : Struct` declaration and
 *      pairs it with the matching `struct Struct { ... }` block reflected
 *      by `wgsl_reflect.ts`. Texture/sampler bindings (`var ...
 *      texture_2d<f32>`, `var ... sampler`) are *not* handled here — they
 *      belong to the material layer and have to be set by the caller.
 *
 *   2. `UniformBindings` owns a `GpuBuffer` + cached `GPUBindGroup` per
 *      reflected (group, binding). `writeFrame(uniforms)` /
 *      `writeObject(uniforms)` apply field names from the loose
 *      `IUniformsBlock` via `UniformWriter.apply()` and upload via
 *      `device.queue.writeBuffer`. `bind(pass, pipeline, uniforms)`
 *      writes and then issues `setBindGroup` for every reflected group
 *      against `pipeline.getBindGroupLayout(group)`.
 *
 * The bind groups are cached per pipeline (keyed by GPURenderPipeline
 * identity) since `getBindGroupLayout` returns a fresh handle each call,
 * but the underlying GpuBuffers are pipeline-independent and live on
 * the `UniformBindings` instance.
 *
 * For groups whose only bindings are textures/samplers (the
 * `@group(1)` material slot in sculpt shaders, for example),
 * `reflectPipelineBindings` returns no entry — the caller still has to
 * supply that bind group via `pass.setBindGroup(1, ...)` directly.
 */

import {GpuBuffer} from './buffer.js'
import {reflectWgslStructs, UniformWriter, type WgslStruct} from '../shaders/wgsl_reflect.js'
import type {IUniformsBlock} from '../webgl/webgl.js'

/**
 * One reflected `@group(N) @binding(M) var<uniform> NAME : Struct`
 * declaration.
 */
export interface UniformBindingSlot {
  group: number
  binding: number
  varName: string
  struct: WgslStruct
}

// var<uniform> NAME : StructName ;
const UNIFORM_VAR_RE =
  /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var\s*<\s*uniform\s*>\s*(\w+)\s*:\s*(\w+)\s*;/g

const REFLECT_CACHE = new Map<string, UniformBindingSlot[]>()

/**
 * Find every uniform-buffer var declaration in `wgsl` and resolve each
 * one's struct layout. Results are cached on the WGSL source string,
 * so a `PipelineCache` hit also skips reflection.
 */
export function reflectPipelineBindings(wgsl: string): UniformBindingSlot[] {
  const hit = REFLECT_CACHE.get(wgsl)
  if (hit) return hit

  const structs = reflectWgslStructs(wgsl)
  const out: UniformBindingSlot[] = []

  UNIFORM_VAR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = UNIFORM_VAR_RE.exec(wgsl))) {
    const group = parseInt(m[1], 10)
    const binding = parseInt(m[2], 10)
    const varName = m[3]
    const structName = m[4]
    const struct = structs.get(structName)
    if (!struct) {
      throw new Error(
        `reflectPipelineBindings: var<uniform> ${varName} : ${structName} ` +
          `references a struct that wasn't found in the WGSL source.`
      )
    }
    out.push({group, binding, varName, struct})
  }

  REFLECT_CACHE.set(wgsl, out)
  return out
}

interface SlotState {
  slot: UniformBindingSlot
  writer: UniformWriter
  buffer: GpuBuffer
}

export class UniformBindings {
  readonly device: GPUDevice
  readonly slots: ReadonlyMap<number, SlotState[]> // group → slots in that group
  /** Cached `GPUBindGroup` per pipeline identity, per group. */
  private readonly bindGroupCache = new Map<GPURenderPipeline, Map<number, GPUBindGroup>>()

  constructor(device: GPUDevice, wgsl: string, label?: string) {
    this.device = device
    const reflected = reflectPipelineBindings(wgsl)
    const grouped = new Map<number, SlotState[]>()
    for (const slot of reflected) {
      const writer = new UniformWriter(slot.struct)
      const buffer = new GpuBuffer(device, {
        label: label
          ? `${label}.uniforms.g${slot.group}b${slot.binding}`
          : `uniforms.g${slot.group}b${slot.binding}`,
        size : Math.max(slot.struct.size, 16), // WGSL uniform buffer min size
        usage: 'uniform',
      })
      const arr = grouped.get(slot.group) ?? []
      arr.push({slot, writer, buffer})
      grouped.set(slot.group, arr)
    }
    this.slots = grouped
  }

  /** True if this pipeline declares no uniform buffers at all. */
  get isEmpty(): boolean {
    return this.slots.size === 0
  }

  /**
   * Apply `uniforms` to every reflected slot. Field names are looked up
   * case-sensitively against the WGSL struct's field names — keys not
   * present in the struct are silently ignored (as `UniformWriter.apply`
   * does), so a single broad `IUniformsBlock` can feed multiple
   * pipelines with different schemas.
   */
  write(uniforms: IUniformsBlock): void {
    for (const states of this.slots.values()) {
      for (const s of states) {
        s.writer.apply(uniforms as Record<string, number | ArrayLike<number>>)
        this.device.queue.writeBuffer(s.buffer.handle, 0, s.writer.buffer)
      }
    }
  }

  /**
   * Build (or fetch from the per-pipeline cache) the `GPUBindGroup` for
   * `group` against `pipeline.getBindGroupLayout(group)`. Returns
   * `undefined` if this pipeline declared no uniform bindings in that
   * group.
   */
  getBindGroup(pipeline: GPURenderPipeline, group: number): GPUBindGroup | undefined {
    const states = this.slots.get(group)
    if (!states || states.length === 0) return undefined

    let perPipeline = this.bindGroupCache.get(pipeline)
    if (!perPipeline) {
      perPipeline = new Map()
      this.bindGroupCache.set(pipeline, perPipeline)
    }
    const hit = perPipeline.get(group)
    if (hit) return hit

    const entries: GPUBindGroupEntry[] = states.map(s => ({
      binding : s.slot.binding,
      resource: {buffer: s.buffer.handle},
    }))
    const bg = this.device.createBindGroup({
      label  : `UniformBindings.g${group}`,
      layout : pipeline.getBindGroupLayout(group),
      entries,
    })
    perPipeline.set(group, bg)
    return bg
  }

  /**
   * Convenience: write `uniforms`, then call `pass.setBindGroup(g, ...)`
   * for every group that has a uniform buffer. The caller is still
   * responsible for `setPipeline`, vertex/index buffers, and any
   * material (`@group(1)`) bind group that holds textures.
   */
  bind(
    pass: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    uniforms: IUniformsBlock
  ): void {
    this.write(uniforms)
    for (const group of this.slots.keys()) {
      const bg = this.getBindGroup(pipeline, group)
      if (bg) pass.setBindGroup(group, bg)
    }
  }

  /** Release all GpuBuffers + cached bind groups. */
  destroy(): void {
    for (const states of this.slots.values()) {
      for (const s of states) s.buffer.destroy()
    }
    this.bindGroupCache.clear()
  }
}

