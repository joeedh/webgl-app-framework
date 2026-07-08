# Commit story: 3a783e3-d87644d  (2026-05-21)

For two years `_gl` had been the only deity in the viewport. Every draw call prayed to it. When `view3d.ts` woke up each frame, it reached for `window._gl` the way a man reaches for the lamp on the nightstand — without looking, certain. The framework was built around that certainty: editors, overlays, sculpt brushes, the PBVH code, the texture-paint blur — all of them assumed an OpenGL context was simply *there*, the way you assume the floor.

It would not be there much longer.

Apple had stopped caring about WebGL years ago. The new tile-based GPUs spoke a different dialect. The browsers had quietly built a translator — WebGPU — and one by one, the pieces of `scripts/webgpu/` had assembled themselves under the floorboards: `Pipeline`, `GpuBuffer`, `WebGpuRenderContext`, the WGSL parser. They could compile shaders. They could allocate buffers. They could not, until two weeks ago, *draw a frame*. The pipelines knew what bindings they wanted — `@group(0) frame`, `@group(2) object` — and `WebGPUDrawQueueAdapter` was calling `pipeline.getBindGroupLayout('auto')` and shrugging. The WGSL files in `scripts/shaders/` sat like sealed letters nobody had agreed to deliver.

## Act I — the clerk

`3a783e3`. A new file, `scripts/webgpu/uniform_bindings.ts`, walked into the room with a clipboard. *Show me your declarations,* it said to each `Pipeline`. *Every `var<uniform>` you've got. Group, binding, struct, field offsets — all of it.* It allocated one `GpuBuffer` per slot. It took `IUniformsBlock` — that loose bag of named scalars the renderer had been throwing around for years, that GLSL had happily eaten without complaint — and ran it through `UniformWriter` into the rigid, padded bytes WGSL demanded. Then it cached the resulting `GPUBindGroup` against `pipeline.getBindGroupLayout(group)`, because allocating a bind group every frame is how you lose four milliseconds you'll never get back.

`WebGPUDrawQueueAdapter.submit` learned a new verb: `bindings.bind(pass, pipeline, uniforms)` before `mesh.drawGPU`. Frame and object groups, populated. Material slot — textures, samplers, group 1 — still the caller's problem. One fight at a time.

## Act II — the eviction

Two hours later, `574e221` came for `_gl` itself.

You don't argue with a deity. You evict it, and you leave something that wears its face.

In `initWebGL`, when the URL whispered `?renderer=webgpu` and `navigator.gpu` answered, the WebGL2 context was never acquired at all. In its place: `makeWebGpuGlStub` — a throwing Proxy installed on `window._gl`, dressed in the dead deity's clothes. Shape, right. Interface, right. The first time any forgotten code path reached for `gl.TEXTURE_2D` out of muscle memory, the Proxy answered with an exception that *named the property by name*, so the offender outed itself, file and line. Every missing `isWebGPU()` guard in the codebase had been given a tripwire and a confession booth.

The viewport call chain — `redraw_viewport → rAF → f → f2 → viewportDraw → viewportDraw_intern` — got a fork. `viewportDraw_intern` glanced sideways and, when the world was WebGPU, peeled off into `drawViewportWebGpu` in the new file `scripts/editors/view3d/view3d_draw_webgpu.ts`. `f2` learned to skip `gl.finish()`, because the stub would have screamed. `render_context.ts` grew a `renderStageDesc(desc, drawCb)` overload so the canvas-acquired texture view — orphan, owned by no `RenderTarget` — could still drive `currentPass`.

Grid lines. Drawlines. Widgets. Toolmode overlays. The entire `RealtimeEngine` pass graph. All of them stubbed, each with a one-time console warning. Vignettes for later episodes. The mesh got to the screen; nothing else did.

## Act III — the long night

`99f5a1e`. "finish (most off) the webgpu refactor" — the commit message a tired exhale at 7:16 PM on a Wednesday. +1145, −231, twenty-three files.

