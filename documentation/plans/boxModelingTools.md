# Box modeling tools

We need to create a system to implement more traditional box modeling tools
for sculptcore meshes.  We should minimize the amount of code written on
the TS side (note though we will make a new view3d toolmode for it).


## Modelling Tools

Tools we need (items marked with T should invoke a modal transform after the tool):

* Extrude connected face regions - T
* Inset connected face regions - T
* Extrude wire vertices (duplicates vertices and creates wires with original ones). - T
* Extrude faces individually (without merging into regions) - T
* There are a number of tools derived from an "edge split" operation that split faces
  into disconnected regions:
  * Bevel/chamfer - T
  * We could implement the extrude tools this way
  * Split selected faces off of the mesh - T (translate)
* Edge/Face loop based tools (make sure to implement generic loop utilities):
  * Split face loop (with arbitrary number of cuts)
* Pattern-based subdivision of triangles and quads (blender style)

## Selection tools

We also have to deal with selection.  Selection will be done with bool attrs per element domain
as a new attribute category, 'select'.  Users will be able to choose which element domains selection
tools operate on, this should be presented as blender-style selection modes (vertex, face, edge)
where selecting multiple modes can be done by holding shift when clicking the selection mode icons.

Notes:

* There will be one logically "active" element per domain, this is separate from selection but related
  to it.  Exactly how to store this is an open question.  The active vertex is stored in meshlog and is
  properly restored in undo/redo.
* Most selection tools will have an 'xray' mode that doesn't clip to the mesh.
* Selection is *not* reset for most tools, consequently 'shift' does not extend selection as in many
  other apps, it instead deselects (so not holding shift selects, holding shift deselects).
* Selection is undoable

Selection tools needed:

* Select element closest to mouse cursor within a given screen space radius.  Will require implementing cone and cylinder tracing in the spatial tree if they don't exist already.
* Select all/none/auto (where auto chooses 'all' if nothing is selected otherwise 'none')
* Select inside a box drawn by the user
* Circle selection 'brush'
* Select shortest path from active vertex (the final vertex becomes the new active one).

## Drawing

We will need a number of drawing overlays, all of which should respect
the current xray setting. 

* Elements in the current selection mode should highlight when the user 
  mouses over them
* Billboard points for vertices
* Selected/active vertices/edges/faces/etc should be drawn in the appropriate colors
* Wireframe overlay that draws a wireframe over the mesh similar to glPolygonOffset 
  (but respects xray too).


---

# Architecture

## Guiding principle

The "minimize TS code" instinct is already proven by two precedents in
`scripts/lite-mesh/litemesh_ops.ts`:

- **`MarkEdgePathBaseOp`** — an interactive modal ToolOp that is *only* an
  interaction shell + transient overlay; all geometry (pick, shortest path,
  flag-writing) is a C++ call.
- **`ReorderLocalityOp`** (`litemesh_ops.ts:813`) — a non-stroke topology op
  whose undo/redo route through the shared **MeshLog** (`undoPre` empty, `exec`
  runs the C++ op against `(mesh, log)` and captures `log.lastStepId()`,
  `undo`/`redo` call `MeshLog.undo/redo(mesh.mesh, mesh.spatial)`,
  `calcUndoMem` returns `log.stepMemSize(stepId)`).

Every box-modeling tool is a variation on these two. The division of labor is:

- **sculptcore (C++) owns** all topology mutation, selection state, active-element
  state, undo recording (MeshLog), spatial queries, and overlay GPU batches.
- **TypeScript owns** only a new view3d toolmode + thin modal ToolOps that pick,
  call one bound C++ entry point, and (for "T" tools) hand off to a modal
  transform.

## Geometry model: true n-gons with holes

Box modeling produces quads and n-gons natively, and the sculptcore mesh already
supports them: faces are corner-list (`l.c`/`l.size`/`l.f`) structures and a face
can own **multiple lists** (`l.next`) to model **holes**. So:

- All macro-operators and loop utilities must treat a face as a *set* of boundary
  loops, never a single ring. Inset/bevel of a holed face produce one inset ring /
  bevel chain **per loop**.
- N-gons are the native expectation, not an exception. Sculpt mode's dyntopo is
  triangle-centric but **triangulates internally per its active settings**; other
  planned modes (multires, etc.) are non-triangle. Box-model meshes therefore stay
  true-quad/n-gon end to end.
