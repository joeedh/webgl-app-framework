# WebGL → WebGPU Migration Plan

## Context

The app is built on a homegrown WebGL2 abstraction (`scripts/webgl/`) with ~25 shader variants in `scripts/shaders/shaders.ts`, two trivial GLSL shaders embedded in C++ at `sculptcore/source/spatial/shaders/spatial_shaders.cc`, and a sculptcore→GL batch executor at `scripts/webgl/batch.ts`. Rendering is **immediate-mode**: every `SceneObjectData.draw(view3d, gl, uniforms, program, object)` does `program.bind() → set uniforms → mesh.draw()` directly against the GL context. There is no pipeline cache, no descriptor binding model, and no batching layer.

Reasons to migrate:

- WebGPU is the path forward (WebGL2 is now legacy in all major browsers; Safari/Chrome/Firefox WebGPU stable).
- Sculptcore's batch executor would benefit from being able to build pipelines once and replay them, rather than re-binding attribute pointers per draw.
- The immediate-mode draw API leaves a lot of CPU performance on the table for PBVH sculpting (many small node draws per frame).

**Out of scope** (deferred for a follow-up plan): `scripts/editors/view3d/tools/pbvh_texpaint.ts` and `scripts/editors/view3d/tools/pbvh_texpaint_blur.ts`. These do mesh→FBO rasterisation through a custom procedural shader pipeline that is tightly coupled to GL framebuffer state. They will remain on WebGL behind a small isolation shim until a follow-up migration.

**Scope ordering note:** Phase 0 below intentionally lands the smallest changes (SimpleMesh API cleanup + draw-call refactor) **on WebGL**, before any WebGPU code exists. That keeps the risky WGSL/pipeline work decoupled from the API churn it would otherwise drag in.

---

## Critical files

- `scripts/webgl/webgl.ts` — `ShaderProgram` (442–1150), `VBO` (1155–1281), `Texture` (1339–1593), `RenderBuffer`, `Camera`, `DrawMats`. New `scripts/webgpu/gpucontext.ts` mirrors these.
- `scripts/webgl/simplemesh.ts` — `SimpleMesh` (1884–2038), `ChunkedSimpleMesh` (2040–end), `SimpleIsland` (1039–1882). Refactored under Phase 0.
- `scripts/webgl/batch.ts` — `WebGLBatchExecutor` for sculptcore draw commands. Becomes `WebGPUBatchExecutor` in Phase 4.
- `scripts/webgl/fbo.ts` — `FBO` class; becomes `RenderTarget` in WebGPU layer.
- `scripts/shaders/shaders.ts` — ~25 shader variant generators with `#ifdef SMOOTH_LINE`, `HAVE_COLOR`, `VCOL_PATCH`, `DRAW_FLAT`, `WITH_BOXVERTS`, `BRUSH_TEX` and noise `#define`s. Phase 2 transpilation target.
- `scripts/shadernodes/shader_lib.ts`, `scripts/shadernodes/*.ts` — shader node graph IR; emits GLSL today, will emit WGSL in Phase 2.
- `sculptcore/source/spatial/shaders/spatial_shaders.cc` — 2 GLSL shaders (basicLineShader, basicMeshShader) as C++ raw string literals; no preprocessor macros. Hand-port to WGSL (Phase 2).
- `scripts/sceneobject/sceneobject_base.ts:126-142` — `draw / drawIds / drawWireframe / drawOutline` virtual API. Phase 3 changes signatures from `(view3d, gl, uniforms, program, object)` to `(view3d, queue, frameCtx, object)`.
- `scripts/renderengine/renderpass.ts` (211+) and `realtime_passes.ts` — render pass DAG; needs adaption to WebGPU command encoder model (Phase 5).
- `addons/builtin/mesh/src/mesh.ts:5321-5351` (Mesh.draw), `5041` (drawWireframe), `5077` (drawIds) — primary draw caller.
- `scripts/editors/view3d/view3d_draw.ts:71-130` — `MeshDrawInterface`, top-level dispatch.
- `scripts/editors/view3d/tools/pbvh.ts:2475,2495` — PBVH node draws via `node.drawData.draw(gl, uniforms, program)` (migrated).
- `scripts/editors/view3d/tools/pbvh_texpaint.ts`, `pbvh_texpaint_blur.ts` — **deferred**; isolated behind shim in Phase 6.

---

## Phase 0 — Pre-migration cleanups (still on WebGL)

Land these *before* introducing WebGPU. They reduce the surface area we have to port.

### 0a. Unify `SimpleMesh` and `ChunkedSimpleMesh`

