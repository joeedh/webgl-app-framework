# Plan: split spatial update into per-dab queries half + draw-time GPU half

*2026-07-14. Implements option A from
[research/2026-07-14-1949-spatial-gpu-regen-on-draw.md](../research/2026-07-14-1949-spatial-gpu-regen-on-draw.md):
the spatial tree's GPU buffer pipeline (partition / node→GPU-owner batch
assignment / plan / fill / upload / draw-batch rebuild) runs only from the draw
frame callback (`LiteMesh.drawQ`), while the per-dab call shrinks to the
correctness phases the next dab's queries need (split/merge, tris, bounds,
normals).*

## Goal / non-goals

- **Goal**: at most one GPU-buffer regeneration per rendered frame during a
  CPU sculpt stroke, instead of one per dab; identical rendered output and
  identical brush/query behavior.
- **Non-goals** (follow-ups, not this plan): moving normals to the draw half;
  making the C++ executor run the queries half internally; any change to the
  GPU-resident brush path (it already skips CPU spatial updates mid-stroke).

## Design summary

New engine API (names final unless something collides):

```cpp
/* spatial.h */
enum UpdatePhases {
  Update_Queries = 1 << 0,  /* split/merge, tris, bounds, normals */
  Update_Gpu     = 1 << 1,  /* partition, propagate, plan, fill, upload, batch */
  Update_All     = Update_Queries | Update_Gpu,
};

bool update(gpu::GPUManager *gpu);   /* unchanged signature: Update_All */
bool updateQueries();                /* new bound method: Update_Queries only */
```

- Both public entries call a private `updateImpl(gpu::GPUManager *gpu,
  UpdatePhases phases)`. `updateQueries()` passes `gpu = nullptr` (never
  dereferenced — no GPU phase runs).
- **`update(gpu)` keeps its exact signature.** A new zero-arg method is bound
  instead of adding a defaulted param, because changing a bound method's arity
  aborts the N-API addon at `require()` (`setArgNames` MARGS check).
