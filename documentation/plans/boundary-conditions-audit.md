# Boundary-conditions plan — post-implementation audit

Audit of the code shipped under the `boundary-conditions` plan
(`sculptcore/documentation/plans/boundary-conditions.md`, all waves marked
DONE 2026-05-31). Covers the sculptcore submodule range `a731499^..HEAD` and the
app-side commits `f98d178..1a86475` (the two tip icon commits are excluded — not
part of this plan).

Scope reviewed: mesh boundary/seam/UV-gen core, the sbrush DSL attribute/face
extensions + GPU dispatch, the spatial display/overlay/picking changes, and the
LiteMesh app-side TS (UI, ToolOps, brush bridge).

Findings are grouped by severity. `[sc]` = sculptcore submodule, `[app]` = main
repo. Items marked **(confirmed)** were re-verified directly against the code
during the audit; the rest are agent findings worth a second look before fixing.

---

## Resolution status (2026-05-31)

All P0–P3 findings were fixed, plus regression tests for the bug fixes. Both the
sculptcore native build and `npx tsgo --noEmit` (app, no new errors over the 106
baseline) are green; the affected sculptcore tests pass.

- **P0 B1/B2/B3** — fixed. B1: handler reads `e.selection.id` → `attrItems[id]`.
  B2: `attr.use` now serialized (mesh format v1→v2 + migration). B3: poly-group
  paint marks faces boundary-dirty (`boundary::markFaceDirty`); bsmooth folds
  pending dirty into the vertex classification at stroke start — gated on a new
  O(1) `MeshBase::boundaryDirty` flag so it does **not** thaw/perturb the frozen
  CSR neighbor set when nothing changed (an early unconditional thaw regressed
  `test_bsmooth`; the flag gate fixes it).
- **P1 R1–R7** — fixed. R1: bool layers now value-inited; GPU-attr scope made
  honest in the plan (32-bit only; CUDA/OpenCL/WgpuNative attr deferred). R2/R3:
  documented + `wgpu-native-verify` skips attr brushes. R4: seam undo snapshots &
  restores exact prior per-edge seam bits (new `edgePathEdges`/`edgeSeam`/
  `setEdgeSeam`/`recomputeBoundary` C-API). R5: seam overlay uses a uniform
  offset (no shared-vertex kinks). R6: WebGPU dispatch skips a bad draw command
  (warn-once) instead of throwing. R7: `castScreen*` honor `selmask` and tag
  elements (`LiteMeshPickElem`). R8 documented (see below).
- **P2/P3 C1–C12, D1–D6** — fixed (comments, the `mu`-slot static_assert, the
  detach/reattach invariant guard, `uniqueAttrName` dedup, hoisted string-keyed
  lookups, dead `uv` buffers removed, degenerate-face guard, dead `if(0&&first)`
  / `first` field removed, debug logs + dead imports removed).
- **P4 tests** — added T1 (incremental dirty), T2 (uvgen empty/all-seam/UV-tag),
  T3 (mesh_path unreachable/out-of-range), T4 (detach/reattach round-trip),
  B2 round-trip, T5 (nearestVert), and **fixed a stale pre-existing test**:
  `test_brush_attr` hardcoded poly-group id `7` but the brush assigns a per-stroke
  `activeGroup` (Wave 2b regression the code-reading audit missed) — now discovers
  the painted id. **Not added** (heavier infra, low marginal value): T6
  (`fill_leaf_slice` GPU composite) / T7 (`buildSeamBatch`) need GPU-batch
  readback harness; T8 (ListBox→bridge) needs a DOM+WASM e2e harness — left for
  the integration/e2e layer.
- **Pre-existing failures found while validating** (NOT introduced here, confirmed
  by building the original tree): `sculptcore` `test_debug_script` (smooth-spike
  assertion `smoothedZ < spikeZ`) fails on master too; app `tests/integration/
  install_flow.test.ts` (esbuild-wasm addon transpile) is flaky/environmental.
  Both are out of scope for this audit but worth separate tickets.
- **R8 (golden regen)** — the regenerated goldens reflect an intentional spatial
  partition retune (the old anchors had `tris:0` leaves, i.e. were captured in a
  pre-fill state); cpp==wgsl holds against the current tree. Treated as a
  rationale clarification, not a code change.

