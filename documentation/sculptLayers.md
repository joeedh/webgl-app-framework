# Sculpt layers

Sculpt layers are re-weightable displacement layers on a `LiteMesh`
(workstreams F1 + V5 of
[sculptcore/documentation/plans/displacementAndSubSurf.md](../sculptcore/documentation/plans/displacementAndSubSurf.md)).
Each layer is a vertex `FLOAT3` delta attribute (`slayer`, `slayer.001`, …)
tagged `AttrUse::SCULPT_LAYER`, plus a settings row
(`SculptLayerSettings`: weight / enabled / frozen) serialized with the mesh.
Evaluated positions are authoritative — the compositor
(`sculptcore/source/displace/compositor.{h,cc}`) keeps `v.co` current
incrementally (`base(v) == co(v) − Σ enabled wᵢ·dᵢ(v)`), so every consumer of
`v.co` (spatial tree, draw, meshlog, dyntopo) is unchanged and undo restores
`co` + layer columns atomically.

## Feature flag

Everything below is gated on the **`sculptcore.sculpt_layers`** feature flag
(default **off**; Settings editor → Feature Flags, see
[featureFlags.md](featureFlags.md)). Toggling it takes effect on restart (the
tool enum and panel are built at boot). The engine + serialization are always
active — the flag only hides the UI surfaces.

## The Layer Draw brush

`SculptTools.LAYER_DRAW` ("Layer Draw" in the sculpt-tool enum) maps to the
sculptcore `LAYERDRAW` kernel (`TOOL_TO_SCULPTBRUSH`,
`scripts/editors/view3d/tools/sculptcore_bindings.ts`). The kernel writes the
displacement into the **active sculpt layer's** attr — `toolAttrCategory`
returns `AttrUseFlags.SCULPT_LAYER` and the brush bridge redirects the
kernel's `slayer` handle via `mesh.activeAttrLayerIndex(category)`, exactly
like the color/poly-group paint brushes. The executor folds the deltas into
`v.co` post-dab; a stroke with no layer created yet writes into an
engine-ensured default `slayer` attr that has no settings row (create a layer
from the panel first for real work). Frozen layers revert brush writes at
dab end; disabled layers accept writes but contribute nothing until re-enabled.

## The layer panel

LiteMesh properties tab (ObData) → **Sculpt Layers**
(`LiteMesh.buildPropertiesTab`, `scripts/lite-mesh/litemesh.ts`):

- **List** — one row per layer (`object.data.sculptLayers` data list), labeled
  `name · w <weight> [· off] [· frozen]`. Clicking a row makes it the active
  layer (the Layer Draw target). Active-layer state is view state
  (`LiteMesh.activeSculptLayer`, a settings index), not serialized.
- **Weight** slider + **Enabled** / **Frozen** toggles — bound to the active
  layer (`object.data.activeSculptLayerWeight` / `...Enabled` / `...Frozen`),
  committing through the undoable ToolOps below.
- **Add Layer** / **Remove Active** buttons.

## ToolOps (`scripts/lite-mesh/litemesh_ops.ts`)

All flag-gated via `static canRun`:

| toolpath | undo strategy |
|---|---|
| `litemesh.sculpt_layer_add` | remove the fresh (empty) layer |
| `litemesh.sculpt_layer_remove(layer=-1)` | whole-mesh serialize blob (restores painted data) |
| `litemesh.sculpt_layer_set_weight(layer, weight)` | re-apply previous weight via the same mutator |
| `litemesh.sculpt_layer_set_flag(layer, kind, value)` | re-apply previous bit (kind 0 = enabled, 1 = frozen) |

The weight slider commits per tick through `toolstack.execOrRedo`, so a drag
collapses to a single undo entry (consecutive drags on the same layer also
merge — Blender "adjust last operation" style). Weight/enabled mutations move
every vertex, so the ops rebuild the spatial tree (`rebuildSpatialFromEdit`)
to refresh node bounds + GPU buffers.

## Engine seam

The four settings mutators are `extern "C"`
(`sculptcore/source/displace/c-api/displace_c_api.cc`), threaded through both
backends as `IWasmInterface.Mesh_layerSetWeight` / `Mesh_layerSetEnabled` /
`Mesh_layerSetFrozen` / `Mesh_layerRemove` (WASM: `typescript/api/wasm.ts`;
native: `napi_runtime.{h,cc}` + `nativeBackend.ts` / `nativeManager.ts`).
Reads are bound `Mesh` methods: `sculptLayerAdd/Count/AttrIndex/Weight/
Enabled/Frozen`. Layer names come from the `v.attrs` `AttrRef` proxy at
`sculptLayerAttrIndex(li)`.

## Overlay

The feature-edge overlay (default on) draws carrier-region boundaries
(`EDGE_LAYER_REGION`) in **pink**, alongside seams/sharp edges — see
[feature-marking.md](feature-marking.md).

## Tests

`tests/integration/sculptcore_layers.test.ts` (both backends + cross-backend
checksum parity): `__layerTest` drives the LAYERDRAW kernel through the
stroke-driver test seams; `__layerToolTest`
(`scripts/lite-mesh/litemesh_layertest_support.ts`) drives the **real tool
mapping** (`brush.tool = LAYER_DRAW`, no overrides) plus weight/enabled
mutator round-trips and a MeshLog undo.
