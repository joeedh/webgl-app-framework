# Brush system (TS ↔ sculptcore)

Sculpt brushes run across two layers. The **TS bridge** turns the UI's
`SculptBrush` + a pointer stroke into calls on the **C++ sculptcore engine**,
which owns the actual per-vertex math. The engine runs behind the
backend-agnostic `IWasmInterface` (WASM in the browser, native N-API in
Electron — see [native-napi-electron.md](native-napi-electron.md)).

The realtime sculpt path is **CPU** (`CommandExecutor`). The WGSL/GPU brush
kernels exist for a future GPU stroke dispatch and for the `sbrush-verify`
CPU-vs-GPU parity gate; the app does not use them.

## Files

| File | Purpose |
|---|---|
| `scripts/editors/view3d/tools/sculptcore_ops.ts` | `SculptPaintOp` — the modal stroke op. Per dab: ray-cast, filter nodes, push device inputs, run the brush program, regen. |
| `scripts/editors/view3d/tools/sculptcore_bindings.ts` | The bridge: `builSculptcoreBrush` (sync props + construct executor), `buildBrushProgram` (autosmooth), `configureToolUniforms` (plane/falloff), `configureBrushDynamics` / `pushBrushDeviceInputs` (pen), `TOOL_TO_SCULPTBRUSH`. |
| `sculptcore/source/brush/brush.h` | `Brush` — cached scalar fields the kernels read, plus the `props` (`StructProp`) authored layer and `deviceInputCtx`. `falloffDist`/`falloffEval`. |
| `sculptcore/source/brush/brush_executor.h` | `CommandExecutor` (`execBrush`, `execProgram`) + `BrushProgram` (the composite command list). |
| `sculptcore/source/brush/brush_command.h` | `CommandCtx` (the `strength(co)` intrinsic, `sampleBrushTex`) + `BrushCommandDef`. |
| `sculptcore/source/brush/kernels/*.sbrush` | Brush kernels in the sbrush DSL → `kernels/generated/*.brush.gen.h` (+ WGSL/SPIR-V/…). |
| `sculptcore/source/brush/brushes/types.h` | The `SculptBrushes` enum (kernel selector), bound + mirrored in TS. |

## Per-dab flow (`on_pointermove_intern`)

1. Ray-cast the mesh → surface point `p` + normal `n`.
2. `getBrush(e)` → `builSculptcoreBrush`: (re)constructs the `Brush` + `CommandExecutor`
   on the first dab, syncs scalar props, runs `configureToolUniforms`, and on a
   fresh brush `configureBrushDynamics`.
3. `mesh.spatial.filterNodes(p, radius, nodes)` — the BVH nodes the dab touches.
4. Set per-dab `strength`/`radius`, `writeProps()`, `pushBrushDeviceInputs`.
5. `buildBrushProgram` → `executor.execProgram(prog, nodes, p, n)`.
6. `mesh.regenTreeBatch()`.

`strength(co)` (the falloff strength kernels start from) is
`brush.strength * falloffEval(t)`, where `t = 1 − min(falloffDist(co −
surfacePos), 1)`. **Radius is _not_ baked into strength** — the `strength`
intrinsic is purely `strength · falloff`, and each kernel multiplies by
`radius` itself only when the displacement should scale with brush size
(`draw`/`inflate`/`pinch` use `… * radius * 0.5`; `smooth`/`sharp`/`mask` are
relative or radius-independent and don't; the `plane` family is naturally
radius-proportional through its `planeoff · radius` plane offset, so it doesn't
multiply again). Because radius is no longer folded into `strength`, there is
**no per-dab pre-scale** anymore — the bridge sets `wasmBrush.strength =
brush.strength` directly (`SculptPaintOp` in `sculptcore_ops.ts`). Net effect:
strokes are considerably stronger than under the old pre-baked path — that is
intentional.

## Tool dispatch

