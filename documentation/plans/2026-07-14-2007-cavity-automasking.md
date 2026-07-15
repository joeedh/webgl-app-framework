# Cavity automasking for sculptcore

Status: planning · Author: (agent) · Date: 2026-07-14

## Goal

Add **cavity automasking** — a per-vertex, per-stroke scalar derived from local
surface concavity/convexity that scales the *effective brush strength*, so brushes
naturally bite into cracks (or ride convex ridges when inverted) without the user
painting a mask. Port the heuristic described in `cavity.txt` (Blender's
`sculpt_automasking.cc`) into sculptcore's brush model.

This is the first member of a general **automasking** system; the design leaves
room for later factors (occlusion, face-set boundary, normal/view) that fold into
the same seam.

## Key architectural distinction

Automasking is **not** the painted mask layer.

- **Painted mask** (`v.mask`, a real serialized attribute) is consumed *inside each
  kernel* as `strength(v.co) * (1.0 - v.mask)` and is undoable geometry-independent
  paint.
- **Automask** is an engine-computed factor multiplied into the *effective
  strength* — Blender's `factor_get()`. It is transient (recomputed per stroke),
  never painted, never serialized.

Therefore the integration seam is **`CommandCtx::strength()`**
(`source/brush/brush_command.h:187`), the single chokepoint every kernel calls and
which every GPU backend mirrors as `brush_strength()`. Folding the factor there
gives it to every brush uniformly and keeps it orthogonal to `v.mask`.

## Design overview

```
                per stroke, lazily per vertex on first touch
  cavity BFS blur  ──►  signed curvature  ──►  0..1 remap (opt. curve)
        │                                              │
        └────────── cache in .brush.automask.cavity ───┘   (TEMP float attr)
                                   │
                     ctx.strength(co, vIdx) *= automaskFactor(vIdx)
                                   │
                        every CPU + GPU kernel, unchanged
```

### 1. The cavity heuristic (port of `calc_blurred_cavity`)

For a vertex `V`, BFS-walk mesh neighbors out to `cavity_blur_steps + 1` rings:

- Accumulate `sco1/sno1` = avg position/normal over **all** visited verts
  (inner+outer), and `sco2/sno2` = avg over only verts at depth `< steps` (inner).
- `len1_sum` = avg distance from `V` to visited verts (normalizer).
- `vec = sco1 - sco2`; `factor = dot(vec, normalize(sno2)) / len1_sum`.
  Positive → convex, negative → concave.

Remap (`calc_cavity_factor`):

```
sign   = signf(factor)
factor = fabsf(factor) * cavity_factor * 50.0
factor = factor * sign * 0.5 + 0.5     // centered at 0.5
CLAMP(factor, 0, 1)
return inverted ? 1 - factor : factor
```

Optional `CAVITY_USE_CURVE`: un-invert, remap through a `CurveGen` LUT, re-invert.

This runs in the **executor**, not the DSL kernel — it needs a topology BFS
outside the per-vertex kernel body. Use the mesh disk/radial cycles directly (see
`neighbor_source.h` for the existing neighbor-walk primitives); a small growable
ring-buffer queue + a `Set<int>` of visited verts mirrors the reference.

### 2. Caching (mirror the `.brush.orig.*` pattern)

sculptcore already has the exact staleness idiom: `.brush.orig.co` +
`.brush.orig.gen` gated by `origGen[v] == strokeGen` (`brush_command.h:127`). Reuse
it verbatim:

- `.brush.automask.cavity` — TEMP `float` attr, the cached factor.
- `.brush.automask.gen` — TEMP `int` attr, the stroke stamp.
- On `strength(co, v)`: if `automaskGen[v] != strokeGen`, compute via the BFS,
  store, stamp. Otherwise read the cache.

**TEMP is mandatory** (non-serialized, like the spatial `.node` attrs and
`.brush.orig.*`) — a stale cavity value must never persist into a `.wproj`.

Materialize-on-touch handles **dyntopo** for free: a vertex split mid-stroke has no
valid stamp, so it computes fresh on first touch; collapsed verts simply disappear.

### 3. The strength seam

`strength()` currently takes only `co`. Thread the vertex index through so it can
key the cache:

```cpp
float strength(float3 co, int v) {
  float t = 1.0f - std::min(brush.falloffDist(co - surfacePos), 1.0f);
  float s = brush.strength * brush.falloffEval(t);
  if (automaskEnabled) { s *= automaskFactor(v); }   // cached, lazy
  return brush.invert ? -s : s;
}
```

The DSL `strength(v.co)` intrinsic must lower to `ctx.strength(v.co, v.v)` — the
iterator's `PtrHelper` already carries the mesh vert index as `v` (see
`brush_iterators.h:24`), exposed in kernels as `v.v`. This is a **codegen change to
the `strength` intrinsic emission**, touched once per backend
(`emit_cpp/wgsl/spirv/cuda/hip/opencl`). See the GPU decision below for what the
GPU emission actually does with the index.

### 4. Settings + lifecycle