- "N-gon rendering" is only a **display fan-triangulation** concern in the spatial
  GPU draw path — not a data-model or policy decision.

## Where code lives

Extend the existing **lite-mesh addon** (the tools are intrinsic to editing a
LiteMesh and share its DataBlock + MeshLog) rather than spinning up a new addon.

| Layer | Location | Contents |
|---|---|---|
| C++ macro-operators | `sculptcore/source/mesh/ops/` (new) | extrude / inset / bevel / split-off / loop-cut / subdivide |
| C++ loop utilities | `sculptcore/source/mesh/utils/` | edge-loop & face-loop walkers, multi-loop region-boundary extraction |
| C++ selection + queries | `source/mesh/` (select attrs, region ops) + `source/spatial/` (edge picking) | |
| C++ overlays | `source/spatial/spatial.cc` | `buildSelectionBatch` / `buildWireframeBatch` / `buildPointsBatch`, siblings of `buildSeamBatch` |
| C++ bindings | `mesh.h` `defineBindings()` (`:118`) + `LiteMesh` wrappers | one bound method per macro-op / query, `MARGS(...)` style |
| TS toolmode | `scripts/editors/view3d/tools/boxmodel.ts` (new, sibling of `sculptcore.ts`) | header strip, selection-mode chips, xray + overlay toggles |
| TS ops | `scripts/lite-mesh/litemesh_modeling_ops.ts` (new) | thin modal ops, one per tool |
| TS transform bridge | `scripts/lite-mesh/litemesh_transtype.ts` (new) | `LiteMeshTransType` + custom inset/bevel `TransType`s |

## Undo model: MeshLog as the spine

Every topology op runs inside **one MeshLog step**, following the
`ReorderLocalityOp` contract. `LogChunkElems` already snapshots per-element
attribute columns, so any attribute mutation in the step (including `select` and
positions) is captured and undone for free — that is what makes **selection
undoable** and what gives "T" tools **single-step undo** (topology + final
positions = one step, see below). The heavy serialize-blob snapshot used by
`SymmetrizeLiteMeshOp` is the fallback only for ops MeshLog cannot express.

---

## 1. Selection

### 1a. The `select` attribute category

Today: builtin bool `v.select` and `e.select` exist; **face select is missing**
and there is no select *category*.

- Add `AttrUse::SELECT` to `sculptcore/source/mesh/attribute_enums.h` (joins
  `NONE`/`COLOR`/`UV`/`POLYGROUP`). This is the draft's "new attribute category."
- Add the builtin `select` bool to `FaceData` (`mesh_types.h`) so all three
  domains (`AttrDomain::VERTEX=1`, `EDGE=2`, `FACE=16`) are symmetric, each tagged
  `AttrUse::SELECT`.
- Verify/ensure the `select` layers are in MeshLog's logged set so selection
  changes ride the same per-step swap as positions — this is what implements the
  draft's "Selection is undoable."
- Selection writes go through `make_*`/`kill_*` like any attribute, so they
  survive topology edits.

### 1b. Selection mode (vertex/edge/face)

Selection mode is **toolmode/scene state, not an attribute**. `SelMask.{VERTEX,
EDGE,FACE}` (= 1/2/4) already exists (`scripts/editors/view3d/selectmode.ts`); the
toolmode holds a bitmask (Blender-style shift-click toggles additional modes). The
mask is passed into every query/op as the domain to operate on. `SelToolModes`
(`ADD`/`SUB`/`AUTO`) is reused; per the draft, **shift = deselect** (no-shift =
select), and selection is not reset between tools.

### 1c. Active element

The draft requires "active vertex stored in meshlog, restored on undo/redo";
MeshLog has **no active field today**. Store `active_vert / active_edge /
active_face` as scalars in the MeshLog **step record**, snapshotted on `beginStep`
and swapped on undo/redo alongside the element chunks (indices, not a bool attr —
simplest and matches the draft wording). Shortest-path select updates
`active_vert`; that is the only state it persists.

### 1d. Selection tools (all thin ops over C++ region queries)

| Tool | Backend |
|---|---|
| Select nearest within screen radius | `SpatialTree::castScreenCircle` (cone query) **already exists** (`spatial.h:148`); "nearest" = min screen-distance hit |
| Select all / none / auto | bound `selectAll/None(domain)`; auto = all-if-empty-else-none, computed from a bound selected-count |
| Box select | `SpatialTree::castScreenRect` (frustum) **already exists** (`spatial.h:175`) |
| Circle/brush select | same cone query as nearest, applied over a drag |
| Shortest-path from active | `pickVert` endpoint + the existing Dijkstra (`markEdgePath` already does it); final vert becomes `active_vert` |

