# Brush displacement-base attribute (replacing `.brush.orig.co`)

Status: proposed
Supersedes: §5 ("Dyntopo coherence") of
[`sculptcore/documentation/plans/nonAccumMode.md`](../../sculptcore/documentation/plans/nonAccumMode.md)
Related: [`documentation/plans/gpuGlobalBrushes.md`](gpuGlobalBrushes.md) (#35 grab
from-orig), ImmediateTODOs #37 (lazy orig pages)

## 1. Problem

Non-accumulate brush mode and the grab-class brushes measure deformation from a
frozen **stroke-start position** cached per vertex in `.brush.orig.co`, keyed by
`.brush.orig.gen == strokeGen` (`brush_executor.h:783-871`). The snapshot is an
*absolute point*, so every agent that moves a vertex for a reason other than
brush displacement has to replay its motion into the snapshot or the measured
displacement `co - orig` silently picks that motion up as if the brush had done
it.

Today only dyntopo does the replay, via `DynTopoParams.nonAccumGen` and the
`shiftOrig` lambda (`dyntopo.h:695-715`, called at `:1019` collapse-survivor
reposition and `:1107` tangential-smooth Jacobi write). This is incomplete and
wrong in two ways:

- **Tangential slide is not a displacement.** When relaxation slides a vertex
  along the surface, `shiftOrig` translates its snapshot by the same vector,
  pushing the snapshot *off* the original surface by the slide amount. The base
  is no longer a point on the stroke-start surface, so `co - orig` acquires a
  spurious component that varies vertex-to-vertex — visible as noise.
- **Split verts get an interpolated absolute point.** A vertex created mid-dab
  gets `orig.co` linearly interpolated along the split edge (deliberately no
  `NOINTERP`, `brush_executor.h:807`) while its live `co` sits on the curved
  surface. The two disagree by the edge's sagitta, so the new vert's measured
  displacement is inconsistent with its neighbours' — more noise. The current
  mitigation (leave new verts at gen 0 so they read live) trades that for a
  hard discontinuity between stamped and unstamped verts, which the neighbour
  path (`OrigNbrBase::neighborCo`, `accum_mode.h:53-62`) hits constantly.

Both failures share one root cause: **an absolute position cannot distinguish
"the surface moved" from "the brush moved it".**

## 2. Core idea

Store the accumulated brush displacement instead, and derive the base:

```
base(v) = co(v) - disp(v)
```

`disp` is a per-vertex `float3` on the same generational-tag lazy scheme as
`.brush.orig.*`: zero on first touch of a stroke, accumulated by every brush
write for the rest of it.

The whole design reduces to one invariant:

> **Whoever moves a vertex as brush displacement adds the same delta to `disp`.
> Everyone else leaves `disp` alone.**

A brush write keeps `base` fixed (both terms move together). Any other motion —
dyntopo relaxation, collapse repositioning, edge-split placement — moves `co`
only, so `base` **advects with the surface** for free. That is the behaviour
`shiftOrig` was trying and failing to synthesize.

Consequences:

| Situation | `.brush.orig.co` today | `disp` |
|---|---|---|
| Brush dab | `live += want - orig` | `live += d; disp += d` — identical |
| Dyntopo tangential smooth | `shiftOrig` replay, base leaves the surface | no-op; base follows the surface |
| Dyntopo collapse survivor | `shiftOrig` replay | no-op |
| Edge split, new vert | interpolate an absolute point (sagitta error) or leave unstamped (discontinuity) | interpolate a smooth field — correct, and unstamped `disp = 0` degrades to `base = co`, continuous with its neighbours |
| Unmaterialized attr page | `safe_get` + gen check, fallback to live | `safe_get` returns 0 → `base = co`, the same fallback with no gen check |
| Grab absolute re-base | `live = want` | `d = want - base; live += d; disp += d` — same result |

Note the fallback unification: "no data for this vertex" and "this vertex has
not been displaced" become the *same state* (`disp == 0`), which is why the
discontinuity disappears.

## 3. Scope

**In scope**

