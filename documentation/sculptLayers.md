# Sculpt layers

Sculpt layers are re-weightable displacement layers on a `LiteMesh`. Since
**sculptLayersV2**
([sculptcore/documentation/plans/sculptLayersV2.md](../sculptcore/documentation/plans/sculptLayersV2.md),
successor to the V5 wiring from
[displacementAndSubSurf.md](../sculptcore/documentation/plans/displacementAndSubSurf.md)),
the model is **the active layer is live geometry**: a layer is made the **edit
target** and then *every* way of moving vertices — any brush, autosmooth,
dyntopo repositioning, GPU strokes — edits that layer *by construction*,
because editing `co` **is** editing the layer. There is no layer-specific
brush anymore (the old Layer Draw entry is retired from the picker; the engine
kernel survives as a test fixture for the sbrush attr-redirection path).

Two storage forms, one UI concept:

- **Plain mesh** — a vertex `FLOAT3` delta column (`slayer`, `slayer.001`, …)
  tagged `AttrUse::SCULPT_LAYER` + a settings row (`SculptLayerSettings`:
  weight / enabled / frozen) serialized with the mesh. Deltas are
  object-space absolute; evaluated `v.co` is authoritative
  (`base(v) == co(v) − Σ enabled wᵢ·dᵢ(v)` stays implicit).
- **Multires level mesh** — a per-layer `FLOAT3` **grids-store channel**
  (`GridsStore::addChannel`), keyed by a *settings-only* row on the parked
  cage (no vertex column; level meshes are derived state). Level positions
  composite `disp_total = ch0 + Σ wᵢ·enabledᵢ·chᵢ` in the store's native
  frame-relative space before the `base + frame·disp` reconstruction; the
  stroke-end `writeback` lands in the target's channel (else channel 0).
  This resolves the old writeback-vs-layers fight over co-deviation by
  construction and inherits X5 eviction + store serialization for free.

The two forms do **not** convert: enabling multires on a mesh with
vertex-column layers **flattens** them (bakes the evaluated surface, drops the
stack — the enable op snapshots a serialize blob for undo); deleting a multires
stack keeps only channel 0's effect in the re-adopted cage (level layers are
lost with the stack; ghost settings rows are pruned).

## The edit-target model

While a layer is the edit target its delta is *derived*, not maintained:

```
d_active(v) ≡ co(v) − rest(v)
```

On a plain mesh, `rest` is snapshotted at activation into the TEMP
`.slayer.rest` vertex column (`rest = co − d`, exact because activation pins
the weight to 1); on a level mesh the materialized baseline plays that role.
The stored column/channel is simply **stale** while targeted and is **folded**
(`d = co − rest`, idempotent, semantically a no-op) only when something needs
the number:

- a settings edit (weight / enable / frozen / remove),
- switching or clearing the target,
- `serialize()` (`writeMeshRaw` folds first, so saves always store the
  current delta; the TEMP rest column never round-trips),
- the multires `writeback` (which *is* the level-mesh fold).

Locked semantics (see the plan for rationale):

- **Activation pins weight to 1** (folding at weight `w` would divide by `w`)
  and enables a disabled layer; the weight/enabled/frozen controls are inert
  in the panel while the layer is targeted — clear the target first. A frozen
  layer cannot be the target.
- **Mutating the target itself ends the edit first** engine-side (fold +
  clear), so nothing ever reads a stale column.
- **Mutating another layer while a target is set** mirrors its co adjustment
  into the rest snapshot (plain) / writes back first (multires), keeping the
  derived delta exact.
- **Undo is free for strokes**: co undo *is* the layer undo (the delta is
  derived, consistent at every undo cursor). Folds are undo-transparent —
  ops never snapshot folded columns.
- The edit target is **runtime state** (`Mesh::activeEditLayer` /
  `cage.activeEditLayer` for a stack), not serialized: re-target after load.

## Feature flag

The UI surface is gated on **`sculptcore.sculpt_layers`** (default **off**;
Settings editor → Feature Flags, see [featureFlags.md](featureFlags.md));
toggling takes effect on restart. The engine + serialization are always live.

## The layer panel

LiteMesh properties tab (ObData) → **Sculpt Layers**
(`LiteMesh.buildPropertiesTab`, `scripts/lite-mesh/litemesh.ts`):

- **List** — one row per layer. Clicking selects it (`activeSculptLayer`,
  view state). On a level mesh rows show positional names (`Layer N`).
