# Refactor: toolmodes → addons, decouple mesh from core

## Context

We're on the `sculptcore` branch. Today the framework couples mesh, sculpt, curve, and
edit-mode toolmodes directly into the bundled core (`scripts/editors/view3d/tools/`),
the core also reaches into mesh (`scripts/core/context.ts`, `gen_default_file.ts`,
`mesh_shapes.js`, `appstate.ts`), and the TypeScript BVH (`scripts/util/bvh.ts`)
imports 7+ mesh modules. The addon system exists but only supports `.js` addons loaded
via dynamic `import()` against `addons/*.js`, with no builtin/third-party distinction,
no transpile step, no install UI, and no resilience when serialized files reference
classes from disabled or missing addons.

The goal of this refactor is to:

1. Move every toolmode except **Object Mode** (`ObjectEditor` in
   `scripts/editors/view3d/tools/selecttool.ts`) and the **Pan utility**
   (`view3d_panmode.ts`) into addons. After this refactor, mesh editing, curve
   editing, the old PBVH sculpt tool, sculptcore, and tetmesh are all addons.
2. Decouple `scripts/mesh/` from `scripts/core/` so the core can build, run, and load
   a file without any mesh code present, and so the BVH can live alongside mesh
   instead of in `util/`.
3. Establish a real builtin vs third-party addon distinction with a TypeScript-only
   addon authoring story, a per-addon build step, and an install workflow that works
   on both web and Electron.
4. Preserve serialized data for any addon that isn't currently loaded, so save/reload
   round-trips don't silently drop DataBlocks, ToolModes, or custom data layers.

This document captures the recommended plan. Sections 1–6 each have their own
"Critical files" lists.

---

## 1. Inventory: what becomes an addon

| Code | Disposition |
|---|---|
| `ObjectEditor` (`scripts/editors/view3d/tools/selecttool.ts`) | **Stays in core** — always-present default |
| `PanToolMode` (`view3d_panmode.ts`) | **Stays in core** — pure utility, no mesh deps |
| `ToolMode` base + `ToolModes[]` registry + `makeToolModeEnum()` (`view3d_toolmode.ts`) | **Stays in core** |
| Whole `scripts/mesh/` folder + `scripts/util/bvh.ts` | Moves into `addons/builtin/mesh/` (provides `Mesh` DataBlock, customdata, mesh ops, BVH, paramizer, displacement, curvature, etc.) |
| `MeshToolBase` / `MeshEditor` (`meshtool.ts`, `mesheditor.ts`) | Moves into `addons/builtin/mesh_edit/`, depends on `mesh` |
| `CurveToolMode` (`curvetool.ts`, `curvetool_overlay.ts`) + `scripts/curve/` | Moves into `addons/builtin/curve/` |
| `PaintToolModeBase` / `BVHToolMode` (`pbvh*.ts`, 7 files) | Moves into `addons/builtin/pbvh_sculpt/`, depends on `mesh` |
| `SculptCorePaintMode` (`sculptcore.ts`, `sculptcore_bindings.ts`, `sculptcore_ops.ts`) + `sculptcore/` submodule glue | Moves into `addons/builtin/sculptcore/`, depends on `mesh` |
| `TetMeshTool` (`tetmesh.ts`) + `scripts/tet/` | Moves into `addons/builtin/tetmesh/`, depends on `mesh` |
| `scripts/subsurf/` | Moves into `addons/builtin/subsurf/` (tight `Mesh` coupling), depends on `mesh` |
| `_old_mesheditor.ts` | Delete (dead code) |

**Mesh is itself a builtin addon end-to-end.** The `Mesh` DataBlock, customdata, BVH,
and all mesh runtime code live in `addons/builtin/mesh/`. Core ships without any
mesh code in its main bundle. Every other mesh-touching addon (`mesh_edit`,
`pbvh_sculpt`, `sculptcore`, `tetmesh`, `subsurf`, `curve` if it shares custom
data) declares `"dependencies": ["mesh"]` in its manifest and reaches the mesh
namespace via the addon-to-addon API (see §2.6).

The bus REGISTER/UNREGISTER hook in `scripts/scene/scene.ts:420` already rebuilds
the toolmode enum when addons load/unload, so late-loaded addon toolmodes work in
principle — we just need to guarantee `scene.toolmode_i = 0` (Object) is always a
safe fallback when nothing else is registered.

---

## 2. Addon system changes

