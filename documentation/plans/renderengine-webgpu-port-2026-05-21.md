# Renderengine WebGL → WebGPU Port

**Date:** 2026-05-21
**Status:** Planning
**Related:** [webgl-to-webgpu-migration-2026-05-20.md](webgl-to-webgpu-migration-2026-05-20.md) (parent migration), [overlays-port.md](overlays-port.md) (follow-up)

## Goal

Retire WebGL from the realtime render engine. End state: `RealtimeEngine` constructs and dispatches a `WebGpuRenderGraph`; `realtime_passes.ts` GLSL strings and the `FBOSocket`-based `RenderGraph` are deleted; the only remaining GL touchpoints are `TexpaintBridge` (texpaint stays on GL for now) and the overlay/`extraDrawCB` path (deferred to [overlays-port.md](overlays-port.md)).

## Out of scope

- **Overlays.** Grid, `drawThreeScene`, `drawObjects` (non-renderable), toolmode `on_drawstart` overlays, widgets, draw-lines. These all run through `extraDrawCB` fired from inside `BasePass.renderIntern` and represent a much larger surface than the renderengine itself. See [overlays-port.md](overlays-port.md). Until that plan lands, overlays are hidden under `useWebGPU=true`.
- **Shadowmaps.** `CubeFace`/`CubeMap` at `renderengine_realtime.ts:50-205` were already disabled and not working. Delete during Phase 4 cleanup.
- **Texpaint.** Stays on GL via `TexpaintBridge`. Out of scope for this plan.

## Current state (one-line)

The WebGPU substrate is in place — `scripts/webgpu/{render_graph,render_target,render_context,pipeline,bind_group,texture,buffer,queue_adapter,uniform_bindings}.ts` plus WGSL ports of every post-process pass in `scripts/shaders/wgsl_render_passes.ts` and material WGSL via `WgslShaderGenerator`. What's missing is the glue: nothing constructs the WebGPU graph from `RealtimeEngine`, and `BasePass`/`NormalPass` mesh-encoding hooks aren't implemented for the realtime engine.

---

## Phase 0 — Pre-flight (no behavior change)

**0.1** Confirm WGSL coverage parity by comparing `wgsl_render_passes.ts` exports against the GL pass list in `realtime_passes.ts:163-914`. Required keys: `base_pass`, `normal_pass`, `ao_pass`, `blur_pass`, `denoise_blur`, `sharpen`, `accum_pass`, `passthru_pass`, `output_pass`. Add any missing ones before touching engine code.

**0.2** Verify preprocessor define support in the registry: `BLUR_AXIS`, `BLUR_SAMPLES`, `DEPTH_SCALE`, `DEPTH_OFFSET`, `DEPTH_PRESCALE`, `AXIS`, `SAMPLES`. These live in `scripts/shaders/wgsl_shaders.ts::buildPipelineDescriptor`. Expand the `defineMap` if any are missing.

**0.3** Land a thin feature flag on `RealtimeEngine` — `useWebGPU: boolean` (default false) — so the two paths can co-exist during Phases 1-4 and we can A/B compare visually.

---

## Phase 1 — Replace the engine's graph builder

**Touch:** `scripts/renderengine/renderengine_realtime.ts` (`rebuildGraph` at line 417, plus the pass field declarations).

**1.1** Introduce a parallel `rebuildGraphWebGPU()` that produces `GraphNodeRef[]` instead of wiring `FBOSocket` edges. Mirror the same conditional structure (`renderSettings.ao` → add normal+ao nodes; `renderSettings.sharpen` → add sharpx/sharpy). Pass keys come from the registry (step 0.1).

**1.2** Allocate the WebGPU equivalents of the current FBOs as `RenderTarget`s up-front (one per pass output, plus a ping-pong pair for `AccumPass`/`PassThruPass`). `RenderTarget` lives in `scripts/webgpu/render_target.ts`. Reuse one accumulator pair across frames; resize on viewport change.

**1.3** Construct a single `WebGpuRenderContext` per engine instance (in the constructor), reusing the device from `GpuContext`.

**Definition of done:** `useWebGPU=true` causes `_render()` to walk a `WebGpuRenderGraph.exec(nodes, hooks)` call instead of `this.rendergraph.exec(...)`. Mesh hooks throw "not implemented" — that's the next phase.

---

## Phase 2 — Implement mesh hooks (BasePass + NormalPass)

**Touch:** `scripts/renderengine/renderengine_realtime.ts` + minor extension of `view3d_draw_webgpu.ts`.

**2.1** Move the scene-walk currently inside `BasePass.renderIntern` (`realtime_passes.ts:192-247`) into a method on `RealtimeEngine` that implements `DispatchHooks.encodeMeshBasePass(node, pass)`. The jitter-sample shift calculation (`getJitterSamples(55)`, `filterWidth`, `Math.random()` offsets) stays, but the projection-matrix shift now needs to flow into `FRAME_UNIFORMS_WGSL` via the per-frame uniform buffer rather than into a GL uniform.

**2.2** Same treatment for `NormalPass.renderIntern` (`realtime_passes.ts:265-281`) → `encodeMeshNormalPass`. The current GL path calls `rctx.engine.render_normals(...)`; the WebGPU path should use the existing material pipelines with a "render normals" pipeline variant. Add a `MaterialVariant.NORMAL_ONLY` if the WgslShaderGenerator doesn't already emit one (search `shader_nodes_wgsl.ts` first — it might).

**2.3** Per-object `ob.draw()` calls already route through `createDrawQueue()` → `WebGPUDrawQueueAdapter` when `isWebGPU()` is true, so most scene-object code needs no changes. Verify that mesh, curve, and sculpt objects all have a `.draw()` path that the queue adapter resolves.

