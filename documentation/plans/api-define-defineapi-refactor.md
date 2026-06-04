# Refactor plan: unify the data-API registration onto a static `defineAPI(api, struct?)` convention

**Status:** plan only — no implementation in this change.
**Prerequisite:** the TypeScript port of `scripts/data_api/api_define.ts` (done; runtime
parity verified by `pnpm gen:paths` producing a byte-identical 818-path catalog).

## Goal

Make the datapath binding system comprehensible by giving each class that
participates in the data API **one** way to declare its struct: a static method

```ts
static defineAPI(api: DataAPI, struct?: DataStruct): DataStruct {
  struct ??= api.mapStruct(this)
  // ... struct.float(...), struct.on('change', ...), etc.
  return struct
}
```

Today the same job is done three different ways, dispatched from `getDataAPI()`
through ad-hoc per-subsystem loops. The end state is: classes self-register via
`registerDataAPI(cls)`, and `getDataAPI()` drives a single registrant list,
calling each class's `defineAPI`. The monolithic `api_define_*` free functions
shrink to thin shims (and eventually disappear) as their bodies move onto the
classes they describe.

## Current state (what we're unifying)

Three coexisting conventions, all reachable from `getDataAPI()`
(`scripts/data_api/api_define.ts`):

1. **Free functions** `api_define_<thing>(api, struct?)` inside `api_define.ts`
   itself — ~35 of them (`api_define_mesh`, `api_define_scene`,
   `api_define_material`, `api_define_light`, `api_define_library`,
   `api_define_brush`, `api_define_camera`, `api_define_screen`, …), called in a
   fixed order in `getDataAPI()` (`api_define.ts:1120–1270`). The bodies live
   centrally, far from the classes they describe; this is the legacy core the
   plan targets.

2. **Static `defineAPI(api, struct?)` already on the class** — the pattern we're
   standardizing on. Already used by:
   - `Editor` + every editor subclass (`editor_base.ts:854`, `View3D`,
     `PropsEditor`, `NodeEditorBase`/`MaterialEditor`, `ImageEditor`,
     `DebugEditor`, …); the constructor interface `IEditorConstructor` already
     declares `defineAPI(api): DataStruct` (`editor_base.ts:801`). Dispatched by
     `buildEditorsAPI` over the `areaclasses` registry (`editor_base.ts:572`).
   - `ToolMode` + subclasses (`selecttool`, `sculptcore`, `pbvh`, `curvetool`,
     `meshtool`, `mesheditor`). Dispatched in `buildToolSysAPI` over the
     `ToolModes` registry (`api_define.ts:911–928`).
   - The `ProceduralTex`/`texture_base` hierarchy, dispatched over the texture
     registry (`proceduralTex.ts:1636`).
   - `AppSettings` (`settings.ts:134`, called at `api_define.ts:1264`),
     `Node`/`Graph` (`graph.ts:709`).