- **Sticky cross-call state** (new members, since the two halves now run in
  different calls):
  - `pendingGpuTopology_ = false` — set by the queries half when it regens any
    leaf tris (today's local `topology_changed`) or when
    `applyDeferredNodeSplit`/`applyDeferredMerge` restructured nodes; consumed
    + cleared by the GPU half, where it drives
    `recompute_subtree_tri_counts()` + `assign_gpu_nodes()` (the
    `done_gpu_assignment` first-time gate stays in the GPU half).
- **Flag hygiene**: the queries half consumes only `Spatial_RegenTris`,
  `Spatial_RegenBounds`, `Spatial_UpdateNormals`. `Spatial_RegenGPU` /
  `Spatial_UpdateGPU` must survive it untouched so the GPU half's propagation
  scan (spatial.cc:2699-2703) still sees them. Audit `ensure_node_tris` /
  `regen_node_tris` / `update_node_normals` / split/merge for stray clears of
  GPU bits before relying on this.
- **Cadence**: `updatesSinceMerge_` advances in the queries half only
  (preserves today's per-dab merge metering; the draw-time full update also
  runs the queries half, matching today's drawQ behavior).
- **Return values**:
  - `updateQueries()` → bounds-changed (today's `update()` return semantics).
  - `update(gpu)` → bounds-changed **|| GPU-work-done** (`drawBatchUpdated`).
    Mid-stroke, per-dab `updateQueries()` consumes the bounds dirt, so without
    this the drawQ call would return false and skip the `meshRevision++` /
    `treeBatch` rebuild block (`litemesh.ts:3837-3850`). Side effects of the
    widened return: `meshRevision` (autosave blob invalidation) now bumps per
    frame mid-stroke — correct, geometry did change; `_flushRevision`
    (`litemesh.ts:1828`) may bump once more before serialize — harmless.
- **Unchanged**: `gpuStrokeActive` skip of `gpu_owned` buffers
  (spatial.cc:2717), thaw-before-tris-regen (queries half owns it),
  `requestedAttrs` versioning, `gpuLayoutGen` bump sites.

## Milestones

### M0 — Baseline (cheap, half a day max)

- Instrument dabs-per-frame + per-dab `spatial.update` wall time in the
  interactive path (temporary `CLAUDENOTE:`-tagged counters in
  `applyDabOne`, or `StrokeProfiler --profile` on the native harness).
- Record: a fast interpolated dyntopo stroke and a plain draw-brush stroke on
  a ~1M-tri mesh; note dabs/frame and ms split. This is the A side of the
  final A/B. Keep the numbers in this plan file.

**M0 results (2026-07-14, native backend, headless NW.js, litemesh-cube
subdiv=288 ≈ 1.0M tris, 61-point interpolated stroke → 21 samples / 42
per-dab `spatial.update` calls, radius 120px, strength 0.6):**

| scene | update calls | avg ms | min ms | max ms | total ms |
|---|---|---|---|---|---|
| draw brush | 42 | 4.70 | 3.30 | 12.70 | 197.2 |
| dyntopo    | 42 | 5.70 | 2.90 | 12.50 | 239.6 |

All 42 per-dab updates land inside one render frame (headless synchronous
stroke; interactively a fast stroke similarly batches many dabs per frame), so
the full-update GPU half runs ~42× per rendered frame where once would do.

**M4 A/B (same scenes/driver, per-dab site → `updateQueries()`):**

| scene | avg ms | max ms | total ms | vs M0 |
|---|---|---|---|---|
| draw brush | 3.67 | 5.0 | 154.1 | −22% avg, −61% max |
| dyntopo    | 4.80 | 11.5 | 201.4 | −16% avg |

The removed share (partition/plan/fill/upload/batch) now runs once per frame
in drawQ. Remaining per-dab cost is the queries half — normals dominate (the
planned follow-up moves normals to the draw half).

### M1 — Engine split (sculptcore C++)

1. `spatial.h`: add `UpdatePhases`, `updateQueries()`, `pendingGpuTopology_`,
   move `update(gpu)` body to `updateImpl(gpu, phases)`.
2. `spatial.cc`: gate the existing phase sequence:
   - `Update_Queries`: phases 0/0b (split + cadenced merge, advancing
     `updatesSinceMerge_`), tris collection + thaw + parallel
     `ensure_node_tris`, `regenDirtyBounds()`, parallel normals. Set
     `pendingGpuTopology_ |= topology_changed`.
   - `Update_Gpu`: partition gate consumes `pendingGpuTopology_ ||
     !done_gpu_assignment`; then propagation, `plan_regen_gpu_node`, unified
     fill, serial epilogue, draw-batch rebuild — all byte-identical code, just
     inside the gate.
   - `drawBatchUpdated` today is set in the queries-half scans (tris/normals
     collection). The GPU half must not depend on it: its own propagation scan
     of `RegenGPU|UpdateGPU` already finds the work (kernels always pair
     `UpdateNormals` with `UpdateGPU`). Verify this claim while editing; if
     any queries-half signal feeds the batch rebuild, make it sticky alongside
     `pendingGpuTopology_`.
3. `spatial/bindings.cc`: `BIND_STRUCT_METHOD(st, updateQueries)` (no args →
   no MARGS arity risk).
4. Build + smoke, in this order:
   - `node sculptcore/make.mjs build native` and run
     `node sculptcore/make.mjs test` (ctest) — grep build output for `FAILED`
     (sccache pipe-busy can fail compiles while exiting 0; retry after
     `sccache --stop-server` if seen).
   - `node sculptcore/make.mjs build wasm`.
   - `node sculptcore/make.mjs build node --smoke` — this is the arity-abort
     tripwire for the new binding.
5. Regenerate the TS bindings: `pnpm build` in `sculptcore/tools`
   (`tsx genTS.ts`; requires the fresh WASM build). Confirm
   `typescript/sculptcore/spatial/SpatialTree.ts` gains `updateQueries()`.
   Commit the generated tree as usual (don't call it out in the commit log).

### M2 — Engine regression test

- Add a split-parity case to the spatial test family (extend an existing
  `test_spatial*` file, or `tests/test_spatial_update_split.cc` wired through
  `tests/CMakeLists.txt` if none fits):
  1. **Query correctness after queries-only**: dirty a mesh the way a dab does
     (move verts + flag `UpdateNormals|UpdateGPU|RegenBounds`; run a small
     dyntopo dab for the topology case), call `updateQueries()`, assert
     `filterNodes` returns the leaves containing the moved verts and `castRay`
     hits the moved surface; assert leaves still carry
     `RegenGPU`/`UpdateGPU`.
  2. **Deferred-GPU parity**: two identical meshes + dab sequences; A calls
     `update(&gpu)` per dab, B calls `updateQueries()` per dab and one
     `update(&gpu)` at the end. Assert identical CPU-side buffer contents per
     GPU node (pos/nor/attr streams — direct memcmp of the CPU staging data,
     not frame-encoded GPU readback) and identical draw-batch command sets.
  3. **Interleave**: B continues dabbing after the flush; a second flush must
     converge again (catches sticky-flag bugs: `pendingGpuTopology_` not
     re-armed, cleared GPU bits).
- Full `node sculptcore/make.mjs test` green (modulo pre-existing baseline
  failures).

### M3 — TS integration (parent repo)

1. `scripts/editors/view3d/tools/sculptcore_ops.ts:659-663`:
   ```ts
   if (!this.gpu || this.gpu.shadow) {
     mesh.regenTreeBatch()
     if (this.gpu?.shadow) {
       mesh.spatial.update(mesh.wasm.gpu)   // shadow-verify diffs CPU buffers per dab
     } else {
       mesh.spatial.updateQueries()
     }
   }
   window.redraw_viewport(true)
   ```
   Also the batch/scripted entry (`sculptcoreStroke`, ~:736/:1028) — same
   substitution on its per-dab site; scripted runs that dump buffers rely on
   an explicit full update at the end (verify each caller; the test-support
   files `litemesh_brushtest_support.ts` / `test_harness.ts` already call full
   `spatial.update`).
2. `scripts/editors/view3d/tools/sculptcore_gpu_stroke.ts` mid-stroke
   `syncFromGpu` (~:661-664): `update` → `updateQueries` (its purpose is query
   currency after readback; the frame's drawQ does the GPU half).
3. `scripts/lite-mesh/litemesh.ts`: no code change expected at :3837 — but
   re-read the `update()==true` block against the new return semantics
   (`treeBatch` destroy/rebuild is the historical double-free area,
   :3841-3845). Leave every other full-update site alone (:1054, :1120, :1808,
   :1828 `_flushRevision`, multires paths).
4. `pnpm typecheck` (tsgo, runs gen:paths first) and `pnpm test`. Kill stale
   `nw.exe` before the NW jest suites.

### M4 — Behavioral verification (app level)

- **Undo fidelity**: run the debug-app `save_pos`/`assert_pos` dyntopo-undo
  scripts and the existing headless stroke jest suites (they bracket strokes
  with full updates — should be unaffected, this is the regression net).
- **Interactive** (`pnpm run nwjs`, drive via `nwjs/cdp.mjs` where useful):
  - Fast interpolated dyntopo stroke on a dense mesh — look for missing /
    stale geometry at leaf borders and popping at frame boundaries.
  - Stroke with `drawBVH` on (treeBatch rebuild path now triggers off the new
    return value every frame mid-stroke).
  - Undo / redo after a dyntopo stroke; save + reload a .wproj mid-session
    (`_flushRevision` path).
  - GPU brush (kelvinlet) stroke immediately after a dyntopo stroke —
    `tryEnableScatter`'s `gpuLayoutGen`-keyed VBO cache must re-resolve
    against the draw-time layout.
  - Shadow-verify soak: `sculptcore.gpu_brush_verify` on, confirm per-dab
    diffs still pass (shadow branch kept the eager full update).
- **Perf A/B** against M0's numbers, same scenes: expect per-dab wall to drop
  by the plan/fill/upload/batch share, frame rate flat or better; confirm the
  GPU half cost appears once per frame in drawQ instead. If dabs/frame ≈ 1 in
  a scenario, a wash is the expected result, not a regression.

### M5 — Docs, cleanup, commit

- Update `sculptcore/documentation/spatial.md` (update-pipeline section: the
  two halves, who calls which, sticky topology state) and the one-line
  pipeline mention in `sculptcore/CLAUDE.md` if wording no longer matches.
  Brief note in `documentation/gpuBrushes.md` only if its update-cadence
  description now reads wrong.
- Remove the M0 instrumentation and every `CLAUDENOTE:`.
- Commit choreography (branch-name match rule): sculptcore commit first, then
  parent commit bumping the gitlink, as one logical change per milestone or
  one final squash — sculptcore and parent on matching branch names (suggest
  `spatial-update-split`), co-committed. `pnpm test` before each parent
  commit.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Stale bounds/tris break next-dab queries | They can't by construction — queries half still runs per dab; M2 case 1 pins it |
| GPU flags cleared by a queries-half helper → geometry stops updating on screen | M1 flag audit + M2 cases 2/3 |
| `pendingGpuTopology_` lost/never cleared → partition churn or stale partition | M2 case 3 interleave test |
| New return semantics regress treeBatch double-free guard | M4 drawBVH-on stroke; the null-before-rebuild guard at litemesh.ts:3841 stays |
| N-API addon aborts at require after binding change | zero-arg method (no MARGS); `build node --smoke` in M1 |
| sccache flake ships stale binaries mid-plan | grep FAILED on every build; `sccache --stop-server` + rebuild on hit |
| Shadow-verify false diffs | shadow branch keeps eager full update (M3.1); soak in M4 |

## Follow-ups (out of scope)

- Move the normals pass to the draw half (A/B: plane/smooth brush quality vs
  per-dab cost).
- Have C++ `applyDab`/`applyDynTopoDab` run the queries half internally so
  query freshness is engine-guaranteed rather than a TS-side contract.
- Revisit `mergeCadence_` units (updates → dabs vs frames) if merge behavior
  measurably changes.
