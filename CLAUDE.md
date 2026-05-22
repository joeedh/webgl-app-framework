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

## Typecheck

Run `npx tsgo --noEmit`, **not** `tsc`. The current main-tsconfig
baseline is 58 pre-existing errors concentrated in
`scripts/editors/view3d/tools/pbvh_sculptops.ts`,
`scripts/sculptcore_demo.ts`, and the sculptcore wasm bindings.

## Cross-layer follow-ups

`TODO.md` (repo root) tracks non-addon consumers of addon files and
cross-addon `scripts/...` path imports that survive the addon-API
migration. Add to it when you discover another one.
