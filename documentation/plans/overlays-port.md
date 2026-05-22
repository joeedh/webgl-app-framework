# View3D Overlays WebGL → WebGPU Port

**Date:** 2026-05-21
**Status:** Planning
**Prerequisite:** [renderengine-webgpu-port-2026-05-21.md](renderengine-webgpu-port-2026-05-21.md) must land first.
**Parent:** [webgl-to-webgpu-migration-2026-05-20.md](webgl-to-webgpu-migration-2026-05-20.md)

## Context

This plan assumes the renderengine port has shipped. At that point `RealtimeEngine` runs entirely on WebGPU, but `extraDrawCB` (the overlay callback fired from inside the old GL `BasePass`) is no-op'd — meaning the user sees their scene but no grid, no widgets, no debug lines, no toolmode overlays, no non-renderable scene objects, no sculptcore demo. This plan brings all of that back on WebGPU.

The audit found the actual surface is smaller than feared:

- `drawThreeScene()` is a noop stub (`view3d.ts:1492`) — delete entirely.
- Grid and `drawDrawLines` already have stub ports in `view3d_draw_webgpu.ts` (`drawGridWebGpu` at line 467, `drawDrawLinesWebGpu` at line 490) — needs finishing, not greenfield work.
- Only **2 of 4 toolmodes** override draw callbacks: `BVHToolMode` (`pbvh.ts:681`) uses `ObjectLineShader` for debug geometry; `SculptCorePaintMode` (`sculptcore.ts:610`) uses 2D canvas overdraw — **not GL at all** — so it's unaffected by the port.
- Widgets are 8 mesh shape variants (Torus, Arrow, BlockArrow, Sphere, Plane, Chevron, DoubleChevron, base WidgetShape) all using one shader: `WidgetMeshShader` (`shaders.ts:1411`).
- Sculptcore demo (`view3d.ts:1590`) is the biggest single item — uses `WebGLBatchExecutor` with `BasicLineShader2` + `BasicLitMesh2`. WebGPU executor exists (`scripts/webgpu/batch.ts`) but the demo isn't wired to it.

