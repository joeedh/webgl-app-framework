# Attribute merge policy for topology operators

**Date:** 2026-07-26
**Branch:** `attr-merge-policy` (worktree `C:/dev/webgl-app-framework-attr-merge-policy`)
**Symptom that started this:** the draw brush over dyntopo in **collapse-only**
mode produces surface noise.

## 1. Diagnosis

The noise is not a "should have snapped instead of lerped" problem. It is a
**validity-laundering** problem: a stroke-transient column whose meaning is
gated by a sidecar generation stamp gets its *value* blended while its *guard*
is copied, so garbage comes out flagged as valid.

### 1a. `interpAttrs` blends the value but copies the guard

`collapseEdge` blends the survivor's vertex attrs
(`source/mesh/utils/edge_collapse.h:332`):

```cpp
interpAttrs(m.v.attrs, v_keep, v_keep, v_kill, blend);   // blend = 0.5 from dyntopo
```

`interpAttrs` skips only `TOPO | NOINTERP` (`attr_interp.h:195`). The
non-accumulate snapshot columns are `TEMP | NOCOPY`
(`brush/brush_executor.h:810,813,819`), so:

| column | type | what `interpAttrs` does |
|---|---|---|
| `.brush.orig.co` | FLOAT3 | **lerped** |
| `.brush.orig.no` | FLOAT3 | **lerped** |
| `.brush.orig.gen` | INT | **copied from `src0`** (integers have no blend) |

For a collapse `dst == src0 == v_keep`, so the guard keeps `v_keep`'s stamp
while the value absorbs `v_kill`'s. When `v_kill` was never stamped this stroke,
`AttrData::safe_get` returns the unmaterialized page default — zeros
(`attribute.h:162-171`) — and the survivor ends up with

```
orig.co = 0.5 * orig.co[v_keep]        // a rest position halfway to the origin
orig.gen = strokeGen                   // ...marked valid
```

`AccumOrig` then computes `live += want - base` against that base
(`brush/accum_mode.h:129`). That is the noise.

The same laundering exists on the split path (`edge_split.h:150`): `vm` is a
fresh vertex, `orig.gen` is copied from `v0`, and if only one endpoint is
stamped the midpoint's `orig.co` is a lerp against zeros.

`applyDynTopoDab`'s pre-pass (`brush_executor.h:1737-1768`, ImmediateTODOs #37)
stamps the dab's `seedVerts` before dyntopo runs, which hides most of this —
but the frontier reaches edges whose far endpoint lives in a leaf the dab's
`filterNodes` never returned, and those endpoints are unstamped.

### 1b. `shiftOrig` double-applies on the collapse arm

`dyntopo.h:1019` shifts the survivor's snapshot by the survivor's motion:

```cpp
shiftOrig(v_keep, mid - keepOld);
```

immediately *after* `collapseEdge` already blended the same column. Two
mechanisms own one value. `shiftOrig` is correct for the **smooth** op (which
moves a vertex with no attr interp at all) and wrong for **collapse**.

### 1c. Which column actually bites depends on the brush mode

`.brush.orig.*` only exists when `nonAccum && cmd.accumulable`, `cmd.grabMode`,
or `cmd.needsOrigNormals` (`brush_executor.h:798`). So:

- draw + **accumulate off** → `.brush.orig.co` corruption (positional noise);
- draw + **accumulate on** + view-normal masking → `.brush.orig.no` corruption
  (a mask fed by a normal blended toward zero — also reads as noise).

Both are the same defect and both are fixed by the same policy.

## 2. Why not the obvious designs

**A bare `SNAP` attribute flag does not fix this.** In a collapse
`dst == src0 == v_keep`, so "snap to `src0`" is bit-identical to `NOINTERP`.
It only differs on *split*, where a new vertex would take a nearest-source copy
instead of a zero default. Worth having — but as one value in a policy enum, not
as its own flag and not as the fix. Its honest customer list is thin today:
int/bool/byte/short already copy `src0`; colors and UVs genuinely want lerp;
`crossfield` and the displace frames use `NOINTERP` *deliberately* so split
vertices get cleared and recomputed (`brush/feature_field.cc:185`,
`displace/frames.cc:195`).

