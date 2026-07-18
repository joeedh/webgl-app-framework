# Multires "Add Level" ToolOp — scoping (2026-07-17)

## Status: IMPLEMENTED (2026-07-17)

Landed as specced, with one refinement: `addLevel`/`removeTopLevel` **preserve
the cached level chains + resident slots** instead of `invalidateAll()`, so the
grow/shrink is bit-exact lossless (a full re-derivation drifts edited verts
through the frame-projection round-trip; keeping the caches avoids that). The
`test_multires.cc` `gateAddLevel` gate confirms: grow preserves existing detail
bit-exactly, level N+1 == `stencil(level N)` with zero disp, shrink is
byte-identical to the pre-grow store, and the level cap holds. The integration
driver `__multiresAddLevelTest` + 9 jest assertions pass on **both** wasm and
native (cross-backend checksum-identical). VDM-attached is refused as planned; no
UI button (still no multires panel).

## Goal

Add a `litemesh.multires_add_level` ToolOp (the Blender-style "Subdivide" button
on the multires modifier) that appends **one finer** Catmull-Clark level on top
of a live multires stack, preserving all existing sculpted detail, and is fully
undoable.

## Why it doesn't exist today

The multires stack depth is chosen once at `litemesh.multires_enable(levels=N)`
and only ever read back (`Multires::maxLevel()`). The engine seam
(`Multires_setActiveLevel / _writeback / _downRefit / _free / _storeBlob /
_restoreStore`, plus the bound `Multires` methods) has **no grow primitive**.
`Refiner::refine(cage, n)` rebuilds *all* levels from scratch but is only called
from `Multires::init`; `GridsStore::addLevel()` appends a zero level but is only
called from `init`. Nothing wires "grow by one" to a bound method or a ToolOp.

Key facts that make a clean grow possible:

- Grid enumeration and `GridsStore::sideForLevel(L) = 2^(L-1)` are **pure
  functions of cage topology + level index** — adding a finer level does not
  perturb the grid tables or displacement of levels `1..N`.
- `GridsStore::addLevel()` appends level `N+1` zero-filled for **every** channel
  (so channel-0 disp *and* every sculpt-layer channel get a smooth new level).
- `Refiner::refine(cage, N+1)` reproduces levels `1..N` bit-identically (same
  stencils), then adds level `N+1`.

So: fold the active level → `refine(cage, N+1)` → `releaseMeshes()` →
`store.addLevel()` → `posCache_.resize(N+1)` → materialize the new finest level.
Existing detail is untouched; the new level starts as a smooth subdivision of the
previous finest surface (zero displacement).

## Engine change (sculptcore, C++)

Bound-method surface, **not** the C-API 4-place N-API change — `Multires` is
already reflected via `defineBindings()`, so a new bound method is exposed on
both WASM (Embind) and native (N-API reflection) with only a `pnpm build`
regen (see "Bindings" below). The app already calls `_multires.layerAdd()` etc.
through exactly this surface.

### 1. `GridsStore::dropTopLevel()` — `grids.h` / `grids.cc`

Symmetric inverse of `addLevel()` (needed by the undo path):

```cpp
void GridsStore::dropTopLevel() {
  if (levelCount_ < 1) return;
  for (auto &ch : channels_) ch.levels.pop_back(); // pop_back destructs cleanly
  levelCount_--;
}
```

`pop_back` is safe here — the double-free noted in `removeChannel` is specific to
`Vector::remove_at` move-assigning onto a live slot mid-vector; popping the tail
is not affected.

### 2. `Multires::addLevel()` and `Multires::removeTopLevel()` — `multires.h` / `multires.cc`

```cpp
// Grow the stack by one CC level (zero-disp finest), preserving all existing
// detail. Returns the new maxLevel, or the unchanged maxLevel if at the cap.
int Multires::addLevel() {
  if (!cage_) return 0;
  if (maxLevel() >= kMaxMultiresLevels) return maxLevel();   // cap == 7 (see below)
  if (activeLevel_ >= 1) writeback(activeLevel_);            // fold pending edits
  int n = maxLevel() + 1;
  refiner.refine(*cage_, n);
  refiner.releaseMeshes();
  store.addLevel();
  posCache_.resize(n);
  invalidateAll();
  setActiveLevel(n);                                         // attach the new finest
  return maxLevel();
}

// Undo/redo helper: pop the finest level. The finest level added by addLevel()
// carries zero displacement, so this is exact.
int Multires::removeTopLevel() {
  if (!cage_ || maxLevel() <= 1) return maxLevel();
  if (activeLevel_ >= 1) writeback(activeLevel_);
  int n = maxLevel() - 1;
  refiner.refine(*cage_, n);
  refiner.releaseMeshes();
  store.dropTopLevel();
  posCache_.resize(n);
  invalidateAll();
  setActiveLevel(activeLevel_ > n ? n : activeLevel_);
  return maxLevel();
}
```

- **Level cap** (`kMaxMultiresLevels`, 7) mirrors `MultiresEnableOp`'s
  `levels` range (each level ~4× the vertex count; a cap is required).
- `invalidateAll()` + `setActiveLevel()` rematerialize from the store — correct
  and simple; the small recompute cost is a one-shot on a user click.

### 3. Register in `Multires::defineBindings()` — `multires.cc`

```cpp
BIND_STRUCT_METHOD(st, addLevel, MARGS());
BIND_STRUCT_METHOD(st, removeTopLevel, MARGS());
```

