Read the contents of AGENTS.md.

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
  `--run "tool.path(...)"`, `--save`, `--dump`, `--screenshot`, `--backend`,
  `--list-scenes`, `--exit`. None set → normal launch, unaffected.
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

## Typecheck

Run `npx tsgo --noEmit`, **not** `tsc`. The current main-tsconfig
baseline is 58 pre-existing errors concentrated in
`scripts/editors/view3d/tools/pbvh_sculptops.ts`,
`scripts/sculptcore_demo.ts`, and the sculptcore wasm bindings.

## Data API paths

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
