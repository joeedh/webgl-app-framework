# Rendering (WebGPU)

The realtime renderer is WebGPU-only. The legacy WebGL realtime path has
been removed; `WebGL2RenderingContext` only survives in a few public
signatures (`RenderEngine.render(camera, gl, ...)`) for source-compat
with old call sites that still pass it. The realtime engine ignores
`gl`.

Shader-node materials (`scripts/shadernodes/`) now emit **WGSL only** —
the legacy GLSL `ShaderGenerator`/`genCode()` path has been deleted and
codegen lives on the node classes (`ShaderNode.genWgsl`). Materials feed
sculptcore draw batches through a **dynamic, attribute-driven** interface;
see [shader-attributes.md](shader-attributes.md).

## Layout

| File | Purpose |
|---|---|
| `scripts/renderengine/renderengine_base.ts` | `RenderEngine` base + `RenderSettings`. |
| `scripts/renderengine/renderengine_realtime.ts` | `RealtimeEngine` — owns the per-frame WebGPU graph build + scene walk. |
| `scripts/renderengine/wgsl_render_passes.ts` | WGSL source + registry for the post-process passes (`OutputPass`, `AccumPass`, `SharpenPass`, `AOPass`, …). |
| `scripts/webgpu/render_graph.ts` | `WebGpuRenderGraph` — encodes a list of `GraphNodeRef`s into the current frame. |
| `scripts/webgpu/render_context.ts` | `WebGpuRenderContext` — device + queue + command encoder + fullscreen quad. |
| `scripts/webgpu/render_target.ts` | `RenderTarget` — offscreen color+depth attachment wrapper. |
| `scripts/editors/view3d/view3d_draw_webgpu.ts` | Per-canvas `GpuContext`/`WebGpuRenderContext` lifecycle; surface acquisition. |
| `scripts/shaders/wgsl_shaders.ts` | WGSL registry for mesh shaders (`NormalPassShader`, lit-mesh, line, widget, sculpt, …). |

## Frame topology

`RealtimeEngine.rebuildGraphWebGPU` emits a flat `GraphNodeRef[]`. The
exact list depends on `renderSettings.ao` and `renderSettings.sharpen`:

```
NormalPass*  → AOPass*  → BasePass → AccumPass ⇄ PassThruPass → SharpenPass.x* → SharpenPass.y* → OutputPass
(* conditional on renderSettings.ao / renderSettings.sharpen)
```

Each node carries a `passKey` (matched against the WGSL registry in
`wgsl_render_passes.ts`), an offscreen `RenderTarget`, and optional
`defines`. The two "marker" keys `NormalPass` and `BasePass` are
special-cased by `WebGpuRenderGraph.exec`: instead of drawing a
fullscreen quad it invokes `DispatchHooks.encodeMeshNormalPass` /
`encodeMeshBasePass` so the engine can walk the scene and issue
per-object draws into the open pass encoder.

`OutputPass` is canvas-bound. The engine sets `node.surface` to the
swap-chain view returned by `viewport.gpu.canvasContext.getCurrentTexture()`
each frame; the graph rebuilds the pipeline against the swap-chain
format (typically `bgra8unorm`) because the registry's default is the
offscreen format `rgba16float`.

### Pass formats

* All offscreen targets: `rgba16float` color + `depth24plus` depth.
  Constants: `RealtimeEngine.WEBGPU_PASS_FORMAT`, `WEBGPU_DEPTH_FORMAT`.
* Canvas surface: `viewport.gpu.surfaceFormat` (set by `GpuContext.create`,
  defaults to `'bgra8unorm'`).

### AccumPass ping-pong

`AccumPass` and `PassThruPass` ping-pong between two `RenderTarget`s
named `accumA` / `accumB`. `RealtimeEngine.webgpuPing` flips per frame;
`AccumPass` writes to one slot and `PassThruPass` writes the other, so
next frame `AccumPass` can read the previous result via the binding-5
`last_buf_tex`.

The first sample is special-cased inside the WGSL
(`select(0.0, 1.0, passU.uSample > 1.0)`) so an uninitialized prior
slot isn't summed in.

### Sampling and weighting

`uSample` increments every `_render` call. `weightSum` accumulates a
weight of 1.0 per sample; `OutputPass` divides by it. Both reset on:

* A camera-hash change (`camera.generateUpdateHash()` differs).
* `renderSettings` hash change (graph rebuilds and re-clears).
* Explicit `queueResetSamples()` from a caller.

