Read the contents of AGENTS.md.

## Do not do dynamic imports

- Do not do e.g. `InputSet extends import('../../path.ux/scripts/pathux.js').PropertySlots = {},`
  add a proper type import

## Code Comments

Note: roughly preserve comments written by the user however if they ask you to audit
      or correct comments in a file you may edit the comment to ensure correctness.

- **Doc vs non-doc comments**: a *doc comment* documents the signature it sits
  directly above (a function, method, struct, class, or file) — typically `/** */`
  / `///` / a file-level header. Everything else is a *non-doc comment*: inline or
  block comments inside a function body explaining a specific statement or step.
  The 3-line length limit below applies **only to non-doc comments**.
- **Permanent non-doc comments**: keep short and concise — no more than 3 lines.
  A comment longer than 3 lines is allowed at most once per ~500 lines of a file.
  Permanent comments should not reference the prior state of the code.
- **TODO comments**: may exceed the 3-line limit. Mark especially high-priority
  items with `XXX:`; mark ordinary ones with `TODO:`.
- **Refactor / implementation / temp comments**: no length limit, but prefix them
  with `CLAUDENOTE:` so they can be found and stripped later. The final step of
  any plan is to remove the `CLAUDENOTE:` comments — replacing the ones still
  worth keeping with permanent (≤ 3-line) non-doc comments.
- **Doc comments**: not subject to the 3-line limit, but still keep them short
  and concise; only add them for non-obvious function signatures. A doc comment
  may simply explain how a non-obvious parameter behaves when that is shorter
  than describing the whole function.
- **Approved long non-doc comments**: when a non-doc comment genuinely needs to
  exceed 3 lines (or push a file past its budget), you may ask me to approve it.
  If I approve, add an entry in the form `{path}:{function}:{one-line summary}`
  to the nearest sub-project's approved-comments registry — for sculptcore that
  is `sculptcore/approvedLongComments.md` (see `sculptcore/CLAUDE.md` for the
  C++ style requirement). Entries listed there are exempt from the length limit
  and the per-file budget — do not flag or shorten them in a later comment audit.

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

## Feature-edge marking (seams & sharp)

The interactive seam / sharp marking tools (`litemesh.mark_seam_interactive` /
`mark_sharp_interactive`, hotkeys `K` / `Shift+K`) share one modal base,
`MarkEdgePathBaseOp` (`scripts/lite-mesh/litemesh_ops.ts`): knife-style chain
marking with shortest-path segments, snap-to-feature-vertex (10 px, white ring),
and per-edge-snapshot undo. They flag the source-of-truth `boundary::EDGE_SEAM` /
`EDGE_SHARP` attributes through one kind-parameterized engine path
(`Mesh::markEdgePath` / `edgeFlagKind` / `setEdgeFlagKind` / `featureVerts`, `kind`
0 = seam / 1 = sharp). The persistent overlay (`SpatialTree::buildSeamBatch`,
toolmode `drawFeatureOverlay`, default on) draws all boundary-flagged edges in
distinct colors. See [documentation/feature-marking.md](documentation/feature-marking.md).

## Node editor

The node-graph editor lives in `scripts/editors/node/`. See
[documentation/node-editor.md](documentation/node-editor.md). Key conventions:

- `NodeEditorBase` (`NodeEditor.ts`) is an **abstract, unregistered** pan/zoom
  graph editor; the only registered subclass is `MaterialEditor` (the Shader
  Editor). `NodeViewer.ts` is a separate read-only canvas viewer. It edits a
  `Graph` located by **data-API path** (`graphPath`, default `material.graph`),
  not a hard reference.
- **Rendering is CSS-transform-driven, not per-node repositioning.** `_recalcUI`
  applies `velpan.domMat` (a `DOMMatrix`) as one CSS `transform` on
  `nodeContainer`; each `NodeUI` places itself in graph space and connection
  lines are drawn into the container's SVG overdraw. The container and SVG are
  `overflow: visible` so transformed-out lines aren't clipped. Per-frame work is
  batched via the `recalcFlags` bitmask (`NodeRecalcFlags.UI | REBUILD`), drained
  in `update()`.