- Non-accumulate mode (`AccumOrig`) — the primary target.
- Grab-class (`AccumOrigGrab`, grab + kelvinlet) — shares the same attrs,
  proxy and codegen; migrated in a later phase so the two never coexist.
- The dyntopo coupling — deleted, not ported.
- The GPU/WGSL twin (binding 22).
- The relaxation/displacement split for the smooth brush (`relaxes_base`, §4.6)
  — decided, landed in M5.

**Out of scope**

- `.brush.orig.no` / `BrushCommandDef::needsOrigNormals`. It currently has *no*
  consumer (view-normal automasking reads live normals, `brush_command.h:221`),
  and view-normal work is live at HEAD. Leave it exactly as it is; it keeps its
  own `.brush.orig.gen` key until someone deletes it deliberately.
- Cavity automask caching (`.brush.automask.cavity`), which uses the same
  generational-stamp *pattern* but caches a scalar, not a position.
- The legacy JS sculpt path (`addons/builtin/mesh/src/bvh.ts` `cd_orig`,
  `scripts/editors/view3d/tools/pbvh_*.ts`, the `ORIGINAL_CO` texture flag) —
  an independent system, untouched.
- The `CoProxy` double-write quirk (see §8).

## 4. Design

### 4.1 Attributes

| Attr | Type | Flags | Meaning |
|---|---|---|---|
| `.brush.disp.vec` | `FLOAT3` | `TEMP \| NOCOPY` | accumulated brush displacement this stroke |
| `.brush.disp.gen` | `INT` | `TEMP \| NOCOPY` | `== strokeGen` ⇒ `vec` belongs to this stroke |

Same lazy paging (`ensure(..., /*materialize=*/false)`) and the same O(region)
first-touch stamping as today, so the "no whole-mesh work in a stroke path"
constraint holds. `NOCOPY` keeps them out of meshlog snapshots. Interpolation
stays **enabled** (no `NOINTERP`) — for a displacement field that is now
correct-by-construction rather than a hack.

First touch writes `vec = 0, gen = strokeGen` — no read of `m->v.co`, so the
stamp loop gets marginally cheaper than today's position copy.

### 4.2 CPU: proxy and iterators

`CoProxy` (`accum_mode.h:111-168`) currently holds `const float3 *basePtr` into
the orig attr. A derived base cannot be a pointer, so:

- `CoProxy::basePtr` → `float3 base` (by value), computed once when the iterator
  lands on the vertex. `base` is invariant across writes within a dab (both
  terms move by the same delta), so caching it is exact, not an approximation.
- `commit()` becomes, for both from-base kinds:
  ```
  float3 d = want - base;          // Additive; Grab first-touch uses want - base too
  live += d;
  if (disp) (*disp)[v] += d;
  ```
  The `AccumKind::Grab` first-touch branch (`live = want`) is re-expressed as
  `d = want - base` — algebraically the same result, and it now also keeps
  `base` invariant, which the current `live = want` achieves only because `orig`
  is frozen.
- `BasicVertexIter::baseFor` (`brush_iterators.h:50-58`) returns `float3` by
  value: `disp && gen[v] == strokeGen ? m->v.co[v] - disp->safe_get(v) : m->v.co[v]`.
  `PtrHelper`'s ctor takes it by value.
- `OrigNbrBase::neighborCo` (`accum_mode.h:53-62`) likewise returns `float3` by
  value. **This forces a codegen change**: `emit_cpp.cc:806-811` emits the
  neighbour bundle with a `const float3 &co` member initialized from
  `AccMode::neighborCo(...)`. Aggregate initialization does *not* extend the
  lifetime of a temporary bound to a reference member, so the member must become
  `float3 co` (by value). A 12-byte copy per neighbour visit; measure it (§9),
  it should disappear into the CSR walk.

  Note the neighbour read also gets *better*: today it falls back to `co_prev`
  for unstamped neighbours, mixing frozen and live positions in one smoothing
  stencil. Under `disp`, `co_prev[nb] - disp[nb]` is uniformly the base with no
  branch, and an untouched neighbour has `disp == 0` so the two agree.
  Neighbour base must read the **Jacobi snapshot** `co_prev`, not live `co`, to
  stay order-independent and GPU-parity-exact.

