# Integrate sculptcore as native N-API bindings (dual with WASM) + Electron upgrade

## Context

`sculptcore` (the C++20 mesh/sculpt engine) is currently consumed only as
WebAssembly. The TypeScript runtime in
`sculptcore/source/litestl/binding/typescriptRuntime/` bridges JS→C++ by
treating WASM linear memory as flat typed arrays and indexing them with
`HEAP32[ptr >> PTRSHIFT]`. That model is intrinsically 32-bit: pointers are
JS `number`s, the shift truncates to 32 bits, and `HEAPPTR` is a
`Uint32Array`. It also re-implements C++ reflection on the JS side because
WASM exposes nothing but flat memory plus a few `LSTL_*` C functions.

We want sculptcore to run in the **Electron** app as a **native C++ Node
addon** for performance and 64-bit correctness, while **keeping the WASM
path for the browser**. The chosen architecture is *not* to make the
existing TS runtime 64-bit/bigint-clean. Instead we add a **second runtime
backend implemented in C++ via N-API** that reuses the existing
`litestl::binding` descriptors directly. Because the engine returns live
wrapper objects to the renderer's per-frame loop, the addon must be
`require`d in the renderer (so Electron stays `nodeIntegration:true` /
`contextIsolation:false`). We also upgrade Electron from `^41.1.1` to the
latest (`^42.2.0`).

Key consequence: **real `void*` pointers never cross into JS as numbers** in
the native backend — C++ does every dereference — so the "audit pointers for
bigint" task largely dissolves and is replaced by a smaller task of
de-numbering the few JS sites that today assume `.ptr` is a `number`.

### Locked decisions
- **Dual runtime**: native (Electron) + WASM (browser), behind one JS API.
- **Memory model**: C++ N-API reflection runtime reusing `litestl::binding`
  descriptors. No flat-heap/bigint emulation in JS for the native path.
- **Electron**: keep `nodeIntegration:true`/`contextIsolation:false`; bump to
  `^42.2.0`; ABI-rebuild the addon; fix any 41→42 API breaks.
- **Tooling**: `cmake-js` + `node-addon-api`, as a new target in the existing
  native CMake tree.
- **Parity tests** required between native and WASM backends.
- **Deferred**: `litestl::util::Vector` Array-method completeness
  (map/filter/…) and its allocation semantics (shallow JS clone vs
  move/copy Vector) — stub minimally now, design later.

---

## Architecture overview

```
generated TS interfaces (sculptcore/typescript/**, type-only)   ← unchanged shape
                       │ implemented by ↓
        ┌──────────────────────────────┐
        │  Runtime backend selector     │  (sculptcore/typescript/api/wasm.ts)
        └───────────────┬───────────────┘
          native?       │        else
   ┌──────────────┐     │   ┌─────────────────────────┐
   │ N-API runtime│◄────┘   │ existing WASM TS runtime │ (typescriptRuntime/*, 32-bit, unchanged)
   │ (new, C++)   │         └─────────────────────────┘
   └──────┬───────┘
          │ direct descriptor access (no heap serialization)
   ┌──────▼──────────────────────────┐
   │ litestl::binding BindingManager  │  getBindingManager() — already in C++
   └──────────────────────────────────┘
```

The generated files in `sculptcore/typescript/` are already `export
interface` declarations (type-only), so both backends satisfy the same
types. Only the *backing implementation* forks.

---

## Workstream A — Native addon build (`cmake-js` + `node-addon-api`)

The native CMake tree already exists and builds `libsculptcore` as `SHARED`
(`sculptcore/CMakeLists.txt:127`), driven by `make.mjs native` with the
clang toolchain `build_files/native-clang.cmake`, into `build/native`.

1. Add `node-addon-api` (and `cmake-js`) as dev deps (likely in
   `sculptcore/` and/or root). Vendor headers via `cmake-js`'s include path.
2. Add a new CMake target in `sculptcore/CMakeLists.txt` under the
   `if (NOT BUILD_WASM)` branch: `add_library(sculptcore_node MODULE
   <napi sources>)` linking the same per-module libs already listed there
   (`util math mesh spatial brush props gpu binding binding_generators`) plus
   the N-API source from Workstream B. Set `SUFFIX .node`, PIC is already on
   (`CMakeLists.txt:47`).
3. Wire `cmake-js` Node/Electron header + import-lib variables (CMAKE_JS_INC,
   CMAKE_JS_LIB) into that target only.
4. Extend `make.mjs` with a `node` target (or `--node` flag on the existing
   `native` configure) that invokes `cmake-js`-style configure/build through
   the existing `runBuild` pipeline, targeting `--runtime electron
   --runtime-version <electron's node>`. Mirror the existing `buildDir`/
   `envPrefix` helpers (`make.mjs:199-208`). Output `.node` into a stable
   path the loader can find.
