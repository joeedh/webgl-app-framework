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
  native CMake tree. **Spike update (see Workstream A):** keep `cmake-js`, but
  the spike found node-addon-api's C++ `CallbackInfo` miscompiles under the
  repo's clang-on-Windows toolchain (`Length()` returns garbage) while the raw C
  N-API is correct — so the runtime should use `node_api.h` directly and
  node-addon-api can be dropped.
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

**Status: ✅ DONE.** `node make.mjs node [--smoke]` builds
`build/native-node/sculptcore_node.node` for the Electron ABI and (with
`--smoke`) loads it in Electron. Verified: the full engine links and runs
natively — `bindingCount()` calls `initBindings()` and reports **103** registered
binding descriptors inside the Electron process. Implementation notes vs the
steps below: (1) **node-addon-api dropped** — the entry (`source/napi/
napi_entry.cc`) uses the raw C N-API per spike A.5; only `cmake-js` was added as
a dev dep. (2) The `sculptcore_node` MODULE target lives in the root
`CMakeLists.txt`, gated on `DEFINED CMAKE_JS_VERSION` so a plain
`make.mjs configure native` never sees it; it links `sculptcore_core ${LIB}`.
(3) `make.mjs node` uses cmake-js for *configure* (Electron header/`node.lib`
download + `CMAKE_JS_*`) then builds only `--target sculptcore_node` with the
clang toolchain into a separate `build/native-node` dir (cmake-js's `/MT` CRT,
so it stays consistent within the addon and leaves `build/native` untouched).
The spike's `/DELAYLOAD` clang-syntax fix is carried into that target.

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
   runtime. **(First milestone / spike.)** ✅ **DONE** — see
   `sculptcore/spike/napi/` + `RESULTS.md`. clang 20.1.8 builds a `.node` that
   links Electron 41.1.1's `node.lib` and runs in the Electron process; raw
   `napi_*` calls round-trip correctly. Two carry-forwards for the real target:
   (a) cmake-js passes `/DELAYLOAD:NODE.EXE` in `link.exe` syntax, which the
   clang++ driver rejects — re-add it via CMake `LINKER:/DELAYLOAD:node.exe` +
   `delayimp.lib`; (b) use raw `node_api.h`, not node-addon-api (see Tooling note).

## Workstream B — C++ N-API reflection runtime (the core)

**Status: 🟡 slices B1 + B2 done** (`sculptcore/source/napi/napi_runtime.{h,cc}`).
Implemented and verified in Electron:
- **B1 — structs/members/getBoundPointer/construct.** A JS class per `StructType`
  built at load (`napi_define_class`, accessors on the prototype), member
  **get/set** at `ptr + member.offset` switching on member type (Number subtypes
  → number, Int64 → BigInt, bool, Enum → int, embedded Struct → non-owning wrap,
  Pointer/Reference → deref + recurse, null → undefined), `getBoundPointer`, and
  `construct(name)` via a struct's 0-arg constructor thunk (owning wrapper;
  finalizer runs `destructorThunk` + frees). Proof: `CastRayIsect.t` round-trip
  (write 42 → read 42) + embedded `float3` `p` read as a wrapper (31
  default-constructible structs discovered).
- **B2 — methods.** Method properties on the prototype; `methodInvoker` marshals
  JS args → C++ (Number → typed slot, bool, Pointer → `void*` slot, Reference /
  by-value Struct → object address), calls the `MethodThunk(self, args, ret)`,
  and marshals the return (void → undefined, value/pointer via `getBoundPointer`,
  by-value struct → owning wrapper). Proof: constructed `mesh::Mesh`, called
  `recalc_normals()` (0-arg void) — returns undefined, no crash.

