# Non-dyntopo stroke profile — 1.5M-vert sphere, NW.js, native backend (2026-07-15)

Per-dab hotspot survey of plain (dyntopo-off) sculpt strokes in the real app,
measured end-to-end: TS op pipeline (`SculptPaintOp.applyDab`) → N-API →
sculptcore `CommandExecutor::applyDab` → per-dab `spatial.updateQueries()` →
draw-frame `spatial.update(gpu)` + WebGPU VBO upload.

## Setup

- Scene: `--gen-scene litemesh-cube --scene-arg subdiv=500` → spherified cube,
  **1,494,008 verts**, ~3M tris, 2,180 spatial leaves (~685 verts/leaf).
- Backend: `--backend native` (N-API addon, RelWithDebInfo, clang), headless NW.js.
- Strokes: `window._sculptcoreStrokeTester.runStroke` (the real
  `SculptPaintOp`/`BrushStrokeDriver` path), 40 screen points across the sphere,
  radius 120 px, X-symmetry active (2 images/sample). Brushes: clay (default,
  autosmooth → `[CLAY, SMOOTH]` program), draw, smooth. Dyntopo off, GPU-brush
  path not engaged (CPU brushes).
- Instrumentation (all tagged `CLAUDENOTE`, in working tree, not committed):
  - C++ `sculptcore/source/spatial/dab_profile.h` — inline counters; report
    printed at `CommandExecutor::endStep()`; timers in `brush_executor.h`
    (filter / execPre / logSave / coPrev / origStamp / kernel) and
    `spatial.cc::updateImpl` (split / merge / tris / bounds / normals + GPU half).
  - TS `sculptcore_ops.ts` (`globalThis.__scProf`) and `webgpu/batch.ts`
    (`globalThis.__gpuUploadProf` VBO-upload counters).
  - Native printf is dead in the NW.js renderer (fd 1 closed) — the report is
    captured via `__nativeManager.addon.redirectStdout(path)`.

## Headline numbers (steady-state clay stroke, per dab)

A dab with the brush over the surface costs **~217 ms** end-to-end
(≈4.6 dabs/s). TS-side and C++-side timings agree to <1 ms — **N-API call
overhead is negligible**; everything is engine time. Filtered node set:
~930 leaves ≈ **640k verts walked per dab** (see "over-selection" below).

| Stage | ms/dab | share | notes |
|---|---|---|---|
| meshlog undo capture (`cmd.execPre`, "logSave") | **~77** (38.3 ×2 cmds) | ~35% | serial walk of every unique vert+face of every filtered leaf, per sub-command; clay's autosmooth doubles it |
| `updateQueries` → leaf normals | **~58** | ~27% | recomputes ALL face+vert normals of every leaf with ≥1 moved vert (~930 leaves ≈ 1.3M tris); parallel but heavy |
| `updateQueries` → bounds refit | **~49** | ~22% | `regenDirtyBounds` → `regen_node_bounds(root)` is **serial**, recursive, re-reads every unique vert of every dirty leaf |
| deform kernel (parallel node loop) | ~27 (13.5 ×2) | ~12% | the actual sculpt work |
| `co_prev` Jacobi snapshot (SMOOTH cmd) | ~6 | ~3% | O(v.capacity) 18 MB memcpy **per dab**, independent of brush size |
| node filter, attr resolve, execPost, log begin/end | <1 | — | |
| TS: rayCast per dab | 2–5 | ~2% | |
| TS: getBrush/buildProgram/marshal | <0.5 | — | |

Draw (single-command, no autosmooth): ~80 ms dab + ~64 ms updateQueries —
logSave 44.8, origStamp (non-accum orig materialize+stamp) 9.2, kernel 5.3,
bounds 28.5, normals 29.1. Smooth: like clay but coPrev runs twice (~10 ms).

**First dab of every stroke spikes 3–6×** (dab.total max 247–595 ms; logSave max
150–225 ms): lazy attr-page materialization + `AttrSaver.ensure` + cold tree
state all land on it. Perceptually this is the "hitch when the stroke starts".

