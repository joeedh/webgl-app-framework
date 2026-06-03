# Render Engine State — WebGPU Realtime Engine

> **Temporary reference document** — describes the realtime renderer as of 2026-06. Not committed
> documentation; delete when superseded or merged into `documentation/rendering.md`.

---

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `scripts/renderengine/renderengine_base.ts` | Abstract base + settings | `RenderEngine`, `RenderSettings` |
| `scripts/renderengine/renderengine_realtime.ts` | WebGPU realtime engine | `RealtimeEngine`, `RenderLight`, `ShaderProgramCompilable` |
| `scripts/renderengine/wgsl_render_passes.ts` | WGSL pass definitions + registry | `registerWgslPass()`, `lookupWgslPass()`, all pass WGSL sources |

---

## Class Hierarchy

```
RenderEngine  (abstract base — renderengine_base.ts)
  └─ RealtimeEngine  (WebGPU-only — renderengine_realtime.ts)

RenderSettings         — per-frame config; drives graph rebuild via calcUpdateHash()
RenderLight            — per-light wrapper with position jitter + change hashing
ShaderProgramCompilable — marker extending ShaderProgram for material compilation
```

Static registry: `RenderEngine.engines[]` holds registered engine classes.

---

## RenderSettings Fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `sharpen` | `boolean` | — | Enable post-process sharpening |
| `filterWidth` | `number` | `1.5` | AA jitter range |
| `sharpenWidth` | `number` | — | Sharpening kernel radius |
| `sharpenFac` | `number` | `0.4` | Sharpening blend factor |
| `minSamples` | `number` | — | Minimum samples before render is "done" |
| `ao` | `boolean` | — | Enable screen-space ambient occlusion |

`calcUpdateHash()` hashes all fields; a change triggers a full graph rebuild + sample reset.

---

## RealtimeEngine Key Properties

| Property | Type | Purpose |
|----------|------|---------|
| `view3d` | `View3D` | Parent editor |
| `camera` | `Camera` | Active camera |
| `scene` | `Scene` | Scene being rendered |
| `uSample` | `number` | Current sample index (0→maxSamples) |
| `weightSum` | `number` | Accumulated sample weight |
| `maxSamples` | `number` | Default 8 |
| `webgpuGraph` | `WebGpuRenderGraph` | Render graph executor (lazy-created once) |
| `webgpuNodes` | `GraphNodeRef[]` | Sorted node list; rebuilt on settings/size change |
| `webgpuTargets` | `Map<string, RenderTarget>` | Named offscreen `rgba16float + depth24plus` targets |
| `webgpuPing` | `0 \| 1` | Ping-pong index for accumulation |
| `webgpuMaterialStates` | `WeakMap<Material, WebgpuMaterialState>` | Material → (program, pipeline, hash) cache |
| `webgpuNormalProgram` | `WebgpuEngineProgram` | Shared NormalPass pipeline |
| `webgpuPassBuffers` | `WeakMap<GraphNodeRef, {pass, extra?}>` | Per-node uniform buffer allocations |
| `encodeOverlaysCB` | `(ctx, pass, projmat) => void` | Hook for grid/widget/overlay encoding |

---

## Pass Pipeline

Built in `rebuildGraphWebGPU()`. Conditionally assembled based on `renderSettings`:

```
                                          [ao enabled]
                                    NormalPass → 'normal' target
                                          ↓
                                    AOPass → 'ao' target
                                          ↓ (read in BasePass material, gated on WITH_AO define)

BasePass  → 'base' target
    ↓
AccumPass ↔ PassThruPass   (ping-pong pair, alternating accumA / accumB)
    ↓
[sharpen enabled]
    SharpenPass (X) → 'sharpx'
    SharpenPass (Y) → 'sharpy'
    ↓
OutputPass → canvas swap-chain

After OutputPass:
    encodeOverlaysCB (load-not-clear, same swap-chain surface)
```

### Pass Keys and Types

| Key | Type | Fragment |
|-----|------|---------|
| `'NormalPass'` | mesh-based | none — delegates to `encodeMeshNormalPass` hook |
| `'BasePass'` | mesh-based | none — delegates to `encodeMeshBasePass` hook |
| `'AccumPass'` | fullscreen quad | accumulates frame with weight |
| `'PassThruPass'` | fullscreen quad | straight copy |
| `'SharpenPass'` | fullscreen quad | unsharp-mask (X or Y via `AXIS_Y` define) |
| `'AOPass'` | fullscreen quad | SSAO with blue-noise sampling |
| `'OutputPass'` | fullscreen quad | divide accumulator by `weightSum` → canvas |

---

## Pass Uniform Block (`PassUniforms`, 272 bytes)

```wgsl
struct PassUniforms {
  projectionMatrix  : mat4x4f,   // offset 0
  iprojectionMatrix : mat4x4f,   // offset 64
  viewMatrix        : mat4x4f,   // offset 128
  iviewMatrix       : mat4x4f,   // offset 192
  size              : vec2f,     // offset 256
  uSample           : f32,       // offset 264
  weightSum         : f32,       // offset 268
}
```

Bound at `@group(0) @binding(0)` as `passU` in every pass.

---

## Bind Group Layout (`@group(0)`)

All post-process passes use this generic layout; extras (4–7) are pass-specific:

