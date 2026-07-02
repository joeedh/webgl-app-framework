# On-demand selection-domain flushing

Box modeling's `select` attribute category (`documentation/boxModelingMode.md`)
is three independent bool columns — `VertexData::select`, `EdgeData::select`,
`FaceData::select` — with no relationship enforced between them. Today, an op
that needs face selection (extrude region, inset, split-off, ...) reads
`m.f.select` directly; if the user only selected vertices, the op sees
nothing selected and does nothing useful. See
[documentation/selectFlushing.md](../selectFlushing.md) for how other DCC
apps handle this: Blender eagerly flushes on every selection op (a hard
data-model invariant); Maya/Max/Houdini keep domains independent and require
an explicit "convert selection" step.

We're taking a third path: **derive the missing domain's selection on
demand**, as a pure query an op calls at the top of its `invoke`, rather than
either eagerly flushing (Blender) or requiring the user to explicitly
convert (Maya/Max). Selecting vertices and running "extrude face regions"
should just work, deriving face selection from the selected verts at
op-invocation time.

---

# Architecture

## Guiding principle

The three `select` columns stay exactly as they are: independent, directly
settable via `MeshLog::selectOne`, undo-tracked exactly as today. Nothing
about storage or the existing per-domain selection ops changes. What's new is
a pure, read-only query layer that ops opt into calling — no eager
propagation, no new undo surface, no change to `selectOne`'s semantics.

## 1. The derive-selection query

New file `sculptcore/source/mesh/utils/select_derive.h` (+ `.cc`), sibling to
`modeling_walk.h` — this generalizes `gatherMovableVerts` /
`regionBoundaryEdges` (`modeling_walk.h`), which are already exactly this
pattern (read-only, walks all three domains, no storage) but hardcoded to
one rule each. Those two functions get subsumed into this file; call sites
(`Mesh::movableVerts`, `Mesh::selectionBoundaryEdges` in `mesh.cc`) keep
their existing bound names and behavior, now implemented in terms of the
general query.

```cpp
enum class DeriveRule {
  All,  // strict: every corner/endpoint of the target element must be selected
  Any,  // touching: any corner/endpoint selected is enough
};

// Pure reads over m.v/e/f.select — no MeshLog, no mutation, no undo entry.
Set<int> deriveFaceSelection(Mesh &m, DeriveRule rule = DeriveRule::All);
Set<int> deriveEdgeSelection(Mesh &m, DeriveRule rule = DeriveRule::All);
Set<int> deriveVertSelection(Mesh &m);  // union of touched verts; only one sane rule, no DeriveRule param
```

- `deriveFaceSelection(All)`: a face counts if every corner vert has
  `select == true` (equivalently: every boundary edge selected). This is
  Blender's flush-up rule, computed lazily instead of eagerly maintained.
- `deriveFaceSelection(Any)`: a face counts if *any* of its verts/edges is
  explicitly selected — the "touching" conversion 3ds Max does on
  Ctrl+click.
- `deriveEdgeSelection` mirrors the same two rules one domain down (`All`:
  both endpoint verts selected; `Any`: either endpoint selected, or the edge
  belongs to a selected face).
- `deriveVertSelection`: union of explicitly-selected verts, both endpoints
  of every selected edge, and every corner of every selected face — this is
  exactly today's `gatherMovableVerts` body, unchanged.
- Implementation walks existing adjacency only (`m.f.l` / `m.l.c` corner-loop,
  `m.e_of_v` disk cycle) — no new topology primitives required.

**Default rule is `All`.** A face getting pulled into an extrude/inset
because only one of its four corners was touched would be surprising for a
destructive op; `Any` is exposed as a param for call sites that want the more
permissive 3ds-Max-style behavior later, but no current op requests it.

## 2. Op integration: explicit-domain-preferred, with a feature-flag override

Ops that currently do e.g. `auto *fsel = m.f.select.get_data();` directly
(`extrude`, `inset`, `split`, `bevel`, `loopcut`, `subdivide` — all in
`sculptcore/source/mesh/ops/`) route through one new helper instead:

```cpp
// sculptcore/source/mesh/utils/select_derive.h
Set<int> resolveFaceSelection(Mesh &m);  // and resolveEdgeSelection / resolveVertSelection
```

`resolveFaceSelection` is where the feature flag lives:

```cpp
Set<int> resolveFaceSelection(Mesh &m) {
  Set<int> explicitSel = m.selectedElems(Domain::FACE);
  Set<int> derived     = deriveFaceSelection(m, DeriveRule::All);

  if (FeatureFlags::get(SelectFlushPreferOpDomain)) {
    // default: explicit selection in the op's own domain wins outright;
    // derivation only kicks in as a fallback when that domain is empty.
    return explicitSel.empty() ? derived : explicitSel;
  }
  // flag disabled: union explicit + derived instead of preferring one.
  return explicitSel | derived;
}
```

- **Flag on (default):** if the user already selected faces directly, that
  selection is used as-is and nothing is derived — zero behavior change for
  existing face-mode workflows. Derivation only fires when the op's own
  domain has nothing selected (e.g. vert-only selection, then extrude face
  regions).