- All edits go through the `node.*` ToolOps (`node_ops.ts` /
  `node_selectops.ts`), so they are undoable; the editor never mutates the graph
  directly. `NodeGraphOp` locates its target via `graphPath` / `graphClass` /
  `nodeEditorPath`. Passing `useNodeEditorGraph=1` makes the op inherit the
  active editor's graph; passing an explicit `graphPath`/`graphClass` lets ops
  run with no editor open (see `tests/integration/node_editor_ops.test.ts`).

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
  `scripts/data_api/api_define.ts`. To resolve which path/binding an icon feeds,
  see [documentation/datapath-bindings.md](documentation/datapath-bindings.md).

## NW.js test harness / CLI

The desktop shell is **NW.js** (the `nwjs/` workspace; `electron/` was removed).
NW.js merges the Node + browser contexts into one window, so there is no main
process — `require`, `process`, `nw.Menu`, `nw.Window`, and file dialogs are all
reachable directly in the renderer. Launch with `pnpm run nwjs` (which runs
`node nwjs/launch.mjs --backend native`); the launcher resolves the NW.js binary
via the `nw` SDK package (`nw.findpath()`) and spawns `nw <repo-root> <args>`.

The **NW.js app root is the repo root** (its `package.json` is the manifest, with
`main: nwjs/window.html`, `window`, and `chromium-args`). This is required because
NW.js serves the app directory as the `chrome-extension://` root and **cannot
reach files outside it** — so `build/`, `scripts/`, and `assets/` must live under
the app root. `nwjs/window.html` loads `../build/entry_point.js` (i.e.
`<root>/build/...`). `nwjs/` itself just holds `window.html` + `launch.mjs`; it is
**not** a workspace package (the `nw` devDependency lives in the root
`package.json`).

The shell takes CLI args to boot the real app and build/save/dump deterministic
test scenes headlessly — the orchestration layer for the sculptcore native-addon
work. See
[documentation/native-electron-test-harness.md](documentation/native-electron-test-harness.md)
for the full flag reference. Key conventions:

- App args reach the renderer directly as `nw.App.argv` (no IPC / no base64
  token); `scripts/core/app_argv.ts` reads them. The browser build (no `nw`)
  sees an empty arg list, so the harness is inert there.
- `nwjs/launch.mjs` translates two ergonomic CLI flags before spawning:
  `--remote-debug[=PORT]` → the Chromium `--remote-debugging-port` +
  `--remote-allow-origins=*` switches (the CDP endpoint a direct client like
  `nwjs/cdp.mjs` connects to), and `--headless` → the app-only
  `--apptest-headless` (because `--headless` is
  a real Chromium switch NW.js would intercept). The `nwjs/window.html`
  bootstrap keeps the window hidden under `--apptest-headless` (the manifest
  starts it `show:false`) and opens devtools unless `--no-devtools`. All other
  flags are parsed in `scripts/core/test_harness.ts`: `--gen-scene <name>`,
  `--scene-arg k=v`, `--eval "<js>"`, `--run "tool.path(...)"`, `--save`,
  `--dump`, `--screenshot`, `--backend`, `--list-scenes`, `--exit`. None set →
  normal launch, unaffected. `--exit` quits via `nw.App.quit()`.
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
- `--remote-debug` exposes a standard CDP endpoint (NW.js SDK build, default port
  `9222`). Drive the live app over it with the dependency-free **`nwjs/cdp.mjs`**
  helper — `node nwjs/cdp.mjs list` / `eval "<js>"` / `shot <out.png>` — which
  fetches `http://127.0.0.1:9222/json/list`, opens the page's
  `webSocketDebuggerUrl`, and issues `Runtime.evaluate` (the eval runs in the
  renderer realm where `CTX` / `_appstate` / `__nativeManager` live). **Use direct
  CDP, not an MCP server**: a chrome-devtools MCP server binds its browser
  connection once, at Claude-Code startup, so it can only attach to a browser
  already running on the port at that moment — and any NW.js launched as a child
  of the agent dies when the agent exits, so it can never satisfy that ordering.
  `nwjs/cdp.mjs` connects on demand, in-session, to whatever is live.

## Debug context API (`CTX.debug`)

`ViewContext.debug` (`scripts/core/context.ts`, class `DebugEditorAPI`) is a
small reflection / test-automation surface on the app context. Reach it from any
renderer-JS eval context as **`CTX.debug`** (the `CTX` window global is
`_appstate.ctx`, defined in `entry_point.js`), or as `ctx.debug` in app code.

