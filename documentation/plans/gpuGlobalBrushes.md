# GPU-resident global brushes (kelvinlet / grab)

Status: proposal / design. Not yet implemented.

Goal: when dynamic topology is **off**, run the kelvinlet and grab sculpt
brushes entirely on the GPU — compute dispatched from the TS host app on the
**renderer's own WebGPU device**, deformed positions scattered straight into
the render vertex buffers, and a CPU readback only once, at stroke end (for
the C++ mesh + undo). Kelvinlet is the priority: it is `@global` and routinely
touches the whole mesh every dab, so the per-dab CPU vertex loop and the
CPU→GPU re-upload of every touched node dominate its cost today.

This is "option (b)": a TS-side WGSL compute dispatcher, not an exposure of
the native `GpuStrokeSession`. Because the app renders on the TS-side WebGPU
device under **both** backends (browser/WASM and NW.js/N-API), one dispatcher
serves both; no cross-device buffer sharing problem exists, and the C++ side
only has to export marshaling data.

Non-goals:

- Dyntopo on the GPU. A GPU stroke assumes static topology (mesh uploaded
  once at stroke begin); dyntopo-enabled brushes stay on the CPU executor.
- Changing the CPU path. The CPU executor remains the reference; the GPU
  path is opt-in and must match it bit-modulo-fp.
- Other brushes. The design is generic (the debug app already dispatches ~13
  kernels), but only KELVINLET and GRAB are wired and gated here. Extending
  the kernel map later is a per-brush entry, not new architecture.

---

## 1. Background — what exists today

**Kernels.** Every brush is authored in the sbrush DSL and `sbrushc` emits
WGSL (among other backends); `kelvinlet.sbrush` is `@global` with a `reduce`
stage (coefficients `a`,`b` from mu/nu) and a CPU-only `host` clamp stage;
`grab` also emits valid WGSL (`kernels/generated/grab.brush.gen.h` proves the
C++ leg). WGSL output currently lands in `build/*/sbrush_out/wgsl/` — a build
artifact the app never sees.

**Dispatch runtime (native debug app only).** `IBrushComputeDispatch`
(`sculptcore/source/brush/compute_dispatch.h`) is the backend-neutral
dispatcher interface with two implementations (`vulkan/vk_compute`,
`webgpu/wgpu_compute`). `GpuStrokeSession`
(`sculptcore/source/debug/gpu_stroke.{h,cc}`, gated on `SBRUSH_GPU_DISPATCH`,
defined only for `source/debug/`) does the full stroke lifecycle: upload
co/no/mask once at begin, one dab dispatch per call (≤64-vert workgroup per
node chunk), CSR neighbors, std140/std430 marshaling per
`compute_layout.h`, meshlog undo snapshots, and a GPU-resident live-render
mode (GPU normal recompute + scatter into render VBOs, Vulkan only). Kelvinlet
is in its kernel map (gpu_stroke.cc:143) with the host clamp replicated
(gpu_stroke.cc:680) and grabFrom/grabTo marshaled into the ctx-uniform tail;
it is A/B-verified against the C++ executor
(`tests/scripts/brush_backends/kelvinlet_ab.txt`, `make.mjs sbrush-verify` /
`webgpu-verify`). GRAB has **no** kernel-map entry yet.

**App stroke path (CPU only).** `SculptPaintOp`
(`scripts/editors/view3d/tools/sculptcore_ops.ts`) drives the C++
`CommandExecutor` per dab (`wasmExec.applyDab(...)`,
sculptcore_ops.ts:545), with the mirror-image loop in `applyDab`, grab
anchor/accum state per mirror image (`setGrabAccumAdd(mirrorIdx > 0)`), one
MeshLog step per stroke opened by `executor.beginStep` in `undoPre` and
closed in `finishStroke`. After each dab, `mesh.spatial.update(wasm.gpu)`
regenerates dirty node buffers CPU-side and the renderer re-uploads them.

