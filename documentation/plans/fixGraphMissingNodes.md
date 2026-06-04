# Preserve unknown graph nodes & sockets across (de)serialization

## Context

`scripts/core/graph.ts` (the dependency-graph system) has no handling for
deserializing a `Node` subclass or `NodeSocketType` subclass whose class isn't
registered with nstructjs (the owning addon is unloaded). Today nstructjs would
either throw or hand back a bare object, and the graph load path
(`Graph.loadSTRUCT`) would drop the node and prune every edge pointing at it —
losing both the data and the link topology.

We want to:

1. **Preserve unknown nodes/sockets and their live links** — keep them in the
   graph as placeholder `Node`/`NodeSocketType` instances whose sockets register
   in `sock_idmap` so edges to/from *known* nodes relink correctly.
2. **Round-trip them faithfully on the next save** — re-emit each under its
   *original* struct id + schema (the original struct script stays in the file's
   embedded schema), so a later session that has the addon loaded reads the real
   class back with no data loss.

This mirrors the existing `MissingDataBlock` / `MissingToolMode` /
`OpaqueCustomDataElem` placeholder pattern in `scripts/core/missing_addon.ts`,
which uses the nstructjs `onUnknownClass` / `onSerializeUnknown` hooks.

**Two pre-existing blockers (confirmed in code) must be fixed first** — they
also make the *current* ToolMode/CustomData placeholder path latently inert:

- **Load uses a fresh per-file manager.** `appstate.ts:650` does
  `const istruct = new nstructjs.STRUCT()` and reads every block with
  `istruct.readObject(...)`. The read-time hook is resolved off *that* instance
  (`this.onUnknownClass`, `struct_intern.ts:993`), but
  `installMissingAddonHooks()` only sets the hooks on the **global**
  `nstructjs.manager` (`missing_addon.ts:163,180`). So `onUnknownClass` never
  fires during load.
- **Save can't find the schema.** Save writes via the global
  `nstructjs.manager` (`appstate.ts:299,340`); `onSerializeUnknown` then does
  `manager.get_struct(_origClsname)` (`struct_intern2.ts:742`), which throws
  because the missing class's schema was parsed only into `istruct`
  (`appstate.ts:655`), never into the global manager.

**Decisions:** use *getter re-injection on live objects* (not raw-byte
capture), and *fix the shared seam properly* (benefits the existing
ToolMode/CustomData path too).

## Why getter re-injection is needed

`write_scripts()` defaults to `include_code=false` (`struct_intern.ts:1503`), so
the embedded file schema drops every field's `| getter` (`struct_intern.ts:339`).
But the base graph reference fields are *defined by* getters:

- `Node.inputs` / `Node.outputs`: `array(graph.KeyValPair) | obj._save_map(obj.<field>)` (graph.ts:518-519)
- `NodeSocketType.node`: `int | this.node !== undefined ? this.node.graph_id : -1` (graph.ts:~146)
- `NodeSocketType.edges`: `array(e, int) | e.graph_id` (graph.ts:~147)

At save time a live placeholder holds **objects** in these fields (real `Node`
in `.node`, socket array in `.edges`, a socket map in `.inputs`), so without the
getter the writer (`write_struct`, `struct_intern.ts:830-846`) packs objects
where ints/arrays are expected → corruption. The fix re-attaches these getters
onto the missing class's registered schema. The base classes `graph.Node` and
`graph.NodeSocketType` are live-registered and **retain** their getters, so we
copy `get` by matching field name from the base schema. The array iter-var
(`e`) survives stripping as `array(e, int)` (`struct_intern2.ts:1027`), so only
the `| e.graph_id` transform must be restored.

Limitation to note in code: only base-class getter fields are restored; a
*subclass-only* field that needed a custom save-getter referencing another graph
object would still mis-pack. Plain-data subclass fields round-trip fine.

## Changes

### 1. `scripts/core/graph.ts` — add two placeholder classes (exported)

Define near the other Node subclasses (e.g. after `ProxyNode`). **Do not** add
them to any runtime registry (`NodeSocketClasses` / node menus) and **do not**
give them a `static STRUCT` — the read path constructs them via the hook and
walks the *file* schema; the write path emits them under `_origClsname`. (This
intentionally differs from `MissingToolMode`, which is registered; here
registration is unnecessary and risks struct-id collisions.)

- **`MissingNode extends Node`**
  - `_origClsname: string = ''` (nstructjs also sets this dynamically on read).
  - `static nodedef()` → `{name:'MissingNode', uiname:'Missing (Addon Disabled)', flag:0, inputs:{}, outputs:{}}` so the `Node` ctor (graph.ts:561-566) doesn't throw and builds no default sockets.
  - Override `loadSTRUCT(reader)` to run **only** the inputs/outputs array→map
    conversion that base `Node.loadSTRUCT` does (graph.ts:854-880 — sets
    `socketType`/`socketName`/`node` on each `pair.val`) and **skip** the
    version-patching block (graph.ts:882-950), which would call
    `getFinalNodeDef()` against a non-existent def. Keeping the conversion is
    essential so `allsockets` (graph.ts:695-705) yields the loaded sockets and
    they get into `sock_idmap` during `Graph.loadSTRUCT`.