For the full map of window globals, `CTX`/`CTX.api`/`CTX.debug` surfaces, and
`window.DEBUG` toggles reachable over CDP (`nwjs/cdp.mjs eval` / a page
`evaluate`) when live-debugging the browser or NW.js build, see
[documentation/debugSurface.md](documentation/debugSurface.md).

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
- **Direct CDP (NW.js via `--remote-debug`)** — `node nwjs/cdp.mjs eval
  "return CTX.debug.showEditor({editorType:'MaterialEditor', minVisibleWidth:400})"`
  runs `CTX.debug.*` the same way over the endpoint, no MCP server needed.
- **Headless harness (`pnpm run nwjs` / `nwjs/launch.mjs` + `--run`/`--dump`)** — `--run` only
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
N-API** (NW.js; a C++ reflection runtime in `sculptcore/source/napi/` that
reads `litestl::binding` descriptors directly and dereferences real `void*`s).
See [documentation/native-napi-electron.md](documentation/native-napi-electron.md)
for the full model, and [documentation/plans/native-electron.md](documentation/plans/native-electron.md)
for status. Key conventions:

- Build the addon with `node sculptcore/make.mjs build node [--smoke]` (defaults
  to `--runtime nw`; reads the NW.js version from `nwjs/package.json`'s `nw` dep) →
  `build/native-node/sculptcore_node.node`. It's a CMake `MODULE` in the **root**
  `CMakeLists.txt` gated on `DEFINED CMAKE_JS_VERSION`; the configure step
  (`make.mjs configure node`, also run on demand by `build node`) uses cmake-js
  (NW.js headers + import lib via `-r nw`), clang builds it into
  `build/native-node/` (untouching `build/native`). Re-run after an NW.js bump to
  ABI-rebuild. `--smoke` loads the result in a hidden NW.js window via the shared
  `source/napi/napi_smoke.cjs` body.
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
- **No zero-copy bulk reads natively.** The V8 sandbox forbids external
  ArrayBuffers (`napi_no_external_buffers_allowed`), so `vectorView`/
  `pointerBytes` **copy** into a sandbox-internal buffer (read-only; one memcpy
  per buffer). **Never throw on the bulk-data seam** — return an empty
  `Uint8Array` for a not-yet-filled buffer (a throw is swallowed as a
  `drawObjects` warning and silently aborts the whole render pass).
- **Adding a new N-API method is a 4-place change** — a method exported in
  `source/napi/napi_runtime.{h,cc}` (`define(exports, ...)` in `installExports`)
  is invisible to the app until it's threaded through the TS layer: add it to the
  `NativeAddon` type (`typescript/api/nativeBackend.ts`), add a `NativeManager`
  method that calls `this.addon.<name>(...)`, and — easy to forget — **add the
  entry to `makeNativeInterface` in `typescript/api/nativeManager.ts`**, which is
  the object the app actually consumes as the `IWasmInterface`. Name the manager
  /interface entry to match the WASM `INeededWasm` member (`LSTL_*`, `Mesh_*`, …)
  so both backends are true drop-ins.
- Parity is guarded by `tests/integration/sculptcore_parity.test.ts` (under
  `pnpm test`): boots the app headlessly per backend, diffs GPU-buffer
  signatures + leaf counts; self-skips when the bundle or `.node` is absent.
  `sculptcore_brushes.test.ts` / `sculptcore_boundary.test.ts` reuse the boot
  path for behavior: scripted stroke drivers (`__brushTest()` /
  `__boundaryTest()`) run via `--eval` and assert per backend (brush semantics;
  boundary polyline-graph invariance under dyntopo + both undo stacks).

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

Run `npx tsgo --noEmit`, **not** `tsc`.

## Data API paths

See [documentation/datapath-bindings.md](documentation/datapath-bindings.md)
for the binding-system overview (how each class's `static defineAPI` declares
props, and how enum/flag icons attach via `.icons(...)`).

Valid `path` strings for `container.prop("...")` (and `slider`, `check`,
`checkenum`, `listenum`, `pathlabel`, `textbox`, plus `<prop path="...">`
xmlpage tags) are catalogued by walking `getDataAPI()`
(`scripts/data_api/api_define.ts`). Run `pnpm gen:paths` after editing
`api_define.ts` (or a class's `defineAPI`) to regenerate
`scripts/data_api/generated/`:

- `API_PATHS.md` — human/LLM reference (path, type, UI name, range, unit, enum)
- `api-paths.json` — machine-readable catalog
- `datapaths.ts` — `DataPathRegistry` augmentation that powers `KnownDataPath`
  autocomplete; it's committed and listed in `tsconfig.json`'s `files`

`pnpm typecheck` runs `gen:paths` first, so the catalog never goes stale during
type-checking (`pnpm build` does not — generation is type/lint-only). The
`pathux/valid-datapath` ESLint rule (warn) flags `prop(...)` strings not in the
catalog; dynamically-indexed paths (e.g. `flag[ENUMNAME]`) warn because the
walker can't enumerate them — those are expected and harmless.

**How `getDataAPI()` is built.** Each participating class exposes
`static defineAPI(api: DataAPI, struct?: DataStruct): DataStruct`. Subclasses
**chain** their parent (`super.defineAPI(api, struct)` re-declares the parent's
members onto the child's own struct) rather than copying an already-built parent
struct, so registry-class population is **order-independent** — no class needs
another to be defined first. `getDataAPI()`
(`scripts/data_api/api_define.ts`) runs in two passes: a **population pass**
(non-class pre-steps like sockets/matrix4/customdata → `registerCoreDataAPIClasses()`
→ a `defineOnce` loop over `dataAPIRegistry` → class-dependent helpers that
chain `DataBlock.defineAPI`), then an explicit **attach pass** that wires
the populated structs into the `ToolContext` tree. Register a new class with
`registerDataAPI(cls)` in any order. The only build-first requirement is for the
non-class pre-pass structs (`Graph`, `VelPan`) that a few `defineAPI`s fetch by
reference via `api.getStruct(...)`; the population pre-pass builds them ahead of
the registry loop. The on-disk catalog is **canonically sorted**
(lexicographic by normalized path in `tools/gen-datapaths.mjs`), so the committed
`generated/` files are stable regardless of population/traversal order.

## Feature flags

Runtime boolean knobs for opt-in / experimental features, persisted in
`localStorage` and wired into the Data API. See
[documentation/featureFlags.md](documentation/featureFlags.md) for usage,
how to add a flag, and persistence semantics.

## Cross-layer follow-ups

`TODO.md` (repo root) tracks non-addon consumers of addon files and
cross-addon `scripts/...` path imports that survive the addon-API
migration. Add to it when you discover another one.

## Submodules

- Keep submodules checked out at the HEADs of their current branches, pulling and
  merging as needed — **except** `sculptcore/extern/imgui`, which stays pinned at
  its recorded commit (third-party, version-locked). (`sculptcore/emsdk` is no
  longer a submodule — it is git-cloned and pinned by `make.mjs install-emsdk`
  and is gitignored.)
- The `master` branch must always link submodules at their default-branch commits
  (never pin `master`'s gitlinks to a submodule feature branch).
- **Commit a parent repo and its submodules together** whenever their branch names
  match, or both are on their default branches: make the submodule commit, then
  bump the parent's gitlink, as one logical change. The pinned exception
  (`sculptcore/extern/imgui`) is excluded — bump it deliberately, never as part
  of a co-commit.
- **Parent on a branch, submodule on its default branch:** do not silently commit
  or advance the submodule's shared default branch. Ask the user whether they want
  to commit and/or push the submodule's default branch (and bump the gitlink)
  before doing so.
- **Worktree teardown:** before removing a worktree, every submodule sitting on its
  default branch — except the pinned `sculptcore/extern/imgui` — must be committed
  and pushed, so no work is lost when the checkout goes away.

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
  re-sync submodules (`git submodule update --init --recursive`).
  (`checkout master` will fail — it's held by the main worktree; always use
  `--detach master`.)
- **Submodules populate only from their remotes** (no cross-worktree local-fetch
  of unpushed pinned commits — that recovery path was removed). So
  `git submodule update --init --recursive` requires every pinned submodule
  commit to be reachable from its remote; it fails on local-only commits with
  `Fetched in submodule path '<X>', but it did not contain <sha>`. Two fixes,
  mirroring `new-worktree.mjs`'s `--submodules` modes:
  - **require-pushed** — push the missing submodule commit(s) to their remote
    (`git -C <main-or-other-worktree>/<sub> push origin <branch>`), then re-run
    the recursive update so the worktree matches the recorded pins exactly.
  - **remote-master** — ignore the pins and branch each submodule from its remote
    master tip: `git submodule update --init --recursive --remote`, then
    `git submodule foreach --recursive 'git switch -c <branch>'`. Use this when
    submodule work is local-only/unpushed or you want to start from the latest
    remote.