```
@binding(0)  var<uniform>  passU        : PassUniforms        (always)
@binding(1)  var           fbo_rgba_tex : texture_2d<f32>     (input color)
@binding(2)  var           fbo_smp      : sampler             (linear, clamp-to-edge)
@binding(3)  var           fbo_depth_tex: texture_depth_2d    (input depth)
@binding(4)  var<uniform>  [extra]      : [Pass]Uniforms      (AccumPass, SharpenPass, AOPass)
@binding(5)  var           [extra_tex]  : texture_2d<f32>     (AccumPass: lastBuf; AOPass: blueMask)
@binding(6)  var           [extra_smp]  : sampler             (AOPass: blue sampler)
@binding(7)  var           depth_smp    : sampler             (nearest, non-filtering, depth24plus)
```

Built by `_buildPostProcessBindGroup()` per `GraphNodeRef`.

---

## Per-Pass Extra Uniforms

| Pass | Struct | Size | Fields |
|------|--------|------|--------|
| AccumPass | `AccumUniforms` | 16 B | `w: f32` (current frame weight) |
| SharpenPass | `SharpenUniforms` | 16 B | `sharpen: f32` |
| AOPass | `AOUniforms` | 32 B | `blueUVOff`, `blueUVScale`, `dist`, `factor`, `steps` |

---

## Offscreen Targets

All named targets are `rgba16float + depth24plus`:

| Name | Written by | Read by |
|------|-----------|---------|
| `'base'` | BasePass | AccumPass |
| `'normal'` | NormalPass | AOPass |
| `'ao'` | AOPass | BasePass material (via `WITH_AO` define) |
| `'accumA'` | AccumPass (ping=0) or PassThruPass (ping=1) | PassThruPass (ping=0) or AccumPass (ping=1) |
| `'accumB'` | AccumPass (ping=1) or PassThruPass (ping=0) | other slot |
| `'sharpx'` | SharpenPass (X) | SharpenPass (Y) |
| `'sharpy'` | SharpenPass (Y) | OutputPass (sharpen path) |

Canvas swap-chain is `bgra8unorm`; `OutputPass` is transparently re-cached when `node.surface` is set.

---

## Per-Frame Flow (`_renderWebGPU`)

1. Settings hash check → rebuild graph + reset samples if changed
2. Camera hash check → reset `uSample = 0`, `weightSum = 0` if camera moved
3. `uSample++`; update light positions
4. Rebuild graph if viewport size changed
5. Ping-pong swap (`webgpuPing ^= 1`)
6. Acquire canvas swap-chain texture; set on `OutputPass` node
7. Write `PassUniforms` buffers (camera matrices, uSample, weightSum)
8. `webgpuGraph.exec(nodes, hooks)`:
   - Mesh passes → `encodeMeshNormalPass` / `encodeMeshBasePass` hooks
   - Quad passes → build bind group, encode fullscreen quad draw
9. `encodeOverlaysCB` (load-not-clear, same swap-chain view)
10. `weightSum += 1.0`

---

## Mesh Render Flow

### NormalPass (`encodeMeshNormalPass`)

- Iterates `scene.objects.renderable`; skips `!ob.data.usesMaterial`
- Shared `webgpuNormalProgram` pipeline (single pipeline for all objects)
- Per object: writes `objectMatrix` + `normalMatrix` (rotation-only) uniforms, then calls `ob.draw(view3d, gl, uniforms, program)`

### BasePass (`encodeMeshBasePass`)

- Builds `RenderLight[]` list via `_buildWebgpuRLights(scene)`
- Builds frame uniforms via `_buildEngineFrameUniforms(...)` (camera matrices, ambient, lights)
- Optionally attaches AO texture + sampler when `renderSettings.ao`
- Per material: hash = `material.calcUpdateHash() + lightTypes + defines`; on miss, calls
  `mat.generateWgsl(scene, rlights, matDefines)` → `{wgsl, setUniforms}`, compiles pipeline,
  stores in `webgpuMaterialStates`
- Per object: writes `objectMatrix` + `normalMatrix`, calls `ob.draw(...)` with material's program

---

## Jitter / Accumulation

- `getJitterSamples(55)` — 55 blue-noise 2D offsets via Lloyd relaxation (deterministic)
- `_jitteredProjMatrix()` — applies offset as clip-space translation to projection matrix
- `uSample` indexes the jitter sequence; deterministic across frames for stable hashing
- Ping-pong targets prevent read-write hazards without adding full-frame latency

---

## WGSL Preprocessor Defines

| Define | Used in | Effect |
|--------|---------|--------|
| `SAMPLES` | SharpenPass | Kernel radius |
| `AXIS_Y` | SharpenPass | Y-axis vs X-axis |
| `WITH_AO` | BasePass material | Gates AO texture sampling in ambient term |
| `BLUR_SAMPLES`, `BLUR_AXIS_Y` | BlurPass variants | Kernel size / axis |
| `DEPTH_SCALE`, `DEPTH_OFFSET`, `DEPTH_PRESCALE` | Various | Depth linearization |

---

## Overlay Integration

After `OutputPass` writes to the swap-chain, `encodeOverlaysCB` re-opens a **load-not-clear**
render pass against the same swap-chain view. This allows grid lines, transform widgets,
`drawDrawLines`, and toolmode debug geometry to composite with full scene depth available.

Viewport scissor rect is applied to the `OutputPass` region; overlay encoding uses the same rect.

---

## Hash-Based Invalidation Summary

| What changed | Trigger | Effect |
|-------------|---------|--------|
| Camera moved | `camera.generateUpdateHash()` differs | `uSample = 0`, `weightSum = 0` |
| RenderSettings changed | `renderSettings.calcUpdateHash()` differs | Rebuild graph, reset samples |
| Viewport resized | viewport size differs | Rebuild targets + nodes, reset samples |
| Material changed | `material.calcUpdateHash()` differs | Recompile material pipeline |
| Light changed | `RenderLight.calcUpdateHash()` differs | Rebuild light uniform data |
