# Failing-tests investigation — 2026-07-16

Full sweep of every test suite in the repo (jest `tests/`, workspace suites,
sculptcore native ctest), with root-cause analysis of each failure. State:
master `c67fe667` / sculptcore `ceecfac` (+ trivial uncommitted mods:
`brushWgsl.ts` codegen artifact, litestl generated test TS).

## Suite status overview

| Suite | Result |
|---|---|
| sculptcore native ctest | **98/101 — 3 fail** (`test_debug_script`, `test_dyntopo_multistep_gpu`, `test_spatial_update_split`) |
| `sculptcore/source/litestl/tests` (binding snapshot) | **FAIL** — stale snapshot |
| `tests/` jest (integration + unit) | see below (run in progress at time of writing) |
| `scripts/mathl` jest | pass (2/2) |
| `scripts/path.ux` vitest | pass (114/114) |
| `vendor/nstructjs` vitest | pass (47/47) |
| `sculptcore/tests` wasmTest | pass |

Note: full `pnpm test` (turbo) aborts at the litestl snapshot failure before
the main jest suite runs — the suites above were run individually.

## sculptcore ctest failures

### 1. `test_debug_script` — two stale assertions after intentional brush redesigns

Failure output: `maxZ < 0.25f + 1e-4f failed` (sharp section) and
`smoothedZ < spikeZ - 1e-3f failed` (smooth section).

**Sharp section** (`tests/test_debug_script.cc:269`): asserts the sharp brush
produces *tangent-only* motion (`+Z` face must not rise above 0.25). But the
current `sharp.sbrush` kernel *deliberately* displaces along the surface
normal first — `v.co += surfaceNo * s * radius * 0.5` ("so the sharp brush
actually displaces the surface", added in sc `229d442`, 2026-06-15,
"ImmediateTODOs: brush fixes"). The test was last touched 2026-06-01 and never
updated for the redesign. **Stale test, not an engine bug.**

**Smooth section** (`tests/test_debug_script.cc:347`): drives smooth at
`strength=10.0` and asserts the spike shrinks. The test's own comment still
documents the old scaling: "The smooth kernel lerps by
s = strength*falloff*radius*0.1". That `* radius * 0.1` damping was removed
from `CommandCtx::strength()` in sc `c59795a` (2026-05-29, "remove radius
pre-baking into brush strength"). Effective lerp factor went from ~0.15
(stable) to ~10 (divergent): `v.co += (mean - v.co) * s` with `s>1`
overshoots and oscillates. Verified with debug_app: inflate spike z=0.304;
after 3 smooth strokes at strength=10 the "smoothed" max z is **0.580** (the
spike *grows*); at strength=1.0 it correctly shrinks to 0.269. **Stale test
values.** (Side observation: the smooth kernel has no stability clamp — a
user-driven strength > 1 physically explodes geometry; worth clamping
`s` to ≤1 in the kernel regardless of the test fix.)

Fix direction: rewrite the sharp section's expectation (normal displacement
is now intended; e.g. assert the pinch-toward-axis behavior instead of the
z-cap), and drive the smooth section at strength ≤ 1 (updating its comment).

### 2. `test_dyntopo_multistep_gpu` — documented KNOWN OPEN engine bug

Output: forward steps 2 and 3 report `gpu-mesh mismatch=6`
(`gpuUnique=3182` vs `v=3176`); every undo/redo checkpoint is clean.

The test's own header documents exactly this: "**KNOWN OPEN FAILURE**: after
enough dyntopo churn the FORWARD pass draws a handful of phantom corners
(positions matching no live vert; a full forced leaf regen does NOT clear
them, so dead elements linger in some leaf's sets rather than the upload
being stale). Undo/redo rebuilds are clean." It is a deliberately-failing
gate on an open bug: dead elements lingering in leaf `unique_verts`/sets
after dyntopo churn. The engine bug is real but known; the test fails by
design until it's fixed.

### 3. `test_spatial_update_split` — normals-timing parity broken by the deferred-normals change

Output: `tests/test_spatial_update_split.cc:312: freshA == freshB failed`.

The test runs world A (per-dab full `update(&gpu)` — the old cadence) against
world B (per-dab `updateQueries()` + per-checkpoint flush — the split world)
and requires byte-identical GPU staging after a forced from-scratch refill of
both. Everything else passes: sorted mesh positions identical, draw-command
multisets identical, B's flushed state == B's fresh refill.