- **`MissingNodeSocket extends NodeSocketType`**
  - `_origClsname: string = ''`; an opaque `_value` field.
  - `static nodedef()` → valid `{name:'MissingNodeSocket', uiname:..., flag:0}` so its ctor (graph.ts:168-199) doesn't throw.
  - Implement the abstract `getValue()`/`setValue(v)` (graph.ts:382-384) over `_value`, and override `copyValue()`→`_value`, `cmpValue()`→0, `diffValue()`→0 (base throws, graph.ts:307-318) so the cyclic solver (graph.ts:1491,1501,1519) treats it as inert/unchanged.

### 2. `scripts/core/missing_addon.ts` — extend the hook + global registration

- Import `MissingNode`, `MissingNodeSocket` from `./graph` (one-directional;
  graph.ts must not import missing_addon — it currently imports only pathux +
  type-only locals, so this stays acyclic).

- Add `applyMissingAddonHooks(struct)` that copies
  `onUnknownClass`/`onSerializeUnknown` from `nstructjs.manager` onto a given
  `STRUCT` instance. Used to wire the per-file `istruct` (see change 3).

- Add `registerMissingStructGlobally(clsname, fileSchema)`: if `clsname` is not
  already in `nstructjs.manager.structs`, register `fileSchema` into the global
  manager (mirroring what `parse_structs` does for an unknown struct — create a
  dummy class, assign a **fresh global id** via the manager's idgen, and store
  in `structs` / `struct_cls` / `struct_ids`). Idempotent. This makes the save
  path's `get_struct(_origClsname)` and `write_scripts()` succeed for **every**
  placeholder kind (graph, toolmode, customdata) — fixing blocker B generally.

- Add `reinjectGraphGetters(fileSchema, kind)`: for `kind==='node'` copy
  `get` from `nstructjs.manager.get_struct('graph.Node')` onto fields `inputs`,
  `outputs`; for `kind==='socket'` copy from `'graph.NodeSocketType'` onto
  `node`, `edges` (matching by field name; verify `edges` keeps `iname==='e'`).
  Exact getter strings (from graph.ts):
  - `inputs`  → `obj._save_map(obj.inputs)`
  - `outputs` → `obj._save_map(obj.outputs)`
  - `node`    → `this.node !== undefined ? this.node.graph_id : -1`
  - `edges`   → `e.graph_id`

- Rewrite the `onUnknownClass` body to **sniff `fileSchema.fields` by name**
  (the dotted namespace prefix is unreliable across the many subclasses;
  `inlineRegister` flattens base fields into every subclass schema, so base
  field names are always present):
  1. **socket** if fields include `socketName` + `edges` + `socketType`:
     `registerMissingStructGlobally` → `reinjectGraphGetters(...,'socket')` → return `MissingNodeSocket`.
  2. **node** if fields include `inputs` + `outputs` + `graph_ui_pos`:
     `registerMissingStructGlobally` → `reinjectGraphGetters(...,'node')` → return `MissingNode`.
  3. **mesh CustomData** (existing `mesh.*` + `CustomData` check) → also
     `registerMissingStructGlobally` → return `opaqueCustomDataElemCls`.
  4. **fallback** → also `registerMissingStructGlobally` → return `MissingToolMode`.

  `onSerializeUnknown` stays as-is (returns `obj._origClsname`).

### 3. `scripts/core/appstate.ts` — wire the per-file `istruct`

In `loadFile_readHeader`, right after `istruct.parse_structs(...)`
(appstate.ts:655), call `applyMissingAddonHooks(istruct)` so `onUnknownClass`
fires during the block reads at appstate.ts:684/688/691/717/728. (Save already
uses the global manager, which `registerMissingStructGlobally` populates, so no
save-side change beyond that is needed.)

## Verification

1. **Typecheck:** `npx tsgo --noEmit` — must not exceed the documented 106-error
   baseline (no new errors from graph.ts / missing_addon.ts / appstate.ts).
2. **Round-trip integration test** (add under `tests/`, run with `pnpm test`):
   - Register a throwaway `Node` subclass with one custom socket type and a
     couple of plain-data fields; build a small `Graph` with that node wired by
     an edge to a *known* node; `writeObject` the graph (capture
     `write_scripts()` output too).
   - Read it back with a `STRUCT` manager that has the hooks applied but
     **lacks** the throwaway classes (simulating the unloaded addon) — assert:
     the node is a `MissingNode`, its socket is a `MissingNodeSocket`,
     `_origClsname` matches, and the edge between it and the known node is
     relinked live in `sock_idmap` (not pruned).
   - Re-save from the global manager, then re-read with the real classes
     registered — assert the original subclass instances and field values are
     restored and the edge survives. This exercises getter re-injection +
     global schema registration end-to-end.
3. **Manual smoke (optional):** load a `.wproj`/material whose graph references a
   disabled addon's node via the headless harness
   (`node electron/main.js ... --eval`/`--save`) and confirm no load crash and a
   clean re-save.

## Critical files

- `scripts/core/graph.ts` — `MissingNode` / `MissingNodeSocket`; reference at relink/load (1654-1746), getters (518-519, ~146-147), abstract socket methods (307-318, 382-384), ctor (168-199, 561-566).
- `scripts/core/missing_addon.ts` — hook dispatch by field-sniffing, `applyMissingAddonHooks`, `registerMissingStructGlobally`, `reinjectGraphGetters`.
- `scripts/core/appstate.ts` — `applyMissingAddonHooks(istruct)` after line 655.
- Reference only (runtime nstructjs is the `scripts/path.ux/dist/pathux.js` bundle; no nstructjs source change is required for this plan): `vendor/nstructjs/src/struct_intern.ts` (993, 760, 816-849), `struct_intern2.ts` (739-746, 1005-1034).