5. Confirm early that the Windows **clang** toolchain links against
   Electron's MSVC-built `node.lib` — N-API's C ABI normally makes this fine,
   but validate with a trivial "hello" addon before building the full
   runtime. **(First milestone / spike.)**

## Workstream B — C++ N-API reflection runtime (the core)

A faithful port of the TS runtime logic, but reading descriptors directly
instead of out of a serialized heap. New C++ sources, e.g. under
`sculptcore/source/litestl/binding/napiRuntime/` (mirror of
`typescriptRuntime/`). For each TS runtime concern:

| TS runtime (today) | New C++ N-API equivalent |
|---|---|
| `manager.ts` `BindingManager`, `get(name)` | wrap the existing C++ `BindingManager` from `getBindingManager()`; name→`StructType*` lookup is already in C++ |
| `bind.ts` `createBoundType` (eval'd class, heap getters) | build one `Napi::Function` (class) per `StructType` at load by walking members/methods; `InstanceAccessor` per member, `InstanceMethod` per method; store `StructType*` in function data |
| wrapper instance holding `ptr:number` | `Napi::ObjectWrap` holding real `void*` + `StructType*` (pointer never exposed to JS) |
| `manager.ts` `getBoundPointer` (+ recursion/null check) | C++ fn: `(StructType*, void*) → cached Napi object`; cache `Map<void*, Napi::Reference>`; null → `undefined` |
| member getter/setter `HEAP32[(ptr+off)>>shift]` | read/write at `ptr + member.offset` switching on `member.type` (Number subtypes → number; Int64 → BigInt; bool; Pointer/Reference → recurse; embedded Struct → non-owning wrap; cstring → `napi_create_string_utf8`) |
| `manager.ts` `invokeMethod` + `LSTL_Method_Invoke` | marshal Napi args → C++ arg list, call the method thunk directly (same mechanism `LSTL_Method_Invoke` uses), marshal the return; reuse the existing thunks in `binding_struct.h`/`MethodType` |
| constructor + `[Symbol.dispose]` destructor | invoke registered constructor thunk; attach `napi` finalizer that calls `destructorThunk` for owned objects |
| `string.ts` | direct C++ read of litestl string → napi string |
| `boundVector.ts`/`vector.ts` | minimal: `length`, indexed get/set, iterator over `Vector<T>`. **Defer** map/filter/etc and allocation semantics (stub or throw with a clear "not yet implemented"). |

Notes:
- The descriptor **offset table** (`LSTL_GetBindingInfo` /
  `createWasmHelpers`) is **not needed** natively — C++ reads `member.offset`
  etc. straight from the descriptor objects.
- **Bulk-data fast path (hot loops):** per-property napi getters are too slow
  for per-frame vertex/attribute iteration. Where the WASM path hands JS a
  raw data pointer for bulk access (notably `gpuExecutor.ts:142-143`'s
  `buf.data`), the native path must expose the underlying contiguous C++
  buffer as an **external `ArrayBuffer`** (`napi_create_external_arraybuffer`)
  + typed-array view, so the renderer reads coordinates without a napi call
  per element. Inventory these bulk-access sites during implementation.

## Workstream C — TS backend selection + de-numbering the boundary

1. In `sculptcore/typescript/api/wasm.ts` `loadWasm()` (`:54`), branch the
   existing `insideNode` check further: when running under Electron with the
   addon present, `require` the `.node` and construct a manager object
   shaped like the WASM `BindingManager` (same `construct` / `getBoundPointer`
   / `getBoundVector` surface) instead of instantiating the WASM module.
   Keep the WASM branch exactly as-is for the browser.
2. Make the top-level helper functions backend-agnostic. Today they extract a
   numeric `ptr` and re-wrap it:
   - `wasm.ts:77-89` (`Mesh_createCube`, `Mesh_buildSpatialTree`,
     `SpatialTree_free`) — `ptr as unknown as number`. Native versions pass
     wrapper objects directly; no numeric ptr.
   - `scripts/editors/view3d/tools/sculptcore_ops.ts:183` —
     `getBoundVector(name, nodes.ptr)`. Change `getBoundVector` to accept a
     **wrapper object** (or make `.ptr` an opaque backend-specific handle),
     not a raw number.
   - `sculptcore/typescript/api/gpuExecutor.ts:142-143` — `buf.ptr` /
     `buf.data`. Route through the external-ArrayBuffer fast path (Workstream
     B) for the native backend.
3. Define a small TS type for the opaque pointer handle so neither backend
   leaks the representation (WASM: `number`; native: the wrapper/external).

## Workstream D — 64-bit pointer audit (reduced scope)

Because native pointers stay in C++, this is **not** a bigint conversion of
`typescriptRuntime/`. The WASM runtime is wasm32 and stays 32-bit/number —
**leave `typescriptRuntime/*` unchanged**. The audit deliverable is:
- Enumerate every JS/TS site that treats `.ptr` (or a value returned from the
  runtime) as a `number` and assert it goes through the backend-agnostic
  handle/wrapper instead. Known sites: `wasm.ts:78,82-83,87`,
  `sculptcore_ops.ts:183`, `gpuExecutor.ts:142-143`. Sweep `scripts/**` and
  `sculptcore/typescript/api/**` for any others (grep `.ptr`, `>> wasm.`,
  `HEAPPTR`, `as unknown as number`).
- Document in `TODO.md` (repo root, per CLAUDE.md cross-layer convention) any
  consumer that can't yet be made backend-agnostic.

## Workstream E — Electron upgrade (`^41.1.1` → `^42.2.0`)

1. Bump `electron/package.json:5` to `^42.2.0`; `pnpm i`.
2. Keep `webPreferences` as-is in `electron/main.js:147-155`
   (`nodeIntegration:true`, `contextIsolation:false`) — required so the
   renderer can `require` the addon and share live objects.
3. Rebuild the addon against Electron's ABI: drive `cmake-js --runtime
   electron --runtime-version <ver>` (Workstream A), or `@electron/rebuild`.
   `node-addon-api` (N-API) gives ABI stability so this rarely needs
   repeating across future Electron bumps.
4. Audit the 8 existing IPC handlers in `electron/main.js` (menu/dialog/theme:
   `addon-storage:get-user-data`, `nativeTheme*`, `popup-menu`, `close-menu`,
   `set-menu-bar`, `show-open-dialog`, `show-save-dialog`) for 41→42 breaking
   changes; likewise the renderer side in
   `scripts/path.ux/scripts/platforms/electron/electron_api.ts` and
   `scripts/addon/storage_electron.ts`. These are the only IPC; expect small
   or no changes.
5. Smoke-test launch + menus + open/save dialogs after the bump.

## Workstream F — Native↔WASM parity tests

Goal: prove the two backends present identical behavior through the shared JS
API. Reuse the repo's existing tolerant-diff pattern (`make.mjs`'s `diffDump`
/ golden approach, `:295-326`).

1. A backend-parametrized test harness (Jest, matching root `pnpm test` /
   `turbo test`) that loads sculptcore once per backend and runs the same
   script: construct a `Mesh` (`Mesh_createCube`), read members/attributes,
   build a `SpatialTree`, invoke representative methods, exercise a bound
   `Vector`'s implemented surface (length/index/iterate), and free.
2. Capture a structured dump from each backend (geometry + topology +
   scalar fields) and assert native ≡ WASM via a tolerant numeric diff
   (reuse `VERIFY_ATOL`/`VERIFY_RTOL` style).
3. Cover the boundary helpers changed in Workstream C and the bulk-data
   external-ArrayBuffer fast path (verify the native typed-array view yields
   the same bytes as the WASM heap view).
4. Wire into CI alongside the existing native ctest and WASM harness.

## Deferred (explicitly out of scope now)
- `litestl::util::Vector` full `Array` method surface (map/filter/reduce/…)
  on both backends.
- Vector allocation/ownership semantics (shallow JS array clone vs new
  Vector with move/copy). Stub the unimplemented methods so they fail loudly.

---

## Suggested sequencing
1. **Spike** (A.5): trivial Electron N-API addon built via cmake-js with the
   clang toolchain — de-risk the link/ABI question first.
2. Addon build target wired into `make.mjs` (A).
3. C++ N-API runtime: structs/members/methods/getBoundPointer (B core).
4. TS backend selection + de-numbered boundary (C), minimal Vector (B).
5. Bulk-data external-ArrayBuffer fast path (B) + gpuExecutor (C.2).
6. Electron bump + IPC audit (E).
7. Parity tests (F); pointer-audit sweep + TODO.md entries (D).

## Verification
- `node sculptcore/make.mjs build native` and the new `node` target build the
  `.node` cleanly under Electron's runtime.
- `pnpm test` / `turbo test`: parity suite passes (native ≡ WASM).
- `node sculptcore/make.mjs test` (native ctest) still green.
- WASM browser build unchanged: `node sculptcore/make.mjs build wasm` +
  `node tools/serv.js` renders as before.
- Electron app launches (`electron/`), sculpts a cube end-to-end via the
  native addon, menus/dialogs work; then confirm the browser build still
  works via WASM — same scene, same result.
- `npx tsgo --noEmit` stays at/under the documented 58-error baseline.

## Risks / things to validate early
- **Clang↔Electron `node.lib` link** on Windows (spike A.5) — primary risk.
- **Hot-loop performance**: confirm all per-frame bulk reads use the
  external-ArrayBuffer fast path, not per-property napi getters.
- **Object lifetime**: napi finalizers vs litestl's leak-tracking allocator —
  ensure owned-object destruction matches the WASM `[Symbol.dispose]` path and
  doesn't trip the leak tracker.
- **Two runtimes, one API**: parity suite (F) is the guardrail against drift.