**Renderer seam.** `WebGPUBatchExecutor` (`scripts/webgpu/batch.ts`) caches
one `GpuBuffer` per sculptcore `Buffer` identity (`bufferKey`), re-uploading
when `buf.update_buffer` is set (native) or the heap data pointer moves
(WASM). Node VBOs are created with usage `'vertex'` only, and draws are
**non-indexed, corner-major** (`pass.draw(count, 1, cmd.start)`); the
per-corner fill order is owned by `fill_leaf_attr` (see
`sculptcore/documentation/spatial.md`). `GpuBuffer`
(`scripts/webgpu/buffer.ts`) already supports multi-usage
(`['vertex','storage']`).

### The gap

Nothing GPU-brush-shaped crosses the WASM/N-API seam: no `IWasmInterface`
member, no N-API export, no shipped WGSL. And the app-side per-dab needs —
node filter results, packed uniforms, falloff LUT, scatter maps — are locked
inside `debug_app::GpuStrokeSession`.

---

## 2. Design decisions

**D1 — C++ owns marshaling; TS uploads opaque blobs.** The std140/std430
layout contract (`compute_layout.h`) must have exactly one implementation.
Refactor the marshaling logic out of `gpu_stroke.cc` into a debug-free
`sculptcore/source/brush/gpu_marshal.{h,cc}` that both `GpuStrokeSession`
and the new seam use. TS never packs a uniform struct; it receives
ready-to-upload byte blobs and typed index arrays.

**D2 — WGSL kernels ship as generated, committed TS.** Extend
`make.mjs codegen` to also run `sbrushc --backend=wgsl` and emit one
aggregated `sculptcore/typescript/sculptcore/brush/brushWgsl.ts`
(`export const brushWgsl: Record<string, string>`). Committed like the rest
of the generated `typescript/` tree, so the browser bundle and NW.js load it
with zero runtime file access, and the WASM build (which never runs sbrushc)
stays self-contained.

**D3 — same device, same queue.** The dispatcher runs on the renderer's
`GPUDevice`. Compute submissions and render submissions on one queue are
ordered, so a dab can `queue.submit()` its compute pass immediately from the
dab handler — no render-graph hook is required for correctness. (If a frame
hook later proves nicer for batching multi-dab bursts, the render engine can
grow an `encodePreRenderCB` mirroring `encodeOverlaysCB`; not needed for M2.)

**D4 — GPU-resident during the stroke.** During a GPU stroke the CPU mesh is
intentionally stale. Rendering currency comes from a small **scatter** compute
kernel that copies computed per-vertex co/no into each GPU node's corner-major
VBOs (created with `['vertex','storage']`), plus a two-kernel **normal pass**
(face normals, then CSR vertex-normal gather) ported from the debug app's
GpuNormalPass design. `spatial.update()` is *not* run per dab (topology is
static and nothing CPU-side changed), so the batch executor's re-upload path
never fights the scatter output.

**D5 — gating + silent CPU fallback.** A feature flag
(`sculptcore.gpu_brush`, per `documentation/featureFlags.md`) plus per-stroke
eligibility, all decided once in `undoPre`: flag on, dyntopo disabled for the
brush, brush tool in the GPU kernel map (KELVINLET, then GRAB), brush program
is single-kernel (no autosmooth chain yet), WebGPU device present. Any miss →
the existing CPU path, unchanged. Mid-stroke there is no switching.

**D6 — undo through the existing MeshLog step, snapshot-before-write.** The
stroke still opens one MeshLog step in `undoPre`. At stroke end, a single C++
entry receives the read-back co/no plus the touched-node set and, per node:
snapshot into the open step (the CPU mesh still holds pre-stroke data — the
correct "before" image), then write the new data, then flag the node dirty.
Undo/redo then work exactly as today.

**D7 — parity is a gate, not a hope.** The CPU executor remains the
reference. Every wired brush gets a headless per-backend A/B test (CPU stroke
vs GPU stroke, fp tolerance) in the existing
`documentation/debugStrokeGuide.md` harness, plus an undo-fidelity assertion.

---

## 3. Seam additions (`IWasmInterface`)

New entries, exposed by **both** backends (WASM Embind export + the N-API
4-place change: `napi_runtime.{h,cc}` → `NativeAddon` type → `NativeManager`
method → `makeNativeInterface`). All bulk data crosses as bytes/typed arrays
(WASM: heap views; native: sandbox copies via the `pointerBytes` convention —
never a raw pointer). Names below are provisional; keep the `Mesh_*`/`LSTL_*`
naming convention so both backends stay drop-ins.

