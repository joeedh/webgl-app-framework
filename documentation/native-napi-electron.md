# Native N-API sculptcore backend (vs. WASM)

> **Shell:** the desktop shell is **NW.js** (the `nwjs/` workspace); the Electron
> shell was removed. The native addon is built for the NW.js ABI
> (`node sculptcore/make.mjs node` → default `--runtime nw`, cmake-js `-r nw`);
> detection keys off `process.versions.nw`. The N-API model is shell-agnostic —
> NW.js and Electron both embed Node + V8 with the same sandbox rules — so the
> original Electron-era design carried over unchanged.

`sculptcore` (the C++20 mesh/sculpt engine under `sculptcore/`) is consumed
from the TypeScript app through **two interchangeable runtime backends behind a
single JS API**:

- **WASM** — the browser path. The engine is compiled to WebAssembly by
  Emscripten; a TypeScript runtime bridges JS↔C++ by treating WASM linear
  memory as flat typed arrays.
- **Native N-API** — the NW.js (desktop) path. The engine is compiled to a native
  Node addon (`.node`); a C++ N-API runtime bridges JS↔C++ by reading the
  `litestl::binding` reflection descriptors directly and dereferencing real
  `void*`s.

Both satisfy the same `IWasmInterface` (`sculptcore/typescript/api/wasm.ts`),
so app code is backend-agnostic. The native path is **opt-in** (default off);
the browser is always WASM.

This document explains how the native path works and how it differs from WASM.
The implementation plan and live status are in
[`plans/native-electron.md`](plans/native-electron.md); the NW.js CLI that
boots the app on either backend is in
[`native-electron-test-harness.md`](native-electron-test-harness.md).

---

## Why two backends

The WASM bridge (`sculptcore/source/litestl/binding/typescriptRuntime/`) is
intrinsically **32-bit**: a C++ pointer crosses into JS as a `number`, and the
runtime reads/writes fields with `HEAP32[(ptr + offset) >> PTRSHIFT]` over a
`Uint32Array` view of linear memory. It also re-implements C++ reflection in JS
because WASM exposes nothing but flat memory plus a handful of `LSTL_*` C
helper functions.

For the desktop (NW.js) build we want native performance and 64-bit
correctness. Rather than make the JS runtime bigint/64-bit clean, the native
path adds a **second runtime implemented in C++** that reuses the existing
`litestl::binding` descriptors in-process. The key consequence:

> **Real `void*` pointers never cross into JS as numbers on the native path.**
> C++ does every dereference. The whole class of "audit pointers for 64-bit /
> bigint truncation" problems simply does not exist here.

---

## Side-by-side model