The kind of commit that doesn't get an arc because it *is* the arc, compressed: `view3d_draw_webgpu.ts` grew by 415 lines as edge cases surfaced one by one in the console; `wgsl_shaders.ts` was rewritten end to end; `queue_adapter.ts`, `batch.ts`, `pipeline.ts`, `simplemesh.ts`, `litemesh.ts`, `litemesh_wgsl.ts`, `texture/textureGen.ts`, `render/queue.ts`, `wgsl_reflect.ts` — every one of them leaned, finally, into the new world. Even `.devcontainer/Dockerfile` and a new `tools/serv-restart.js` got swept up, because when your renderer is a moving target your serve script becomes one too.

What was drawing was drawing *gray*. Flat ambient. The lights existed in `scene.lights`, smug and ignored, knowing their turn was next.

## Act IV — the stride rule

`c9c2570` was a specific kind of fight: the universe pushing back on convenience.

Picture a back-room desk under a single bare bulb. Behind it sits the WGSL uniform address space — a bureaucrat with one rule and infinite patience for it. Arrays of structs pad every element up to a 16-byte boundary. No exceptions. No flags. The rule predates your code; it will outlast your code; it is in the spec, page 47.

`LightGenWgsl.setUniforms`, newly arrived from the `scripts/shadernodes` submodule, walked up to that desk holding flat keys — `LIGHTS[3].color`, `LIGHTS[3].intensity` — and a hopeful expression. The bureaucrat did not look up.

`wgsl_reflect.ts` got a new clerk for the front of that desk: `ArrayedStructWriter`. It took the flat keys, computed `alignUp(struct.size, 16) * arrayLength`, laid out one correctly-padded ArrayBuffer, slid it across the counter. The bureaucrat stamped it. `uniform_bindings.ts` was taught to recognize `array<Struct, N>` as a legitimate binding type instead of crashing on it, and to politely skip scalar uniform bindings it didn't yet understand — better a missing feature than a missing frame.

`view3d_draw_webgpu.ts` built a minimal `IRenderLights` from `scene.lights` — just the SceneObject ref, no shadow map, no hash digest — and folded the light *count* into the per-material hash. The count is baked into WGSL as a literal, so adding a lamp triggers a recompile; the cache had to know.

## Act IV½ — the comment that wasn't

And then, the bug you only catch by running the thing.

The preprocessor had an early-exit: "no `#define`s, nothing to do." Sensible — `#` is a comment in GLSL; an early return is free. But WGSL is more literal-minded. A raw `#ifdef` block, untouched by any preprocessor pass, slipped through into `createShaderModule` and was rejected with the polite indifference of a compiler that has seen many things and considers this one of them. The fix in `wgsl_shaders.ts` and `wgsl_render_passes.ts` was small: always run the preprocessor, even with empty defines. The lesson was bigger: every assumption GLSL had let you make for fifteen years now needed an audit, and they would not all announce themselves.

The mesh, finally, was lit.

## Act V — the credit roll

`d87644d`. One line. Two minutes after the lights commit landed. The `scripts/shadernodes` submodule pointer moved forward, pulling in the `WgslShaderGenerator`, the WGSL `ShaderFragments`, and `LightGenWgsl` — the pieces the parent repo's material path had been calling into the void for. The dependency, finally, was real on both sides of the boundary.

## Coda

Five commits. Thirty-six hours. The viewport, when it wakes up now in WebGPU mode, does not reach for `_gl`. The lamp on the nightstand is a Proxy in the dead deity's clothes, and it bites. The pipelines get the uniforms they asked for. The lights, padded to sixteen bytes, reach the shader. And somewhere in the build, a one-line submodule bump quietly admits what everyone already knew: the WebGL era, in this repo, is over.

## Commits

- `3a783e3` — add UniformBindings: WGSL reflection → @group(0/2) bind groups
- `574e221` — wire WebGPU into the viewport frame loop
- `99f5a1e` — finish (most off) the webgpu refactor
- `c9c2570` — WebGPU: wire scene lights into material pipelines
- `d87644d` — Bump shadernodes submodule for WGSL generator
