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
| `--remote-debug[=PORT]` | Enable the Chrome DevTools Protocol endpoint (default `9222`) + `--remote-allow-origins=*`. For the chrome-devtools-mcp plugin. |
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

# Interactive + scriptable over CDP for the chrome-devtools plugin:
$ELECTRON electron/main.js --gen-scene litemesh-cube --remote-debug
```

The harness publishes its outcome on `window.__apptestResult`, so an external
driver (or `chrome-devtools-mcp`'s `evaluate_script`) can read structured
results.

## Connecting chrome-devtools-mcp to the live Electron renderer

Electron is Chromium, so `--remote-debug` exposes a standard CDP endpoint
(verified: `GET http://127.0.0.1:9222/json/version` returns the Electron build
and a `page` target for `window.html`, plus the sculptcore wasm workers). The
chrome-devtools-mcp plugin connects to a running browser with
`--browserUrl`/`-u`.

The plugin's bundled config (`…/chrome-devtools-mcp/<ver>/.mcp.json`) launches
its **own** Chrome with no `--browserUrl`, so it can't see Electron. To point a
chrome-devtools-mcp server at Electron, add a project-level `.mcp.json` (repo
root) defining a separate `chrome-devtools-electron` server — this is a
deliberate opt-in because it registers a new MCP server in your Claude Code
config:

```json
{
  "mcpServers": {
    "chrome-devtools-electron": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]
    }
  }
}
```

Workflow:

1. Launch Electron with `--remote-debug` (port `9222`).
2. **Restart Claude Code** once so it picks up the new MCP server (MCP servers
   bind at startup). Its tools then appear as `mcp__chrome-devtools-electron__*`.
3. The server connects to Electron lazily on the first tool call, so the order
   of (1) and the first tool use doesn't matter, but Electron must be up by then.

The connection itself is proven independently of the restart: a raw CDP
`Runtime.evaluate` against the endpoint reads `window.__apptestResult` and
`_appstate` from the live renderer.
