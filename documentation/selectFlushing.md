# Selection domain flushing across 3D DCC apps

Survey of how existing 3D content-creation tools handle selection state across
topology domains (vertex / edge / face / etc.) — specifically whether
selecting in one domain automatically propagates ("flushes") to the others,
or whether domains are kept independent and require an explicit conversion
step. Written as background research; this framework does not yet implement
either model project-wide (box modeling's `select` attribute category is a
separate, in-progress concern — see
[documentation/boxModelingMode.md](boxModelingMode.md)).

## Summary table

| App | Auto-flush? | Direction | Mechanism |
|---|---|---|---|
| Blender | Yes, always (up); down on mode switch | vert↔edge↔face | `BMesh` flush functions, boolean per-element flags |
| Maya | No | — | Manual "Convert Selection to..." |
| 3ds Max | No (per-level memory only) | — | Per-level remembered selection + modifier-key convert |
| Modo | Partial | functional only | Implicit for tool ops; visible selection needs explicit convert |
| Houdini | No | — | Explicit `Group Promote` SOP / conversion hotkey |
| ZBrush | N/A | — | No discrete topological selection model at all |

## Blender

Blender is the one mainstream app that treats cross-domain consistency as a
hard invariant of the selection data itself, not an on-demand query. This is
read directly from the `BMesh` source
(`source/blender/bmesh/intern/bmesh_marking.cc`,
`BM_mesh_select_mode_flush_ex`):

- **Flush up — always runs, unconditionally, after any selection-mutating
  op or mode switch:**
  - An edge is selected **iff both of its vertices are selected** (and
    neither is hidden).
  - A face is selected **iff every boundary edge is selected** (and not
    hidden) — which, since edge-select is itself vertex-derived, is
    transitively "all vertices selected."
- **Flush down — optional, gated behind a `Down` flag, invoked explicitly
  by mode-switch / operator code:**
  - Selecting an edge selects both its vertices.
  - Selecting a face selects all of its vertices *and* edges.
- Hidden elements are always skipped in both directions.
- There is **no tri-state/"partial" selection flag** in the data model —
  flush always resolves to a hard boolean. The dotted-vs-solid appearance
  some users associate with "partial" selection is actually **selected
  (orange) vs. active/last-clicked (white)**, tracked separately via
  `BMesh.select_history`, not a partial-selection state.
- Blender's own terms for this, used in the Python API docs
  (`bmesh.types` — `select_flush()` / `select_flush_mode()`), are literally
  **"flush up"** and **"flush down."** Editor-level entry points are
  `EDBM_selectmode_set` (on mode switch) and `EDBM_selectmode_flush`/`_ex`
  (after selection operators), in
  `source/blender/editors/mesh/editmesh_select.cc`.
- The user manual states the same rule in workflow terms: switching select
  mode "ascendant"-ly (vertex → edge → face) preserves a selection only "if
  a complete element" exists in the new mode — i.e. flush-up.

This works well for Blender because `BMesh` keeps a persistent, always-live
disk/radial-cycle adjacency structure resident for the whole Edit Mode
session, so a flush is a cheap local walk, not a rebuild — and edit-mode's
undo history is not a procedural/node graph, so there is no "which selection
state does this represent upstream" ambiguity to preserve across the flush.

Notably, Blender's own Geometry Nodes team ran into friction porting this
model into a procedural context (developer.blender.org/T74967): continuous
auto-flush doesn't translate cleanly into a node graph, where selections need
to be explicit, addressable data rather than an always-reconciled implicit
state. That's a useful signal that auto-flush is well-suited to *direct*
mesh editing specifically, not necessarily to procedural/non-destructive
pipelines in general.

## Maya

Maya keeps vertex/edge/face/UV component selections as **independent sets
per domain**. Selecting a face does not mark its bounding vertices or edges
as separately-selected components in their own modes. **Select > Convert
Selection to Vertices/Edges/Faces/UVs** (with modifiers like
"Contained"/"Adjacent") is a manual, one-shot operation that computes and
replaces the active selection; it does not run continuously and does not
keep domains in sync afterward. Switching component-mode hotkeys (F9–F12)
does not itself convert — Ctrl+F9–F12 is the dedicated convert-selection
shortcut. That Maya users have long requested "remember/derive selection
across component mode switches" as a feature underscores that this is a
deliberate default, not an oversight.

## 3ds Max

Editable Poly / Editable Mesh sub-object levels (Vertex, Edge, Border,
Polygon, Element) each **remember their own selection independently** — per
Autodesk's docs, "the surface formats... automatically remember the most
recent selection for each sub-object level." Switching levels does not
derive a new selection from another level by default.

