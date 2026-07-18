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

function makeBuf(
  device: GPUDevice,
  label: string,
  usage: GPUBufferUsageFlags,
  data: ArrayBufferView | number
): GPUBuffer {
  const size = typeof data === 'number' ? data : data.byteLength
  const buf = device.createBuffer({label, size: Math.max(16, (size + 3) & ~3), usage})
  if (typeof data !== 'number') {
    device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
  }
  return buf
}

/**
 * The X3 stage-3 finalize kernel: per amplified vert, normalize the amplified
 * frame (n, t orthogonalized, b = n×t) and optionally displace the position
 * by the Ptex VDM texel sampled at the vert's grid-lattice param — the
 * S5-deferred "smoothed frame + VDM apply" pass. The VDM fetch mirrors
 * VdmStore::texelP/sample over the flat gpuPtexTable + atlas pixels as
 * storage arrays (compute-side; the fragment path's texture route stays).
 */
const TESS_FINALIZE_WGSL = `
struct FParams {
  count : u32,
  hasVdm : u32,
  gridSide : u32,
  tileSize : u32,
  atlasTilesX : u32,
  atlasW : u32,
  wgCountX : u32,
  pad : u32,
}
@group(0) @binding(0) var<storage, read> posIn : array<f32>;
@group(0) @binding(1) var<storage, read> norIn : array<f32>;
@group(0) @binding(2) var<storage, read> tanIn : array<f32>;
@group(0) @binding(3) var<storage, read_write> posOut : array<f32>;
@group(0) @binding(4) var<storage, read_write> norOut : array<f32>;
@group(0) @binding(5) var<uniform> params : FParams;
@group(0) @binding(6) var<storage, read> vdmTable : array<i32>;
@group(0) @binding(7) var<storage, read> vdmAtlas : array<f32>;
@group(0) @binding(8) var<storage, read> vertCoords : array<i32>;

fn vdmTexelP(off : i32, r : i32, tps : i32, x : i32, y : i32) -> vec3f {
  // Payload coords; +1 shifts into the guard-ring storage lattice (R+2)^2.
  let ext = r + 2;
  let sx = clamp(x + 1, 0, ext - 1);
  let sy = clamp(y + 1, 0, ext - 1);
  let ts = i32(params.tileSize);
  let slot = vdmTable[off + (sy / ts) * tps + sx / ts];
  if (slot < 0) {
    return vec3f(0.0);
  }
  let cx = (slot % i32(params.atlasTilesX)) * ts + sx % ts;
  let cy = (slot / i32(params.atlasTilesX)) * ts + sy % ts;
  let p = u32((cy * i32(params.atlasW) + cx) * 4);
  return vec3f(vdmAtlas[p], vdmAtlas[p + 1u], vdmAtlas[p + 2u]);
}

fn vdmSampleP(g : i32, u : f32, v : f32) -> vec3f {
  if (g >= vdmTable[0]) {
    return vec3f(0.0);
  }
  let hdr = 1 + g * 3;
  let off = vdmTable[hdr];
  let r = vdmTable[hdr + 1];
  let tps = vdmTable[hdr + 2];
  if (r <= 0) {
    return vec3f(0.0);
  }
  let px = u * f32(r) - 0.5;
  let py = v * f32(r) - 0.5;
  let fx = floor(px);
  let fy = floor(py);
  let ax = px - fx;
  let ay = py - fy;
  let x0 = i32(fx);
  let y0 = i32(fy);
  let d00 = vdmTexelP(off, r, tps, x0, y0);
  let d10 = vdmTexelP(off, r, tps, x0 + 1, y0);
  let d01 = vdmTexelP(off, r, tps, x0, y0 + 1);
  let d11 = vdmTexelP(off, r, tps, x0 + 1, y0 + 1);
  return mix(mix(d00, d10, ax), mix(d01, d11, ax), ay);
}

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg : vec3<u32>,
        @builtin(local_invocation_id) lid : vec3<u32>) {
  let i = (wg.y * params.wgCountX + wg.x) * 64u + lid.x;
  if (i >= params.count) {
    return;
  }
  let b3 = i * 3u;
  var p = vec3f(posIn[b3], posIn[b3 + 1u], posIn[b3 + 2u]);
  var n = vec3f(norIn[b3], norIn[b3 + 1u], norIn[b3 + 2u]);
  var t = vec3f(tanIn[b3], tanIn[b3 + 1u], tanIn[b3 + 2u]);
  let nl = length(n);
  n = select(vec3f(0.0, 0.0, 1.0), n / nl, nl > 1e-9);
  t = t - n * dot(n, t);
  let tl = length(t);
  t = select(vec3f(1.0, 0.0, 0.0), t / tl, tl > 1e-9);
  if (params.hasVdm == 1u) {
    let g = vertCoords[i * 3u];
    if (g >= 0) {
      let iu = vertCoords[i * 3u + 1u];
      let iv = vertCoords[i * 3u + 2u];
      let s = f32(params.gridSide);
      let d = vdmSampleP(g, f32(iu) / s, f32(iv) / s);
      let bt = cross(n, t);
      p = p + t * d.x + bt * d.y + n * d.z;
    }
  }
  posOut[b3] = p.x;
  posOut[b3 + 1u] = p.y;
  posOut[b3 + 2u] = p.z;
  norOut[b3] = n.x;
  norOut[b3 + 1u] = n.y;
  norOut[b3 + 2u] = n.z;
}
`