- **B3 — bulk-data fast path + minimal Vector.** `vectorView(vec)` returns a
  typed array (Float32Array/…) over a `litestl::util::Vector`'s contiguous
  storage; `vectorLength(vec)` reads `size_`. ⚠️ **Important finding:** Electron
  enables the V8 sandbox, which **forbids external (out-of-sandbox)
  ArrayBuffers** — `napi_create_external_arraybuffer` returns
  `napi_no_external_buffers_allowed`, so true zero-copy is unavailable. The view
  falls back to a **one-shot copy** into a sandbox-internal ArrayBuffer (still
  O(1) napi calls + one memcpy per buffer, vs O(n) per-element getters). Proof:
  `Vector<float,4>.resize(4)` (an int-arg method call — also confirms B2 arg
  marshalling) → `vectorLength` 4 → `vectorView` is a length-4 Float32Array
  reading the zero-initialized storage; the write-then-re-view probe reports
  `zeroCopyExternal:false` (copy path) in Electron. Also fixed a class-cache key
  collision: all `Vector<T,N>` share the bare name `litestl::util::Vector`, so
  the cache is keyed by `buildFullName()`.

The runtime is the raw-C-N-API style spike A.5 recommended. Vector indexed
**get** (`vectorGet`) + length + bulk view are done (see Workstream C
native-pipeline proof). **Fixed-size Array members** (e.g. `float3.vec`,
`BindingType::Array`) also work — a live indexable wrapper with per-index get/set
straight into C++ memory (no ArrayBuffer, so write-back survives the V8 sandbox;
verified `float3.vec` write-then-reread), which unblocks the `float2/3` ring
helpers. **Deferred to later B slices:** Vector indexed *set* +
JS iterator protocol, strings, static methods, signature-based overload
resolution, and the `Map<void*,Napi::Reference>` identity cache (currently a
fresh wrapper per `getBoundPointer`, matching the WASM runtime's no-cache
behavior). Full
arg-*value* verification across more methods is left to the parity suite
(Workstream F).

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

**Status: 🟡 seam + audit done; native manager remaining.** A gated, opt-in,
non-breaking selection seam is in place: `sculptcore/typescript/api/nativeBackend.ts`
loads `sculptcore_node.node` via the renderer's `require` (guarded; `undefined`
in the browser), and `loadWasm()` branches on `nativeBackendRequested()`
(`globalThis.__SCULPTCORE_BACKEND === 'native'`, set e.g. by the test harness's
`--backend native`). Today that branch *detects + reports* the native runtime and
falls back to WASM, because returning a real `IWasmInterface` from native needs
the two things below. The `--backend` flag is set on `globalThis` *before* the
initial `loadWasm()` in `entry_point.js` (the harness's post-init handling is too
late for the first load). **Verified end-to-end:** launching the real app with
`--backend native --remote-debug` and reading the renderer over CDP gave
`{backend:"native", addonBindings:103, wasmUp:true}` — the flag forwards, the live
renderer loads + calls the native addon, and the app still boots on WASM
(non-breaking). The de-numbering boundary is inventoried in `TODO.md`
("native-electron: de-numbering / Workstream C+D"): `wasm.ts` factories,
`sculptcore_ops.ts:183` `getBoundVector(nodes.ptr)`, `litemesh.ts rayCast`
(`_rawAlloc`/`HEAPF32`), `gpuExecutor.ts:142-156` (`buf.data` heap view).
**Native factory free-functions: ✅ DONE.** The addon exports `meshCreateCube` /
`meshBuildSpatialTree` / `spatialTreeFree` (calling the engine's extern-"C"
`Mesh_createCube` etc. in the linked mesh/spatial libs) and wraps the returned
pointers as bound objects. **Verified in Electron — a full native pipeline:**
`meshCreateCube(8,0.5,0)` → a real `Mesh` whose `mesh.v.capacity_` reads `4096`
(real vertex buffer), `mesh.recalc_normals()` runs on the populated mesh,
`meshBuildSpatialTree(mesh,0,0)` builds a real BVH, `spatialTreeFree` frees it.
Vector iteration too: `tree.leaves()` (a method returning `Vector<SpatialNode*>`
**by value** → owning wrapper) → `vectorLength` 2 → `vectorGet(0)` resolves the
element through a pointer to a bound `SpatialNode`. So construct / members /
methods / factories / **Vector iteration** all drive the real engine natively.

