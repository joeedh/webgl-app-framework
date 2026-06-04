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

**Ordering constraint (important).** `getDataAPI()` today is order-sensitive:
some structs reference others (`cstruct.struct('graph', …, api.mapStruct(Graph))`
at `api_define.ts:1142`, sockets resolved lazily, `ToolMode.defineAPI` consumed
as a base for `dynamicStruct`). A flat "iterate the registry in load order" pass
will **not** reproduce that order, and gen:paths will diverge. The registry must
therefore be **declaration-order-independent**, achieved by one of:
- Making `defineAPI` idempotent + lazy: `api.mapStruct(cls)` is already
  memoized (`hasStruct`/`getStruct` guards exist at `api_define.ts:191–199`), so
  a class that references another's struct calls *that class's* `defineAPI`
  on demand (a `api.ensureStruct(Other)` helper that calls
  `Other.defineAPI(api)` once). Cross-references resolve themselves; iteration
  order stops mattering.
- **or** keeping an explicit phase list for the handful of root/ordering-
  sensitive structs (context root, graph, toolsys, editors, propCache) and only
  auto-iterating the leaf datablocks.

The first (lazy `ensureStruct`) is the cleaner end state and is recommended; the
second is the lower-risk incremental step. **Decide this before Phase 3** — it's
the one genuine design fork.

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
  `ensureStruct` (or the explicit phase list) to `api_define.ts`. No behavior
  change yet; `getDataAPI()` still calls everything explicitly. Gate: identical
  catalog (trivially).

- **Phase 1 — normalize signatures.** Make every existing `defineAPI` return
  `DataStruct` and accept the optional `struct`. Update `buildEditorsAPI`,
  `buildToolSysAPI`, the texture dispatch, and `Editor.defineAPI` to the uniform
  shape. Remove the `struct3 === undefined` throw. Pure refactor; catalog
  unchanged.

- **Phase 2 — rename `apiDefine` → `defineAPI`.** Sockets, `GraphNode`,
  `curve_knot`, and the two call sites. Settle the socket-instance method name.
  Catalog unchanged.

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
  call list with iteration over `dataAPIRegistry` (using `ensureStruct` for
  cross-refs, or the retained root phase list). This is the step most likely to
  perturb ordering — keep the previous explicit list behind a feature check
  until the catalog matches, then delete it. Gate: catalog unchanged.

- **Phase 5 — cleanup.** Delete dead shims, fold the per-subsystem dispatch
  loops (`buildEditorsAPI`/`buildToolSysAPI`) into the registry pass where
  possible, update `documentation/datapath-bindings.md` and the
  `api_define_litemesh` legacy note (`api_define.ts:287–296`, which already
  flags the intended direction). Update `CLAUDE.md`'s "Data API paths" section.

## Risks / watch-list

- **Iteration order vs. catalog stability** — the central risk (see §2). The
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