`TOOL_TO_SCULPTBRUSH` maps the TS `SculptTools` enum → `SculptBrushes` kernel.
Wired: DRAW, SMOOTH, BSMOOTH, INFLATE, SHARP, PINCH, MASK_PAINT, COLOR,
POLYGROUP, and the plane family CLAY/SCRAPE/FILL/WING_SCRAPE. Tools with no
equivalent (Grab, Snake, Paint, …) are absent → the op warns and skips the dab.
The base kernels read `strength` (via the `strength` intrinsic) and, where the
displacement should scale with brush size, the `radius` uniform directly
(`draw`/`inflate`/`pinch`; `smooth`/`sharp`/`mask` don't); plane/wing read
extra uniforms (below).

## Invert, mask gating, color

- **Invert** flows TS → C++ as the `invert` bool prop: `getInvertFromEvent`
  (stroke_paint_op.ts) XORs ctrl with `BrushFlags.INVERT`, the bridge sets
  `wasmBrush.invert`, `writeProps()` stores it, and the executor's per-command
  `loadCommonProps` re-reads it (unless a command sets `overrideInvert`, as
  autosmooth's SMOOTH entry does to pin `false`). Bool props go through
  `prop_coerce.h`, which dispatches `Prop::BOOL`/`BoolProp` like the numeric
  types — it didn't originally, which silently reset `invert` to its default
  before every dab. Smooth-family tools ignore invert (`isSmoothTool`).
- **Mask** gates vertex displacement: every displacing kernel scales by
  `(1.0 - v.mask)`. With no mask painted this is an exact `×1.0`, so unmasked
  results are bit-identical. MASK_PAINT paints the mask; inverted MASK_PAINT
  erases it.
- **Color** paint reads the `brushColor` uniform (piped from TS `brush.color`),
  not a hardcoded value.

Default-on `ACCUMULATE` brushes: smooth, bsmooth, paint-smooth, inflate, clay
(see `accumulable` in the kernels / brush defaults in `scripts/brush/brush.ts`).

## Composite brushes / autosmooth (`BrushProgram`)

A `BrushProgram` is an ordered list of sub-commands run over the **same** node
set per dab. Autosmooth is `[mainBrush, SMOOTH]`: each command resolves the
brush's props (with sparse overrides applied), then runs like a standalone
brush. SMOOTH is a second `exec()` whose Jacobi `co_prev` snapshot is re-taken
*after* the main pass mutated positions, so it smooths the result. A future
dyntopo pass is just an entry prepended to `commands` — no API change.

Sparse overrides (`setCommandFloat`) are keyed by an **int `BrushProp` id**, not
a name (see gotchas).

## Falloff

`FalloffKind` (Smoothstep/Linear/Gaussian/Curve) × `FalloffShape`
(Spherical/Cube/Linear/**Box**) are orthogonal. `Box` is an oriented cuboid:
max-norm in an orthonormal frame built from `falloff_dir` (primary axis = stroke
tangent) with per-axis `falloff_extent`. `configureToolUniforms` sets `Box` for
SQUARE-flagged brushes; the executor sets `falloff_dir = strokeDir` per dab so
the cuboid follows the stroke. The CPU `falloffDist` (brush.h) and the WGSL
mirror (`compiler/emit_wgsl.cc` + the `ComputeBrushUniforms` std140 mirror in
`compute_layout.h`) must stay bit-identical.

## Plane brushes (clay family)

`plane.sbrush` serves Clay/Scrape/Fill via two uniforms the bridge sets per tool:
plane point `P = surfacePos + surfaceNo·(planeoff·radius)`, height
`h = dot(v.co − P, surfaceNo)`, move when `h·planeSide < 0`:

- **Clay** — plane above (`planeoff>0`), `planeSide=+1` → pull verts below up (build up).
- **Scrape** — plane below (`planeoff<0`), `planeSide=−1` → pull verts above down (cut).
- **Fill** — plane at surface (`planeoff≈0`), `planeSide=+1` → fill cavities.

`wingscrape.sbrush` has a `host` stage (Rodrigues) computing two wing normals
from `surfaceNo` rotated ±`wingAngle` about `strokeDir`; the vertex stage picks
a wing by the lateral side of the stroke. `strokeDir` is set host-side by the
executor from the previous dab center (needs ≥2 dabs).

## Device (pen) dynamics

Every float prop carries a `Dynamics` stack (`prop_dynamics.h`). Per stroke,
`configureBrushDynamics` translates each TS `BrushDynChannel` (with
`useDynamics`) into a PRESSURE device whose `Curve1D` is baked into a table. Per
dab, `pushBrushDeviceInputs` fills `deviceInputCtx` (only PRESSURE is consumed
today; tilt/twist ride along inert); `loadProps()` threads `&deviceInputCtx`
internally and applies `value = device.apply(value)` (curve(deviceValue) combined
per `BasicMix`). Mouse reads as full pressure.

## Property inheritance (bounded)

`StructDef` has a `parent` pointer; `lookup` falls back to it for unset keys.
`Brush::setPropsParent(StructProp*)` links a child to a category-default brush's
`props` (`resolveStruct`). The C++ infrastructure is in place; the TS category
layer is a hook, not yet wired.

## Binding gotchas (these compile + pass genTS, then fail/no-op at runtime)

- **No JS strings to bound methods.** A `util::string` param can't be marshaled
  from a JS string. Pass an **int id** and map it to a name C++-side (e.g. the
  `BrushProp` enum for `setCommandFloat`/`addPropDynamic`/`setPropDynamicSample`).
- **No assigning `float3`/embedded-struct members from TS** ("Setting embedded
  struct values is not supported"). Set such state C++-side (the executor writes
  `falloff_dir`/`strokeDir`) or use scalars + a setter.
- **`defineBindings` must not reference its own type** (a `Brush*` param on
  `Brush`) — it re-enters `defineBindings` forever and hangs genTS. Take a
  different already-bound type (`setPropsParent(StructProp*)`).
- **SMOOTH needs CSR neighbor mode.** A fresh LiteMesh keeps no live disk links,
  so LiveDisk `for_neighbor` finds nothing and smooth no-ops. The bridge calls
  `executor.setNeighborMode(1)` (CSR `ring1`). Smooth is imperceptible on a
  low-curvature dab — that's correct, not a bug.

## Adding a brush

1. Author `kernels/<name>.sbrush`. New `uniform`/`ctx` fields resolve to
   `ctx.brush.<X>` automatically — add the field to `Brush` (brush.h). New
   `CommandCtxBase` builtins would need a 3-site compiler edit; avoid by putting
   stroke state on `Brush` (e.g. `strokeDir`).
2. `node sculptcore/make.mjs codegen` (builds `sbrushc`, regenerates + commits
   `kernels/generated/<name>.brush.gen.h` and the GPU backends).
3. `#include` it in `brushes/all.h`; add an enum entry to **both** lists in
   `brushes/types.h`; add a `createCommand` case in `brush_executor.h`.
4. Map the TS tool in `TOOL_TO_SCULPTBRUSH`; set any per-tool uniforms in
   `configureToolUniforms`.

## Build / verify

- WASM (+ regenerates the TS binding interfaces via genTS): `node make.mjs build wasm`.
- Native N-API addon: `node make.mjs node`. App bundle: `pnpm build` (repo root).
- Typecheck: `npx tsgo --noEmit` (baseline 106 errors).
- Cross-backend: `node make.mjs sbrush-validate wgsl` (each kernel compiles to
  valid WGSL) and `node make.mjs sbrush-verify` (CPU vs GPU bit-identical;
  `--regen` rewrites `sculptcore/tests/golden/` after a deliberate behavior
  change). On Windows the verify reconfigure needs `tint` — `configureEnv.mjs`
  rebuilds PATH from vcvars, so point `SBRUSH_TOOL_PATH` at the tint dir (e.g.
  `SBRUSH_TOOL_PATH='C:\dev\tint'`). The `smooth`/`smooth_csr`
  `/spatial/leaf_count` cpp-vs-wgsl mismatch (7 vs 8) is pre-existing,
  unrelated to brushes.
- Behavior (end-to-end, both backends): `tests/integration/sculptcore_brushes.test.ts`
  boots the Electron harness with `--eval "__brushTest()"`
  (`scripts/lite-mesh/litemesh_brushtest_support.ts`) and asserts invert
  direction, draw-sharp boundedness, mask gating + inverted-mask erase,
  brush.color piping, accumulate defaults, and no NaN/Inf. The driver reads
  GPU buffers by concatenating **all** same-named per-batch buffers, and runs
  a zero-strength warmup stroke first (the first stroke re-batches and changes
  buffer totals).
- A C++ binding change requires rebuilding **both** WASM (for genTS) and native.