3. **Reversed name `apiDefine(api, struct)`** — same idea, opposite word order.
   Used by the node-socket classes (`graphsockets.ts` — 10+ static and one
   instance method), `GraphNode` (`graph.ts:205`), and `curve_knot.ts:33`.
   Dispatched at `api_define.ts:194` (`obj.apiDefine(api, ret)`, gated on the
   socket's `SocketFlags.INSTANCE_API_DEFINE`) and `api_define.ts:579`
   (`cls.apiDefine(api, st)`).

Signature drift to reconcile during migration:
- Some `defineAPI` take `(api)` only; some take `(api, struct)`; some return
  `DataStruct`, some `void`, some `any`.
- The socket `apiDefine` takes `(api, sockstruct)` and mostly returns `void`.
- The free functions variously take `(api)`, `(api, cstruct)`, or
  `(api, pstruct)` and return `DataStruct` or `void`.

The **regression harness already exists**: `pnpm gen:paths` walks the entire API
and emits `scripts/data_api/generated/{api-paths.json,API_PATHS.md,datapaths.ts}`.
Any migration step is correct iff `api-paths.json` is unchanged
(0 added / 0 removed paths, 0 per-entry diffs). This is the gate for every phase
below.

## Target design

### 1. Canonical signature

```ts
static defineAPI(api: DataAPI, struct?: DataStruct): DataStruct {
  struct ??= api.mapStruct(this)   // `this` is the class (static method)
  // declare properties on `struct`
  return struct                    // always return it (callers compose with it)
}
```

- `struct` optional, defaulting to `api.mapStruct(this)`. Callers that need to
  extend an existing struct (e.g. inheritance, or attaching the struct under a
  parent path) pass one in; everyone else lets it default.
- **Always returns `DataStruct`** (never `void`/`undefined`). The
  `buildToolSysAPI` loop already throws on `undefined`
  (`api_define.ts:923`) — making the return type total removes that guard.
- Subclasses call `super.defineAPI(api, struct)` to inherit the base's
  properties, exactly as `View3D`/`PropsEditor`/`SculptCorePaintMode` already do
  (`super.defineAPI(api)`).

### 2. Registration: `registerDataAPI`

`api_define.ts` exports a registrar and a registry:

```ts
type DataAPIClass = (abstract new (...a: any[]) => any) & {
  defineAPI(api: DataAPI, struct?: DataStruct): DataStruct
}

const dataAPIRegistry: DataAPIClass[] = []

export function registerDataAPI(cls: DataAPIClass): void {
  if (!dataAPIRegistry.includes(cls)) dataAPIRegistry.push(cls)
}
```

Classes register themselves the way ToolOps/DataBlocks already do (a side-effect
at module load, or — preferably for addons — through the addon `register(api)`
hook so it can be cleanly torn down; see `documentation/addons.md`). `getDataAPI()`
then iterates `dataAPIRegistry` and calls each `cls.defineAPI(api)` instead of a
hand-maintained call list.

**Ordering is mostly a non-issue — struct *creation* is decoupled from struct
*population*.** `api.mapStruct(cls, true)` auto-creates an **empty** `DataStruct`
and caches it on the class (`CLS_API_KEY`). A `defineAPI` that references another
class's struct via `api.mapStruct(Other)` (e.g.
`cstruct.struct('graph', …, api.mapStruct(Graph))` at `api_define.ts:1142`)
receives that **cached object by reference**; it does not read its contents at
definition time. Whenever `Other.defineAPI` runs — earlier or later — it
populates that same object in place. So a flat "iterate the registry, call each
`defineAPI` once" pass reproduces the catalog regardless of registration order,
for all reference-style cross-links.

Note: a naïve `ensureStruct(api, cls)` that does
`api.hasStruct(cls) ? api.getStruct(cls) : cls.defineAPI(api)` does **not** help
and is in fact wrong — `hasStruct` flips true the moment the empty struct is
auto-created, so it would return an empty struct and skip `defineAPI`. There is
no general lazy-resolution primitive to add; plain iteration suffices.

**The only true ordering constraints** are operations that read/copy a struct's
*contents* at call time (not by reference):
- `inheritStruct(cls, parent)` → `mapStruct(parent).copy()` copies the parent's
  **members** immediately (`controller.ts:656`). The ported
  `api_define_meshvertex` (`api.inheritStruct(Vertex, Element)`) needs
  `Element`'s struct fully populated first; likewise any future inherit.
- `mergeStructs(dest, src)` copies `src.members` at call time
  (`controller.ts:650`).

These few cases need their source class defined-first. The registry driver
handles them with a small `Set<DefineAPIClass>` of already-defined classes plus a
`defineOnce(cls)` that runs `cls.defineAPI` if absent — invoked explicitly for the
*source* of an inherit/merge right before the dependent runs (not as a generic
cross-ref mechanism). Equivalently, the handful of inherit/merge sources can be
ordered explicitly at the front of the registry. **This is the only ordering
work Phase 4 must do.**

### 3. Rename `apiDefine` → `defineAPI`

Mechanical rename across the ~13 `apiDefine` definitions (graphsockets.ts,
graph.ts, curve_knot.ts) and their 2 call sites (`api_define.ts:194,579`). Watch
the `SocketFlags.INSTANCE_API_DEFINE` **instance** method on sockets
(`graphsockets.ts:677`) — it stays an instance method (per-socket-instance
structs), so the registrar/`defineAPI` static-method typing must tolerate the
instance variant, or that one keeps a distinct name (e.g. `defineInstanceAPI`).
Resolve the naming for the instance case explicitly rather than forcing it into
the static convention.