Per stroke (begin):

- `GpuBrush_beginStroke(mesh, spatial, brush, toolEnum) -> session handle` —
  C++ builds the stroke-static state via `gpu_marshal`: packed co/no/mask
  arrays (global-vert-indexed), kernel name + capability bits (needs
  neighbors / texture / attrs, accumulable, global), and runs the brush's
  `host` stage clamps.
- `GpuBrush_topology(session) -> {triVerts, vertTriCSR, nbrCSR}` — the normal
  -pass topology (3×tri global vert ids, vert→incident-tri CSR) and the
  one-ring CSR for `for_neighbor` kernels. **Cacheable across strokes**: also
  export a topology generation counter (bumped by dyntopo/undo-topo/remesh) so
  TS reuses these and the scatter maps below while the mesh is
  topology-static.
- `GpuBrush_scatterMaps(session) -> per-GPU-node corner→global-vert arrays` —
  must be generated by the same code path that orders `fill_leaf_attr`
  output, for both the position and normal attrs, so the scatter kernel and
  the CPU fill can never disagree.

Per dab:

- `GpuBrush_marshalDab(session, center, normal, radius, mirrorIdx) ->
  {brushUniformBytes (96), ctxUniformBytes (224), falloffLut (256×f32),
  strokePathBytes, uniqueVerts (u32[]), nodeMeta (u32 pairs), touchedNodeIds}`
  — runs the spatial node filter (same widened `filterRadius` policy the CPU
  path uses for grab/kelvinlet, sculptcore_ops.ts:496) and packs everything
  per `compute_layout.h`. `uniqueVerts`/`nodeMeta` are returned with a
  change-flag so TS skips re-upload when the filtered set didn't grow
  (anchored grab/kelvinlet strokes grow monotonically with drag).

Stroke end:

- `GpuBrush_endStroke(session, coBytes, noBytes)` — per D6:
  snapshot-touched-nodes-into-open-step → write co/no into the mesh → mark
  nodes dirty (so the next `spatial.update` regenerates their CPU-side
  buffers) → free the session. The TS caller then runs the normal
  `regenTreeBatch` / `spatial.update` / `endStep` sequence.

---

## 4. TS dispatcher — `scripts/webgpu/brush_compute.ts`

A `GpuBrushStroke` class owned by `SculptPaintOp` for the stroke's lifetime.
Semantics port `webgpu::WgpuBrushComputeDispatch` + the session logic of
`gpu_stroke.cc`; layout truth stays in C++ (D1).

- **Pipeline setup**: kernel WGSL from `brushWgsl[kernelName]` (D2). Build the
  bind-group layout by **introspecting `@binding(n)` declarations in the WGSL
  text**, exactly as `WgpuBrushComputeDispatch::loadKernel` does — no
  hardcoded per-kernel binding lists in TS, and an unknown binding is a loud
  error at stroke begin, not a silent no-render.
- **Stroke-static buffers**: storage co/no/mask (from `beginStroke` blobs);
  orig-co (binding 22 per `compute_layout.h::kOrigCoBinding`) is simply a
  copy of the initial co upload — on the GPU the stroke-start snapshot falls
  out for free; CSR neighbor buffers when the kernel needs them; 1×1 white
  texture default at bindings 8/9.
- **Per dab** (×1 primary + ×N mirror images, sequential dispatches):
  `writeBuffer` the uniform blobs + falloff LUT (+ uniqueVerts/nodeMeta when
  changed), `dispatchWorkgroups(nodeCount)` — one ≤64-vert workgroup per node
  chunk, matching the emitter's `@workgroup_size(64)` contract. Then encode
  the normal pass over the dab's work set and the scatter pass over touched
  nodes, one `queue.submit` per dab (or per frame burst).
- **Normal pass**: two hand-written WGSL kernels living TS-side (they are not
  sbrush kernels): face normals over `triVerts`, vertex normals via
  `vertTriCSR` gather. Work sets localized to the dab, mirroring
  `buildDabWork` (incident tris of moved verts + their verts), computed in TS
  from the same CSR.
