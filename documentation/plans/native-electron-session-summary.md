# Session summary — native-electron plan (sculptcore N-API)

> Portable handoff for a fresh Claude Code session. The previous session
> (`af833f29-…`) became unrecoverably corrupted by a repeating Anthropic API
> 400 error: *"`thinking`/`redacted_thinking` blocks in the latest assistant
> message cannot be modified."* Root cause was the harness stamping a long
> multi-turn tool-use run with a single `message.id`, accumulating many
> interleaved thinking blocks that the API then rejected on every resume.
> Stripping thinking blocks + a no-PowerShell guardrail did **not** hold, so
> this summary is the durable path forward. **Start a brand-new session and
> paste/load this file.**

## Goal

Execute `documentation/plans/native-electron.md`: run **sculptcore** (C++20
mesh/sculpt engine) as a **native N-API Node addon inside Electron**, alongside
the existing WASM path for browsers. Use raw C N-API (`node_api.h`) — the
`node-addon-api` C++ wrapper was dropped (see "Key findings").

## Status by workstream

- **Test harness / CLI — DONE.** Electron CLI args boot the real app and
  build/save/dump deterministic test scenes headlessly. Documented in
  `CLAUDE.md` ("Electron test harness / CLI") and
  `documentation/plans/native-electron-test-harness.md`.
- **Spike A.5 — DONE (PASSED).** clang-on-Windows (MSVC ABI) links against
  Electron's `node.lib`; native addon builds + loads in Electron.
- **Workstream A — DONE (verified).** `node make.mjs build node --smoke` builds
  `build/native-node/sculptcore_node.node` (~1.5 MB, links full engine via
  `sculptcore_core` + module libs, gated on `DEFINED CMAKE_JS_VERSION`), loads
  in Electron 41.1.1, reports `{"version":"…Workstream A","bindingCount":103,"ok":true}`.
  `build/native-node` is gitignored.
- **Workstream B — IN PROGRESS (uncommitted, on disk).** The C++ N-API
  reflection runtime. Files already exist in the working tree:
  - `sculptcore/source/napi/napi_runtime.cc` (~896 lines / 33 KB)
  - `sculptcore/source/napi/napi_runtime.h` (~5 KB)
  - `sculptcore/source/napi/napi_entry.cc` (36 lines — raw C entry, `NAPI_MODULE`)
  - `sculptcore/source/napi/electron_smoke.cjs` (`.cjs` because
    `sculptcore/package.json` is `"type":"module"`)
  - **Note:** `sculptcore/source/napi/` is currently **untracked in git** — all
    Workstream B work is uncommitted.
- **Workstreams C/D/E/F — not started** (C = TS backend selection; partial
  scaffolding exists: `sculptcore/typescript/api/nativeBackend.ts` and
  `nativeManager.ts` are present/untracked. D = pointer audit; E = Electron
  upgrade 41→42; F = parity tests).

## The active task when the session died — RESOLVED (2026-05-28)

**Array-element accessor "garbage first element" bug — FIXED.** The file was
found mid-refactor: `napi_runtime.h` already declared the class-instance design
(`arrayClassRefs_`, `getArrayClass`, `arrayCtorCb`, `finalizeArrayInst`) but
`napi_runtime.cc` still had the old plain-object `arrayWrapper` and referenced
two symbols that existed nowhere (`ArrayElemCtx`, `arrayCache_`) — so it would
not have compiled. Completing the class-instance fix:
- `arrayWrapper` now `napi_new_instance`s a cached `napi_define_class` class
  (one per element-descriptor+length), index accessors + `length` on the
  prototype. Per-instance base ptr in the `napi_wrap`'d `ArrayInstData`;
  `arrayGetter`/`arraySetter` unwrap `this` for `base` and index straight into
  C++ memory. `arrayCache_`/`ArrayElemCtx` removed.
- Verified: `node make.mjs build node --smoke` → `float2.vec` round-trips `[1.5,3.0]`
  with `firstElementOk` + `allOk` true.
- `documentation/plans/native-electron.md` "Known bug" section rewritten to
  "Fixed". The smoke test (`source/napi/electron_smoke.cjs`) was also rewritten
  — it was still calling a dead handle-table API (`listStructs`/`getMember`/
  `setMember`/`destroy`/`liveCount`); it now uses the live wrapped-object surface
  (`structNames`/`structInfo`/`construct` + property access).

