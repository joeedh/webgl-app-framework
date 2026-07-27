# Unbounded brush fields, `masks()` decomposition, and untangling `@global`

> Status: planned 2026-07-27. Supersedes the `@global` brush attribute
> introduced alongside [`nonAccumMode`](../../sculptcore/documentation/plans/nonAccumMode.md)
> §3. Builds on the displacement base
> ([`2026-07-26-0909-brush-displacement-base-attribute.md`](2026-07-26-0909-brush-displacement-base-attribute.md)).

## Problem

Removing the `strength(v.co)` multiply from `kelvinlet.sbrush` produces tearing
along spatial-node seams. Investigating that surfaced three separate design
faults that all hide behind the single `@global` tag.

### 1. `@global` claims something nothing implements

`@global` has exactly one effect in codegen — `accumulable = false`:

- `compiler/emit_cpp.cc:1605` — `def.accumulable = (!isGlobal && !isPaint)`
- `compiler/emit_wgsl.cc:205` — same, plus `!isRelaxation`

Yet `gpu_marshal.h:44` documents it as *"routinely touches the whole mesh"*, and
`GPUBRUSH_INFO_IS_GLOBAL` is plumbed out through the C API
(`gpu_brush_c_api.cc:132`). **No region-selection code reads it.** The only TS
reference is the enum constant (`typescript/api/wasm.ts:225`).

The region is chosen host-side and is radius-compact
(`scripts/editors/view3d/tools/sculptcore_ops.ts:611-633`):

```ts
let filterRadius = radius
...
filterRadius = radius + ps.anchorVec.vectorLength()   // grab/kelvinlet: widen by drag
```

Kelvinlet's field has **unbounded support** — it decays as `1/e` with
`e = sqrt(r² + radius²)` and never reaches zero. `strength(v.co)` was the only
thing forcing it to zero at `r = radius`, which is what made the compact filter
legitimate. Remove it and boundary verts displace while their neighbours one
leaf over aren't in `nodes` at all → C0 rip on the leaf seam. `pose` is
`@global` too but still multiplies by `strength(v.co)` (`pose.sbrush:37`), which
is why it never showed this.

### 2. `strength()` bundles five unrelated things

`brush_command.h:219`, mirrored bit-for-bit by `brush_strength` in the WGSL
emitter (`emit_wgsl.cc:1013`) and `brushWgsl.ts:131`:

```cpp
float strength(float3 co, int v) {
  float t = 1.0f - std::min(brush.falloffDist(co - surfacePos, surfaceNo), 1.0f);
  float s = brush.strength * brush.falloffEval(t);                                  // slider × SPATIAL FALLOFF
  if (automaskEnabled && automaskFactor && v >= 0) { s *= (*automaskFactor)[v]; }    // cavity etc.
  if (viewNormal.enabled && v >= 0 && m)          { s *= viewNormalFactor(...); }    // view-normal mask
  return brush.invert ? -s : s;                                                      // invert
}
```

It is the *only* route to automasking, the view-normal mask, the strength
slider, and invert. So dropping it from a kernel to shed the falloff also
silently disables the other four — which is the live state of the working-tree
kelvinlet change.

### 3. Accumulability is a per-variant property stored per-kernel-file

Some kelvinlet variants **are** accumulable. The affine kelvinlets (scale /
twist / pinch, de Goes & James §4) dragged along a path stack dab-on-dab exactly
like a draw brush. Only the *anchored grab* kelvinlet is inherently
non-accumulating, and that is a **stroke-mode** property, not a field property:
non-accumulate mode only needs the kernel to be a pure function of
`(base surface, dab params)`, which an unbounded analytic field satisfies.

For kelvinlet today `accumulable = false` has one live effect —
`gpu_marshal.cc:102` forces `out.nonaccum = 0`. On CPU it is dead:
`createCommand` (`brush_executor.h:516`) only consults `accumulable` in the
`else` branch, which kelvinlet never reaches because `isGrabBrush()`
short-circuits to `AccumOrigGrab` first. So `@global` is not even what makes
grab-kelvinlet non-accumulating — `isGrabBrush()` is.

That classification lives in three hardcoded, mutually inconsistent places:

| Source | Membership |
|---|---|
| `brush_executor.h:495` `isGrabBrush()` | GRAB, KELVINLET |
| `sculptcore_bindings.ts:170` `isGrabTool()` | KELVINLET, GRAB, **SNAKE** |
| `pbvh_base.ts:1222` (local) | GRAB, **SNAKE** — no KELVINLET |

plus the codegen derivation and the per-tool `kGpuKernels` table in
`gpu_marshal.cc`. A twist-kelvinlet has nowhere to say "I'm a kelvinlet but I'm
not anchored".

## Design

Three orthogonal properties, three independent mechanisms. None implies another.

### A. `masks()` / `automasks()` — decompose `strength()`

Split the five factors along the axis that actually matters — *spatial and
scalar* vs *per-vertex masking*:

```
strength(co)  = brush.strength × falloff(co) × invert-sign     (was: × automask × viewNormal)
automasks()  = automask[v] × viewNormalFactor(v)
masks()      = automasks() × (1.0 - v.mask)
```

`masks()` folds in the painted mask so the common kernel form is a single
multiply. `automasks()` exists for the one kernel that needs the automatic
masks without the painted one.

Neither takes a position argument — no surviving factor depends on `co`. The
absent `float3` is itself the guard: a spatial term would need one, so the
signature cannot silently regrow a falloff.

Both are legal in any kernel, not just unbounded ones — `masks()` is useful to
anything doing its own spatial shaping (`pinch.sbrush:13` already multiplies
`strength(v.co)` by its own `pinch` term).

### B. `@unbounded` — support, region, falloff

Replaces `@global` for kelvinlet. Purely about extent; **says nothing about
accumulation**.

- Codegen makes `strength(...)` a **compile error** in an `@unbounded` kernel.
  `masks()` / `automasks()` remain available, so the tag only adds a
  prohibition — it does not create a dialect.
- `radius` is documented as the regularization ε (a shape parameter), never an
  extent.
- The host derives a cutoff `R` — the radius at which displacement drops below
  a visibility epsilon, closed-form given `grabTo`, `radius` and `(a-b)` — and
  passes it as `filterRadius`. Codegen emits a C1 window over `[0.8R, R]` so
  support becomes compact and provably tear-free while the field shape inside
  the useful range is untouched.