**NativeManager assembled (TS): ✅.** `sculptcore/typescript/api/nativeManager.ts`
wraps the addon into the BindingManager-shaped surface — `construct`,
`getBoundVector` (a `NativeBoundVector` Proxy: `.length`, numeric index via
`vectorGet`, iterator), `Mesh_createCube`/`Mesh_buildSpatialTree`/`SpatialTree_free`,
and `float2/3` rings (using the Array-member support). Under `--backend native`
`loadWasm` builds it and exposes it on `globalThis.__nativeManager` (then falls
back to WASM). **Verified end-to-end via CDP in the running app:** `Mesh_createCube(8)`
→ `mesh.v.capacity_` 4096; `Mesh_buildSpatialTree` → `getBoundVector(tree.leaves())`
→ length 2, `[0]` a bound `SpatialNode`, iterates; `float3([1.5,-2.5,7])` round-trips.
(One caveat observed: a transient garbage read during heavy boot-time GC that
didn't reproduce in steady state — a lifetime/finalizer robustness item to watch,
tied to the deferred identity cache.)

**The app boots on the native backend: ✅.** `loadWasm`'s native branch now
*returns* the NativeManager-backed `IWasmInterface` (lazy `gpu` so boot never
constructs `GPUManager`; WASM-heap fields absent — only the sculpt path touches
them). **Verified end-to-end (`--backend native`):** the Electron app boots with
`hasScreen:true`, the default scene built (`sceneObjs:2`), **zero renderer errors**,
`getWasm().__backend === 'native'` (no WASM loaded), and the live `wasm` interface
drives the engine (`Mesh_createCube` → cap 4096, `Mesh_buildSpatialTree` +
`getBoundVector(leaves)` → 2). So the default (sculptcore-free) scene runs natively.

**Fixed — array-element accessor (was: garbage *first* element).** Reading
fixed-size Array members (`float2/3.vec`) via `obj.vec[i]` used to return a
garbage first element. It was **specific to the two-layer array path**
(`memberGetter(vec)` → wrapper → `arrayGetter[i]`): plain struct-member getters
were always fine, but the array path returned a tiny denormal double (~`5e-310`,
a pointer reinterpreted as a double) for element[0]. Root cause was the array
wrapper being a **plain object with `napi_define_properties` accessors** — the
same class of value-lifetime fragility seen with `node-addon-api` under this
clang toolchain.

The fix (in `napi_runtime.cc`): build the array wrapper as a real
`napi_define_class` **instance** — one cached JS class per (element-descriptor,
length), with the index accessors (`0..length`) and a constant `length` on the
**prototype**, exactly like struct member accessors (which never exhibited the
bug). The per-instance base pointer is held by the `napi_wrap`'d `ArrayInstData`;
each `arrayGetter`/`arraySetter` unwraps `this` to recover `base`, then indexes
`base + i*elemSize` straight into C++ memory (no ArrayBuffer, so writes survive
the V8 sandbox). Verified via `source/napi/electron_smoke.cjs` (`float2.vec`
writes `[1.5, 3.0]`, reads back with `firstElementOk`/`allOk` true), and
**re-verified in the running app over CDP** (`--backend native`): the
previously-deterministic repro `[v.vec[0], v.vec[1], v.vec[2]]` is correct, and
3000 fresh-construct + write + fresh-wrapper-read iterations (with GC churn) were
0/3000 bad.

This is **distinct** from the transient boot-time-GC garbage read noted above:
the `float3` ring's *first* call right after boot was observed once to yield a
garbage element[0] (a subnormal double — reinterpreted bits, not a float read),
but that did not reproduce in 3000 steady-state reads. It remains the
lifetime/finalizer watch-item tied to the deferred identity cache, **not** the
accessor bug.

The old per-base `arrayCache_` was dropped — wrappers are now created per access
like embedded-struct wrappers (no identity caching yet; folds into the deferred
identity-cache work).