## Per-frame (draw) cost while stroking — detailed breakdown

Measured per frame via `__frameProf` (view3d.ts `f()` + LiteMesh.drawQ +
WebGPUBatchExecutor.dispatch sub-timers) plus the C++ `frame-gpu` /
`seam-batch` lines. Wall times in the headless runs are inflated by hidden-
window RAF throttling (~0.5–1 s between frames) — use the `draw` (main-thread)
numbers, not `wall`.

**Dirty post-stroke frame: ~450–485 ms main-thread**, composed of:

| Item | ms | notes |
|---|---|---|
| seam-overlay rebuild (`_ensureSeamBatch` → C++ `buildSeamBatch`) | **266–298** | `finishStrokeTail` calls `markSeamsDirty()` at EVERY stroke end; **~97% of it is `thawTopo()`** (258–286 ms — full O(mesh) topology-link re-materialization) on a mesh with ZERO feature edges (recompute=0 ms, edge scan ~8–12 ms, returns null). The next stroke's first dab re-freezes. This is the mouse-up hitch. |
| WebGPU `dispatch` (827 draw commands) | 122–148 | vbuf/upload 70–84, bindGroups 35–44, attr normalization 11–14 |
| — of which VBO uploads | 64–75 | ~2,200–2,500 buffers, **306–359 MB** (≈ the whole mesh) |
| C++ GPU-half fill (`spatialUpdate`) | 29–36 | **all in-place slice updates** — regenOwners=0, failed=0; 1,800–2,200 leaf slices ≈ 7.5–8.9M corner-verts refilled (pos+nor+color) |
| updateDataGraph | ~0 | (one-time 117 ms on the first frame after boot) |

**Clean frame (nothing dirty): ~36–56 ms**, essentially all
`dispatch` — 827 commands × (bindGroupList ~25 ms + N-API `cmd.attrs`
vector normalization ~7 ms + per-slot buffer lookup/no-op upload checks
~6 ms). That is a **~20–25 fps idle viewport ceiling at 1.5M** coming from
per-command JS/N-API overhead, not GPU work.

