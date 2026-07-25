# View-normal automasking (silhouette fade + backface culling)

Status: in progress — worktree `C:/dev/webgl-app-framework-normal-falloff`, branch
`normal-falloff`.

## Problem

Sculpting near the silhouette of a surface tears: a dab centred on geometry whose
normal is ~90° to the camera pushes front-facing and back-facing sheets of the
mesh in opposite screen directions, and the brush's spherical falloff happily
reaches through the surface to the far side. Blender solves this with the
"view normal" automask (`BRUSH_AUTOMASKING_VIEW_NORMAL`) plus a "front faces
only" option.

## Design

### One factor folded into the existing automask buffer

The cavity automask
([2026-07-14-2007-cavity-automasking.md](2026-07-14-2007-cavity-automasking.md))
already establishes the whole machinery: a per-vertex 0..1 scalar computed
**host-side in C++**, cached in a TEMP mesh attr keyed by a per-stroke
generation stamp, multiplied into `CommandCtx::strength()` on the CPU and packed
into GPU binding 24 by `packAutomask()`. Both backends read the *same*
precomputed numbers, which is what makes them bit-for-bit equal.

View-normal masking is a second contributor to that same scalar, so it needs
**zero** codegen / WGSL / `compute_layout.h` churn — binding 24 already exists
and every generated vertex kernel already multiplies by `automask[vid]`.

Consequences:

- `.brush.automask.cavity` → `.brush.automask.factor`, and
  `CommandCtxBase::automaskCavity` → `automaskFactor` (only 2 files referenced
  the old names). The attr is now a product of contributors, not cavity alone.
- The buffer is **vertex-domain**, so face-domain kernels (polygroup) never bind
  it and are unaffected by view-normal masking. Known limitation, same as cavity.

### The falloff formula

```
d = -dot(vertexNormal, viewDir)        // viewDir = unit eye->surface ray
if (!cull_backfaces) d = |d|           // symmetric: back faces fade like front
angle = acos(clamp(d, -1, 1))
factor = 0                       if angle >= limit
         1                       if angle <= limit - falloff
         (limit - angle)/falloff otherwise
```

Defaults `limit = 90°`, `falloff = 25°` → full strength until 65°, linear ramp to
0 at 90°.

Backface culling then falls out of a single `fabs()`:

- **off** — a normal facing directly away gives `d = |-1| = 1`, `angle = 0`, full
  strength. Front and back fade identically as they approach edge-on.
- **on** — that same normal gives `d = -1`, `angle = 180° >= limit`, factor 0.
  Everything past 90° is already beyond the limit, so it reads exactly 0.

### Where `viewDir` lives

On `Brush`, not `CommandCtxBase`. `packAutomask(mesh, brush, out)` already takes
the brush, so the GPU path needs no signature change and no uniform-layout churn
(cf. the unimplemented
[viewNoDistCtx.md](../../sculptcore/documentation/plans/viewNoDistCtx.md), which
would have added `viewNo`/`viewDist` as ctx builtins). The host writes it per dab
from `PaintSample.viewvec`, which is already object-local and normalized — the
same space as `mesh.v.no`.

### Stroke-static caching, symmetry, and the GPU fallback

The factor is stamped once per vertex per stroke (the existing `strokeGen` gate).
The camera doesn't move mid-stroke, so this is exact for the common case and is
what preserves CPU/GPU parity.

Under symmetry, `applyDabOne` mirrors the whole `PaintSample` (including
`viewvec`) per axis, so on the **CPU** each mirror image stamps its own region
with its own reflected `viewDir` — which is the correct behaviour. Verts in the
overlap right at a symmetry plane get first-writer-wins; acceptable.

The **GPU** automask is stroke-static for the *entire mesh*, packed once at
`GpuBrush_beginStroke` from the primary dab's `viewDir`, so a mirrored dab would
mask against the wrong ray. `GpuStrokeController.tryBegin` therefore declines
(→ CPU path) when view-normal masking and symmetry are both active.

### Settings shape

Three pieces, mirroring the existing `SHARED_SIZE` precedent exactly:

