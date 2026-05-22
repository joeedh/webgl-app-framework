# TODO — non-addon consumers of addon files

Tracking direct `scripts/**` → `addons/builtin/<id>/src/**` imports discovered
while doing the toolmodes-addons-refactor (plan §2/§3). These work today
(esbuild resolves by path) but violate the layering promise of plan §3.2 —
core/non-addon code should reach addon content through `@addon/<id>/api` or
runtime registries, not through path imports.

Promote depcruise warn → error (plan §4) only after these are cleaned up,
otherwise CI will explode.

## mesh addon consumers (still-outstanding from plan §3)

- `scripts/core/context.ts:8` — `import type {Mesh} from '../../addons/builtin/mesh/src/mesh.js'` (type-only; cheapest fix is `DataBlock`)
- `scripts/core/lib_api.ts:8` — `import type {Mesh} from '../../addons/builtin/mesh/src/mesh.js'` (type-only)
- `scripts/core/missing_addon.ts:29` — runtime `import {CustomDataElem} from '../../addons/builtin/mesh/src/customdata.js'` — needs runtime registry lookup
- `scripts/addon/addon_base.ts` — multiple direct imports of mesh subsurfaces (see plan §3; this file was partially slimmed during the mesh_edit move but mesh/customdata/bvh/etc. still re-exported from here)

## mesh_edit consumers (from PR mesh_edit move)

- `scripts/editors/view3d/view3d.ts:34` — `import '../../../addons/builtin/mesh_edit/src/mesheditor'` (side-effect, ensures the toolmode registers). Refactored from `./tools/mesheditor` when mesh_edit moved.
- `scripts/editors/view3d/tools/curvetool.ts:6` — `MeshToolBase` import (this file is *itself* moving into the curve addon below, so this becomes intra-addon when curve moves).

## curve addon consumers (this work)

After `scripts/curve/*` and `curvetool*.ts` move into `addons/builtin/curve/src/`:

- `scripts/camera/camera.ts:15` — `import type {CurveSpline}` (type-only; safe but layered-improper).
- `scripts/hair/strand_types.js:1` — `import {CurveSpline}` — **runtime**, `Strand extends CurveSpline`. Class-extends requires a static reference; can't be moved to runtime lookup without restructuring Strand. Either:
  - hair eventually becomes its own addon depending on curve, or
  - curve's class surface is exposed via a runtime accessor and Strand is recast as composition rather than inheritance.
- `scripts/data_api/api_define.js:41` — `import {CurveSpline}` — runtime; used to register the CurveSpline data API. Could move to an `api_register` hook on the addon's register() call.
- `addons/builtin/mesh/src/mesh_types.ts:348` — `import {KnotDataLayer}` — runtime, but this is **mesh addon → curve addon**. Currently mesh has no manifest dep on curve. Either:
  - mesh declares `dependencies: ['curve']` and reaches it via `@addon/curve/api` (creates a base-curve-then-mesh ordering), or
  - the `KnotDataLayer` CustomData type is registered via a runtime hook from the curve addon's register() (curve depends on mesh, registers its CustomData class into mesh's registry on load).
  The latter is the more idiomatic dependency-injection direction — mesh shouldn't know what KnotDataLayer is.

## Non-addon side-effect imports (registration triggers)

Some core-side files contain `import '…/addons/builtin/<id>/src/…'` purely
for the side effect of running `ToolMode.register(…)` / `nstructjs.register(…)`
at module load. These are the wiring points for the in-bundle (registerInternalAddon)
pattern. Should be reviewed during plan §4 cleanup to see if the
`scripts/entry_point.js` block can absorb them all:

- `scripts/entry_point.js` — `import '../addons/builtin/{mesh,subsurf,mesh_edit}/src/addon_register.js'`
- `scripts/editors/view3d/view3d.ts:34` — `import '../../../addons/builtin/mesh_edit/src/mesheditor'`

## Cross-addon path imports (still violate @addon/<id>/api boundary)

After the `@framework/api` rewrite, two cross-addon refs remain hard-coded to
`scripts/...` paths because the target class is announced by another addon
but actually lives in the main bundle (pre-extraction):

- `addons/builtin/mesh/src/mesh_ops.ts:3461` — `import {BVHToolMode} from '../../../../scripts/editors/view3d/tools/pbvh.js'` used only for an `instanceof` check at mesh_ops.ts:948. BVHToolMode is the pbvh_sculpt addon's public class; mesh shouldn't know about it. Either: (a) eliminate the `instanceof` check via a behavior interface on ToolMode, or (b) the pbvh_sculpt addon installs a "bvh sculpt is active" predicate into a shared context that mesh consults.

## WebGPU debug-capture coverage

The FBO debug editor's WebGPU path (`scripts/editors/debug/webgpu_debug.ts`)
only captures `render_final` today because the WebGPU draw path
(`scripts/editors/view3d/view3d_draw_webgpu.ts`) is the MVP that draws
straight to the canvas — it has no `RenderTarget`-based per-pass
intermediates yet. The WebGL counterpart
(`renderengine_realtime.ts:686–705`) iterates a full `rendergraph` and
captures each `FBOSocket` output (`NormalPass_fbo`, `AccumPass_fbo`,
`OutputPass_fbo`, etc).

Action when the WebGPU render graph lands (the TODO referenced in
`view3d_draw_webgpu.ts`'s `drawSceneWebGpu` comment block): at each
WGSL render-pass encode site, call
`getWebGpuDebug(device).pushTexture(passName, target.colors[0].handle, encoder)`
before the encoder is submitted. The debug editor's history dropdown
populates from the same registry, so new entries surface automatically.