Why 300+ MB re-uploads: the in-place slice path works (zero full regens), but
a successful slice update flags the **whole owner buffer** `update_buffer`,
and TS `uploadBuffer` has no sub-range writes — it re-uploads the entire
buffer. A broad stroke dirties ~2,000/2,180 leaves → ~every owner → ~100% of
mesh VBO bytes. Even a single-leaf dab re-uploads its whole owner
(~2 k tris ≈ 250 KB for ~one leaf's worth of change). Mid-stroke frames pay
fill + upload for owners dirtied since the last frame plus the ~40 ms
dispatch floor — but *not* the seam rebuild (stroke-end only).

## Ranked hotspots

1. **Meshlog undo capture (`execPre` in every generated kernel)** — largest
   single dab cost (~35%). Serial; walks the *entire filtered leaf set* per
   sub-command per dab (needsData check per vert), even though only
   first-touches append. Obvious levers: run once per dab instead of per
   sub-command (autosmooth pays it twice for the same region), parallelize the
   walk, or iterate only leaves not fully saved yet (per-node "fully saved this
   stroke" flag — most mid-stroke dabs re-scan verts already captured).
2. **Per-dab leaf normal recompute (`uq.normals`)** — a leaf with one moved
   vert recomputes all ~685 verts / ~1.4k faces; ~930 leaves/dab. Levers:
   defer normals to the draw frame (once per frame, not per dab — queries only
   need them for shading, not correctness of raycasts... verify raycast/brush
   normal consumers first), or restrict to affected_verts' faces.
3. **Serial bounds refit (`uq.bounds`)** — `regen_node_bounds` is serial and
   re-reads every vert of every dirty leaf. Levers: parallel leaf refit +
   serial internal-node fold (mirrors the normals pattern), or refit leaf AABBs
   from `affected_verts` only (grow-only during stroke, exact refit at stroke
   end).
4. **Node-filter over-selection (amplifier for 1–3)** — ~930 leaves ≈ 640k
   verts filtered per dab, while a 120 px brush cap on this sphere is
   geometrically only ~2–3% of the surface (~35–50k verts). Kernel timing
   (moves only in-falloff verts) supports that most filtered verts are dead
   weight. Worth verifying leaf AABB looseness / filter radius derivation —
   an accurate filter would cut hotspots 1–3 by up to an order of magnitude.
5. **Stroke-end seam-overlay thaw** — ~280 ms at every mouse-up
   (`markSeamsDirty` → `buildSeamBatch` → `thawTopo`), pure waste when the
   mesh has no feature edges. Levers: skip the thaw when no feature-edge bool
   attrs exist / all-empty (track a flagged-edge count), or keep a frozen-safe
   copy of `e.vs` for the overlay scan.
6. **Whole-buffer VBO re-upload per frame** — the C++ side already does
   in-place slice updates (29–36 ms, zero full regens), but flagging is
   per-owner-buffer and TS uploads have no sub-range writes → 300+ MB/frame
   after broad strokes. Levers: per-slice dirty ranges + `queue.writeBuffer`
   sub-range uploads, or the GPU-brush-style scatter path.
7. **Per-command dispatch overhead** — 827 draw commands cost 36–56 ms/frame
   even when nothing is dirty (bind-group list rebuild + N-API vector
   normalization per command per frame). Levers: cache normalized `cmd.attrs`
   arrays + bind groups per command (invalidate on batch rebuild), render
   bundles.
8. **`co_prev` snapshot** — 18 MB full-capacity copy per smooth-bearing dab.
   Small today (~3%) but O(mesh), serial, and doubles on smooth strokes; scales
   linearly with vert count (≈60 ms at 5M... measured 5–6 ms at 1.5M, so ~20 ms
   at 5M). Could copy only filtered-region verts + their ring-1.

Not hotspots: N-API marshaling (~0), TS op pipeline (raycast 2–5 ms, rest
<1 ms), spatial `filterNodes` (~0.4 ms), tris/split/merge phases (~0),
meshlog begin/endStep (<0.5 ms).

## Fixes applied (2026-07-15, same session)

Frame-side hotspots #5 and #6 are fixed (uncommitted, working tree):

1. **Stroke-end seam thaw eliminated** (`spatial.cc buildSeamBatch`): the
   feature-flag scan is frozen-safe, so the thaw is deferred until flagged
   edges are actually found — with `boundaryDirty` clear and no feature-edge
   layers (or none flagged), it returns before touching topology.
   Measured: **266–298 ms → 0.002–0.011 ms** per stroke end; the dirty
   post-stroke frame dropped ~450–485 ms → ~180–270 ms main-thread.
2. **Sub-range VBO uploads** (`gpu::Buffer.update_start/update_end` +
   `markDirtyRange`, slice spans unioned in `updateImpl`'s epilogue;
   `pointerBytes` gained a byte-offset arg so the native bulk copy shrinks
   too; TS `uploadBuffer` does `queue.writeBuffer` at the range offset).
   Uploads now scale with the dirty region: a radius-40 localized stroke
   uploads **42 MB in 9.6 ms** (fill 4.5 ms) instead of whole owner buffers;
   an untouched frame uploads 0 bytes. A broad full-viewport stroke still
   uploads ~330 MB — genuinely ~all leaves dirty, not amplification.
   Consumers that ignore ranges (vulkan/wgpu native backends, WebGL executor)
   keep whole-buffer semantics — `update_end < 0` means whole, and
   `markDirtyRange` re-arms from clean, so stale ranges can't under-upload.

Verified: `tests/integration/sculptcore_brushes.test.ts` 36/36 (both
backends; reads back real WebGPU position buffers) and the profiling
scenario dumps (`ok: true`, no NaN).

**Pre-existing failure found while gating** (NOT caused by these fixes —
reproduced identically on a fully pristine master build, both repos stashed,
addon + bundle rebuilt): `sculptcore_gpu_brush.test.ts` fails 6/16 on both
backends — `stats.dispatches === 0`, `gpuResident false`, fixture undefined —
i.e. the GPU brush path silently declines and every stroke falls back to CPU
(which is why the parity/undo tests still pass). Likely `stroke.begin()`
failing async (its console.warn is not surfaced by the harness). Needs its own
investigation.

Remaining frame-side item: the per-command dispatch floor (#7). Remaining
dab-side items: #1–#4 and #8 (meshlog capture, normals, bounds, filter
over-selection, coPrev).

## Idle / navigation framerate (solid viewport, render engine OFF)

Follow-up survey (same 1.5M sphere, 30 orbit-only redraws, zero geometry
dirt, [`2026-07-15-framerate-driver.js`](2026-07-15-framerate-driver.js);
the tri-target sweep below used
[`2026-07-15-tri-target-sweep-driver.js`](2026-07-15-tri-target-sweep-driver.js)):
the viewport is **CPU-bound at ~14–25 fps** even with nothing changing but
the camera.

Main-thread `draw` = **40–71 ms/frame** (run-to-run machine variance;
proportions stable), ~all of it `WebGPUBatchExecutor.dispatch` over the
mesh's **827 draw commands** (one per GPU owner node, ~3.6 k tris each).
Per frame, per command, the dispatch loop redoes:

| bucket | ms/frame | what it is |
|---|---|---|
| bind (`bindGroupList`) | 12–22 | called PER COMMAND: `_advanceRing` + `write(uniforms)` → **833 uniform-buffer writes of the identical uniform block** (apply 3–5 ms + writeBuffer 1–2 ms) + ring-keyed map lookups. Bind groups themselves are fully cached (creates = 0). |
| `getPipeline` | 11–18 | rebuilds slot-shape + string cache key per command (N-API `sdef.attrs` vector reads + per-buffer name/type/elemsize reads) despite 100% cache hits |
| `cmd.attrs` normalization | 6–11 | `Array.from(vecMember(...))` — an N-API vector proxy walk per command |
| vertex-buffer binds | 6–9 | per-buffer `objectAddress` + size/elemsize/type/update_buffer property reads across N-API (~2.5 k buffers) |
| encode + misc cmd reads | ~3 | `pass.draw`, `cmd.start/end/shader` N-API gets |

GPU time (`queue.onSubmittedWorkDone` after submit): **median 17 ms, max
25 ms** at 1400×900 hidden-window — 827 draw calls with per-draw pipeline/
bind/vertex-buffer switches, `cullMode: 'none'` (back-faces rasterize), and
no frustum culling (all 3M tris every frame, view-independent). Overlapped
with CPU in steady state, so the frame rate is the CPU's 40–70 ms.

Fix directions, roughly by leverage:
1. **Per-command dispatch cache**: uniforms are identical across all 827
   commands — write them once per dispatch and reuse one bind-group set;
   cache normalized attr arrays + pipeline refs per command, invalidated on
   batch rebuild. Kills most of all four buckets.
2. **GPURenderBundle**: encode the 827 draws once, `executeBundles` per
   frame — near-zero per-frame CPU for the static case; invalidate on batch
   rebuild (which fix #2's ranges make rare).
3. **Raise `gpu_tri_target`** (2048 → 16–32 k): ~16× fewer commands, so
   every per-command cost (CPU and GPU draw-call overhead) shrinks
   proportionally. Sub-range uploads (fix #2 above) already offset the
   coarser upload granularity this used to cost.
4. **Frustum-cull GPU nodes** (AABBs already exist) and enable back-face
   culling for the solid surface — halves fragment work, skips off-screen
   nodes.

### All four implemented (2026-07-15, same session; uncommitted)

Measured after (same 1.5M orbit scenario): **main-thread draw 40–71 ms →
2.0 ms/frame; GPU 17 → 8.2 ms** — the viewport went from ~14–25 fps
CPU-bound to GPU-bound at ~120 fps equivalent (vsync-limited in practice).
`sculptcore_brushes` 36/36 green on both backends after all changes.

- **Dispatch cache + render bundles** (`scripts/webgpu/batch.ts`): per-batch
  cached command state (normalized attrs, pipeline refs, resolved vertex
  buffers), keyed on the new engine-side `DrawBatch.id` (manager-minted,
  address reuse safe) and invalidated by `DrawBatch.version` (bumped on
  rebuild). Shared uniforms are written once per distinct pipeline per
  dispatch (7 uniform-buffer writes/frame instead of 833), and visible draws
  replay from a cached `GPURenderBundle` (re-encoded only when the visible
  set or a bind-group identity changes — 0 re-encodes/frame steady-state).
  Buffer refresh is push-model: `LiteMesh.drawQ` calls
  `flushBatchBuffers` when `spatial.update(gpu)` reports work, instead of
  the dispatch loop polling `update_buffer` per buffer per frame (with a
  version guard so a rebuilt batch's disposed buffers are never touched).
- **Frustum culling** (default on): the engine stamps per-command owner
  AABBs on the batch (`DrawBatch.cmdAabbs` + `aabbVersion`, refreshed by a
  sticky `pendingCmdAabbs_` when per-dab bounds refits ran); the executor
  bulk-reads them (`vectorView`) and clip-space-tests 8 corners per command
  per frame (conservative near-plane test covers both z conventions).
  Verified: camera looking away → 0/29 drawn; a framed sphere legitimately
  keeps every node in-frustum.
- **Backface culling** (default OFF, opt-in): feature flag
  `sculptcore.backface_cull` → `cullMode: 'back'` baked into the surface
  executor's pipelines (flag flip rebuilds the executor, same pattern as the
  xray overlay rebuild).
- **`gpu_tri_target` sweep** (2 k/8 k/16 k/32 k/64 k/128 k on the 1.5M mesh,
  orbit + zoomed + localized-stroke legs): main-thread cost is flat
  everywhere post-cache (~2 ms), GPU frame time is best at 32–64 k
  (10.8/9.6 ms vs 13–15 ms at ≤16 k), dab + dirty-frame cost is mid-pack at
  32 k and regresses at 128 k (upload spans widen: 90 MB/53 ms dirty frame).
  **New default: 32768** (`DEFAULT_GPU_TRI_TARGET`, litemesh.ts; override
  via `globalThis.__SC_GPU_TRI_TARGET` + `rebuildSpatialFromEdit()` for
  experiments) → 246 commands at 1.5M.

## Interactive implication

At 1.5M verts with a 120 px brush the app can sustain ~4–5 dabs/s and roughly
1–3 fps during a stroke (dab cost + frame fill/upload). The deform kernel
itself is only ~10% of the budget — the frame is spent on undo capture,
normals/bounds maintenance, and VBO streaming.

## Reproduce

```
node nwjs/launch.mjs --backend native --headless --no-devtools --instance \
  --gen-scene litemesh-cube --scene-arg subdiv=500 \
  --eval "eval(require('fs').readFileSync('<scratch>/stroke_profile_driver.js','utf8'))" \
  --dump <scratch>/prof_native.json --exit
```

Driver: [`2026-07-15-stroke-profile-driver.js`](2026-07-15-stroke-profile-driver.js)
(redirects native stdout, runs warmup + clay/draw/smooth strokes, snapshots
`__scProf`/`__gpuUploadProf` into the dump's `evalResult`; edit the two
absolute output paths inside before running). Raw C++ phase report from this
run: [`2026-07-15-scprof-native-raw.txt`](2026-07-15-scprof-native-raw.txt).

**Note:** the temporary instrumentation these drivers read (`dabprof` C++
counters, `__scProf`/`__frameProf`/`__ubProf`/`__gpuUploadProf`/
`__getWebGpuDevice` TS globals) was stripped when the fixes were committed —
re-instrument from this session's diff (or the description above) to re-run
the surveys. The `globalThis.__SC_GPU_TRI_TARGET` override is permanent.
