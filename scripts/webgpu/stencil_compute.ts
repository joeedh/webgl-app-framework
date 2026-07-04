/**
 * TS-device stencil amplification (displacementAndSubSurf plan, X3 stage 1):
 * the chained per-level CSR SpMV that evaluates coarse multires positions up
 * to a finer render level, re-dispatched on the renderer's WebGPU device (S5
 * built the same pass on the native wgpu device; the app draws here, so the
 * amplified buffers must live here — the gpuBrushes model).
 *
 * The kernel is a verbatim port of `kSpmvWgsl` (sculptcore
 * source/webgpu/wgpu_stencil.cc), shipped as a hand-written constant like the
 * spatial shaders in litemesh_wgsl.ts. THE BIT-CONSISTENCY CONTRACT LIVES
 * HERE: CSR rows are uploaded verbatim (entries ascending by source id) and
 * every accumulation is an explicit `fma` — matching `StencilTable::eval`'s
 * std::fma chain with single IEEE rounding. Plain mul+add is
 * driver-contractable and drifts (S5 measured maxUlp 184); do not "simplify"
 * the arithmetic. The stage-1 gate compares readback against the
 * CPU-materialized level bit-for-bit.
 */

import {BufferUsage, MapMode} from './flags'

/** Verbatim port of kSpmvWgsl (wgpu_stencil.cc) — keep in sync by hand. */
export const STENCIL_SPMV_WGSL = `
struct Params { fineCount : u32, wgCountX : u32, pad1 : u32, pad2 : u32 }
@group(0) @binding(0) var<storage, read> offsets : array<u32>;
@group(0) @binding(1) var<storage, read> indices : array<u32>;
@group(0) @binding(2) var<storage, read> weights : array<f32>;
@group(0) @binding(3) var<storage, read> src : array<f32>;
@group(0) @binding(4) var<storage, read_write> dst : array<f32>;
@group(0) @binding(5) var<uniform> params : Params;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg : vec3<u32>,
        @builtin(local_invocation_id) lid : vec3<u32>) {
  // 2D-linearized dispatch: workgroup counts per dimension cap at 65535,
  // which a >4M-vert level exceeds in x alone.
  let i = (wg.y * params.wgCountX + wg.x) * 64u + lid.x;
  if (i >= params.fineCount) {
    return;
  }
  var px = 0.0;
  var py = 0.0;
  var pz = 0.0;
  let e = offsets[i + 1u];
  for (var k = offsets[i]; k < e; k = k + 1u) {
    let s = indices[k] * 3u;
    let w = weights[k];
    // Explicit fma matches StencilTable::eval's std::fma chain bit-for-bit
    // (single IEEE rounding); plain mul+add is driver-contractable and drifts.
    px = fma(src[s], w, px);
    py = fma(src[s + 1u], w, py);
    pz = fma(src[s + 2u], w, pz);
  }
  dst[i * 3u] = px;
  dst[i * 3u + 1u] = py;
  dst[i * 3u + 2u] = pz;
}
`

/** One level's CSR stencil, as marshalled by Multires.stencil*Out. */
export interface StencilLevel {
  /** {coarseCount, fineCount, nnz} (stencilMetaOut). */
  coarseCount: number
  fineCount: number
  offsets: Uint32Array
  indices: Uint32Array
  weights: Float32Array
}

const WG_SIZE = 64
const MAX_WG_PER_DIM = 65535

function makeBuf(device: GPUDevice, label: string, usage: GPUBufferUsageFlags, data: ArrayBufferView | number): GPUBuffer {
  const size = typeof data === 'number' ? data : data.byteLength
  const buf = device.createBuffer({label, size: Math.max(16, (size + 3) & ~3), usage})
  if (typeof data !== 'number') {
    device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
  }
  return buf
}

/**
 * Amplify `srcPositions` (tight xyz f32, dense by coarse vert id) through the
 * stencil chain. Returns the finest level's positions read back (the stage-1
 * parity surface); `keepResult` additionally returns the on-device result
 * buffer (Storage|Vertex|CopySrc — the stage-2 draw input) which the caller
 * then owns.
 */