- Add cavity fields to `Brush`: `automask_cavity` (bool), `cavity_factor` (float),
  `cavity_blur_steps` (int), `cavity_inverted` (bool), `cavity_use_curve` (bool),
  and a `CurveGen cavityCurve` (reuse `props::detail::curve`, exactly as
  `falloffCurve` does). Bind them in `defineBindings()` and sync from the TS brush.
- `beginStep()` / stroke begin: bump `strokeGen` for the automask cache (or reuse
  the existing stroke generation), ensure the two TEMP attrs exist, rebake the
  cavity curve if used.
- A settings hash (mirror Blender's `settings_hash()`) folding blur-steps / factor
  / curve control points, so changing a setting mid-session invalidates cleanly.

## GPU parity — the one real fork

sculptcore brushes run CPU **and** GPU (WGSL/SPIR-V/…), A/B verified bit-for-bit,
and `strength()` is mirrored as `brush_strength()`. The cavity BFS is far too
expensive (and topology-walking) to run per-dab on the GPU. Two options:

**Option A (recommended) — CPU-precompute, GPU-consume.** Cavity is computed once
per vertex per stroke regardless of dab count, so treat the cached
`.brush.automask.cavity` attr as a **second, engine-owned per-vertex scalar
channel** — exactly like the painted mask buffer already uploaded to the GPU. The
CPU fills it lazily; the GPU `brush_strength(p, vIdx)` just reads `automask[vIdx]`
and multiplies. The expensive walk never touches the GPU. Requires: the GPU marshal
uploads the automask buffer (piggyback on the mask-attr upload path in
`gpu_marshal.cc`), and the GPU `strength` emission indexes it by vertex id.

*Wrinkle:* under dyntopo the buffer must be (re)filled for verts touched this dab
before the GPU dispatch — fold the lazy fill into the same pre-dab CPU pass that
already materializes `.brush.orig.*`.

**Option B (simpler first cut) — gate GPU off.** When `automask_cavity` is active,
force the CPU brush path (like other CPU-only features). Ship correctness first,
add Option A's buffer upload as a follow-up. The `strength` intrinsic still gains
the vert-index arg; the GPU emission just ignores it until A lands.

Recommendation: **ship Option B, then A.** B de-risks the heuristic and the seam
without entangling the GPU marshal; A is a mechanical buffer-upload follow-up.

## Milestones

- **M1 — Heuristic + cache (CPU).** BFS blur, remap, the two TEMP attrs, lazy
  compute keyed by `strokeGen`. Unit test on a known concave/convex mesh (sphere
  vs. crease) asserting sign and monotonicity. No brush wiring yet — test the
  factor function directly.
- **M2 — Strength seam.** Thread vert index through `strength()` + the DSL intrinsic
  emission (all backends), multiply the factor in on the CPU path. Regenerate
  kernels (`make.mjs codegen`); confirm existing A/B verify still passes with
  automasking **off** (bit-identical — the multiply is `*= 1.0` when disabled).
- **M3 — Brush settings + TS bridge.** `Brush` fields, `defineBindings`, TS sync,
  cavity curve. A UI toggle + factor slider. Drive a stroke headlessly
  (debug_app / `--eval`) and confirm cracks deepen faster than ridges; inverted
  flips it.
- **M4 — Curve remap.** `cavity_use_curve` + `cavityCurve` LUT, settings hash for
  invalidation.
- **M5 (follow-up) — GPU Option A.** Upload the cavity buffer via `gpu_marshal`,
  GPU `brush_strength` reads it, dyntopo pre-dab fill. Re-enable GPU path under
  automasking and A/B verify.

## Files touched

- `source/brush/brush_command.h` — `strength()` signature + `automaskFactor()`.
- `source/brush/brush_executor.h` — BFS blur, cache attrs, `beginStep` wiring.
- `source/brush/brush.h` — cavity settings fields + bindings + `cavityCurve`.
- `source/brush/compiler/emit_*.cc` — `strength` intrinsic gains vert-index arg.
- `source/brush/kernels/generated/*.gen.h` — regenerated (no hand edits).
- `source/brush/gpu_marshal.{h,cc}` — M5 buffer upload.
- TS bridge (`sculptcore_bindings.ts` + brush TS) — settings sync, UI.
- `tests/test_brush_*` (new `test_automask_cavity.cc`) — heuristic + integration.

## Open questions

1. **Blur cost.** The BFS is per-vertex over `blur_steps+1` rings. Blender caps at
   small step counts; confirm a sane default (Blender's default is small, ~2) and
   whether to parallelize the first-touch fill (the pre-dab pass is already a
   parallel-spatial candidate — see the parallel `update()` work).
2. **Normal source.** Use live `m->v.no` (already maintained) vs. a stroke-start
   snapshot. Live is simpler and matches Blender; snapshot avoids feedback as the
   surface deforms under the stroke. Start with live.
3. **Shared automask infrastructure.** Name the attrs/settings `.brush.automask.*`
   (not `.cavity.*`) so occlusion/face-set factors later multiply into the same
   `automaskFactor(v)` accumulator rather than each adding a `strength()` branch.