**A merge callback passed into `collapseEdge` is the shape of the current bug.**
`shiftOrig` already *is* "dyntopo hand-rolls the merge policy for a column it
does not own", and that is precisely what double-applies. It would also have to
be threaded through `splitEdge`, `triangulateFaceFanCb`, `symmetrize` and the
5+ existing `collapseEdge` call sites, each of which silently gets the buggy
default if it forgets.

**A `std::function` stored on `AttrRef` is the right idea with the wrong
storage.** `AttrRef` is returned **by value** from `find_attribute`
(`mesh.cc:858`), is reflected/bound (`AttrRef::defineBindings`), and is rebuilt
from file by `mesh_serialize.cc`'s `buildDomain`. A callback living there is
dropped on load — "correct all session, corrupt after save/reload" is the worst
failure mode available. It also puts a `std::function` in `interpAttrs`' inner
loop, which runs thousands of times per dab.

## 3. Design

An `AttrMerge` policy **enum** on `AttrRef`, with the `CUSTOM` case dispatched
through a **static, name-keyed table of plain function pointers** stamped onto
the ref inside `AttrGroup::ensure()`.

This mirrors machinery that already exists: `mesh_serialize.cc`'s
`mandatoryBuiltinFlags(name)` already re-asserts canonical flags for known
builtins on load, and `buildDomain` already funnels every deserialized column
through `ed.attrs.ensure(col.type, col.name)`. Stamping the policy in `ensure()`
therefore restores it automatically on load, with no new serialization surface,
no allocation, and no `std::function`.

```cpp
enum class AttrMerge : uint8_t {
  DEFAULT = 0,  // lerp floats, copy src0 for int/bool/byte/short (today's rule)
  COPY_SRC0,    // "snap": nearest-source copy, incl. for float columns
  NONE,         // leave dst untouched (what NOINTERP means today)
  CUSTOM,       // dispatch through AttrRef::merge_fn
};

struct AttrMergeCtx {
  Mesh &m;
  AttrGroup &grp;
  int dst, src0, src1;
  float t;
  const math::float3 *merged_co;  // collapse's placed position; null for split
};

using AttrMergeFn = void (*)(AttrRef &, const AttrMergeCtx &);
```

`merged_co` is in the context because **every hard case is a paired-column
case**: the column's correct merged value depends on where the survivor was
actually placed, not on a blind lerp of the endpoints.

`NOINTERP` stays as the serialized flag bit (files and `mandatoryBuiltinFlags`
reference it); it simply resolves to `AttrMerge::NONE`. No format change.

### 3a. `.brush.orig.co` / `.brush.orig.no` policy

```
both endpoints stamped  -> value[dst] = lerp(v0, v1, t);      gen[dst] = cur
exactly one stamped     -> value[dst] = lerp(stamped_value,
                                             unstamped's LIVE co/no, t);
                                                               gen[dst] = cur
neither stamped         -> gen[dst] = 0   (leave unstamped; the brush reads live)
```

The middle row is the key insight: an unstamped vertex's stroke-start position
*is* its current position, so it is a legitimate lerp operand — there is no need
to fall back to snapping. Correct for split and collapse alike, with no operator
needing to know the column exists.

Then **delete the `shiftOrig` call from the collapse arm** of `dyntopo.h`
(keep it on the smooth arm).

`.brush.automask.cavity` and `.brush.enhance.disp` have the same gen-guarded
shape but are cheap to recompute, so they take the cheap version: if either
source is unstamped, zero `gen[dst]` and let the next dab's stamp loop refill it.

### 3b. Sculpt layers

