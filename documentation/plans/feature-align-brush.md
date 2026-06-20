# Feature-align smoothing brush (topology rake)

A sculpt brush that smooths geometry while biasing edge flow to follow a
per-vertex **cross field** seeded from boundary features and curvature — the
equivalent of Blender's topology rake, meant to be used together with dyntopo so
the freshly-remeshed triangles line up with features as you sculpt.

## Pieces

| Layer | File | Role |
|-------|------|------|
| Cross field | `sculptcore/source/brush/feature_field.{h,cc}` | Seed + diffuse the saved `crossfield` float3 vertex attr over a dab region |
| Kernel | `sculptcore/source/brush/kernels/featurealign.sbrush` | Cross-field-weighted Laplacian smooth (reads `crossfield`) |
| Dispatch | `sculptcore/source/brush/brushes/types.h`, `brushes/all.h`, `brush_executor.h` | `SculptBrushes::FEATURE_ALIGN = 19`; live-disk dispatch; per-dab field pre-pass in `execProgram` |
| Brush prop | `sculptcore/source/brush/brush.h` | `float rake` member (read by the kernel as the `@static` uniform `rake`) |
| TS enum | `scripts/brush/brush_enums.ts` | `SculptTools.FEATURE_ALIGN = 21` |
| TS bridge | `scripts/editors/view3d/tools/sculptcore_bindings.ts` | `TOOL_TO_SCULPTBRUSH`, `isSmoothTool`, `wasmBrush.rake` sync |
| TS brush | `scripts/brush/brush.ts` | default "Feature align" brush (rake 1.0, dyntopo on) |

## The cross field

A **cross field** (4-RoSy): each vertex stores one tangent direction `d`, but
`d` and its three 90°-about-normal rotations are all equivalent. Stored as a
persistent (saved), `NOINTERP` float3 vertex attribute named `crossfield`. It is
maintained incrementally — only the verts under the current dab are updated each
dab — so the field grows outward to cover the mesh as the stroke does, and
because it is saved it persists across sessions and re-loads.

`updateCrossFieldRegion` (run per dab from `CommandExecutor::execProgram`, before
the kernel) does three steps over the dab's vertex region:

1. **Seed — features (hard).** A vertex touching a sharp edge, a UV seam, a
   face-set (poly-group) boundary, or a mesh border is pinned to the tangent
   along its feature curve.
2. **Seed — curvature (soft).** Any still-unset interior vertex takes the local
   max-principal-curvature direction from its 1-ring shape operator (zero in
   flat regions, which then fall back to plain smoothing).
3. **Diffuse.** Non-pinned verts average their neighbours' directions with the
   **4-fold-aware** step: each neighbour direction is rotated to the nearest 90°
   image of the running accumulator before summing, so a cross direction and its
   quarter-turns reinforce instead of cancelling. Gauss-Seidel in the
   deterministic region order, so both backends (native + WASM) stay bit-equal.

## The smooth

`featurealign.sbrush` is a weighted Laplacian smooth. For each neighbour the edge
tangent's alignment to the **nearest of the cross's two axes** (`d`, `cross(n,d)`)
gives `align ∈ [0,1]`; the neighbour weight is `1 + rake·8·align⁴`, so
grid-aligned edges pull harder and the smoothed topology drifts to follow the
field. `rake = 0` reduces to plain Laplacian smoothing. `projection`
(`brush.smoothProj`) removes that fraction of the step's normal component for
tangential, volume-preserving sliding.

Like bsmooth it is also **boundary-aware**: it reads `.boundary.vert.class`
(refreshed for `FEATURE_ALIGN` in `execProgram`, same as bsmooth) and a boundary
vertex only averages neighbours that share a boundary type, so marked seams /
sharp / face-set borders stay put under the rake.

## Notes / follow-ups

- The kernel runs on the live-disk neighbour source (the field pre-pass needs
  live links anyway), so `FEATURE_ALIGN` always thaws topology.
- GPU (WGSL) A/B of the kernel and a headless parity/behaviour test are
  follow-ups; the kernel is WGSL-clean (no per-neighbour `continue`).
- The field pre-pass uses `faceNewellNormal` for the curvature dihedral so it is
  robust to stale `f.no`; vertex normals use `m.v.no` with a zero-guard.