Adding **new** methods (not changing an existing method's arity) is safe for the
N-API reflection runtime after a rebuild + regen. (The
`binding_method_argnames_arity` gotcha only bites when an *existing* bound
method's parameter list changes without updating `bindings.cc` MARGS — not the
case here.)

## Bindings / regeneration

- `node make.mjs build wasm` and `node make.mjs build node` — rebuild both
  backends so the new methods exist in the Embind glue and the N-API addon.
- `pnpm build` in `tools/` regenerates
  `sculptcore/typescript/sculptcore/subdiv/Multires.ts`; the interface gains
  `addLevel(): int32` and `removeTopLevel(): int32` automatically.
- No `wasm.ts` / `nativeManager.ts` / `napi_runtime.*` edits — those are the
  C-API 4-place path, which we're deliberately avoiding.

## App change (TS)

### `LiteMesh` — `scripts/lite-mesh/litemesh.ts`

Mirror `multiresDownRefit()` (fold → engine call → re-attach the level views):

```ts
/** Append one finer multires level (preserving detail). Returns the new depth,
 *  or the unchanged depth at the level cap. */
multiresAddLevel(): number {
  if (!this._multires) return 0
  const n = this._multires.addLevel()
  this._attachMultiresLevel()
  return n
}

/** Undo/redo helper for multiresAddLevel — pop the finest level. */
multiresRemoveTopLevel(): number {
  if (!this._multires) return 0
  const n = this._multires.removeTopLevel()
  this._attachMultiresLevel()
  return n
}
```

### ToolOp — `scripts/lite-mesh/litemesh_ops.ts`

New `MultiresAddLevelOp extends MultiresOpBase` (reuses the
`FeatureFlags.get('sculptcore.multires')` gate):

```
toolpath: 'litemesh.multires_add_level'
uiname  : 'Add Multires Level'
```

- `exec`: `mesh.multiresAddLevel()` (no-op without a live stack / at the cap).
- `undo`: `mesh.multiresRemoveTopLevel()`; `redo` re-runs `exec`.
- Belt-and-suspenders: snapshot `multiresStoreBlob()` + level in `undoPre` and
  restore via `multiresRestoreStoreBlob` on undo if we want to be robust against
  a partially-folded active level — but `removeTopLevel` alone is exact because
  the added level is zero-displacement. Recommend starting with the cheap
  `removeTopLevel` undo and only adding the blob snapshot if a fuzz test flags a
  residual.

## Edge cases / guards

- **VDM attached** (`mesh.hasVdm`): a Ptex VDM store is configured for the
  current finest-grid resolution; growing the stack changes the finest level and
  would desync texel sampling. `MultiresAddLevelOp.exec` (or `multiresAddLevel`)
  should **refuse when `mesh.hasVdm`** (advisory: "delete VDM before adding a
  level"), matching how the other multires ops stay conservative. Re-deriving the
  VDM across a level change is out of scope.
- **Sculpt layers**: preserved automatically — `store.addLevel()` zero-fills the
  new level for every channel. The pre-grow `writeback(active)` folds pending
  edits into the *edit-target* channel first, so nothing is lost.
- **Active-level clamp**: `removeTopLevel` clamps the active level down if the
  user was sitting on the popped finest level.
- **Level cap** (7): `exec` becomes a no-op at the cap; the op reports the
  unchanged depth. Consider disabling the button (poll) at the cap.
- **Spatial re-attach**: `_attachMultiresLevel()` rebuilds the level's spatial /
  GPU views after the pointer swap, exactly like `multiresSetLevel`.

## UI (optional, follow-up)

No panel currently surfaces *any* multires ToolOp (they're driven from tests /
the data API today), so a button is not required to land this. When a multires
panel is built, add `litemesh.multires_add_level` next to Enable / Level /
Refit / Delete, polled off `multiresLevels > 0 && multiresLevels < 7 &&
!hasVdm`.

## Tests

- **C++ ctest** (`sculptcore/tests/test_multires_addlevel.cc`, wired in the
  subdiv `CMakeLists.txt`): enable a 2-level stack on a small cage, checksum the
  finest positions, `addLevel()`, assert (a) `maxLevel()==3`, (b) the level-2
  surface is unchanged (its displacement was preserved), (c) the new level 3 is a
  smooth subdivision (zero disp ⇒ equals `stencil(level2)`), then
  `removeTopLevel()` and assert an exact return to the pre-grow store checksum.
- **Integration** (`tests/integration/sculptcore_multires.test.ts` +
  `litemesh_multirestest_support.ts`): extend `__multiresTest` to grow a level,
  run a DRAW dab on the new finest level, undo the op through the real toolstack,
  and assert the wasm↔native position-checksum parity + exact undo residual.

## Files touched

Engine: `sculptcore/source/subdiv/grids.h`, `grids.cc`,
`sculptcore/source/subdiv/multires.h`, `multires.cc`,
`sculptcore/tests/test_multires_addlevel.cc`,
`sculptcore/tests/CMakeLists.txt`.
Generated (by build): `sculptcore/typescript/sculptcore/subdiv/Multires.ts`.
App: `scripts/lite-mesh/litemesh.ts`, `scripts/lite-mesh/litemesh_ops.ts`,
`scripts/lite-mesh/litemesh_multirestest_support.ts`,
`tests/integration/sculptcore_multires.test.ts`.

## Effort / risk

- **~½–1 day.** The engine change is small and reuses existing deterministic
  primitives (`refine` + `store.addLevel` + `invalidateAll`); the only genuinely
  new C++ code is `dropTopLevel` and the two `Multires` methods.
- **Main risk**: the VDM-attached interaction — mitigated by refusing the op when
  `hasVdm`. Secondary: confirming `refine()` re-emits levels `1..N`
  bit-identically so preserved displacement still aligns (the C++ ctest gates
  this).
- **Rebuild cost**: touching `multires.h` triggers a sculptcore rebuild of both
  the wasm and node targets plus the TS binding regen — budget build time.
```