**Total distinct overlay shaders to port:** 5 — `BasicLineShader`, `ObjectLineShader`, `BasicLitMesh`, `WidgetMeshShader`, `BasicLineShader2` / `BasicLitMesh2`. (Sculptcore demo's two shaders may already be in the WGSL registry from the parent migration — verify in Phase 0.)

## Goal

End state: every overlay system that ran under `extraDrawCB` (and the sibling `widgets.draw` / `drawDrawLines` calls) runs on WebGPU, encoded into the same command encoder as the renderengine. `View3D.draw()` no longer mentions `gl.*`. The `extraDrawCB` plumbing on `RealtimeEngine` is deleted; overlays encode directly via the engine's `WebGpuRenderContext`.

## Out of scope

- **Per-sample AA jitter for overlays.** The GL path got this "for free" because `extraDrawCB` fired inside the per-sample BasePass. We're moving overlays to encode **once** between BasePass and AccumPass, so line edges will alias at low sample counts. Acceptable tradeoff — re-encoding overlays N-times-per-frame is wasteful and complicates the encoder lifecycle. If aliasing turns out to be unacceptable in practice, revisit as a follow-up.
- **Texpaint / pbvh_texpaint.** Already deferred by the parent migration; stays on GL behind `TexpaintBridge`.
- **`MeshBatch` SimpleMesh unification** (Phase 0a of the parent migration). If it hasn't landed by the time this plan runs, work around it — don't block on it.

---

## Phase 0 — Inventory verification (no code)

**0.1** Confirm the post-renderengine-port state matches assumptions:
- `extraDrawCB` is no-op'd in `RealtimeEngine`.
- `view3d_draw_webgpu.ts` `drawGridWebGpu` and `drawDrawLinesWebGpu` stubs still exist (or were deleted — if deleted, re-add scaffolding).
- `SHOW_RENDER` / `ONLY_RENDER` path correctly routes through WebGPU.

**0.2** Confirm WGSL shader coverage. Compare the overlay shader list (`BasicLineShader`, `ObjectLineShader`, `BasicLitMesh`, `WidgetMeshShader`, `BasicLineShader2`, `BasicLitMesh2`) against `scripts/shaders/wgsl_shaders.ts` registry. List which are missing — they get added in Phase 1 / 2 / 3 respectively.

**0.3** Confirm `SimpleMesh.draw()` → `createDrawQueue` → `WebGPUDrawQueueAdapter` routing actually works for the overlay vertex layouts (`LOC|UV|COLOR`, `LOC|NORMAL|COLOR`). The parent migration set this up but overlays may exercise layouts not previously tested.

---

## Phase 1 — Encoder lifecycle + shared infrastructure

This is the foundation everything else builds on. Without it, each subsequent phase invents its own ad-hoc encoder management.

**1.1** Add an **overlay pass** node to the WebGPU render graph between BasePass/AccumPass and OutputPass. It binds the accumulator's color+depth target and stays open across all overlay encoders for one frame. Implementation: extend `WebGpuRenderGraph` to accept a `DispatchHooks.encodeOverlays(pass)` hook called between AccumPass and OutputPass, OR introduce an `OVERLAY_PASS` node type with its own hook. Prefer the former — fewer changes to the graph schema.

**1.2** Expose `WebGpuRenderContext` on `RealtimeEngine` so overlay callers can encode against the live encoder. Add an `engine.encodeOverlay(cb: (pass: GPURenderPassEncoder) => void)` convenience.

**1.3** Replace the `extraDrawCB(matrix)` signature on `RealtimeEngine`. New signature: `encodeOverlaysCB?: (rctx: WebGpuRenderContext, pass: GPURenderPassEncoder, projmat: Matrix4) => void`. View3D rebuilds its `finish` callback to use this. The jittered projection matrix from BasePass flows through unchanged.

**1.4** Sort out depth-state inheritance. Overlays expect "depth test on, depth write on" by default (matches old GL state at `view3d.ts:1609-1610`). Bake this into the overlay pass's pipeline-state defaults; individual overlays override per-draw (`drawDrawLines` toggles depth between its two passes — see Phase 4).

**Definition of done:** Empty overlay pass encodes successfully each frame; `extraDrawCB` is replaced by `encodeOverlaysCB`; visual output unchanged (no overlays yet).

---

## Phase 2 — Grid + drawDrawLines (finish the stubs)

These already have WebGPU stubs and are the simplest cases — get them working end-to-end to validate Phase 1's plumbing.

**2.1** **Grid** (`view3d.ts:1612-1625`, stub at `view3d_draw_webgpu.ts:467`).
- Confirm WGSL port of `BasicLineShader` exists in registry. If not, port it (vertex: position + uv + color, projection xform, polygon-offset uniform; fragment: color * alpha with smooth-line feather).
- Grid `SimpleMesh` is persistent — created once in `View3D.makeGrid()` at `view3d.ts:1263`. Confirm its vertex buffer survives in the WebGPU path (drawqueue adapter caches GPU buffers per SimpleMesh identity).
- Wire `drawGridWebGpu` into the new `encodeOverlaysCB`.

**2.2** **drawDrawLines** (`view3d.ts:1662`, stub at `view3d_draw_webgpu.ts:490`).
- Two-pass: depth-test-off lines first, depth-test-on lines second. Each pass is a fresh `SimpleMesh` rebuilt every frame (cheap — debug lines are sparse).
- Both use `BasicLineShader`, so depends on the same WGSL port from 2.1.
- The current stub reconstructs SimpleMesh each frame — keep that pattern.

**Definition of done:** Grid is visible, debug `view3d.drawline(...)` calls render correctly with and without depth.

---

## Phase 3 — drawObjects (non-renderable scene objects)

**3.1** `View3D.drawObjects()` at `view3d.ts:1813` iterates visible scene objects and calls per-object draw. For renderables this routes through the parent migration's WebGPU pipeline; for **non-renderables** (empties, helpers, light shapes, camera frustum mesh) it's separate code.

**3.2** Inventory non-renderable object types: empties, lights (icon meshes), cameras (frustum lines), helpers. For each, find the `.draw()` implementation and confirm whether it already routes through `createDrawQueue`. If yes (likely — parent migration covered this), nothing to do beyond plumbing the call site into `encodeOverlaysCB`. If no, port the per-object draw to use the queue adapter.

**3.3** Confirm `BasicLitMesh` (`shaders.ts:303`) is in the WGSL registry. If not, port it: vertex Phong xform + normal-to-camera, fragment diffuse + simple specular + vertex-color override.

**3.4** Toolmode `drawObject` override path. `ToolMode.drawObject(view3d, ob)` can intercept per-object drawing (`view3d_toolmode.ts`). Ensure the toolmode's override (if any) flows through the queue adapter same as the default path.

**Definition of done:** Empties/lights/cameras are visible in viewport; selecting one and entering edit modes preserves the override behavior.

---

## Phase 4 — Widgets

**4.1** `WidgetManager.draw()` at `widgets/widgets.ts:1385`. Walks widget hierarchy, calls `shape.draw(gl, manager, matrix, alpha)` per widget. 8 shape variants share one shader (`WidgetMeshShader`).

**4.2** Port `WidgetMeshShader` to WGSL — vertex (object+projection xform, position + normal + uv), fragment (solid uniform color, smooth-line feather, alpha blend).

**4.3** Refactor `shape.draw(gl, ...)` to `shape.encode(rctx, pass, manager, matrix, alpha)`. Each shape is already a `SimpleMesh` underneath — the queue adapter handles vertex buffers. The change is plumbing arguments, not geometry.

**4.4** Each of the 8 shapes (`WidgetShape`, `WidgetTorus`, `WidgetArrow`, `WidgetBlockArrow`, `WidgetSphere`, `WidgetPlane`, `WidgetChevron`, `WidgetDoubleChevron`) — verify mesh generation still produces valid `SimpleMesh` instances; no per-shape WGSL needed.

**4.5** Alpha blending. Widgets render translucent. Pipeline descriptor needs `blend: {color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha'}}`. Bake this into the widget pipeline variant in the registry.

**4.6** Selection / highlight state. Widget color comes from `WidgetBase.highlight`/`.active` flags via uniform; uniform routing through queue adapter should already work.

**Definition of done:** Transform gizmos (translate/rotate/scale) appear in viewport, highlight on hover, and remain usable.

---

## Phase 5 — Toolmode overlays

**5.1** `BVHToolMode.on_drawend` (`pbvh.ts:681`). Draws debug sphere + cached BVH geometry using `ObjectLineShader` (`shaders.ts:189`).
- Port `ObjectLineShader` to WGSL (it extends `BasicLineShader` with an object-ID attribute; the WGSL variant adds one `@location` for object_id).
- Refactor `on_drawend(view3d, gl)` to `on_drawend(view3d, rctx, pass)`. Update `ToolMode.on_drawstart`/`on_drawend` base signatures at `view3d_toolmode.ts:477-481`.
- Per-node debug mesh draws (lines 710-760) become queue submissions.

**5.2** `SculptCorePaintMode.on_drawend` (`sculptcore.ts:610`). Brush preview is **2D canvas overdraw** — does not touch GL. Confirm `view3d.overdraw.circle()` continues working alongside WebGPU (it draws to an overlay HTML element / 2D canvas, not the GL canvas). If it does — no work needed beyond updating the method signature.

**5.3** `ObjectEditor.on_drawstart/on_drawend` (`selecttool.ts:207`) — empty stubs. Update signatures only.

**5.4** `PanToolMode` — no draw overrides. Nothing to do.

**5.5** Audit for any newer toolmodes added since the audit was taken (run `grep -r "on_drawstart\|on_drawend" addons/ scripts/editors/`). Port any new GL-using overrides.

**Definition of done:** Sculpt mode shows brush cursor; debug visualizations in BVHToolMode render correctly; selection works in all modes.

---

## Phase 6 — Sculptcore demo

**6.1** `sculptcore_demo.drawSculptcoreDemo(gl, ...)` at `view3d.ts:1590`. Uses `WebGLBatchExecutor` via `scripts/webgl/batch.ts`. WebGPU equivalent (`WebGPUBatchExecutor`) exists at `scripts/webgpu/batch.ts`.

**6.2** Branch the demo entry point: when `useWebGPU` (now permanent post-renderengine-port), route through `WebGPUBatchExecutor`. The executor needs the active render pass encoder, not just the device — feed it via `rctx`.

**6.3** Confirm `BasicLineShader2` and `BasicLitMesh2` exist in the WGSL registry (parent migration Phase 2 should have ported these). If they don't, port them — both are variants of their non-`2` counterparts that were already added.

**6.4** WASM batch upload path. The executor's `submit(submission)` uploads `Buffer`s from wasm and encodes draws. The WebGPU executor already handles this; verify it works with the sculptcore demo's specific batch shape (lines + lit mesh interleaved).

**Definition of done:** With `view3d.flag & SHOW_SCULPTCORE_DEMO`, the demo renders correctly in WebGPU.

---

## Phase 7 — Cleanup

**7.1** Delete `drawThreeScene` from `view3d.ts:1492` — it's been a noop stub. Don't preserve a corpse.

**7.2** Strip all `this.gl` / `gl: WebGL2RenderingContext` references from `View3D.draw()` and its helpers. The only remaining GL touchpoint should be `TexpaintBridge`.

**7.3** Delete the old `ToolMode.on_drawstart(view3d, gl)` / `on_drawend(view3d, gl)` signatures. Confirm no addons in `addons/builtin/` still implement the old shape.

**7.4** Delete `extraDrawCB` from `RealtimeEngine` and `IRenderEngine` — `encodeOverlaysCB` (Phase 1.3) is the new contract.

**7.5** Audit `scripts/shaders/shaders.ts` — for any shader that was only used by overlays and now has a WGSL twin, mark the GLSL variant `@deprecated` (don't delete until full parent migration is done; sculpt tools may still use them).

**Definition of done:** `grep -in "WebGL\|gl\\.\|WebGL2RenderingContext" scripts/editors/view3d/view3d.ts widgets/` returns zero hits outside of comments.

---

## Risks & open questions

1. **Per-sample AA loss on overlay lines.** The biggest user-visible regression. Worth a quick visual A/B before declaring done. Mitigation if bad: a single MSAA-resolved overlay target (cheaper than per-sample re-encoding).

2. **Encoder reentrance.** Phase 1 keeps the overlay render pass open across the whole `encodeOverlaysCB` callback. If any overlay implementation tries to open its own render pass mid-callback (e.g., for a stencil-buffer trick), it'll fail. Audit during Phase 5 — toolmode overlays sometimes do unusual things.

3. **Widget alpha blend ordering.** Widgets currently draw in tree order with depth test on. With multiple translucent gizmos this can produce wrong compositing. Existing behavior preserved by this plan; revisit if users complain.

4. **`drawObjects` toolmode interception.** If `ToolMode.drawObject(view3d, ob)` does anything funky (e.g., wireframe overlays via two-pass draws), Phase 3 needs more care than the audit suggests. Spike before committing the phase.

5. **Sculptcore demo executor — submission contract.** Phase 6 assumes the WebGPU executor's `submit()` API matches what the demo emits. If the demo's draw commands include WebGL2-specific features (transform feedback, e.g.), they need WebGPU equivalents.

6. **Overdraw HTML canvas.** `view3d.overdraw` is an HTMLCanvasElement overlay used by brush previews. It's not GL at all — but worth confirming it z-orders correctly above the WebGPU canvas under all browsers.

---

## Suggested sequencing

| Phase | Estimated effort | Can land alone? |
|-------|-----------------|-----------------|
| 0 — Inventory verification | 0.5 day | Yes (audit only) |
| 1 — Encoder lifecycle + hooks | 1 day | Yes (no behavior change) |
| 2 — Grid + drawDrawLines | 0.5 day | Yes |
| 3 — drawObjects (non-renderables) | 1 day | Yes |
| 4 — Widgets | 1 day | Yes |
| 5 — Toolmode overlays | 0.5 day | Yes |
| 6 — Sculptcore demo | 1 day | Yes |
| 7 — Cleanup | 0.5 day | Yes |

**Total estimate:** ~6 days end-to-end. Each phase ships independently; recommend bundling phases 1+2 as one PR (establishes the pattern), then one PR per phase from 3 onward.

---

## Open questions deferred to implementation

- Should `encodeOverlaysCB` be a single hook or split per-stage (`encodeBackground`, `encodeForeground`, `encodeWidgets`) to allow inserting effects between them later? Default: single hook for simplicity; split if a need emerges.
- Should the overlay pass be its own `RenderTarget` (with later composite into the accumulator), or share the accumulator target directly? Default: share — simpler, no extra blit. Switch to separate target only if compositing requirements grow.

---

## Phase 8 — Post-removal cleanup pass (added 2026-05-22)

After Phase 7 lands the WebGL removal, do a sweep over every file touched by the WebGPU migration:

**8.1** Walk the changed-file set (`git diff --name-only master...HEAD` against the migration branch). For each file:
- Read every comment that mentions `gl`, `WebGL`, `extraDrawCB`, `isWebGPU`, `WebGLDrawQueueAdapter`, "Phase N of overlays-port", "WebGL fallback", "GL path", or any other legacy-backend reference.
- Update the comment to reflect the post-removal reality (one backend, no branching), or delete it if it's now describing code that no longer exists.
- Fix stale file/line references (e.g. "see view3d.ts:1612" when the line has moved or the code has been deleted).
- Strip "this is the WebGPU path" markers — there is no other path to contrast with anymore.

**8.2** After the comment sweep, propose **10 useful refactors / code cleanups** uncovered along the way. Bias toward small, mechanical wins that a future PR can land independently. Format each as: name, file(s), one-paragraph rationale, estimated effort. Examples of the shape:
- "Unify SimpleMesh/SimpleIsland buffer-upload helpers — currently three near-duplicate routines."
- "Lift `applySurfaceFormat` out of WebGPUDrawQueueAdapter — it's pure and tested independently."
- "Collapse `view3dLike` casts in view3d.ts to a real shared interface."

Write the list to `documentation/plans/post-webgpu-cleanup-followups.md` so it survives outside the chat context.

**Definition of done:** No comment in a migration-touched file references WebGL as a live alternative; the follow-up list exists on disk.
