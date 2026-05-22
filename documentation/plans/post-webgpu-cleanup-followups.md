# Post-WebGPU Cleanup Follow-Ups

Catalog of small, mostly-mechanical refactors uncovered during the Phase 8.1
comment sweep (renderengine-webgpu-port + overlays-port). Each entry is
self-contained — pick them off independently.

Ordering is rough effort, smallest first.

---

## 1. Delete the unreachable `if (this.gl === undefined) return` guard in `viewportDraw_intern`

**Files:** `scripts/editors/view3d/view3d.ts`

After the WebGPU-only rewrite, `this.gl` is the GL-stub Proxy minted by
`loadWgslShaderStubs` (or a real GL context on the fallback path) — it cannot
be `undefined` once the canvas has been initialised. The early-out is dead.
Confirm via a grep that nothing assigns `this.gl = undefined` post-init, then
drop the check.

**Effort:** 15 min.

---

## 2. Strip the `void _rctx; void _pass; void _projmat;` no-op pattern in `encodeOverlaysCB`

**Files:** `scripts/editors/view3d/view3d.ts`,
`scripts/renderengine/renderengine_realtime.ts`

The `void` statements exist solely to silence unused-param lints. Either
prefix the params with `_` in the callback type (`(_rctx, _pass, _projmat) =>
void`) and let the lint rule honour that, or — better — tighten the
`EncodeOverlaysCB` signature so callers that don't need the args can omit
them. The current shape leaks render-graph internals into the overlay
callbacks for no good reason.

**Effort:** 30 min.

---

## 3. Collapse the `view3dLike` casts in `viewportDraw_intern`

**Files:** `scripts/editors/view3d/view3d.ts`,
`scripts/editors/view3d/view3d_draw_webgpu.ts`

`viewportDraw_intern` currently does
`this as unknown as Parameters<typeof drawGridWebGpu>[0]` (and similarly for
`drawDrawLinesWebGpu`, `drawViewportWebGpu`) to bridge the public `View3D`
type to the narrower structural type the draw helpers want. Hoist that
structural type into a single named interface (`IViewportDrawContext` or
similar) in `view3d_draw_webgpu.ts`, export it, and have `View3D` `implements`
it. Three `as unknown as ...` casts disappear.

**Effort:** 1 hr.

---

## 4. Remove the remaining `isWebGPU()` callsites in `view3d.ts`

**Files:** `scripts/editors/view3d/view3d.ts` (lines 125, 1151, 1832)

Three callsites still gate on `isWebGPU()`: canvas init, `sculptcore_demo`
init guard, and the FPS counter's `gl.finish()` guard. With WebGPU as the
default, two of these collapse (canvas init is unconditional; `gl.finish` is
unreachable on the stub). The sculptcore guard wants a real
"do we have a GL context for the demo to run against" check, not a backend
flag — switch it to test for the underlying capability instead.

**Effort:** 1–2 hr (need to actually trace what each guard was protecting).

---

## 5. Refactor `ToolMode.on_drawstart` / `on_drawend` to drop the unused `gl` arg

**Files:** ~13 files across `scripts/editors/view3d/tools/`,
`addons/builtin/*/src/`, including `curvetest`, `graphit`, `parameterizer`,
`mesh_edit`, `pbvh`, `selecttool`, `sculptcore`.

The `gl: WebGL2RenderingContext` parameter is now always the GL stub Proxy
and effectively unused by every overlay that has been ported to WebGPU. Drop
it from the signature. This is the Phase 7.3 work that was deferred from the
main removal — purely mechanical but spans many files, so worth its own PR
with a tooling-assisted rewrite (codemod or `sed`).

**Effort:** 2–3 hr including a full test pass.

---

## 6. Delete `realtime_passes.ts` GLSL string constants now that nothing references them

**Files:** `scripts/renderengine/realtime_passes.ts` (if it survives),
plus any `import` statements.