- `CommandCtxBase` (`brush_command.h:129-138`): `origCo`/`origGen` →
  `dispVec`/`dispGen`; `origNo` stays as-is (§3).
- Dispatch (`brush_executor.h:495-519`) is unchanged in shape — `AccumOrig` /
  `AccumOrigGrab` still select the from-base policy.

### 4.3 Dyntopo: deletions

All of this goes away:

- `DynTopoParams::nonAccumGen` (`dyntopo.h:152-158`) and its binding.
- The `.brush.orig.*` lookup and `shiftOrig` lambda (`dyntopo.h:695-715`) and
  both call sites (`:1019`, `:1107`).
- `params->nonAccumGen = nonAccum ? strokeGen : 0` (`brush_executor.h:1659`).
- Probably the whole dyntopo orig pre-pass (`brush_executor.h:1737-1770`), which
  exists only to stamp seed verts *before* remesh moves them. Under `disp` an
  unstamped vert's base is its live position at read time, which is the
  post-relaxation surface — exactly what we want. **Verify before deleting**
  (§9); if a first-dab ordering artifact shows up, keep a zero-stamp version of
  the loop, which is cheaper than today's position copy anyway.

This restores dyntopo to its documented design — "spatial/brush/meshlog-free,
mutates only the `mesh::Mesh`" — which it currently violates by reaching into
`.brush.orig.*` by attribute name.

### 4.4 GPU / WGSL

Binding 22 (`compute_layout.h:112`, `kOrigCoBinding`) becomes `kDispBinding`:

| | today | after |
|---|---|---|
| contents | stroke-start positions | accumulated displacement |
| usage | `STORAGE` read-only | `STORAGE` read-write |
| beginStroke | upload strided `co` | zero-fill (one fewer vec3 upload per stroke) |
| kernel prologue | `v_co = orig_co[i]` | `v_co = co_buf[i] - disp[i]` |
| neighbour read | `select(co_prev[n], orig_co[n], nonaccum)` | `co_prev[n] - select(vec3(0), disp[n], nonaccum)` |
| write-back | `v_co = co_buf[i] + (v_co - orig_co[i])` | `let d = v_co - base; co_buf[i] += d; disp[i] += d;` |

GPU strokes are non-dyntopo and topology-static, so this is a pure refactor with
no behaviour change there — but it puts both backends on one model and removes
the "the beginStroke upload *is* the snapshot" special case.

Touch points: `emit_wgsl.cc:274-281` (neighbour), `:881` (binding decl),
`:1312-1326` (prologue), `:1400-1430` (write-back); regenerated into
`sculptcore/typescript/sculptcore/brush/brushWgsl.ts` and the checked-in
`kernels/generated/*.brush.gen.h`; hosts `wgpu_compute.cc:316-349,435`,
`vk_compute.cc:434-457`, `scripts/webgpu/brush_compute.ts:344-383`, and the
replay harness `sculptcore/tests/webgpu/replay.mjs:229,287`.

`disp` is stroke-transient and derived, so it never needs reading back to the
CPU.

### 4.5 A/B switch

Land behind a runtime toggle so the old path stays measurable for a release:

- engine: `CommandExecutor::setDispBase(bool)` alongside `setNonAccum`;
- debug app: `set_brush dispbase=0|1` (`source/debug/script.cc`);
- app: feature flag `sculptcore.brush_disp_base` (default **on** once phase 5
  gates pass), pushed in `sculptcore_bindings.ts` next to `setStrokeGen`
  (`:470`).

The toggle guards the CPU path only. Keeping two WGSL variants alive is not
worth it — the GPU path has no dyntopo and therefore no behavioural delta, so it
migrates unconditionally in phase 4.

### 4.6 Relaxation kernels do not accumulate displacement

The smooth brush *is* a relaxation, not a displacement — same operator dyntopo's
internal tangential smooth runs, just user-driven. The §2 invariant then says
what to do with it: it moves `co` and leaves `disp` alone, so the base advects
with the relaxed surface exactly as it does under dyntopo smoothing. Under the
old absolute snapshot this was not expressible; here it costs one flag.