### 2.1 Layout

```
addons/
  builtin/
    mesh/                    # the Mesh DataBlock, customdata, BVH, mesh utils
      manifest.json          # name, version, dependencies, entry, icons
      src/                   # TypeScript sources
        main.ts              # entry, exports addonDefine/register/unregister
        ...
      build/                 # produced by tools/build-addons.js (gitignored)
        main.js
        chunks/
    subsurf/                 # dependencies: ["mesh"]
    mesh_edit/               # dependencies: ["mesh"]
    curve/                   # dependencies: ["mesh"] (may share custom data)
    pbvh_sculpt/             # dependencies: ["mesh"]
    sculptcore/              # dependencies: ["mesh"]
    tetmesh/                 # dependencies: ["mesh"]
  third-party/               # populated at install time, gitignored
    <addon_id>/
      manifest.json
      build/main.js
      ...
```

`addons/list.json` is replaced by discovery: the build step writes
`build/addons/index.json` (an array of `{id, kind, manifestPath, entryPath, builtin}`),
and the runtime loader reads that. For third-party we generate this list at install
time on top of the builtin index.

### 2.2 Manifest

```json
{
  "id": "mesh_edit",
  "name": "Mesh Edit",
  "version": "1.0.0",
  "author": "joeedh",
  "entry": "src/main.ts",
  "dependencies": [],
  "permissions": ["mesh"],
  "description": "..."
}
```

`permissions` later guards what API surfaces an addon can pull from `AddonAPI`.

### 2.3 Build pipeline (TypeScript-only authoring)

**Builtin addons (build-time)**

- New `tools/build-addons.js` invokes esbuild with one entry per builtin addon
  (`addons/builtin/*/src/main.ts`), `outdir: build/addons/<id>/`, `splitting: true`
  with shared chunks emitted into `build/addons/_chunks/`. Core imports (`scripts/*`,
  `@core/*`) and inter-addon imports (`@addon/<id>/*`) are marked `external` —
  addons resolve those at runtime via an import map injected by the loader (web) or
  a preload bridge (Electron). This avoids re-bundling core per addon.
- `tools/esbuilder.js` gains a top-level `await buildAddons()` after the main bundle
  finishes, so `npm run build` and `npm run watch` produce addon bundles too.

**Third-party addons — both transpile modes supported**

The manifest's `"buildMode": "prebuilt" | "source"` selects the path:

- **Prebuilt** (preferred for distribution): authors run `tools/build-addon.js
  <addon-dir>` locally to produce `build/main.js` (+ chunks) and zip
  `manifest.json + build/`. App only loads the JS at runtime — no in-app esbuild
  invocation. Smallest payload, safest.
- **Source** (preferred during development): authors zip `manifest.json + src/`
  with `buildMode: source`. App ships `esbuild-wasm` (added as a dependency, ~10MB)
  and transpiles `src/main.ts` on install, caching the result alongside the source
  in the storage backend. The cached output is re-used on subsequent loads;
  re-transpile is triggered only by source mtime change.

Both modes hit the same loader path (dynamic `import()` of a `.js` URL); the only
difference is whether that URL points to author-supplied prebuilt JS or
install-time-cached JS.

`tools/build-addon.js <path>` is the canonical CLI used both by authors locally and
internally by the source-mode install path (the latter wraps esbuild-wasm).

### 2.4 Loader changes

