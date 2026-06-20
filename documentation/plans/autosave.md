# Autosave

Status: proposal / design. Not yet implemented.

Goal: periodically persist the current project to disk (and recover it after a
crash) at a user-configurable interval, without stalling the UI — even for
multi-million-triangle sculptcore scenes where serialization is the dominant
cost.

Primary target is the **Electron** build (it has real filesystem access). The
**browser** build can do a meaningful subset via OPFS / IndexedDB recovery
snapshots (no user prompt required) — see [§7](#7-browser-build).

---

## 1. Background — how saving works today

The whole save path is **synchronous on the main thread** and monolithic.

- `AppState.createFile(args)` — `scripts/core/appstate.ts:254`. Builds one
  binary blob with `BinaryWriter`:
  1. header (`'WPRJ'` magic, `APP_VERSION`, compression flag),
  2. the embedded nstructjs schema (`nstructjs.write_scripts()`),
  3. a `SETTINGS` block (optional),
  4. a `LIBRARY` block, then one `DATABLOCK` block per `DataBlock` in
     `datalib.libs` (meshes, materials, screens, …),
  5. an optional `TOOLSTACK` block,
  6. optional whole-file JSZip deflate.
  Each block is produced by `nstructjs.manager.write_object(data, block)`
  (`appstate.ts:301,342`).
- For a `LiteMesh`, `write_object` walks its STRUCT and hits the
  `_data : arraybuffer(byte) | this.serialize()` field
  (`scripts/lite-mesh/litemesh.ts:344`). The getter `LiteMesh.serialize()`
  (`litemesh.ts:739`) calls `this.wasm.Mesh_serialize(this.mesh)`, returning a
  **versioned, lz4hc-compressed** blob (C++ `serial::writeMesh`, format v2,
  `sculptcore/source/mesh/mesh_serialize.h`). This blob is embedded **inline**
  in the LiteMesh DataBlock.
- `Mesh_serialize` / `Mesh_deserialize` are exposed identically by both backends
  (`sculptcore/typescript/api/wasm.ts:122`, native `nativeBackend.ts` /
  `nativeManager.ts:149`). They are effectively **pure functions of the mesh
  handle** — they touch no spatial tree or draw state.
- Save trigger: `FileSaveOp` (`app.save`, `scripts/core/app_ops.js:34`). It
  calls `createFile`, then `platform.platform.writeFile(data, _appstate.saveHandle, …)`.
  - Electron `writeFile` = synchronous `fs.writeFileSync`
    (`scripts/path.ux/scripts/platforms/electron/electron_api.ts:725`).
  - Browser `writeFile` = `FileSystemFileHandle.createWritable()` (File System
    Access API), or a download fallback (`…/platforms/web/web_api.ts:72`).
- `_appstate.saveHandle` holds the destination (a path string on Electron, a
  `FileSystemFileHandle` on the web).
- There is **no** periodic save, dirty-tracking, crash recovery, or backup
  rotation today. `saveStartupFile()` (`appstate.ts:977`) is the closest
  relative — a manual "save default file" into `.sculptcore/startup.bin`.

### Cost model

- TS "shell" (everything except mesh blobs): scene graph, materials, screen,
  small DataBlocks → **cheap** (single-digit ms typically).
- Per-LiteMesh `Mesh_serialize`: dominated by **lz4hc compression** of a
  column-oriented dump (topology + attributes). For a 5M-tri mesh this is the
  expensive part and grows with mesh size and attribute count.
- Both backends run this **on the main/JS thread** (no worker infra exists
  anywhere in the project; native N-API is explicitly main-thread-only —
  `sculptcore/source/napi/napi_runtime.cc:53`). So a naive periodic
  `createFile()` would hitch the UI every interval.

---

## 2. Design overview

Three independent levers, applied in order of payoff. Each milestone is
shippable on its own.

1. **Correctness first (M1):** a plain periodic, dirty-gated, atomic autosave
   that just calls the existing `createFile()` on the main thread. Accept the
   hitch for now; get backup rotation + recovery right.
2. **Avoid redundant work (M2):** **per-mesh blob cache keyed by a revision
   counter**. Most autosaves change zero or one mesh; re-serialize only the
   meshes that actually changed and reuse cached compressed blobs for the rest.
   This is the single biggest real-world win for large scenes.
3. **Get the remaining work off the main thread (M3):** **split serialization**
   — produce the cheap TS shell on the main thread, hand the heavy
   compression + disk write to a worker. Requires separating "snapshot the raw
   mesh bytes" (fast, main thread) from "compress + assemble + write" (worker).

The user's sketch — *"serialize the TS data minus sculptcore, then serialize
sculptcore in another thread, then add sculptcore back"* — is exactly M3, made
safe by M2's revision tracking (so we only ship changed meshes to the worker)
and by snapshotting raw bytes on the main thread (so the worker never touches
live C++ memory).

---

## 3. M1 — Periodic dirty-gated atomic autosave (main thread)

Deliver a correct, safe autosave that simply reuses `createFile()`.

### 3.1 Settings (interval + enable)

Add to `AppSettings` (`scripts/core/settings.ts`, near `limitUndoMem` /
`undoMemLimit` at ~line 103):

- `autosaveEnabled: boolean = true`
- `autosaveIntervalMinutes: number = 5` (UI in minutes; clamp 0.5–120)
- `autosaveMaxBackups: number = 5`
- (optional) `autosaveToProjectDir: boolean = true` — write backups next to the
  open project vs. into `.sculptcore/autosave/`.

For each: add to the `AppSettingsJSON` interface and `toJSON`/`loadJSON`
(`settings.ts:221`), and register in `defineAPI()` (`settings.ts:143`) with
`.on('change', onchange)` so edits persist immediately and the running timer
picks up the new interval. Run `pnpm gen:paths` afterwards (new data paths).

UI: add `tab.prop('settings.autosaveEnabled')` etc. to
`scripts/editors/settings/SettingsEditor.ts` (~line 46), alongside the existing
undo-memory props. The `change` handler should re-arm the timer (below).

### 3.2 The scheduler

A small `AutosaveManager` (new file `scripts/core/autosave.ts`), owned by
`AppState`. Responsibilities:

- A single `setTimeout`-rearmed loop (not `setInterval`, so a long save can't
  pile up). Reads `settings.autosaveEnabled` / `autosaveIntervalMinutes` each
  tick; settings `change` handler calls `autosave.rearm()`.
- **Dirty gate:** only save if the project changed since the last save/autosave.
  Reuse the existing change signal — bump a counter in `AppState` on toolstack
  execution (`app_ops.js` `execPost`, the same hook noted in the save research)
  and on undo/redo. Track `lastSavedChangeId`; skip the tick when equal.
- **Idle gate:** never autosave mid-interaction. Skip if a modal ToolOp is
  running (`toolstack` has an active modal), if a sculpt stroke is in flight, or
  if a previous autosave is still pending. Defer to the next tick instead.
- Telemetry: a subtle status-bar indicator ("Autosaving…", "Autosaved 14:32").

### 3.3 Destination, atomicity, rotation

- **Never overwrite the user's file** and never write it non-atomically.
  Write to a temp path then `rename` (atomic on the same filesystem):
  `foo.wproj` → write `foo.wproj.autosave.tmp` → `rename` to
  `foo.wproj.autosave.N`. Rotate `N` over `autosaveMaxBackups`.
- For an unsaved/untitled project, write into `.sculptcore/autosave/`
  (dir via `sculptcoreDir()`, `electron/main.js:189`).
- Use **async** fs in Electron (`fs.promises.writeFile` + `fs.promises.rename`),
  not the synchronous `writeFile` path, so even M1's disk I/O doesn't block.
  This likely needs a new platform method (`writeFileAtomic`/`writeFileAsync`)
  or a direct `require('fs').promises` call in `AutosaveManager` (renderer has
  `nodeIntegration`).
- Write a tiny sidecar `autosave/manifest.json` recording: source project path,
  timestamp, app version, and which backup slot is newest. Drives recovery.

### 3.4 Recovery

On startup (after `genDefaultFile`/normal boot), `AutosaveManager.checkRecovery()`:
- If an autosave backup exists that is **newer** than the project file it
  shadows (or the project was never cleanly saved), show a non-blocking prompt:
  "Recover unsaved work from <time>?" → load via the existing
  `loadFileAsync` path.
- Clear/super-cede backups after a successful explicit `app.save`.

**M1 acceptance:** autosave fires on interval, only when dirty and idle; writes
rotate atomically; killing the process mid-session and restarting offers a valid
recovery file that loads. Accept a main-thread hitch proportional to scene size
(measured + reported; the fix is M2/M3).

---

## 4. M2 — Per-mesh blob cache (skip unchanged meshes)

Most autosaves change zero or one mesh; today every autosave recompresses every
mesh. Eliminate that.

- **Revision counter per LiteMesh.** Add `meshRevision: number` to `LiteMesh`,
  bumped whenever the mesh geometry/attributes change. Hook the existing
  mutation points: sculpt stroke end, dyntopo edits, mark-seam/sharp ops,
  remesh, any ToolOp that touches the mesh. (A coarse bump-on-any-edit is fine;
  false positives only cost a recompress.)
- **Cache** `{ revision, blob: Uint8Array }` per LiteMesh (on the instance or in
  `AutosaveManager`). On autosave, if `cache.revision === mesh.meshRevision`,
  reuse `cache.blob`; else call `Mesh_serialize` and update the cache.
- Plumb the cache into serialization: give `LiteMesh.serialize()` an optional
  "use cache" path, or have the split serializer (M3) consult the cache before
  calling the backend. The normal interactive `app.save` can opt out (always
  fresh) or opt in (cache is correct as long as the revision discipline holds).
- The same cache feeds M3: only **changed** meshes' raw bytes get shipped to the
  worker; unchanged meshes contribute their cached compressed blob directly.

Invalidation correctness is the main risk — a missed revision bump means a stale
mesh in the autosave. Mitigations: bump conservatively (coarse is safe), and
make the explicit `app.save` always bypass the cache so the canonical file is
never stale even if a bump is missed.

**M2 acceptance:** with one mesh edited between ticks, an autosave of an N-mesh
scene calls `Mesh_serialize` once, not N times; output is byte-identical to a
full serialize.

---

## 5. M3 — Split serialization (off-thread compression + write)

Move the heavy work off the main thread. The key realization: `Mesh_serialize`'s
cost is **lz4hc compression**, not extracting the bytes. Split it.

### 5.1 Split the C++ serializer

In `serial::writeMesh` (`sculptcore/source/mesh/mesh_serialize.*`), separate:
- `Mesh_serializeRaw(mesh) → Uint8Array` — the column dump **without**
  compression (a near-memcpy pass over the live mesh; fast, main-thread).
- A standalone `compressBlob(raw) → Uint8Array` — the lz4hc step + BinFile
  header, callable **without** a live mesh / backend (pure bytes-in/bytes-out).

Expose `Mesh_serializeRaw` through the 4-place N-API/IWasm seam (per
`CLAUDE.md` "Adding a new N-API method"): `napi_runtime.{h,cc}`,
`NativeAddon` type, `NativeManager` method, `makeNativeInterface`; mirror on the
WASM backend. `compressBlob` can live as a small standalone lz4 codec available
in both the main thread and the worker (a tiny JS/wasm lz4 module), so the
worker needs **no** sculptcore addon at all.

### 5.2 The pipeline

On an autosave tick:

1. **Main thread (fast):**
   - Serialize the TS shell with a *deferred* LiteMesh blob: a variant of
     `createFile` where each LiteMesh writes a small **placeholder** (a stable
     `blobId`) instead of its bytes. Everything non-sculptcore is fully
     serialized here.
   - For each LiteMesh, decide via the M2 cache: unchanged → reuse cached
     compressed blob; changed → call `Mesh_serializeRaw` (uncompressed) to grab
     a transferable `ArrayBuffer`.
   - Assemble a job: `{ shellBytes, blobs: [{blobId, state: 'compressed'|'raw',
     bytes}] }`.
2. **Worker thread (heavy):**
   - lz4-compress each `raw` blob (`compressBlob`).
   - Stitch the final `.wproj`: splice each compressed blob into its
     placeholder slot in the shell (or append a blob table the loader resolves —
     see §5.3), apply the optional whole-file deflate.
   - Write to disk atomically (worker owns the temp-write + rename), so even the
     I/O is off the main thread.
   - Post back `{ ok, path, bytesWritten }`; main thread updates the M2 cache
     with the freshly compressed blobs and the status indicator.
- **Transfer, don't copy:** pass `ArrayBuffer`s as transferables
  (`worker_threads` `postMessage(msg, [transferList])` in Electron, or
  `Worker.postMessage` transferables in the browser). The raw mesh dump moves to
  the worker with zero copy.

### 5.3 File-format choice for splicing

Two options; pick during M3 design:
- **(a) Placeholder splice:** the shell reserves a length-prefixed gap per
  LiteMesh; the worker fills it. Keeps the existing `.wproj` layout and loader
  unchanged, but requires a back-patch pass (record gap offsets).
- **(b) Blob-table / sidecar:** the LiteMesh DataBlock stores a `blobId`; a
  trailing blob section (or a sibling `.wproj.blobs` file) holds
  `blobId → compressed bytes`. `LiteMesh.loadSTRUCT` (`litemesh.ts:529`)
  resolves `blobId` instead of reading inline `_data`. Cleaner for streaming and
  for M2 caching, but changes the load path and bumps `APP_VERSION`.

Recommendation: **(b)** for autosave files specifically (they're a separate,
versioned artifact we control), keeping the canonical `app.save` format
unchanged in M1/M2. Revisit unifying later.

### 5.4 Worker infrastructure (new)

There is no worker today. Add one cross-backend abstraction:
- Electron: `worker_threads` (`nodeIntegrationInWorker: true` is already set —
  `electron/main.js:210`).
- Browser: a Web Worker (module worker) doing JS/wasm lz4.
- The worker carries **only** an lz4 codec + file-stitch + fs/OPFS write — **no
  sculptcore addon**, so it loads fast and stays backend-agnostic.

**M3 acceptance:** autosaving a 5M-tri scene produces no visible frame hitch
(main-thread work bounded by shell serialize + raw mesh memcpy + transfer);
the resulting file loads byte-equivalently; CPU compression happens on the
worker.

---

## 6. Threading caveats (why the snapshot matters)

- The native addon and its mesh memory are **main-thread-only**. The worker must
  never call into sculptcore. M3 respects this: the main thread extracts raw
  bytes (`Mesh_serializeRaw`); the worker only compresses opaque bytes.
- The raw extraction must be **consistent** — take it synchronously on the main
  thread between frames (the scheduler's idle gate already ensures no stroke is
  mid-flight), so the snapshot is a coherent mesh state.
- An alternative to a JS worker is a **libuv async-work** N-API compressor
  (`napi_create_async_work`) that compresses a main-thread-provided raw buffer
  on the thread pool. This avoids a second JS runtime but still requires the raw
  snapshot on the main thread, and is Electron-only. The JS/Web-Worker route is
  preferred because it also covers the browser and moves disk I/O off-thread.

---

## 7. Browser build

The browser *can* autosave for recovery purposes without any user prompt:

- **OPFS** (`navigator.storage.getDirectory()`) — persistent, per-origin,
  `createWritable()` with no gesture. Best target for browser autosave
  snapshots; the worker can write here directly. **Recommended.**
- **IndexedDB** — fallback where OPFS is unavailable; store the blob under a key
  with a manifest record.
- The user's chosen save file (`FileSystemFileHandle` in `_appstate.saveHandle`)
  *can* be written to directly, but persisted write permission may require a
  re-grant gesture across sessions — unreliable for silent autosave. Treat the
  handle as best-effort; OPFS/IndexedDB is the dependable recovery store.

So: Electron writes rotating files next to the project (or in `.sculptcore`);
the browser writes recovery snapshots to OPFS/IndexedDB and offers recovery on
next load. Same `AutosaveManager`, different storage backend behind a small
interface (mirrors the existing `AppStorage` Browser/Electron split,
`scripts/core/app_storage.ts`).

---

## 8. File touch-points summary

| Concern | File(s) |
|---|---|
| Settings fields + data API | `scripts/core/settings.ts` (`AppSettings`, `AppSettingsJSON`, `defineAPI`), then `pnpm gen:paths` |
| Settings UI | `scripts/editors/settings/SettingsEditor.ts` |
| Scheduler / dirty+idle gate / recovery | **new** `scripts/core/autosave.ts`, owned by `scripts/core/appstate.ts` |
| Dirty signal | `scripts/core/app_ops.js` (toolstack `execPost`), undo/redo |
| Atomic async write (Electron) | new platform method or direct `fs.promises` in `autosave.ts`; dir via `electron/main.js` `sculptcoreDir()` |
| Per-mesh revision + blob cache (M2) | `scripts/lite-mesh/litemesh.ts` (`meshRevision`, `serialize()` cache hook) |
| Split serialize (M3) | `scripts/core/appstate.ts` (`createFile` deferred-blob variant), `litemesh.ts` (`loadSTRUCT` blobId resolve) |
| Raw serialize seam (M3) | `sculptcore/source/mesh/mesh_serialize.*`, `source/napi/napi_runtime.{h,cc}`, `typescript/api/{nativeBackend,nativeManager,wasm}.ts` |
| Worker (M3) | **new** worker module + lz4 codec; Electron `worker_threads` / browser Web Worker |
| Browser recovery store (M7) | OPFS / IndexedDB backend behind `AutosaveManager`, paralleling `scripts/core/app_storage.ts` |

---

## 9. Milestones

- **M1** — settings + scheduler + dirty/idle gates + atomic rotation + recovery,
  reusing `createFile()` on the main thread (async disk I/O). *Shippable.*
- **M2** — per-mesh revision counter + compressed-blob cache; autosave skips
  unchanged meshes. *Biggest real-world speedup.*
- **M3** — split serialization: TS shell on main thread, raw mesh snapshot +
  transfer, compression + file-stitch + disk write on a worker. *Removes the
  hitch.*
- **M4 (optional)** — browser OPFS/IndexedDB recovery backend.
- **M5 (future)** — unify the split/blob-table format with the canonical
  `app.save` format; consider delta/journal autosave on top of the existing
  meshlog.

## 10. Open questions

1. Interval unit/default — minutes (5) with a 30s floor? Expose max-backups and
   location in the UI, or keep them advanced?
2. Backups next to the project file vs. always in `.sculptcore/autosave/`?
   (Next-to-file is more discoverable; `.sculptcore` is tidier and works for
   untitled projects.)
3. Autosave file format: separate versioned artifact (recommended, lets M3 use a
   blob table freely) vs. exact `.wproj` parity (so a user can rename-and-open)?
4. Is a coarse "any edit bumps `meshRevision`" acceptable for M2, or do we want
   finer per-domain tracking to avoid recompressing on trivial edits?
5. Worker route for M3: JS/Web-Worker (cross-backend, also moves I/O off-thread)
   vs. N-API libuv async-work (Electron-only, no second JS runtime)? Plan
   assumes the former.
