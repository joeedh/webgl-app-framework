# Box modeling mode

A traditional (Blender-style) polygon-modeling toolmode for `LiteMesh` objects,
living alongside sculpt mode. It adds selection (vertex/edge/face), extrude,
inset, bevel, split-off, subdivide, and loop-cut on top of the sculptcore
n-gon mesh — all as a thin TypeScript shell over C++ topology, selection, and
undo. Design background and rationale live in
[documentation/plans/boxModelingTools.md](plans/boxModelingTools.md); this
page documents the shipped surface (milestones M0–M5).

## Architecture

Per the guiding principle of the plan, almost everything lives in sculptcore
(C++): topology mutation, selection state, active-element state, undo
recording (`MeshLog`), spatial queries, and overlay GPU batches. TypeScript
owns only:

- the toolmode shell (`scripts/editors/view3d/tools/boxmodel.ts`,
  `BoxModelToolMode`) — header UI (selection-mode chips, overlay toggles,
  xray) and the keymap,
- thin modal `ToolOp`s (`scripts/lite-mesh/litemesh_modeling_ops.ts`) that
  pick, call one bound C++ entry point, and (for "T" tools) chain a modal
  transform,
- the transform bridge (`scripts/lite-mesh/litemesh_transtype.ts`,
  `LiteMeshTransType`) that lets the stock `view3d.translate`/`rotate`/`scale`
  system move `LiteMesh` verts.

Every op runs inside **one `MeshLog` step**, so topology + any final vertex
positions are a single undo press. `LogChunkElems` snapshots per-element
attribute columns (including the new `select` category), so selection state
rides the same undo/redo swap as positions.

Geometry model: faces are corner-list structures that natively support
n-gons and multi-loop faces (holes). Box-modeling ops are quad/n-gon aware
end to end; a constrained-Delaunay triangulator for holed/concave-face
display and sculpt hand-off is tracked as a separate, later dependency (see
the plan doc) and does not block the tools below.

## Enabling the mode

`BoxModelToolMode` (`toolModeDefine().name === 'boxmodel'`, icon
`Icons.BOX_MODEL`) is a `ToolMode` sibling of `SculptCorePaintMode`, selected
the same way any other view3d toolmode is. Its header exposes:

- **Selection-mode chips** (`boxModelSelMode`) — vertex/edge/face, a
  `SelMask` bitmask; Blender-style shift-click toggles additional domains on
  (multiple domains can be active at once).
- **Overlay toggles** — `drawSelectionOverlay`, `drawWireframe`,
  `drawPoints`.
- **X-ray** (`xray`) — overlays ignore depth (see-through) when on; toggles
  the batch executor's `depthCompare` between `less-equal` and `always`.
- **Select radius** (`selectRadius`) — screen-px radius for nearest/circle
  select.

All of these are plain `DataAPI` properties on the toolmode (serialized via
its `nstructjs` STRUCT), so they persist with the scene/UI state.

## Selection

Selection is a new attribute category (`AttrUse::SELECT`), with a builtin
bool `select` on all three domains (vertex/edge/face) so it is symmetric.
Selection writes ride `MeshLog` like any attribute mutation, making selection
fully undoable. There is one "active" element per domain (vertex/edge/face),
stored as scalars on the `MeshLog` step record and restored across
undo/redo.

Conventions (Blender-ish, not identical):