- `scripts/addon/addon.ts`
  - `getAddonPrefix()` returns `build/addons/` resolved against the right base URL
    for browser vs Electron.
  - `AddonManager` reads `build/addons/index.json`, sorts by `dependencies`, loads in
    order. Builtin records are flagged with `record.builtin = true` and cannot be
    uninstalled, only disabled (and Object mode can never be disabled — already true
    of `ObjectEditor` since it's not an addon).
  - Adds `installFromZip(file)` and `uninstall(id)` for third-party flows.

### 2.5 Addon-to-addon dependencies and APIs

Addons need to call into each other (`pbvh_sculpt` needs `Mesh`, `Edge`, `Vertex`,
`MeshFlags`, etc. from `mesh`; `mesh_edit` needs both `mesh` and `subsurf`). The
mechanism:

- Each addon's `register(api)` can call `api.exportNamespace(name, exports)` to
  publish its public API (e.g. `mesh` publishes `Mesh`, `customdata`, `MeshFlags`,
  `BVH`, `ISurfaceSampler`, `mesh_utils`, etc.).
- Dependent addons declare `"dependencies": ["mesh"]` in their manifest. The loader
  topologically sorts and loads `mesh` first.
- At load time, dependent addons receive their dependencies through `api.deps.mesh`
  (typed). They also get a static-import escape hatch via the path
  `@addon/mesh/api` which the bundler rewrites to a runtime lookup — this is what
  TypeScript source actually imports, so authors get full type-checking:

  ```ts
  // pbvh_sculpt/src/main.ts
  import {Mesh, MeshFlags, BVH} from '@addon/mesh/api'
  ```

- The addon build tool (`tools/build-addon.js`) marks `@addon/*` as external and
  emits a small shim that resolves to `_addons.get('<id>').api.namespace.*` at
  runtime.
- Cyclic dependencies are rejected at load time with a clear error.
- Disabling an addon disables all addons that depend on it (cascading), with a
  confirmation prompt in the UI.

### 2.6 Install workflows

- **Web**: an "Install Addon" UI accepts a `.zip`, validates manifest, extracts via
  JSZip into an OPFS or IndexedDB-backed virtual FS, then re-loads the addon index.
  The dynamic `import()` is fed `blob:` URLs created from the extracted files.
- **Electron**: extraction targets `app.getPath('userData')/addons/`. The renderer
  asks main process (new IPC handler in `electron/main.js`) for the absolute install
  path, then loads via `file://` URL.
- Both paths share the same `installFromZip` API; only the storage backend differs
  (new `scripts/addon/storage.ts` with `WebAddonStorage` and `ElectronAddonStorage`
  implementations selected by `window.haveElectron`).

### 2.7 Critical files

- `scripts/addon/addon.ts` (loader changes, install/uninstall, dependency-ordered load)
- `scripts/addon/addon_base.ts` (slim AddonAPI — see §3; new `exportNamespace`,
  `api.deps`)
- `scripts/addon/storage.ts` (new — `WebAddonStorage`, `ElectronAddonStorage`)
- `scripts/addon/transpile.ts` (new — esbuild-wasm wrapper for source-mode addons)
- `scripts/addon/manifest.ts` (new — manifest schema + validator)
- `tools/esbuilder.js` (chain addon build)
- `tools/build-addons.js` (new — builds every `addons/builtin/*`)
- `tools/build-addon.js` (new — CLI for one addon, used by authors and internally)
- `electron/main.js`, `electron/preload.js` (new preload for addon FS IPC)
- `addons/builtin/<id>/manifest.json` and `addons/builtin/<id>/src/main.ts`
  (one per moved subsystem)
- `index.html`, `electron/window.html` (no change expected — they import
  `build/entry_point.js` and that hasn't moved)

---

## 3. Decouple mesh from core (mesh becomes a builtin addon)

Since `scripts/mesh/` is moving into `addons/builtin/mesh/src/`, every `scripts/core/`
→ `scripts/mesh/` import has to be severed by registries/callbacks owned by core,
which the mesh addon populates during its `register()` step.

### 3.1 Coupling to sever

| Coupling | Today | New mechanism |
|---|---|---|
| `core/lib_api.ts:8` `import type {Mesh}` for `BlockSet<Mesh>` | type-only | drop; use `BlockSet<DataBlock>` |
| `core/context.ts` `instanceof Mesh`, `selectedMeshObjects`, `mesh` getter | runtime | `ctx.selectedObjectsOfKind('mesh')` + tagged interface on `SceneObjectData.dataKind` |
| `core/app_ops.js` `ImportOBJOp` | runtime import | mesh addon registers OBJ importer via `data_kinds` registry |
| `core/mesh_shapes.js` uses `Mesh` | runtime | move file into mesh addon |
| `core/gen_default_file.ts` builds cube via `Mesh` | runtime | `core/default_file.ts.setDefaultSceneBuilder(fn)`; mesh addon installs cube builder |
| `core/appstate.ts` `GridBase` v5/v6 migrators | runtime | `core/file_migrations.ts` registry; mesh addon registers migrators |
| `scripts/util/bvh.ts` imports 7+ mesh modules | runtime | move bvh.ts into mesh addon; extract interfaces into `scripts/util/spatial.ts` |
| `scripts/addon/addon_base.ts` re-exports mesh/bvh/subsurf/customdata/... on `AddonAPI` | barrel | drop; the mesh & subsurf addons call `api.exportNamespace('mesh', {...})` and `api.exportNamespace('subsurf', {...})` at register time |
| `scripts/subsurf/` tight Mesh coupling | barrel | subsurf moves into its own addon depending on `mesh` |
| `scripts/entry_point.js` imports `./mesh/*` eagerly | barrel | drop those imports; mesh loads via the addon pipeline |
| `scripts/test/test_sculpt*.js` imports mesh | runtime | those move into the relevant addon's test dir |

### 3.2 Slim AddonAPI

Core's `AddonAPI` keeps only framework-level surfaces: `pathux`, `nstructjs`, `util`,
`math`, `vectormath`, `shaders`, `simplemesh`, `editor`, `widgets3d`, `toolmode`
(base only), `toolop` (base only), `graph`, `lib_api`, `Icons`, `SelMask`, `KeyMap`,
`HotKey`, `sceneobject`, `bezier`. Everything mesh-shaped moves to the mesh addon's
exported namespace and is accessed by other addons through `@addon/mesh/api`.

### 3.3 Critical files

- `scripts/util/spatial.ts` (new — `ISurfaceSampler`, `IGenericIsect`,
  `IBVHCreateArgs`, `IBVHVertex`, generic AABB helpers)
- `scripts/util/bvh.ts` → `addons/builtin/mesh/src/bvh.ts`
- `scripts/core/data_kinds.ts` (new — kind registry: factories, importers, default
  builders, version migrators all keyed by kind id)
- `scripts/core/default_file.ts` (new — `setDefaultSceneBuilder` callback)
- `scripts/core/file_migrations.ts` (new — migration registry)
- `scripts/core/context.ts` (replace `instanceof Mesh` + remove mesh import)
- `scripts/core/lib_api.ts` (drop `import type {Mesh}`)
- `scripts/core/gen_default_file.ts` (use default_file callback)
- `scripts/core/appstate.ts` (walk file_migrations registry; drop `GridBase` import)
- `scripts/core/mesh_shapes.js`, `scripts/core/app_ops.js`: ImportOBJOp moves into
  the mesh addon's register(); mesh_shapes.js moves into the mesh addon
- `scripts/addon/addon_base.ts` (slim AddonAPI; remove mesh/* re-exports; add
  `exportNamespace`, `deps`, `getAddon`)
- `scripts/sceneobject/sceneobject_base.ts` (add `static dataKind`)
- `scripts/entry_point.js` (drop eager mesh imports; rely on addon load)
- `addons/builtin/mesh/src/main.ts` (new entrypoint that calls
  `api.exportNamespace('mesh', ...)`, registers the `Mesh` DataBlock, customdata
  classes, OBJ importer, default scene builder, version migrators)

---

## 4. STRUCT preservation for unloaded addons

Today, when a saved file references a class whose addon isn't loaded:

- `DataBlock`: silently skipped at `appstate.ts:685` — **data loss**.
- `CustomDataElem`: hard throw at `customdata.ts:714` — **load fails**.
- `ToolMode`: no explicit handling; either throws inside nstructjs or yields an
  unrecognized object that's filtered out at `scene.ts:796`.

The save scripts block (written via `nstructjs.write_scripts()`) already contains the
schema for every class registered at save time, so the bytes-for-the-data are
on-disk; we just lose them on read because no class is registered.

### 4.1 Mechanism

Introduce three permanently-registered placeholder classes in
`scripts/core/missing_addon.ts`:

```
MissingDataBlock      extends DataBlock           // also a DataBlock so it lives in datalib
MissingToolMode       extends ToolMode
OpaqueCustomDataElem  extends CustomDataElem
```

Each holds: `_origTypeName: string`, `_origStructName: string`,
`_rawData: Uint8Array`, `_structSchema: string` (the relevant slice of the
write_scripts block). On save, the placeholder writes itself by emitting its
`_rawData` verbatim under its original struct header.

### 4.2 nstructjs hooks (vendored as submodule up front)

Add `https://github.com/joeedh/STRUCT.git` as a submodule at `vendor/nstructjs/`,
update all four `package.json`s (root, `scripts/`, `electron/`, `tests/`, and the
nested `scripts/path.ux/package.json` if it pins the dep too) from
`"nstructjs": "^0.8.4"` to `"nstructjs": "file:../vendor/nstructjs"` (relative path
adjusted per package). Wire pnpm-workspace to include `vendor/nstructjs`.

In the vendored copy, add a first-class hook:

```ts
nstructjs.manager.onUnknownClass = (clsname, schema, rawBytes) => {
  // returns a placeholder instance constructed by the host app
}
```

The default implementation (when host doesn't set it) throws the current error so we
don't regress for callers outside this app. Our `entry_point.js` registers a handler
that:

- For `DataBlock` subclasses → returns a `MissingDataBlock` with the bytes/schema
  stashed
- For `ToolMode` subclasses → returns a `MissingToolMode`
- For `CustomDataElem` subclasses → returns an `OpaqueCustomDataElem`
- For anything else → returns a generic `MissingStruct` (so the read doesn't crash;
  the field gets the placeholder)

The hook also needs a corresponding write path: when a placeholder instance is
serialized, write its `_rawBytes` verbatim under its original struct header
(`_origStructName`). Add `nstructjs.manager.onSerializeUnknown(instance)` accordingly.

We coordinate the schema with the rest of the write_scripts block: the placeholder
also remembers its `_structSchema` slice, and on save we ensure that schema is
present in the file's scripts block even if the original class isn't currently
registered.

### 4.3 Critical files

- `vendor/nstructjs/` (new submodule; patches added on a branch we maintain)
- `package.json`, `scripts/package.json`, `electron/package.json`,
  `tests/package.json`, `scripts/path.ux/package.json`,
  `pnpm-workspace.yaml` (point nstructjs at local path)
- `scripts/core/missing_addon.ts` (new — `MissingDataBlock`, `MissingToolMode`,
  `OpaqueCustomDataElem`, `MissingStruct`; all permanently `nstructjs.register()`ed
  at app start before any addon loads)
- `scripts/core/appstate.ts` (install `onUnknownClass` handler; keep the existing
  catch around `readObject` but no longer silently skip)
- `scripts/scene/scene.ts` (preserve `MissingToolMode` entries in `toolmodes[]` and
  skip them when building `toolmode_map`; keep their bytes for re-save)
- `addons/builtin/mesh/src/customdata.ts` (formerly `scripts/mesh/customdata.ts`):
  remove the `throw new Error('unregistered CustomData detected')` at line 714 and
  use `OpaqueCustomDataElem` from core instead

---

## 5. Electron

- `electron/main.js` gains:
  - `ipcMain.handle('addon-storage-path')` returning `app.getPath('userData') + '/addons'`
  - `ipcMain.handle('addon-install', ...)` writing an extracted zip to that path
  - `ipcMain.handle('addon-uninstall', id)` removing it
  - `ipcMain.handle('addon-read', id, relPath)` for reading transpilation cache
- `electron/preload.js` (new) exposes a tightly-scoped bridge:
  `window.electronAddons = {getStoragePath, install, uninstall, read}`.
- `electron/window.html` still loads `../build/entry_point.js`; no change to the
  bootstrapping path.
- `electron/package.json` gains `esbuild-wasm` so source-mode third-party addons can
  be transpiled offline.
- `make_zip.py` updated to:
  - include `build/**` (the bundler output) **and** `addons/builtin/**`'s
    `manifest.json` only — built JS for builtins comes from `build/addons/`
  - exclude raw `addons/builtin/*/src/` (TS source not shipped)
  - drop now-empty `./scripts/mesh/**`, `./scripts/subsurf/**`, `./scripts/curve/**`,
    `./scripts/tet/**`, `./scripts/util/bvh.ts` from the sources list
  - keep `./scripts/path.ux/scripts/**`, `./scripts/util/**` (without bvh), `./assets/**`
  - add `./vendor/nstructjs/dist/**` so the local nstructjs build is shipped

### 5.1 Critical files

- `electron/main.js`
- `electron/preload.js` (new)
- `electron/package.json`
- `make_zip.py`

---

## 6. Migration order (implementation sequence)

Each step is a commit (or small commit chain) that builds and passes tests on its
own.

1. **Test infrastructure first.** Wire `jest-environment-jsdom`, ESLint
   `no-restricted-imports`, `dependency-cruiser`, build the `tests/lib/scene-fixture.ts`
   helper, and add a smoke `roundtrip_basic` integration test. Without this, every
   later step is a guess.
2. **BVH interface split.** Extract `scripts/util/spatial.ts` with the
   mesh-agnostic interfaces. `bvh.ts` keeps living in `util/` for now (temporarily)
   but imports from `spatial.ts`. Update all 26+ importers to use the new path for
   the interfaces. No behavior change.
3. **Core registries.** Add `data_kinds`, `default_file`, `file_migrations`. Move
   `mesh_shapes.js` and `gen_default_file.ts`'s Mesh use behind callbacks. Replace
   `instanceof Mesh` in `context.ts` with the kind tag. App still has mesh imports
   from many places, but core no longer pulls them — verified by the ESLint rule.
4. **nstructjs submodule.** Add `vendor/nstructjs/`, repoint `package.json` deps,
   patch in `onUnknownClass` / `onSerializeUnknown` hooks, ship the hook handler
   from `entry_point.js`. Add `MissingDataBlock`, `MissingToolMode`,
   `OpaqueCustomDataElem` placeholders. Add the missing-addon roundtrip test —
   it should pass even before any toolmode moves, because we can fake an addon
   being absent by directly unregistering a class.
5. **Addon build pipeline.** Write `tools/build-addons.js`, `tools/build-addon.js`,
   `scripts/addon/manifest.ts`, dependency-ordered loader, `exportNamespace`/`deps`
   on AddonAPI. Update `getAddonPrefix()` to point at `build/addons/`. Convert
   `TetMeshTool` (smallest target) to verify the pipeline end-to-end.
   *Implementation status as of commit c5bba8b*: 5a + 5b landed
   (`scripts/addon/manifest.ts`, AddonAPI extensions, dependency-ordered
   loader, `tools/build-addons.js`, esbuilder integration, test_addon
   fixture, addon_build integration test). The runtime `@addon/<id>/api`
   resolver and the TetMeshTool conversion are deferred into step 6: they
   benefit from being designed against a real addon (mesh) so the API
   surface and inter-addon import ergonomics are validated end-to-end.
6. **Move mesh into addon.** The big one. Move `scripts/mesh/` →
   `addons/builtin/mesh/src/`, plus `scripts/util/bvh.ts` → `addons/builtin/mesh/src/bvh.ts`.
   Add `addons/builtin/mesh/manifest.json`, write the addon entry that
   `exportNamespace('mesh', ...)`, registers the `Mesh` DataBlock, customdata,
   OBJ importer, default scene builder, version migrators. Update every consumer
   that used to import `scripts/mesh/*` to import via `@addon/mesh/api` (only inside
   other addons) or move with the dependent code.
7. **Move subsurf into addon.** Tight `Mesh` coupling; depends on `mesh`. New
   `addons/builtin/subsurf/`.
8. **Move remaining toolmodes.** `mesh_edit` (mesheditor+meshtool), `curve` (with
   `scripts/curve/`), `pbvh_sculpt`, `sculptcore` (with sculptcore submodule glue),
   `tetmesh` (with `scripts/tet/`). Each declares dependencies in its manifest;
   loader topo-sorts. Delete `_old_mesheditor.ts`.
9. **Source-mode third-party addons.** Wire `esbuild-wasm`, write
   `scripts/addon/transpile.ts`, exercise via fixture test.
10. **Install workflow.** `installFromZip`, web (OPFS/IndexedDB) + Electron
    (`userData`), UI in addon settings, Electron IPC + preload.
11. **Electron verification.** `npm run build`, `cd electron && npx electron .`,
    walk through SMOKE.md. Fix anything that broke.
12. **Cleanup pass.** Delete now-dead code in `scripts/core/`, `scripts/`. Final
    `dependency-cruiser` check, final layer ESLint sweep.
    *Status*: ✅
    - `scripts/mesh/migrations.ts` (new): registers v5/v6 grid migrations
      with `core/file_migrations`. `appstate.do_versions` runs them via
      `runFileMigrations(...)`. Drops `import {GridBase} from '../mesh/...'`
      from core.
    - `AppImportOBJOp` moved from `scripts/core/app_ops.js` to
      `scripts/mesh/import_obj_op.js`. Drops `import {ImportOBJOp}` from
      core. Side-effect imported from entry_point so `ToolOp.register`
      still fires.
    - `core/appstate.ts` no longer imports `editors/view3d/tools/tools` —
      entry_point.js does the side-effect import.
    - Layer warnings dropped 26 → 23 (three core/util→mesh edges removed:
      `core/appstate→mesh_grids`, `core/app_ops→mesh_createops`,
      `core/appstate→view3d/tools`).
    - Remaining 23 warnings are: `util/bvh.ts → mesh` (5 edges; bvh
      physically moves into mesh in the deferred file-rename
      follow-up), `util/objloader.js → mesh` + `util/fbxloader.js →
      mesh` (same — these are mesh-specific files stranded in util/),
      `core/missing_addon.ts → mesh/customdata` (the placeholder
      extends CustomDataElem; unavoidable until customdata physically
      moves out of mesh/), and a handful of mesh-internal no-circular
      warnings outside this refactor's scope.

---

## 8. Final tally (at completion)

- **Tests**: 68 passing across 11 suites (started at 1 stub).
- **Typecheck**: 58 errors against the main tsconfig — every one pre-existing
  on this branch and confirmed unchanged by stashing the refactor before
  re-running. Net error count from before the refactor: 149 → 58.
- **Layer check (dependency-cruiser)**: 23 violations / 0 errors. Started
  the refactor with 30+ core→mesh edges in source.
- **Commits on `claude/toolmodes-addons-refactor`**: 20.
- **vendored nstructjs**: own local branch `webgl-app-framework-patches`
  at 5cd3469 (adds onUnknownClass + onSerializeUnknown hooks; 33 upstream
  tests still pass).

---

## 7. Testing strategy & new test infrastructure

### 7.1 Current state

`tests/` contains a single `test.test.ts` with `expect(true).toBe(true)`. Jest is
configured (`@swc/jest`, `jest ^30.2.0`, ESM via `--experimental-vm-modules`) but
unused. There is no save/load round-trip test, no addon-loader test, no boundary
check between core and mesh. We need real infrastructure before this refactor lands,
because every one of the moving parts (mesh decoupling, addon loader, struct
preservation, install flow) is the kind of thing that silently regresses.

### 7.2 Layered test plan

**Layer A — static boundary checks (cheap, prevents future regressions)**

- Add an ESLint `no-restricted-imports` rule in `eslint.config.js`:
  - inside `scripts/core/**`, forbid `../mesh/*`, `../editors/view3d/tools/*` (except
    `view3d_toolmode`, `view3d_panmode`, `selecttool`), and any `addons/**`
  - inside `scripts/util/**`, forbid `../mesh/*` (forces the BVH split in §3)
  - inside `addons/builtin/<x>/src/**`, forbid `../../../<other-builtin>/**` (use the
    runtime `api.getAddon()` namespace instead)
- Add a `tools/check-layers.js` (calls `dependency-cruiser`) as `npm run check:layers`
  hooked into CI, with a config codifying the same rules. Belt-and-suspenders with
  ESLint but catches imports inside `.js` files ESLint might miss.

**Layer B — unit tests for core registries (Jest, node environment)**

New files under `tests/unit/`:

- `data_kinds.test.ts` — register/unregister kinds, lookup, duplicate-id rejection
- `default_file.test.ts` — `setDefaultSceneBuilder` callback fires; default scene is
  empty when none set
- `file_migrations.test.ts` — registered migrators run in version order
- `addon_loader.test.ts` — load fixture addon, assert ToolMode/DataBlock/CustomData
  got registered; unload, assert they got unregistered; dependency-ordered load
- `missing_addon.test.ts` — placeholder classes accept raw bytes, round-trip them,
  and don't crash when their original class is missing

These run with `npm test` against `jsdom` (we'll need `jest-environment-jsdom`
because so much core code touches `window`, `document`, and `_appstate`).

**Layer C — save/load round-trip harness (the most important new infra)**

New `tests/lib/scene-fixture.ts` exposing:

```ts
function makeHeadlessAppState(opts?: {addons?: string[]}): AppState
function saveSceneToBytes(app: AppState): Uint8Array
function loadSceneFromBytes(bytes: Uint8Array, opts?: {addons?: string[]}): AppState
```

This bootstraps `_appstate`, a minimal `ViewContext`, an in-memory datalib, and the
addon manager configured to load from a local `tests/fixtures/addons/` directory
that's a mirror of `addons/builtin/` (but only the smallest viable variant of each).

New `tests/integration/`:

- `roundtrip_basic.test.ts` — save/load empty scene
- `roundtrip_mesh.test.ts` — save scene with cube, reload, verify Mesh + customdata
- `roundtrip_missing_addon.test.ts` — the critical one:
  1. Load app with `mesh_edit` enabled, build a cube with a custom face-set layer,
     save bytes A.
  2. Reload bytes A with `mesh_edit` **disabled**. Assert no throw, assert the cube
     is now a `MissingDataBlock`, assert the face-set layer is an
     `OpaqueCustomDataElem`.
  3. Save again (bytes B). Assert `bytes B == bytes A` byte-for-byte for the
     affected blocks (verifies raw-bytes pass-through).
  4. Reload bytes B with `mesh_edit` re-enabled. Assert the cube is back to a real
     `Mesh` with the face-set layer intact.
- `roundtrip_missing_toolmode.test.ts` — same shape, scene saved with `sculptcore`
  active; reloaded with the sculptcore addon disabled; placeholder kept in
  `scene.toolmodes`; scene falls back to Object mode (`toolmode_i = 0`); re-save
  preserves the placeholder.

**Layer D — addon build & dynamic-import test**

`tests/build/addon_build.test.ts`:

- Spawn `tools/build-addons.js` against `tests/fixtures/addons/test_addon/` (a tiny
  TS addon that registers one ToolMode and one ToolOp).
- Assert `build/addons/test_addon/main.js` exists and is parseable.
- Dynamic-import it in the test, pass a mock `AddonAPI`, assert it called
  `api.register(SomeClass)`.
- Run against both the dev (split) and a production (single-file) esbuild config to
  catch chunk-resolution regressions.

`tests/fixtures/addons/test_addon/` becomes the canonical example for addon authors;
keeping it correct is part of CI.

**Layer E — install flow tests**

`tests/integration/install_flow.test.ts`:

- Pack `tests/fixtures/addons/test_addon/build/` into a zip in memory.
- Pass to `AddonManager.installFromZip(blob, {storage: new InMemoryAddonStorage()})`.
- Assert the manifest was validated, files extracted to the in-memory FS, and the
  addon then loaded successfully.
- Cover failure cases: bad manifest, missing entry, version conflict, dependency
  on a missing addon.

**Layer F — manual smoke + headed Electron**

We will not introduce Playwright in this refactor (cost > benefit at this stage), but
we document a smoke checklist:

- `tests/smoke/SMOKE.md` — step-by-step manual verification for web (Chrome via
  `npm run serv`) and Electron, exercising each addon: enable/disable, save default
  scene with cube, sculpt a vertex, save & reload.
- A `tools/smoke-electron.sh` that runs `npm run build` and `npx electron .` and
  prints what to click. Not automated but a single command.

If we decide later that automated E2E is necessary, the install-flow + roundtrip
harnesses above are the right substrate to grow into a `@playwright/test` rig.

### 7.3 New testing infrastructure summary

| Item | Purpose | New? |
|---|---|---|
| `jest-environment-jsdom` dep | Real env for code touching `window` | New |
| ESLint `no-restricted-imports` rule | Layer enforcement at lint time | New |
| `dependency-cruiser` + `tools/check-layers.js` | Layer enforcement at CI | New |
| `tests/lib/scene-fixture.ts` | Headless app/scene factory | New |
| `tests/fixtures/addons/test_addon/` | Canonical TS addon for build & loader tests | New |
| `tests/unit/*.test.ts` | Registry unit tests | New |
| `tests/integration/roundtrip_*.test.ts` | Save/load with addons on/off | New |
| `tests/build/addon_build.test.ts` | Real esbuild → import test | New |
| `tests/integration/install_flow.test.ts` | Install-from-zip test | New |
| `tests/smoke/SMOKE.md`, `tools/smoke-electron.sh` | Manual Electron checklist | New |

### 7.4 CI

Wire `npm run check:layers && npm run typecheck && npm test && npm run build` into a
single Turbo task chain so the addon build is exercised on every CI run. The smoke
script is run-on-demand only.

### 7.5 Final acceptance verification (end-to-end)

- `npm run check:layers && npm run typecheck && npm test && npm run build` all pass
- `build/entry_point.js` and `build/addons/<id>/main.js` exist for each builtin addon
  plus `build/addons/index.json`
- `npm run serv` + `http://localhost:5007` — Object mode loads with **no** addons
  enabled; enabling Mesh Edit through the addon UI loads `meshtool` keymap and
  switches the toolmode enum
- `cd electron && npx electron .` — same as above in Electron, and the addon install
  flow picks up a manually-placed zip in `userData/addons/`
- Save a default cube scene, disable the `mesh_edit` addon, reload, re-save,
  re-enable, reload — cube and custom-data layers come back intact (the integration
  test asserts this, but verify manually once too)
