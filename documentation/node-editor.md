# Node Editor

The node editor (`scripts/editors/node/`) is a pan/zoom 2D graph editor for the
core `Graph`/`Node` data model (`scripts/core/graph.ts`). It edits a graph
located by a **data-API path** (not a hard reference), renders each node as a
DOM widget, draws connections into an SVG overlay, and dispatches every edit
through the `node.*` ToolOps so it is fully undoable.

The only **registered** node editor is `MaterialEditor` (the Shader Editor).
`NodeEditorBase` is an abstract base and is intentionally not registered.

## File layout

| File | Purpose |
|------|---------|
| `index.ts` | Module entry: side-effect-imports `node_ops` + `node_selectops` (ToolOp registration) and re-exports `NodeEditor` / `MaterialEditor`. |
| `NodeEditor.ts` | `NodeEditorBase` (abstract editor) and `NodeContainer` (the CSS-transformed clip container that holds node widgets + the SVG overdraw). |
| `MaterialEditor.ts` | `MaterialEditor extends NodeEditorBase`; the registered editor. `updatePath()` recomputes `graphPath` from the active object's material slot. |
| `NodeViewer.ts` | `NodeViewer` — a separate, read-only **canvas-rendered** graph viewer (per-node canvas cache); pan/zoom only, no editing. |
| `node_ui.ts` | `NodeUI` — one widget per graph node (title, body UI, input/output socket rows). |
| `node_socket_ui.ts` | `NodeSocketElem` — one widget per socket (canvas dot + inline value UI for unconnected inputs); starts a connect drag on click. |
| `node_base.ts` | Shared types: `AnyGraph`, `SocketType`, `HighlightArray<T>`, `NodeLayout`, `UINode`, and the `NodeRecalcFlags` enum. |
| `node_ops.ts` | `NodeGraphOp` base + `NodeTranslateOp`, `AddNodeOp`, `ConnectNodeOp`, `DeleteNodeOp`. |
| `node_selectops.ts` | `NodeSelectOpBase` + `NodeSelectOneOp`, `NodeToggleSelectAll`. |

## Class hierarchy

```
Editor (editors/editor_base.ts)
  ├─ NodeEditorBase   — abstract; NOT registered (Editor.register call is commented out)
  │    └─ MaterialEditor  — registered (areaname 'MaterialEditor', tagname 'material-editor-x')
  └─ NodeViewer       — registered (areaname 'nodegraph_viewer'); read-only canvas viewer

Container (path.ux)
  └─ NodeContainer (tagname 'shadergraph-node-container-x')  — CSS-transformed; owns the SVG overdraw
       └─ NodeUI       (one per node)
            └─ NodeSocketElem (one per socket)
```

`NodeEditorBase.define()` still returns `areaname: 'NodeEditor'` /
`apiname: 'nodeEditor'` metadata (so `ctx.editors.nodeEditor` resolves and the
data path exists), but the class is never registered as an area — instantiate a
subclass. `MaterialEditor` is the only such subclass shipped.

### Shared active-editor bin

`NodeEditorBase.push_ctx_active()` / `pop_ctx_active()` key the contextWrangler
"active editor" bin on `this.constructor`. Because the base op code resolves the
editor through this slot, `MaterialEditor` and any other `NodeEditorBase`
subclass behave as one active-editor slot for the node ToolOps.

## Rendering: CSS transforms (current model)

Pan/zoom is applied as a **single CSS transform on the container**, not by
repositioning each node:

- `NodeEditorBase` owns a `VelPan` (inertia disabled — `decay = 0`). On change it
  flags a UI recalc.
- `_recalcUI()` sets `nodeContainer.style.transform = velpan.domMat.toString()`,
  where `VelPan.domMat` is a `DOMMatrix` composed from the pan/zoom
  (`scripts/editors/velpan.ts`). The browser GPU-composites the whole node
  layer.
- Each `NodeUI` positions itself in **graph space** with its own
  `transform: translate(...)` from the node's `graph_ui_pos`; it never bakes in
  the pan/zoom.
- `NodeContainer` sets `transform-origin: top left` and `overflow: visible`, and
  its SVG overdraw is also `overflow: visible`, so connection lines drawn in
  graph space are not clipped when transformed outside the container's nominal
  box. The editor's own `overflow: hidden` provides the final viewport boundary.