**Edge-domain picking is the one gap**: cone/frustum collect faces+verts only
(`node.h` `collectCone*`/`collectFrustum*`). Add `collectConeEdges` /
`collectFrustumEdges` + a nearest-edge ray pick for edge mode. **No cylinder query
is needed** — the draft hedged on it, but cone covers radius-select and Dijkstra
covers path-select.

---

## 2. Topology macro-operators

All buildable on primitives that **already exist**:

- Euler ops (`mesh.cc`, declared `mesh.h`): `make_vertex`, `make_edge`,
  `make_face`, `kill_vertex/edge/face`, `relink_edge_verts`, `reinit_face`.
- Edge ops (`mesh/utils/`): `splitEdge`, `collapseEdge`, `flipEdge`.

Each macro-op follows the `reorderForLocality` contract: the caller passes
`MeshLog` + `MeshCallbacks`; the op opens a step, mutates, **sets `select` +
active to the new movable region**, and returns index vectors of created geometry
for the transform handoff. All are **multi-loop (holed-face) aware**.

| Tool | Construction |
|---|---|
| Extrude region (T) | flood-fill selected faces → walk region boundary loop(s) → duplicate boundary verts/edges → quad-bridge sides → cap = moved faces |
| Inset region (T) | per boundary loop, create an inset ring of verts/edges → quad-bridge inward (topology built at zero offset; see §3) |
| Extrude faces individually (T) | region path per-face, no boundary merge |
| Extrude wire verts (T) | `make_vertex` dup + `make_edge` to original |
| Bevel/chamfer (T) | the "edge-split family": one parameterized `splitFaceRegion` that splits faces into disconnected regions (built at zero width; see §3) |
| Split selected faces off (T) | same `splitFaceRegion`, fully detaches the region |
| Loop cut, N cuts | **generic loop walker** (new util) + `splitEdge` along the loop |
| Pattern subdivide (tri/quad) | per-face templated `make_face` patterns |

**Build the loop/boundary utilities first** — extrude, inset, and loop-cut all
depend on edge-loop / face-loop walking and multi-loop region-boundary extraction
(formalize the radial/disk-walk patterns already used in `uvgen.cc`).

---

## 3. Transform handoff ("T" tools)

One shared substrate, two apply shapes, **all custom `TransType`s inside the
existing transform system** (`scripts/editors/view3d/transform/`) so they reuse
its modal loop, constraints, numeric entry, header readout, snapping, and
confirm/cancel.

### 3a. Shared substrate — `LiteMeshTransType`

A single TS bridge that the transform system's `genTransData` picks up for a
LiteMesh: bulk-read the movable verts' positions (bound read; cf. `dumpVertCo`),
write them back each modal step (bound bulk apply; cf. `setVertCo`), with the
**whole motion bracketed inside the op's open MeshLog step** (cancel restores
originals). Every modeling tool uses this; they differ only in the apply kernel.

### 3b. Shape 1 — generic translate + constraints

Extrude region/individual, wire extrude, split-off. Plug straight into
`view3d.translate`: the C++ op selects the new region and emits a default
constraint axis (e.g. averaged face/vertex normal, or an edge line); free / along
line / along normal constraints, widgets, numeric entry, and snapping all come for
free. **No new transform math.**

### 3c. Shape 2 — special parametric transform modes (bevel, inset)

The drag drives an operator **parameter**, not vertex translation. Decomposition
that keeps these in the transform framework and yields single-step undo:

1. **Topology built once, up front**, inside the MeshLog step — the inset ring /
   bevel segments at *zero* offset (degenerate, coincident with the source
   boundary), correctly per-loop for holed faces. This is the only topology
   mutation.
2. The op emits, **per movable vert, an offset basis** — a tangent direction
   (drives width/thickness) and a normal direction (drives depth) — as a temporary
   per-vert `float3` attribute the transform reads through the same bulk path
   (cleared on confirm).
3. A custom `TransType` (`InsetTransform` / `BevelTransform`) whose apply kernel is
   `co = base + width·tangent + depth·normal`, mouse drag → width, a modifier or
   second axis → depth. Everything else (modal loop, header, numeric entry,
   cancel) is the stock transform machinery.