**Remaining for native *sculpt*:** the `gpu` manager (construct `GPUManager`
natively — GPU-backend care), the WASM-heap reworks (`litemesh.ts rayCast`'s
`_rawAlloc`/`HEAPF32`, `gpuExecutor`'s `HEAPU8.buffer` view → bulk-data copy),
and the float3-ring boot-GC transient above. ✅ `Mesh_free` now exists —
`extern "C" Mesh_free` (`mesh_shapes.cc`, `alloc::Delete<Mesh>`) exposed as the
addon's `meshFree`/`NativeManager.Mesh_free`; it nulls the wrapper's pointer so
a later access/finalizer can't touch freed storage. Verified via the smoke
test's create→buildTree→free lifecycle (no crash).

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
   - **✅ `scripts/editors/view3d/tools/sculptcore_ops.ts:183`** —
     `getBoundVector(name, nodes.ptr)` is now the backend-agnostic
     `wasm.getBoundVector(name, nodes)` on `IWasmInterface` (takes the opaque
     `SculptHandle`, not a number). WASM unwraps the numeric `.ptr` internally;
     native forwards the wrapper. `typescriptRuntime` left untouched (per
     Workstream D). Verified natively over CDP. **Done.**
   - `sculptcore/typescript/api/gpuExecutor.ts:142-143` — `buf.ptr` /
     `buf.data`. Route through the external-ArrayBuffer fast path (Workstream
     B) for the native backend. *(Still TODO — needs the native bulk-data path
     + GPU manager; part of "Remaining for native sculpt" above.)*
3. **✅ Opaque pointer handle type** — `SculptHandle` in `wasm.ts` (a backend-
   private object reference: WASM = numeric heap pointer, native = wrapped C++
   object). App code passes it through the `IWasmInterface` helpers instead of
   reading `.ptr` as a number. **Done.**

## Workstream D — 64-bit pointer audit (reduced scope)

**Status: 🟡 audit done.** The sweep found exactly the four sculptcore-relevant
sites (the rest of the `.ptr` / `as unknown as number` hits in `scripts/**` are
path.ux's own, unrelated). They're recorded in `TODO.md` ("native-electron:
de-numbering / Workstream C+D") for conversion alongside the native manager.
`typescriptRuntime/*` stays unchanged (wasm32, number-based) as planned.

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

**Full-shell scenarios** (running sculptcore inside the actual app, not just a
unit harness) are driven by the Electron test-harness CLI — see
[`native-electron-test-harness.md`](native-electron-test-harness.md). It boots
the real app, builds a deterministic `LiteMesh` scene (`--gen-scene
litemesh-cube`), and `--dump`s a backend-comparable snapshot, so the same
scenario can run under `--backend wasm` today and `--backend native` once
Workstream B/C land. Because LiteMesh serialization is still stubbed, scenes are
built procedurally rather than loaded from `.wproj`.

## Deferred (explicitly out of scope now)
- `litestl::util::Vector` full `Array` method surface (map/filter/reduce/…)
  on both backends.
- Vector allocation/ownership semantics (shallow JS array clone vs new
  Vector with move/copy). Stub the unimplemented methods so they fail loudly.

---

## Suggested sequencing
1. **Spike** (A.5): trivial Electron N-API addon built via cmake-js with the
   clang toolchain — de-risk the link/ABI question first. ✅ **DONE**
   (`sculptcore/spike/napi/RESULTS.md`).
2. Addon build target wired into `make.mjs` (A). ✅ **DONE** (`make.mjs node`).
3. C++ N-API runtime: structs/members/methods/getBoundPointer (B core).
   🟡 structs/members/getBoundPointer/construct **DONE** (B1) + methods **DONE**
   (B2). Remaining B: bulk-data fast path, Vector, strings.
4. TS backend selection + de-numbered boundary (C), minimal Vector (B).
   🟡 selection seam + de-numbering audit **DONE**; minimal Vector **DONE** (B3);
   native manager + factory free-functions remaining.
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
- **Hot-loop performance**: confirm all per-frame bulk reads use the bulk-data
  fast path, not per-property napi getters. ⚠️ **Resolved/updated by B3:** the
  *zero-copy* external-ArrayBuffer is **not available under Electron** (V8 sandbox
  → `napi_no_external_buffers_allowed`). The fast path therefore copies into a
  sandbox-internal ArrayBuffer (one memcpy per buffer). Still vastly better than
  per-element getters, but not zero-copy — factor the per-frame copy into perf
  budgets, and prefer fewer/larger buffers.
- **Object lifetime**: napi finalizers vs litestl's leak-tracking allocator —
  ensure owned-object destruction matches the WASM `[Symbol.dispose]` path and
  doesn't trip the leak tracker.
- **Two runtimes, one API**: parity suite (F) is the guardrail against drift.
