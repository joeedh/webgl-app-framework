# Displacement, sculpt layers & multires — completion report

*What the `displacementAndSubSurf` plan built, 2026-07-02 → 2026-07-07.*

This is the retrospective for the displacement/subsurf effort — the plan is
[`sculptcore/documentation/plans/displacementAndSubSurf.md`](../../sculptcore/documentation/plans/displacementAndSubSurf.md)
(now marked PLAN COMPLETE, with the full per-stage ledger), the design it
implements is
[`sculptcore/documentation/final-displacement-architecture.md`](../../sculptcore/documentation/final-displacement-architecture.md),
and the user/developer guides are
[`documentation/multires.md`](../multires.md) and
[`documentation/sculptLayers.md`](../sculptLayers.md). Everything below is
merged to `master` in both repos, gated on both backends (WASM and native
N-API).

## What a user gets

- **Sculpt layers** (`sculptcore.sculpt_layers`): re-weightable displacement
  layers on a LiteMesh — a Layer Draw brush that writes into the active
  layer, plus a properties-tab stack (weight / enabled / frozen, all
  undoable) with a compositor keeping evaluated positions current.
- **Multires subsurf** (`sculptcore.multires`): Catmull-Clark multiresolution
  sculpting. Enable refines the cage into an N-level stack; you sculpt any
  level, switch levels losslessly (level switches ride the toolstack), refit
  coarser levels to the fine surface (CG least-squares `down_refit`), and
  delete back to the cage. Dyntopo force-gates off on level meshes.
- **Vector-displacement sculpting** (`sculptcore.vdm_sculpt`): a Ptex-style
  texel displacement carrier on top of the mesh. With a VDM store attached,
  Draw dabs splat tangent-space texels instead of moving vertices; texel
  edits ride the same undo press as everything else. Cross-carrier bakes go
  both ways — **Apply to Mesh** (texels → real geometry) and **Capture to
  VDM** (geometric detail → texels, surface drops onto the smooth base) —
  and a clamp-hit surfaces an "add a multires level" note.
- **Two VDM render paths**: the default fragment tier (displacement applied
  as shading on the base mesh — cheap, live-sculpt friendly) and the
  **Displaced Preview** toggle (`tessellatedDisplay`): the finest level is
  GPU-amplified through the subdivision stencils with VDM applied at the
  vertices — true displaced silhouettes while editing a coarse level.
- **Persistence**: the multires stack and the VDM store both survive
  `.wproj` save/load (the cage is the saved mesh; stack shape, grids store,
  and the VDM blob ride the LiteMesh stream). This retired the long-standing
  flatten-on-save debt.

## Architecture in one paragraph

The multires **grids store** is canonical: per-cage-corner grids of
per-level, frame-relative `float3` displacement with implicit topology,
chunked so levels can be evicted to compressed RAM (X5). Levels materialize
one at a time as real `mesh::Mesh` + `SpatialTree` views the app attaches
(cage parked). The **VDM store** is a sparse tiled texel carrier behind one
`sample(face, u, v)` seam with two backends — UV atlas and Ptex (per-grid
lattices with guard-ring skirts synced through the grids' transpose
adjacency). Displacement is always expressed in the **F3 frame** (smoothed
normal + cross-field tangent, `t ⊥ n`, `b = n × t`, frames on the smoothed
base), and the single most load-bearing invariant is **bake ≡ render**:
the splatter, both render tiers, and both bake directions use the same
sample seam and the same frame construction, so detail moves between
carriers without popping.

## Workstream ledger

- **F — foundation** (F1–F3): the sculpt-layer attribute category +
  compositor, per-face displacement bounds + `.detail.carrier` tags on the
  spatial tree, and the F3 frame provider. The notable fix: cross-backend
  frame parity broke at the ulp level on curved bases because
  `estimatePrincipalDir` used libm transcendentals — reformulated
  transcendental-free (normal-chord dihedral weights + half-angle
  identities), restoring exact parity anchors.
- **V — VDM carrier** (V1–V5): atlas `VdmStore` with self-inverse tile-delta
  undo, the brush splatter (world-space falloff from the displaced point,
  tangent inversion, `α·ρ_min` fold clamp), the fragment render path (GPU
  tile residency with dirty-slot drain), fold/overhang **promotion** to real
  geometry (one undo press reverts topology + seeds + texels together), and
  the sculpt-layer app wiring (LAYER_DRAW tool + panel).
- **S — subsurf** (S1–S5): the CC refiner with cached stencil tables whose
  row evaluation *is* the canonical position arithmetic (fma-anchored,
  bit-shared with the GPU SpMV), the grids store, level materialization with
  a per-level LRU, the multires sculpt loop (stroke-end writeback, edit-free
  switches lossless), and native-device GPU stencil amplification. The app
  pass added the level ops/panel, `downRefit`, and bit-identical
  wasm↔native gates including the CG solve.