The current API breaks Liskov substitution. ChunkedSimpleMesh overrides `tri/line/point/smoothline` with an extra leading `id: number` parameter under `// @ts-ignore`, and `quad()` throws `'unsupported for chunked meshes'`. This means call sites must `instanceof`-check before calling primitive builders.

**Proposed shape:**

```ts
// new file: scripts/webgl/mesh_batch.ts (renames simplemesh.ts contents)
interface MeshBatchOptions {
  layerflag?: LayerTypes
  chunked?: boolean          // opt-in chunking
  chunksize?: number         // only used if chunked
}

class MeshBatch {
  tri(v1, v2, v3, id: number): TriEditor
  line(v1, v2, id: number): LineEditor
  point(v1, id: number): PointEditor
  smoothline(v1, v2, id: number): LineEditor2
  // quad() implemented for both modes — chunked variant
  // synthesises two tris under the hood
  quad(v1, v2, v3, v4, id: number): QuadEditor
  free(id: number): void     // no-op when not chunked
}
```

Rationale: `id` is ignored when not in chunked mode, `free()` is universal. `quad()` is no longer "unsupported"; chunked path synthesises two `tri()` calls into the same chunk slot. Removes all `@ts-ignore`.

### 0b. Replace immediate-mode draw in `SceneObjectData`

Even before WebGPU exists, change the abstract method signature to record into a queue. This isolates the **call site refactor** (large, mechanical, touches every addon) from the **backend swap** (small surface, isolated to `scripts/webgpu/`).

Today:
```ts
draw(view3d, gl, uniforms, program, object) { /* program.bind(gl); mesh.draw(gl, uniforms) */ }
```

Target:
```ts
draw(view3d, queue: DrawQueue, frame: FrameContext, object: SceneObject) {
  queue.submit({pipeline, bindings, mesh: this.smesh, primflag: TRIS})
}
```

With a WebGL backend behind `DrawQueue` that immediately translates `submit()` into the old `program.bind/draw` calls — i.e., **drop-in compatible** while we are still on GL. This is the same swap technique Blender used moving from immediate mode to `GPU_batch`. Once everything is recording, Phase 4 swaps `DrawQueue` to a WebGPU encoder.

---

## Phase 1 — WebGPU abstraction layer (new code, parallel to WebGL)

Create `scripts/webgpu/` with the following surface, modelled on the existing webgl.ts API where it makes sense:

| WebGL today (`scripts/webgl/webgl.ts`) | WebGPU equivalent (`scripts/webgpu/`) |
|---|---|
| `ShaderProgram` | `Pipeline` (shader + vertex layout + blend/depth/cull state — immutable, cached) |
| `VBO` | `GpuBuffer` (thin wrapper over `GPUBuffer`; usage flags explicit) |
| `Texture` | `GpuTexture` (wraps `GPUTexture` + view + sampler) |
| `FBO` | `RenderTarget` (color + depth `GPUTextureView`s) |
| `RenderBuffer` (named VBO map) | `MeshBatch.layers` (no change — buffers themselves are typed) |
| `gl.shadercache` | `PipelineCache` keyed by `(wgsl-hash, vertex-layout, target-format, blend-state)` |
| Uniform locations cached on `ShaderProgram` | `BindGroupLayout` + `BindGroup` per pipeline; uniforms go into a uniform buffer |

Notes:

- **Pipelines are immutable.** Any state that varies per-draw (cull mode, blend mode, primitive topology) goes into a **separate pipeline variant** keyed in `PipelineCache`. This is the major mental shift from GL.
- **Uniforms move into a uniform buffer.** The existing `IUniformsBlock` (loose JS object) is mapped to a fixed-layout uniform buffer per shader. The `Pipeline` exposes a `setUniforms(obj)` helper that writes typed fields by name (using reflection from the WGSL source — see Phase 2).
- **Bind groups:** Convention — `@group(0)` = per-frame (view matrix, time), `@group(1)` = per-material (textures, samplers, material params), `@group(2)` = per-object (model matrix, object id). `DrawQueue.submit()` accepts these three.

---

## Phase 2 — Shader transpilation

### 2a. Inventory