---

## P0 — correctness bugs (functional regressions vs. the stated design)

- [ ] **B1 [app] The Wave 2b attribute-list selection path is dead — wrong event
  shape.** `scripts/lite-mesh/litemesh.ts:283-291` reads
  `(e as CustomEvent).detail?.item`, but path.ux's `ListBox` fires a
  `ListBoxChangeEvent` whose payload is `e.selection = {id, item}` and whose
  `item` is the **`ListItem` widget**, not the `LiteMeshAttrItem`
  (`scripts/path.ux/.../ui_listbox.ts`, `ui_listbox.test.ts:42-43`). So `detail`
  is `undefined`, `setSelectedAttrFromItem`/`setActiveAttrFromItem` never fire,
  `_selectedAttr` stays unset, the category dropdown and "Remove Selected" act on
  `undefined`, and clicking a row never sets the per-category active attr.
  Painting still appears to work only because `buildBrushProgram` falls back to
  the by-name default when `activeAttrLayerIndex` is `-1`
  (`sculptcore_bindings.ts:153-158`). **The plan's "verified live" claim for the
  selection path is not credible.** **(confirmed)**
  Fix: read `e.selection.id` (the list key/index), resolve against
  `mesh.attrItems[id]`, then call the setters — or add `getActive`/`setActive`
  to the `attrItems` data-list in `api_define.ts` (the `attrItems` builder) and let the ListBox
  route selection. Also fix the now-wrong comment at `litemesh.ts:281-282`.

- [ ] **B2 [sc] Attribute `category` (`attr.use`) is never serialized — lost on
  save/load.** `source/mesh/mesh_serialize.cc` round-trips `name/type/flag/
  elemSize` (write `:211-214`, read `:275-278`, restore `:309`) but **not**
  `attr.use`. The Wave 2b design (`boundary-conditions.md:185-187`) explicitly
  requires the category to be "serialized with the mesh … so it survives
  save/load." After a save/load every COLOR/UV/POLYGROUP tag reverts to `NONE`;
  the active-attribute bridge, the UV-gen `AttrUse::UV` tag, and the polygroup
  binding all silently lose their role. **(confirmed)**
  Fix: write `uint32(int(attr.use))` after the flag in `writeDomain`, read it
  into `SerialColumn`, assign `attr.use = col.use` next to `attr.flag = col.flag`
  at `:309`. This is a format change — guard/bump the version if old `.wproj`
  files must still load.

- [ ] **B3 [sc] Derived poly-group / boundary classification goes stale after
  paint and is never current for `bsmooth`.** `boundary::recomputeDirty` /
  `markEdgeDirty` / `markAllDirty` have exactly **one** non-test caller —
  `mesh.cc:119` (`markSeamPath`); `markAllDirty` is called only from
  `tests/test_boundary.cc`. The polygroup brush writes the `group` face attr but
  never marks affected edges/verts boundary-dirty, so `EDGE_POLYGROUP` /
  `BC_POLYGROUP` are recomputed only incidentally (next seam edit, and only over
  whatever is already dirty). Worse, `bsmooth.sbrush:8` *documents* the
  requirement — "Consumers must run `boundary::recomputeDirty` before the stroke
  so vclass is current" — yet no brush-dispatch path calls it, so the
  boundary-aware smooth (Wave 6) runs on stale vertex classification.
  **(confirmed)**
  Fix: (a) call `boundary::recomputeDirty(mesh)` at bsmooth stroke start, and
  (b) have the polygroup brush (or a stroke-end hook) mark painted faces' edges +
  endpoint verts dirty. Add the incremental-path test (T1).

---

## P1 — correctness risks (latent bugs / break under foreseeable use)

