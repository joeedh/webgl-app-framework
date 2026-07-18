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
import {reflectWgslStructs, UniformWriter, ArrayedStructWriter, type WgslStruct} from '../shaders/wgsl_reflect.js'
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
const RESOURCE_VAR_RE = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var\s+(\w+)\s*:\s*([^;<]+(?:<[^;]+>)?)\s*;/g

interface ReflectResult {
  uniforms: UniformBindingSlot[]
  resources: ResourceBindingSlot[]
}

const REFLECT_CACHE = new Map<string, ReflectResult>()

// True if `varName` is referenced anywhere in the WGSL beyond its own
// declaration. WebGPU's auto-generated bind-group layout (the one
// `getBindGroupLayout(group)` returns) DROPS bindings whose variable is
// never read — so if we still hand `createBindGroup` an entry for that
// binding, validation fails ("binding index N not present in the bind group
// layout"). Mirroring the strip here keeps the reflected set in lockstep with
// the layout. A var that appears exactly once (the declaration) is dead.
function isVarReferenced(wgsl: string, varName: string): boolean {
  const re = new RegExp(`\\b${varName}\\b`, 'g')
  let count = 0
  while (re.exec(wgsl)) {
    if (++count > 1) return true
  }
  return false
}

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
    // Skip dead uniforms (the auto-layout strips them; see isVarReferenced).
    if (!isVarReferenced(wgsl, varName)) continue
    uniforms.push({group, binding, varName, struct, arrayLength})
  }

  RESOURCE_VAR_RE.lastIndex = 0
  while ((m = RESOURCE_VAR_RE.exec(wgsl))) {
    const group = parseInt(m[1], 10)
    const binding = parseInt(m[2], 10)
    const varName = m[3]
    const typeStr = m[4].trim()
    const kind: ResourceBindingSlot['kind'] | undefined = typeStr.startsWith('texture')
      ? 'texture'
      : typeStr.startsWith('sampler')
        ? 'sampler'
        : undefined
    if (!kind) continue
    // Resources are likewise stripped from the layout when unused (e.g.
    // passAO_tex/_smp without WITH_AO) — drop them so we never bind a slot
    // the pipeline layout doesn't have.
    if (!isVarReferenced(wgsl, varName)) continue
    resources.push({group, binding, varName, kind})
  }

  const result = {uniforms, resources}
  REFLECT_CACHE.set(wgsl, result)
  return result
}

interface UniformSlotState {
  slot: UniformBindingSlot
  writer: UniformWriter | ArrayedStructWriter
  /** Ring of per-draw buffers (index = the instance ring cursor). Slot 0 is
   * created eagerly; later slots materialize when a frame issues multiple
   * draws through the same bindings (see `_advanceRing`). */
  buffers: GpuBuffer[]
  bufSize: number
  label: string
}

/** Frame counter for the per-draw uniform-buffer ring. `queue.writeBuffer`
 * runs before pass execution, so N same-pipeline draws in one frame sharing
 * ONE buffer all read the LAST write (every light/widget rendered at one
 * matrix). Each frame bump resets the ring; within a frame every
 * write+bind pair takes a fresh buffer. */
let uniformFrameEpoch = 0
export function nextUniformFrameEpoch(): void {
  uniformFrameEpoch++
}

/** Ring wrap guard — past this many same-bindings draws in one frame the ring
 * reuses slot 0 (clobber returns, but bounded memory). */
const UNIFORM_RING_MAX = 256

interface GroupState {
  group: number
  uniforms: UniformSlotState[]
  resources: ResourceBindingSlot[]
}

