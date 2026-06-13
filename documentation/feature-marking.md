# Feature-edge marking (seams & sharp edges)

Interactive tools that flag mesh edges as **boundary features** — seams (used by
UV unwrapping and as smoothing/remeshing boundaries) and sharp edges. The flags
are the source-of-truth `boundary::EDGE_SEAM` / `EDGE_SHARP` attributes consumed
by boundary-aware smoothing (see [brush-notes.md](brush-notes.md) "Boundary-aware
smoothing"), UV generation (`litemesh.generate_uv`), and the remesher.

## The tools

Both live in `scripts/lite-mesh/litemesh_ops.ts` and share one abstract base,
`MarkEdgePathBaseOp` (a modal knife-style chain marker):

- `litemesh.mark_seam_interactive` — **Mark Seam** (`Icons.MARK_SEAM`, hotkey
  `K`, orange overlay). Flags `EDGE_SEAM`.
- `litemesh.mark_sharp_interactive` — **Mark Sharp** (`Icons.MARK_SHARP`, hotkey
  `Shift+K`, cyan overlay). Flags `EDGE_SHARP`.

Both are added to the sculptcore toolmode header strip
(`scripts/editors/view3d/tools/sculptcore.ts`). The concrete subclasses supply
only `_kind()` (0 = seam, 1 = sharp) and the two overlay colors; **all**
interaction, snapping and undo live in the base.

### Interaction

Click vertices in sequence; each click marks the shortest feature-edge path from
the previous vertex to the clicked one (live, for immediate feedback). The next
segment is previewed as a hover line from the last committed vertex to the vertex
under the cursor. `Enter` / right-click finishes (one undo step for the whole
chain); `Esc` cancels.

- **Drawlines are cleared on finish *and* cancel** (`modalEnd` →
  `view3d.resetDrawLines`): once committed, the persistent feature overlay (below)
  carries the marks, so the transient preview lines would otherwise double-draw.
- **Snap-to-feature-vertex.** During preview the endpoint snaps to an existing
  feature vertex *of the same kind* within `SNAP_PX` (10 px). While a snap is
  active a white ring is drawn at the cursor (`_snapRingLines` — a billboarded
  view-plane circle built from `getViewVec` basis vectors scaled by camera
  distance, so it stays a fixed pixel radius without a fragile
  project/unproject-w round-trip).
- **Undo** restores the *exact* pre-chain feature bit of every edge the chain
  touched (snapshotted on first sighting in `_priorByEdge`), rather than
  blanket-clearing the path — so a chain that overlapped a pre-existing feature
  edge doesn't unset it on undo. `exec()` re-marks the whole chain on redo.

The op is geometric and addon-owned: vertex picking is `mesh.pickVert` (the BVH
ray pick), path-finding / flag-writing / feature-vert enumeration are all
engine-side (below). The op is just the interaction shell + overlay.

## Feature overlay

The persistent overlay is drawn by `SpatialTree::buildSeamBatch`
(`sculptcore/source/spatial/spatial.cc`), which draws **every** boundary-flagged
edge in a distinct color — seam = orange, sharp = cyan, projected = green,
polygroup = magenta, uvchart = yellow (first match wins). It is gated by the
sculptcore toolmode's `drawFeatureOverlay` property (default **on**, with a
**Feature Overlay** checkbox in the header whose change handler calls
`LiteMesh.markSeamsDirty` to rebuild the batch). So a single toggle shows both
marked seams and marked sharp edges.

## Engine API (kind-parameterized)

One C++/TS path serves both kinds, selected by an `int kind` (0 = seam → 
`EDGE_SEAM`, 1 = sharp → `EDGE_SHARP`; `edgeFlagNameForKind` in `mesh.cc` maps
it). On `Mesh` (`sculptcore/source/mesh/mesh.{h,cc}`), bound to JS:

- `markEdgePath(vStart, vEnd, kind, state)` — flag/clear the shortest edge path;
  returns the edge count (or -1 if no path). `markSeamPath` is the `kind=0` alias.
- `edgeFlagKind(e, kind)` — read one edge's feature bit (0/1).
- `setEdgeFlagKind(e, kind, state)` — set one edge's bit (marks boundary-dirty
  without recomputing; batch then call `recomputeBoundary`).
- `featureVerts(kind, outIdx, outCo)` — indices + object-local xyz of every
  vertex incident to a `kind`-flagged edge (de-duped), index-aligned. The
  marking tool projects these to screen for snapping.

`LiteMesh` (`scripts/lite-mesh/litemesh.ts`) wraps these backend-agnostically
through the bound-Vector helpers: `markEdgePath` (sets `_seamsDirty`),
`edgeFlagKind`, `featureVerts(kind) → {idx, co}`, and `restoreEdgeFlags(edges,
states, kind)` (batch `setEdgeFlagKind` + one `recomputeBoundary`, the true
inverse used by the marking undo). `restoreSeamEdges` / `markSeamPath` remain as
`kind=0` aliases.

## Tests

`tests/integration/sculptcore_boundary.test.ts` (both backends) exercises the
sharp engine path: `markEdgePath(kind=1)` flags `EDGE_SHARP` only (the marked
edge reads sharp=1 / seam=0), `featureVerts(kind)` returns per-kind vertex sets
(the seam set is untouched by a sharp mark), and the union boundary graph
(`boundaryGraphStats`) grows by the sharp-only edges.