## Phased migration (each phase gated on gen:paths parity)

Each phase ends by running `pnpm gen:paths` and diffing `api-paths.json` against
the pre-phase copy — **0 diffs required** — plus `npx tsgo --noEmit` clean.

- **Phase 0 — scaffolding.** Add `registerDataAPI` + `dataAPIRegistry` +
  `getDataAPIRegistry` to `api_define.ts` (no `ensureStruct` — see §2). No
  behavior change yet; `getDataAPI()` still calls everything explicitly. Gate:
  identical catalog (trivially).

- **Phase 1 — normalize signatures.** Make every existing `defineAPI` return
  `DataStruct` and accept the optional `struct`. Update `buildEditorsAPI`,
  `buildToolSysAPI`, the texture dispatch, and `Editor.defineAPI` to the uniform
  shape. Remove the `struct3 === undefined` throw. Pure refactor; catalog
  unchanged.

- **Phase 2 — rename `apiDefine` → `defineAPI`.** *(done, commits 2a/2b.)*
  Two independent `apiDefine` families turned out to exist, not one:
  - **2a — node sockets.** `NodeSocketType` base (`graph.ts:205`) + its socket
    static overrides (`graphsockets.ts`) + the static dispatch
    (`api_define.ts:612`). The `EnumSocket` per-instance hook
    (`graphsockets.ts:677`, `SocketFlags.INSTANCE_API_DEFINE`) became
    `defineInstanceAPI` (with its dispatch `api_define.ts:227`) — kept distinct
    because per-instance structs don't fit the static convention.
  - **2b — CustomDataElem.** A second, larger family the original plan missed:
    `CustomDataElem` + `LayerSettingsBase` base statics, their constructor
    interfaces (`ICustomDataElemConstructor`, `ILayerSettingsConstructor`,
    `IGridConstructor`), ~12 subclass overrides/super-calls across the mesh addon
    and `curve_knot`, and the three dispatch sites in `customdata.ts`. All
    members here are static (interface sigs are constructor-side), so no
    instance split was needed. `curve_knot` is a `CustomDataElem` subclass, so it
    belongs to 2b, not the socket family.

  Catalog unchanged in both (gen:paths 818 paths, 0 diffs; tsgo clean).

