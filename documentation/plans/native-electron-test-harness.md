# Electron test harness & CLI (orchestration for the native-electron plan)

Supporting infrastructure for
[`native-electron.md`](native-electron.md): a command-line system for the
Electron shell that boots the **real** app, builds deterministic test scenes
(notably sculptcore-backed `LiteMesh` scenes), and saves / dumps / screenshots
them headlessly — so the native N-API backend and the WASM backend can be
driven through identical scenarios and diffed for parity (Workstream F).

## Why a procedural scene builder (not a saved `.wproj`)

`LiteMesh` serialization is not wired up yet — its `nstructjs` STRUCT is empty
and `loadSTRUCT`/`dataLink` are stubs (`scripts/lite-mesh/litemesh.ts`). So a
LiteMesh scene cannot round-trip through a `.wproj` today. Instead the harness
builds scenes **procedurally at startup**. The `LiteMesh` constructor builds a
deterministic sculptcore cube (`Mesh_createCube(120,1,1)`), so the same builder
produces byte-identical geometry under either backend — which is exactly what a
parity test needs. When LiteMesh serialization lands, `--save` will also produce
loadable project files; until then `--save` captures everything *except* the
LiteMesh geometry.

## Argument flow

Electron does not forward the user args of `electron main.js <args…>` into the
renderer's `process.argv`. `electron/main.js` now:

1. Captures `process.argv` (sliced for dev vs packaged) as `APP_ARGV`.
2. Re-injects them into the renderer as a base64 `--apptest-argv=<…>` token via
   `webPreferences.additionalArguments` (cross-platform, survives reload).
3. Parses the few **main-process-only** flags itself (they must act before the
   window exists).

`scripts/core/app_argv.ts` decodes the token in the renderer (falling back to
the legacy `arguments.txt` that `electron/run.sh` writes). The browser build
sees an empty arg list, so nothing here affects it.

## Flags

### Main-process flags (parsed in `electron/main.js`)

| Flag | Effect |
|---|---|
| `--remote-debug[=PORT]` | Enable the Chrome DevTools Protocol endpoint (default `9222`) + `--remote-allow-origins=*`. Drive it with the direct-CDP client `nwjs/cdp.mjs` (no MCP server). |
| `--headless` | Create the window with `show:false` (CI / batch generation). |
| `--no-devtools` | Don't auto-open DevTools. |

### Renderer test-harness flags (parsed in `scripts/core/test_harness.ts`)

| Flag | Effect |
|---|---|
| `--gen-scene <name>` | Build a registered test scene, replacing the default startup file via the **non-cached** path (`genDefaultFile(appstate, 1)` — skips the localStorage startup snapshot). |
| `--scene-arg k=v` | (repeatable) Parameters passed to the builder. |
| `--run "tool.path(...)"` | (repeatable) Run a `ToolOp` by data-API path. |
| `--save <out.wproj>` | Write a project file after building. |
| `--dump <out.json>` | Write a structured, backend-comparable scene snapshot. |
| `--screenshot <out.png>` | Capture the `#webgl` canvas (best-effort; prefer the CDP screenshot tool). |
| `--backend native\|wasm` | Record the requested sculptcore backend (`globalThis.__SCULPTCORE_BACKEND`). Only `wasm` is wired today. |
| `--list-scenes` | Print registered scene names. |
| `--exit` | Quit the app once the scenario completes (via the `apptest:quit` IPC). |

A normal launch (`electron main.js`) sets none of these and is unaffected.

## Scene-builder registry

`scripts/core/test_scenes.ts` holds a name→builder map, mirroring
`core/default_file.ts`'s single-builder hook. Builders register **downward**
into this core registry from whatever layer owns their dependencies, because
core must not import lite-mesh / sculptcore:

- `empty`, `default` — registered in `test_scenes.ts` (core-only deps).
- `litemesh-cube` — registered from
  `scripts/lite-mesh/litemesh_test_scene.ts` (pulled in as a side-effect import
  from `scripts/entry_point.js`). Args: `subdiv=<n>`, `light=0`.

To add a scene: `registerTestScene('my-scene', (ctx, lib, scene, args) => {…})`
from the appropriate layer.

## Examples

```bash
ELECTRON="node_modules/.pnpm/electron@41.1.1/node_modules/electron/dist/electron.exe"

# Build a LiteMesh cube, dump a snapshot, quit (CI-friendly):
$ELECTRON electron/main.js --gen-scene litemesh-cube --dump out.json --exit

# Higher-res cube, no light, save a project file:
$ELECTRON electron/main.js --gen-scene litemesh-cube --scene-arg subdiv=240 --scene-arg light=0 --save cube.wproj --exit

# Interactive + scriptable over CDP (drive with nwjs/cdp.mjs):
node nwjs/launch.mjs --gen-scene litemesh-cube --remote-debug
```

The harness publishes its outcome on `window.__apptestResult`, so an external
driver (`node nwjs/cdp.mjs eval "return window.__apptestResult"`) can read
structured results.

## Connecting to the live NW.js renderer over CDP

NW.js is Chromium, so `--remote-debug` exposes a standard CDP endpoint
(`GET http://127.0.0.1:9222/json/version` returns the build and a `page` target
for `window.html`). Drive it with the dependency-free **`nwjs/cdp.mjs`** client
(Node 22+, global `fetch` + `WebSocket`):

```bash
node nwjs/cdp.mjs list                                  # CDP targets
node nwjs/cdp.mjs eval "return _appstate.ctx.scene.objects.length"
node nwjs/cdp.mjs eval "return globalThis.__nativeManager.addon.version()"
node nwjs/cdp.mjs shot out.png                          # screenshot the page
```

It fetches `/json/list`, opens the page's `webSocketDebuggerUrl`, and issues
`Runtime.evaluate` in the renderer realm (where `CTX` / `_appstate` /
`__nativeManager` live).

**Why not a chrome-devtools MCP server:** an MCP server binds its browser
connection once, at Claude-Code startup, so it can only attach to a browser
already running on the port at that moment. Any NW.js launched as a child of the
agent dies when the agent exits, so it can never be up *before* the next
Claude-Code start — the ordering can't be satisfied. `nwjs/cdp.mjs` connects on
demand, in-session, to whatever is live on the port, with no restart dance.