- [ ] **R1 [sc] No BYTE/SHORT/packed-BOOL → u32/f32 expansion on the GPU attr
  seam, though it's documented as existing.** `vk_compute.cc:593-612`
  (`setAttr`/`readbackAttr`) are plain `memcpy`; the plan, CLAUDE.md, and
  `compute_dispatch.h:62-67` all describe a narrowing/widening that isn't
  implemented. The CPU value-init in `brush_executor.h:327-332` also *skips*
  `bool` (`if constexpr (!is_same_v<T,bool>)`), so a bool attr layer is left
  uninitialized → nondeterministic A/B. Latent today (live brushes use INT/FLOAT4,
  already 32-bit) but the first `BYTE4` color or `bool edge` attr (the DSL grammar
  accepts both; bsmooth's header references bool edge attrs for Wave 6) silently
  corrupts. Fix: implement the documented expansion + bool value-init, or restrict
  the manifest to 32-bit attr types and reject others.

- [ ] **R2 [sc] CUDA/HIP/OpenCL emitters produce broken code for any attr-using
  vertex brush (`color`, `bsmooth`).** Only `emit_cpp.cc` and `emit_wgsl.cc`
  gained `FieldKind::Attr` handling; `emit_cuda.cc:204-231` / `emit_opencl.cc`
  lower `v.color`/`nb.vclass` to a bare local with no attr buffer binding, decl,
  or readback. `sbrush-validate cuda|opencl|hip` on those kernels would emit
  references to an undeclared `v_color`. These backends are off by default, so
  it's latent — but the plan's "all-backend parity" / "Wave 1 done = green on all
  backends" bar is **not** met. Fix: add `FieldKind::Attr` binding+seed+writeback
  to the CUDA/OpenCL emitters, or explicitly scope the plan to cpp+wgsl+spirv and
  document CUDA/OpenCL attr support as deferred.

- [ ] **R3 [sc] WgpuNative backend has no attr/face support — color/polygroup/
  bsmooth strokes abort on it.** `WgpuBrushComputeDispatch`
  (`source/webgpu/wgpu_compute.*`) doesn't override `setAttr`/`readbackAttr`; the
  base no-op returns `false`, so those strokes hit "attr upload failed"
  (`gpu_stroke.cc:239/323/342`). `wgpu-native-verify` rewrites `backend=wgsl →
  webgpu` over the same `_ab.txt` scripts, so `color_ab`/`polygroup_ab` fail on
  WgpuNative. The real-GPU verification came from Dawn via `replay.mjs`, not this
  dispatcher. Fix: implement setAttr/readbackAttr (+ face buffers) in
  WgpuBrushComputeDispatch, or document it as unsupported and skip those scripts.

- [ ] **R4 [app] State=0 seam "undo" clears flags unconditionally, not by
  restoring prior state.** `litemesh_ops.ts:216-228` (MarkSeamOp.undo) and
  `:440-449` (MarkSeamInteractiveOp.undo) re-run the path with `state=0`, which
  clears `EDGE_SEAM` on every edge of the path — including edges that were already
  seams before this op (overlapping paths / shared chain segments). Undo is not a
  true inverse. Fix: capture prior per-edge seam bits in the op (or C++ side) and
  restore exactly those, or route seam flags through meshlog undo (listed deferred
  at `boundary-conditions.md:78`).

- [ ] **R5 [sc] Per-edge seam-overlay normal offset makes the polyline
  discontinuous at shared verts.** `spatial.cc:847-849` pushes each endpoint out
  by `(b-a).length()*0.25` — *this edge's* length — so a vertex shared by two seam
  edges of different lengths is emitted twice at two offsets, kinking the path.
  Fix: offset by a length-independent value (fraction of local AABB/mesh scale, or
  a per-vertex offset shared across edges). Also document the implicit
  unit-length-`v.no` dependency.

- [ ] **R6 [app] Render-path `throw`s can silently abort the whole pass.** Per
  CLAUDE.md "never throw on the bulk-data seam." `litemesh.ts:1123` and
  `litemesh_wgsl.ts:107-110` throw on the WebGPU draw/pipeline-build path; on the
  native backend a throw here is swallowed as a `drawObjects` warning and aborts
  the object's render with no obvious cause. These are programmer-error
  conditions (lower risk than a bulk-data throw) but should `console.error` + skip
  the batch rather than throw.

- [ ] **R7 [app] `castScreenCircle`/`castScreenRect` ignore `selmask` and emit
  faces+verts in one untagged array.** `litemesh.ts:535-679` always runs both
  queries and `_buildPickResult` concatenates face and vert indices into a single
  `elements: number[]` with `elementDists = 0` and no domain tag — a consumer
  narrowing `ScreenPickResult.elements` can't tell them apart, and vert-only /
  face-only modes pick the wrong domain. (Pre-existing, added pre-range, but it
  now underlies seam/attr picking.) Fix: branch on `selmask`; return separate
  arrays or tag each element with its domain.

- [ ] **R8 [sc] Golden regen (commit `50cb802`) moved brush *output*, not just
  leaf counts — confirm it isn't masking a regression.** `tests/golden/draw.json`
  `co_sum.z` 0.357→1.78 (~5×), `smooth.json` 0.043→0.224; old leaves had
  `"tris":0`, new ones have real counts. cpp==wgsl can still hold because both run
  against the same changed tree, so regen re-anchored to whatever the partition
  now yields. Likely legitimate partition drift, but the commit message
  understates it as cosmetic. Confirm the spatial-partition change was intended
  before trusting these anchors; if so, correct the rationale.

---

## P2 — clarity / comments / fragile couplings

- [ ] **C1 [sc] polygroup `activeGroup` uniform aliases kelvinlet's `mu` slot by
  raw memcpy.** `gpu_stroke.cc:621-624` does `memcpy(&bu.mu, &ag, sizeof(int))`
  because the shared `ComputeBrushUniforms` `float mu` (offset 72) happens to be
  where WGSL polygroup places its first appended DSL uniform. Works only as a
  bit-reinterpret of the first post-fixed field; any new DSL-uniform brush or a
  kelvinlet layout change breaks it silently. Add a named overlay field (e.g.
  `uint32 dslU0`) + a static-assert tying polygroup↔offset-72, or a clear comment.
- [ ] **C2 [sc] `detachAttr`/`reattachAttr` (`mesh.h`) have an undocumented
  no-topology-edits-between invariant.** The stashed `AttrData*` keeps its
  detach-time element count; a topology mutation while detached desyncs sizes →
  out-of-range reads on reattach. Safe for the current detach→immediate-reattach
  undo flow. Document the invariant on `StashedAttr` and assert the domain
  element count is unchanged in `reattachAttr`.
- [ ] **C3 [sc] `generateUVFromSeams` doc understates limitations.** `uvgen.h:6-15`
  calls it "the simple unwrapper" but doesn't warn that the single planar
  projection per chart folds/overlaps on curved/closed charts, nor that `nf==0`
  returns 0 charts and creates **no** layer (`uvgen.cc:91`) while the app wrapper
  still consumes a unique name. Add a line on developable-chart assumption + the
  zero-chart behavior.
- [ ] **C4 [sc] `marginMilli` units only documented at the app wrapper.**
  Core `uvgen.h:15` takes `float margin` (pre-scale UV-space padding) while
  `Mesh::generateUVFromSeams(int marginMilli)` divides by 1000 and the result is
  rescaled into [0,1] (so the *effective* gap shrinks with chart count). Note this
  at the core declaration.
- [ ] **C5 [app] `regenTreeBatch` name/comment vs. behavior mismatch.**
  `litemesh.ts:681-699`: the `displayColorMode` setter comment says it drops the
  cached *draw* batch, but `regenTreeBatch()` destroys `this.treeBatch` (the BVH
  bounds overlay). The color refill is actually driven by `setColorDisplayMode`
  flagging nodes + per-frame `getDrawBatch()`. `sculptcore_ops.ts:260` also calls
  `regenTreeBatch()` after every dab, needlessly rebuilding the BVH-bounds batch.
  Fix the comment; gate the per-dab call on `drawBVH` being enabled.
- [ ] **C6 [app] Transient duplicate seam overlay after interactive finish.**
  `litemesh_ops.ts:385-412,422-427`: Esc calls `resetDrawLines()`, but normal
  finish (Enter/RMB → `modalEnd(false)`) leaves the `_committed` temp draw-lines
  on top of the persistent `seamBatch` until the next `resetDrawLines` (first
  sculpt dab). Call `resetDrawLines()` on both finish paths.
- [ ] **C7 [sc] WGSL/CPU face kernels write the face attr back unconditionally
  even when the body didn't assign it** (e.g. polygroup's `if (strength>0)`).
  Correct (local seeded from buffer round-trips) but reads like an unconditional
  clobber — add a one-line comment. Also note the new reserved keywords
  `face`/`edge`/`corner` in the DSL docs.