Connection lines live in the `NodeContainer.overdraw` SVG layer; `_recalcUI()`
clears it and redraws every link from projected socket positions.

### Deferred recalc

Per-frame work is batched via the `recalcFlags` bitmask (`NodeRecalcFlags`),
drained in `update()`:

- `REBUILD` (2) — tear down and rebuild all `NodeUI` widgets from the graph
  (node count / `graphPath` changed, or an explicit rebuild).
- `UI` (1) — re-sync socket refs, reapply the container CSS transform, and
  redraw the overdraw lines.

`ignoreGraphUpdates` is bumped (>0) during a modal transform so incoming graph
update signals don't trigger a rebuild mid-drag.

## ToolOps and editor binding

All node edits go through ToolOps so they are undoable; the editor never mutates
the graph directly. They are registered at module scope from `node_ops.ts` /
`node_selectops.ts` (these are core editor ops, not addon code, so the addon
"no module-scope register" rule does not apply).

`NodeGraphOp<I, O>` (base) carries three locating inputs:

| Input | Meaning |
|-------|---------|
| `graphPath` | data-API path to the `Graph` being edited (e.g. `material.graph`). |
| `graphClass` | `AbstractGraphClass` type name used when creating nodes (e.g. `shader`). |
| `nodeEditorPath` | data path to the active node editor, used by `getNodeEditor()`. |

Resolution helpers: `fetchGraph(ctx)` reads the graph at `graphPath` (returns
`undefined`, never throws, on a bad path); `getNodeEditor(ctx)` reads the editor
at `nodeEditorPath`. Default undo serializes the whole graph (`SavedGraph` via
nstructjs) and restores it.

### `useNodeEditorGraph` — inheriting the active editor's graph

The static `invoke` of `NodeGraphOp` reads the **active editor** (`ctx.editor`):
when it is a `NodeEditorBase` subclass, it auto-fills `nodeEditorPath` from
`Editor.getDataPath(area.constructor)`. If the caller passes
`useNodeEditorGraph=1`, it then copies that editor's current `graphPath` /
`graphClass` into the op. So from a running editor you can call e.g.

```js
ctx.api.execTool(ctx, 'node.selectone(useNodeEditorGraph=1 nodeId=42 mode=0)')
```

and the op follows whatever graph the editor is showing. Passing an explicit
`graphPath`/`graphClass` instead lets the ops run with **no editor open at all**
(see `tests/integration/node_editor_ops.test.ts`). Use `CTX.debug.showEditor`
when you want a test to follow the editor's graph (see the "Debug context API"
section of the root `CLAUDE.md`).

### The ops

| ToolOp | apiname | Notes |
|--------|---------|-------|
| `NodeTranslateOp` | `node.translate` | Modal; drag-move selected nodes (tracks start positions). |
| `AddNodeOp` | `node.add` | Create a node of `nodeClass` at `pos`; outputs `graph_id`. |
| `ConnectNodeOp` | `node.connect` | Modal; drag-wire two sockets, can disconnect an existing input. |
| `DeleteNodeOp` | `node.delete_selected` | Remove the selected nodes. |
| `NodeSelectOneOp` | `node.selectone` | Select one node by id (UNIQUE/ADD/SUB); snapshots selection + node order. |
| `NodeToggleSelectAll` | `node.toggle_select_all` | Select / deselect all (AUTO). |

## Events & interaction

`NodeEditorBase.on_mousedown` dispatches: pick a socket first (→
`NodeSocketElem.click` starts `node.connect`); else pick a `NodeUI` (→
`node.selectone`, then `node.translate` on drag); else background / middle-click
→ `VelPanPanOp` (pan/zoom). Default keymap: `Shift+A` add-node menu, `G`
translate, `Delete`/`X` delete, `A` toggle-select-all, `=`/`-` zoom.

## See also

- [editors.md](editors.md) — the editor/area system this builds on.
- [datagraph.md](datagraph.md) — the `Graph`/`Node` data model being edited.
- Root `CLAUDE.md` "Debug context API" — driving these ops from tests via
  `CTX.debug.showEditor`.