| Concern | WASM backend | Native N-API backend |
|---|---|---|
| Engine artifact | `build/sculptcore.wasm` + `sculptcore.js` glue (Emscripten/Embind) | `build/native-node/sculptcore_node.node` (cmake-js, clang) |
| Where it runs | Browser (and Node for tests) | NW.js renderer (`require`'d) |
| Reflection | Re-implemented in JS over a serialized offset table (`LSTL_GetBindingInfo`) | Reads `litestl::binding` descriptors directly in C++ |
| A bound object | JS wrapper holding `ptr: number` | JS class instance with `napi_wrap`'d C++ `void*` + `StructType*` |
| Field read/write | `HEAP32[(ptr+off) >> shift]` etc. on linear memory | `*(T*)(ptr + member.offset)` in C++ |
| Pointer in JS | a `number` (32-bit) | never — opaque wrapped object only |
| Method call | marshal args into heap + `LSTL_Method_Invoke` | `methodInvoker` marshals args → C++, calls the descriptor's `MethodThunk` |
| Bulk data (vertex buffers) | `new Uint8Array(HEAPU8.buffer, ptr, len)` — true zero-copy view | one-shot **copy** into a sandbox-internal ArrayBuffer (see V8 sandbox below) |
| Object identity key | the numeric `.ptr` | `objectAddress(obj)` — C++ address as an opaque key |
| Tooling | Emscripten, `make.mjs build wasm` | cmake-js + raw C N-API, `make.mjs node` |

---

## Build

```
node sculptcore/make.mjs node            # build build/native-node/sculptcore_node.node
node sculptcore/make.mjs node --smoke    # build, then load in NW.js and call version()/bindingCount()
```

How it differs from the plain native build (`make.mjs build native` →
`build/native`):

- The `sculptcore_node` target is a CMake `MODULE` in the **root**
  `CMakeLists.txt`, gated on `DEFINED CMAKE_JS_VERSION` so a plain
  `make.mjs configure native` never sees it. Entry point:
  `sculptcore/source/napi/napi_entry.cc`.
- `make.mjs node` uses **cmake-js** for *configure* only (`-r nw`) — it provides
  the NW.js N-API headers + `node.lib` and injects the `CMAKE_JS_*` variables —
  then builds just `--target sculptcore_node` with the clang toolchain into a
  separate `build/native-node/` dir (cmake-js's `/MT` CRT, kept consistent
  within the addon, leaving `build/native` untouched).
- The NW.js version is read from the repo-root `package.json` `nw` dep. Re-run
  `make.mjs node` after an NW.js bump to ABI-rebuild against the new headers.
- **NW.js header provisioning:** cmake-js's built-in NW.js download points at the
  legacy `node-webkit.s3.amazonaws.com` mirror, which 404s for current releases
  (leaving an empty `nw.lib` the linker rejects). `make.mjs`'s `provisionNwjsCache`
  pre-populates cmake-js's per-version cache from **`dl.nwjs.io`** instead
  (`node-v<ver>.tar.gz` headers + `x64/node.lib`, mirrored to `nw.lib` since NW.js
  0.111.3+ is node-ABI and ships no separate `nw.lib`), so cmake-js skips its own
  broken download. Idempotent.

### Toolchain gotchas (de-risked in `sculptcore/spike/napi/`)

- **Raw C N-API, not node-addon-api.** The spike found node-addon-api's C++
  `CallbackInfo::Length()` returns garbage under this repo's clang-on-Windows
  toolchain (at both `-O0` and `-O3`); the raw `node_api.h` C ABI is correct.
  Only `cmake-js` was added as a dev dependency.
- **clang targets the MSVC ABI** on Windows (under vcvars via
  `configureEnv.mjs`), so it links NW.js's MSVC `node.lib` fine — but
  cmake-js passes `/DELAYLOAD:NODE.EXE` in `link.exe` syntax, which the clang++
  driver rejects. Re-add it via CMake `LINKER:/DELAYLOAD:node.exe` +
  `delayimp.lib`.

---

## Runtime architecture (`source/napi/`)

```
napi_entry.cc      NAPI_MODULE entry: initBindings(); new NapiRuntime(env, getBindingManager()); installExports()
napi_runtime.h/cc  the reflection runtime (the bulk of the work)
napi_smoke.cjs     shared smoke-test body, loaded in a hidden NW.js window by `make.mjs node --smoke`
```

At module init (`napi_entry.cc`):

1. `initBindings()` — the *same* `extern "C"` call the WASM loader makes;
   populates the global `litestl::binding` reflection registry.
2. `getBindingManager()` returns that registry.
3. A single `NapiRuntime` (lives for the process) installs its functions onto
   `exports`: `version`, `bindingCount`, `structNames`, `structInfo`,
   `construct`, and the rest of the surface below.

### How a bound object works

`NapiRuntime::getBoundClass(StructType*)` builds **one JS class per struct**
the first time it's needed (`napi_define_class`), with:

- an **accessor on the prototype** per `StructMember` (get/set), and
- a **method on the prototype** per `Method`.

A bound object is an instance of that class. `napi_wrap` attaches a `Wrapped {
void* ptr; const _StructBase* st; bool owning; }`. **The `void*` is never
exposed to JS.**

The class cache is keyed by `buildFullName()`, not the bare struct name —
every `Vector<T,N>` specialization shares the bare name
`litestl::util::Vector`, so a bare-name cache would collide.

### Member get/set

`memberGetter` / `memberSetter` compute `ptr + member.offset` and switch on the
member's binding type:

- Number subtypes → JS number; `Int64` → BigInt; `bool`; `Enum` → int.
- embedded `Struct` → a **non-owning** wrapper at the inner address.
- `Pointer`/`Reference` → dereference and recurse (null → `undefined`).
- pointer-member **set** and enum **set** are supported (e.g.
  `exec.meshLog = meshLog`).
- `litestl::util::string` is a member-less `Struct("litestl::util::String")`;
  `getBoundPointer` special-cases it and reads `data_` (a null-terminated
  `char*` at offset 0) as a JS string. (Needed because the WebGPU executor
  matches GPU buffers to shader slots by `buf.name`.)

### Methods

`methodInvoker` marshals JS args → C++ via `marshalArg` (Number/Enum/Boolean →
a typed slot; Pointer → `void*` slot; Reference / by-value Struct → the bound
object's address), calls the descriptor's `MethodThunk(self, args, ret)`, then
marshals the return (void → `undefined`; value/pointer via `getBoundPointer`;
by-value struct → an owning wrapper).

### Construction & lifetime

- `construct(name)` — a struct's 0-arg constructor thunk; owning wrapper. Its
  finalizer runs the `destructorThunk` and frees the storage.
- `constructWith(structName, ctorName, ...args)` — a named, parameterized
  constructor with bound-object pointer args (e.g.
  `CommandExecutor "main"(SpatialTree*, Brush*)`).
- `makeNodeVector()` — a fresh owning, empty `Vector<SpatialNode*>` (the
  `filterNodes` out-param / `execBrush` nodes arg). That specialization can't be
  looked up by element type, so the addon **recovers it from
  `SpatialTree::leaves()`'s return descriptor**.
- `makeIntVector()` / `makeFloatVector()` — fresh owning, empty `Vector<int>` /
  `Vector<float>` (the screen-pick faces/verts, `boundaryGraphStats` and
  `edgePathCoords` out-params), recovered the same way from
  `SpatialTree::castScreenCircle`'s / `Mesh::edgePathCoords`'s param
  descriptors (no method returns either by value). The TS shim
  (`nativeManager.findVectorClass`) maps element names `int`/`int32` and
  `float`/`float32` to these; **anything else falls through to
  `makeNodeVector`** — add a factory before requesting a new element type, or
  element reads silently come back as opaque handles.

Owned-object destruction goes through napi finalizers and must match the WASM
`[Symbol.dispose]` path so it doesn't trip litestl's leak-tracking allocator.
Every bound class also carries a `[Symbol.dispose]()` method on its prototype —
the deterministic counterpart of the GC finalizer, mirroring the WASM
bound-class dispose (`manager.destroyInstance` → `destructorThunk` + free). It
destructs + frees an **owning** instance immediately, then nulls the wrapper's
`ptr`/`owning` so a later member access or the finalizer can't double-free; it's
a no-op on non-owning wrappers (engine-owned objects, embedded-struct/member
views), which must be released by their owner. This makes `using` /
`obj[Symbol.dispose]()` behave the same across both backends.

### Fixed-size inline arrays (`float3.vec`)

`float2/3.vec` (a `BindingType::Array`) is wrapped as a real
`napi_define_class` **instance** — one cached class per (element-descriptor,
length), with index accessors `0..length` and a constant `length` on the
**prototype**, plus a per-instance base pointer held in the `napi_wrap`'d
`ArrayInstData`. Each access indexes `base + i*elemSize` straight into C++
memory — **no ArrayBuffer**, so writes survive the V8 sandbox.

> Why a class instance and not a plain object with `napi_define_properties`
> accessors: the plain-object form had a value-lifetime bug where element[0]
> read back a denormal double (a pointer reinterpreted as a double) under this
> clang/V8 toolchain. Building it like the struct-member accessors (which never
> broke) fixed it. This is the same class of fragility that ruled out
> node-addon-api.

### Native factory free-functions

The WASM build gets these via Embind glue; the native addon exports them
directly (they call the engine's `extern "C"` functions and wrap the returned
pointers):

`meshCreateCube`, `meshBuildSpatialTree`, `spatialTreeFree`, `meshFree`,
plus `vectorLength`, `vectorGet`, `vectorView`, `pointerBytes`, `objectAddress`.

---

## The V8 sandbox: no zero-copy bulk reads

This is the single most important native-vs-WASM difference for performance.

WASM hands JS a raw pointer into linear memory, so a vertex buffer is a true
zero-copy view: `new Uint8Array(HEAPU8.buffer, ptr, len)`.

NW.js enables the **V8 sandbox**, which **forbids external (out-of-sandbox)
ArrayBuffers** — `napi_create_external_arraybuffer` returns
`napi_no_external_buffers_allowed`. So the native bulk-data path (`vectorView`,
`pointerBytes`) falls back to a **one-shot copy** into a sandbox-internal
ArrayBuffer:

- still O(1) napi calls + one `memcpy` per buffer (vastly better than a napi
  getter per element), but **not zero-copy**.
- the copy is **read-only** — writes to a `vectorView` do **not** propagate back
  to C++. (Per-index Array members *do* write back, because they index C++
  memory directly without an ArrayBuffer.)
- factor the per-frame copy into perf budgets; prefer fewer/larger buffers.
  True zero-copy would require native GPU upload, keeping the bytes in C++.

---

## Backend selection & the de-numbered boundary

### Selecting the backend

```ts
// nativeBackend.ts
nativeBackendRequested()  // insideDesktopShell (process.versions.nw|electron) && globalThis.__SCULPTCORE_BACKEND === 'native'
loadNativeAddon()         // require()s the .node in the renderer; undefined in the browser
```

`loadWasm()` (`wasm.ts`) branches on `nativeBackendRequested()` *before* loading
WASM. When the addon is present it builds a `NativeManager`-backed
`IWasmInterface` and returns that instead of instantiating the WASM module;
otherwise it logs and falls back to WASM (non-breaking).

The `--backend native` CLI flag (NW.js test harness) sets
`globalThis.__SCULPTCORE_BACKEND` *early in `entry_point.js`*, before the first
`loadWasm()` — the harness's normal post-init handling is too late for that
first load.

### `NativeManager` — addon primitives → `BindingManager` shape

`nativeManager.ts` wraps the addon into the surface app code expects:

- `construct` / `constructWith` (via `get(name).findConstructor` and
  `findVectorClass(...).findDefaultConstructor` shims — the native backend has
  no rich `Constructor`/`StructType` objects, so these shims just carry the
  names the addon needs).
- `getBoundVector` → a `NativeBoundVector` `Proxy` exposing `.length`, numeric
  index (`vectorGet`), and an iterator.
- `Mesh_createCube` / `Mesh_buildSpatialTree` / `SpatialTree_free` /
  `Mesh_free`.
- `float2`/`float3` rings (reusing the Array-member support), mirroring
  `wasm.ts`'s cacherings.

`makeNativeInterface()` assembles the partial `IWasmInterface`: `gpu` is lazy so
boot never constructs `GPUManager`, and the WASM-heap fields (`HEAPF32`,
`_rawAlloc`, …) are intentionally **absent** — only sculpt/heap paths touch
them, and those were de-numbered to go through the backend-agnostic seams below.

### The `SculptHandle` boundary

`SculptHandle` (`wasm.ts`) is the opaque bound-object type: a numeric heap
pointer on WASM, a wrapped C++ object on native. App code must treat it as
opaque (**never read `.ptr` as a number**) and pass it back through the
backend-agnostic helpers. The de-numbered sites:

- `getBoundVector(name, handle)` — takes the handle, not a number (WASM unwraps
  `.ptr` internally; native forwards the wrapper).
- the `Mesh_*` / `SpatialTree_free` factories — wrapper objects, no numeric ptr.
- **bulk data** (`scripts/webgpu/batch.ts` *and* `api/gpuExecutor.ts`):
  `bufferBytes(buf, len)` = WASM `HEAPU8` view vs native `pointerBytes`;
  `bufferKey(buf)` = WASM `.ptr` vs native `objectAddress`.
- `litemesh.ts rayCast` — passes ray endpoints as bound `float3`s through the
  `wasm.float3(...)` ring instead of `_rawAlloc`/`HEAPF32` heap poking.

> **Never throw on the bulk-data seam.** Native `bufferBytes` returns an *empty*
> `Uint8Array` for a not-yet-filled buffer rather than throwing — WASM's
> `new Uint8Array(heap.buffer, ptr, 0)` is a harmless empty view, and the first
> frame races the spatial tree's GPU-buffer fill. A throw there is caught by
> `drawObjects` as a mere warning and silently aborts the whole pass (mesh *and*
> overlays vanish).

The `typescriptRuntime/*` WASM runtime is **left unchanged** — it stays wasm32 /
number-based by design.

---

## Parity testing

`tests/integration/sculptcore_parity.test.ts` (Jest, under `pnpm test`) boots
the real app headlessly once per backend
(`--headless --backend {wasm,native} --gen-scene litemesh-cube --scene-arg
subdiv=8 --dump <tmp> --exit`) and diffs the two structured dumps with a
tolerant numeric diff (`ATOL=1e-5`, `RTOL=1e-4`).

`dumpScene()` (`scripts/core/test_harness.ts`) captures, per LiteMesh: scalar
counts, the spatial **leaf count** (topology), and a float32 **signature** of
each populated GPU vertex buffer (`{size, elemsize, floatCount, sum, sumAbs,
min, max, sample[32]}`), read through the bulk-data seam off the LiteMesh's own
`.wasm` field (so `scripts/core` imports no sculptcore). `position`/`normal`/
`color`/`uv` + `leafCount` come back **byte-identical** across backends.

> Vertex `co` (`BuiltinAttr<float3>`) is **not** JS-readable on native, so the
> comparable geometry is the **GPU buffers**, not raw positions.

The test **self-skips with a logged reason** when the app bundle or the native
`.node` is absent, so CI without the clang/cmake-js toolchain stays green.

`tests/integration/sculptcore_brushes.test.ts` reuses the same boot path for
**behavior** (not parity): `--eval "__brushTest()"` runs the scripted stroke
driver (`scripts/lite-mesh/litemesh_brushtest_support.ts`), whose result is
reflected into the dump as `brushtest`. It asserts invert direction, mask
gating, brush.color piping, draw-sharp boundedness, and accumulate defaults,
per backend. Same self-skip rules.

`tests/integration/sculptcore_boundary.test.ts` does the same for the
**boundary constraint system**: `--eval "__boundaryTest()"`
(`scripts/lite-mesh/litemesh_boundarytest_support.ts`) marks three seam paths
with the real `litemesh.mark_seam` ToolOp, then watches the connected polyline
graph of all boundary-flagged edges through `Mesh::boundaryGraphStats`
(`[flaggedEdges, graphVerts, non2ValenceVerts, components]`). Non-2-valence
vertex count and component count are invariant under feature-preserving
remeshing, so the test asserts they survive a dyntopo stroke over the seams
(while `flaggedEdges` growth proves the remesher split seam edges), that a
non-dyntopo stroke changes nothing, and that toolstack undo/redo (marking) and
MeshLog undo/redo (strokes) restore the stats exactly, per backend.

---

## Known watch-items

- **Identity cache (deferred).** There is no `Map<void*, napi_ref>` identity
  cache yet — `getBoundPointer` mints a fresh wrapper per call (matching the
  WASM runtime's no-cache behavior). A transient boot-time-GC garbage read (the
  first native read after a GC-heavy scene build occasionally yields a denormal
  double — a pointer reinterpreted as bits, not a real float read) is tied to
  this; it does not reproduce in steady state (0/2000 floats, 0/1000 addresses
  clean under GC). The identity cache is the likely fix.
- **Vector surface is minimal** — `length` / indexed get / iterator. The full
  `Array` method surface (map/filter/reduce/…) and allocation/ownership
  semantics are explicitly deferred and stub/throw loudly.

## Debugging tips

- **stdout/stderr work in NW.js.** NW.js merges the Node + browser contexts into
  one window, so a native `printf` / `sc_napi_logf` and the renderer's
  `console.log` reach the launching terminal normally. The Electron-era
  workarounds for its broken renderer fds — `freopen`/`redirectStdout`,
  routing native logs to the DevTools console, flushing per-stage markers to
  disk — should no longer be needed; prefer plain stdout/stderr.
- A native `abort()` **bypasses JS try/catch**, so `napi_smoke.cjs` flushes
  a per-stage marker to disk to localize crashes.
- When a render goes blank, **check for a swallowed JS throw first** (it hides
  as a `drawObjects` warning) before suspecting a GPU validation error —
  capture both via `console` warnings *and*
  `device.pushErrorScope('validation')`.
- `execBrush` freezes topology for DRAW; re-walking the tree before thawing
  crashes natively. The app thaws via `mesh.recalc_normals()` (auto-thaws)
  post-stroke. Re-`update`ing the tree with a *different* `GPUManager` won't
  refill buffers (the tree isn't dirty for it) — reuse one manager.
</content>
</invoke>