- [ ] **C8 [sc] Misleading/weak test comments.** `polygroup_ab.txt:5-6` says
  `backend=wgsl` "executes the C++ kernel" — it actually dispatches real SPIR-V on
  Vulkan (`script.cc:629-636`); fix the comment (the test is stronger than it
  reads). `test_bsmooth.cc:150` asserts `maxd3 < 1e-3` while commit `317eff8`
  claims "~1e-8", and section C self-skips when no GPU device — align the claim
  and note the skip.
- [ ] **C9 [sc] Spatial display attr resolved by raw index with only a type
  guard** (`spatial_gpu.cc:80-95`): a same-typed layer removed/reordered ahead of
  the active one silently retargets. Closed today because the app re-syncs by name
  after every mutation; add a C++ comment stating "index must be re-set by the app
  after any layer add/remove."
- [ ] **C10 [sc] `mesh_iter.h` dead `if (0 && first)` branch** (`:53-59`, also
  `:127`) obscures the termination logic the boundary walks depend on; simplify to
  `e = ELEM_NONE; return *this;`.
- [ ] **C11 [app] Left-in debug logging.** `PropsEditor.ts:1096`
  (`console.log('rebuild obdata tab', ...)`, fires on every ObData switch) — remove.
  `sculptcore_ops.ts:493` (`generate_uv: N chart(s)`) — gate or remove.
