# Brush displacement-base: M0 noise baseline

Baseline measurements on the **current `.brush.orig.co` path**, recorded before
any M1 code change, as required by
[the plan](../plans/2026-07-26-0909-brush-displacement-base-attribute.md) §9.1:

> Record every number below on the current path first, in this worktree,
> *before* M1 — the baseline is the deliverable.

Branch `brush-disp-base` (worktree `C:/dev/webgl-app-framework-brush-disp-base`),
sculptcore native `RelWithDebInfo`, `set_backend backend=cpp`.

## The instrument

`sculptcore/source/debug/roughness.{h,cc}` — new module. For a vertex `v` with
umbrella one-ring `c(v)` and area-weighted normal `n(v)`, mean incident edge
length `h`:

```
r(v) = dot(v - c(v), n(v)) / h
```

reported as RMS, p95 and max over the *interior* verts of a region (a vert
counts only when its whole one-ring is in-region and every incident edge is
2-manifold). `/h` rather than `/h²` per the plan, so on a smooth surface
`r ≈ κh/4` and the metric shrinks under refinement instead of holding constant —
that is what makes an absolute threshold meaningful across a dyntopo stroke that
changes `h`.

Two point sets are scored by one implementation:

- **live** — `m->v.co`.
- **base** — whichever base representation the mesh carries: `co - disp` when
  `.brush.disp.{vec,gen}` match `strokeGen` (the M1+ path), else
  `.brush.orig.co` when `.brush.orig.gen` matches (today's path), else live `co`
  for verts the stroke never stamped. So the same binary scores both sides of the
  A/B with no conditional compilation.

Secondary face-based metric: mean `|dihedral|` over interior region edges,
which catches spike/sliver modes the vertex umbrella averages away.

**Fidelity guard** (always from *live* `co` — deriving it from `co - disp` would
be circular): `maxDisp` = max `|dot(co, up) - rest|` and `volume` = the
area-weighted sum of that signed height, over the same region. A candidate cannot
win on noise by depositing less material.

### Where it lives

- `roughness` script verb (`center=` / `radius=` / `up=` / `rest=` / `tag=`;
  defaults to the last stroke's swept region), next to `save_pos` / `assert_pos`.
- `rough=1` on `stroke` / `stroke_path`, printing the metrics **after every dab**
  inside the one stroke. A per-dab `roughness` verb is impossible: each
  `stroke`/`stroke_path` verb bumps `strokeGen`, which resets the base.
- `LastStroke::centers` records every dab origin so the region spans the whole
  swept area rather than the last dab.
- ctest `test_brush_noise` — validates the instrument, then runs the plan's
  fixture.
- Fixture scripts: `sculptcore/tools/noise/` (see its `README.md`).

### Instrument validation (`test_brush_noise`, all passing)

| sub-test | result |
|---|---|
| (a) flat 32×32 grid → zero | verts=900, rms=0, max=0, dih=0 |
| (b) checkerboard `a` vs `2a` → linear | 0.01815 vs 0.03628, ratio **1.998** |
| (c) analytic Gaussian dome, 32→64 → falls with `h` | 0.01990 → 0.009705, ratio **0.488** |
| (d) unstamped mesh → base ≡ live | both 0.0242081, exactly equal |
| (e) plan fixture reaches the metric | verts=4949, maxDisp=0.242, volume=0.0829 |

(b) is a small-signal property — `n(v)` tilts with amplitude — so it is measured
at `a = 0.001`/`0.002` against `h ≈ 0.065`.

## Fixtures

All six: `radius=0.25 strength=0.5 nonaccum=1`, draw brush, `stroke_path` of
24 dabs, `dyntopo detail=0.02 seed=1`. Grid = flat 32×32 over extent 2 (so the
stroke-start surface is exactly `z = 0` and displacement *is* `z`); sphere =
48×64, radius 1, stroke across the north pole.

`smooth=1` matches what the app ships: `DynTopoParams::do_smooth` defaults to
**false** in the engine, but the app sets `DO_SMOOTH`
(`scripts/brush/brush_dyntopo_sc.ts:64`). The `smooth=0` rows are the
counterfactual that isolates `shiftOrig`.

## Baseline — final dab (dab 23)

| fixture | dyntopo | smooth | verts/edges | live rms / p95 / max / dih | **base** rms / p95 / max / dih | maxDisp | Σz·A |
|---|---|---|---|---|---|---|---|
| grid (primary) | on | **on** | 4949 / 14245 | 0.02255 / 0.05133 / 0.09117 / 0.03348 | **0.08955** / 0.20059 / 0.47897 / 0.14403 | 0.2421 | 0.08289 |
| grid | on | off | 5291 / 15258 | 0.01859 / 0.04132 / 0.08458 / 0.03100 | **0** / 0 / 0 / 0 | 0.2375 | 0.08319 |
| grid | off | — | 66 / 100 | 0.08950 / 0.13853 / 0.16536 / 0.24062 | **0** / 0 / 0 / 0 | 0.1577 | 0.03176 |
| sphere | on | **on** | 3113 / 8910 | 0.02035 / 0.04592 / 0.09149 / 0.03651 | **0.08644** / 0.19163 / 0.41483 / 0.14952 | 1.1695 | 0.58009 |
| sphere | on | off | 3434 / 9864 | 0.01765 / 0.03713 / 0.08599 / 0.03365 | **0.00917** / 0.02021 / 0.04565 / 0.01302 | 1.1718 | 0.57291 |
| sphere | off | — | 38 / 54 | 0.05807 / 0.11136 / 0.11561 / 0.17818 | **0.03263** / 0.03406 / 0.03406 / 0.04121 | 1.0159 | 0.17457 |

On the sphere the guard's `up=+Z, rest=0` measures height above the origin
plane, so `maxDisp ≈ 1.0` is the sphere itself; read it as `maxDisp - 1`.
`Σz·A` is still a usable relative deposit measure within a fixture.

## Base roughness per dab

The signature the plan predicts — the base *accumulates* error with dab count
while the live surface does not.

**grid, dyntopo + smooth** (base rms):

| dab | 0 | 2 | 4 | 6 | 8 | 11 | 14 | 17 | 20 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|
| base rms | 0 | 0.02542 | 0.05302 | 0.06437 | 0.07170 | 0.07664 | 0.08057 | 0.08552 | 0.08786 | **0.08955** |
| live rms | 0.01410 | 0.02627 | 0.02650 | 0.02184 | 0.02178 | 0.02225 | 0.02233 | 0.02239 | 0.02243 | 0.02255 |

**sphere, dyntopo + smooth**: base rms 0.00956 (dab 0) → 0.06832 (5) →
0.07730 (11) → 0.08260 (17) → **0.08644** (23).

**sphere, dyntopo, smooth off**: base rms 0.01073 (0) → 0.00988 (5) →
0.00954 (11) → 0.00904 (17) → **0.00917** (23) — flat, not accumulating.

## Findings

1. **Base drift accumulates with dab count; live roughness does not.** Live rms
   settles at ~0.022 within a handful of dabs and stays there for the rest of
   the stroke, while base rms climbs monotonically to ~4× it. This is exactly
   plan §1's claim, and it is why the *base* is the sharper instrument: the
   live surface partly hides the drift because each dab re-derives from a base
   that has already moved.

2. **The dominant accumulating term is `shiftOrig`** — dyntopo's tangential
   smooth replaying its Jacobi displacement onto the snapshot. Turning
   tangential smoothing off collapses the sphere's base rms from 0.0864 and
   rising to a flat **0.0092** floor (≈9.4× lower), and drops the grid's to
   exactly 0 (a flat base interpolates flat, so split-vert sagitta contributes
   nothing there). The residual sphere floor is the split-sagitta /
   discretization term — real, but non-accumulating.

3. **The flat-grid fixture cannot see split sagitta**, so the sphere fixture is
   load-bearing for the M3 A/B: it is the one that carries a non-zero base error
   with smoothing off.

4. **Dyntopo-off rows are the control.** Base rms is 0 (grid) / flat 0.0326
   (sphere, pure snapshot-vs-curved-surface discretization) with no growth, and
   live rms is high simply because `h` is the coarse base mesh. M3 must show
   **no regression** here.

## M3 gate

Re-run these six fixtures with `set_brush dispbase=1` and require:

- a substantial drop in **base** rms/p95/max on the two `smooth=1` rows —
  target: the grid returns to ~0 and the sphere approaches its own `smooth=0`
  floor (~0.009), rather than the 0.0864–0.0895 measured here;
- `maxDisp` and `Σz·A` within a few percent of the numbers above (the fidelity
  guard — the stroke must still deposit the same material);
- no regression on the two dyntopo-off rows.

## Notes / loose ends

- `dyntopo_stats` reports 0/0/0 after `stroke_path`: unlike `stroke`, the
  `stroke_path` CPU loop never accumulates `scene.cumSplits/cumCollapses/
  cumFlips`. Dyntopo *does* run (the grid's region grows from a 1024-vert mesh
  to ~5000 interior verts). Out of scope here; noted for whoever needs it.
- The plan cites two `shiftOrig` call sites (`dyntopo.h:1019` collapse-survivor
  and `:1107` smooth). At this HEAD there is only **one**, the tangential-smooth
  Jacobi write at `dyntopo.h:1105`. M3 must account for that.

---

# M3 result (2026-07-26)

## The plan's premise was wrong, and the metric caught it

§1 of the plan attributes the base noise to "dyntopo tangential slide replayed
via `shiftOrig`", and M3 removes that replay. Measured after the deletion, with
`dispbase=1`, the base roughness was **unchanged**:

| dab | M0 (`shiftOrig`) | M3 as specified (disp, smooth leaves it alone) |
|---|---|---|
| 0 | 0 | 0 |
| 2 | 0.02542 | 0.02542 |
| 4 | 0.05302 | 0.05582 |
| 8 | 0.07170 | 0.07363 |
| 14 | 0.08057 | 0.08063 |
| 23 | **0.08955** | **0.08783** |

Not a near-miss — the same curve, dab for dab, including the same
accumulate-with-dabs signature. The reason is algebraic:

- old path: smooth moves `co` by `δ`, `shiftOrig` does `orig += δ`;
- new path: smooth moves `co` by `δ` and leaves `disp` alone, so
  `base = co - disp` moves by `δ`.

**They are the same operation.** Deleting `shiftOrig` cannot improve the base,
because advecting the base with the untouched `disp` field reproduces it
exactly. The two models differ only where the survivor position is *not* the
interpolant of its sources (collapses, non-midpoint splits) — worth ~2%.

Control: `smooth=0` gives base rms **0** on both paths, and the two dyntopo-off
rows are bit-identical. So dyntopo's tangential smooth is the sole source, and
both models handled it identically.

## The actual defect: the slide's normal component

`smoothTangent` projects the slide onto the tangent plane of the **live**
surface (`delta -= n*delta.dot(n)`). On a displaced surface that plane is tilted,
so a slide along the live flank has a nonzero component along the *base*
surface's normal. Adding the full `δ` to the base (either model) therefore walks
the base off the stroke-start surface — accumulating once per dab, which is
exactly the signature §9.1 was designed to detect.

The base should slide *along* the base surface, not by the live delta. Fix: when
the smooth slides a vert, resample the displacement field at the vert's new
location instead of leaving `disp` alone — same area weights and the same
effective blend factor already used for the position:

```
disp[v] += (areaWeightedRingMean(disp) - disp[v]) * blend
```

This is a ~25-line change in `smoothTangent` + its Jacobi writeback, plus
`DynTopoParams::dispGen` (the stroke stamp) — smaller than the `shiftOrig`
machinery it replaces, and it is the piece that makes §2's invariant hold under
a tangential slide.

## Gate: PASS

Final dab, `dispbase=1` with resampling, vs the M0 table above:

| fixture | dyntopo | smooth | **base** rms M0 → M3 | live rms M0 → M3 | maxDisp | Σz·A |
|---|---|---|---|---|---|---|
| grid (primary) | on | **on** | 0.08955 → **0.00542** (16.5×) | 0.02255 → 0.02242 | 0.2421 → 0.2371 | 0.08289 → 0.08293 |
| grid | on | off | 0 → 0 | 0.01859 → 0.01859 | 0.2375 → 0.2375 | 0.08319 → 0.08319 |
| grid | off | — | 0 → 0 | 0.08950 → 0.08950 | 0.1577 → 0.1577 | 0.03176 → 0.03176 |
| sphere | on | **on** | 0.08644 → **0.00951** (9.1×) | 0.02035 → 0.01990 | 1.1695 → 1.1732 | 0.58009 → 0.58205 |
| sphere | on | off | 0.00917 → 0.00923 | 0.01765 → 0.01752 | 1.1718 → 1.1729 | 0.57291 → 0.57123 |
| sphere | off | — | 0.03263 → 0.03263 | 0.05807 → 0.05807 | 1.0159 → 1.0159 | 0.17457 → 0.17457 |

- **Base roughness**: 16.5× on the grid, 9.1× on the sphere. The sphere lands at
  0.00951 against its own `smooth=0` floor of 0.00923 — i.e. the smooth-induced
  component is essentially eliminated, not merely reduced.
- **Per-dab**: the accumulate-with-dabs signature is gone. Base rms is flat at
  0.0039 → 0.0054 across 23 dabs (M0: 0.025 → 0.090, monotonic).
- **Fidelity guard held**: grid `Σz·A` +0.05%, `maxDisp` −2.1%; sphere both
  +0.3%. Well inside "a few percent".
- **No regression with dyntopo off**: both rows bit-identical.
- **Stroke (live) roughness**: −0.6% grid, −2.2% sphere. Small, and honestly so —
  live rms was already near its `smooth=0` floor (0.0226 vs 0.0186), so there
  was little headroom. The gate's "and stroke roughness" clause is met only
  weakly; the base-set result is what carries M3.

## Consequence for the legacy path

M3 deletes `shiftOrig` unconditionally (plan §10: rollback past M3 is a revert).
With `dispbase=0` the legacy path now has no dyntopo coherence at all, and it is
much worse than M0: grid live rms 0.0226 → **0.159**, base rms → 0 (a pristine
but misaligned snapshot). Not a defect of the change — it is the cost the plan
accepted. **Resolved at M6:** the legacy path, the `dispbase` toggle, and the
`sculptcore.brush_disp_base` flag were all deleted, so the derived base is the
only path and there is nothing left to ship in the worse configuration.

## Open items carried forward

- `.brush.disp.vec` / `.gen` now have a `mergeDispField` CUSTOM merge policy
  (`attr_merge.cc`), mirroring `mergeOrigSnapshot`'s gen guard: both stamped →
  lerp, one stamped → lerp against zero, neither → clear. Without it a split
  child could inherit a nonzero lerped displacement under a stale gen.
- The `#37` orig pre-pass (`brush_executor.h`) **survives** — plan §7 Q1. The
  disp path does not need it (`defaultMerge` and `mergeDispField` both read
  sources through `safe_get`, so an unmaterialized page is already safe), but
  the legacy `.brush.orig.*` path still does. It goes away with M6, not M3.
