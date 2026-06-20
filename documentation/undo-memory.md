# Undo memory accounting & limit

How the app bounds undo-history memory, including sculpt steps whose
undo data lives in C++ (sculptcore's `MeshLog`), and how the limit is
exposed in the Settings editor.

<!-- toc -->

- [Settings](#settings)
- [Enforcement path](#enforcement-path)
- [Sculpt ops: the C++ seam](#sculpt-ops-the-c-seam)
- [MeshLog accounting API](#meshlog-accounting-api)
- [Testing](#testing)

<!-- tocstop -->

## Settings

`AppSettings` (`scripts/core/settings.ts`) owns two persisted fields:

- `limitUndoMem` (bool, default on) — whether the limit is enforced.
- `undoMemLimit` (int, **megabytes**, default 512) — the cap.

Both are in the data-API (`settings.limitUndoMem` / `settings.undoMemLimit`)
and surfaced on the Settings editor's **General** tab
(`scripts/editors/settings/SettingsEditor.ts`).

## Enforcement path

`AppToolStack` (`scripts/core/toolstack.js`) syncs and enforces on every
`execTool` / `undo` / `redo`:

1. `_syncSettings(ctx)` copies the settings onto the stack
   (`enforceMemLimit`, `memLimit` — converted MB → bytes).
2. When enforcing, `limitMemory(memLimit, ctx)` (path.ux
   `ToolStack.limitMemory`, `scripts/path.ux/.../toolsys.ts`) sums each
   op's `calcUndoMem(ctx)` from newest to oldest and drops the oldest
   ops past the budget (always keeping the newest three). Dropped ops
   get `onUndoDestroy()` so they can release out-of-band undo storage.

## Sculpt ops: the C++ seam

`SculptPaintOp` (`scripts/editors/view3d/tools/sculptcore_ops.ts`) keeps
its undo data in the shared sculptcore `MeshLog`, not in JS. Each op:

- captures `logStepId = meshLog.lastStepId()` right after
  `meshLog.beginStep()` in `undoPre`;
- reports `calcUndoMem = meshLog.stepMemSize(logStepId)` so the stack's
  budget sees the real C++ cost (0 when it owns no step);
- frees the step from `onUndoDestroy()` via `meshLog.freeStep(logStepId)`
  when the stack trims it.

`freeStep` only frees steps strictly behind the MeshLog cursor, so
pending-redo entries can never be evicted; a new stroke after undos
truncates the redo branch on the C++ side (`beginStep` discards future
entries), which is why redo ops dropped by the JS stack don't need to —
and must not — free anything.

## MeshLog accounting API

Bound surface (see `sculptcore/documentation/meshlog.md`):
`lastStepId()`, `stepMemSize(id)`, `totalMemSize()`, `entryCount()`,
`freeStep(id)`. Sizes are estimated retained heap bytes per step
(attribute snapshot bodies dominate; topo chunks count begin/end
bodies).

## Testing

`tests/integration/sculptcore_undomem.test.ts` drives the whole seam on
both backends (wasm + native) through the headless NW.js harness:
`scripts/lite-mesh/litemesh_undomem_support.ts` registers
`globalThis.__undoMemTest`, run via `--eval` and reflected into the
`--dump` JSON as `undomemtest`. It covers per-step accounting (incl. a
dyntopo stroke so topo chunks are measured), `calcUndoMem` parity,
redo-branch truncation, the real `limitMemory` trim freeing C++ steps,
`freeStep` guards, and post-trim undo/redo alignment. The C++-level
regression test for undoing a non-newest dyntopo step on a frozen mesh
is `sculptcore/tests/test_dyntopo_undo_nonnewest.cc`.