Mechanically: a `relaxes_base` trait on `BrushCommandDef`, set from a
`@relaxation` annotation in the `.sbrush` source (alongside `@global` /
`@paint` / `@grabmode`), threaded into the kernel context. `CoProxy::commit`
skips the `disp` accumulation when it is set:

```cpp
float3 d = want - base;
live += d;
if (disp && !relaxes_base) { (*disp)[v] += d; }
```

`AccumMode` is unchanged — a relaxation kernel still *reads* the live surface,
which under `AccumOrig` is what `base` already resolves to once its own writes
stop being recorded. Applies to `smooth`, autosmooth, and any future relax-class
kernel; it is not a from-base concept, so it is inert with the flag off.

Without this, smoothing inside a non-accumulate stroke is re-measured as brush
displacement on the following dab — a second, quieter noise source than the one
in §1, and one this plan would otherwise leave in place.

## 5. Phases

Each phase ends green on `node make.mjs test` + `pnpm test`.

**M1 — attributes + proxy (CPU, non-accum only).**
`accum_mode.h` (`CoProxy::base` by value, `commit` deltas, `OrigNbrBase` by
value), `brush_iterators.h` (`baseFor`, `PtrHelper`), `brush_command.h` (ctx
fields), `brush_executor.h` stamp loop + `setDispBase`. Old path still reachable
via the toggle. Gate: `test_brush_nonaccum`.

**M2 — codegen.**
`emit_cpp.cc:806-811` neighbour bundle by value; regenerate
(`node make.mjs codegen`, then rebuild — a stale `sbrushc` silently reuses the
previous compiler, see the sbrush-codegen note in project memory) and commit the
`kernels/generated/*.brush.gen.h` diff. Gate: `sbrush-validate`, full ctest.

**M3 — dyntopo deletions.**
Remove `nonAccumGen`, `shiftOrig`, both call sites, the executor plumbing, and
(conditionally) the dyntopo orig pre-pass. Gate: `test_dyntopo_*`,
`test_spatial_boundary_normals`, `test_edge_split`, plus the new noise metric
(§9). This is the phase that pays for the plan — measure before/after here.

> **Done 2026-07-26, with a correction to §1's premise.** Measured after the
> deletions, base roughness was *identical* to the M0 baseline dab-for-dab:
> `shiftOrig` (`orig += δ`) and disp-advection (`disp` untouched ⇒
> `base = co - disp` moves by `δ`) are the same operation, so deleting the
> replay cannot by itself improve the base. The real defect is that
> `smoothTangent` projects the slide onto the *live* surface's tangent plane,
> which on a displaced surface has a component along the *base* surface's
> normal. M3 therefore also **resamples** `disp` at the vert's post-slide
> location (same area weights and blend factor as the position), which needs
> the stroke stamp back as `DynTopoParams::dispGen` — ~25 lines, smaller than
> the `shiftOrig` machinery removed. Gate passes: base rms 16.5× better on the
> grid, 9.1× on the sphere (landing at its `smooth=0` floor), the
> accumulate-with-dabs signature gone, fidelity within 0.3%, dyntopo-off rows
> bit-identical. Full numbers:
> `documentation/research/2026-07-26-brush-base-noise-baseline.md`.

**M4 — GPU.**
`compute_layout.h`, `emit_wgsl.cc`, both native hosts, `brush_compute.ts`,
`replay.mjs`; regenerate `brushWgsl.ts`. Gate: `sbrush-verify` (C++ vs WGSL A/B,
bit-for-bit modulo fp), the `gpu_brush` suite, `--backends=cpp,wgsl,spirv`.

**M5 — grab migration + `relaxes_base`.**
Flip `AccumOrigGrab` onto `disp`; `.brush.dab.gen` first-touch arbitration is
unchanged (it stamps, it does not store positions). Land the `relaxes_base`
trait (§4.6): `@relaxation` in the sbrush grammar, the def/ctx field, the
`commit` guard, `smooth.sbrush` + autosmooth annotated, regenerate. Gate:
`test_brush_mirror_grab`, plus a manual anchored-grab + symmetry pass — the TS
anchored `grabFrom`/`grabTo` cumulative drag and the dab-coalescing skip
(`sculptcore_ops.ts:619-634`, `:721`, `:1102-1104`) depend on the from-base
kernel being idempotent per dab, and grab under dyntopo now *advects* its pull
target with the relaxed surface, which is a real (intended) behaviour change.