- **Edit Target** — the V2 toggle (`object.data.activeSculptLayerEditTarget`):
  checking it runs `litemesh.sculpt_layer_set_target` on the selected layer;
  unchecking clears the target (folding it).
- **Weight** / **Enabled** / **Frozen** — bound to the selected layer, inert
  while it is the edit target.
- **Add Layer** / **Remove Active** buttons.

## ToolOps (`scripts/lite-mesh/litemesh_ops.ts`)

All flag-gated via `static canRun`, all routed through the `LiteMesh` layer
helpers (`layerAdd/Remove/SetWeight/SetEnabled/SetFrozen/SetTarget/Fold…`),
which pick the vertex-column path or the bound `Multires` layer surface (and
re-attach the rematerialized level views) automatically:

| toolpath | undo strategy |
|---|---|
| `litemesh.sculpt_layer_add` | remove the fresh (empty) layer |
| `litemesh.sculpt_layer_remove(layer=-1)` | plain: whole-mesh serialize blob; multires: grids-store blob + layer-settings table (`Multires::layerTableOut/Restore`) |
| `litemesh.sculpt_layer_set_weight(layer, weight)` | re-apply previous weight |
| `litemesh.sculpt_layer_set_flag(layer, kind, value)` | re-apply previous bit (kind 0 = enabled, 1 = frozen) |
| `litemesh.sculpt_layer_set_target(layer)` | replay `setActiveEditLayer` with the previous target, then restore the pinned layer's weight/enabled |

The weight slider commits per tick through `toolstack.execOrRedo`, so a drag
collapses to a single undo entry. Weight/enabled mutations move every vertex,
so the plain path rebuilds the spatial tree (`rebuildSpatialFromEdit`); the
multires path re-attaches the freshly rematerialized level (mesh/tree pointers
change on every mutation there).

## Engine seam

- Plain-mesh machinery lives in the displace compositor
  (`sculptcore/source/displace/compositor.{h,cc}`): `setActiveEditLayer`,
  `foldActiveLayer`, and the V5 settings mutators (now target-aware). The fold
  core is mesh-side (`Mesh::foldActiveSculptLayer`) so `writeMeshRaw` can fold
  without a mesh→displace dependency. C surface: `Mesh_setActiveEditLayer` /
  `Mesh_layerFold` + the V5 `Mesh_layerSet*` / `Mesh_layerRemove`, threaded
  through both backends (`IWasmInterface`).
- Multires machinery is the **bound `Multires` layer surface**
  (`sculptcore/source/subdiv/multires.{h,cc}`): `layerAdd/Remove/SetWeight/
  SetEnabled/SetFrozen`, `setEditTarget/editTarget`, reads, and
  `layerTableOut/Restore` — no napi threading needed (binding descriptors
  serve both backends). Every mutator writes the active level back first, then
  invalidates + rematerializes.
- Reads on plain meshes are bound `Mesh` methods (`sculptLayerAdd/Count/
  AttrIndex/Weight/Enabled/Frozen/EditTarget`); flatten/prune helpers are
  `Mesh::sculptLayerFlattenAll` / `sculptLayerPruneSettingsOnly`.
- VDM capture (`Multires::captureDetailToVdm`) refuses while any layer channel
  contributes (channel-0-only semantics; layer×VDM migration is post-V2).
  `vdm_apply` on a plain mesh moves co, so with a target set it records into
  the layer — "apply VDM into a layer" is a feature.

## Tests

- ctest: `test_sculpt_layers` (V5 compositor units + the V2 gate: bit-exact
  fold/idempotence/weight round-trips, region-vs-whole fold, frozen/disabled
  interplay, serialize-folds); `test_multires` `gateLayerChannels` (writeback
  targeting, channel-0 isolation, bit-stable multi-channel level switch,
  blob/table undo seam, eviction).
- Integration (`tests/integration/`, both backends + cross-backend checksum
  parity): `sculptcore_layers.test.ts` — `__layerTest` / `__layerToolTest`
  (the LAYERDRAW-era fixtures) + `__layerTargetTest` (DRAW/SMOOTH/GRAB into a
  targeted layer via the real op path, weight-0 restore, toolstack undo/redo
  of the target op, MeshLog stroke-undo consistency, dyntopo-under-edit,
  kelvinlet/GPU strokes); `sculptcore_multires.test.ts` —
  `__multiresLayerTest` (targeted stroke lands in the layer channel, level
  switches stay bit-stable, blob/table restore).