**Verified experimentally**: excluding only the `nor` stream from the blob
comparison makes the test pass (temporary edit, reverted). So the divergence
is *normals-only*, in the CPU-side `v.no` themselves (a forced refill
re-copies from mesh normals).

Root cause: sc `ceecfac` ("stroke/dyntopo perf: deferred normals ...") moved
leaf-normal refresh out of the queries half into its own `Update_Normals`
phase that only the per-frame `update()` runs. World A now refreshes normals
*per dab* (mid-stroke positions); if a later dab moves neighboring geometry
without re-flagging a leaf (cross-leaf face-normal dependency), A keeps
mid-stroke-stale normals that the final checkpoint update never recomputes.
World B computes all its normals once, at the checkpoint, from final
positions — strictly fresher. Positions converge; normals timing does not,
so the A-vs-B byte gate can no longer hold by construction.

Fix direction: this is a test-premise casualty of an intentional perf change.
Either align the worlds' normal cadence in the test (run A with the same
deferred-normals contract) or exclude the normal stream from the cross-world
byte gate (keep it for B-vs-fresh-B, which still passes and is the gate that
protects the shipped path). If exact cross-cadence normal parity is actually
desired, the engine would need to re-flag leaves whose *border* normals
depend on moved neighbors — the pre-split code had the same staleness, it was
just symmetric.

## litestl binding-snapshot failure

`sculptcore/source/litestl/tests` (`npx tsx test_binding_system.ts`):
snapshot `wasm types` differs. The recorded snapshot
(`test_binding_system__snapshots.json`) lists 9 registered types; the live
registry now has ~32 (all the primitive `Vector<T>` instantiations,
`int` → `int32` renames, `pointer` / `reference` / `void`, and `T` — which is
intentional: a `ParentTemplateParam("T", ...)` registered for generic
`Vector<T>` bindings, `binding/binding.h:60`). **Stale snapshot** — the
binding registry has grown over months of work and the snapshot was never
regenerated. Fix: eyeball the new list, then
`npx tsx test_binding_system.ts -u` (the SnapShotManager honors
`-u`/`--update-snapshots`). Note this failure **aborts the whole turbo
`pnpm test` run** before the main jest workspace executes.

## Main jest suite (`tests/`)

Serial run (`--runInBand`, 24.5 min): **4 suites / 16 tests failed, 409
passed, 1 suite + 6 tests skipped.**

### 1. `sculptcore_gpu_brush` (6/16) — REAL APP REGRESSION: GPU brush path dead since the cavity-automasking merge

Failing asserts: `stats.dispatches > 0`, `gpuResident`, §9.2 fixture
undefined — on both backends. Live rerun of the harness with
`--enable-logging=stderr` captured the decline reason the jest harness
swallows:

```
[gpu-brush] kernel 'kelvinlet' wants unsupported binding 24
[gpu-brush] begin failed; stroke falls back to CPU-applied finish
```

Root cause: the cavity-automasking merge (sc `a00e532`, 2026-07-15) added
`@group(0) @binding(24) var<storage, read> automask: array<f32>` to every
generated WGSL kernel (`sculptcore/typescript/sculptcore/brush/brushWgsl.ts`),
but the TS global-brush dispatcher's binding allowlist
(`scripts/webgpu/brush_compute.ts:346` — "0-13 + 22/23") was never extended.
`GpuBrushStroke.begin()` therefore rejects **every** kernel (kelvinlet *and*
grab) and the stroke falls back to CPU. This is not test-only: the shipped
GPU-brush fast path (`sculptcore.gpu_brush`, default ON) has been silently
inert in the real app since that merge — parity/undo/shadow gates pass
vacuously (CPU vs CPU); only the dispatch-count assertions caught it.
The C++/debug_app WGSL side got the matching identity-1.0 automask upload
(binding 24); the TS dispatcher was the missed consumer.

**FIXED 2026-07-16** (same session, working tree): the marshaling already
existed end-to-end (C-API `packAutomask` identity-1.0, `GpuBrushData.AUTOMASK`,
the binding-24 upload in `begin()`, generic `buildBindGroup`) — only the
allowlist gate was missed. Changes: (1) exempt binding 24 in
`brush_compute.ts`; (2) `gpucontext.ts` requests
`maxStorageBuffersPerShaderStage` up to 16 (kelvinlet now binds 9 storage
buffers, over the spec default 8 — this was the next failure after the gate);
(3) fixture capture carries `automask` bytes and `replay.mjs` binds 24
(identity fallback for old fixtures). Gate: `sculptcore_gpu_brush` **16/16**
both backends (was 10/16) incl. §9.2 Dawn replay; live harness shows
dispatches 14, gpuResident, shadowDivergences 0, scatter self-check clean.