- Selection is **not** reset between tools.
- No-shift **selects**; shift **deselects** (the inverse of many other
  apps' "shift extends").
- Which domains a tool affects is the toolmode's current selection mode.

Selection tools (all in `litemesh_modeling_ops.ts`, thin ops over C++ region
queries):

| Tool | Toolpath | Hotkey | Backend |
|---|---|---|---|
| Select All / None / Auto | `litemesh.select_all(mode=...)` | `A` / `Alt+A` | auto = all-if-empty else none |
| Box select | `litemesh.select_box()` | `B` | `SpatialTree::castScreenRect` (frustum) |
| Circle/brush select | `litemesh.select_circle()` | `C` | `SpatialTree::castScreenCircle` (cone), continuous drag, one undo step |
| Select nearest | `litemesh.select_nearest()` | left click | `pickVert`/`pickEdge`/`pickFace` in the first enabled domain; sets the domain's active element |
| Loop select | `litemesh.select_loop(ring=...)` | ctrl-click / ctrl-shift-click | edge loop (`walkEdgeLoop`), edge ring, or face loop from the edge under the cursor |
| Select shortest path | `litemesh.select_path()` | click | Dijkstra from the active vertex; endpoint becomes the new active vertex |

Left click runs `select_nearest` non-modally through the toolmode's
`on_mousedown` (shift deselects); ctrl-click loop-selects — the edge loop in
edge mode, the face loop in face mode, and the edge **ring** ("face loop edge
select") with ctrl-shift. Edge picking resolves the ray's hit face to its
nearest edge (`Mesh::faceEdgeNearest`). Hovering (no buttons held) highlights
the element under the cursor in cyan via the selection overlay
(`buildSelectionBatch` hover params; `LiteMesh.setHover`).

## Modeling tools

All topology macro-ops are built on existing Euler ops (`make_vertex`,
`make_edge`, `make_face`, `kill_*`) and edge ops (`splitEdge`,
`collapseEdge`, `flipEdge`), each wrapped in one `MeshLog` step, multi-loop
(holed-face) aware, and returning the moved/created region for the
transform hand-off.

| Tool | Toolpath | Hotkey | Notes |
|---|---|---|---|
| Extrude region | `litemesh.extrude_region(transform=true)` | `E` | Flood-fills the selected faces, walks the boundary loop(s), bridges quads; chains a normal-constrained translate |
| Extrude individual faces | `litemesh.extrude_individual(transform=true)` | — | Same as above but per-face, no boundary merge |
| Extrude wire verts | `litemesh.extrude_wire(transform=true)` | — | Duplicates selected verts and edges to the originals |
| Split faces off | `litemesh.split_off(transform=true)` | — | Detaches the selected region; chains a free (unconstrained) translate |
| Inset region | `litemesh.inset_region()` | `I` | Parametric modal: builds the inset ring at zero offset inside one step, then the drag maps to `co = base + width·tangent` |
| Bevel/chamfer vertices | `litemesh.bevel_verts()` | `V` | Reuses the inset modal (`LiteMeshInsetOp` subclass); replaces each selected vert with one offset vert per incident edge + a cap n-gon |
| Subdivide | `litemesh.subdivide(numCuts=...)` | `D` | Pattern subdivision of selected edges/faces, Blender-style N-cuts; immediate, `numCuts` is redo-tweakable |
| Loop cut | `litemesh.loop_cut()` | `Ctrl+R` | Modal: hover previews the ring polyline (`Mesh::loopCutPreviewCoords`, yellow drawlines); click cuts the whole ring at its midpoint in one step |

"T" tools (marked with a target in the plan) use `transform=true` to chain a
`ToolMacro` of the geometry op + `TranslateOp`: the geometry op emits an
`normalSpace` output (an averaged face/vertex normal) wired to the
translate's constraint space, so dragging is constrained to that normal with
no bespoke transform math. `LiteMeshTransType` (the shared substrate in
`litemesh_transtype.ts`) bulk-reads/writes `LiteMesh` vertex positions for
the stock transform modal (constraints, numeric entry, snapping, cancel all
come for free), with the whole drag bracketed inside the op's open `MeshLog`
step so cancel restores the original topology and positions.

Inset and bevel are **not** routed through the generic transform system —
they use a dedicated parametric modal (`LiteMeshInsetOp` /
`LiteMeshBevelOp`) that opens the `MeshLog` step once, builds the ring/offset
topology at zero width, then maps horizontal mouse drag to width via a
per-vertex base position + in-plane tangent. Left-click/Enter confirms
(closing the step); right-click/Escape cancels (undoes the step). Topology
and final positions still collapse to one undo press.

## Overlays

Drawing overlays extend the existing `buildSeamBatch` family in
`sculptcore/source/spatial/spatial.cc` — same `DrawBatch` format and dirty-flag
cadence, dispatched from `LiteMesh.drawQ()` and gated by the toolmode's
overlay booleans:

- **Selection overlay** (`drawSelectionOverlay`) — selected/active
  vertices, edges, and faces in distinct colors.
- **Wireframe** (`drawWireframe`) — every edge, drawn dim, offset along the
  normal (a `glPolygonOffset`-style trick).
- **Vertex points** (`drawPoints`) — every vertex as a billboard point
  sprite (a dedicated point-sprite WGSL shader; the mark-seam tool's
  `_snapRing` billboard was the sizing precedent).
- **X-ray** — a toolmode boolean; when set, the overlay executor is rebuilt
  with `depthCompare: 'always'` instead of `'less-equal'`, so all of the
  above draw through the mesh.

`LiteMesh` caches a separate xray-aware overlay executor
(`overlayExecutorGPU`, rebuilt when `xray` flips) so the tree-surface
executor and the overlay executor can use different depth tests in the same
frame.

## Where the code lives

| Layer | Location |
|---|---|
| C++ macro-operators | `sculptcore/source/mesh/ops/` |
| C++ loop / boundary utilities | `sculptcore/source/mesh/utils/` |
| C++ selection, active-element, region queries | `sculptcore/source/mesh/`, `sculptcore/source/spatial/` |
| C++ overlays | `sculptcore/source/spatial/spatial.cc` |
| C++ bindings | `sculptcore/source/mesh/mesh.h` (`defineBindings()`) + `LiteMesh` wrappers |
| TS toolmode | `scripts/editors/view3d/tools/boxmodel.ts` |
| TS ops | `scripts/lite-mesh/litemesh_modeling_ops.ts` |
| TS transform bridge | `scripts/lite-mesh/litemesh_transtype.ts` |

## Known gaps / follow-ups

- Edge-domain nearest picking falls back to vertex picking; dedicated
  cone/frustum edge collection is not yet implemented.
- Loop cut has no live ring preview, multi-cut, or slide-on-create yet
  (single midpoint cut per click).
- Topology ops rebuild the whole spatial tree (`rebuildSpatialFromEdit`)
  rather than updating it incrementally; an incremental-tree perf pass is a
  follow-up, mirroring dyntopo's incremental spatial currency.
- The constrained-Delaunay triangulator needed for correct display/sculpt
  hand-off of holed or strongly-concave faces is a separate, not-yet-landed
  track (see the plan doc's "Dependencies" section); hole-producing ops
  should stay gated until it lands.
