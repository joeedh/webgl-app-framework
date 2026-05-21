/**
 * Bridges the loose `IUniformsBlock` from the GLSL-era render code to
 * WGSL uniform-buffer bind groups. Texture/sampler bindings are *not*
 * handled here — the caller still has to supply `@group(1)` (material)
 * separately. Bind groups are cached per `GPURenderPipeline` identity
 * because `getBindGroupLayout` returns a fresh handle every call; the
 * GpuBuffers underneath are pipeline-independent.
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

// var<uniform> NAME : Type ;  where Type is either `StructName` or `array<StructName, N>`.
const UNIFORM_VAR_RE =
  /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var\s*<\s*uniform\s*>\s*(\w+)\s*:\s*([^;]+?)\s*;/g
const ARRAY_TYPE_RE = /^array<\s*(\w+)\s*,\s*(\d+)\s*>$/

const REFLECT_CACHE = new Map<string, UniformBindingSlot[]>()

// Cached on the WGSL source string so a `PipelineCache` hit also skips reflection.
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
    out.push({group, binding, varName, struct, arrayLength})
  }

  REFLECT_CACHE.set(wgsl, out)
  return out
}

interface SlotState {
  slot: UniformBindingSlot
  writer: UniformWriter | ArrayedStructWriter
  buffer: GpuBuffer
}

export class UniformBindings {
  readonly device: GPUDevice
  readonly slots: ReadonlyMap<number, SlotState[]> // group → slots in that group
  private readonly bindGroupCache = new Map<GPURenderPipeline, Map<number, GPUBindGroup>>()

  constructor(device: GPUDevice, wgsl: string, label?: string) {
    this.device = device
    const reflected = reflectPipelineBindings(wgsl)
    const grouped = new Map<number, SlotState[]>()
    for (const slot of reflected) {
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
      const arr = grouped.get(slot.group) ?? []
      arr.push({slot, writer, buffer})
      grouped.set(slot.group, arr)
    }
    this.slots = grouped
  }

  get isEmpty(): boolean {
    return this.slots.size === 0
  }

  // Field names not present in the struct are silently ignored (per
  // `UniformWriter.apply`), so a single broad `IUniformsBlock` can feed
  // multiple pipelines with different schemas.
  write(uniforms: IUniformsBlock): void {
    for (const states of this.slots.values()) {
      for (const s of states) {
        s.writer.apply(uniforms as Record<string, number | ArrayLike<number>>)
        this.device.queue.writeBuffer(s.buffer.handle, 0, s.writer.buffer)
      }
    }
  }

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

  // Caller still owns `setPipeline`, vertex/index buffers, and any
  // material (`@group(1)`) bind group that holds textures.
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

  destroy(): void {
    for (const states of this.slots.values()) {
      for (const s of states) s.buffer.destroy()
    }
    this.bindGroupCache.clear()
  }
}