- **Flag off:** explicit and derived selections are merged (set union)
  regardless of whether the op's domain already had something selected —
  closer to Blender's always-on flush-up, at the cost of being more
  surprising when a user has a deliberate partial face selection alongside
  unrelated vertex selection elsewhere on the mesh.
- Same helper shape for `resolveEdgeSelection` / `resolveVertSelection`, used
  by loop-cut / feature-edge ops as needed.

### Feature flag

Registered in `scripts/core/feature-flag.ts`, matching the existing
`sculptcore.*` dotted-snake_case namespace (`sculptcore.quad_remesher`,
`sculptcore.auto_defrag`):

```ts
{
  key        : 'sculptcore.select_flush_prefer_op_domain',
  description: 'Prefer an op’s own selected domain over a derived one; when off, merge instead',
  type       : 'bool',
  value       : true,   // default: on
}
```

Run `pnpm gen:paths` after adding it so the datapath
(`settings.featureFlags.select_flush_prefer_op_domain`) is registered.
Note the C++ side does not read `localStorage`/`FeatureFlags` directly — the
existing bridge pattern (however flags currently cross into sculptcore, e.g.
for `auto_defrag`) is reused so the resolved bool reaches
`resolveFaceSelection`; this needs the same argv/settings plumbing already
used for `auto_defrag`, not a new mechanism.

## 3. Where ops change

Each op's `invoke` swaps its direct `m.f.select.get_data()` /
`m.e.select.get_data()` / `m.v.select.get_data()` read for the matching
`resolve*Selection(m)` call at the top, then operates on the returned `Set<int>`
exactly as it does today on the raw column. No change to the op's downstream
logic, no change to how `selectOne` writes the raw columns, no new MeshLog
entries (pure reads, same as `movableVerts` today).

## 4. Undo

None needed. `deriveFaceSelection` / `deriveEdgeSelection` / `deriveVertSelection`
and the `resolve*` wrappers are pure reads over the existing `select`
columns — identical undo profile to `movableVerts`/`regionBoundaryEdges`
today (no `MeshLog*` param, no `onChange` call).

## 5. Caching

Not doing it yet. These queries run once per op invocation over typically-
small selections — the existing `movableVerts`/`regionBoundaryEdges` don't
cache today and nothing has needed it. If a hot path (e.g. a live selection
overlay redraw) ends up calling `deriveFaceSelection` every frame, add a
`boundary::recomputeDirty`-style dirty-bit cache then (a `selectDirty` bool +
per-domain touched-set, cleared by `selectOne`) — not before, since an
unused invalidation surface is just another way to get it wrong.

## Milestone order

1. **M1 — derive query.** Add `select_derive.h`/`.cc` with
   `deriveFaceSelection` / `deriveEdgeSelection` / `deriveVertSelection`.
   Refactor `gatherMovableVerts` / `regionBoundaryEdges` in
   `modeling_walk.h` to be implemented in terms of the new general
   functions; keep `Mesh::movableVerts` / `Mesh::selectionBoundaryEdges`
   bound names and behavior unchanged. No op call sites touched yet.
2. **M2 — feature flag.** Register
   `sculptcore.select_flush_prefer_op_domain` in `feature-flag.ts`
   (default on), wire the resolved value into sculptcore the same way
   `auto_defrag` crosses today, run `pnpm gen:paths`.
3. **M3 — resolve helpers + op wiring.** Add `resolveFaceSelection` /
   `resolveEdgeSelection` / `resolveVertSelection` to `select_derive.h`/`.cc`;
   swap the direct `m.f/e/v.select.get_data()` reads in `extrude`, `inset`,
   `split`, `bevel`, `loopcut`, `subdivide` (`sculptcore/source/mesh/ops/`)
   for the matching `resolve*` call.
4. **M4 — verification.** Headless stroke/op test: select only vertices on
   a quad region, run extrude-face-regions, assert the extruded face set
   matches `deriveFaceSelection(All)` on the pre-op selection. Repeat with
   the flag off and a mixed vert+face selection to assert union behavior.
   Both backends per the existing parity-test pattern
   (`tests/integration/sculptcore_parity.test.ts`).

## Net-new vs. reused

- **Net-new:** `select_derive.h`/`.cc`, the `DeriveRule` enum, the
  `resolveFaceSelection`/`resolveEdgeSelection`/`resolveVertSelection`
  helpers, the `sculptcore.select_flush_prefer_op_domain` feature flag.
- **Reused as-is:** the three `select` bool columns, `MeshLog::selectOne`
  and all existing selection ops (`selectAllElems`, `selectIndices`,
  `selectShortestPath`, `selectFromSets`, `selectScreenCircle`/`Rect`),
  `Mesh::selectedElems`/`selectedCount`, and the adjacency primitives
  (`m.f.l`/`m.l.c` corner loop, `m.e_of_v` disk cycle) that
  `gatherMovableVerts`/`regionBoundaryEdges` already walk.