| piece | where |
|---|---|
| per-brush toggle | `BrushFlags.CULL_BACKFACES` on `SculptBrush.flag` |
| scene toggle | `SculptCorePaintMode.sceneCullBackfaces` |
| chooser flag | `BrushFlags.SHARED_CULL_BACKFACES` |

The UI binds one control to the `_cullBackfacesHelper` proxy (apiname
`cullBackfaces`) on the toolmode, which reads/writes the scene value or the brush
flag depending on the chooser — the same getter/setter trick `_brushSizeHelper`
uses for radius. The chooser renders as an icon button
(`PackFlags.HIDE_CHECK_MARKS`, new iconsheet cell `SHARED_BACKFACE_CULL`).

Enabling the fade itself is `BrushFlags.AUTOMASK_VIEW_NORMAL`, **on by default**
in the TS `SculptBrush.flag` initializer. The C++ `Brush::automask_view_normal`
defaults to `false` so existing native ctests / debug-scene dumps (which never set
`viewDir`) are unchanged.

## Work items

### sculptcore (C++)

1. `source/brush/automask.h` — `ViewNormalParams` + `viewNormalFactor()`.
2. `source/brush/brush.h` — `automask_view_normal`, `cull_backfaces`,
   `view_normal_limit`, `view_normal_falloff`, `viewDir`; `BIND_STRUCT_MEMBER`
   for each.
3. `source/brush/brush_command.h` — rename `automaskCavity` → `automaskFactor`.
4. `source/brush/brush_executor.h` — extend the host pre-fill: gate on cavity
   **or** view-normal, rename the attr, multiply the two contributors. Cavity
   still needs a live ring1 CSR; view-normal is topology-free, so a frozen-topo
   dab that can't build the CSR still applies the fade.
5. `source/brush/gpu_marshal.{h,cc}` — same in `packAutomask`.
6. `source/debug/gpu_stroke.cc` — widen the `automask_cavity` gate.
7. `tests/test_automask_view_normal.cc` — unit-test the formula and CPU/GPU
   agreement.

### TS app

8. `scripts/brush/brush_base.ts` — three new `BrushFlags`.
9. `scripts/brush/brush.ts` — `viewNormalLimit` / `viewNormalFalloff` (degrees)
   through STRUCT / defaults / `defineAPI` / `equals` / `calcHashKey` / `copyTo`;
   flag icon for the chooser; `AUTOMASK_VIEW_NORMAL` in the default flag.
10. `scripts/editors/view3d/tools/sculptcore.ts` — `sceneCullBackfaces` field +
    STRUCT entry, `_cullBackfacesHelper` proxy, `resolveCullBackfaces()`,
    sidebar panel, header icon button.
11. `scripts/editors/view3d/tools/sculptcore_bindings.ts` — sync the new fields
    (degrees → radians).
12. `scripts/editors/view3d/tools/sculptcore_ops.ts` — write `wasmBrush.viewDir`
    from `ps.viewvec` each dab, before GPU begin / `applyDab`; pass symmetry +
    masking state into `tryBegin`.
13. `scripts/editors/view3d/tools/sculptcore_gpu_stroke.ts` — the
    symmetry × view-normal CPU fallback gate.
14. `assets/iconsheet.svg` + `scripts/editors/icon_enum.js` — new
    `SHARED_BACKFACE_CULL` cell (index 146).

### Verification

`node make.mjs codegen` (no generated diff), `node make.mjs build native`,
`node make.mjs test`, `pnpm gen:paths`, `npx tsgo --noEmit`, `pnpm test`, and a
live NW.js sculpt across a sphere silhouette.

## Known limitations

- **Vertex kernels only.** The automask lives in a vertex-domain attr and, on the
  GPU, in the vertex-indexed binding-24 buffer. Face-domain kernels (`polygroup`)
  never bind it, so they honor neither cavity nor view-normal masking.
- **Symmetry falls back to the CPU.** The GPU packs one stroke-static automask
  from the primary dab's ray, so a mirrored stroke with view masking on runs on
  the CPU (`GpuStrokeController.tryBegin`), where each image stamps its own
  region with its own reflected ray.
- **Headless drivers mask nothing by default.** `runSculptcoreStroke` has no
  camera; it turns `automask_view_normal` off unless the caller passes
  `opts.viewDir`, so existing scripted strokes are bit-identical to before.
