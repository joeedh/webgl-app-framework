# Per-face material attribute

Unblocks three ImmediateTODOs that all assume per-face materials exist:
"assign materials to selected faces", "assign by polygroup click", and Select
Similar → *Material*. Today materials are per-`SceneObject` only.

Steps 1–3 are small and ship user-visible value **without** step 4. Step 4 (the
renderer honouring more than one material) is a genuine project and the only
risky part. Sequence accordingly.

## What already exists (more than expected)

- **The slot array is already there.** `SceneObjectData.materials:
  Array<Material|undefined>` (`scripts/sceneobject/sceneobject_base.ts:57`),
  serialized as DataRefs (`:97`), re-linked with `addUser` in `dataLink`
  (`:360-375`), and exposed to the data API as a list (`:103-119`).
  `ctx.material` already returns `ob.data.materials[0]` for meshes
  (`scripts/core/context.ts:226`).
- **The Material tab and a slot chooser already exist**: `PropertiesEditor`
  builds `tab('Material')` → `materialPanel(tab)` (`:1085`, `:1198`), which
  mounts `material-panel-x` = `MaterialChooser` (slot list, with a per-object
  active-slot cache) + a shader subpanel (`scripts/editors/editor_base.ts:1416`,
  `:1570-1600`).
- **`ToolMode` already has static UI hooks** — `buildSettings(container)` and
  `buildHeader(header, addHeaderRow)`
  (`scripts/editors/view3d/view3d_toolmode.ts:173,177`).
- **Reading a face attr during VBO fill is already done**: `polyGroupColor`
  tints display colour from the `"group"` int face attr
  (`sculptcore/source/spatial/spatial_gpu.cc:41-52`, consumed in
  `fill_leaf_slice` `:97-105,140-143`).

So this is mostly *connecting* existing pieces, not building new ones.

## Step 1 — the attribute

**A plain named `int16` face attr, created lazily; slot 0 = the object's
existing material.**

- **Type: `AttrType::SHORT`.** It is genuinely plumbed, not a decorative enum
  value: `type_dispatch` maps it to `short` (`sculptcore/source/mesh/attribute.h:412`),
  it round-trips in `mesh_serialize.cc:92`, and the remesher already uses it
  (`.remesh.v.pole_index`). `INT` would also work — the saving is ~2 bytes/face
  (3MB at 1.5M tris against a 268MB blob), so the width is not the interesting
  decision. Slots are 0..a-handful, so int16 is generous either way.