export class UniformBindings {
  readonly device: GPUDevice
  readonly groups: ReadonlyMap<number, GroupState>
  /** Uniform-only bind groups cached per pipeline, keyed `${group}:${ring}`. */
  private readonly bindGroupCache = new Map<GPURenderPipeline, Map<string, GPUBindGroup>>()
  private readonly emptyCache = new Map<GPURenderPipeline, Map<number, GPUBindGroup>>()
  /** Per-draw buffer-ring cursor (see nextUniformFrameEpoch). */
  private ring = 0
  private ringEpoch = -1

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
      const bufLabel = label
        ? `${label}.uniforms.g${slot.group}b${slot.binding}`
        : `uniforms.g${slot.group}b${slot.binding}`
      const size = Math.max(bufSize, 16) // WGSL uniform buffer min size
      const buffer = new GpuBuffer(device, {label: bufLabel, size, usage: 'uniform'})
      getGroup(slot.group).uniforms.push({slot, writer, buffers: [buffer], bufSize: size, label: bufLabel})
    }

    for (const slot of reflected.resources) {
      getGroup(slot.group).resources.push(slot)
    }

    this.groups = grouped
  }

  get isEmpty(): boolean {
    return this.groups.size === 0
  }

  /** The current ring slot's buffer for a uniform slot, created on demand. */
  private ringBuffer(s: UniformSlotState): GpuBuffer {
    let buf = s.buffers[this.ring]
    if (!buf) {
      buf = new GpuBuffer(this.device, {label: `${s.label}#${this.ring}`, size: s.bufSize, usage: 'uniform'})
      s.buffers[this.ring] = buf
    }
    return buf
  }

  /** Step the per-draw buffer ring: reset on a new frame epoch, advance
   * within a frame so every write+bind pair lands in its own buffer
   * (queue.writeBuffer runs before pass execution — a shared buffer would
   * make every same-pipeline draw read the frame's LAST write). */
  private _advanceRing(): void {
    if (this.ringEpoch !== uniformFrameEpoch) {
      this.ringEpoch = uniformFrameEpoch
      this.ring = 0
    } else {
      this.ring = (this.ring + 1) % UNIFORM_RING_MAX
    }
  }

  // Field names not present in the struct are silently ignored (per
  // `UniformWriter.apply`), so a single broad `IUniformsBlock` can feed
  // multiple pipelines with different schemas.
  write(uniforms: IUniformsBlock): void {
    for (const gs of this.groups.values()) {
      for (const s of gs.uniforms) {
        s.writer.apply(uniforms as Record<string, number | ArrayLike<number>>)
        this.device.queue.writeBuffer(this.ringBuffer(s).handle, 0, s.writer.buffer)
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
      entries.push({binding: s.slot.binding, resource: {buffer: this.ringBuffer(s).handle}})
    }
    for (const r of gs.resources) {
      const val = (uniforms as Record<string, unknown>)[r.varName]
      if (val === undefined || val === null) {
        // Layer may have dropped this slot when its var is unused in WGSL.
        // Skip — `createBindGroup` will throw if the layout actually
        // demands it, surfacing the missing seed loudly.
        continue
      }
      const resource = r.kind === 'sampler' ? (val as GPUSampler) : (val as GPUTextureView)
      entries.push({binding: r.binding, resource})
    }
    if (entries.length === 0) return undefined
    return this.device.createBindGroup({
      label : `UniformBindings.g${gs.group}`,
      layout: pipeline.getBindGroupLayout(gs.group),
      entries,
    })
  }

  getBindGroup(pipeline: GPURenderPipeline, group: number, uniforms?: IUniformsBlock): GPUBindGroup | undefined {
    const gs = this.groups.get(group)
    if (!gs) return undefined

    // Pure-uniform groups can be cached per-pipeline (keyed with the ring
    // slot — each ring buffer identity is stable). Groups with resource slots
    // cannot be cached: GPUTextureView identity changes (ring-buffer rotation,
    // target resizing) and cached entries would point at freed views.
    if (gs.resources.length === 0) {
      let perPipeline = this.bindGroupCache.get(pipeline)
      if (!perPipeline) {
        perPipeline = new Map()
        this.bindGroupCache.set(pipeline, perPipeline)
      }
      const key = `${group}:${this.ring}`
      const hit = perPipeline.get(key)
      if (hit) return hit
      const bg = this.buildBindGroup(pipeline, gs, uniforms ?? ({} as IUniformsBlock))
      if (bg) perPipeline.set(key, bg)
      return bg
    }

    return this.buildBindGroup(pipeline, gs, uniforms ?? ({} as IUniformsBlock))
  }

  /** Highest group index the shader actually uses (−1 if none). */
  get maxGroup(): number {
    let m = -1
    for (const g of this.groups.keys()) if (g > m) m = g
    return m
  }

  // A shader that uses e.g. @group(0) + @group(2) (skipping @group(1)) still
  // gets a CONTIGUOUS auto-layout (groups 0,1,2) where the gap is an empty
  // bind-group layout — and WebGPU requires every slot 0..max to be set before
  // a draw. Provide a cached empty bind group for those gap indices; some Dawn
  // backends (notably the software/fallback adapter) enforce this strictly while
  // others tolerated the gap.
  private emptyBindGroup(pipeline: GPURenderPipeline, group: number): GPUBindGroup {
    let perPipeline = this.emptyCache.get(pipeline)
    if (!perPipeline) {
      perPipeline = new Map()
      this.emptyCache.set(pipeline, perPipeline)
    }
    let bg = perPipeline.get(group)
    if (!bg) {
      bg = this.device.createBindGroup({
        label  : `UniformBindings.empty.g${group}`,
        layout : pipeline.getBindGroupLayout(group),
        entries: [],
      })
      perPipeline.set(group, bg)
    }
    return bg
  }

  /**
   * Bind groups for a draw: this shader's real groups plus empty fillers for any
   * gap indices it skips. Returns `{group, bindGroup}` for every slot 0..max so
   * the caller sets a contiguous range (see `bind` and litemesh's drawQGPU).
   */
  bindGroupList(pipeline: GPURenderPipeline, uniforms: IUniformsBlock): {group: number; bindGroup: GPUBindGroup}[] {
    this._advanceRing()
    this.write(uniforms)
    const out: {group: number; bindGroup: GPUBindGroup}[] = []
    const max = this.maxGroup
    for (let group = 0; group <= max; group++) {
      if (this.groups.has(group)) {
        const bg = this.getBindGroup(pipeline, group, uniforms)
        if (bg) out.push({group, bindGroup: bg})
      } else {
        out.push({group, bindGroup: this.emptyBindGroup(pipeline, group)})
      }
    }
    return out
  }

  // Caller still owns `setPipeline`, vertex/index buffers, and any
  // material (`@group(1)`) bind group that holds textures.
  bind(pass: GPURenderPassEncoder, pipeline: GPURenderPipeline, uniforms: IUniformsBlock): void {
    for (const {group, bindGroup} of this.bindGroupList(pipeline, uniforms)) {
      pass.setBindGroup(group, bindGroup)
    }
  }

  destroy(): void {
    for (const gs of this.groups.values()) {
      for (const s of gs.uniforms) {
        for (const buf of s.buffers) {
          buf?.destroy()
        }
      }
    }
    this.bindGroupCache.clear()
    this.emptyCache.clear()
  }
}