### 2. `sculptcore_stroke_tester` (4/10, both backends) — insensitive test metric, pipeline healthy

Failing asserts: bbox-sum delta after a clay stroke `> 1e-4` (got exactly 0)
and the dependent undo/redo comparison. Live instrumentation of the exact
harness scenario shows the *entire screen-space op path works*:

- every per-dab raycast hits the surface;
- `wasmExec.applyDab` receives sane args (world radius ≈ 1.08, strength 1,
  centers on-surface, 6 calls = 3 dabs × X-mirror);
- meshlog captures 192 KB of undo rows;
- swapping the brush in the same scenario: **draw** moves the bbox sum by
  0.57, **inflate** by 1.48, undo restores both exactly.

Only **clay** yields exactly 0: clay is the plane kernel (`plane.sbrush`)
with `planeoff = 0.05·radius` — a ~0.054-unit build-up toward a view-facing
plane, applied on the *rounded corner* region of the subdiv-48 cube where
the camera-center ray lands. The displaced verts stay strictly inside the
axis-aligned bbox hull (the extreme points are the face-center bulges,
outside the dab region), so the bbox-diagonal metric cannot see the
deformation. The metric+scene+brush combination went blind, most plausibly
when the old always-push `clay.sbrush` was replaced by the plane-projection
clay (June 2026, "brush behavior fixes" era) — not an op-path regression.

Fix direction: drive the tester with draw/inflate (bbox-sensitive) or gate
on a real displacement metric (e.g. max |Δco| / vertex-position checksum)
instead of the bounding box.

### 3. `install_flow` (1 test) — Windows-only vfs-plugin path bug (never previously reached on this machine)

`source-mode transpiles via esbuild-wasm`:
`addon vfs: cannot resolve "./helper" from "C:\dev\webgl-app-framework\tests\src\main.ts"`.
Under Node-on-Windows, esbuild reports the stdin importer as an OS absolute
path with backslashes; the vfs plugin (`scripts/addon/transpile.ts`)
derives `importerDir` with `importer.replace(/[^/]+$/, '')`, which assumes
POSIX separators — with a backslash path the regex consumes the whole
string, so `./helper` resolves to `helper.ts` instead of `src/helper.ts`
(not in the vfs map). Code and esbuild-wasm version (0.28.0) unchanged
since 2026-05-20; full jest runs on this machine have been wedging before
reaching this suite, so it went unnoticed. The production (browser/NW)
path uses POSIX-style virtual paths and is likely unaffected.

Fix direction: normalize `args.importer` separators (and strip any absolute
prefix down to the vfs key, e.g. suffix-match against `sources`) before the
string surgery.

### 4. `sculptcore_autosave` (native, 5 tests) — environmental flake, passes in isolation

`native dump not written` — the NW boot exceeded the 120 s `execFileSync`
timeout while this investigation's parallel C++ rebuild/ctest runs were
loading the machine. Rerun in isolation: **10/10 pass, 70 s**. Not a
regression.

## Summary table

| Failure | Class | Action |
|---|---|---|
| ctest `test_debug_script` | stale test (sharp redesign + strength-scale change) | update test values/expectations |
| ctest `test_dyntopo_multistep_gpu` | known open engine bug (phantom GPU corners after dyntopo churn) | engine fix eventually; test is the tracking gate |
| ctest `test_spatial_update_split` | test premise broken by intentional deferred-normals change | align cadence or exclude `nor` from the A-vs-B byte gate |
| litestl binding snapshot | stale snapshot (registry grew) | regenerate with `-u`; unblocks turbo `pnpm test` |
| jest `sculptcore_gpu_brush` | **real regression** — binding 24 (automask) unsupported by TS dispatcher; GPU brushes silently CPU-fallback in app | extend `brush_compute.ts` allowlist + identity automask upload |
| jest `sculptcore_stroke_tester` | insensitive metric (clay-on-rounded-corner invisible to bbox) | use draw/inflate or displacement metric |
| jest `install_flow` | Windows path-separator bug in addon vfs plugin | normalize importer path |
| jest `sculptcore_autosave` | flake under machine load (120 s timeout) | none / raise timeout |