- **Name it `"material"`**, mirroring how `"group"` works. Note `"group"` is
  **not** a `BuiltinAttr` — it's a plain named attr the polygroup brush's attr
  manifest creates on demand (`boundAttr<int>("group")`,
  `source/brush/kernels/generated/polygroup.brush.gen.h:63,88`; "ensure +
  value-init" at `source/debug/gpu_stroke.cc:216-222`). Do the same.
- **`AttrUse::MATERIAL` is optional.** `AttrUse::POLYGROUP` is *only* a naming
  convenience — it picks the auto-generated base name in `addAttr()`
  (`source/mesh/mesh.h:285`). Add the tag if you want `addAttr` to name it
  "material"; nothing else keys off it.
- **Lazy creation + slot 0 default.** `faceGroup()` returns 0 when the attr is
  absent (`mesh.h:613-623`); do the same. A single-material mesh then costs
  *nothing* — no memory, no file growth, no draw change. The feature only
  materialises when a second material is assigned.
- **Do NOT set `AttrFlag::TEMP`.** `mesh_serialize.cc:222,234` skips exactly the
  TEMP attrs; everything else persists. Non-TEMP is all that's needed for
  `.wproj` round-trip.

**Interpolation is free and already correct.** `attr_interp.h` dispatches
generically and branches `if constexpr (std::is_floating_point_v<T>)` → lerp,
else → copy (`source/mesh/utils/attr_interp.h:161-175`). So an integral material
index is *copied*, never averaged — dyntopo splits, extrude, inset, bevel,
subdivide and triangulate all inherit the slot correctly with zero new code.

**C++ surface** (mirrors `facesInGroup`, added in `d4acf47`):

```cpp
int  faceMaterial(int face);                             // 0 when attr absent
void facesWithMaterial(int slot, util::Vector<int> &out);
void setFacesMaterial(util::Vector<int> &faces, int slot); // ensures the attr
```
plus `BIND_STRUCT_METHOD(st, name, MARGS(...))`. No N-API change — the
reflection runtime builds the bound class generically; the documented 4-place
change is only for free functions.

### The one real bug to fix first

`SceneObjectData.dataLink` **compacts the slot array** on load:

```ts
for (let i = 0; i < this.materials.length; i++) {
  const mat = getblock_addUser<Material>(this.materials[i], this)
  if (mat) mats.push(mat)      // <-- a failed slot silently shifts every later slot down
}
this.materials = mats
```
(`sceneobject_base.ts:363-374`)

Harmless today (nothing indexes slots). The moment face data references slot
indices, one unresolvable material silently repaints every face after it with
the wrong material. **Preserve positions** (push `undefined`) before step 1
lands. `materials` is already typed `Array<Material | undefined>`, so the type
already allows it.

## Step 2 — assign ops

- `litemesh.assign_material(slot)` over the current face selection.
- `litemesh.assign_material_polygroup(slot)` — click a face, assign to its whole
  poly group. Reuse `SelectPolyGroupLiteMeshOp` (added in `f8b495f0`); the pick
  half is done.

**Binding trap (already hit once, see `f8b495f0`):** a bound method taking
`util::Vector<int>&` is generated as `int32[]` but **rejects a JS array** at
runtime ("missing litestl::util::Vector binding for
litestl::util::Vector<int32,4>"). Pass a bound handle from
`LiteMesh._intVecOut()`. Typecheck cannot catch this — call sites cast through
`as unknown`. Follow `LiteMesh.selectPolyGroup`, which hands the gathered Vector
straight to the next bound method so indices never cross into JS.

## Step 3 — UI + Select Similar (no renderer needed)

- **Toolmode callback for the material tab**: add
  `static buildMaterialPanel(container)` to `ToolMode`
  (`view3d_toolmode.ts`, next to `buildSettings`/`buildHeader`), call it from
  `MaterialPanel.rebuild` (`editor_base.ts:1600+`) for the active toolmode.
  Box-model mode contributes "Assign to Selected"; sculptcore mode contributes
  "Assign by Poly Group". This is the TODO's "toolmode callback to extend the
  material tab" — an existing pattern, not a new mechanism.
- **Select Similar → Material** works as soon as step 1 lands: it just compares
  `faceMaterial(seed)` and gathers, exactly like the poly-group criterion.

Steps 1–3 are shippable with the viewport still drawing slot 0 everywhere. That
is a coherent state: assignment is authored and persisted, and only the preview
lags.

## Step 4 — the renderer (the real project)

**Correction to an earlier assumption:** the `SimpleIsland` /
`(primflag, LayerType)` VBO split is a **different, legacy subsystem**
(`scripts/webgl/simplemesh.ts:1043`, used by widgets, overlays and the legacy
PBVH toolmode). **LiteMesh does not use it at all.** Do not plan around
extending that key — it is the wrong subsystem.

How LiteMesh actually draws:

- `BasePass` → `RealtimeEngine.encodeMeshBasePass`
  (`scripts/renderengine/renderengine_realtime.ts:1189-1346`) walks the scene and
  **reads only `mats[0]`** (`:1227-1229`) — slot 0 is the *only* slot that has
  ever reached the renderer.
- It compiles the material to WGSL (`ShaderNetwork.generateWgsl`,
  `scripts/shadernodes/shadernetwork.ts:222`) and pushes it down via
  `LiteMesh.setDrawShader` (`scripts/lite-mesh/litemesh.ts:3401`) →
  `SpatialTree::setDrawShader` (`sculptcore/source/spatial/spatial.cc:218-280`),
  which stores **one** `ShaderDef` on **one member field**
  (`SpatialTree::drawShader`, `spatial.h:109`).
- Every GPU node's `DrawCommand` points at that same `ShaderDef`
  (`spatial.cc:3026-3027`), so all nodes share **one pipeline**
  (`WebGPUBatchExecutor.getPipeline` keys on `sdefPtr|topology|shape|target|cull`,
  `scripts/webgpu/batch.ts:380-443`) and the whole batch replays from **one
  cached `GPURenderBundle`** (`batch.ts:692-693`).
- Geometry is **non-indexed per-corner triangle soup** (`fill_leaf_slice`,
  `spatial_gpu.cc:109-156`); `GPUCmdType` has no indexed variant
  (`source/gpu/types.h:13-18`).

So an uber-shader is out (materials are arbitrary node graphs → separate WGSL),
and the change is structural: **one `ShaderDef` per tree must become one per
(tree × material slot)**.

**Shape of the work:**

1. Sort each leaf's tris by material slot before filling `pos`/`nor`/`attrBufs`
   so same-material corners are contiguous (`fill_leaf_slice`/`fill_leaf_attr`,
   `spatial_gpu.cc:97-231`).
2. Record per-material sub-ranges per leaf (extend `LeafSlice`/`GpuData`,
   currently one contiguous range per leaf, `spatial_gpu.cc:428-434`).
3. Emit one `DrawCommand` per (GPU node × material present in that node), each
   with its own `start`/`end` and its own `ShaderDef`.

**The sub-range plumbing already exists**: `DrawCommand` carries `start`/`end`
(`source/gpu/command.h:18`) and the encoder already does
`enc.draw(e.count, 1, e.start, 0)` (`batch.ts:597`). Today every command simply
spans its whole node (`gd.cmd->end = gd.pos->size`, `spatial.cc:3046-3047`). So
the mechanism is there; the single-`ShaderDef`-per-tree model is what breaks.

### Budget this explicitly — it attacks a known hot path

`documentation/research/2026-07-15-1430-nondyntopo-stroke-profile-1.5m.md`
measured this exact cost. At `gpu_tri_target=2048` a 1.5M-tri sphere produced
**827 draw commands** and main-thread draw was **40–71 ms/frame**, dominated by
per-command work in `WebGPUBatchExecutor.dispatch`. It is **2.0 ms/frame** today
precisely because of (a) a coarser `DEFAULT_GPU_TRI_TARGET = 1<<15`
(`litemesh.ts:68`) → **246 commands**, and (b) one pipeline + one render bundle
for the whole batch.

Splitting by material multiplies command count *and* breaks the single-pipeline
assumption (more bind-group switches inside the bundle, more pipeline-cache
entries). That is the same per-command overhead the profile identifies as
dominant — so do not assume render bundles make it free.

**The mitigating argument, worth validating early:** material assignment is
normally *spatially coherent* (a region, a poly group). With leaves sorted by
material, most leaves touch exactly **one** slot and emit exactly one command —
the count grows with material **boundaries crossing leaves**, not with material
count. At 32768 tris/node, few leaves should straddle a boundary.

**So the first thing step 4 should do is measure that**, not build it: take a
1.5M-tri mesh, assign 2–4 materials in realistic regions, and count how many
leaves straddle a boundary. If it's a few percent, the command multiplier is
~1.0x and this is tractable. If painted materials are speckled, it is not, and
the design needs a cap (materials-per-node) or a different approach. That
measurement is cheap and decides the whole shape of step 4.

### Step 4a — DONE. Measured 2026-07-16; results changed the design.

Full write-up:
[2026-07-16-2250-material-draw-split-measurement.md](../research/2026-07-16-2250-material-draw-split-measurement.md).
Instrument: `SpatialTree::materialStats(perLeaf, out)` + `__materialFragTest`.

On 1.5M tris (747,654 faces, 1101 leaves, **82 draw commands today**):

| scenario | leaf straddle | cmds after | multiplier |
|---|---|---|---|
| `halves2` | 11.1% | 127 | **1.55x** |
| `quarters4` | 18.7% | 157 | **1.92x** |
| `sides6` | 16.0% | 154 | **1.88x** |
| `speckle4` (control) | 100% | 328 | 4.00x |

**Verdict: tractable.** Realistic layouts cost **1.55–1.92x** commands (82 →
127–157), well under the 246 commands that profile at 2.0ms/frame. The
mitigating argument holds — cost tracks material *boundaries*, not material
*count* (`sides6`/6 slots is cheaper than `quarters4`/4 slots). The ~1.11x
estimate above was optimistic by ~1.5x; leaves are elongated AABBs, not compact
patches. No materials-per-node cap is needed.

**But those numbers are a *lower bound*, and only one design reaches them.**
They assume same-slot geometry merges *across* leaves. If instead every
(leaf × slot) run is its own draw, the cost is **1223–1317 commands** — past the
827 that profile at 40–71ms. The two bounds are 10x apart and straddle
viability.

Correction to "Shape of the work" below: **item 1 (sort tris within each leaf) is
not sufficient, and reordering whole `LeafSlice`s is not either.** Per-leaf
contiguity is load-bearing (`fill_leaf_slice` refills one leaf's contiguous
range) and conflicts with per-slot contiguity — both hold only when every leaf is
single-slot. Since the measurement shows **81–89% of leaves already are**, prefer:

1. **Split mixed leaves along material boundaries at assign time** so every leaf
   is pure; then LeafSlice reordering hits the lower bound *and* keeps per-leaf
   contiguity. Costs ~11–19% more leaves. Assignment is rare and explicit, so
   paying there is right.
2. Full tri sort across the GPU node — hits the lower bound, breaks incremental
   refill.
3. Per-leaf runs — unusable.

**Still unmeasured:** the pipeline / `GPURenderBundle` cost. N materials means N
pipelines and more bind-group switches inside the bundle; command count says
nothing about that, and it could dominate. A real frame-time comparison against
the 2026-07-15 baseline is still required before step 4 is declared safe.

## Verification

Steps 1–3 are drivable over CDP without the renderer (see
`2026-07-16-1530-world-space-brush-radius.md` for the recipe). Make the test data
non-empty: an empty group/slot short-circuits before the bound Vector call is
ever exercised, which is exactly how the `int32[]` trap stayed hidden.

Step 4 needs a real frame-time comparison against the 2026-07-15 baseline, not
just a correct-looking picture.