**Next:** Workstreams C/D/E/F (see Status). C = TS backend selection (scaffolding
in `sculptcore/typescript/api/{nativeBackend,nativeManager}.ts`); D = pointer
audit; E = Electron 41→42 upgrade; F = parity tests. Workstream B is still
**untracked in git** — consider committing it.

## Key reusable findings (do not re-discover)

- **`/DELAYLOAD:NODE.EXE` clang link failure** — clang++'s gcc-style driver
  reads the bare link.exe flag as a filename. Fix (already applied in
  `sculptcore/CMakeLists.txt` and the spike):
  ```cmake
  string(REPLACE "/DELAYLOAD:NODE.EXE" "" CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS}")
  target_link_options(<tgt> PRIVATE "LINKER:/DELAYLOAD:node.exe")
  target_link_libraries(<tgt> delayimp.lib)   # WIN32 only
  ```
- **`node-addon-api` is unusable under clang here** — `CallbackInfo::Length()`
  returns garbage (`add(2,40)` → `4e-312`) at both `-O3` and `-O0` (not an
  optimization bug). Raw `napi_get_value_double` works fine. → use raw C
  `node_api.h`. This is **why** the array-wrapper bug needs care: trust raw
  N-API calls, suspect any C++-wrapper-style indirection.
- **Renderer can't use `Buffer`/`@types/node`** — `app_argv.ts` /
  `test_harness.ts` use `atob` + `TextDecoder` + `Uint8Array` instead.
- **Electron drops user `process.argv` into the renderer** — `electron/main.js`
  forwards them as a base64 `--apptest-argv=` token via
  `webPreferences.additionalArguments`; `scripts/core/app_argv.ts` decodes.
- **`.cjs` not `.js`** for CommonJS scripts under `sculptcore/` (package is
  `"type":"module"`).

## Build / run quick reference

- Native addon: `cd sculptcore && node make.mjs build node [--smoke]` →
  `build/native-node/sculptcore_node.node`. Build goes through
  `node configureEnv.mjs` (MSVC vcvars), cmake-js configure with
  `-G Ninja --CDCMAKE_TOOLCHAIN_FILE=…native-clang.cmake -r electron -v <ver> -a x64`,
  then `cmake --build build/native-node --target sculptcore_node`.
- Typecheck (framework): `npx tsgo --noEmit` (NOT `tsc`).
- Native LIB set: `util math mesh spatial brush props gpu binding binding_generators`.

## Files created/edited this effort (working tree, mostly uncommitted)

Harness: `scripts/core/test_scenes.ts`, `scripts/core/app_argv.ts`,
`scripts/core/test_harness.ts`, `scripts/lite-mesh/litemesh_test_scene.ts`,
`scripts/entry_point.js` (edited), `electron/main.js` (edited), `.mcp.json`,
`CLAUDE.md` (edited), `documentation/plans/native-electron-test-harness.md`.

Native: `sculptcore/source/napi/{napi_entry.cc,napi_runtime.cc,napi_runtime.h,electron_smoke.cjs}`,
`sculptcore/CMakeLists.txt` (edited — `sculptcore_node` MODULE target under
`if (DEFINED CMAKE_JS_VERSION)`), `sculptcore/make.mjs` (edited — `node`
command, `buildNodeAddon`, `readElectronVersion`, `resolveElectronExe`),
`sculptcore/package.json` (edited — `cmake-js ^8.0.0`), `sculptcore/CLAUDE.md`
(edited), `sculptcore/spike/napi/*` (gitignored scratch),
`sculptcore/typescript/api/{nativeBackend.ts,nativeManager.ts}` (Workstream C scaffolding).

Plan doc: `documentation/plans/native-electron.md` (Spike A.5 ✅, Workstream A ✅).

## Suggested first move in the new session

The array-element bug is fixed (see above). Next is committing Workstream B
(still untracked) and starting Workstream C (TS backend selection) — the
scaffolding is in `sculptcore/typescript/api/{nativeBackend,nativeManager}.ts`.
The full (now-corrupted) transcript, if any detail is needed, is at
`C:\Users\joeed\.claude\projects\C--dev-webgl-app-framework\af833f29-52a8-44bf-91a8-be87e77da494.jsonl.bak`.
