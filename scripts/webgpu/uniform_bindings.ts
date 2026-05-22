/**
 * Bridges the loose `IUniformsBlock` from the GLSL-era render code to
 * WGSL uniform-buffer bind groups. Also reflects plain
 * `var NAME : texture_2d<f32>` / `var NAME : sampler` declarations at
 * the same `@group/@binding` slots so the engine can stick a
 * GPUTextureView / GPUSampler into the `uniforms` map under `NAME` and
 * have it land on the right binding (e.g. `passAO_tex`, `passAO_smp`).
 *
 * Bind groups are cached per `GPURenderPipeline` identity because
 * `getBindGroupLayout` returns a fresh handle every call; the
 * GpuBuffers underneath are pipeline-independent. Groups that contain
 * resource slots (texture/sampler) skip the cache and rebuild every
 * `bind()` call — GPUTextureView identity isn't stable across frames
 * (ring-buffered render targets), and the cost is one bind-group
 * creation per pass per frame.
 */

import {GpuBuffer} from './buffer.js'
import {
  reflectWgslStructs,
  UniformWriter,
  ArrayedStructWriter,
  type WgslStruct,
} from '../shaders/wgsl_reflect.js'
import type {IUniformsBlock} from '../webgl/webgl.js'

export interface UniformBindingSlot {
  group: number
  binding: number
  varName: string
  struct: WgslStruct
  /** For `var<uniform> X : array<Struct, N>` bindings. */
  arrayLength?: number
}

export interface ResourceBindingSlot {
  group: number
  binding: number
  varName: string
  kind: 'texture' | 'sampler'
}

// var<uniform> NAME : Type ;  where Type is either `StructName` or `array<StructName, N>`.
const UNIFORM_VAR_RE =
  /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var\s*<\s*uniform\s*>\s*(\w+)\s*:\s*([^;]+?)\s*;/g
const ARRAY_TYPE_RE = /^array<\s*(\w+)\s*,\s*(\d+)\s*>$/

// Plain resource bindings: `var NAME : Type ;` (no `<uniform>` qualifier).
// Matches texture_2d<f32>, texture_depth_2d, sampler, sampler_comparison etc.
const RESOURCE_VAR_RE =
  /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var\s+(\w+)\s*:\s*([^;<]+(?:<[^;]+>)?)\s*;/g

interface ReflectResult {
  uniforms: UniformBindingSlot[]
  resources: ResourceBindingSlot[]
}

const REFLECT_CACHE = new Map<string, ReflectResult>()

// Cached on the WGSL source string so a `PipelineCache` hit also skips reflection.
export function reflectPipelineBindings(wgsl: string): ReflectResult {
  const hit = REFLECT_CACHE.get(wgsl)
  if (hit) return hit

  const structs = reflectWgslStructs(wgsl)
  const uniforms: UniformBindingSlot[] = []
  const resources: ResourceBindingSlot[] = []

  UNIFORM_VAR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = UNIFORM_VAR_RE.exec(wgsl))) {
    const group = parseInt(m[1], 10)
    const binding = parseInt(m[2], 10)
    const varName = m[3]
    const typeStr = m[4].trim()

    let structName = typeStr
    let arrayLength: number | undefined
    const arr = ARRAY_TYPE_RE.exec(typeStr)
    if (arr) {
      structName = arr[1]
      arrayLength = parseInt(arr[2], 10)
    }

    const struct = structs.get(structName)
    if (!struct) {
      // Plain scalar/vector uniform bindings (e.g. `var<uniform> u: f32;`)
      // aren't supported by this reflector — skip rather than crash.
      continue
    }
    uniforms.push({group, binding, varName, struct, arrayLength})
  }

  RESOURCE_VAR_RE.lastIndex = 0
  while ((m = RESOURCE_VAR_RE.exec(wgsl))) {
    const group = parseInt(m[1], 10)
    const binding = parseInt(m[2], 10)
    const varName = m[3]
    const typeStr = m[4].trim()
    const kind: ResourceBindingSlot['kind'] | undefined =
      typeStr.startsWith('texture') ? 'texture'
      : typeStr.startsWith('sampler') ? 'sampler'
      : undefined
    if (!kind) continue
    resources.push({group, binding, varName, kind})
  }

  const result = {uniforms, resources}
  REFLECT_CACHE.set(wgsl, result)
  return result
}

interface UniformSlotState {
  slot: UniformBindingSlot
  writer: UniformWriter | ArrayedStructWriter
  buffer: GpuBuffer
}

interface GroupState {
  group: number
  uniforms: UniformSlotState[]
  resources: ResourceBindingSlot[]
}

export class UniformBindings {
  readonly device: GPUDevice
  readonly groups: ReadonlyMap<number, GroupState>
  private readonly bindGroupCache = new Map<GPURenderPipeline, Map<number, GPUBindGroup>>()