- **Scatter pass**: kernel writes `co[map[i]]` / `no[map[i]]` into each
  touched node's corner-major position/normal VBOs. Requires the batch
  executor's node VBOs to carry `['vertex','storage']` usage — plumb a usage
  option through `WebGPUBatchExecutor.uploadBuffer` (scripts/webgpu/batch.ts:
  223). During the stroke, those VBOs must not be re-uploaded from stale CPU
  bytes; because nothing sets `update_buffer` (D4) this holds by
  construction, but assert it in dev builds.
- **Stroke end**: copy co/no into MAP_READ staging buffers, `mapAsync`,
  hand the bytes to `GpuBrush_endStroke`. One full-mesh readback per stroke
  (~24 B/vert) is the entire CPU cost of a kelvinlet stroke.
- **Failure policy**: any GPU error path (device lost, pipeline failure,
  unknown binding) aborts to the CPU fallback *before* the first dab where
  possible; after dabs have run, finish the stroke via readback-and-apply so
  the mesh is never left half-stroked. Never throw across the render seam.

---

## 5. Stroke-op integration (`SculptPaintOp`)

- `undoPre`: evaluate D5 eligibility; if GPU, construct `GpuBrushStroke`
  (begin + topology/scatter-map fetch, cache-aware) — MeshLog step opens
  exactly as today.
- `applyDabOne`: keep all existing host logic — raycast/anchor-plane
  projection, grab anchor + cumulative `grabTo`, widened `filterRadius`,
  symmetry loop — and branch only at the bottom: instead of
  `wasmExec.applyDab(...)`, call `gpuStroke.dab(center, normal, radius,
  mirrorIdx)`. Skip `mesh.spatial.update()` and `regenTreeBatch()` on the GPU
  branch (D4); `regenBounds` moves to stroke end (bounds of a mid-stroke
  kelvinlet drag are cosmetic).
- Mirror accumulation: the primary image rebases from orig, mirror images add
  (the CPU path's `setGrabAccumAdd(mirrorIdx > 0)` semantics). On the GPU
  this is a per-dispatch uniform mode consumed by the kernel (see §6) —
  same sequential pass ordering as the CPU executor so shared verts sum
  identically.
- `finishStroke`: `await gpuStroke.end()` → `GpuBrush_endStroke` → then the
  existing `regenTreeBatch` / `spatial.update` / `executor.endStep()` /
  overlay refresh sequence. `exec()` (headless replay of saved strokes) uses
  the CPU path unconditionally — replay determinism outweighs replay speed.

---

## 6. Kernel-side work (sculptcore)

- **GRAB kernel-map entry**: mirror gpu_stroke.cc's map into the new seam's
  kernel table (one shared table in `gpu_marshal`, consumed by both the
  debug app and the app seam) and add GRAB. SNAKE(hook) is a cheap follow-on
  but out of scope here.
- **From-orig / accum modes in WGSL**: the app's CPU kelvinlet/grab are
  from-orig cumulative (grab Phase-1: `AccumOrigAbsolute` primary,
  `AccumOrigAdd` mirrors — `accum_mode.h`,
  `sculptcore/documentation/plans/grab-original-coords.md`), while the
  current `kelvinlet.sbrush` vertex stage is incremental (`v.co += disp *
  fall` reading live co). Extend the WGSL emit so accum-mode kernels read the
  orig-co buffer (binding 22) and honor a mode slot in
  `ComputeBrushUniforms` (absolute-rebase vs add), keeping the C++ emit as
  the reference implementation of the same modes.
  **Dependency:** the grab Phase-1 CPU work is currently uncommitted WIP —
  land and verify it first; the GPU port copies its final semantics, gated by
  the same A/B harness.
- **Debug-app A/B stays authoritative**: extend
  `tests/scripts/brush_backends/` so kelvinlet's (and the new grab's) WGSL
  leg reflects the accum-mode changes; `sbrush-verify` + `webgpu-verify`
  keep gating the kernels independently of the app.

---

## 7. Performance notes / budgets

- Per-dab steady-state traffic is tiny: two uniform blobs (~320 B), the LUT
  (1 KB), stroke-path samples. `uniqueVerts`/`nodeMeta` re-upload only on
  filter-set growth (§3); for a whole-mesh kelvinlet the set saturates after
  the first dab.