- **sculptcore C++ shaders (2):** `basicLineShader`, `basicMeshShader` in `spatial_shaders.cc`. Trivial GLSL ES, no preprocessor. **Hand-port to WGSL** — ~30 lines each. Update `gpu::ShaderDef` to carry both `vertexSource`/`fragmentSource` (existing GLSL) **and** new `wgslSource`. C++ retains both during transition; native OpenGL backend keeps GLSL, WebGPU backend reads `wgslSource`.
- **TypeScript shaders (~25):** `scripts/shaders/shaders.ts` plus shader node code in `scripts/shadernodes/`. These are **generated** by string concatenation with `#ifdef` branches. We control the generator → we change what it emits.
- **Library snippets:** `CellularNoiseFragment`, `SimplexGradientNoise`, `TexPaintShaderLib` — manual port to WGSL functions.

### 2b. Preprocessor macros — TS string preprocessor

WGSL has no preprocessor, but GLSL today uses `#define`/`#ifdef` for feature flags (`SMOOTH_LINE`, `HAVE_COLOR`, `VCOL_PATCH`, `DRAW_FLAT`, `WITH_BOXVERTS`, `BRUSH_TEX`, plus noise `#define`s). We add a ~150 LOC line-based scanner under `scripts/shaders/preprocess.ts` that runs *before* WGSL compilation and handles `#define` / `#ifdef` / `#ifndef` / `#else` / `#endif` / `#include`.

- Same syntax as today, so the generator functions in `shaders.ts` keep working — they just emit WGSL bodies instead of GLSL bodies.
- Variants stay keyed by the same defines map that `ShaderProgram._def_shaders` (`webgl.ts:480-1009`) uses today; `PipelineCache` reuses that key plus the WebGPU-only state axes (target format, blend, primitive topology).
- `#include` resolves against a virtual table of WGSL snippets (`CellularNoiseFragment`, `SimplexGradientNoise`, lighting helpers) — same model as the existing string concatenation, but explicit.

Follow-up (not in scope of this plan): move the simple variants into the `scripts/shadernodes/` graph IR and retire the preprocessor + the imperative `shaders.ts` generators. The trivial fixed shaders (`BasicLineShader`, `MeshIDShader`) don't fit a node graph cleanly, so a partial migration is fine.

