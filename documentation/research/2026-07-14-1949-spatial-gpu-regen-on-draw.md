# Deferring spatial-tree GPU buffer regeneration to draw time

*2026-07-14. Investigation: should sculptcore's spatial tree regenerate its GPU
buffers (including intermediate node→GPU-node batch assignment) only on draw,
and if so, from the draw frame callback or after flushing the brush dab queue?*

## TL;DR — recommendation

**Split `SpatialTree::update()` into a queries half and a GPU half, and let the
existing per-frame call in `LiteMesh.drawQ` carry the GPU half.** Do *not* hook
the dab-queue flush: it fires more often than frames, so it coalesces less, and
the draw-path plumbing already exists and is already the model the engine and
the GPU-brush path assume.

- **Per dab** (current eager site, `sculptcore_ops.ts:661`): run only the
  correctness phases — deferred leaf split/merge, leaf-tris regen, bounds
  regen, and (initially) normals. These cannot be deferred: the next dab's
  `filterNodes` / `castRay` prune on `node->aabb` and walk `data->tris`.
- **Per frame** (`LiteMesh.drawQ`, `litemesh.ts:3837` — already calls
  `spatial.update(gpu)` every frame): run the GPU-only phases — partition
  (`assign_gpu_nodes`), leaf→owner dirty propagation, `plan_regen_gpu_node`,
  the parallel fill/slice pass, the buffer-upload epilogue, and the draw-batch
  rebuild.

The dirty flags (`Spatial_RegenGPU` / `Spatial_UpdateGPU`) simply accumulate
across dabs and are consumed once per frame — coalescing is free, because the
flag → owner routing already dedupes per node.

## Current state (verified)

### The eager path

`SculptPaintOp.applyDabOne` ends with, on the CPU / shadow-verify branch
(`scripts/editors/view3d/tools/sculptcore_ops.ts:659-663`):

```ts
if (!this.gpu || this.gpu.shadow) {
  mesh.regenTreeBatch()                 // frees the leaf-bounds debug batch only
  mesh.spatial.update(mesh.wasm.gpu)    // FULL update, incl. all GPU phases, PER DAB
}
window.redraw_viewport(true)
```

`window.redraw_viewport` coalesces into one `requestAnimationFrame`
(`view3d.ts:1938`), so several dabs (the stroke driver's timer flush,
`stroke_paint_op.ts:201`, routinely emits multiple spline-interpolated
`PaintSample`s per tick) each pay a full GPU regen while producing **one**
frame.

The draw path *also* updates: `LiteMesh.drawQ` (`litemesh.ts:3837`) calls
`this.spatial.update(this.wasm.gpu)` before `getDrawBatch()` every frame — a
no-op mid-stroke today because the dab already flushed. So the safety net for
draw-time regeneration is already in place and battle-tested; nothing new needs
scheduling.

### What `update()` does, phase by phase (`spatial.cc:2575`)

| Phase | Needed for brush queries? | Needed for draw? |
|---|---|---|
| `applyDeferredNodeSplit` / `applyDeferredMerge` (spatial.cc:2585/2592) | yes (BVH balance) | indirectly |
| leaf tris regen (`ensure_node_tris`, spatial.cc:2600-2639) | **yes** — `castRay` walks `data->tris`; bounds derive from tris | yes (fills read tris) |
| `regenDirtyBounds` (spatial.cc:2641) | **yes** — `filterNodes_recurse` prunes on `node->aabb` (spatial.cc:65); stale AABBs silently drop leaves whose verts moved out | yes (culling) |
| normals (`update_node_normals`, spatial.cc:2646) | partially (brush normal reads) | yes (shading) |
| partition: `recompute_subtree_tri_counts` + `assign_gpu_nodes` (spatial.cc:2680) | no | **GPU-only** |
| leaf→GPU-owner dirty propagation (spatial.cc:2699) | no | **GPU-only** |
| `plan_regen_gpu_node` (serial, buffer alloc; spatial_gpu.cc:340) | no | **GPU-only** |
| unified parallel fill (`fill_regen_slice` + `update_gpu_node_slice`) | no | **GPU-only** |
| serial epilogue (`update_buffer=true`, fallback `regen_gpu_node`) | no | **GPU-only** |
| draw-batch rebuild (spatial.cc:2894) | no | **GPU-only** |