**M6 — cleanup.**
Delete `.brush.orig.co` / `.brush.orig.gen` and the toggle once the flag has
been default-on through a release; refresh `nonAccumMode.md` §5,
`sculptcore/documentation/dynamic-topology.md`, `documentation/gpuBrushes.md`;
strip every `CLAUDENOTE:` comment added along the way, promoting the ones worth
keeping to permanent ≤3-line comments.

## 6. Files

Engine:
`sculptcore/source/brush/{accum_mode.h, brush_iterators.h, brush_command.h, brush_executor.h, compute_layout.h}`,
`sculptcore/source/brush/compiler/{emit_cpp.cc, emit_wgsl.cc}` + the annotation
parser (`@relaxation`, §4.6), `sculptcore/source/brush/kernels/smooth.sbrush`,
`sculptcore/source/brush/kernels/generated/*.brush.gen.h` (regenerated),
`sculptcore/source/dyntopo/dyntopo.h`,
`sculptcore/source/{webgpu/wgpu_compute.*, vulkan/vk_compute.*}`,
`sculptcore/source/debug/script.cc`,
`sculptcore/typescript/sculptcore/brush/brushWgsl.ts` (regenerated).

App: `scripts/webgpu/brush_compute.ts`,
`scripts/editors/view3d/tools/{sculptcore_bindings.ts, sculptcore_ops.ts}`,
`scripts/core/feature-flag.ts`.

Tests: `sculptcore/tests/{test_brush_nonaccum.cc, test_brush_mirror_grab.cc,
test_edge_split.cc, webgpu/replay.mjs}` + one new noise-metric test.

## 7. Open questions

(The smooth-brush question — displacement or relaxation? — is **decided**:
relaxation. See §4.6; it lands in M5, not as a follow-up.)

1. **Does the dyntopo orig pre-pass survive?** §4.3. Decide from M3
   measurements, not from reasoning. — **Answered (M3): yes, but only for the
   legacy path.** The disp path does not need it (`defaultMerge` and the new
   `mergeDispField` both read sources through `safe_get`, so an unmaterialized
   page is already safe); `.brush.orig.*` still does. It goes away with M6.
2. **Should `disp` outlive the stroke?** It is exactly the per-stroke sculpt
   delta, which is what the sculpt-layers V2 fold wants. Tempting, but layers
   have their own store and `TEMP | NOCOPY` is what keeps this off the meshlog
   hot path. Not now; note it.

## 8. Risks

- **Precision.** `base = co - disp` resolves to ~1 ulp of `co`, i.e. the
  resolution the live mesh already has, so it is no worse than storing `base`
  outright — but a far-from-origin mesh with tiny displacements now quantizes
  the *base* as well as the position. Add a far-from-origin case to the
  non-accum test.
- **Pre-existing `CoProxy` double-write quirk.** A kernel that writes `v.co`
  twice in one dab already double-counts under `AccumOrig`
  (`operator+=` → `commit(cur() + r)` → `live += live + r - base`). The `disp`
  version must mirror the arithmetic **exactly** so the migration is a no-op for
  it; fixing it is a separate change with its own A/B.
- **Behaviour change for grab under dyntopo** (M5) — intended, but it is the one
  user-visible delta in the plan. Call it out in the commit message.
- **Codegen churn.** M2 and M4 regenerate every kernel; keep those commits
  mechanical and separate from the hand-written phases so a bisect is readable.

## 9. Verification

Existing gates that must stay green: `test_brush_nonaccum`,
`test_brush_mirror_grab`, `test_dyntopo_cascade` / `_budget` / `_smooth`,
`test_spatial_dyntopo` / `_merge`, `test_spatial_boundary_normals`,
`test_edge_split` (the lazily-paged-attr regression), `test_automask_view_normal`,
the `gpu_brush` suite, `sbrush-validate` + `sbrush-verify`.