Two named exceptions treat adjacent levels as "compatible" and preserve
selection across the switch: Edge ↔ Border, and Polygon ↔ Element. Vertex is
not compatible with any other level this way.

Explicit conversion is available via modifier keys when clicking a new
sub-object level button:

- **Ctrl+click** — select everything in the new level that touches the old
  selection ("touching" conversion).
- **Ctrl+Shift+click** — "strict" conversion: only elements *all of whose*
  sub-components were selected.
- **Shift+click** — border conversion: only elements bordering the
  selection.
- No modifier — just switches to the level's own remembered selection.

## Modo

Modo is a hybrid. **Functionally**, selecting a polygon implicitly includes
its bounding vertices/edges when running a tool, even though those
sub-components don't visibly highlight in another component mode. **Visibly**,
selection does not auto-propagate across Vertex/Edge/Polygon modes — an
explicit `select.convert` operator (or Alt+click / Alt+1/2/3) converts and
*adds to* whatever is already selected in the target mode. Modo appears to
keep a separate remembered selection per component type, similar in spirit
to 3ds Max's per-level memory. Net effect: more automatic than Maya at the
tool-operation level, but still short of Blender's continuous flush.

## Houdini

Point/edge/primitive/vertex selections and groups are fully independent;
there is no auto-flush at the viewport or SOP level. The **Group Promote**
SOP is the dedicated, explicit converter between point/primitive/edge/vertex
groups (`Convert From` / `Convert To` params). Interactive viewport
conversion also exists via an explicit hotkey. Houdini's non-destructive,
node-graph editing model is the clearest case for why conversion has to stay
explicit: a selection group is materialized data flowing through nodes whose
upstream topology may change, so silently re-deriving it on every mode
switch wouldn't compose safely with the graph.

## ZBrush

ZBrush has no persistent, buildable vertex/edge/face selection mode
comparable to the above at all. Instead:

- **Masking** is a continuous scalar field per vertex (can be partially
  masked to any degree, not just on/off), not a discrete selection set.
- **PolyGroups** are a persistent per-face partition used for isolation, the
  practical stand-in for "select and isolate."
- **ZModeler** (4R7+) has discrete point/edge/polygon "Targets," but these
  are transient, consumed by a single modeling action rather than held as a
  reusable Edit-mode selection state.

## Takeaway

The split correlates with editing model, not app age or polish:

- **Auto-flush (Blender)** fits *direct*, session-resident mesh editing
  where the adjacency structure is always live and there's no downstream
  procedural consumer of a stale selection to worry about.
- **Manual/explicit conversion (Maya, 3ds Max, Houdini, Modo's visible
  layer)** fits either a procedural/node-graph history (3ds Max modifiers,
  Houdini SOPs), where a selection must survive as addressable data flowing
  through nodes that can't safely re-derive it silently, or — in Maya's
  case — a direct-editing convention where users deliberately want
  independent, non-clobbering selections held simultaneously across domains.

No source surveyed here frames the manual-conversion choice as a performance
optimization; where that's plausible (e.g. avoiding a flush pass on every
selection op in a procedural graph), it should be treated as a reasonable
inference rather than a documented rationale.

## Sources

- `github.com/blender/blender` — `source/blender/bmesh/intern/bmesh_marking.cc` (`BM_mesh_select_mode_flush_ex`), `source/blender/editors/mesh/editmesh_select.cc`
- `docs.blender.org/api/current/bmesh.types.html` — `select_flush()` / `select_flush_mode()`
- `docs.blender.org/manual/en/2.82/modeling/meshes/selecting.html`
- `developer.blender.org/T74967` — Geometry Nodes selection-as-data discussion
- `help.autodesk.com` (Maya) — "Convert Selection Options"
- `help.autodesk.com` (3ds Max) — "Selection Rollout (Edit Poly Modifier)," "Working at the Sub-Object Level," "Selection Rollout (Polymesh)"
- `learn.foundry.com/modo` — Selecting Items, Selection Operations, Selection Modifiers
- `sidefx.com/docs/houdini/nodes/sop/{blast,group,grouppromote}.html`; `sidefx.com/forum/topic/45073/`
- `tokeru.com/cgwiki/Points_and_Verts_and_Prims.html`
- `help.maxon.net/zbr` — Masking, PolyGroups, ZModeler Edge Actions
- `zbrushcentral.com/t/is-it-possible-to-select-just/246853`
- `polycount.com/discussion/107513`, `polycount.com/discussion/157602`

Some Blender community domains (devtalk.blender.org, blender.stackexchange.com)
returned HTTP 403 on direct fetch during this research and were only
available via search snippets; the Maya section leans on well-established,
widely-documented behavior rather than a fresh verbatim doc fetch.