- **X — convergence** (X1–X5):
  - **X1**: VDM on multires — grid-chart UVs synthesized at materialization
    (a pure function of topology, so charts are level-consistent and
    backend-identical), `topoLocked` gating promotion off on level meshes
    (the subsurf clamp is a true ceiling), and the add-a-level prompt
    signal.
  - **X2**: the Ptex backend — a *mode* in `VdmStore`, not a class
    hierarchy; per-grid `R_g×R_g` lattices with one-texel guard rings copied
    through the S2 adjacency, so bilinear is seamless with zero render-time
    adjacency lookups; the `VDM_PTEX` fragment sampler recovers the grid
    from the packed chart UV.
  - **X3**: the tessellated render tier — the S5 stencil SpMV re-dispatched
    on the renderer's own WebGPU device (positions + frames amplified
    together), a finalize kernel displacing each amplified vertex by its
    texel and computing geometric normals over the *displaced* positions
    (canonical-owner writes, deterministic at seam replicas), split-cached
    so texel-only edits re-run just the finalize. Plus the interactive VDM
    app pass: lifecycle ops, Draw-dab routing to the splatter, logged texel
    undo.
  - **X4**: cross-carrier bakes. Apply walks each vertex's own param through
    the frame (bake ≡ render). Capture turned out nearly free: the grids
    store's disp is *already* frame-space displacement against the smoothed
    base — the same space as VDM texels — so capture is a bilinear resample
    into the texel lattice, with the surface dropping *exactly* onto the
    smooth base. Stage 3 added `.wproj` persistence.
  - **X5**: grids-store eviction. "Disk" is compressed RAM by design —
    `GridsStore::elem` is a synchronous hot seam and WASM has no synchronous
    disk IO — lz4 per (channel, level), transparent rehydration on first
    touch, budget policy finest-first and never the active level. A native
    mmap/spill pass can layer under the same seam later.

## Hard-won findings (the transferable ones)

- **Never put libm transcendentals in cross-backend parity anchors.** Chord
  lengths and half-angle square-root identities (only `+ − × ÷ √`) are
  IEEE-exact; `acos`/`atan2`/`sin`/`cos` are not.
- **fma is a contract, not an optimization.** The CPU stencil chain and the
  GPU SpMV are bit-shared only because both sides use explicit fma in
  ascending-row order — and Dawn's D3D12 path *unfuses* WGSL fma, so gates
  split into: marshal-seam bit-exactness proven by a JS fma-exact
  evaluation, display-tier tolerance for the GPU result, and exact
  cross-backend GPU checksums.
- **Bake ≡ render, everywhere.** Never derive a frame two different ways on
  two sides of a bake. This is why capture/apply round-trip to 0.33% of max
  displacement (pure double-bilinear discretization) and why positions that
  pass through the disp encoding (`frameᵀ` then `frame` = two fp roundings)
  must be gated by residual, never checksum.
- **Undo owns object lifetime.** MeshLog chunks hold non-owning `VdmStore`
  pointers, so lifecycle ops *release* the store instance instead of freeing
  it, and the apply op refills the *same* instance in place
  (`VdmStore_restoreBlob`). Free-and-replace would leave stroke history
  dangling.
- **Canonical serialization doubles as a determinism anchor.** Tile-map
  iteration order reshuffles on delta remove+reinsert; sorting tiles by key
  in `VdmStore::write` made undo/redo blobs byte-identical and saves
  deterministic.
- **Async GPU state needs readiness seams.** The tessellated build races
  screenshots without a `tessReady` poll; a stale WASM binary once let the
  fragment tier convincingly impersonate the tessellated one (rebuild every
  backend after adding bound methods).
- **Measure the live data, not the buffers.** Two test-metric bugs traced to
  reading raw leaf VBOs (per-leaf duplication + stale slack slots): the
  symmetrize gate (fixed via `dumpVertCo`) and the multistep-GPU gate (fixed
  via unique-position-vs-mesh comparison clamped to `total_verts`).

## Verification

Every stage gated on both backends before merging: `test_multires` /
`test_vdm_*` ctest gates engine-side; the `sculptcore_multires` integration
suite grew from 15 to 61 tests (level round-trips, stroke undo/redo, VDM
splat/render screenshot A/Bs, amplify parity, interactive sculpt + bakes,
persistence round-trip); plus the layers/vdm/parity/brushes/gpu_brush/
boundary/autosave suites (194 tests total in the final sweep). Cross-backend
equality is asserted with checksums where the math is exact (stencils, CG,
blobs, tile counts) and with residuals where fp re-encoding is inherent.

## Remaining debts (all documented in `multires.md` / the plan)

- External interchange export of the VDM (EXR for other DCCs); the store
  blob is app-internal. Any exporter must match the splatter's frame
  convention.
- Per-face fragment-vs-tessellated carrier mixing is dormant until a
  demotion path exists (promotion is gated off on locked level meshes, so
  carrier tags are uniformly VDM there).
- LiteMeshes are skipped by the NormalPass entirely (no SSAO — a pre-plan
  M6 gap), and SSS-MRT is latently broken for *all* LiteMesh draws (the
  batch executor is seeded single-target); both are LiteMesh-wide items.
- LRU/level-cap/store-budget defaults are untuned; per-grid Ptex resolution
  adaptivity is unused; >L6 stencil chunking vs the 128 MiB binding limit.
- One precisely-scoped open engine bug from the follow-up triage: after
  heavy dyntopo churn the *forward* pass draws a handful of phantom corners
  (dead elements lingering in a leaf's sets — incremental currency, not
  undo/redo). `test_dyntopo_multistep_gpu` stays red on exactly this.