4. **Discrete params** (bevel segment count) are the exception: they change
   topology, so a scroll/keypress re-runs the op's topology phase and rebuilds the
   transform data. Continuous width/depth stay pure geometry transforms.

### 3d. Undo granularity

Topology-built-once + geometry-transformed-in-the-same-modal ⇒ **one MeshLog step
/ one undo press**, uniformly for both shapes. Not an open question.

---

## 4. Drawing overlays

Extend the `buildSeamBatch` family (`spatial.cc`) — same `DrawBatch` /
position+color buffer format, same `markSeamsDirty` dirty-flag cadence, dispatched
in `LiteMesh.drawQ()` alongside the seam batch and gated by toolmode booleans
(exactly like `drawFeatureOverlay`).

| Overlay | Implementation |
|---|---|
| Selected/active verts, edges, faces | `buildSelectionBatch` — verts as points, edges as lines, faces as translucent tris, per-element color by select/active; reuse the existing "push verts out along normal ~0.25·edge-len" float-above trick |
| Wireframe (glPolygonOffset-style) | `buildWireframeBatch` — all edges, same normal-offset |
| Billboard vertex points | `buildPointsBatch` — `DRAW_POINTS` exists but is unused and has **no shader**; needs **one new point-sprite WGSL shader** (or quad expansion). The mark tool's `_snapRing` billboard is the TS precedent for view-plane sizing |
| Mouse-over highlight | cheapest as the **transient view3d drawlines** path (what `MarkEdgePathBaseOp` uses) — changes every mouse-move, so no C++ batch rebuild |

**xray**: a toolmode boolean that selects `depthCompare: 'always'` vs `'less'` in
the batch executor's `depthStencil` override (already supported by the WebGPU
batch executor). All overlays honor it.

---

## 5. TypeScript surface (kept minimal)

- **`boxmodel.ts`** — a `ToolMode` sibling of `SculptCorePaintMode`. `buildHeader`
  adds selection-mode chips (vertex/edge/face icons, shift-multi-select → bitmask
  on the toolmode), an xray toggle, and overlay toggles (points/wireframe/
  selection) as plain boolean properties read by `drawQ()`. Tool buttons via
  `strip.tool('litemesh.extrude_region()')`.
- **`litemesh_modeling_ops.ts`** — one thin op per tool on the `ReorderLocalityOp`
  template (`undoPre` empty, `exec` → C++ op + `lastStepId()`, `undo`/`redo` →
  `MeshLog`, `calcUndoMem` → `stepMemSize`). "T" ops select the new region in C++,
  then chain the matching transform. Interactive selection ops (path, circle
  brush) add the `MarkEdgePathBaseOp` modal shell.
- **`litemesh_transtype.ts`** — `LiteMeshTransType` (§3a) + `InsetTransform` /
  `BevelTransform` (§3c).

All registered through the addon API (`api.register` / `registerAll`) in the
lite-mesh addon's `register(api)` hook.

---

## Milestone order

0. **Selection + overlay foundation.** `AttrUse::SELECT` + face `select` +
   MeshLog active-element + `buildSelectionBatch` + selection ops + the toolmode
   shell (selection-mode chips, xray). Usable selection/highlight on its own;
   de-risks everything downstream.
1. **Loop/boundary utilities** (multi-loop aware) + `LiteMeshTransType` bridge.
2. **Extrude** (region + individual + wire). First "T" tools — exercises the full
   pick → C++ → generic-translate loop.
3. **Inset + edge-split family** (bevel / split-off) — the custom parametric
   `TransType`s.
4. **Loop cut + pattern subdivide.**
5. **Wireframe + billboard-point overlays; xray polish.**

## Net-new vs. reused

**Reused as-is:** Euler ops, `splitEdge`/`collapseEdge`/`flipEdge`, MeshLog
undo spine, `castScreenCircle`/`castScreenRect`, `castRay`/`pickVert`, Dijkstra
path, `buildSeamBatch` batch machinery + `basicLineShader`, the transform modal
framework, `SelMask`, `addAttr`/`setAttrUse` binding pattern.

**Net-new (mostly C++):** `AttrUse::SELECT` + face select layer; MeshLog
active-element scalars; the macro-operators + loop utilities; edge-domain
cone/frustum collection; `buildSelectionBatch`/`buildWireframeBatch`/
`buildPointsBatch` + a point-sprite shader. **Net-new (TS):** the toolmode, the
thin ops file, and the transform bridge/custom TransTypes.