Several GLSL shader strings in `realtime_passes.ts` (NormalPass /
AccumPass / SharpenPass fragment sources) were duplicated when WGSL
equivalents went into `scripts/shaders/wgsl_render_passes.ts`. Grep for
each constant; if it has zero importers, delete it. (Be careful — some
strings double as `.wgslKey` identity tokens, mirror of issue #10 below.
Verify with the same audit rule as the `shaders.ts` constants.)

**Effort:** 1 hr.

---

## 7. Unify `SimpleMesh` / `SimpleIsland` GPU buffer-upload helpers

**Files:** `scripts/webgl/simplemesh.ts`, `scripts/webgpu/batch.ts`,
`scripts/webgpu/buffer.ts`

`WebGPUBatchExecutor.uploadBuffer` and the per-layer upload logic inside
`SimpleIsland.drawGPU` both maintain a `Map<ptr, CachedGpuBuffer>` keyed on
the wasm buffer pointer and both re-implement the
"size changed → destroy & realloc" dance. Lift this into a single
`GpuBufferCache` helper in `webgpu/buffer.ts`, and have both call sites
consume it. Removes ~40 lines of duplication and makes the lifetime story
auditable in one place.

**Effort:** 2 hr.

---

## 8. Lift `_applySurfaceFormat` out of `WebGPUDrawQueueAdapter` for independent testing

**Files:** `scripts/webgpu/queue_adapter.ts`, `tests/unit/`

`_applySurfaceFormat` mutates pipeline descriptors based on the active
canvas surface format and is currently a private method on the queue
adapter. There's no test covering it because constructing the adapter
needs a full WebGPU device + render context. Extract it as a pure free
function that takes `(descriptor, surfaceFormat) => descriptor` and add a
unit test that exercises the BGRA8/RGBA8/sRGB matrix. Improves coverage
of the bit that's most likely to silently break when a new canvas format
appears.

**Effort:** 2 hr.

---

## 9. Consolidate the per-`RealtimeEngine` pipeline cache with the global `PipelineCache`

**Files:** `scripts/renderengine/renderengine_realtime.ts`,
`scripts/webgpu/pipeline.ts`

`RealtimeEngine` keeps a private `Map<string, Pipeline>` keyed on
shader-descriptor hash, parallel to the global `PipelineCache` consumed by
`WebGPUBatchExecutor`. Two caches means two eviction policies and two
opportunities to OOM the GPU. Drop the per-engine map, route all pipeline
creation through `PipelineCache`, and add a `release()` hook so the engine
can drop its references at viewport teardown without leaking the global
cache.

**Effort:** 3 hr — touches hot rendering code, needs a careful test.

---

## 10. Audit `loadWgslShaderStubs` Proxy stub: collapse silent no-ops, document the bypass set

**Files:** `scripts/editors/view3d/view3d_draw_webgpu.ts`

`SILENT_NOOP_METHODS` is hand-curated and has grown organically as legacy
GL code paths hit it during the migration. Now that WebGPU is the default,
do an audit pass: which entries are still hit at runtime (instrument with a
counter for one session)? Anything with zero hits is a candidate for moving
to the *throwing* set so a future regression surfaces fast. Anything with
non-zero hits is a candidate for porting the caller off `view3d.gl`
entirely.

**Effort:** half-day including the instrumentation + analysis pass.

---

## Notes

These ten items were all surfaced during the Phase 8.1 comment-sweep pass on
2026-05-22. They are *not* a complete cleanup — they are the items that
became obvious while reading every comment in every changed file. A second
sweep after the renderengine team has lived with the WebGPU-only world for a
few weeks will likely uncover another batch.

Deferred from the Phase 7 removal (kept here so they don't get lost):

- **Phase 7.3 — ToolMode signature refactor** (covered by item #5 above).
- **`isWebGPU()` callsite removal** (covered by item #4 above).
