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

## Dab-side fixes (2026-07-15 late session)

Five per-dab fixes landed after the frame-side commit (parent `31fcfe78` / sc
`0ed6ae0`), measured with the same driver/scene (native backend, 1.5M cube,
radius 120px). Steady-state averages over the 5 non-warmup strokes:

| stage | sample avg | stroke wall | uploads/stroke | upload ms |
|---|---|---|---|---|
| baseline (post frame fixes) | 180.9 ms | 1953 ms | 339 MB | 272 ms |
| +1 normals off per-dab + parallel bounds refit | 56.5 ms | 640 ms | 332 MB | 110 ms |
| +2 meshlog capture walk-elision stamps | 49.6 ms | 576 ms | 332 MB | 110 ms |
| +3 merge cadence (frame-counted, !frozen) | ~same | ~same | ~same | ~same |
| +4 `Spatial_UpdateGPUGeom` channel-split slices | 50.3 ms | 585 ms | 199 MB | 63 ms |
| +5 coPrev page-wise memcpy | 49.1 ms | 572 ms | 199 MB | 58 ms |

1. **`Update_Normals` phase bit** — per-dab `updateQueries()` runs
   split/merge/tris/bounds only; the per-frame `update(gpu)` refreshes each
   normals-dirty leaf once instead of once per overlapping dab. Plus a
   parallel leaf-refit pass in `regenDirtyBounds`. `uq` 70.6→5.9 ms/dab, and
   `applyDab` itself halved (cache pressure relief).
2. **Capture walk-elision** — `SpatialNode.captureStamps[8]` per sub-command
   slot; `exec()` hands `execPre` only not-yet-walked leaves (topology-stable
   strokes only: `!stepHasDyntopo`). logSave 16.7→13.4 ms; the remainder is
   genuine frontier capture volume.
3. **Merge cadence** — `applyDeferredMerge` now counts only `Update_Gpu`
   (frame) calls and holds while topology is frozen. Previously per-dab
   `updateQueries()` drove the cadence, firing merges mid-stroke → RegenTris →
   GPU repartition + full owner regens (the ~2 s fill spike class).
4. **Channel-split GPU slices** — pure-deform kernels (compiler test:
   `!isPaint && saves ⊆ {v.co, v.no, f.no}`) flag the new
   `Spatial_UpdateGPUGeom`; `update_gpu_node_slice` then fills/uploads pos+nor
   only, leaving attribute streams untouched. Uploads 332→199 MB — the rest is
   honest pos+nor (corner-expanded, no index buffer).
5. **coPrev page-wise memcpy** — the Jacobi snapshot copies attr pages with
   `memcpy` instead of the per-element paged accessor. Bandwidth-bound ~3 ms
   floor at 1.5M; region-scoping was rejected (neighbor reads make the safe
   refresh set ≈ the whole capacity).

**Misdiagnosis corrected:** the earlier "18× filter over-selection" was wrong.
The harness brush (120px in the small hidden window) genuinely covers ~40% of
the object (~600k verts in falloff — `movedVerts` counters), and `filterNodes`
is honest. Costs that scale with region are real work at this brush size.

**Pre-existing native ctest failures** (verified on pristine master, both-repos
stash + rebuild): `test_debug_script`, `test_dyntopo_multistep_gpu`,
`test_spatial_update_split`. Gate used: `sculptcore_brushes` 36/36 (both
backends) + `test_spatial_merge`/`test_spatial_dyntopo`/`test_spatial_rebalance`.

## Parallel meshlog capture (2026-07-15 late, second pass)

The dominant remaining dab cost — the serial `execPre` undo-capture walk — is
now parallel (`sculptcore/source/meshlog/parallel_capture.h`, called from the
regenerated kernel Pre stages; `ChunkElemData::appendRows` reserves rows).
Three phases: parallel per-node needs-capture counts → serial prefix-sum row
reservation (the only shared mutation) → parallel disjoint row fill + stamp
updates. Leaf element ownership is unique, so stamp reads/writes never race;
BOOL capture sets (none today) fall back to serial (shared bitset words).

Same driver/scene, steady-state clay:

| metric | before | after |
|---|---|---|
| logSave per exec (avg / first-dab max) | 13.4 ms / 136 ms | 2.4 ms / ~18 ms |
| applyDabNative | 41-56 ms | 13.5-27 ms |
| sample.total | 44-64 ms | 21-40 ms |
| stroke wall | 480-720 ms | 301-500 ms |

Cumulative from the session baseline: **per-sample 181 → ~25 ms (7×)**. The
first-dab capture spike (the mouse-down hitch) also collapsed 136→~18 ms.