- Whole-mesh fast path: when the filter returns every leaf, skip the
  indirection and dispatch `ceil(N/64)` workgroups indexing verts directly
  (a kernel specialization or a degenerate nodeMeta covering 0..N) — avoids
  holding a 4 B/vert index array per dab at 5 M verts.
- Stroke-static caches keyed on the topology generation (§3): scatter maps
  (~4 B/corner), normal-pass CSR, neighbor CSR. First GPU stroke after a
  topology change pays the build; subsequent strokes upload nothing static.
- Scatter/normal passes are dab-localized (work sets from `buildDabWork`
  semantics), so a small grab on a 5 M mesh stays O(dab), and a whole-mesh
  kelvinlet is O(mesh) *on the GPU only*.
- Acceptance target: whole-mesh kelvinlet drag on the 5 M-tri scene at
  interactive rate (≥25 fps, matching the dyntopo perf bar), vs the CPU
  path's current rate; measure over CDP on the native backend.

---

## 8. Verification

1. **Kernel gates (existing)**: `sbrush-validate wgsl`, `sbrush-verify`,
   `webgpu-verify` — extended per §6.
2. **App parity (new)**: headless integration test per
   `documentation/debugStrokeGuide.md` — same deterministic stroke run once
   with the flag off (CPU) and once on (GPU), diff final positions within fp
   tolerance (`co_sum`/`co_sqsum` fingerprints like sbrush-verify), per
   backend (WASM + native), self-skipping when the device/bundle is absent.
   Keep drivers macrotask-free (headless WebGPU wedges on screen-tick
   yields).
3. **Undo fidelity**: `save_pos`-style bracket — GPU stroke → undo →
   assert positions restored; redo → assert reapplied. Exercises D6.
4. **Symmetry**: mirrored kelvinlet/grab stroke A/B vs CPU (shared-vert
   accumulation ordering).
5. **Live verify**: drive the NW.js build over CDP (`nwjs/cdp.mjs`) —
   flag on, kelvinlet drag, screenshot + buffer-signature diff; confirm no
   per-dab `spatial.update` and no VBO re-upload during the stroke.

---

## 9. Debugging infrastructure

A GPU stroke is opaque in exactly the ways this codebase has been burned by
before: the CPU mesh is intentionally stale mid-stroke (so every existing
inspection tool lies), WGSL has no printf, kelvinlet has a history of
NaN/Inf blowups, and a non-finite value leaking into a GPU buffer once cost
a multi-day hunt (the leaf-bounds Inf bug). The hatches below ship **with**
the feature (M2), not after it.