The bottom six rows are the deferral target. The per-dab cost saved is the
plan/fill/upload/batch work times (dabs-per-frame − 1); the recent meshlog/dab
profiling series found the GPU fill work a substantial per-dab component, and
slice fills for a leaf touched by N dabs in one frame collapse to one fill.

### The engine already assumes draw-time flush

Two strong precedents:

1. `CommandExecutor::applyDynTopoDab`'s doc comment
   (`brush_executor.h:1189-1194`) explicitly omits `tree->update()` because
   "the TS sculpt path already drives spatial.update() each frame
   (LiteMesh.drawQ)". The C++ author's mental model is already
   frame-cadence flush; the per-dab TS call is the outlier.
2. The pure-GPU-resident brush path (`sculptcore_gpu_stroke.ts:476-484`) skips
   CPU `spatial.update` entirely mid-stroke — scatter into node VBOs + bare
   `redraw_viewport()`; rendering currency comes from the scatter pass and the
   tree tolerates it (`gpuStrokeActive` makes update() skip `gpu_owned`
   buffers, spatial.cc:2717). Draw-cadence GPU currency is proven.

### What cannot be deferred (why a plain "move the call" fails)

Simply deleting the per-dab `spatial.update()` and relying on `drawQ` is
tempting (the call already exists) but wrong:

- **`filterNodes` mis-prunes on stale bounds.** Kernels flag
  `Spatial_RegenBounds` after moving verts; `regenDirtyBounds` only runs in
  update(). The next dab's node selection (`tree->filterNodes`,
  `brush_executor.h:1354/1392`) would drop leaves whose geometry crossed its
  stale AABB → missed verts at leaf borders, worse at high brush speed.
- **`castRay` (TS raycast per dab) walks stale tris after dyntopo** — the dab
  center would be computed against deleted/old triangles.
- **Deferred split/merge is metered by update() calls** (`mergeCadence_` counts
  updates); leaves would overfill for a whole frame's worth of dabs. Probably
  tolerable (queries just iterate more verts) but it changes tuning.

Hence the split: the correctness phases stay per-dab, only the GPU pipeline
moves to draw.

## Option comparison

### A. GPU half in the draw frame callback (recommended)

`LiteMesh.drawQ` already calls update() per frame. Change the per-dab site to a
queries-only update and drawQ keeps calling the full one.

- **Max coalescing**: exactly one GPU regen per rendered frame, regardless of
  dab rate, timer cadence, or how many `flushDriver` ticks land between frames.
- **Zero new scheduling machinery** on the TS side.
- Consistent with the GPU-brush path and the C++ executor's stated model.
- Multi-viewport safe: first `drawQ` pays, later ones see clean flags (same as
  today).
- Headless/serialize paths unaffected: `_flushRevision` (`litemesh.ts:1828`),
  the test harnesses, and native debug-app all call full `update(gpu)`
  explicitly already.

### B. Full update after flushing the brush dab queue (rejected)

Hook `flushDriver()` (`stroke_paint_op.ts:201`) or the end of the poll loop.

- Coalesces only *within* one poll batch. The flush timer runs at input cadence
  and can fire several times per frame — GPU regen would still run more than
  once per rendered frame. Strictly worse coalescing than A.
- `stroke_paint_op.ts` is the brush-agnostic base class (also used by non-
  sculptcore paint ops); putting spatial-tree knowledge there is a layering
  smell. The sculptcore-specific subclass hook would end up duplicating what
  drawQ already does.
- Still needs the queries/GPU split anyway (dabs within one batch need fresh
  bounds between each other), so it saves no engine work over A — it only adds
  an extra flush site.

The only argument for B is keeping GPU work off the render callback's critical
path (frame-time spike when a big regen lands). But that spike exists today —
drawQ's update() already performs full regens after undo/attr changes — and a
dab-queue flush runs on the same thread anyway, so B doesn't actually move the
work off the frame; it just moves it earlier in the same event-loop turn.

## Proposed design

### Engine (C++)

Add a phase mask rather than a second monolith, keeping one pipeline:

```cpp
enum UpdatePhases { Update_Queries = 1, Update_Gpu = 2, Update_All = 3 };
bool update(gpu::GPUManager *gpu, UpdatePhases phases = Update_All);
```

