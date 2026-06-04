# Shader attributes (dynamic, attribute-driven materials)

The realtime renderer and the shader-node system use a **dynamic,
attribute-driven** vertex interface. A material declares — by *name* and
*category* — which mesh attributes its shader reads; the renderengine collects
that set and hands it to sculptcore, which builds **one GPU vertex buffer per
requested attribute** (default-filled when a layer is absent, never throwing).
This replaces the old fixed WebGL-era model where the `geometry` node hardwired
`uv`/`color`/`tangent`/`id` and `ShaderContext` enumerated them as a bitmask.

The end-to-end path (and the integration test that exercises it) is:

```
AttributeNode(name, category)            scripts/shadernodes/shader_nodes.ts
  └─ genWgsl → requestAttribute()        scripts/shadernodes/shader_nodes_wgsl.ts
       └─ Material.generateWgsl() ──────▶ {wgsl, requestedAttrs: RequestedAttrDesc[]}
            └─ LiteMesh.setRequestedAttrs / setDrawShader   scripts/lite-mesh/litemesh.ts
                 └─ SpatialTree_setRequestedAttrs / _setDrawShader   (N-API + WASM)
                      └─ sculptcore builds attrBufs[] per slot         sculptcore/source/spatial/
                           └─ batch.ts binds buffers by name/slot      scripts/webgpu/batch.ts
```

## The Attribute node

`AttributeNode` (`scripts/shadernodes/shader_nodes.ts`) is Blender-style: one
selected attribute drives **three fixed outputs** — `color` (vec4), `vector`
(vec3), `fac` (float) — by swizzle/broadcast. It carries two serialized
properties:

- `attrName: string` — the mesh layer name (e.g. `color`, `uv`).
- `category: int` — an `AttributeCategory`, which doubles as a sculptcore
  `AttrUse` filter bit:

  | `AttributeCategory` | value | maps to | WGSL / elemSize / gpuType |
  |---|---|---|---|
  | `GENERIC` | 0 | by name, any layer | `vec3f` / 3 / 4 (FLOAT3) |
  | `COLOR`   | 2 | `AttrUse.COLOR` | `vec4f` / 4 / 8 (FLOAT4) |
  | `UV`      | 4 | `AttrUse.UV`    | `vec2f` / 2 / 2 (FLOAT2) |

`buildUI(container)` builds a **dynamic enum dropdown** of the active mesh's
attributes in the selected category, read from `container.ctx.mesh.attrItems`
filtered by `category` (a `GENERIC` category lists everything). The node stores
the *string* name, so a graph is decoupled from any particular mesh.

If `attrName` is empty the node emits category-typed defaults (zero/black);
nothing breaks when no attribute is chosen.

## Codegen: collecting the requested set

`WgslShaderGenerator.requestAttribute(name, category)`
(`scripts/shadernodes/shader_nodes_wgsl.ts`) dedups by `name` and, after the
graph walk, assigns each a **slot = `2 + index`** (position is implicitly slot
0, normal slot 1). It then generates the `VertexInput` struct + pass-through
varyings dynamically (`@location(slot) <field> : <wgslType>`), so the WGSL
vertex interface is a single source of truth derived from the requested set.

`Material.generateWgsl()` returns `{wgsl, setUniforms, requestedAttrs}` where
each `RequestedAttrDesc` is `{name, category, field, wgslType, gpuType,
elemSize, slot}`. **`slot` is the contract**: the generated WGSL
`@location(slot)` must equal the C++ ShaderDef attr order — verify with a
"UV-as-color" debug material if it ever drifts.

## Bridge to sculptcore (LiteMesh)

`scripts/lite-mesh/litemesh.ts`:

- `setRequestedAttrs(reqs: RequestedAttrDesc[])` — marshals the descriptors into
  parallel bound vectors and calls `SpatialTree_setRequestedAttrs`.
- `setDrawShader(wgsl: string)` — installs the material's WGSL as the spatial
  tree's draw shader (so the sculpt batch draws with the *material's* shader,
  not `basicMeshShader`). Call after `setRequestedAttrs`.
- `getMissingAttrSlots(): number[]` — slots sculptcore reports as absent on the
  mesh (advisory only; those buffers are default-filled, the frame is never
  blank).

The renderengine wires this in the BasePass material-compile step
(`scripts/renderengine/renderengine_realtime.ts`): after `generateWgsl()`, for a
LiteMesh object it calls `setRequestedAttrs` + `setDrawShader`, then
`getMissingAttrSlots()` once and `console.warn`s per missing name.

Both backends go through the same `IWasmInterface` entry points
(`SpatialTree_setRequestedAttrs` / `_setDrawShader` /
`_getMissingAttrSlots`, `sculptcore/typescript/api/wasm.ts`). Per the native
conventions: pointers never cross to JS, bulk reads copy (no zero-copy), and the
seam never throws — a not-yet-filled buffer yields an empty view, a missing
source layer yields a default-filled buffer (never an absent/half-sized one).

## CORNER vs VERTEX domain

UVs are **corner-domain**, vertex colors **vertex-domain**. The C++
`fill_leaf_attr` gathers VERTEX attrs through `c.v` and reads CORNER attrs
directly — wrong indexing scrambles UVs silently, so the domain is part of the
`RequestedAttr` contract and is tested explicitly.

## Testing

- **Test scene** `litemesh-attrtest` (`scripts/lite-mesh/litemesh_test_scene.ts`)
  — a cube with a VERTEX FLOAT4 `color` layer (position→rgb) and a CORNER FLOAT2
  `uv` layer (box unwrap). Deterministic, so WASM↔native parity is exact.
- **Driver** `scripts/lite-mesh/litemesh_attrtest_support.ts` exposes
  `globalThis.__attrtestApply([...])` (build material → codegen →
  `setRequestedAttrs`/`setDrawShader` → `update`), `__attrtestBuildWgsl` (codegen
  only, no mesh push), and `__attrtestRoundtrip` (nstructjs JSON round-trip of a
  shader graph). The headless harness drives these via `--eval=<expr>` and
  surfaces their results in `--dump` (`attrtest` / `attrRoundtrip` fields).
  > NB: pass `--eval=<expr>` as a **single** argv token. A bare `<expr>` token
  > is parsed by headless Chromium as a positional URL and aborts the launch
  > when a value-taking flag (`--dump`) follows.
- **Integration test** `tests/integration/litemesh_attr_render.test.ts` — asserts
  the requested contract, populated per-attribute GPU buffers, the missing-layer
  default-fill + advisory, WASM↔native parity, and the JSON round-trip.

## Test format: shader graphs as JSON

A shader-node `Material` (including its `AttributeNode`s) round-trips losslessly
through `nstructjs.writeJSON` / `readJSON` — verified by the round-trip test
above. So a committed `.json` graph is an adequate fixture format; no bespoke
serializer is needed to author test materials.
