# Subsurface Scattering Shader Node + Screen-Space SSS Render Passes

## Context

The WebGPU realtime renderer has no subsurface scattering. The shader `Closure`
already carries an unused `scatter : vec3f` field, but `fs_main` only outputs
`light + emission` — scatter is dropped. We want a proper **Subsurface
Scattering shader node** (a BSDF/closure node alongside `DiffuseNode`) whose
diffuse irradiance is physically diffused beneath the surface.

The user chose the **full screen-space separable SSS** approach (Jimenez
SSSSS), not an in-shader approximation: `BasePass` becomes MRT (lit color +
SSS irradiance/radius), two new separable blur passes diffuse the SSS
irradiance, and a composite folds it back before `AccumPass`.

The node takes a **`unit` parameter**: the user authors scatter radii in a
chosen physical unit (skin profiles are conventionally in mm), and a scaling
factor — `convert(1, unit, internalUnit)` — is **computed CPU-side and
multiplied into the SSS scaling factor(s)** uploaded to the blur pass uniforms.
Internal/world unit is meters (`Unit.baseUnit`).

This requires no GLSL work (the renderer is WGSL-only).

## Decisions baked in
- Full screen-space separable SSS with MRT BasePass + 2 blur passes + composite.
- Unit factor computed in JS (`units.convert`) and multiplied into the radius
  uniform written in `_writeExtraUniforms` (per the user's instruction).
- Add `millimeter`/`centimeter` `Unit` classes (recommended; natural for SSS).
  The node's `unit` enum is built from the registered `distance` units.

---

## A. Shader node — `SubsurfaceScatteringNode`

File: `scripts/shadernodes/shader_nodes.ts` (add next to `DiffuseNode`, ~line 472).

Model on `DiffuseNode` (`shader_nodes.ts:408`) for the closure/lighting pattern
and on `MathNode` (`scripts/shadernodes/math_node.ts:56`) for the enum property
+ `graphDefineAPI` + `buildUI` + `STRUCT` field pattern.

- Inputs (sockets, all drivable): `color: RGBASocket` (default skin-ish),
  `radius: Vec3Socket` (per-channel RGB scatter distance, e.g. `[1,0.2,0.1]`),
  `scale: FloatSocket` (default 1), `normal: Vec3Socket`.
- Output: `surface: ClosureSocket`.
- Property (non-socket, like `MathNode.mathFunc`): `unit: number` — index into
  the distance-unit list; default = millimeter. `static graphDefineAPI(...)`
  declares it via `nstruct.enum('unit', 'unit', SSSUnitEnum, 'Unit', '...')`,
  `buildUI` calls `container.prop('unit')`, and `STRUCT` adds `unit : int;`.
  Build `SSSUnitEnum` once from `Units` filtered to `unitDefine().type ===
  'distance'` (import `Units`, `Unit` from pathux units — see §B).
- `genWgsl`: like `DiffuseNode` — compute lit diffuse irradiance with
  `DiffuseBRDFWgsl` + `LightGenWgsl.generate`, then:
  - `cl.scatter = <irradiance to diffuse>` (the diffuse light, so the blur pass
    diffuses lit irradiance, not raw albedo).
  - `cl.sssRadius = max(radius.r, max(radius.g, radius.b)) * scale;` — base
    **world** radius (pre-unit-scale; the per-channel falloff weighting happens
    in the blur pass; the unit factor is applied CPU-side, §D/§E). Write the raw
    `radius`/`scale` socket values (they become `material.*` uniforms, stay
    drivable).
- Register at module end: `nstructjs.register(...)` + `ShaderNetworkClass.register(...)`
  (mirrors `DiffuseNode` at `shader_nodes.ts:471-472`). This makes it appear in
  the node-editor Add menu automatically (`NodeEditor.makeAddNodeMenu` scans
  `ShaderNodeTypes` by `nodedef().category`; use `category: 'Shaders'`).

Closure additions (so the node can carry a per-pixel radius):
- `scripts/shadernodes/shader_lib_wgsl.ts` — `CLOSURE_WGSL` (`:36`): add
  `sssRadius : f32,`.
- `scripts/shadernodes/shader_nodes.ts` — the TS `Closure` class (`:39`) +
  `Closure.STRUCT` (`:73`): add `sssRadius` (parallel to `scatter`).

---

## B. Units — add millimeter / centimeter

File: `scripts/path.ux/scripts/path-controller/units/units.ts`

Add `MillimeterUnit` and `CentimeterUnit` mirroring `InchUnit` (`:180`):
`toInternal` ×0.001 / ×0.01, `fromInternal` ÷, distance type, suffix `mm`/`cm`,
`Unit.register(...)` after each. Update the header doc comment unit list (`:13`).
The factor the node needs is `convert(1, <unitName>, Unit.baseUnit)` (`:625`).

---

## C. BasePass → MRT (lit color + SSS data)

1. `scripts/renderengine/renderengine_realtime.ts` — `_ensureTarget` (`:331`):
   add optional `colorFormats?: GPUTextureFormat[]` (default
   `[WEBGPU_PASS_FORMAT]`); allocate `base` with
   `[WEBGPU_PASS_FORMAT, WEBGPU_PASS_FORMAT]`. `RenderTarget` already supports
   MRT (`scripts/webgpu/render_target.ts:33,61` — one attachment per
   `colorFormats` entry, each `TEXTURE_BINDING`). No RenderTarget change needed.
2. Material pipeline 2nd target — `renderengine_realtime.ts:663` (where
   material `colorTargets` are rewritten to `rgba16float`): append a second
   `{format: WEBGPU_PASS_FORMAT}` target. Leave the shared
   `buildMaterialPipelineDescriptor` (`scripts/shaders/wgsl_shaders.ts:1357`)
   and the NormalPass program (`:708`) single-target.
3. Two-output fragment — `scripts/shadernodes/shader_nodes_wgsl.ts`
   `generate` (`:343-357`): emit `struct FsOut { @location(0) color : vec4f,
   @location(1) sss : vec4f }`; init `_mainSurface.sssRadius = 0.0`;
   `out.color = vec4f(light+emission, alpha)`;
   `out.sss = vec4f(scatter, sssRadius)` (rgb = irradiance to diffuse, a =
   world radius). Update `buildFallbackWgsl` (`:416`) to the same 2-location
   `FsOut` (zeros) — **required**, a 1-output fragment against a 2-attachment
   pass fails WGSL validation. Non-SSS materials write `(0,0,0,0)` → SSS chain
   is a no-op; `out.color` is byte-identical to today.

`encodeMeshBasePass` needs no change — the pass is opened by
`WebGpuRenderGraph.exec` → `ctx.renderStage(node.target,...)`
(`scripts/webgpu/render_graph.ts:153`), which emits 2 attachments because
`base` is now 2-color.

**Verify (risk R3):** LiteMesh/sculptcore draws via `setDrawShader(state.wgsl)`
(`renderengine_realtime.ts:~1107`) into the same encoder. Confirm it targets the
engine's BasePass MRT (it should). If sculptcore opens its own single-attachment
pass, gate the 2nd output behind a `#define WITH_SSS` so that path stays
single-output. Check during implementation.

---

## D. New passes + graph wiring

File: `scripts/renderengine/wgsl_render_passes.ts` — add & `registerWgslPass`
(near `:600`), modeled on `SHARPEN_PASS_WGSL` (`:241`, uses `#define SAMPLES` +
`AXIS_Y` for the separable X/Y variants) and `OUTPUT_PASS_WGSL`:

- `SSS_BLUR_PASS_WGSL` (`key: 'SSSBlurPass'`): samples input color (= BasePass
  `colors[1]`: rgb irradiance, a world radius) + depth (binding 3 + nearest
  sampler binding 7). Early-out/passthrough when `a == 0` (risk R6). Project the
  per-pixel world radius to screen pixels using depth + `passU` projection
  (reuse AO's unproject math, `wgsl_render_passes.ts:407-411`), clamp to
  `maxScreenPx`, step along X or Y (`#ifdef AXIS_Y`) weighting by a diffusion
  profile (start: per-channel Gaussian, red widest; upgrade to a multi-Gaussian
  Jimenez fit later). Binding 4 = `SSSBlurUniforms`.
- `SSS_COMPOSITE_PASS_WGSL` (`key: 'SSSCompositePass'`): binding 1 = BasePass
  lit `colors[0]`, binding 5 (extra) = blurred SSS (`sssBlurB.colors[0]`),
  binding 4 = `SSSCompositeUniforms{ strength }`. Output
  `vec4f(lit.rgb + blurredSSS.rgb * strength, 1.0)` + sampled depth.

File: `scripts/renderengine/renderengine_realtime.ts`:

- `rebuildGraphWebGPU` (`:352`): inside an `if (this.renderSettings.sss)` block
  placed **between BasePass (`:378`) and AccumPass (`:389`)**, allocate targets
  `sssBlurA`, `sssBlurB`, `sssComposite` (via the local `target()` helper, so
  they're freed on toggle-off, `:428`) and push nodes in order:
  `SSSBlurX` (`passKey:'SSSBlurPass'`, `defines:{SAMPLES: sssWidth}`,
  `target: sssBlurA`, `label:'SSSBlurPass.x'`),
  `SSSBlurY` (`defines:{SAMPLES: sssWidth, AXIS_Y:true}`, `target: sssBlurB`,
  `label:'SSSBlurPass.y'`),
  `SSSComposite` (`passKey:'SSSCompositePass'`, `target: sssComposite`).
- `_getPassInputTarget` (`:851`): `SSSBlurPass` X → BasePass target;
  `SSSBlurPass` Y → prior `sssBlurA` (back-scan like SharpenPass.y `:874`);
  `SSSCompositePass` → BasePass target; **`AccumPass` (`:862`) → composite when
  sss on**: `nodes.find(SSSCompositePass)?.target ?? base`. Add
  `'SSSCompositePass'` to the OutputPass back-scan key set (`:887`).
- `_buildPostProcessBindGroup` (`:961`) — **solves the single-input assumption
  (risk R1), entirely here**: today it always binds `input.colors[0]` (`:978`).
  Pick the color index per passKey: `SSSBlurPass` X binds base `colors[1]`;
  for `SSSCompositePass` bind base `colors[0]` at binding 1 and `sssBlurB`
  `colors[0]` as a pass-specific extra at binding 5 (mirror the AccumPass
  binding-5 pattern at `:1003`). No render_graph change.
- `_ensurePassBuffers` (`:813`): extra-buffer size 32 for `SSSBlurPass`, 16 for
  `SSSCompositePass`.
- `_writeExtraUniforms` (`:919`, mirror AOPass branch `:938`):
  ```
  if (node.passKey === 'SSSBlurPass') {
    const rs = this.renderSettings
    const unitScale = units.convert(1, rs.sssUnit ?? 'meter', Unit.baseUnit)
    const d = new Float32Array(8)
    d[0] = rs.sssScale * unitScale   // <-- unit factor folded in, CPU-side
    d[1] = rs.sssFalloff; d[2] = 64.0 /*maxScreenPx*/
    // d[4..7] = profile weights
    buf.write(d)
  }
  if (node.passKey === 'SSSCompositePass') {
    const d = new Float32Array(4); d[0] = rs.sssStrength ?? 1.0; buf.write(d)
  }
  ```
  > Note: the global `sssScale` carries the unit factor here; per-pixel base
  > radius comes from the node via BasePass `colors[1].a`. If per-node units are
  > preferred over a global setting, fold `convert(1, unit, base)` into the
  > node's emitted `sssRadius` instead (bake the factor as a WGSL literal in
  > `genWgsl`, like `MathNode`). Default plan: global setting (simpler, one
  > knob); confirm during implementation.

When `sss` is off the chain is absent and AccumPass reads `base` exactly as
today — no regression. Ping-pong (`_renderWebGPU:476`) is unaffected.

---

## E. Settings / toggle

File: `scripts/renderengine/renderengine_base.ts` — `RenderSettings` (`:6`):
add `sss: boolean`, `sssScale: number`, `sssWidth: number` (int),
`sssFalloff: number`, `sssStrength: number`, `sssUnit: string`. Init in the
constructor (`:16`), add to `calcUpdateHash` (`:25` — hashing `sss`/`sssWidth`
triggers the graph rebuild via `renderengine_realtime.ts:457`, freeing/allocating
SSS targets like `ao`/`sharpen`), and to `STRUCT` (`:35`). `sssWidth` →
`defines.SAMPLES`; scalar params read live in `_writeExtraUniforms`.

Optionally surface the toggle/params in the render-settings UI panel next to
AO/sharpen, and (since these are data-API props) run `pnpm gen:paths` if the
panel binds new paths.

---

## Verification

1. `npx tsgo --noEmit` — no new errors beyond the documented 106 baseline.
2. Boot the app and add the node: open the Shader Editor (`MaterialEditor`),
   confirm **Subsurface Scattering** appears under the *Shaders* category and
   wires `surface → Output`. Headless harness alternative:
   `CTX.api.execTool(CTX, "node.add_node(...nodeClass='subsurface_scattering')")`
   via `--eval` (see CLAUDE.md "Debug context API").
3. Visual: a sphere with the SSS node + `renderSettings.sss = true` should show
   soft light bleed (e.g. reddish at shadow terminator). Toggle `sss` off →
   identical to a plain diffuse (proves the no-op path).
4. Unit check: with the same numeric radius, switching the node `unit` from
   millimeter → centimeter should widen the scatter ~10× (factor 0.001 → 0.01),
   confirming the CPU-side `convert` multiply.
5. Regression: with `sss` off, frame output is unchanged (BasePass `colors[0]`
   path untouched); MRT attachment 1 is written but unused.
6. Confirm LiteMesh/sculptcore meshes still render (risk R3) — if they break,
   apply the `#define WITH_SSS` gate on the 2nd fragment output.

## Risks
- **R1 multi-input passes** — solved inside `_buildPostProcessBindGroup` (color
  index per passKey + composite's 2nd texture as an extra). No render_graph change.
- **R3 sculptcore MRT** — must verify the C++ tree renderer draws into the
  engine's 2-attachment BasePass; fallback is the `WITH_SSS` define gate.
- **R6 zero-radius** — blur must passthrough when `colors[1].a == 0`.
- **R8 debug snapshot** ignores `colors[1]` (`render_graph.ts:179`) — cosmetic.
- **R9 perf** — 3 extra fullscreen passes when sss on; can drop SSS irradiance
  to half-res later.

## Critical files
- `scripts/shadernodes/shader_nodes.ts` (node + Closure TS)
- `scripts/shadernodes/shader_lib_wgsl.ts` (CLOSURE_WGSL)
- `scripts/shadernodes/shader_nodes_wgsl.ts` (MRT fs_main)
- `scripts/renderengine/renderengine_realtime.ts` (targets, graph, bind groups, uniforms)
- `scripts/renderengine/wgsl_render_passes.ts` (blur + composite WGSL)
- `scripts/renderengine/renderengine_base.ts` (RenderSettings)
- `scripts/path.ux/scripts/path-controller/units/units.ts` (mm/cm units)