- **Phase 3 — move free-function bodies onto classes.** One subsystem per PR,
  smallest first to derisk the ordering question:
  `api_define_material` → `Material.defineAPI`, then `light`, `camera`,
  `curvespline`, `brush`, …, ending with the order-sensitive `mesh`/`scene`/
  `library`/`sceneobject`. Each moved function becomes
  `static defineAPI(api, struct?)` on its class and is registered via
  `registerDataAPI`; the old `api_define_<x>` becomes a one-line shim
  (`return X.defineAPI(api, struct)`) so external callers keep working, then the
  shim is deleted once no caller remains. The `Element`/`Vertex` mesh-element
  structs (the import the port fixed) move onto the mesh element classes.
  Per-subsystem gate: catalog unchanged.

  **Progress — self-contained tier done.** The single-class bodies that take
  only `(api)` and own one struct are migrated (each a shim → `X.defineAPI`,
  catalog byte-identical, tsgo clean):
  `Material` · `Camera` · `CurveSpline` · `DynTopoSettings` · `DynTopoSettingsSC`
  · `BVHSettings` · `RenderSettings` · `EnvLight` · `ImageUser`.
  `registerDataAPI` wiring is intentionally **deferred to Phase 4** (the registry
  isn't consumed until then; registering now would be dead state and the
  Phase-4 ordering pass is where it belongs).

  **Progress — entangled tier done.** All the remaining bodies are migrated;
  every `api_define_<x>` listed below is now a one-line shim delegating to a
  static `X.defineAPI(api, struct?)` on its class. Each was gated identically
  (gen:paths 818 paths, 0 value diffs vs a freshly regenerated HEAD-source
  baseline, tsgo clean):
  - *Datablock/node/sceneobject-data helper-dependent* — `image`, `cameradata`,
    `litemesh`, `mesh`, `brush`. The base helpers are re-expressed as
    `DataBlock.defineAPI` / `Node.defineAPI` / `SceneObjectData.defineAPI`, which
    subclasses chain via the base `super.defineAPI(api, struct)`. `Light` layers
    its API at the `DataBlock` level (its `defineAPI` chains `DataBlock.defineAPI`,
    not `SceneObjectData`'s) to preserve the original `api_define_light` shape.
  - *Parent-struct assembling* — `shadernetwork`, `sceneobject`, `library`,
    `screen`, `light`, `scene`. The self-struct half moved onto the class; the
    attach-under-parent half (`parent.struct(...)`/`parent.list(...)`) stays in
    the driver shim. For `library`, the shared `api_define_libraryset` helper
    moved into `lib_api.ts` as the exported `defineLibrarySet` (used by both
    `Library.defineAPI` and the late-registration `onBlockRegister` hook, which
    stays in the driver with the `libraryStruct` module var).
  - *Order-sensitive inherits* — `api_define_meshelem` → `ElementBase.defineAPI`,
    `api_define_meshvertex` → `Vertex.defineAPI` (the `inheritStruct(Vertex,
    Element)` still runs after `Element.defineAPI` populates the Element struct;
    the `api_define_mesh` driver enforces that ordering).
  - *Skipped (pathux submodule classes)* — `api_define_velpan` (`VelPan`),
    `api_define_matrix4` (`Matrix4`) stay as free functions; we don't add
    statics to the path.ux submodule in this refactor.

  `registerDataAPI` wiring stays deferred to Phase 4 (the registry isn't
  consumed until the driver flips).

- **Phase 4 — flip `getDataAPI()` to drive the registry.** *(done.)*
  `getDataAPI()` now builds in two explicit passes:
  - **Population pass** — a handful of non-class struct builders stay explicit
    (`api_define_matrix4`/`_velpan` for path.ux submodule types,
    `api_define_nodesockets` for the socket inherit loop, `api_define_shadernode`
    = `Node.defineAPI` on ShaderNode's struct, `api_define_graph` for the Graph
    free struct, `buildCDAPI`); then **every participating class is populated by
    iterating `dataAPIRegistry`** (`registerCoreDataAPIClasses()` + a
    `defineOnce` guard). Class-dependent helpers that `inheritStruct` from a
    populated class (`buildProcTextureAPI`, `buildProcMeshAPI`,
    `api_define_graphclasses`) run *after* the loop.
  - **Attach pass** — the ToolContext tree assembly (`cstruct.struct/list`,
    `setRoot`, the inline `objects`/`datablocks`/`blocks` lists, `selectMask`,
    `material`/`settings`/`propCache`, `buildEditorsAPI`, `buildToolSysAPI`)
    stays an explicit driver; it wires the now-populated class structs under
    named paths by reference (`mapStruct(_, false)`).

  The inherit/merge ordering turned out to be **three** edges, not one:
  `ShaderNetwork → Material`, `Element → Vertex`, `Mesh → CurveSpline`. They are
  handled by registration order in `registerCoreDataAPIClasses()`.
  `DefineAPIClass` became an `(abstract new …) & {defineAPI}` intersection so
  class objects type-check both as registrants and as `mapStruct` keys. Gate
  met: catalog byte-identical (818 paths, 0 diffs), tsgo clean.

  Two non-class helper steps had real ordering constraints the original plan
  missed: `buildCDAPI` must run *before* the loop (Mesh attaches `CustomData`
  by ref, so the struct must exist), and `buildProcMeshAPI` /
  `buildProcTextureAPI` / `api_define_graphclasses` must run *after* (they
  `inheritStruct` from `DataBlock`).

- **Canonical catalog ordering (`tools/gen-datapaths.mjs`).** *(done.)* Before
  flipping the driver, the generator now sorts the deduped entries
  lexicographically by normalized path before rendering, so the on-disk catalog
  order is determined by content, not by `walkAPI` traversal / struct-build
  order. This decouples the committed `generated/` files from any future
  reordering of the population pass (the value-compare gate was already
  order-independent; this makes the *committed files* order-independent too).
  The one-time recanonicalization also dropped 4 stale `toolDefaults.light.*`
  cache-artifact keys (822 → 818), aligning the committed catalog with the
  generator's deterministic output.

- **Phase 5 — cleanup.** *(done.)* Deleted the dead per-subsystem
  `api_define_<x>` shims (23 of them) and their orphaned imports; `getDataAPI`
  is the sole consumer and no longer calls them. `api_define_library` is now
  attach-only. **`buildEditorsAPI`/`buildToolSysAPI` were left explicit** —
  editor/toolop registration doesn't fit the per-class `defineAPI` registry; a
  follow-up could give it its own registry pass. **Addon-import decoupling
  (core `api_define.ts` still hard-imports `Mesh`/`Vertex`/`Element`/
  `BVHSettings`/`CurveSpline` from `addons/builtin/*`) is the registry's larger
  payoff and is left as a follow-up** (route them through each addon's
  `register(api)` hook → `registerDataAPI`); see `TODO.md`. `CLAUDE.md`'s "Data
  API paths" section and `documentation/datapath-bindings.md` updated.

## Risks / watch-list

- **Iteration order vs. catalog stability** — bounded to the inherit/merge
  sources (see §2); plain `mapStruct` references are order-independent.
  *Resolved two ways:* (a) the inherit edges are ordered in
  `registerCoreDataAPIClasses()` (`ShaderNetwork → Material`, `Element →
  Vertex`, `Mesh → CurveSpline`); (b) the on-disk catalog is now canonically
  sorted (`tools/gen-datapaths.mjs`), so even a *reordering* of the population
  pass produces no committed-file diff. The `propCache`/`toolDefaults` paths are
  also sensitive to *runtime* state (the port investigation found the
  baseline's extra `toolDefaults.light.*` paths were a cache artifact, not
  structural); don't be fooled by those if they reappear — compare against a
  freshly regenerated pre-phase catalog, not an old one. The recanonicalization
  removed those 4 artifact keys from the committed catalog (822 → 818).
- **Addon teardown** — addon classes must register through the addon
  `register(api)` hook, **not** module-scope side effects, so they unregister
  cleanly (per `CLAUDE.md` addon rules). `registerDataAPI` from addon code goes
  through the addon registry dispatcher.
- **The socket instance `defineAPI`** — per-instance structs gated on
  `INSTANCE_API_DEFINE` don't fit the static convention; give them a clearly
  distinct name rather than overloading `defineAPI`.
- **`mapStruct(this)` default vs. `mapStruct(this, true)`** — several current
  bodies pass the second arg (`true` = create/replace). The `struct ??=
  api.mapStruct(this)` default must match each call site's existing flag or the
  struct identity/dedup changes. Verify per class during Phase 3.

## Definition of done — *met*

- ✅ One convention: `static defineAPI(api, struct?): DataStruct` on every
  participating class; no `apiDefine`, no per-subsystem `api_define_*` free
  functions. The handful that remain are the non-class / thin-driver helpers
  noted in Phase 5 (`api_define_socket`, `_node`, `_datablock`, `_shadernode`,
  `_graph`, `_nodesockets`, `_library`, `_velpan`, `_matrix4`), not class
  populators.
- ✅ `getDataAPI()` builds the class structs by iterating `dataAPIRegistry`
  (population pass: non-class pre-steps → `registerCoreDataAPIClasses()` →
  `defineOnce` loop → class-dependent helpers), then assembles the
  `ToolContext` tree in an explicit attach pass.
- ✅ Catalog byte-identical to pre-refactor (818 paths, 0 diffs) and now
  canonically sorted, so it stays stable under any future reordering of the
  population pass; `npx tsgo --noEmit` clean.
- ✅ `documentation/datapath-bindings.md` + `CLAUDE.md` "Data API paths" updated
  to describe the registry-driven build and canonical ordering.
- ⏭️ Follow-up (tracked in `TODO.md`): route addon class registration
  (`Mesh`/`Vertex`/`Element`/`BVHSettings`/`CurveSpline`) through each addon's
  `register(api)` hook so core `api_define.ts` stops importing `addons/builtin/*`.