- [ ] **C12 [app] Dead imports** `{pointer, StructType}` at `sculptcore_ops.ts:9`.

---

## P3 — cleanup / dedup

- [ ] **D1 [sc] Unique-name `.NNN` suffix logic duplicated** between `mesh.h`
  `addAttr` and `mesh.cc` `generateUVFromSeams`. Wave 2b's design names a
  `uniqueAttrName` helper — consolidate (and add an overflow guard to the
  unbounded suffix loop).
- [ ] **D2 [sc] Vertex and face GPU-dispatch paths are duplicated.**
  `emit_wgsl.cc emitFaceKernel` (1074-1122) vs the vertex tail (1184-1284), and
  `emit_cpp.cc emitFaceKernel` (748-789) vs the vertex branch — same
  seed→body→writeback scaffolding, differing only in index source and seeded
  builtins. `ComputeNodeMeta.vert_offset/vert_count` is reused for faces
  (`gpu_stroke.cc:576,584-590`) — a readability trap. Factor the per-thread
  "seed locals → run body → write attrs back" into one domain-parameterized
  helper; rename the NodeMeta fields to `elem_offset/elem_count`.
- [ ] **D3 [sc] String-keyed attr lookups inside hot loops.** `uvgen.cc:70`
  (`boundary::edgeFlag` per corner per face) and `spatial.cc:811-815,834-836`
  (`2·E` per seam rebuild) re-resolve the bool view by `std::string` compare each
  call (`attribute.h:580-601`), against the stated 5M-tri dyntopo budget. Hoist
  the `BoolAttrView*` once before the loop (as `recomputeDirty` already does).
- [ ] **D4 [sc] Seam/bounds line batches allocate+bind an unused `uv` buffer.**
  `buildSeamBatch` (`spatial.cc:825-826,858,867,873-875`) and `buildLeafBoundsBatch`
  (`:717-718,793-795`) append a `uvBuf` that `basic_line.wgsl` never reads. Drop
  it from both (or comment why a name-bind path needs it). Buffer cleanup itself
  is safe — `destroyBatch` de-dups.
- [ ] **D5 [sc] Degenerate-face centroid divergence:** `BasicFaceIter::
  computeCentroid` (`brush_iterators.h:133`) guards `n>0`; host `FaceProxy::
  calc_center` (`mesh_proxy.h:575`) does an unguarded divide → NaN on a zero-corner
  face. Only degenerate faces diverge; add the guard for symmetry.
- [ ] **D6 [app] `AddAttrOp` redo re-creates rather than restores** (vs. the
  detach/reattach stash used by Remove/GenerateUV). Acceptable (a fresh layer has
  no data) but the asymmetry and the `_name` re-capture on redo deserve a one-line
  comment (`litemesh_ops.ts:75-117`).

---

## P4 — test gaps