export async function stencilAmplify(
  device: GPUDevice,
  levels: StencilLevel[],
  srcPositions: Float32Array,
  opts?: {keepResult?: boolean}
): Promise<{positions: Float32Array; result?: GPUBuffer}> {
  if (levels.length === 0) {
    return {positions: srcPositions.slice()}
  }

  device.pushErrorScope('validation')
  const module = device.createShaderModule({label: 'stencilSpmv', code: STENCIL_SPMV_WGSL})
  const pipeline = device.createComputePipeline({
    label  : 'stencilSpmv',
    layout : 'auto',
    compute: {module, entryPoint: 'main'},
  })

  const encoder = device.createCommandEncoder({label: 'stencilAmplify'})
  const scratch: GPUBuffer[] = []
  let src = makeBuf(device, 'stencil.src0', BufferUsage.STORAGE | BufferUsage.COPY_DST, srcPositions)
  scratch.push(src)
  let dst: GPUBuffer | undefined

  for (let li = 0; li < levels.length; li++) {
    const lvl = levels[li]
    const last = li === levels.length - 1
    const dstUsage = BufferUsage.STORAGE | BufferUsage.COPY_SRC | (last && opts?.keepResult ? BufferUsage.VERTEX : 0)
    dst = makeBuf(device, `stencil.dst${li + 1}`, dstUsage, lvl.fineCount * 3 * 4)
    if (!last || !opts?.keepResult) scratch.push(dst)

    const groups = Math.ceil(lvl.fineCount / WG_SIZE)
    const wgX = Math.max(1, Math.min(groups, MAX_WG_PER_DIM))
    const wgY = Math.max(1, Math.ceil(groups / wgX))
    const params = new Uint32Array([lvl.fineCount, wgX, 0, 0])

    const offsets = makeBuf(device, `stencil.off${li}`, BufferUsage.STORAGE | BufferUsage.COPY_DST, lvl.offsets)
    const indices = makeBuf(device, `stencil.idx${li}`, BufferUsage.STORAGE | BufferUsage.COPY_DST, lvl.indices)
    const weights = makeBuf(device, `stencil.wgt${li}`, BufferUsage.STORAGE | BufferUsage.COPY_DST, lvl.weights)
    const paramsBuf = makeBuf(device, `stencil.par${li}`, BufferUsage.UNIFORM | BufferUsage.COPY_DST, params)
    scratch.push(offsets, indices, weights, paramsBuf)

    const bind = device.createBindGroup({
      label  : `stencil.bind${li}`,
      layout : pipeline.getBindGroupLayout(0),
      entries: [
        {binding: 0, resource: {buffer: offsets}},
        {binding: 1, resource: {buffer: indices}},
        {binding: 2, resource: {buffer: weights}},
        {binding: 3, resource: {buffer: src}},
        {binding: 4, resource: {buffer: dst}},
        {binding: 5, resource: {buffer: paramsBuf}},
      ],
    })
    const pass = encoder.beginComputePass({label: `stencil.pass${li}`})
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bind)
    pass.dispatchWorkgroups(wgX, wgY, 1)
    pass.end()
    src = dst
  }

  const fineCount = levels[levels.length - 1].fineCount
  const byteLen = fineCount * 3 * 4
  const staging = device.createBuffer({
    label: 'stencil.staging',
    size : Math.max(16, (byteLen + 3) & ~3),
    usage: BufferUsage.MAP_READ | BufferUsage.COPY_DST,
  })
  encoder.copyBufferToBuffer(dst!, 0, staging, 0, staging.size)
  device.queue.submit([encoder.finish()])

  const err = await device.popErrorScope()
  if (err) {
    staging.destroy()
    for (const b of scratch) b.destroy()
    throw new Error(`stencilAmplify validation: ${err.message}`)
  }

  await staging.mapAsync(MapMode.READ)
  const positions = new Float32Array(staging.getMappedRange().slice(0, byteLen)).slice()
  staging.unmap()
  staging.destroy()
  for (const b of scratch) b.destroy()

  return {positions, result: opts?.keepResult ? dst : undefined}
}
