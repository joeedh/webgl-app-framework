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

- **Phase 4 — flip `getDataAPI()` to drive the registry.** Replace the explicit
  call list with iteration over `dataAPIRegistry`, calling each `defineAPI`
  once. The only ordering work is the inherit/merge sources (§2): a
  `defineOnce(cls)`-style guard that runs the *source* class's `defineAPI`
  before the dependent's, or those few sources ordered at the front. Keep the
  previous explicit list behind a feature check until the catalog matches, then
  delete it. Gate: catalog unchanged.

- **Phase 5 — cleanup.** Delete dead shims, fold the per-subsystem dispatch
  loops (`buildEditorsAPI`/`buildToolSysAPI`) into the registry pass where
  possible, update `documentation/datapath-bindings.md` and the
  `api_define_litemesh` legacy note (`api_define.ts:287–296`, which already
  flags the intended direction). Update `CLAUDE.md`'s "Data API paths" section.

## Risks / watch-list

- **Iteration order vs. catalog stability** — bounded to the inherit/merge
  sources (see §2); plain `mapStruct` references are order-independent. The
  `propCache`/`toolDefaults` paths are also sensitive to *runtime* state (the
  port investigation found the baseline's extra `toolDefaults.light.*` paths
  were a cache artifact, not structural); don't be fooled by those if they
  reappear — compare against a freshly regenerated pre-phase catalog, not an old
  one.
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

## Definition of done

- One convention: `static defineAPI(api, struct?): DataStruct` everywhere; no
  `apiDefine`, no `api_define_*` free functions (except a possible thin internal
  ordering driver).
- `getDataAPI()` builds the API by iterating `dataAPIRegistry`.
- `pnpm gen:paths` catalog byte-identical to pre-refactor; `npx tsgo --noEmit`
  clean.
- `documentation/datapath-bindings.md` + `CLAUDE.md` updated to describe the
  single pattern.