1. **Debug surface** — `window.DEBUG.gpuBrush` + a `CTX.debug` entry,
   reachable over CDP per `documentation/debugSurface.md`:
   - `forceReadback()`: sync the CPU mesh from the GPU co/no/mask buffers
     mid-stroke, so every existing tool (vert dumps, bounding boxes, the
     parity tests' buffer-signature helpers) inspects live GPU state.
   - `state()`: session dump — kernel name, capability bits, vert count,
     filter-set size, touched-node ids, topology-cache generation, and the
     last dab's uniform blobs as hex (layout bugs show up here first).
   - a verbosity toggle for `[gpu-brush]`-prefixed logging; C++ marshal-side
     diagnostics on the native backend go through `sc_napi_logf` (renderer
     stderr is dead there).
2. **Capture/replay — same fixture format as native `--gpu-capture`.**
   Flag-gated per-stroke capture of the exact per-binding bytes (begin
   co/no/mask, uniform blobs, uniqueVerts/nodeMeta, LUT, stroke path, per
   dab) into the JSON fixture format `tests/webgpu/replay.mjs` already
   replays through Dawn bit-exact. An app-captured dab and a debug-app-
   captured dab become directly comparable, splitting "TS marshaled/uploaded
   wrong bytes" from "kernel computed wrong values" in one step. Trigger via
   the debug surface (`capture(strokeCount)`) or a feature flag.
3. **Shadow-verify mode** (`sculptcore.gpu_brush_verify` flag): every dab
   runs on both paths — CPU executor stays authoritative (the CPU mesh
   advances normally), the GPU dispatch runs in parallel, the dab's work set
   is read back and diffed per vertex. On tolerance breach: log the first N
   divergent verts (index, cpu/gpu co, |Δ|), auto-capture the dab fixture
   (item 2), and re-sync the GPU buffers from the CPU mesh so divergence
   never compounds across dabs. This is the sbrush-verify A/B embedded in
   the live app, and the first tool to reach for on any "GPU stroke looks
   wrong" report.
4. **Non-finite tripwire.** A tiny always-available reduction kernel ORs an
   is-nan/is-inf flag over the dab's work set into a 4-byte buffer, read
   back asynchronously (never stalls the stroke). On trip: log dab index +
   uniforms, auto-capture (item 2), and finish the stroke early via readback
   so a poisoned buffer never reaches the mesh or the undo step. Dev-build
   default on; release gated by the debug surface.
5. **WebGPU error hygiene.** Label every buffer/pipeline/pass
   (`gpuBrush.<kernel>.<purpose>`); `pushErrorScope('validation')` around
   pipeline creation and the first dab's submit with the scope result routed
   into the `[gpu-brush]` log; an uncaptured-error listener that tags errors
   with the last-dab context; a `device.lost` handler that flips the stroke
   to the CPU-fallback finish path (§4 failure policy) instead of wedging.
6. **Scatter-map self-check** (lands with M3): a debug-surface command that,
   after `forceReadback()`, regenerates one touched node's VBO through the
   CPU `fill_leaf_attr` path and byte-diffs it against the scatter output —
   a direct, on-demand test of the fill-order-disagreement risk (§11), also
   run once in the M3 live-verify pass.
7. **HUD + profiling.** A per-stroke stats object on the toolmode HUD
   mirroring `dynTopoStats`: dab count, dispatches, filter-set size, bytes
   uploaded this dab, marshal/upload/submit CPU ms; plus GPU pass timings
   via `timestamp-query` when the adapter grants it (silently absent
   otherwise) — this is also the measurement tool for M5. For hitch-hunting,
   the SPIKE-log methodology (sculptcore CLAUDE.md) applies: temporary,
   flag-gated, ripped out after the fix.
8. **Docs.** Extend `documentation/debugSurface.md` (new DEBUG namespace +
   CTX.debug entry) and `documentation/debugStrokeGuide.md` (driving a GPU
   stroke headlessly, shadow-verify + capture flags); the M6 user doc gets a
   symptom → tool troubleshooting table (wrong shape → shadow-verify; wrong
   shading → scatter self-check; explosion → tripwire capture; slow →
   HUD/timestamps).

---

## 10. Milestones

**M0 — marshal refactor + WGSL shipping (no behavior change).**
Extract `gpu_marshal.{h,cc}` from `gpu_stroke.cc` (uniform packing, falloff
LUT, node chunking, kernel table, normal-topology/CSR builders);
`GpuStrokeSession` consumes it; `sbrush-verify`/`webgpu-verify` stay green.
`make.mjs codegen` emits committed `brushWgsl.ts`.
*Done when: debug-app A/B green on the refactor; brushWgsl.ts in the bundle.*

**M1 — seam.** The §3 entries on both backends (Embind + the N-API 4-place
change), `GpuBrush_endStroke` undo semantics included. Unit-level test: begin
→ marshal one dab → end with unchanged co is a no-op step.
*Done when: both backends expose the entries and the no-op round-trip passes.*

**M2 — dispatcher + correctness (readback rendering).** `brush_compute.ts`
with kernel dispatch only (no scatter/normal pass); `SculptPaintOp` branch
behind `sculptcore.gpu_brush`; per-dab full readback → `GpuBrush_endStroke`-
style apply + node dirty + `spatial.update` (interactive but not yet
GPU-resident — this is the debug app's `interactiveReadback` shape).
Kelvinlet only. Ships with its debugging kit (§9.1–9.5): debug surface,
capture/replay, shadow-verify, non-finite tripwire, error hygiene.
*Done when: §8.2–8.4 pass for kelvinlet on both backends, an app-captured
fixture replays bit-exact through `tests/webgpu/replay.mjs`, and a
shadow-verify stroke reports zero divergent dabs.*

**M3 — GPU-resident rendering.** Scatter maps + scatter kernel, VBO
`['vertex','storage']` usage, TS normal pass, per-dab readback removed,
stroke-end readback only, topology-generation caches. Adds the scatter-map
self-check (§9.6) and the HUD stats/timestamp profiling (§9.7).
*Done when: §8.5 live-verified (including one scatter self-check pass); no
VBO uploads or spatial.update during a stroke; parity tests still green.*

**M4 — grab.** Land/verify grab Phase-1 CPU semantics first (dependency,
§6), then: GRAB kernel-map entry, from-orig + accum-mode WGSL emit,
mirror-pass ordering, grab added to every §8 gate.
*Done when: grab parity + symmetry + undo tests green on both backends.*

**M5 — perf pass.** Whole-mesh fast path, grow-only filter-set uploads,
5 M-tri A/B measurement vs CPU baseline over CDP, using the §9.7
HUD/timestamp instrumentation as the measurement tool; fix what misses the
§7 target.
*Done when: acceptance target met and recorded here.*

**M5 RESULT (2026-07-02, native backend over CDP, litemesh-cube subdiv=645 =
2.49 M verts / ~5 M tris, whole-mesh kelvinlet radius 8):**

- CPU baseline: **507 ms/dab** (~2 fps equivalent).
- GPU steady state (dab 2 onward): **≈0 ms marshal / ≈2 ms wall / ≈1.5 ms GPU**
  per dab (timestamp-query) — far past the ≥25 fps bar; the frame budget is
  now owned by the renderer itself.
- Per-stroke one-time cost ≈750 ms at 5 M: begin geometry upload (~80 MB
  stride-16 co/no), the first dab's whole-mesh undo snapshot (~360 ms,
  serial AttrSaver appendFrom — parallelizing it is a follow-up), and chunk
  build. The scatter-map upload amortizes across strokes via
  `SpatialTree::gpuLayoutGen`.
- The winning fix was the marshal steady-state fast path: when a dab's
  filtered node set is pointer-identical to the previous dab's (the saturated
  state of an anchored whole-mesh brush), the snapshot walk, chunk rebuild,
  uverts compare, and touched-owner mapping are all skipped — uverts/nodeMeta
  re-upload only on set changes (grow-only in practice). Membership tests use
  hash sets (Vector::contains scans were O(n²) at 5 M).