  constructor(device: GPUDevice, wgsl: string, label?: string) {
    this.device = device
    const reflected = reflectPipelineBindings(wgsl)
    const grouped = new Map<number, GroupState>()

    const getGroup = (g: number): GroupState => {
      let gs = grouped.get(g)
      if (!gs) {
        gs = {group: g, uniforms: [], resources: []}
        grouped.set(g, gs)
      }
      return gs
    }

    for (const slot of reflected.uniforms) {
      let writer: UniformWriter | ArrayedStructWriter
      let bufSize: number
      if (slot.arrayLength !== undefined) {
        const w = new ArrayedStructWriter(slot.struct, slot.varName, slot.arrayLength)
        writer = w
        bufSize = w.buffer.byteLength
      } else {
        writer = new UniformWriter(slot.struct)
        bufSize = Math.max(slot.struct.size, 16)
      }
      const buffer = new GpuBuffer(device, {
        label: label
          ? `${label}.uniforms.g${slot.group}b${slot.binding}`
          : `uniforms.g${slot.group}b${slot.binding}`,
        size : Math.max(bufSize, 16), // WGSL uniform buffer min size
        usage: 'uniform',
      })
      getGroup(slot.group).uniforms.push({slot, writer, buffer})
    }

    for (const slot of reflected.resources) {
      getGroup(slot.group).resources.push(slot)
    }

    this.groups = grouped
  }

  get isEmpty(): boolean {
    return this.groups.size === 0
  }

  // Field names not present in the struct are silently ignored (per
  // `UniformWriter.apply`), so a single broad `IUniformsBlock` can feed
  // multiple pipelines with different schemas.
  write(uniforms: IUniformsBlock): void {
    for (const gs of this.groups.values()) {
      for (const s of gs.uniforms) {
        s.writer.apply(uniforms as Record<string, number | ArrayLike<number>>)
        this.device.queue.writeBuffer(s.buffer.handle, 0, s.writer.buffer)
      }
    }
  }

  private buildBindGroup(
    pipeline: GPURenderPipeline,
    gs: GroupState,
    uniforms: IUniformsBlock
  ): GPUBindGroup | undefined {
    const entries: GPUBindGroupEntry[] = []
    for (const s of gs.uniforms) {
      entries.push({binding: s.slot.binding, resource: {buffer: s.buffer.handle}})
    }
    for (const r of gs.resources) {
      const val = (uniforms as Record<string, unknown>)[r.varName]
      if (val === undefined || val === null) {
        // Layer may have dropped this slot when its var is unused in WGSL.
        // Skip — `createBindGroup` will throw if the layout actually
        // demands it, surfacing the missing seed loudly.
        continue
      }
      const resource = r.kind === 'sampler'
        ? (val as GPUSampler)
        : (val as GPUTextureView)
      entries.push({binding: r.binding, resource})
    }
    if (entries.length === 0) return undefined
    return this.device.createBindGroup({
      label  : `UniformBindings.g${gs.group}`,
      layout : pipeline.getBindGroupLayout(gs.group),
      entries,
    })
  }

  getBindGroup(
    pipeline: GPURenderPipeline,
    group: number,
    uniforms?: IUniformsBlock
  ): GPUBindGroup | undefined {
    const gs = this.groups.get(group)
    if (!gs) return undefined

    // Pure-uniform groups can be cached per-pipeline — the underlying
    // GpuBuffers are stable. Groups with resource slots cannot be cached:
    // GPUTextureView identity changes (ring-buffer rotation, target
    // resizing) and cached entries would point at freed views.
    if (gs.resources.length === 0) {
      let perPipeline = this.bindGroupCache.get(pipeline)
      if (!perPipeline) {
        perPipeline = new Map()
        this.bindGroupCache.set(pipeline, perPipeline)
      }
      const hit = perPipeline.get(group)
      if (hit) return hit
      const bg = this.buildBindGroup(pipeline, gs, uniforms ?? ({} as IUniformsBlock))
      if (bg) perPipeline.set(group, bg)
      return bg
    }

    return this.buildBindGroup(pipeline, gs, uniforms ?? ({} as IUniformsBlock))
  }

  // Caller still owns `setPipeline`, vertex/index buffers, and any
  // material (`@group(1)`) bind group that holds textures.
  bind(
    pass: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    uniforms: IUniformsBlock
  ): void {
    this.write(uniforms)
    for (const group of this.groups.keys()) {
      const bg = this.getBindGroup(pipeline, group, uniforms)
      if (bg) pass.setBindGroup(group, bg)
    }
  }

  destroy(): void {
    for (const gs of this.groups.values()) {
      for (const s of gs.uniforms) s.buffer.destroy()
    }
    this.bindGroupCache.clear()
  }
}