/**
 * Geometric normals over the displaced fine surface: one thread per grid
 * lattice site, central differences along the lattice (one-sided at grid
 * borders), written ONLY by the vert's canonical owner site (vertCoords) so
 * seam replicas can't race — deterministic output.
 */
const TESS_NORMALS_WGSL = `
struct NParams { gridCount : u32, latticeW : u32, wgCountX : u32, pad : u32 }
@group(0) @binding(0) var<storage, read> pos : array<f32>;
@group(0) @binding(1) var<storage, read_write> nor : array<f32>;
@group(0) @binding(2) var<storage, read> gridVerts : array<u32>;
@group(0) @binding(3) var<storage, read> vertCoords : array<i32>;
@group(0) @binding(4) var<uniform> params : NParams;

fn P(vid : u32) -> vec3f {
  let b = vid * 3u;
  return vec3f(pos[b], pos[b + 1u], pos[b + 2u]);
}

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg : vec3<u32>,
        @builtin(local_invocation_id) lid : vec3<u32>) {
  let i = (wg.y * params.wgCountX + wg.x) * 64u + lid.x;
  let W = params.latticeW;
  let total = params.gridCount * W * W;
  if (i >= total) {
    return;
  }
  let g = i / (W * W);
  let r = i % (W * W);
  let v = r / W;
  let u = r % W;
  let base = g * W * W;
  let vid = gridVerts[base + v * W + u];
  // Only the canonical owner lattice site writes this vert.
  if (vertCoords[vid * 3u] != i32(g) || vertCoords[vid * 3u + 1u] != i32(u) ||
      vertCoords[vid * 3u + 2u] != i32(v)) {
    return;
  }
  let u0 = select(u, u - 1u, u > 0u);
  let u1 = select(u, u + 1u, u + 1u < W);
  let v0 = select(v, v - 1u, v > 0u);
  let v1 = select(v, v + 1u, v + 1u < W);
  let du = P(gridVerts[base + v * W + u1]) - P(gridVerts[base + v * W + u0]);
  let dv = P(gridVerts[base + v1 * W + u]) - P(gridVerts[base + v0 * W + u]);
  var n = cross(du, dv);
  let l = length(n);
  n = select(vec3f(0.0, 0.0, 1.0), n / l, l > 1e-12);
  nor[vid * 3u] = n.x;
  nor[vid * 3u + 1u] = n.y;
  nor[vid * 3u + 2u] = n.z;
}
`

/** Level topology inputs for the normals pass (always required). */
export interface TessTopoInputs {
  gridVerts: Int32Array
  vertCoords: Int32Array
  gridCount: number
  latticeW: number
}

/** VDM inputs for tessFinalize (the flat table/atlas as CPU arrays). */
export interface TessVdmInputs {
  table: Int32Array
  atlasPixels: Float32Array
  vertCoords: Int32Array
  gridSide: number
  tileSize: number
  atlasTilesX: number
  atlasW: number
}

/**
 * Run the finalize pass over on-device amplified buffers: consumes (and
 * destroys) `pos`/`nor`/`tan`, returns fresh Storage|Vertex posOut/norOut the
 * caller owns — the tessellated draw's two vertex streams.
 */