### 9.1 The noise metric

This is the point of the plan, so the measurement gets designed, not
improvised. Record every number below on the **current** path first, in this
worktree, *before* M1 — the baseline is the deliverable.

**Scene.** Flat grid, dyntopo on, one non-accumulate draw stroke along a
straight line. Flat is the whole trick: the base surface is `z = 0`, so
displacement *is* the z coordinate — no reference mesh, no closest-point
projection, no registration error folded into the result.

**Fidelity guard (run first, or the noise number is gameable).** `max z` over
the region and the area-weighted `Σ z·A`; both must stay within a few percent
A→B. Without it "less noise" is trivially won by depositing less displacement.
Deliberately computed from `co`, **not** from `co - disp` — that is the quantity
under test, and measuring it with itself is circular.

**Roughness.** Over stroke-region interior verts, using the ring-1 CSR the
stroke already builds:

```
N(v) = one-ring of v
c(v) = mean of N(v)                 # umbrella, not cotangent
h(v) = mean |v_i - v|,  v_i ∈ N(v)
r(v) = dot(v - c(v), n(v)) / h(v)   # normal component only
metric = RMS of r(v)                # report p95 and max alongside
```

Three choices worth pinning:

- **Normal component only.** On an irregular triangulation a vertex is
  generally not the centroid of its one-ring even on a perfectly flat surface;
  projecting onto `n` zeroes that tangential sampling term exactly, so the
  metric measures surface noise rather than mesh irregularity.
- **Umbrella, not cotangent.** Cotangent weights blow up on the slivers dyntopo
  produces, which is precisely the population under test.
- **`/h`, not `/h²`.** For a smooth surface `δ_n ≈ (h²/4)·κ`, so `r ≈ κh/4 → 0`
  as the mesh refines — a clean zero baseline, which is what makes an absolute
  threshold meaningful. Noise of amplitude `a` reads `r ≈ a/h`.

**Sharpest instrument: measure the base, not the surface.** Run the same `r(v)`
over the *base* point set — `{co - disp}` on the new path, `{orig.co}` on the
old. §1's defect is that the old base leaves the stroke-start surface; this
measures that directly instead of its downstream symptom, and it is where the
A/B gap should be largest.

**Per-dab trace, not one end-of-stroke number.** Emit the metric after every
dab. The old path should show monotonic growth with dab count — that
accumulate-with-dabs signature is also what distinguishes this noise source
from the other dyntopo noise being fixed in the parallel worktree, so the trace
is what keeps the two investigations from contaminating each other.

**Cheap secondary: mean |dihedral angle| over interior region edges.** `→ 0` as
`h → 0` on a smooth surface, `O(1) rad` under noise. Face-based, so it catches
spike/sliver modes a vertex-averaged metric washes out.

**Where it lives.** A debug-app verb (`roughness region=stroke`) next to
`save_pos` / `assert_pos` / `bench_dyntopo`, plus a ctest.
`sculptcore/tests/test_seam_analysis.cc:150-230` is close precedent — it already
reads the orig attrs, computes `|co - origCo|`, and correlates per-edge normal
angles.

**Gate.** M3 passes on a substantial drop in base-set roughness and stroke
roughness, the fidelity guard held, and no regression with dyntopo off.

### 9.2 Other new tests

- **Base-invariance unit test.** Assert `co - disp` is bit-stable across
  repeated dabs on a static mesh, and that it *tracks* the surface across a
  dyntopo smooth round.
- **Perf.** Per-dab timing at 1.5M tris, dyntopo on and off, against the
  committed baselines — the neighbour-bundle by-value change (§4.2) is the one
  to watch. Use real-mouse warm strokes, not scripted batches; scripted runs do
  not reproduce live-path costs.

## 10. Rollback

M1-M2 are behind `setDispBase` / `sculptcore.brush_disp_base`; flipping it off
restores the old CPU path verbatim. M3 deletes the dyntopo replay, so rollback
past M3 is a revert, not a flag flip — which is why M3 is gated on a measured
noise improvement rather than on "tests still pass".