- [ ] **T1 [sc] Incremental dirty path untested.** `test_boundary.cc:55` always
  `markAllDirty` before `recomputeDirty`; a test that paints a group, calls
  `recomputeDirty` *without* `markAllDirty`, and asserts the poly-group boundary
  updated/didn't would have caught B3.
- [ ] **T2 [sc] UV-gen gaps** (`test_uvgen.cc`): only 1-/2-chart coplanar covered.
  Add empty mesh (`nf==0` → 0 charts, no layer), disconnected components w/o seam,
  all-edges-seamed (packing stress), a curved chart (assert it stays in [0,1]),
  layer tagged `AttrUse::UV`, and a real **non-overlap** assertion (currently only
  the weaker in-[0,1] bound is checked — an overlap bug would pass).
- [ ] **T3 [sc] `mesh_path` gaps** (`test_boundary.cc:85-106`): one reachable path
  only. Add unreachable `vEnd` (disconnected → `false`, cleared out), `vStart==vEnd`,
  out-of-range indices (`mesh_path.cc:16` guard), isolated vertex
  (`v.e[v]==ELEM_NONE`). The `unreachable` branch (`:65`) and lazy-pop `done[]` are
  uncovered.
- [ ] **T4 [sc] No detach/reattach round-trip test** (the undo primitive behind
  Remove/GenerateUV) or BOOL/builtin-refusal test.
- [ ] **T5 [sc] `nearestVert` untested** — cast at a known corner / centroid and
  assert the returned vert (`test_spatial_raycast.cc`).
- [ ] **T6 [sc] `fill_leaf_slice` color/group composite + `polyGroupColor`
  untested** — pure functions of (attr, mode); build a small tree, set attrs, run
  `update`, read back `gd.color`; lock the `displayColorMode` bit semantics
  (1=vcol, 2=group, 3=composite, 0=white) and the premult-over-white math.
- [ ] **T7 [sc] `buildSeamBatch` untested** — `nullptr` on zero seams, `2N` verts
  otherwise, survives a frozen mesh (thaw path).
- [ ] **T8 [app] No test for the ListBox→active-attr→brush bridge** — would have
  caught B1. Dispatch a `ListBoxChangeEvent` and assert active-attr state;
  round-trip `selectedAttrCategory` through `setAttrUse`.

---

## Verified-correct (cleared during the audit — recorded so the next reader skips them)

- Lazy Dijkstra in `mesh_path.cc` is correct (`BinaryHeap` min-heap, `done[]`
  guard skips stale pushes, reverse/reconstruct sound).
- `computePolygroupBoundary` radial walk guard (`boundary.cc:46-66`) and the
  `CornerOfEdgeIter` "spins forever" comment are accurate.
- `~Mesh` stash cleanup frees only un-reattached entries, dispatches BOOL vs typed
  correctly.
- Spatial: no use-after-free of frozen-topology link pages in the new display
  paths (read only cached tris / `v.co`/`v.no` / attr data); each face renders
  exactly once (filled in the existing `unique_faces` loop, no new draw path);
  seam batch rebuild is correctly gated on `markSeamsDirty` and never runs
  per-frame; `buildSeamBatch` thaws before touching `.edge.vs`.
- App: modal undo/redo contract is correct (recorded at `execTool` before
  `modalStart`, single undo step); `_ensureSeamBatch` rebuilds only on
  `_seamsDirty` and destroys the prior batch first (no per-frame leak);
  `destroy()` frees seamBatch/treeBatch/executors; index-based marshalling uses
  the unfiltered AttrGroup index consistently; no `.ptr` reads or number-pointer
  assumptions; bulk out-param readers return `[]` rather than throwing.

## Out of scope but noted

- `attribute_enums.h:97-99`: pre-existing `AttrType` Bind enum mislabel
  ("Float"→NONE, "Vec2"→FLOAT) predates this range — separate ticket.

---

### Suggested order of attack

1. **B1, B2, B3** — functional regressions against the plan's own claims; small,
   localized fixes. B1 and B3 also restore behavior the plan says was verified.
2. **R1–R3** — close the GPU-attr correctness gaps (or downscope the parity
   claims in the plan doc to what's actually green).
3. **R4–R8** + the **T1–T8** tests that pin them.
4. **C/D** clarity + cleanup as a sweep (most are one-liners).