Per-sample blue-noise jitter is added as a clip-space translation on
the projection matrix in `_jitteredProjMatrix`. The jitter sequence
comes from a Lloyd-relaxed blue-noise generator (`makeBlue`) cached in
`jcache`; `filterWidth` scales the offset.

## RenderSettings

| Field | Default | Effect |
|---|---|---|
| `sharpen` | `false` | Adds the two `SharpenPass` nodes (x, then y). |
| `sharpenWidth` | `1` | Becomes `SAMPLES` define on both sharpen passes. |
| `sharpenFac` | `0.4` | Lerp factor written into the SharpenPass extra uniform. |
| `ao` | `true` | Adds `NormalPass` + `AOPass`, and sets the `WITH_AO` define on every material pipeline. |
| `filterWidth` | `1.5` | Jitter scale (pixels) on the projection translate. |
| `minSamples` | `1` | `render()` busy-loops `_render` until `uSample >= minSamples`. |

Changing any of these invalidates the graph and resets the
accumulator via the settings hash check at the top of `render()`.

## Components

### `WebGpuRenderContext`

Thin bundle of `device + queue + commandEncoder + pipelineCache +
fullscreen quad`. `beginFrame()` opens a `GPUCommandEncoder`,
`renderStage(target, cb)` and `renderStageDesc(desc, cb)` open render
passes against an offscreen `RenderTarget` or arbitrary descriptor
respectively, `endFrame()` submits.

`pipelineBindings: Map<unknown, Pipeline>` is the GLSL→WGSL bridge
used by the WebGPU draw queue adapter. The realtime engine inserts an
entry per material (and the shared `NormalPassShader`) keyed by a
synthetic per-engine `program` identity so the queue resolves the
right pipeline when `ob.draw(view3d, gl, uniforms, program)` runs.

### `WebGpuRenderGraph`

Walks the `GraphNodeRef[]` and calls into `DispatchHooks`. Three
branches inside the loop:

1. `node.surface` set → open a pass against the swap-chain view with
   a viewport+scissor restricted to the view3d region, rebuild the
   pipeline against the swap-chain format, draw the fullscreen quad.
2. `passKey === 'NormalPass'` or `'BasePass'` → open an offscreen
   pass and delegate to the matching hook.
3. Otherwise → fullscreen-quad blit through the registry entry.

After every offscreen pass, `WebGpuRenderGraph` calls
`debug.pushTexture(label, color, encoder)` to snapshot the color
output into the `DebugEditor` registry. The swap-chain pass is skipped
because the canvas texture isn't `COPY_SRC`-usable.

### `RealtimeEngine` — per-frame flow

`render(camera, gl, viewbox_pos, viewbox_size, scene)`:

1. Compute the `renderSettings` hash; reset samples on change.
2. Loop `_render` until `uSample >= minSamples`.

`_render`:

1. Sample counter / weight bookkeeping.
2. `updateSceneLights` + `updateLights` rebuild the `RenderLight` table
   from `scene.lights`.
3. `_renderWebGPU`:
   * Acquire the per-canvas `WebGpuRenderContext` from
     `getActiveWebGpuViewport(canvas)`. If `null`, the async `GpuContext.create`
     hasn't resolved yet — drop the frame.
   * Rebuild `webgpuNodes` if size or settings-hash changed.
   * Swap `AccumPass`/`PassThruPass` targets per `webgpuPing`.
   * Acquire the canvas surface texture, attach it to the `OutputPass`
     node, derive the viewport+scissor from `viewbox_pos/size`.
   * Stash overlay context, call `webgpuGraph.exec(nodes, hooks)`.
   * On exit, clear overlay context.

### Material pipelines

`_ensureWebgpuMaterial(ctx, scene, mat, rlights)` compiles a per-material
pipeline targeted at `rgba16float`:

1. Hash inputs: `mat.calcUpdateHash()` + light type list +
   `WITH_AO` define. Reuse cached pipeline when unchanged unless
   `mat._regen` is set.
2. `mat.generateWgsl(scene, rlights, {WITH_AO?})` returns
   `{wgsl, setUniforms}`.
3. `buildMaterialPipelineDescriptor` produces a `PipelineDescriptor`;
   the color-target format is rewritten from `bgra8unorm` to
   `rgba16float` so the cached pipeline matches our offscreen target.
4. Push the result into `ctx.pipelineBindings.set(program, pipeline)`
   keyed by a per-engine synthetic `program` identity (so it doesn't
   collide with the canvas-format pipeline `view3d_draw_webgpu` keeps
   for the same material).

### NormalPass material

