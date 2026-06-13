# Debug surface (for live debugging via chrome-devtools / CDP)

This is a quick map of what an agent can reach from `evaluate_script` (the
chrome-devtools MCP eval bridge) when debugging the **browser build** or the
**Electron build** (`--remote-debug`/CDP). Everything below lives in the page
realm and is present once the app has booted (`appstate.init()` has run).

See also: the **Debug context API (`CTX.debug`)** and **Electron test harness**
sections of [../CLAUDE.md](../CLAUDE.md), and
[plans/native-electron-test-harness.md](plans/native-electron-test-harness.md)
for the headless `--eval`/`--run` flags.

## Entry globals (the roots)

| Global | What it is | Source |
|---|---|---|
| `CTX` | `_appstate.ctx` — the live `ViewContext`. Lazy getter on `window`. **Primary entry point.** | `entry_point.js:142` |
| `_appstate` | The `AppState` singleton. | `appstate.ts:1150` |
| `_framework` | `globalThis._framework` — the framework API hub addon bundles look up. | `entry_point.js:1` |
| `DEBUG` | `cconst.DEBUG` — path.ux debug-toggle flags (see below). | path.ux `config/const.ts:192` |
| `redraw_all()` | Schedules a `requestAnimationFrame` redraw. | `appstate.ts:1163` |
| `updateDataGraph(force?)` | Re-execs the dependency graph (`force=true` runs synchronously). | `appstate.ts:1207` |
| `haveElectron` | Truthy in the Electron shell. | — |
| `__SCULPTCORE_BACKEND` | `'native'`/`'wasm'` backend selector (set early). | `entry_point.js:82` |
| `__apptestResult` | Where the `--eval` harness records eval success/failure. | `test_harness.ts:451` |
| `FILE_LOADING` | True while a `.wproj` is loading. | `appstate.ts` |
| `FeatureFlags` | The `FeatureFlagManager` singleton — `get`/`set`/`reset` runtime feature flags (persisted; `set` saves immediately, so restore in probes). | `feature-flag.ts` |
| `_print_evt_debug` | Set true ~100ms after init; gates verbose event logging. | `entry_point.js:131` |

## `CTX.debug` — `DebugEditorAPI` (`scripts/core/context.ts:407`)

The purpose-built reflection / automation surface:

- `CTX.debug.listEditorTypes()` — every registered editor's `define()` metadata,
  with `flag` decoded to `AreaFlags` names and `icon` resolved to its `Icons` key.
  Use it to discover valid `editorType` values.
- `CTX.debug.getIconKey(icon)` — reverse-lookup an icon number → `Icons` name.
- `CTX.debug.showEditor({editorType, minVisibleWidth, minVisibleHeight?})` —
  ensure an editor of that type is open and at least that size, swapping a
  suitable on-screen area (already-visible → PropsEditor → any non-viewport →
  3D viewport) and making it active. `editorType` takes an areaname/apiname/
  tagname string, an Editor class, or an instance. Returns
  `{editor, action, swappedOutEditor?}`.
  - ⚠️ Needs a laid-out screen — fine in browser/Playwright and windowed
    Electron, but **can crash a bare headless boot**.

## `CTX` (ViewContext) — live state by getter

- State: `scene`, `object`, `mesh`, `material`, `light`, `tetmesh`,
  `strandset`/`strandset_object`, `selectedObjects`, `camera`, `activeTexture`,
  `toolmode`, `playing`, `modalFlag`.
- Plumbing: `api`, `toolstack`, `datalib`, `graph`, `screen`, `state`.
- Editors: `view3d`, `propsbar`, `menubar`, `resbrowser`, `debugEditor`,
  `shaderEditor`, `nodeViewer`, `editors` (named map), `editor`/`area` (active).

## `CTX.api` — data-path / ToolOp layer (path.ux `DataAPI`)

The most powerful surface for driving/inspecting the app headlessly:

- `CTX.api.execTool(CTX, "tool.path(args)")` — run any registered ToolOp
  (undoable). This is what `--run` and the harness use.
- `CTX.api.getValue(CTX, path)` / `CTX.api.setValue(CTX, path, val)` — read/write
  any catalogued data path (see `scripts/data_api/generated/API_PATHS.md`).
- `CTX.api.resolvePath(CTX, path)` — resolve a path string to struct/prop/object.
- `CTX.api.getToolDef(toolpath)` / `CTX.api.createTool(CTX, path, inputs)` —
  introspect a tool's inputs/outputs or build one without executing.

## `window.DEBUG` — path.ux runtime toggles (`config/const.ts:156`)

Flip live to enable diagnostic logging without a rebuild: `paranoidEvents`,
`screenborders`, `areaContextPushes`, `allBordersMovable`, `doOnce`,
`modalEvents`, `areaConstraintSolver`, `datapaths`, `lastToolPanel`, `domEvents`,
`domEventAddRemove`, `debugUIUpdatePerf`, `screenAreaPosSizeAccesses`,
`buttonEvents`. App-side code reads extra keys off the same object: `DEBUG.gl`,
`DEBUG.simplemesh`, `DEBUG.DataLink`, `DEBUG.THREE`.

## `_appstate` — direct singleton

`_appstate.ctx`, `.screen`, `.toolstack` (`.undo()`/`.redo()`/`.execTool()`),
`.datalib` (`.get(lib_id)`, `.graph`), `.api`, `.arguments`, `.draw()`,
`.createFile()`, `.modalFlag`.

## Caveats / gaps

- **No GPU id-buffer / pick-buffer debug API** — picking is geometric and
  addon-owned (the old `GPUSelectBuffer`/`FindnearestClass` are gone), so there's
  no GPU-readback hook to inspect.
- **Headless boot is the fragile path**: `--eval` reaches `CTX`/`_appstate`, but
  anything needing a laid-out screen (`showEditor`, most editor accessors) can
  crash a windowless boot. Use browser/Playwright or windowed-Electron CDP for
  those; in bare headless prefer reflection or explicit-`graphPath` ops.
- **`evaluate_script` serializes return values** (structure-clone), so returning
  a live `CTX.mesh` gives a flattened view — return primitives / hand-picked
  fields (counts, ids, bbox), not whole live objects.
- **Never throw on the bulk-data seam natively** — a throw there is swallowed as a
  `drawObjects` warning and silently aborts the render pass; don't probe a
  not-yet-filled buffer in a way that throws.