Practical notes:

- **Bind it as a NEW method** (e.g. `updateQueries()`), not by adding a
  defaulted param to the bound `update` — changing a bound method's arity
  aborts the N-API addon at `require()` via `setArgNames`
  (`bindings.cc` MARGS), and every existing caller (debug app, tests, TS)
  keeps working untouched. Internally both bound entries call the masked
  implementation.
- Queries half = phases 0/0b (split/merge), tris regen, bounds regen, normals.
  GPU half = partition, propagation, plan, fill, epilogue, draw-batch rebuild.
  The phase boundary is clean in `update()` today (spatial.cc:2680 onward is
  GPU-only); `topology_changed` must become sticky state (a member, set by the
  queries half, consumed+cleared by the GPU half) since the two halves now run
  in different calls.
- Flag hygiene: the queries half clears `Spatial_RegenTris`-adjacent state but
  must **leave `Spatial_RegenGPU` / `Spatial_UpdateGPU` set** for the GPU half.
  Today tris regen and GPU regen consume different flag bits, so this mostly
  falls out — verify `ensure_node_tris`/`regen_node_tris` don't clear GPU bits.
- Return values: queries half returns the bounds-changed bool (what
  `_flushRevision`/drawQ key `meshRevision` on today); the GPU half should
  return `drawBatchUpdated` so drawQ's `treeBatch` (leaf-bounds debug overlay)
  rebuild and meshRevision bump still trigger — with the per-dab GPU work gone,
  drawQ's update() now returns true mid-stroke, which is the *intended*
  behavior (autosave blob invalidation moves from per-dab to per-frame).
- `mergeCadence_` currently counts update() calls; decide which half advances
  it (the queries half, to preserve per-dab metering).

### App (TS)

- `sculptcore_ops.ts:661`: `mesh.spatial.update(mesh.wasm.gpu)` →
  `mesh.spatial.updateQueries()`. Keep `mesh.regenTreeBatch()` where it is.
- `sculptcore_gpu_stroke.ts` mid-stroke readback sync (`syncFromGpu`, ~:663)
  gets the same substitution.
- **Shadow-verify keeps the full eager update**: `gpu_brush_verify` diffs CPU
  buffers against the GPU per dab, so the shadow branch must still regenerate
  CPU GPU-buffers per dab. Gate: `if (this.gpu?.shadow) full else queries`.
- `LiteMesh.drawQ` (`litemesh.ts:3837`) is unchanged.
- Leave every other full-update call site (`litemesh.ts:1054/1120/1808/1828`,
  test supports) untouched.

### Follow-up (optional, measure first)

Normals could arguably move to the GPU/draw half too (they're the other
parallel per-dab pass), but plane/smooth-class brushes and dyntopo read vertex
normals between dabs; keep them per-dab in the first pass and A/B moving them
later. Same for making the C++ `applyDab` run the queries half internally
(engine-guaranteed freshness) instead of trusting the TS call — nice
hardening, not required.

## Risks / verification

- **Correctness gates**: existing headless stroke tests + `assert_pos`
  undo scripts; a stale-bounds regression would show as missed geometry at
  leaf borders during fast strokes — verify with a long interpolated stroke
  (many dabs/frame) and compare against a per-dab-update control.
- **Scatter-table / layout caches** (`gpuLayoutGen`-keyed, used by GPU-brush
  `tryEnableScatter`): layout changes (partition) now happen at draw time.
  GPU-brush strokes disable dyntopo, so layout is stable mid-stroke; the
  cache re-resolves on gen mismatch regardless. Low risk, but exercise a
  GPU-brush stroke immediately after a dyntopo stroke.
- **First frame after undo / attr switches**: those paths flag every leaf and
  rely on drawQ's update — unchanged behavior, but they now share the code
  path with mid-stroke flushes; watch the update-returns-true → treeBatch
  destroy/rebuild interplay (the historical double-free area,
  `litemesh.ts:3841-3845`).
- **Perf win check**: instrument dabs-per-frame during an interactive stroke
  (typically 2–5 at high input rate); expected saving ≈ (dabs/frame − 1) ×
  (plan + fill + upload + batch-rebuild time). The queries half (tris + bounds
  + normals) remains per-dab, so worst case (1 dab/frame) is a wash.