`_ensureWebgpuNormalProgram` compiles `NormalPassShader` (from
`scripts/shaders/wgsl_shaders.ts`) once and reuses it for every
renderable in the `NormalPass` scene walk. No per-material variation.

### Post-process bind groups

`_buildPostProcessBindGroup(node, pipeline, ...)` is the
`DispatchHooks.bindGroupForPass` entry point. It produces a single
`@group(0)` bind group covering the inputs each WGSL pass declares:

| Binding | Resource |
|---|---|
| 0 | `PassUniforms` (272 bytes — proj + iproj + view + iview + size + uSample + weightSum). |
| 1 | Input color texture — output of the upstream node, resolved by `_getPassInputTarget`. |
| 2 | Filtering sampler (linear, clamp). |
| 3 | Input depth texture (`texture_depth_2d`). |
| 4 | Pass-specific extras: `AccumUniforms` / `SharpenUniforms` / `AOUniforms`. |
| 5 | AccumPass: previous-frame accumulator (PassThruPass's ping-pong slot). AOPass: blue-noise mask. |
| 6 | AOPass: non-filtering blue sampler (repeat). |
| 7 | Non-filtering sampler for the depth texture. |

`depth24plus` only accepts a non-filtering or comparison sampler, which
is why binding 7 is separate from binding 2.

Per-node uniform buffers live in `webgpuPassBuffers` keyed by
`GraphNodeRef` identity and are rebuilt alongside the node list.

### Upstream-input resolution

`_getPassInputTarget(node)` mirrors the FBOSocket wiring from the GL
graph:

```
AOPass        ← NormalPass
AccumPass     ← BasePass
PassThruPass  ← AccumPass (current ping slot)
SharpenPass.x ← PassThruPass
SharpenPass.y ← SharpenPass.x
OutputPass    ← SharpenPass.y (if sharpen) else PassThruPass
```

`AccumPass`/`PassThruPass` reads honour the per-frame ping-pong swap
because `_renderWebGPU` overrides `node.target` before `exec`.

## Overlays (grid / widgets / drawDrawLines / toolmode debug)

`OutputPass` writes to the canvas swap-chain with `loadOp: 'clear'`. To
draw overlays on top, callers install `encodeOverlaysCB` on the engine:

```ts
engine.encodeOverlaysCB = (rctx, pass, projmat) => {
  // draw grid, widgets, toolmode debug into `pass`
}
```

`WebGpuRenderGraph.exec` fires `hooks.encodeOverlays(rctx)` after every
node. `RealtimeEngine._encodeOverlays` opens a new render pass with
`loadOp: 'load'` against the same swap-chain view + depth view +
viewport that `OutputPass` just wrote, then invokes the caller hook.

Use `depthCompare: 'less'` + `depthWriteEnabled: true` on overlay
pipelines so overlays z-test against each other. The depth buffer isn't
loaded with scene depth (the canvas depth is a separate attachment from
`AccumPass`'s ping-pong depth) — overlay-vs-scene z-testing isn't
supported on this path yet.

## Lifecycle

* Construction: `new RealtimeEngine(view3d, settings?)`. Auto-registers
  with `RenderEngine.engines`.
* Per-canvas WebGPU init is async (driven by `view3d_draw_webgpu.ts`);
  before it resolves, `_getWebGpuCtx()` returns `undefined` and frames
  are silently dropped.
* `destroy(gl)` destroys every `webgpuTargets` entry and drops the
  node list + graph.

## Adding a new post-process pass

1. Write the WGSL fragment in `scripts/renderengine/wgsl_render_passes.ts`,
   appending `${VS_BLIT_WGSL}` and `${PASS_UNIFORMS_WGSL}` to the front.
2. Call `registerWgslPass({key, source, vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
   colorTargets: [PASS_COLOR_TARGET], depthStencil: PASS_DEPTH_STENCIL})`.
3. In `RealtimeEngine.rebuildGraphWebGPU`, push a `GraphNodeRef` with
   the new `passKey` at the right position.
4. If the pass has bindings beyond 0/1/2/3/7, extend
   `_buildPostProcessBindGroup` to add them and (if applicable)
   `_ensurePassBuffers` for any extra uniform buffer.
5. Update `_getPassInputTarget` if downstream passes need to find the
   new node as an upstream input.

## Adding a new scene-walk pass

Use `NormalPass` / `BasePass` as templates. Either reuse an existing
`encodeMeshNormalPass` / `encodeMeshBasePass` hook or add a new one to
`DispatchHooks` and special-case the key inside
`WebGpuRenderGraph.exec`.