**2.4** Skip `extraDrawCB` entirely when `useWebGPU=true` — overlays are out of scope for this plan. See [overlays-port.md](overlays-port.md).

**Definition of done:** `useWebGPU=true` renders a recognizable scene with materials, even with overlays missing.

---

## Phase 3 — Post-process passes (AO, blur, sharpen, accum, passthru, output)

These are all fullscreen-quad passes — `WebGpuRenderGraph.exec` already drives them via `drawFullscreenQuad`. The work is wiring uniforms.

**3.1** For each post-process pass, build a small "set per-frame uniforms" function on the engine, e.g. `setAOUniforms(rctx, dist, factor, steps)`. These write into a uniform buffer that the WGSL pass samples via `@group(0)` (FRAME bind group). `UniformBindings` already auto-wires by reflection — confirm with `bind_group.ts` and `uniform_bindings.ts`.

**3.2** Blue-noise mask: `getBlueMask(gl)` returns a GL texture. Mirror with a `GpuTexture` cached on the engine, uploaded once (CPU-side `makeBlue` generator is reusable as-is — only the upload changes). Pipe through `setBlueUniforms` equivalent.

**3.3** Ping-pong wiring for `AccumPass` ⇄ `PassThruPass` (`realtime_passes.ts:863-881`): swap two `RenderTarget`s each frame. Caller-owned, not graph-owned.

**3.4** `OutputPass` writes to the swapchain texture instead of a `RenderTarget`. Acquire the surface view from `GpuContext` and pass it as `node.target` for the output node only.

**3.5** Delete the dead `DenoiseBlur` branch (`renderengine_realtime.ts:451-469` is `if (0)`).

**Definition of done:** With AO + sharpen both enabled, the WebGPU path produces visually equivalent output to the GL path (sample by eye; pixel diff is overkill given jittered AA).

---

## Phase 4 — Cut over and delete

**4.1** Flip `useWebGPU` default to `true`. Run the app, verify all scenes/tools.

**4.2** Delete:
- `realtime_passes.ts` in its entirety
- `renderpass.ts` (`RenderPass`, `RenderGraph`, `FBOSocket`, `RenderContext`)
- The GL fields on `RealtimeEngine`: `basePass`, `norPass`, `outPass`, `accumOutPass`, `passThru`, `aoPass`, `sharpx`, `sharpy`, `rendergraph`
- `ShaderCache` (`renderengine_realtime.ts:224-282`) if its only consumer is gone — verify with grep; the WebGPU `pipelineBindings` map replaces it
- `CubeFace`/`CubeMap` and `renderShadowMaps` (already non-functional)
- `rebuildGraph` (GL version) and the `useWebGPU` flag itself

**4.3** Remove GL-only imports from `renderengine_base.ts` and `renderengine_realtime.ts` (`fbo.js`, `simplemesh.js`, GLSL shader_lib helpers that have WGSL siblings).

**4.4** Check `scripts/renderengine/math.reduce` — looks like a stray file, decide whether to keep or delete.

**Definition of done:** `grep -i "webgl\|gl\\.\|GLSL\|FBO" scripts/renderengine/` returns only the `TexpaintBridge` reference and comments mentioning historical context.

---

## Phase 5 — Cleanup of callers (separate PR)

**5.1** `view3d.ts` (engine instantiation at view3d.ts:1482) — no API change expected since `render()` signature stays, but the `gl` parameter becomes unused; thread the GPU device/queue instead. Likely a one-line constructor change + a thicker change at the call site.

**5.2** Overlay reintroduction is its own initiative — see [overlays-port.md](overlays-port.md).

---

## Risks & open questions

1. **`render_intern` / `render_normals` engine virtuals** — defined on `RealtimeEngine` and called from inside the GL passes. After Phase 2 their callers move into the engine itself; verify nothing else outside `realtime_passes.ts` calls them.

2. **Per-frame jitter shift in projection matrix** — GL path mutates the projection matrix directly inside the draw call. WebGPU path needs to write the jittered matrix into the frame uniform buffer before encoding. Make sure the same matrix is used for both NormalPass and BasePass in a given sample (otherwise AO will misalign).

3. **Texture uploads for materials** — materials carry `Texture` instances with `WebGLTexture` handles. The `WebGPUDrawQueueAdapter` already exists; confirm it handles material textures cleanly, or whether material texture loading needs to gain a WebGPU code path. Likely hidden cost.

4. **Material variants** — does `WgslShaderGenerator` emit a normals-only variant? If not, Phase 2.2 grows by however much node-graph work that takes.

5. **Sample weighting accuracy** — the GL `AccumPass` has a known broken weighting (`renderengine_realtime.ts:857` says "XXX weighting is broken"). Don't reproduce the bug; fix it on the WGSL side using `uSample`-based weighting and verify convergence.

---

## Suggested sequencing

| Phase | Estimated touchpoints | Can land alone? |
|-------|----------------------|-----------------|
| 0 — Pre-flight + flag | 2 files | Yes |
| 1 — Graph builder | 1 file (`renderengine_realtime.ts`) | Yes (mesh hooks throw) |
| 2 — Mesh hooks | 1-2 files + material variant work | Yes (post-process passes still GL via flag-off) |
| 3 — Post-process passes | 1 file + a few WGSL tweaks | Yes |
| 4 — Cutover + delete | ~3 files deleted, ~200 LOC removed | Yes |
| 5 — Caller cleanup | view3d.ts | Separate PR |

Phases 1-4 should land as a single branch with the flag flip at the end. Phase 5 is a separate, smaller follow-up.

---

## Follow-up

After this plan lands, overlays (grid, three.js scene, non-renderable scene objects, toolmode overlays, widgets, draw-lines) will be hidden under WebGPU. Porting them is tracked separately in **[overlays-port.md](overlays-port.md)**.
