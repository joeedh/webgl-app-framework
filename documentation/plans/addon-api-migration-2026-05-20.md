# Builtin addons → AddonAPI registration + `@framework/api` imports

Completed 2026-05-20 on branch `sculptcore`. Follow-up to the
[toolmodes-addons-refactor](toolmodes-addons-refactor.md) plan (its §3 and §6.7
leave two structural problems unaddressed; this plan closes them).

## Context

Two structural problems remained after the toolmodes-addons refactor:

1. **Registration was scattered.** Each addon source file registered its
   classes at module scope as a side effect — e.g.
   `ToolMode.register(MyTool)`, `nstructjs.register(MyClass)`,
   `DataBlock.register(MyBlock)`, `CustomDataElem.register(MyLayer)`. Across
   the seven builtin addons there were ~140 such calls. They could not be
   cleanly undone, did not run in dependency order, and bypassed the
   `AddonAPI.register(cls)` dispatcher that already exists at
   `scripts/addon/addon_base.ts:290-362` and tracks classes per addon for
   `unregisterAll()`.

2. **Addons reached into `scripts/` by relative path.** Every addon source
   file in `addons/builtin/` walked `../../../../scripts/...` to pull in
   framework primitives — `Vector3` (31×), `nstructjs` (~40×), `ToolOp`
   (~20×), `DataBlock` (~13×), `Context` (~14×), `SelMask` (~16×),
   `simplemesh` / `webgl`, pathux UI widgets, etc. This coupled addons to
   the core layout and defeated the `@addon/<id>/api` decoupling that
   addons already used for peer-addon imports.

The fix was two coordinated moves:

- **Migrate `.register()` side effects into each addon's `register(api)`
  lifecycle hook**, dispatching through `api.register(cls)`. Keep
  `nstructjs.inlineRegister(...)` at class scope where it appears, since it
  runs as a static-field initializer and can't be deferred.
- **Introduce a `@framework/api` esbuild alias** that re-exports the
  framework primitives addons need, and rewrite addon imports to use it
  instead of `../../../../scripts/...`.

## What landed

### AddonAPI ergonomics
- `scripts/addon/addon_base.ts` — added `registerAll(...classes)` next to
  `register(cls)`.
- `scripts/addon/addon.ts` — `registerInternalAddon({manifest, exports,
  register?})` now accepts a `register(api)` callback so internal (in-
  bundle) addons share the same lifecycle as external addons.
  `exportNamespace(...)` is the sole writer of `api.exports` (no longer
  set in one shot).

### `@framework/api` alias
- `scripts/framework_api.ts` (new) — single re-export hub. pathux is
  re-exported wholesale (`export * from './path.ux/scripts/pathux.js'`);
  everything else (Vector*, ToolOp, DataBlock, ToolMode, SelMask, Icons,
  Shaders, simplemesh, webgl, …) is enumerated by name.
- `tools/esbuilder.js` and `tools/build-addons.js` resolve
  `@framework/api` → `scripts/framework_api.ts` via esbuild's `alias`
  option.
- `tsconfig.json` `paths` mirrors the alias for tsgo / IDE resolution.

### Per-addon migration
Each addon was migrated in turn:

| Addon | Result |
|---|---|
| `subsurf` | No `.register()` calls (pure function lib). Imports already on `@framework/api`. |
| `tetmesh` | 2 calls → `register(api)`; framework imports rewritten. |
| `mesh_edit` | 3 calls → `register(api)`; framework imports rewritten. |
| `curve` | 7 calls → `register(api)`; framework imports rewritten. |
| `mesh` | 126 calls collected into auto-generated `register_classes.ts`; `register(api)` calls `api.registerAll(...ALL_MESH_REGISTRATIONS)`. |
| `pbvh_sculpt` | api.ts shim + main.ts; framework imports rewritten. |
| `sculptcore` | api.ts shim + main.ts; framework imports rewritten. |

### Tooling (one-shot, kept in `tools/` for reference)
- `tools/rewrite-addon-imports.js` — rewrote 324
  `from '../../../../scripts/...'` → `from '@framework/api'` across 75
  files.
- `tools/fix-framework-imports.js` — converted 48 default/namespace
  imports to named imports (the alias hub uses named exports only).
- `tools/migrate-mesh-registers.js` — strips module-scope `.register()`
  calls from the mesh addon and regenerates
  `addons/builtin/mesh/src/register_classes.ts`.

## Documentation
- `documentation/addons.md` (new) — author's guide for the addon pattern
  (manifest, `register(api)`, `@framework/api`, `@addon/<id>/api`).
- `documentation/index.md` — link added under *Model*.
- `CLAUDE.md` / `AGENTS.md` — added addon-conventions section.

## Verification

After the migration:

- `pnpm build`: green (main bundle + 7 per-addon outputs).
- `npx tsgo --noEmit`: 58 errors (matches the pre-existing baseline —
  every one of them is in `pbvh_sculptops.ts`, `sculptcore_demo.ts`, or
  the sculptcore wasm bindings, untouched by this work).
- `pnpm --filter @webgl-app-framework/tests test`: 83/84 (the lone failure
  is a pre-existing `install_flow` esbuild-wasm fixture VFS issue,
  unchanged).
- `depcruise scripts addons`: 0 errors, 319 warnings (no regression).
- Grep `addons/builtin -E "from ['\"]\\.\\./\\.\\./\\.\\./\\.\\./scripts/"`
  → 4 matches, all logged in `TODO.md` as cross-addon refs that need a
  deeper restructure (mesh→pbvh_sculpt `instanceof BVHToolMode` check,
  plus the announcement shims in `pbvh_sculpt/src/api.ts` and
  `sculptcore/src/api.ts` for classes still living in
  `scripts/editors/view3d/tools/`).
- Grep `addons/builtin -E "\\b(ToolMode|ToolOp|DataBlock|CustomDataElem|SceneObjectData|Editor)\\.register\\("` outside docstrings → 0 matches.

## Follow-ups (out of scope here, tracked in `TODO.md`)

- Eliminate the `mesh_ops.ts:948` `instanceof BVHToolMode` check (mesh →
  pbvh_sculpt cross-addon ref) via a behavior interface on `ToolMode` or a
  shared-context predicate.
- Physically move `BVHToolMode` / `PaintToolModeBase` / `SculptCorePaintMode`
  out of `scripts/editors/view3d/tools/` into their respective addons'
  `src/`, then drop the announcement shims.
- Promote the depcruise `core-no-addons` warn → error once the remaining
  cross-layer paths are cleaned up.