We explicitly rejected: WGSL `override` constants alone (cannot strip vertex attribute declarations), Naga/Tint build-time transpile (variant explosion + doesn't cover the dynamic shader-node graph).

### 2c. Reflection / uniform layout

WGSL declares uniform buffer layouts explicitly (`struct U { @offset(0) view: mat4x4f; ... };`). To keep the loose `uniforms` object call sites already pass, **parse the WGSL** at pipeline-creation time to extract uniform struct field names/offsets/types (regex-level parser sufficient — uniform structs are simple). Build a `(fieldName → offset, type)` map. `Pipeline.setUniforms(obj)` writes scalar/vec/mat fields by name. Matches the dynamic feel of the current `IUniformsBlock`.

---

## Phase 3 — Refactor the draw call (still backed by WebGL initially)

Land Phase 0b's signature change across the codebase. Concretely:

1. Add `DrawQueue`, `FrameContext`, `Submission` types in `scripts/render/queue.ts` (backend-agnostic).
2. Add a `WebGLDrawQueueAdapter` that calls today's `program.bind()/mesh.draw()` for each `submit()`. This is the temporary back-compat shim.
3. Change `SceneObjectData.draw / drawIds / drawWireframe / drawOutline` signatures in `sceneobject_base.ts:126-142`.
4. Update each implementer:
   - `Mesh.draw` at `addons/builtin/mesh/src/mesh.ts:5321-5351`
   - `Mesh.drawWireframe` at `:5041`, `Mesh.drawIds` at `:5077`
   - `pbvh.ts:2475,2495` (BVH node draw)
   - Any other `SceneObjectData` subclasses (hair, curve, smesh, tetmesh — Glob for `extends SceneObjectData`).
5. Update render-engine call sites in `renderengine_realtime.ts:154` and the `RenderPass.exec()` chain in `renderpass.ts:441+`.
6. `pbvh_texpaint.ts` and `pbvh_texpaint_blur.ts` keep their direct-GL paths but **invoke them via a `queue.scheduleRawGLPass(cb)` escape hatch** so the queue maintains ordering. This is the WebGL-isolation shim referenced in Phase 6.

After this lands, the visible behaviour is unchanged but the call graph is queue-mediated.

---

## Phase 4 — Swap the backend

With Phase 1's WebGPU layer ready and Phase 3 done, add a `WebGPUDrawQueueAdapter` that turns `Submission`s into `passEncoder.setPipeline / setBindGroup / setVertexBuffer / draw`. Order:

1. Build `WebGPUDrawQueueAdapter` in `scripts/webgpu/queue_adapter.ts`.
2. Port `WebGLBatchExecutor` (`scripts/webgl/batch.ts`) to `WebGPUBatchExecutor` — sculptcore draws are well-isolated (one file).
3. Port `SimpleIsland`'s buffer upload + draw to `MeshBatch` against WebGPU buffers.
4. Port shaders in `scripts/shaders/shaders.ts` to WGSL (Phase 2a/b). Run shaders.ts side-by-side with a wgsl-shaders.ts file during the cutover so we can do shader-at-a-time conversion.
5. Add a runtime flag `ctx.renderer === 'webgpu'` to switch the queue adapter; default keep on WebGL until parity confirmed.
6. Move tests/snapshots once parity is achieved, then delete WebGL adapter (except for the texpaint isolation shim).

---

## Phase 5 — Render passes / RenderTarget

`scripts/renderengine/renderpass.ts` builds a pass graph today. WebGPU requires:

- Render targets must be declared upfront on the pass; cannot bind FBO mid-pass like GL.
- Clear values are part of `BeginRenderPass`, not separate clears.
- `drawQuad()` (renderpass.ts:139) becomes a stock fullscreen-triangle pipeline; trivial.

Refactor: `RenderPass.exec()` returns a `PassDescriptor { color: [...], depth, clearColor, clearDepth, body: (queue) => void }`. The render-engine consumes these and emits one `GPURenderPassEncoder` per descriptor. The existing graph structure stays.

---

## Phase 6 — Deferred & shimmed

`pbvh_texpaint.ts` and `pbvh_texpaint_blur.ts` stay on WebGL behind the `queue.scheduleRawGLPass(cb)` escape hatch from Phase 3. The browser allows a WebGPU device + a separate WebGL2 context simultaneously, but **they cannot share textures directly**.

**Bridge strategy: `readPixels` → `writeTexture`.** On each stroke commit, the GL texpaint path:

1. Renders into its existing GL FBO as today.
2. Calls `gl.readPixels` into a `Uint8Array` (size = brush footprint bbox).
3. Calls `device.queue.writeTexture` to upload that pixel rect into the WebGPU material texture.

Per-stroke cost only — the per-frame draw loop is unaffected. Simple to implement, no OffscreenCanvas restructuring. A follow-up plan will fully port these tools and remove the bridge.

---

## Coexistence strategy — feature-flagged dual backend

Keep `WebGLDrawQueueAdapter` and `WebGPUDrawQueueAdapter` side by side during the migration. A runtime flag (e.g., `ctx.renderer`) selects which adapter the queue uses; URL param or settings toggle for testing. Each shader can be ported individually — the WebGPU adapter falls back to "not yet ported" → GL adapter on a per-pipeline basis during the transition. Once parity holds for two release cycles, the GL adapter is removed except for the Phase 6 texpaint shim.

We explicitly rejected: a single hard-cutover PR (no bisecting if visuals regress) and a per-View3D backend toggle (renderer is shared singleton state).

---

## Verification

For each phase, before declaring it done:

1. `pnpm typecheck` (target: no new errors; project baseline is ~85 — Phase 0/3 should not increase this).
2. `pnpm test` — both unit and snapshot.
3. `pnpm build` — esbuild must succeed.
4. **Visual regression:** open `pnpm serv`, load a representative scene (sculptcore demo + a normal mesh + a hair object if present). Compare frame-by-frame against the WebGL build:
   - viewport shading (BasicLitMesh)
   - wireframe overlay (ObjectLineShader)
   - selection IDs (MeshIDShader — read back into a float FBO)
   - smooth lines (SmoothLine variants)
   - sculpt draw (SculptCore batch executor)
5. **PBVH sculpt smoke test:** apply a Draw brush; verify mesh updates per stroke without artifacts.
6. **Performance:** capture frame time on a 50k-vertex mesh and a 1M-vertex sculptmesh; WebGPU should be within 10% of GL or better. Use `performance.now()` around the per-frame draw.
7. **Browser matrix:** Chrome stable + Firefox stable + Safari TP. WebGPU support varies; gate with `if (!navigator.gpu) fallback`.

---

## Baseline assumptions

- **WebGL2 only.** WebGL1 fallback paths (the extension list at `webgl.ts:224-229`) are dropped. The kept-on-GL texpaint shim also assumes WebGL2.
- **sculptcore native OpenGL backend keeps GLSL.** `gpu::ShaderDef` carries both `vertexSource`/`fragmentSource` (existing GLSL, used by the native build's GL backend) and a new `wgslSource` field used by the WebGPU adapter on the WASM side. Single header, two source strings.
- **Phase 0 ships as its own PR series first**, on WebGL, before any WebGPU code lands.
