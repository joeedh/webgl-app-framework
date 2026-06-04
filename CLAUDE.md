Read the contents of AGENTS.md.

## Do not do dynamic imports

- Do not do e.g. `InputSet extends import('../../path.ux/scripts/pathux.js').PropertySlots = {},`
  add a proper type import

## Addons

The builtin editing features (mesh, mesh_edit, curve, subsurf, tetmesh,
pbvh_sculpt, sculptcore) live under `addons/builtin/<id>/src/`. See
[documentation/addons.md](documentation/addons.md) for the full authoring
guide. Key conventions:

- Addons import framework primitives through `@framework/api` (resolves to
  `scripts/framework_api.ts`). **Do not** write
  `../../../../scripts/foo.js` from inside an addon — if a symbol is
  missing from the re-export hub, add it there.
- Peer-addon imports go through `@addon/<id>/api` (the `api.ts` shim file
  in that addon's `src/`). The esbuild plugin
  `tools/addon_api_plugin.js` rewrites these into runtime registry
  lookups.
- Class registration is dispatched through `api.register(cls)` /
  `api.registerAll(...classes)` inside each addon's `register(api)`
  lifecycle hook. The dispatcher handles `ToolOp` / `ToolMode` /
  `DataBlock` / `CustomDataElem` / `SceneObjectData` / `Editor` /
  `nstructjs` registration in one call.
- **Do not** write module-scope `ToolOp.register(...)` /
  `ToolMode.register(...)` / `DataBlock.register(...)` /
  `CustomDataElem.register(...)` / `SceneObjectData.register(...)` /
  `nstructjs.register(...)` side effects in addon code. They bypass the
  per-addon registry and can't be cleanly unregistered. The lone
  exception is `nstructjs.inlineRegister(this, structSrc)` written as a
  static-field initializer, which must stay at class scope.
- The mesh addon collects its 100+ registerable classes into the
  auto-generated `addons/builtin/mesh/src/register_classes.ts`. If you
  add a new class that needs registering, either add it manually to that
  list or rerun `node tools/migrate-mesh-registers.js` to regenerate it.

## Rendering

The realtime renderer is WebGPU-only. See
[documentation/rendering.md](documentation/rendering.md) for the frame
topology (`NormalPass → AOPass → BasePass → AccumPass ⇄ PassThruPass →
SharpenPass.{x,y} → OutputPass`), bind-group conventions, and how to add
new post-process or scene-walk passes. Key conventions:

- Offscreen targets are `rgba16float` + `depth24plus`; the canvas
  swap-chain is `bgra8unorm`. Pipelines registered against the
  offscreen format are transparently re-cached against the swap-chain
  format when `node.surface` is set on the `OutputPass` node.
- New post-process passes go in
  `scripts/renderengine/wgsl_render_passes.ts` (WGSL + `registerWgslPass`),
  then a `GraphNodeRef` is emitted from
  `RealtimeEngine.rebuildGraphWebGPU`. Bindings 0/1/2/3/7 are wired
  generically by `_buildPostProcessBindGroup`; pass-specific extras
  (binding 4+) need code there.
- Scene-walk passes (`NormalPass`, `BasePass`) are marker entries —
  `WebGpuRenderGraph.exec` special-cases the `passKey` and calls
  `hooks.encodeMeshNormalPass` / `encodeMeshBasePass` instead of
  drawing the fullscreen quad.
- Overlays (grid, widgets, drawDrawLines, toolmode debug) install
  themselves via `engine.encodeOverlaysCB`; the engine reopens a
  `loadOp: 'load'` pass against the same swap-chain view OutputPass
  wrote.
- Shader-node materials (`scripts/shadernodes/`) are **WGSL-only** (the
  legacy GLSL `ShaderGenerator`/`genCode()` path is gone; codegen lives
  on the node classes via `ShaderNode.genWgsl`) and **attribute-driven**:
  a material declares which named mesh attributes it reads (`AttributeNode`
  → `WgslShaderGenerator.requestAttribute`), and `generateWgsl` returns a
  slot-ordered `requestedAttrs` contract. For a `LiteMesh` the renderengine
  hands that set to sculptcore (`setRequestedAttrs`/`setDrawShader`), which
  builds one vertex buffer per attribute (default-filled when absent, never
  throwing). See [documentation/shader-attributes.md](documentation/shader-attributes.md);
  the C++ side is `sculptcore/documentation/spatial.md` ("Requested
  attributes & the material draw shader").

## Picking

Viewport picking (click-select, brush/circle select, box select, transform
snap) is **geometric and addon-owned**: there is no GPU id-buffer (the old
WebGL `GPUSelectBuffer` + `FindnearestClass` registry are gone). See
[documentation/picking.md](documentation/picking.md). Key conventions:

- Each object type implements picking as overridable instance methods on its
  `SceneObjectData` subclass: `castViewRay` / `findNearest` / `castScreenCircle`
  / `castScreenRect` (`scripts/sceneobject/sceneobject_base.ts`). The base class
  provides bounding-box object-level defaults gated on the data's
  `dataDefine().selectMask`, so any type with a sane `getBoundingBox()` is
  pickable with no bespoke code (only a correct `selectMask` is required).
- Core `scripts/editors/view3d/findnearest.ts` is a thin dispatcher:
  `FindNearest` / `castViewRay` walk `view3d.sortedObjects` and call the data
  method on each, then aggregate (nearest by screen distance / ray depth). It
  does **not** pre-filter by type — methods gate on `selectMask` themselves
  (this is how one `Mesh` serves both `SelMask.MESH` and `SelMask.GEOM`).
- Brush/box ops call `mesh.castScreenCircle` / `mesh.castScreenRect` directly.
  `Mesh` (mesh addon) overrides with BVH cone (circle) / frustum (rect) queries;
  the dependency-free frustum predicates live in `scripts/util/frustum.ts`
  (re-exported via `isect.ts` / `@framework/api`), with `facesInFrustum` /
  `vertsInFrustum` added to `addons/builtin/mesh/src/bvh.ts`.
- `ScreenPickResult.elements` is typed `unknown[]` so core never depends on an
  addon's element type — narrow it in the owning addon.
- `LiteMesh` routes circle/box select to the sculptcore `SpatialTree`
  `castScreenCircle` / `castScreenRect` C++ queries, backend-agnostically (8
  rect corners + cone endpoints cross as bound `float3`s, results as
  `Vector<int>` out-params; native uses the `makeIntVector` N-API helper).

## Icons

UI icons come from a single hand-authored sheet, `assets/iconsheet.svg` (the
`iconsheet*.png` files are generated and unused — ignore them). See
[documentation/iconsheet-guide.md](documentation/iconsheet-guide.md). Key
conventions:

- The sheet is a **16-column** grid of `32 × 32` cells; icons fill it row-wise
  (top-left → bottom-right) in the index order of the `Icons` map in
  `scripts/editors/icon_enum.js`. An icon's cell is `row = floor(index/16)`,
  `col = index % 16`, at SVG box `x = col*32, y = row*32, 32 × 32`.
- **To modify** an icon, find its index in `Icons`, compute the cell, and edit
  that box in Inkscape. **To add** one, **append** the name to `Icons` (next
  index) and draw into the new cell — never reorder/delete entries or every
  later icon shifts cells.
- `node tools/iconsheet.mjs {locate|list|add|grid}` does the index↔cell
  arithmetic and can append to `Icons` / emit a visual locator overlay.
- Icons are wired into the **data-path binding system**: enum/bitflag
  properties attach a per-value icon via `prop.icons({KEY: Icons.NAME})` in
  `scripts/data_api/api_define.js`. To resolve which path/binding an icon feeds,
  see [documentation/datapath-bindings.md](documentation/datapath-bindings.md).

## Electron test harness / CLI

The Electron shell takes CLI args to boot the real app and build/save/dump
deterministic test scenes headlessly — the orchestration layer for the
sculptcore native-addon work. See
[documentation/plans/native-electron-test-harness.md](documentation/plans/native-electron-test-harness.md)
for the full flag reference. Key conventions:

- `electron/main.js` does NOT get args into the renderer via `process.argv`
  (Electron drops them). It forwards them as a base64 `--apptest-argv=<…>`
  token in `webPreferences.additionalArguments`; `scripts/core/app_argv.ts`
  decodes it (falling back to the legacy `arguments.txt`). The browser build
  sees an empty arg list, so the harness is inert there.
- Main-process-only flags are parsed in `main.js` (they act before the window
  exists): `--remote-debug[=PORT]` (CDP endpoint for chrome-devtools-mcp),
  `--headless`, `--no-devtools`. Renderer flags are parsed in
  `scripts/core/test_harness.ts`: `--gen-scene <name>`, `--scene-arg k=v`,
  `--eval "<js>"`, `--run "tool.path(...)"`, `--save`, `--dump`, `--screenshot`,
  `--backend`, `--list-scenes`, `--exit`. None set → normal launch, unaffected.
- Test scenes live in a name→builder registry (`scripts/core/test_scenes.ts`,
  mirroring `core/default_file.ts`'s single-builder hook). Builders register
  **downward** into this core registry from the layer that owns their deps —
  core must not import lite-mesh/sculptcore. `litemesh-cube` is registered from
  `scripts/lite-mesh/litemesh_test_scene.ts` (side-effect import in
  `entry_point.js`). Add a scene with `registerTestScene(name, builder)` from
  the appropriate layer, not from core.
- `--gen-scene` rebuilds the startup file via the **non-cached**
  `genDefaultFile(appstate, 1)` path, so the localStorage startup snapshot is
  ignored and the scene is exactly what the builder produced. LiteMesh
  serialization is still stubbed, so scenes are built procedurally, not loaded
  from `.wproj`.
- `--remote-debug` exposes a standard CDP endpoint; point the chrome-devtools
  plugin at it with a separate `chrome-devtools-electron` MCP server (`.mcp.json`,
  `npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222`). Adding
  an MCP server requires a Claude Code restart to take effect.

## Debug context API (`CTX.debug`)

`ViewContext.debug` (`scripts/core/context.ts`, class `DebugEditorAPI`) is a
small reflection / test-automation surface on the app context. Reach it from any
renderer-JS eval context as **`CTX.debug`** (the `CTX` window global is
`_appstate.ctx`, defined in `entry_point.js`), or as `ctx.debug` in app code.

- `CTX.debug.listEditorTypes()` — every registered editor's `define()` metadata,
  with `flag` decoded to `AreaFlags` names and `icon` resolved to its `Icons`
  key. Use it to discover valid `editorType` values.
- `CTX.debug.getIconKey(icon)` — reverse-lookup an icon number → its `Icons` name.
- `CTX.debug.showEditor({editorType, minVisibleWidth, minVisibleHeight?})` —
  ensure an editor of that type is open and at least that big, swapping a
  suitable on-screen area for it (prefers an already-visible one, then a
  PropsEditor, then any non-viewport area, then the 3D viewport) and making it
  the **active** area. `editorType` takes an areaname/apiname/tagname string, an
  editor class, or an Editor instance; returns `{editor, action, swappedOutEditor?}`.

### Using it in integration tests

Some ToolOps depend on which editor is active. The node-graph ops (`node.*`,
`editors/node/node_ops.ts`) read the active editor (`ctx.editor`) in their static
`invoke`: when it's a `NodeEditorBase` subclass they auto-fill the op's
`nodeEditorPath` input, which `getNodeEditor` then uses (e.g. for
`useNodeEditorGraph=1`, which copies the editor's current graph path). The only
**registered** such editor is `MaterialEditor` (areaname `MaterialEditor`, the
Shader Editor); `NodeEditorBase` is an abstract base and is intentionally not
registered. Pass an explicit `graphPath`/`graphClass` and the ops run with no
editor open at all (that's what `node_editor_ops.test.ts` does); use `showEditor`
when you want the op to follow the *editor's* graph, or to test an editor whose
behavior changes with the active area.

- **Playwright e2e (browser build, `tests/e2e/`)** — no bridge needed; evaluate
  in the page realm, exactly like the existing `_appstate` calls there:
  ```ts
  await page.evaluate(() =>
    window.CTX.debug.showEditor({editorType: 'MaterialEditor', minVisibleWidth: 400}),
  )
  // MaterialEditor is now ctx.editor → node.* ToolOps auto-fill nodeEditorPath
  ```
- **chrome-devtools-mcp (Electron via `--remote-debug`)** — the CDP
  `evaluate_script` tool calls `CTX.debug.*` the same way over the endpoint.
- **Headless harness (`electron/main.js` + `--run`/`--dump`)** — `--run` only
  runs ToolOps, so reaching `CTX.debug` needs the harness's **`--eval "<expr>"`**
  flag (`scripts/core/test_harness.ts`): it evals each expression in global scope
  (where `CTX`/`_appstate` live) after the scene is built and before the `--run`
  tools, flagging failures on `__apptestResult`.
  `tests/integration/node_editor_ops.test.ts` uses it as a worked example —
  reflecting (`CTX.debug.listEditorTypes()`) and driving a ToolOp
  (`CTX.api.execTool(CTX, 'material.new()')`) from JS. Note: `showEditor`
  instantiates a full editor and needs a laid-out screen, so it works in the
  browser/Playwright path above but can crash the bare headless boot — there,
  prefer reflection or ops with an explicit `graphPath`.

## Native sculptcore backend (N-API)

`sculptcore` runs from the TS app through **two interchangeable backends behind
one `IWasmInterface`** (`sculptcore/typescript/api/wasm.ts`): **WASM** (browser;
TS runtime over linear memory, 32-bit, `HEAP32[ptr>>shift]`) and **native
N-API** (Electron; a C++ reflection runtime in `sculptcore/source/napi/` that
reads `litestl::binding` descriptors directly and dereferences real `void*`s).
See [documentation/native-napi-electron.md](documentation/native-napi-electron.md)
for the full model, and [documentation/plans/native-electron.md](documentation/plans/native-electron.md)
for status. Key conventions:

- Build the addon with `node sculptcore/make.mjs node [--smoke]` →
  `build/native-node/sculptcore_node.node`. It's a CMake `MODULE` in the **root**
  `CMakeLists.txt` gated on `DEFINED CMAKE_JS_VERSION`; cmake-js does *configure*
  (Electron headers + `node.lib`), clang builds it into `build/native-node/`
  (untouching `build/native`). Re-run after an Electron bump to ABI-rebuild.
  Entry: `source/napi/napi_entry.cc`. **Raw C N-API** (`node_api.h`), **not**
  node-addon-api (its `CallbackInfo` miscompiles under this clang toolchain).
- The native path is **opt-in**: `--backend native` (test harness) sets
  `globalThis.__SCULPTCORE_BACKEND` early in `entry_point.js`; `loadWasm()`
  branches and falls back to WASM if the `.node` is absent. The browser is always
  WASM.
- **Pointers never cross to JS as numbers natively** — C++ does every
  dereference. App code must treat bound objects as the opaque `SculptHandle`
  (never read `.ptr`) and pass them through the backend-agnostic
  `IWasmInterface` helpers (`getBoundVector`, `Mesh_*`, `bufferBytes`/`bufferKey`
  via `pointerBytes`/`objectAddress`). The WASM `typescriptRuntime/*` stays
  unchanged (wasm32/number-based).
- **No zero-copy bulk reads natively.** Electron's V8 sandbox forbids external
  ArrayBuffers (`napi_no_external_buffers_allowed`), so `vectorView`/
  `pointerBytes` **copy** into a sandbox-internal buffer (read-only; one memcpy
  per buffer). **Never throw on the bulk-data seam** — return an empty
  `Uint8Array` for a not-yet-filled buffer (a throw is swallowed as a
  `drawObjects` warning and silently aborts the whole render pass).
- Parity is guarded by `tests/integration/sculptcore_parity.test.ts` (under
  `pnpm test`): boots the app headlessly per backend, diffs GPU-buffer
  signatures + leaf counts; self-skips when the bundle or `.node` is absent.

## Dynamic topology

Geometry under a sculpt dab is subdivided/collapsed on the fly to track a target
edge length, attributes interpolated onto new geometry. **Built and shipped
(sculptcore, milestones M1–M7); the 5-million-triangle / ≥25 fps target is met on
the CPU with no GPU offload.** The remesh core is `sculptcore/source/dyntopo/`
(Botsch-Kobbelt split/collapse/flip/smooth over independent-set rounds, with a
graded target and a per-dab split budget); spatial-tree currency is incremental
(`sculptcore/source/spatial/`, M7.6). See
[sculptcore/documentation/dynamic-topology.md](sculptcore/documentation/dynamic-topology.md)
(design + post-M7 re-evaluation, incl. why the GPU offload is now optional) and
[sculptcore/documentation/plans/dyntopo-m7-cascade.md](sculptcore/documentation/plans/dyntopo-m7-cascade.md).

## Typecheck

Run `npx tsgo --noEmit`, **not** `tsc`. The current main-tsconfig
baseline is 106 pre-existing errors concentrated in
`scripts/editors/view3d/tools/pbvh_sculptops.ts` (~62),
`addons/builtin/subsurf/src/subsurf_mesh.ts`,
`scripts/editors/view3d/transform/transform_types.ts`,
`sculptcore/typescript/api/wasm.ts`, and `scripts/sculptcore_demo.ts`.

## Data API paths

See [documentation/datapath-bindings.md](documentation/datapath-bindings.md)
for the binding-system overview (how `api_define.js` declares props, and how
enum/flag icons attach via `.icons(...)`).

Valid `path` strings for `container.prop("...")` (and `slider`, `check`,
`checkenum`, `listenum`, `pathlabel`, `textbox`, plus `<prop path="...">`
xmlpage tags) are catalogued by walking `getDataAPI()`
(`scripts/data_api/api_define.js`). Run `pnpm gen:paths` after editing
`api_define.js` to regenerate `scripts/data_api/generated/`:

- `API_PATHS.md` — human/LLM reference (path, type, UI name, range, unit, enum)
- `api-paths.json` — machine-readable catalog
- `datapaths.ts` — `DataPathRegistry` augmentation that powers `KnownDataPath`
  autocomplete; it's committed and listed in `tsconfig.json`'s `files`

`pnpm typecheck` runs `gen:paths` first, so the catalog never goes stale during
type-checking (`pnpm build` does not — generation is type/lint-only). The
`pathux/valid-datapath` ESLint rule (warn) flags `prop(...)` strings not in the
catalog; dynamically-indexed paths (e.g. `flag[ENUMNAME]`) warn because the
walker can't enumerate them — those are expected and harmless.

## Cross-layer follow-ups

`TODO.md` (repo root) tracks non-addon consumers of addon files and
cross-addon `scripts/...` path imports that survive the addon-API
migration. Add to it when you discover another one.

## Secondary-agent worktree

A persistent git worktree for secondary/parallel agentic work lives at
`C:/dev/webgl-app-framework-agent` (a sibling of this repo; it is not nested
inside it). Use it to run a second agent without disturbing the primary
checkout. Conventions:

- **Idle state = detached at `master`.** `master` is checked out in the main
  worktree, and git forbids the same branch in two worktrees, so the agent
  worktree cannot hold a normal `master` checkout. When not in use it sits in
  **detached HEAD at `master`'s commit**; its submodules sit at their pinned
  (recorded) commits. Leave it this way when you finish.
- **When starting work, switch to a new branch** in the worktree:
  `git -C C:/dev/webgl-app-framework-agent switch -c <branch>`.
- **Only commit submodules you actually modified onto a new branch** — leave
  untouched submodules detached at their pinned commits. Inside a modified
  submodule: `git switch -c <branch>` before committing there, then bump the
  gitlink in the superproject branch.
- **When done, return to idle:** commit/stash or discard your work, then
  `git -C C:/dev/webgl-app-framework-agent checkout --detach master` and
  re-sync submodules (below). (`checkout master` will fail — it's held by the
  main worktree; always use `--detach master`.)

### Syncing the worktree + submodules

Linked worktrees do **not** auto-populate submodules, and this repo pins
several submodules to **local-only commits that were never pushed** (currently
`sculptcore` and `sculptcore/source/litestl`; historically others). Plain
`git submodule update --init --recursive` therefore fails with
`upload-pack: not our ref <sha>` on those. Recover by fetching the missing
commit from the **main worktree's** copy of that submodule, then re-running the
recursive update:

```sh
cd C:/dev/webgl-app-framework-agent

# 1. Sync the superproject to master, then submodules to their pinned commits.
git checkout --detach master
git submodule update --init --recursive

# 2. If step 1 aborts with "not our ref <sha>" for a submodule <path>,
#    fetch that exact commit from the main worktree's matching submodule,
#    check it out, then resume the recursive update. Repeat per failing path:
cd <path>                                                  # e.g. sculptcore
git fetch C:/dev/webgl-app-framework/<path> <sha>
git checkout <sha>
cd C:/dev/webgl-app-framework-agent
git submodule update --init --recursive                    # continue / finish
```

A clean result has every line of `git submodule status --recursive` prefixed
with a space (no `+`/`-`), matching the main worktree's pinned commits. To
instead advance a submodule to the tip of its own `master` (e.g. before new
work in it), `cd` into it and `git switch master && git pull`, then bump the
gitlink in the superproject branch.
