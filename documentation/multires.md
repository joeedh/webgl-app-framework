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

## VDM on the finest level (X1)

Materialized level meshes carry synthesized **grid-chart UVs** (`uv` FLOAT2,
`AttrUse::UV`; one chart per cage-corner grid in a ⌈√G⌉-per-row atlas layout
with an inset gutter — `Multires::assignGridUVs`). The layout is a pure
function of topology, so charts are identical at every level and across
backends: a VDM authored at the finest level renders (fragment tier) from any
level's UVs. Level meshes are `topoLocked`: dyntopo stays off, and VDM
**promotion is gated off in the engine** — the splat clamp `α·ρ_min` is a
true ceiling; the per-splat clamp count is exposed as
`wasm.Vdm_lastSplatClamped()` (the "add a multires level" prompt signal —
surfacing it in the UI rides the X3/X4 app pass, as does interactive store
lifecycle / per-dab carrier routing). `_attachMultiresLevel` refreshes frames
+ carrier tags when a store is attached, so `hasVdm` rendering survives level
switches. Driver/gate: `__multiresVdmTest()`
(`litemesh_multirestest_support.ts`) in the `sculptcore_multires` integration
test — splat counts, prompt signal, AND raw atlas bytes are bit-exact
cross-backend (the F3 frame provider is transcendental-free since the X1
follow-up; see the plan's X1 note).

## Ptex carrier (X2)

`VdmStore` runs two backends behind `sample(face, u, v)`
(`VdmStoreParams.backend`): the UV **atlas** (polygon bases) and **PTEX** —
per-grid `R_g×R_g` texel lattices keyed on the S2 cage-corner grids, each with
a one-texel **guard ring** copied from its neighbours through the grids'
transpose adjacency (`syncGridSkirts`; refreshed for touched grids + link
targets at splat end), so bilinear is seamless across patches with zero
render-time adjacency lookups. The splatter rasterizes per-grid via the exact
`.ptex.c.grid`/`.ptex.c.uv` corner attrs `assignGridUVs` emits. The fragment
path stays UV-routed: the `VDM_PTEX` WGSL sampler recovers the grid from the
packed chart uv (`floor(uv·cpr)`), reads a flat per-grid offset table
(`gpuPtexTableOut`, uploaded as an i32 texture on the page-table binding), and
taps the (R+2)² storage lattice. App setup: `Multires.vdmAdjacencyOut` →
`VdmStore.configurePtex` (both bound methods), then attach/splat as usual —
`attachVdmStore` detects the backend and the renderengine folds `VDM_PTEX`
into the material hash. Gate: the `sculptcore_multires` screenshot A/B
(ptex≠flat 0.295, native↔wasm 0.0092, exact texel counts).

## Tessellated display + interactive VDM (X3)

With a stack attached and the edit level below the finest, the **Displaced
Preview** toggle on the Multires panel (`object.data.tessellatedDisplay`,
view state) substitutes a GPU-amplified draw of the render level for the
active-level batch: the edit level's positions + F3 frames ride the stencil
SpMV chain on the renderer device (`scripts/webgpu/stencil_compute.ts`), a
finalize kernel displaces each amplified vert by its Ptex VDM texel and
computes geometric normals over the displaced positions, and the mesh draws
the result with a `TESS_TIER` material variant (`_drawTessellated`). Builds
are async (the batch draws until the state lands; `tessReady` reports it)
and split-cached: geometry edits re-run the whole chain (keyed on
`meshRevision`), texel-only changes re-run just the finalize (keyed on
`VdmStore.contentRev()`), so interactive VDM strokes update the preview
without re-amplifying.

Interactive VDM sculpting lives behind `sculptcore.vdm_sculpt` (default
off): **Enable VDM** on the LiteMesh properties tab builds a Ptex store from
the stack's S2 adjacency (or a UV-atlas store over an existing unwrap on a
plain mesh); with a store attached, Draw-brush dabs splat tangent-space
texels (`Mesh_vdmSplatDabLogged` — the tile-delta rides the stroke's MeshLog
step, so undo reverts it) instead of moving vertices, and a fold-clamp hit
surfaces a once-per-stroke "add a multires level" note. Enable/Delete are
undoable; their undo *releases* the store instance rather than freeing it,
because stroke history holds non-owning pointers into it.

The four VDM ops (`scripts/lite-mesh/litemesh_ops.ts`) are
`litemesh.vdm_enable` / `vdm_delete` plus the **cross-carrier bake** pair:
`litemesh.vdm_apply` bakes the VDM displacement into the mesh vertices (moving
from the texel carrier onto geometry), and `litemesh.vdm_capture` bakes existing
vertex displacement into the VDM store (the reverse). All are undoable.

## Persistence (X4 stage 3)

The stack and the VDM store both ride LiteMesh's nstructjs stream: `_data`
holds the **cage** (not the level view — that was the old flatten-on-save
bug), `_mrData` the grids-store blob (current: `serializeMultires` folds the
active level's edits in first), `_mrLevels`/`_mrActiveLevel` the stack shape,
and `_vdmData` the VDM store blob (the v2 container carries backend, params,
and the Ptex tables). Load rebuilds the refinement from the cage
(topology-compatible by construction), restores the grids store, re-attaches
the saved level, and re-attaches the VDM store (carrier tags + frames).
Active-level positions rematerialize through the disp encoding, so they
round-trip to fp noise (~1e-7), not bit-exactly; the cage and the VDM blob
are byte-identical.

## Known debts

- The finest-level LRU default (3 residents) and level cap (7 in the enable
  op) are untuned defaults.
- External interchange export of the VDM (EXR/image formats for other DCCs)
  is not implemented — the store blob is app-internal. The frame convention
  any exporter must match is the splatter's (`t ⊥ n`, `b = n × t`, frames on
  the smoothed base).
- Per-face fragment-vs-tessellated carrier mixing is dormant: promotion is
  gated off on topo-locked level meshes, so a multires mesh's carrier tags
  are uniformly VDM — revisit with X4 demotion.
- LiteMeshes are skipped in the NormalPass entirely (the M6 "no SSAO
  contribution" note), so the tessellated tier inherits that gap; fixing it
  is a LiteMesh-wide work item, not a tess one.
- SSS MRT is latently broken for **all** LiteMesh draws (the batch executor
  is seeded with one color target and `setColorFormats` cannot grow it);
  the tessellated draw bails to the batch under MRT for the same reason.
  Repairing SSS+LiteMesh (batch + tess together) is its own work item.