Gates: `sculptcore_brushes` 36/36 (both backends, includes undo readbacks),
`test_brush*`, `test_meshlog_topo`, `test_spatial_merge`/`_rebalance` — all on
rebuilt native + node.

Implementation note: the first version kept per-node element lists in a
`Vector<Vector<int>>` and crashed with heap corruption (`bases.resize` AV,
Crashpad-verified) — litestl nested-Vector construction is not safe for this
pattern (same family as the known `remove_at` double-free). The landed version
uses flat count/offset vectors and re-tests the (untouched) stamps in phase 3.

Whole-process CPU during the headless run peaks ~26% of 16 logical CPUs (was
~22%) while completing strokes 2× faster — the harness idles between strokes
(hidden-window RAF), so dab throughput, not utilization, is the metric that
moved. Remaining serial per dab: TS/raycast glue (~5 ms), coPrev bandwidth
copy (~3 ms, could be a parallel page copy), attr resolve.

## Live-app fixes: castRay pruning + incremental coPrev (2026-07-15, third pass)

Live (windowed, CDP-driven) profiling showed that at a realistic brush size
(~190 leaves filtered) the fixed serial costs dominated the 24-32 ms sample:
coPrev's full-mesh snapshot (3 ms × up to 4 execs/sample) and castRay's
unordered BVH descent (2.3-5.3 ms × 2 mirror casts). Both fixed:

- **castRay near-first + best-t pruning** (`node.h` + `math::aabbRayEnter` in
  litestl geom.h): visit the closer child first, skip subtrees whose AABB
  entry distance exceeds the best hit. 2.3-5.3 ms → **0.22-0.39 ms** per cast.
- **coPrev incremental refresh** (`brush_executor.h` + `SpatialNode.coPrevStamp`):
  full page-copied snapshot once per stroke, then each needsCoPrev exec
  refreshes only the verts of nodes touched since the previous refresh
  (kernels only move verts of the node sets they run over, so untouched
  entries — including neighbor reads — stay valid). Gated on `!stepHasDyntopo`
  like the capture stamps. 3 ms → **0.4-1.8 ms avg** per exec (max = the
  per-stroke full copy).

Live steady state: smooth **11 ms/sample** (native dab 4 ms), clay ~25 ms
(kernel — the parallel part — is now the largest slice). Sustained 40-stroke
loop: 360 dabs at 32 ms/sample incl. per-stroke overheads, CPU peak ~45%
(≈7 cores), ~27% sustained — up from 22% peak / 12% avg at session start.

**parallel_for use-after-free fixed** (`litestl/util/task.h`): the completion
Signal decremented `remaining` BEFORE locking `done_mutex`, so a
spuriously-woken caller could observe 0, return, and unwind the stack the
mutex/cv live on before the worker's lock/notify — Crashpad-verified AV
(`notify_one` on a destroyed cv) under rapid consecutive strokes; the pre-
rewrite parallel_for had the same shape. Decrement now happens under the lock.

Live-profiling recipe gotchas (also in memory): CDP evals need an explicit
`return`; without `--no-devtools` the first CDP page target is the DevTools
window; a hidden/minimized window suspends RAF *and* throttles timers (drive
work inline in the eval); the strokeTester runs dabs synchronously so RAF
never interleaves mid-stroke.

## Real mouse stroke (2026-07-15, final validation)

Driver: [`2026-07-15-mouse-stroke-profile-driver.mjs`](2026-07-15-mouse-stroke-profile-driver.mjs)
— synthesizes a genuine drag through Chromium's input pipeline
(`Input.dispatchMouseEvent` over CDP, 120 moves @ ~83Hz) with the window
visible, and a per-RAF recorder correlating dabs to frames. Chromium coalesces
mouse moves to one per RAF, so the interactive cadence is exactly
1 dab/frame.

| stroke | fps during stroke | dab (sample.total) | applyDabNative | notes |
|---|---|---|---|---|
| first after load (cold) | 28.9 | 23.9 ms | 10.9 ms | **348 ms first-dab hitch** (lazy attr materialization + first capture + JIT) |
| second (warm) | **59.1** | 6.8 ms | 2.3 ms | rayCast 0.20 ms, coPrev 0.44 ms, logSave 0.22 ms |

Warm real-mouse sculpting on the 1.5M mesh runs at display rate; the frame
(dab 6.8 ms + draw, ~12 MB slice upload) fits the 16.7 ms budget. Remaining
UX item: the cold first-stroke mouse-down hitch (~350 ms) — a candidate for
load-time prewarm (materialize the AttrSaver/orig columns + a hidden dab).