- The §7 "skip the indirection at whole-mesh" kernel specialization was NOT
  needed: the indirected dispatch measures ~1.5 ms/dab on the 5 M scene.

**M6 — cleanup + docs.** Strip `CLAUDENOTE:`s, decide the feature-flag
default (likely on for kelvinlet, off for grab until soak), write
`documentation/gpuBrushes.md` (user/developer doc incl. the §9.8
troubleshooting table) + CLAUDE.md pointer, extend `debugSurface.md` /
`debugStrokeGuide.md` per §9.8, update
`sculptcore/documentation/plans/brush_compute_followups.md` items 1/6
to reference this plan.

---

## 11. Risks / gotchas

- **Layout drift** between emit_wgsl and TS uploads — mitigated by D1 (C++
  packs everything) and binding introspection (§4); the only TS-authored
  WGSL is the scatter/normal kernels, whose layouts TS itself owns.
- **`update_buffer` races**: any code path that flags node buffers dirty
  mid-stroke (overlays, seam batches, display-mode sync) would clobber
  scatter output on the next frame. Audit `syncDisplayModeToBrush` and the
  overlay refreshes in `applyDab`; they must be inert or deferred during a
  GPU stroke.
- **mapAsync at stroke end** is async; `finishStroke` becomes await-bearing
  on the GPU branch. The MeshLog step must not close until the apply lands —
  keep `endStep` inside the completion continuation and make undo requests
  arriving mid-await wait on the stroke's completion promise.
- **Reduce-stage brushes**: kelvinlet's `reduce` outputs are folded into the
  dispatch as uniforms/prelude by the existing emitter — verified in the
  debug app; the app path inherits it via the shared marshal (M0), but the
  parity test is the proof.
- **Native backend copies**: every seam blob is a copy under the V8 sandbox
  (no external ArrayBuffers). Begin-stroke and end-stroke are the only big
  ones (one memcpy each way per stroke) — acceptable; do not add per-dab
  bulk copies.
- **Headless CI**: the parity tests need WebGPU in the hidden NW.js window
  (works today per the stroke-test harness) and in the browser build under
  Playwright; keep the self-skip pattern when no adapter exists.