**DELTA layer columns stay `DEFAULT` (lerp) — they are already correct.**
`co = base + Σ wᵢdᵢ` is affine in the vertex, so lerping every `dᵢ` and placing
`co` at the lerp of the two positions leaves the implied base at the lerp of the
two bases. `sculpt_layers.h:20` already asserts this ("DELTA is the polygon
default (exact under dyntopo interp, commutative)") and the assertion holds.

**The exposure is `.slayer.rest`** — a paired column exactly like `orig.co`,
paired with `co`, which collapse *overrides* via `merged_co`. It survives today
only because dyntopo always passes the exact midpoint with `blend = 0.5`
(`dyntopo.h:1002`, `detail::edgeMid`), so `lerp(rest)` and `mid` coincide by
arithmetic accident. Any collapse that places the survivor somewhere other than
the t-lerp of the endpoints — quadric/QEM placement, a collinear feature-curve
snap, a boundary-projected position — desyncs `rest` from `co`, and
`Mesh::foldActiveSculptLayer` (`mesh.cc:866`, `d = co - rest`) then bakes the
remesh wobble into the layer **permanently**.

Policy (`CUSTOM`), with `dᵢ = coᵢ - restᵢ`:

```
rest[dst] = merged_co - lerp(d0, d1, t)
```

equivalently `lerp(rest0, rest1, t) + (merged_co - lerp(co0, co1, t))`: the
remesh displacement lands in the **base**, never in the layer. Under dyntopo's
current midpoint placement this is a numerical no-op, so it is insurance rather
than a behavior change — but it is the difference between *correct* and
*correct by coincidence*.

TANGENT layers and multires grid-store channels are not per-vertex columns and
dyntopo does not run on multires levels; they are out of scope here and the doc
should say so rather than half-handle them.

## 4. Implementation order

Each step is independently testable and independently revertable.

### Step 1 — minimal noise fix (no new mechanism)

1. `dyntopo.h:1019`: drop `shiftOrig` from the collapse arm; keep it on smooth.
   This is defect **1b**, and it is the dominant one — 1a needs an unstamped
   frontier endpoint to bite, whereas 1b fires on *every* collapse and its sign
   follows the arbitrary `e.vs[0]` endpoint ordering, i.e. it is the random
   per-collapse displacement the user saw.
2. Regression test `tests/test_dyntopo_nonaccum_collapse.cc`: a non-accumulate
   draw stroke, dyntopo collapse-only, on a flat face of a subdivided cube.
   Because the face is planar the stroke-start snapshot of every vertex in the
   dab has an exactly known `z`, so the invariant is
   `|orig.co.z − 0.25| < 1e-4` over the brushed region — a sharp equality, not a
   bound. The test must **fail before** the change.

*(No interim hardcoded handler was written: step 1 is a deletion, so the
gen-guarded pair goes straight onto the step-2 mechanism and there is no
throwaway to strip.)*

### Step 2 — the general mechanism

3. `attribute_enums.h`: add `AttrMerge`; bind it for reflection.
4. `attribute.h`: add `AttrMerge merge` + `AttrMergeFn merge_fn` to `AttrRef`.
   `merge` is reflected (it is a plain enum and useful when inspecting a layer);
   `merge_fn` is not — a function pointer is meaningless across a process, which
   is the whole reason the policy is re-derived rather than stored.
5. `attribute.h` / new `attr_merge.{h,cc}`: name-keyed builtin policy table +
   `resolveMergePolicy(type, name)`, called from `AttrGroup::ensure()`. Same
   pattern and same call site as `mandatoryBuiltinFlags`. Keyed on the pair, so
   a same-named layer of a different type does not inherit a policy.
6. `attr_interp.h`: `interpAttrs` / `interpAttrRows` dispatch on the policy;
   plumb `AttrMergeCtx` (including `merged_co`) from `collapseEdge` and
   `splitEdge`. `interpAttrRows` merges two *captured rows*, so a `CUSTOM`
   handler has no live element to inspect there and falls back to `DEFAULT`;
   `NONE`/`COPY_SRC0` still apply.
7. Move `.brush.orig.co/.no` (§3a) onto the shared gen-guarded handler, and
   `.brush.dab.gen` / `.brush.automask.gen` / `.brush.enhance.gen` onto a
   `mergeClearGen` handler (their value columns take `NONE`, since the handler
   that owns the guard owns the pair).
8. Unit test `tests/test_attr_merge.cc`: each policy value on a plain user
   layer; the gen-guarded handler across all four stamped/unstamped
   combinations, on both split and collapse; and `resolveMergePolicy` +
   `ensure()` stamping, which is the re-derivation path a reloaded file takes.

*A literal save→load round trip is not the assertion here:* every layer that
currently carries a policy is `TEMP`, so `serial::writeMesh` drops it and there
is nothing to reload. The property that matters — a layer born through
`ensure()` gets its policy, no matter who calls it — is what the test pins, and
`buildDomain` is just another `ensure()` caller.

Beyond the two operators named above, the remaining `interpAttrs` call sites
(`ops/loopcut.h`, `ops/subdivide.h` ×2, `remesh/triage.cc`) also pass `&m`.
Each creates a vertex at the lerp of its sources, i.e. the split case, so this
is free fidelity rather than a behavior change.

### Step 3 — `.slayer.rest`

9. `CUSTOM` handler per §3b, registered under `SCULPT_LAYER_REST_ATTR`.
10. Test (in `test_attr_merge.cc`): collapse with a `merged_co` that is **not**
    the endpoint midpoint; assert `co − rest` on the survivor is the
    interpolated delta, i.e. the base absorbed the remesh displacement. This is
    the case that is currently only accidentally correct.

### Gates

`node make.mjs test` (native ctest) plus the dyntopo regression set named in
`sculptcore/CLAUDE.md` — `test_dyntopo_cascade` / `_budget` / `_smooth`,
`test_spatial_dyntopo` / `_merge`, `test_edge_collapse`, `test_collapse_fuzz`,
`test_dyntopo_undo` — then `pnpm test` in the parent repo before committing.

**Result:** 108/112 pass. The four failures — `test_live_stroke`,
`test_bsmooth`, `test_automask_gpu`, `test_spatial_boundary_normals` — were
confirmed pre-existing by stashing the whole change, rebuilding, and re-running
exactly those four on the clean tree, where all four fail identically. (The
`failing-tests-sweep-2026-07-16` note says *three*; this worktree has four, and
the extra one predates this branch.)

## 5. Deferred follow-ups

Explicitly **not** in this change. Recorded so they are not silently lost.

1. **Retire the #37 pre-pass stamp.** `brush_executor.h:1737-1768` stamps the
   dab's seed region purely so dyntopo's attr interp never derefs an
   unmaterialized page. Once every handler goes through `safe_get`/`materialize`
   the pre-pass is redundant and costs an O(region) pass per dab. Remove it in a
   separate change, with a WASM *and* native run, since the original bug it
   patched was a native-only garbage deref.

2. **`COPY_SRC0` for `crossfield` and the displace frames.** Both use
   `NOINTERP` today, so a split vertex gets a **zero** direction until something
   recomputes it. Nearest-source copy is strictly better as an interim value.
   Deferred because it is a behavior change to the remesher's field, and it
   wants its own before/after on the quad-remesh gates rather than riding along
   with a bug fix.

3. **Corner-domain (`AttrGroup m.c.attrs`) merge policies.** `collapseEdge`'s
   wedge-aware UV fix-up (`edge_collapse.h:556-638`) is a hand-rolled,
   UV-specific `CUSTOM` merge that predates this mechanism. It should become a
   registered corner-domain handler, which also gives per-corner colors the same
   wedge treatment UVs get. Left alone here because it is subtle, well-tested,
   and orthogonal to the noise bug.

4. **`LayerEditScope` lifetime across in-dab topology change.** `layerRegionVerts`
   is collected *after* dyntopo runs (`brush_executor.h:645-685`), so the scope
   should be safe — but the behavior when a scoped vertex is killed by a *later*
   dab's collapse was **not verified** as part of this work. Worth an explicit
   test.

5. **Quadric/QEM collapse placement.** §3b's `.slayer.rest` handler is a no-op
   until some caller passes a `merged_co` that is not the endpoint midpoint.
   When better placement lands, that handler is the thing that keeps sculpt
   layers correct — the plan for it should reference this section.

6. **`AttrMerge` for `triangulateFaceFanCb` and `symmetrize`.** Both create
   elements and currently rely on snapshot/restore rather than `interpAttrs`,
   so they are unaffected today. If either grows an interpolating path it must
   route through the same policy rather than re-deriving one.