Whole-mesh region was considered and rejected: honest, and the GPU path already
anticipates it (`gpu_brush_c_api.cc:180` has a `sameNodes` fast path commented
for "an anchored whole-mesh brush [whose node set] saturates after the first
dabs"), but the CPU path at 5M tris is untenable per dab.

**`R` must be latched monotonically non-decreasing over the stroke.** It derives
from `|grabTo|`, which shrinks when the user drags back toward the anchor. If
`R` shrinks, verts between the new and old `R` fall out of the region still
holding the last dab's displacement, and from-base re-derivation never zeroes
them — a frozen ring rather than a seam. `R = max(R, R_dab)` costs nothing, and
the existing `filterRadius = radius + anchorVec.length()` widening already
assumes region growth.

### C. Accumulability moves off the kernel and onto the stroke mode

- Delete `!isGlobal` from `emit_cpp.cc:1605` / `emit_wgsl.cc:205`. `accumulable`
  becomes the default; `@paint` and `@relaxation` still force it off (they write
  attributes / read the live surface by definition, so from-base re-derivation
  is meaningless). `@global` disappears as a codegen input entirely.
- Derive `grabMode` from the tool's `strokeMethod` rather than a tool list:
  `ANCHORED` → `AccumOrigGrab` + fixed region; `PATH` → the normal
  `AccumLive`/`AccumOrig` policy honoring the nonaccum flag. This is already the
  real distinction — it is why snakehook is commented as "intentionally
  excluded" from `isGrabBrush()` (it is `PATH`) — and it collapses all three
  inconsistent lists into the one value the host already owns
  (`sculptcore_ops.ts:311`).

One `kelvinlet.sbrush` plus a `variant` uniform (grab / scale / twist / pinch)
then serves every variant, with per-tool rows in `kGpuKernels` carrying the
differences — the precedent `plane.sbrush` already sets for CLAY/SCRAPE/FILL.

### Scalars need no new machinery

`emit_wgsl.cc:705` (and the CUDA/OpenCL twins at 686/425) already re-bind DSL
fields named `strength`, `invert`, `radius`, `spacing`, … to the fixed
`BrushUniforms` slot instead of emitting a new one. That is the trick
`kelvinlet.sbrush` already uses for `radius`. So an unbounded kernel folds the
amplitude in its `host` stage, or declares `uniform float strength;` directly.

## Waves

### Wave 1 — `masks()` / `automasks()` decomposition (behavior-preserving) — **DONE**

1. `brush_command.h`: split `CommandCtx::strength` into `strength` (falloff ×
   slider × invert), `automasks()`, `masks()`.
2. `kernels/ir/intrinsics.cc`: two new entries with per-backend patterns.
   CUDA/OpenCL have no automask yet — their patterns return the paint-mask term
   only, matching the existing 1-arg `brush_strength` degradation.
3. `emit_wgsl.cc`: emit `brush_automasks(vid)` / `brush_masks(vid, mask)`
   helpers alongside `brush_strength`; drop the mask factors from
   `brush_strength`. Keep bit-parity with `brush_command.h` (they are hand-synced
   — see the comment at `emit_wgsl.cc:1012`).
4. Port the kernels:
   - 18 × `strength(v.co) * (1.0 - v.mask)` → `strength(v.co) * masks()`
     (`bsmooth`, `color`, `colorsmooth`, `draw`, `enhance`, `featurealign`,
     `grab`, `graddraw`, `inflate`, `layerdraw`, `pinch`, `plane`, `pose`,
     `sharp`, `smooth`, `snakehook`, `texdraw`, `wingscrape`)
   - `mask.sbrush:8` → `strength(v.co) * automasks()` (**not** `masks()` — a
     self-limiting mask brush asymptotes and can never paint to 1.0)
   - `polygroup.sbrush:16` → unchanged (face stage; both mask factors are
     already identity there)
5. Regenerate `kernels/generated/*.gen.h` + `typescript/sculptcore/brush/brushWgsl.ts`.
   **Rebuild `sbrushc` first** — codegen reuses an existing binary and will
   silently emit stale output otherwise.

Gate: every existing brush test passes unchanged, and the GPU shadow-verify
(`sculptcore.gpu_brush_verify`) stays bit-exact. This wave must not change a
single pixel.

**Result (2026-07-27).** Gate met.

- `masks()` / `automasks()` are argument-free in the DSL. Both hidden operands
  ride in on emitter placeholders: `$v` (vertex index, already existed) and a
  new `$vm` (the kernel's *live* local painted mask). Threading the live local
  rather than re-reading storage was forced by `mask` living on
  `SpatialTreeMesh`, not `mesh::Mesh` — and it removes the write-aliasing
  caveat for kernels that assign `v.mask`. `$vm` must be matched **before**
  `$v` in every emitter's placeholder loop.
- CUDA/OpenCL already had the decomposed spatial-only `brush_strength`, so this
  change brought CPU/WGSL into line with what those two backends did all along.
- `sbrush-verify`: 22 brushes fail `cpp vs golden` **on clean HEAD too** — the
  goldens are stale (spatial leaf ids / `unique_verts` / aabb drift). Diffing
  the two runs, exactly one brush's diff changed: `kelvinlet`, the deliberate
  exception. The other 21 are byte-identical to baseline. No `cpp vs wgsl`
  mismatch anywhere.
- `make.mjs test`: 113/113.
- `tests/integration`: the wasm-leg `§8.2/§8.4 world-space dab parity` failure
  (`worldParityMaxDiff` 1.1542959213256836) is pre-existing — clean HEAD
  reproduces it bit-for-bit. Clean HEAD *also* fails `§9.2 captured app fixture
  replays bit-exact through Dawn` on **both** legs; this change makes that one
  pass. Net: two pre-existing failures fixed, none introduced.
- Stale goldens (`tests/golden/sbrush_ab`) and the `§8.2/§8.4` parity failure
  are both pre-existing and out of scope here — worth a separate pass.

### Wave 2 — `@unbounded` + derived cutoff — **DONE**

Parser/IR tag, the `strength()` prohibition, the C1 window, host-side `R` with
the monotonic latch, `filterRadius` wiring on both CPU and GPU paths. Kelvinlet
moves `@global` → `@unbounded` and drops to
`disp * masks()` with the amplitude folded host-side.

Gate: kelvinlet with no `strength()` multiply shows no seam at any drag length,
including drag-reversal; automask/view-normal/invert all demonstrably still act
on it.

#### Result (2026-07-27)

**The cutoff is a constant multiple of `radius`, not a function of `grabTo`.**
After the `radius/(a-b)` normalizer the kelvinlet magnitude simplifies to
`|disp| ≈ |grabTo| · radius / sqrt(r² + radius²)`. An *absolute* visibility
epsilon gives `R = radius · sqrt((|grabTo|/eps)² - 1)` — ≈200·radius for eps at
0.5% of radius, i.e. whole-mesh. A *relative* epsilon (fraction of the pull)
gives `R = radius · sqrt(1/eps_rel² - 1)`, which `grabTo` cancels out of
entirely. So `R` is `radius × k` with `k` a plain quality knob, and only
`filterRadius = R + |grabTo|` still moves with the drag (the region must cover
where the verts land, not just where they start). The monotonic latch is still
required for that term.

`k` ships as `Brush::unboundedExtent` (default 8.0, bound so TS reads it rather
than duplicating the constant) and rides to the GPU in what used to be
`falloff_dir`'s std140 tail pad at offset 44 — so `falloff_extent` stays at 48
and **no other kernel's uniform layout moves**. `packBrushUniforms` sets it for
KELVINLET only; 0 means "no window", which is every other brush.

**The C1 window is a DSL intrinsic, not emitter-injected code.** The plan said
codegen would wrap the vertex stage. Doing that means entry-snapshot /
exit-lerp surgery in six emitters; `unbounded_window(co)` instead costs one
`intrinsics.cc` row plus one helper per backend — the exact shape `strength()`
and `masks()` already use — and the guarantee is recovered by enforcement
rather than by generation: the parser errors if an `@unbounded` brush omits it,
if a non-`@unbounded` brush calls it, or if an `@unbounded` brush calls
`strength()`. All three verified against throwaway kernels.

`@unbounded` also implies non-accumulable (both emitters), so kelvinlet drops
`@global` outright rather than carrying both tags. `gpu_marshal.cc`'s
hand-written `.isGlobal = true` row is a *separate* GPU dispatch hint and was
deliberately left alone — Wave 3 unifies those lists.

Verification: 113/113 ctest. `sbrush-verify` — **0 `cpp vs wgsl` mismatches**,
which is the gate that matters here (the CPU and GPU legs agree on the new
windowed field). The same 22 stale-golden failures as the Wave 1 baseline
remain; kelvinlet's golden diff is now large, as it must be — dropping the
falloff is the intended behavior change. `npx tsgo --noEmit`: the same 11
pre-existing errors, none new. `pnpm test` matches the Wave 1 baseline exactly —
native 14 suites / 131 tests, 0 failed; wasm 15 passed / 1 failed, and that one
is the pre-existing `sculptcore_gpu_brush` `§8.2/§8.4 world-space dab parity`
with a bit-identical `worldParityMaxDiff` of 1.1542959213256836 (a Wave 1 A/B
already showed it is independent of the kelvinlet kernel body).

**Still unverified: the behavioral half of the gate.** "No seam at any drag
length, including drag-reversal" has only been argued from the code — the field
is C1-zero at `R` and the host filters to `R + drag` with a monotonic latch — not
observed on a stroke. It needs a headless or CDP stroke check
(`documentation/debugStrokeGuide.md`, `nwjs/cdp.mjs`) before this is called done.

One consequence worth stating plainly: for kelvinlet the node-filter radius grows
from `radius` to `radius * unboundedExtent` (default 8), so the per-dab region is
up to ~64× the area it was. That is the *correct* region — the field really is
live out there — but `unboundedExtent` is the perf knob if it bites, and the
per-dab cost has not been measured.

### Wave 3 — accumulability + stroke-derived `grabMode` — **DONE**

Drop `!isGlobal` from both emitters, delete `@global` from the parser, derive
`grabMode` from the stroke rather than a tool list, unify the three tool lists.

Gate: grab and kelvinlet stroke identically to today; snakehook unchanged; a
`PATH`-mode kelvinlet variant honors the non-accumulate flag.

#### Result (2026-07-27)

`@global` is gone end to end — parser, `ir.h`, both emitters, `pose.sbrush` (its
last user), `GpuKernelInfo::isGlobal`, `GPUBRUSH_INFO_IS_GLOBAL`, and the
`GpuBrushInfo.IS_GLOBAL` TS mirror. The C-API enumerator was deleted rather than
renumbered, leaving 7 as a documented hole so nothing downstream shifts.
`accumulable` is now `!isPaint && !isUnbounded`; the only live consequence is
that `pose` becomes non-accumulate-eligible, which is correct (it is a pure
function of base + cage) and unobservable today since POSE has no entry in
`TOOL_TO_SCULPTBRUSH`.

**`grabMode` is a conjunction, not a derivation.** The plan said "derive
`grabMode` from `strokeMethod`", but the engine has no stroke-method concept and
should not grow one — `StrokeMethod` is a TS enum about input handling. Instead
the decision is split along the seam that already exists:

```
def.grabMode = def.grabModeCapable   // codegen, from @grabmode — CAN it grab?
             && exec.anchoredGrab    // host-set per stroke — DOES this stroke?
```

`@grabmode` tags exactly `grab` and `kelvinlet`, which is precisely the old
`isGrabBrush()` membership, so the engine's hardcoded tool list is deleted with
no behavior change. `anchoredGrab` **defaults true**, so every host that never
sets it (debug_app, the 113 ctests, `sbrush-verify`) keeps today's behavior
exactly; only `sculptcore_bindings.ts` opts in, with
`setAnchoredGrab(brush.strokeMethod === StrokeMethod.ANCHORED)`. A `PATH`-mode
kelvinlet therefore falls through to the ordinary `nonAccum && accumulable`
policy — the variant support this wave was for.

**The three tool lists did not unify, because they are three different
questions.** Only the first was duplicated policy:

| Site | Question | Disposition |
|---|---|---|
| `brush_executor.h` `isGrabBrush()` | does this stroke deform from orig? | **deleted** — `@grabmode && anchoredGrab` |
| `sculptcore_bindings.ts` `isGrabTool()` | does the bridge set `grabFrom`/`grabTo`? | **kept**, incl. SNAKE — snakehook genuinely needs a drag vector |
| `pbvh_base.ts:1222` | raw event feed + invert suppression | **kept** — `PaintOpBase.feedTask`, the *legacy* PBVH path; `SculptPaintOp extends StrokeDriverOp` and never reaches it, which is why it has no KELVINLET entry |

Collapsing the latter two would have been a behavior change dressed up as a
cleanup. The genuinely duplicated `kGpuKernels[].grabMode` row still mirrors the
`@grabmode` DSL tag by hand; that one is a real (small) duplication left in
place, since the GPU table is also where per-tool kernel *variants* will be
expressed.

Verification: 113/113 ctest. `sbrush-verify` 0 `cpp vs wgsl` mismatches, the
same 22 stale goldens. `npx tsgo --noEmit` the same 11 pre-existing errors.
`pnpm test` unchanged from the Wave 1/2 baseline — app 17 suites / 130 tests and
mathl 2/2 green, integration native 14 suites / 131 tests / 0 failed, wasm 15
passed with the one pre-existing `§8.2/§8.4 world-space dab parity` failure at
the same `worldParityMaxDiff` of 1.1542959213256836.
`test_gpu_brush_seam.cc` asserted `IS_GLOBAL == 1` on kelvinlet; that assertion
now checks `ACCUMULABLE == 0`, which is the property it was actually standing in
for.

**Two thirds of the gate are verified by construction, not by a test.** "Grab
and kelvinlet stroke identically to today" rests on `@grabmode` membership being
byte-identical to the deleted `isGrabBrush()` list (checked: only
`grab.brush.gen.h` and `kelvinlet.brush.gen.h` emit `grabModeCapable`) plus
`anchoredGrab` defaulting true — not on a stroke comparison. "A `PATH`-mode
kelvinlet honors the non-accumulate flag" has no test at all, because no
`PATH`-mode kelvinlet exists yet to point one at; it is the wave's forward-
looking half and stays unexercised until the first variant lands.

## Open

- Whether `invert` belongs on an unbounded field at all. Negating a grab is
  meaningful, but `pbvh_base.ts:1226` currently suppresses Ctrl-invert for grab
  tools (`ps.invert = e.ctrlKey && !isGrabTool`, and that list *does* include
  KELVINLET).
- Whether the kelvinlet variants ship as one kernel + a `variant` uniform or as
  separate `.sbrush` files. The `kGpuKernels` per-tool rows support either.
