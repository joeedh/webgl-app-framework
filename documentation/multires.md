# Multires subsurf (app wiring)

Multiresolution subdivision sculpting on a `LiteMesh` (workstream S of
[sculptcore/documentation/plans/displacementAndSubSurf.md](../sculptcore/documentation/plans/displacementAndSubSurf.md)).
The engine (`sculptcore/source/subdiv/`: uniform Catmull-Clark refiner +
stencil tables, per-quadrant grids store, level materialization + LRU,
down-refit) owns all multires state; the app attaches one materialized level
at a time. The canonical state is the **grids store** (per-level
frame-relative `float3` displacement over implicit grid topology); the
attached level is a real `mesh::Mesh` + `SpatialTree`, so the whole existing
stack (brushes, meshlog, draw, picking) applies unchanged.

## Feature flag

The UI + ops are gated on the **`sculptcore.multires`** feature flag (default
**off**; Settings editor → Feature Flags, see [featureFlags.md](featureFlags.md)),
effective on restart. The engine seam itself is always available (the
integration test drives it directly).

## The attach model

When a stack is live, `LiteMesh.mesh` / `LiteMesh.spatial` are **non-owning
views** of the active level's slot (the C++ `Multires` owns both; the app
never frees them) and the original mesh is parked as `_multiresCage`
(`scripts/lite-mesh/litemesh.ts`, mirroring the engine debug app's
`Scene::attachMultiresLevel`). Level trees are materialized with the app's
draw-path tuning (`Multires.treeLeafLimit/DepthLimit/GpuTriTarget`, set via
`Multires_new`), so an adopted tree matches an app-built one. Every attach
(`_attachMultiresLevel`) swaps the views, rebuilds the tree-derived GPU
batches, and drops the pipeline/binding caches (the `_rebuildSpatial`
invalidation, factored into `_teardownTreeState` / `_invalidateGpuCaches`).

State interactions:

- `_rebuildSpatial()` under a live stack re-attaches the active slot instead
  of rebuilding (the tree is stack-owned).
- `_replaceMesh()` (triangulate / quad-remesh / blob-restore undo) **flattens**
  a live stack: the stack + parked cage are freed and the incoming mesh
  becomes a plain mesh.
- **Serialization does not persist the stack**: saving while active captures
  the flattened active level (same debt as the VDM store; X-track work).
- Dyntopo and the stroke-end auto-defrag are force-gated off on a multires
  level mesh (`sculptcore_ops.ts`) — both would desync the fixed grid
  topology the writeback assumes. GPU brushes remain eligible (their CPU sync
  lands before the stroke-end writeback).

## Ops and panel

LiteMesh properties tab (ObData) → **Multires** panel
(`LiteMesh.buildPropertiesTab`), all through undoable ToolOps
(`scripts/lite-mesh/litemesh_ops.ts`):

- `litemesh.multires_enable(levels=N)` — refine the mesh into an N-level
  stack (cage untouched) and attach the finest level. Undo deletes the stack
  (no snapshot needed; redo rebuilds identical level topology, so later
  meshlog steps replay cleanly).
- `litemesh.multires_set_level(level=L)` — write back the outgoing level and
  attach L. Lossless (S3 gate), so undo just switches back. The panel's
  Level slider commits through this op with drag-merge (one undo entry).
- `litemesh.multires_down_refit()` — least-squares-fit the level below the
  active one to the active surface (`Multires::downRefit`: Jacobi-CG on the
  stencil normal equations; the active surface is preserved by re-expressing
  its displacement against the new base). Store-blob undo.
- `litemesh.multires_delete()` — free the stack, re-adopt the cage. Undo
  rebuilds the stack from the (unchanged) cage and restores a store-blob
  snapshot.

Strokes on the active level go through the normal sculpt seam; the stroke-end
epilogue and `SculptPaintOp.undo/redo` call `mesh.multiresWriteback()` to fold
positions into (or re-sync) the grids store. Level changes ride the undo
stack, so a stroke undone after a level switch replays against the correct
level mesh without per-step level bookkeeping.

## Backend seam

The C-API (`sculptcore/source/subdiv/c-api/subdiv_c_api.cc`) is threaded
through both backends per the 4-place rule: `Multires_new/free/
setActiveLevel/activeMesh/activeTree/writeback/downRefit` plus the store-blob
pair (`Multires_serializeStore/restoreStore`, surfaced as
`Multires_storeBlob`/`Multires_restoreStoreBlob` on `IWasmInterface`).
`maxLevel()`/`activeLevel()` are bound struct methods on the `Multires`
handle. N-API wraps live in `source/napi/napi_runtime.{h,cc}`
(`multires*` exports); slot mesh/tree cross as non-owning bound views.

## Gates

- Engine: `sculptcore` ctest `test_multires` (S3 losslessness, LRU, edited
  writeback, **down-refit**: residual halves, fine surface preserved, level 1
  bit-untouched), `test_multires_stroke`, `test_grids_store`, `test_subdiv`;
  debug verbs `multires_init` / `multires_level` / `multires_refit` /
  `save_disp` / `assert_disp`.
- App: `tests/integration/sculptcore_multires.test.ts` — boots both backends
  headlessly on `litemesh-cube`, drives
  `scripts/lite-mesh/litemesh_multirestest_support.ts` (`__multiresTest()`):
  enable → lossless round-trip → real DRAW stroke + writeback → meshlog
  undo/redo resync → down-refit (fine preserved, coarse moved) → delete.
  Cross-backend position checksums are **bit-identical**, including the CG
  down-refit result (fma-anchored stencils, double CG accumulators).

## Known debts

- No `.wproj` persistence of the stack (flatten-on-save), no autosave
  coverage; rides X-track serialization work.
- Production draw integration with the GPU stencil amplification (S5) and
  V's tessellated tier is X3.
- The finest-level LRU default (3 residents) and level cap (7 in the enable
  op) are untuned defaults.