export async function tessFinalize(
  device: GPUDevice,
  count: number,
  pos: GPUBuffer,
  nor: GPUBuffer,
  tan: GPUBuffer,
  topo: TessTopoInputs,
  vdm?: TessVdmInputs
): Promise<{posOut: GPUBuffer; norOut: GPUBuffer}> {
  device.pushErrorScope('validation')
  const module = device.createShaderModule({label: 'tessFinalize', code: TESS_FINALIZE_WGSL})
  const pipeline = device.createComputePipeline({
    label  : 'tessFinalize',
    layout : 'auto',
    compute: {module, entryPoint: 'main'},
  })
  const nModule = device.createShaderModule({label: 'tessNormals', code: TESS_NORMALS_WGSL})
  const nPipeline = device.createComputePipeline({
    label  : 'tessNormals',
    layout : 'auto',
    compute: {module: nModule, entryPoint: 'main'},
  })

  const groups = Math.ceil(count / WG_SIZE)
  const wgX = Math.max(1, Math.min(groups, MAX_WG_PER_DIM))
  const wgY = Math.max(1, Math.ceil(groups / wgX))
  const params = new Uint32Array([
    count,
    vdm ? 1 : 0,
    vdm?.gridSide ?? 1,
    vdm?.tileSize ?? 1,
    vdm?.atlasTilesX ?? 1,
    vdm?.atlasW ?? 1,
    wgX,
    0,
  ])
  const sites = topo.gridCount * topo.latticeW * topo.latticeW
  const nGroups = Math.ceil(sites / WG_SIZE)
  const nWgX = Math.max(1, Math.min(nGroups, MAX_WG_PER_DIM))
  const nWgY = Math.max(1, Math.ceil(nGroups / nWgX))
  const nParams = new Uint32Array([topo.gridCount, topo.latticeW, nWgX, 0])

  const outUsage = BufferUsage.STORAGE | BufferUsage.VERTEX | BufferUsage.COPY_SRC
  const posOut = makeBuf(device, 'tess.posOut', outUsage, count * 12)
  const norOut = makeBuf(device, 'tess.norOut', outUsage, count * 12)
  const paramsBuf = makeBuf(device, 'tess.params', BufferUsage.UNIFORM | BufferUsage.COPY_DST, params)
  const nParamsBuf = makeBuf(device, 'tess.nparams', BufferUsage.UNIFORM | BufferUsage.COPY_DST, nParams)
  const roUsage = BufferUsage.STORAGE | BufferUsage.COPY_DST
  const tableBuf = makeBuf(device, 'tess.vdmTable', roUsage, vdm ? vdm.table : 16)
  const atlasBuf = makeBuf(device, 'tess.vdmAtlas', roUsage, vdm ? vdm.atlasPixels : 16)
  const coordsBuf = makeBuf(device, 'tess.vertCoords', roUsage, topo.vertCoords)
  const gridVertsBuf = makeBuf(device, 'tess.gridVerts', roUsage, topo.gridVerts)

  const bind = device.createBindGroup({
    label  : 'tess.finalize',
    layout : pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: pos}},
      {binding: 1, resource: {buffer: nor}},
      {binding: 2, resource: {buffer: tan}},
      {binding: 3, resource: {buffer: posOut}},
      {binding: 4, resource: {buffer: norOut}},
      {binding: 5, resource: {buffer: paramsBuf}},
      {binding: 6, resource: {buffer: tableBuf}},
      {binding: 7, resource: {buffer: atlasBuf}},
      {binding: 8, resource: {buffer: coordsBuf}},
    ],
  })
  const nBind = device.createBindGroup({
    label  : 'tess.normals',
    layout : nPipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: posOut}},
      {binding: 1, resource: {buffer: norOut}},
      {binding: 2, resource: {buffer: gridVertsBuf}},
      {binding: 3, resource: {buffer: coordsBuf}},
      {binding: 4, resource: {buffer: nParamsBuf}},
    ],
  })
  const encoder = device.createCommandEncoder({label: 'tessFinalize'})
  const pass = encoder.beginComputePass({label: 'tessFinalize'})
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bind)
  pass.dispatchWorkgroups(wgX, wgY, 1)
  pass.end()
  // Geometric normals over the DISPLACED positions (pass B).
  const nPass = encoder.beginComputePass({label: 'tessNormals'})
  nPass.setPipeline(nPipeline)
  nPass.setBindGroup(0, nBind)
  nPass.dispatchWorkgroups(nWgX, nWgY, 1)
  nPass.end()
  device.queue.submit([encoder.finish()])

  const err = await device.popErrorScope()
  pos.destroy()
  nor.destroy()
  tan.destroy()
  paramsBuf.destroy()
  nParamsBuf.destroy()
  tableBuf.destroy()
  atlasBuf.destroy()
  coordsBuf.destroy()
  gridVertsBuf.destroy()
  if (err) {
    posOut.destroy()
    norOut.destroy()
    throw new Error(`tessFinalize validation: ${err.message}`)
  }
  return {posOut, norOut}
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
