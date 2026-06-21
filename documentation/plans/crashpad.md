# Crashpad crash reporting for the NW.js app

## Context

When the native **sculptcore** N-API addon crashes (a C++ segfault / bad deref
during sculpt/dyntopo/remesh), the whole NW.js renderer process dies with no
trace. The renderer's stderr is already dead in NW.js (CLAUDE.md notes the EBADF
issue; logging is routed to the DevTools console via `sc_napi` sinks), so a hard
native crash leaves nothing actionable. We want **Crashpad minidumps** of those
crashes so we can symbolicate the C++ call stack offline.

Key facts established during investigation:

- NW.js `0.112.0-sdk`, Windows x64. The SDK ships **no standalone
  `crashpad_handler.exe`** — on Windows modern Chromium/NW.js *embeds* the
  handler in the main binary and spawns it as `nw.exe --type=crashpad-handler`.
  So Crashpad is present; it just needs enabling + a dump dir.
- App root = repo root; `main: nwjs/window.html`; the `.node` addon runs
  **in the renderer process** (NW.js merges Node+browser, no separate main
  process), so a renderer minidump captures the C++ frames.
- Native addon builds via cmake-js + the repo clang toolchain
  (`sculptcore/build_files/native-clang.cmake`), `CMAKE_BUILD_TYPE`
  default `RelWithDebInfo`. Output: `build/native-node/sculptcore_node.node`.
  **No PDB is emitted today** — symbolication will fail without one.

**Decisions (from user):** local-only minidumps (manual symbolication with
cdb/WinDbg); carry symbols via **clang + CodeView PDB** (stay on the clang
toolchain, do not switch to the MSVC path).

## Approach

Three layers, smallest-blast-radius first.

### 1. Enable Crashpad + pick a dump dir (NW.js)

In the `nwjs/window.html` bootstrap (the renderer entry, before
`import('../build/entry_point.js')`), call NW.js's crash-dump API early:

```js
if (globalThis.nw) {
  // dump dir under the repo build/ tree, stable + gitignored
  nw.App.setCrashDumpDir(/* <repo>/build/crashdumps */);
}
```

- Resolve the dir relative to the app root (repo root) using `nw.App.startPath`
  / `process.cwd()` + `require('path')`, and `fs.mkdirSync(dir,{recursive:true})`.
- Minidumps land as `*.dmp`. Add `build/crashdumps/` to `.gitignore`.
- **Verify the exact API name/signature at implementation time** against NW.js
  0.112 (`nw.App.setCrashDumpDir(dir)` and test triggers
  `nw.App.crashRenderer()` / `nw.App.crashBrowser()` are the documented surface;
  confirm before relying on them).

Critical file: `nwjs/window.html` (and `.gitignore`).

### 2. Make the native addon symbolizable (clang → CodeView PDB)

A minidump is useless without a matching PDB. Add CodeView debug-info emission +
a linked PDB to the **node-addon** build only (don't disturb `build/native`):

- Compile flags: `-g -gcodeview` (clang emits CodeView in the objects when
  targeting the MSVC ABI).
- Link flags: pass `/DEBUG` (and an explicit `/PDB:sculptcore_node.pdb`) through
  to the linker so a PDB is produced next to the `.node`.

Where to wire it: the node-addon target is gated on `DEFINED CMAKE_JS_VERSION`
in the **root `CMakeLists.txt`**, built with the clang toolchain
(`sculptcore/build_files/native-clang.cmake`) and configured by
`configureNodeAddon()` / `buildNodeAddon()` in `sculptcore/make.mjs`. Add the
flags scoped to that target (prefer a CMake `target_compile_options` /
`target_link_options` guarded by `CMAKE_JS_VERSION` + `WIN32`, so the WASM and
plain-native trees are untouched). Archive `sculptcore_node.pdb` alongside the
`.node` so dumps stay walkable after rebuilds.

Critical files: root `CMakeLists.txt` (node-addon target block);
possibly `sculptcore/make.mjs` (if flags are easier injected via cmake-js
`--CD...` args).

### 3. JS-layer crash net (non-fatal errors)

Crashpad only fires on hard process crashes. Add an early handler block (same
bootstrap, or `scripts/core/app_argv.ts` / entry init) for JS-level failures so
they share one stream with native logs:

- `window.onerror`, `window.addEventListener('unhandledrejection', …)`,
  and `process.on('uncaughtException', …)` (Node side is reachable in NW.js).
- Route through the existing `sc_napi` console sink path so JS + native logs
  interleave in DevTools.

### 4. (Optional, defer) C++ breadcrumb

Crashpad already installs the OS exception handler, so no custom handler is
required. A thin `std::set_terminate` / SEH breadcrumb in
`sculptcore/source/napi/napi_entry.cc` that logs "crashing in sculptcore" via
the console sink before Crashpad takes over is a nice-to-have — skip in v1.

## Verification (end-to-end)

1. Build the addon with the new flags: `node sculptcore/make.mjs build node`,
   confirm `build/native-node/sculptcore_node.pdb` exists.
2. Launch: `pnpm run nwjs` (native backend). Add a temporary harness flag
   `--crash-test` (parse in `scripts/core/test_harness.ts`) that calls
   `nw.App.crashRenderer()` after boot — confirm a `*.dmp` appears in
   `build/crashdumps/`.
3. Symbolicate: open the dump with `cdb.exe -z <dump>.dmp -y <path-to-pdb;nw-syms>`
   (Windows SDK Debuggers) and confirm sculptcore C++ frames resolve to function
   names + source lines. Provide a small wrapper
   `node sculptcore/crash/walk.mjs <dump>` that shells to `cdb` with the right
   `-y` symbol path.
4. Trigger a *real* native crash via a known-bad path (or temporarily inject a
   null-deref behind a flag) and confirm the stack points into the right
   sculptcore function.
5. Remove the temporary `--crash-test` / injected-crash scaffolding.

## Out of scope (this pass)

- Remote/server upload of crashes (chose local-only).
- breakpad `.sym` generation / cross-platform symbol server.
- MSVC-toolchain symbols (chose clang+CodeView).
