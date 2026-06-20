# Sculpt symmetry: mirror strokes + symmetrize tool

## Goal

Make the sculptcore toolmode honor its `symmetryAxes` flag by **mirroring brush
strokes**, and add a **symmetrize** tool that forces a LiteMesh to be symmetric
along a user-chosen set of axes. Both pieces are **TS-only** — no sculptcore C++
or N-API changes. Stroke mirroring replays the existing per-dab apply path with
the dab ray reflected about the mesh's **local** symmetry planes; the symmetrize
tool rewrites vertex positions from the TS side.

Symmetry is **object-local**: the mirror planes are the mesh's own axis planes
(X=0 / Y=0 / Z=0 in object space) through the local origin. This is robust under
any object transform (translation, rotation, scale) and matches how the
symmetrize tool already works (it operates directly on object-local vertex
positions), so a mesh sculpted with symmetry stays consistent with the
symmetrize result.

## Background — what already exists

The plumbing for this is almost entirely in place; the sculptcore op just never
calls it.

- **`symmetryAxes`** is a bitflag `{X:1, Y:2, Z:4}` owned by `PaintToolModeBase`
  (`scripts/editors/view3d/tools/pbvh_base.ts:553`, init `:604`) and already
  surfaced in the sculptcore header UI (`sculptcore.ts:335,361`, icons
  `Icons.SYM_X/Y/Z`) and the data API (`scene.tools.sculptcore.symmetryAxes`).
  Today nothing reads it in the sculptcore stroke path.
- **`SymAxisMap`** (`pbvh_base.ts:91-122`) maps a `symmetryAxes` value `0..7` to
  the list of component-negation multipliers (`Vector3`, e.g. `[-1,1,1]` for X)
  needed to generate every mirror image for that axis combination. The X+Y+Z
  entry has all 7 reflections. This is the canonical "which reflections" table —
  reuse it, don't re-derive.
- **`PaintSample.mirror(mul)`** (`pbvh_paintsample.ts:182-201`) reflects a sample
  in place (sign-flip `p`/`viewvec`/`vec`/… by `mul`). We do **not** use it for
  the stroke path — because we mirror in object-local space we reflect the
  *object-local ray* inside the dab core instead (A.3), which is a pure sign flip
  about the local origin and needs no sample copy. `mirror`/`copy` remain useful
  for the legacy world-space PBVH path; leave them.
- **The sculptcore dab path** is `SculptPaintOp.applyDab(ctx, ps)`
  (`scripts/editors/view3d/tools/sculptcore_ops.ts:248-382`). The driver base
  `StrokeDriverOp` calls `this.applyDab(...)` once per evenly-spaced sample
  (`stroke_paint_op.ts:191`); its doc comment already states *"Mirroring, undo
  logging and the actual dab application all stay in the subclass."* So mirroring
  belongs here, in the subclass.
- **Coordinate flow inside `applyDab`**: `ps.viewvec` / `ps.vieworigin` start in
  **world space** (camera ray). The op multiplies them by the object inverse
  matrix (`:271-275`), raycasts in object-local space (`mesh.rayCast`, `:277`),
  and feeds the object-local hit `p` + `normal` to `wasmExec.applyDab(...)`
  (`:364`). Note it **mutates `ps.viewvec`/`ps.vieworigin` in place** — so each
  mirror image must operate on a *copy*.
- **Prior art**: the legacy/WebGL grab brush already does axis symmetry with this
  exact table — `pbvh_sculptops.ts:1228` (`initGrabData`) loops `SymAxisMap[sym]`
  and gathers mirrored vertex sets. We are doing the stroke-replay analogue.

---

## Part A — Mirror sculpt strokes

### A.1 Coordinate space — object-local

We mirror in the **object's local space**: the symmetry planes are the mesh's own
axis planes through the local origin (X=0 / Y=0 / Z=0 in object coordinates).
This is the natural place to do it because `applyDab` *already* converts the
camera ray into object-local space before raycasting (`sculptcore_ops.ts:271-275`):
we simply reflect that object-local ray with a pure sign flip before the raycast.

Properties:

- **Transform-robust** — reflection happens after the world→object transform, so
  arbitrary object translation/rotation/scale is irrelevant; the mesh is always
  mirrored about its own axes (Blender's sculpt-symmetry behavior).
- **Consistent with the symmetrize tool** — that tool edits object-local vertex
  positions about the same local planes (Part B), so a symmetry-sculpted mesh and
  a symmetrized mesh agree.
- **Minimal math** — the reflection is exactly the `SymAxisMap` multiplier (e.g.
  `[-1,1,1]`) applied to the object-local ray origin and direction. No pivot, no
  per-sample `PaintSample.copy()`/`mirror()`; the mirror multiplier is threaded
  straight into the dab core (A.3).

### A.2 Refactor `applyDab` into single-dab core + mirror loop

In `sculptcore_ops.ts`:

1. **Extract** the current body of `applyDab` (everything from `getBrush` /
   raycast through `wasmExec.applyDab` and the trailing `regenTreeBatch` /
   `spatial.update`) into a private `applyDabOne(ctx, ps)`. Keep the brush
   *overlay* drawing (`view3d.resetDrawLines()` / `toolmode.drawBrush(...)`,
   `:256-262`) in the **outer** `applyDab` so the cursor draws once, at the real
   (unmirrored) sample.
2. **`applyDabOne(ctx, ps, mul?, mirrorIdx)`** takes the object-local mirror
   multiplier (default identity `[1,1,1]` = primary dab) and the mirror image
   index (for per-image grab state, A.5). It applies `mul` to the object-local
   ray (A.3) before the raycast; everything downstream is already object-local
   and lands on the mirrored side.
3. **Rewrite `applyDab(ctx, ps)`** to:
   - draw the brush overlay once for the real sample (moved out of the core),
   - `applyDabOne(ctx, ps, undefined, 0)` for the primary dab,
   - read `symmetryAxes`, and for each `mul` in `SymAxisMap[symmetryAxes]` (index
     `i`): `applyDabOne(ctx, ps, mul, i+1)`.

```ts
applyDab(ctx, ps) {
  // overlay draw for the real sample (unchanged, moved here) …
  this.applyDabOne(ctx, ps, undefined, 0)

  const sym = this.getSymmetryAxes(ctx)          // A.4
  if (sym === 0) return
  const muls = SymAxisMap[sym]
  for (let i = 0; i < muls.length; i++) {
    this.applyDabOne(ctx, ps, muls[i], i + 1)
  }
}
```

No `PaintSample.copy()` is needed — the same `ps` is passed to every call and the
reflection is applied to *local copies* of its ray inside `applyDabOne` (A.3). As
a prerequisite, fix the current in-place mutation: `applyDab` today writes the
object-local ray back into `ps.viewvec`/`ps.vieworigin` via `multVecMatrix`
(`:267-268,274-275`); move that to local `Vector3` copies so repeated calls with
the same `ps` don't compound.

### A.3 Reflecting the object-local ray

The reflection lives inside `applyDabOne`, right after the world→object
transform of the camera ray. Restructured (replacing `:267-277`):

```ts
const obmat   = new Matrix4(ctx.object!.outputs.matrix.getValue())
const imatrix = new Matrix4(obmat); imatrix.invert()

// local copies — never mutate the shared ps (lets us reuse it per mirror image)
const origin  = new Vector3(ps.vieworigin); origin.multVecMatrix(imatrix)
const viewvec = new Vector3(ps.viewvec);    viewvec.multVecMatrix(imatrix)

if (mul) {                       // reflect about the local origin planes
  origin.mul(mul)                // point: sign-flip components (plane through 0)
  viewvec.mul(mul)               // direction: sign-flip components
}

const isect = mesh.rayCast(origin, viewvec)
```

Because the symmetry plane is the local origin, a point reflection is the same
pure sign flip as a direction reflection — no pivot term. The raycast hit `p`
and `normal` come back in object-local space already on the mirrored side, so the
rest of `applyDabOne` (radius projection via `ps.rendermat`, `resolvePlaneDabNormal`
with the now-mirrored `viewvec`, grab vectors, `wasmExec.applyDab`) is unchanged
and correct. No new helper, no `PaintSample` mutation.

### A.4 Reading `symmetryAxes` (and making replay deterministic)

The live value lives on the toolmode: `(ctx.toolmode as SculptCorePaintMode).symmetryAxes`.
For the interactive stroke, read it there. But `SculptPaintOp.exec` can replay
`inputs.samples` (`:416-419`) where `ctx.toolmode` may differ — so **snapshot it
as an op input** for determinism:

- Add `symmetryAxes: new IntProperty(0)` (or a `FlagProperty {X,Y,Z}`) to
  `SculptPaintOp` inputs (it currently declares `inputs: {}` at `:82`).
- In `undoPre` (`:118`) copy the toolmode value into the input:
  `this.inputs.symmetryAxes.setValue((ctx.toolmode as SculptCorePaintMode)?.symmetryAxes ?? 0)`.
- `getSymmetryAxes(ctx)` returns the input value, falling back to the toolmode.

This mirrors how the legacy `PaintOpBase.tooldef` already carries `symmetryAxes`
as a `FlagProperty` input (`pbvh_base.ts:643,715`).

### A.5 Per-mirror-image stroke state (grab brushes & dyntopo)

`applyDabOne` carries two pieces of cross-dab state that must **not** be shared
across mirror images:

- **`this.prevDabLocal`** (grab/kelvinlet, `:64,358`) — the previous dab's
  object-local center, used to compute the grab delta. Each mirror image traces
  its own path, so a single `prevDabLocal` would corrupt the others. Replace the
  scalar with a small map keyed by mirror index (e.g. `prevDabLocal: Vector3[]`,
  index 0 = primary, 1..n = `SymAxisMap` order). Pass the mirror index into
  `applyDabOne`. Reset the whole array in `undoPre` (alongside `:123`).
- **`this.dabSeed`** (dyntopo independent-set seed, `:58,364`) — increment it per
  `applyDabOne` call (primary + every mirror) so each remesh round stays
  deterministic and distinct. Today it increments once per dab; with N mirror
  images it should advance N+1 times. No correctness issue either way, but keep
  it monotonic.

Everything else `applyDabOne` touches (executor, brushProgram, dynTopoParams,
meshLog) is intentionally shared and per-dab-rebuilt — leave as is. All mirror
dabs land in the **same** meshLog step opened in `undoPre`, so undo/redo already
covers them with no extra work.

### A.6 Edge cases

- **Mirrored ray misses the surface** — `applyDabOne` already early-returns when
  `mesh.rayCast` is undefined (`:281-283`). A mirror image off the mesh is simply
  skipped; no special handling.
- **`symmetryAxes === 0`** — skip the loop entirely (one dab, current behavior).
- **Plane/grab/polygroup brushes** — they read normal/viewvec/group from the
  (already mirrored) sample and the fresh raycast, so they mirror correctly once
  `prevDabLocal` is per-image (A.5). Poly-group `strokeGroupId` stays shared (the
  whole symmetric stroke is one group) — correct.
- **Performance** — N+1 raycasts + dabs per sample (N≤7 for X+Y+Z). Acceptable;
  dyntopo already dominates. No batching needed for v1.

---

## Part B — Symmetrize tool

A whole-mesh op that makes a LiteMesh symmetric along a user-chosen axis set.
Pairs naturally with mirrored strokes: a mesh sculpted with symmetry on has
near-symmetric topology, so a **topology-preserving positional** symmetrize is
enough and avoids any C++ topology surgery.

### B.1 Op shape

New `SymmetrizeLiteMeshOp extends LiteMeshAttrOp` in
`scripts/lite-mesh/litemesh_ops.ts` (same file/conventions as
`TriangulateLiteMeshOp:689` and `QuadRemeshLiteMeshOp:740`):

```ts
static tooldef() {
  return {
    toolpath: 'litemesh.symmetrize',
    uiname  : 'Symmetrize',
    icon    : Icons.SYMMETRIZE,                     // already used by mesh.symmetrize
    inputs: ToolOp.inherit({
      axes     : new FlagProperty(1, {X:1, Y:2, Z:4}).saveLastValue(),
      direction: new EnumProperty(1, {NEGATIVE:-1, POSITIVE:1}).saveLastValue(),
      threshold: new FloatProperty(1e-4).setRange(0, 2).noUnits().saveLastValue(),
    }),
  }
}
```

- `axes` — bitflag, same `{X,Y,Z}` enum as `symmetryAxes` so the UI/iconography
  matches the sculpt symmetry toggle.
- `direction` — which side is the source of truth (copy +→− or −→+).
- `threshold` — vertices within this distance of a symmetry plane snap exactly
  onto it (kills seam cracks).

### B.2 Algorithm (topology-preserving, per axis)

For each enabled axis `a` (process independently, in X,Y,Z order):

1. Read positions via `mesh.verts.positions` (`Float3Attribute`,
   `litemesh.ts:134`); vertex count from the attribute.
2. Build a spatial lookup over **source-side** vertices (those with
   `sign(p[a]) === direction`, plus on-plane verts). Reuse the mesh's existing
   acceleration if a TS nearest-vertex query is exposed; otherwise build a
   throwaway KD-tree over the source positions (the mesh KD-tree grid at
   `addons/builtin/mesh/src/mesh_grids_kdtree.ts` is a usable reference, or a
   small local kd-tree over the flat position array — positions are object-local,
   the natural space for this).
3. For each **destination-side** vertex `v` (`sign(p[a]) === −direction`):
   - mirror its position across plane `a` (`m = p; m[a] = −m[a]`),
   - find the nearest source vertex `s` to `m`,
   - set `p(v)[a..] = mirror(p(s))` (copy `s`'s position reflected back to `v`'s
     side). Optionally average instead of copy for a softer result — copy is the
     predictable default.
4. **On-plane snap**: any vertex with `|p[a]| < threshold` gets `p[a] = 0`.
5. Leave topology, attributes, and vertex indices untouched — positions only.

This makes the mesh geometrically symmetric without bisect/weld. It assumes the
two sides have corresponding vertices (true for symmetry-sculpted meshes and for
primitives); document that strongly-asymmetric topology will get an approximate
result. A topology-rebuilding variant (bisect → mirror → weld, à la
`addons/builtin/mesh/src/mesh_utils.ts:920 symmetrizeMesh`) is a **future**
option if exact mirrored topology is ever required — that one needs C++ mesh
editing and is out of scope for the TS-only goal.

### B.3 Commit + undo

- After writing positions: `mesh.regenTreeBatch()`, `mesh.spatial.update(mesh.wasm.gpu)`,
  `mesh.recalcNormals?.()` / `regenRender`, `window.redraw_all?.()` — match the
  refresh sequence at the end of `applyDab` (`sculptcore_ops.ts:379-381`).
- Undo: snapshot/restore via the established blob pattern —
  `undoPre` stores `mesh.serialize()`, `undo` calls
  `mesh._replaceMesh(wasm.Mesh_deserialize(blob))`, `calcUndoMem` returns the
  blob length (copy `TriangulateLiteMeshOp:701-727` verbatim). Whole-mesh op →
  blob undo is simplest and already used by the quad remesher.

### B.4 UI wiring

- Add a "Symmetrize" button to the sculptcore toolmode header
  (`sculptcore.ts buildHeader`, near the `symmetryAxes` strip at `:335,361`) and
  to any sculpt/mesh menu that lists `litemesh.*` tools.
- The header button can pass the current `symmetryAxes` as the default `axes`
  so "symmetrize" matches the active mirror setting in one click
  (`tool('litemesh.symmetrize(axes=…)')`).
- Run `pnpm gen:paths` after adding the op's data-API-visible inputs so the
  catalog/datapaths stay in sync (per CLAUDE.md "Data API paths").

---

## File-by-file change list

| File | Change |
|------|--------|
| `scripts/editors/view3d/tools/sculptcore_ops.ts` | Split `applyDab`→`applyDabOne(ctx, ps, mul?, mirrorIdx)` + mirror loop (A.2); reflect the object-local ray by `mul`, work on local ray copies (A.3); add `symmetryAxes` input + `getSymmetryAxes` (A.4); make `prevDabLocal` per-mirror-image, bump `dabSeed` per dab (A.5) |
| `scripts/editors/view3d/tools/pbvh_paintsample.ts` | No change (legacy `mirror`/`copy` untouched) |
| `scripts/lite-mesh/litemesh_ops.ts` | New `SymmetrizeLiteMeshOp` (B) + `ToolOp.register` |
| `scripts/editors/view3d/tools/sculptcore.ts` | Header "Symmetrize" button; nothing needed for stroke mirroring (already exposes `symmetryAxes`) |
| `scripts/data_api/generated/*` | Regenerated by `pnpm gen:paths` |
| `documentation/` | Note the world-space-pivot symmetry semantics + caveat (A.1) |

Import `SymAxisMap` into `sculptcore_ops.ts` from `pbvh_base.ts` (already the
home of the table).

---

## Testing

- **Unit / integration (`tests/integration/`)** — extend the existing scripted
  stroke driver used by `sculptcore_brushes.test.ts` (`__brushTest()` via
  `--eval`, see CLAUDE.md "Native sculptcore backend"): run a single off-center
  Draw dab with `symmetryAxes = X`, assert the displacement appears mirrored
  across the plane (sample two symmetric vertices, expect equal normal offset).
  Repeat for X+Y+Z (expect 8 affected regions). Both backends.
- **Symmetrize** — build the `litemesh-cube` test scene, nudge a few verts on one
  side, run `litemesh.symmetrize(axes=X)`, assert `|p[a]| symmetry`: for every
  vertex there is a counterpart with negated X and equal Y,Z within tolerance.
- **Undo** — stroke-with-symmetry then undo restores the mesh (covered by the
  shared meshLog step); symmetrize then undo restores via the serialize blob.
- **Manual** — Electron harness `--run "sculptcore.paint(...)"` is awkward for
  modal strokes; prefer the `__brushTest` eval path. Visual check with symmetry
  X/Y/Z toggles in the live app.

## Open questions / decisions for the owner

1. **Mirror space (A.1)** — **decided: object-local** (reflect the object-local
   ray about the mesh's own axis planes). Transform-robust and consistent with
   the symmetrize tool; no world-space pivot needed.
2. **Symmetrize matching (B.2)** — copy source→dest (predictable) vs. average
   both sides (smoother, but drifts the source). Default: copy.
3. **Symmetrize topology** — positional-only (this plan, TS-only) vs. a future
   bisect/mirror/weld that guarantees mirrored topology (needs C++). Confirm
   positional-only is acceptable for v1.