## Dyntopo real mouse stroke (2026-07-15, addendum)

Driver: [`2026-07-15-mouse-stroke-dyntopo-driver.mjs`](2026-07-15-mouse-stroke-dyntopo-driver.mjs)
(same input synthesis; triangulates the mesh and enables dyntopo — NOTE: on the
**toolmode's** `dynTopoSC`, not the brush's; the mousedown handler rebuilds the
brush copy's flags from the toolmode defaults). Defaults: clay 55 px, detail
10% of radius (PERCENT), maxSplits 1024, dynTopoSpacing 0.25, mirror on.

| stroke | fps | sample.total | dab.dyntopo | remesh ops |
|---|---|---|---|---|
| first (cold) | 2.0 | 505 ms | 401 ms ×20 | 156k collapses, 281k flips, **0 splits**, 5 rounds; 1.494M→1.411M verts |
| second (same path) | 2.7 | 367 ms | 212 ms | 87k collapses, 115k flips |

Findings:
1. **Decimation mode**: the default detail (10% of a 55 px brush) is far
   coarser than this mesh, so dyntopo mass-collapses the region — ~8k
   collapses + 14k flips per dyntopo dab across up to `maxRounds` 5 rounds.
   `maxSplits` (1024) budgets only splits; **collapses have no per-dab budget**,
   so collapse-heavy dabs run unbounded (200-650 ms). A `maxCollapses` budget
   (defer excess, like the split budget that fixed the split cascade) is the
   big lever.
2. **Per-dab full CSR rebuild**: the TS bridge hardcodes `setNeighborMode(1)`
   (CSR); each dyntopo dab bumps `topo_stamp`, so the autosmooth exec's
   `ensureRing1` rebuilds the entire ~1.4M-vert neighbor cache every dab
   (26-63 ms, measured inside the coPrev scope). Under dyntopo the topology is
   live/thawed — bsmooth could use LiveDisk neighbors and skip the cache.
3. Uploads 286-372 MB/stroke (topology churn → owner regens, expected).
4. **Flaky pre-existing crash**: `Mesh_triangulate` AV'd once out of three runs
   at 1.5M (fan callback reading the `.face.list` builtin attr,
   `triangulate.h:29` via `mesh_c_api.cc:51`) — untouched code this session;
   deserves its own investigation.

## Dyntopo fixes (2026-07-15, final addendum)

All three dyntopo-profile findings fixed (uncommitted, gated on
`sculptcore_brushes` 36/36 + `test_dyntopo_*`/`test_spatial_dyntopo`/
`test_meshlog_topo`/`test_brush`):

1. **`max_collapses` per-dab budget** (`DynTopoParams.max_collapses`, TS
   `DynTopoSettingsSC.maxCollapses`, default 1024, override bit
   `MAX_COLLAPSES = 1<<14`) — the split budget's analog for decimation-mode
   dabs — **plus a candidate-collection cap at 8× the remaining budget** for
   both splits and collapses, so a budgeted dab no longer collects/shuffles/
   MIS-walks the whole region's out-of-band edges to apply 2% of them.
2. **`effectiveNeighborMode()`** — a dyntopo step forces LiveDisk neighbors
   (topology is thawed anyway; CSR was an O(mesh) `ensureRing1` rebuild every
   dab because each dyntopo dab bumps `topo_stamp`).
3. **`triangulateMesh` thaws frozen topology at entry** — the "flaky"
   `Mesh_triangulate` AV was deterministic: any brush stroke freezes topology
   (dropping the live `f.l`/loop link columns), and a subsequent triangulate
   read the freed pages. Deterministic headless repro (gen → stroke →
   `Mesh_triangulate`) crashed before, survives now. The `n_ngon_faces`
   counter was verified exact (1.494M→0 across triangulate + strokes at
   500-subdiv), so counter drift is ruled out.

Real-mouse dyntopo strokes, defaults, 1.5M:

| stage | fps | dab.dyntopo | coPrev scope |
|---|---|---|---|
| before | 2.0-2.7 | 212-401 ms | 26-63 ms (CSR rebuild) |
| + collapse budget + LiveDisk | 6.2-6.9 | 114-128 ms | 2.6 ms |
| + candidate-collection cap | **10.5-11.5** | **62 ms** | 2.7 ms |

Remaining dyntopo cost is the region seed scan + the (unbudgeted) flip
companion work — real remesh work, further gains need parallel dyntopo.
