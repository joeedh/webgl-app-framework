# TypeScript Porting Backlog

Tracks first-party `scripts/**/*.js` files **not yet ported to TypeScript**, in
suggested porting order. Generated 2026-05-26.

## Scope & method

- **88 first-party `.js` files** remain under `scripts/` (excludes the
  `path.ux/` and `mathl/` submodules, and the vendored `scripts/extern/` libs).
- Prioritization signal = **import fan-in** (how many `.js`/`.ts` modules import
  the file) combined with subsystem centrality and porting effort (file size).
  Fan-in counts shown as `(N)` below.
- High fan-in = porting it lets many downstream files lean on real types.

## Do NOT port (exclude)

These are vendored third-party code or generated build artifacts. Leave as-is or
delete; do not invest in porting.

| File | Why |
|------|-----|
| `scripts/extern/three/*.js`, `scripts/extern/Math.js`, `scripts/extern/jszip/*.js`, `scripts/extern/cdt-js/*.js`, `scripts/extern/three_patches.js` | Vendored third-party libraries |
| `scripts/util/numeric.js` (174 KB) | Vendored numeric-computing library |
| `scripts/typescript_entry.js` | Build artifact — source is `typescript_entry.ts` (has `.map`) |
| `scripts/image/gpuimage_old.js` (8 KB) | Dead code superseded by `gpuimage.js`; **delete candidate**, don't port |

### Empty stub files — trivial (rename `.js`→`.ts`, no logic)
- `scripts/camera/camera_ops.js` (0 bytes)
- `scripts/editors/resbrowser/resbrowser_ops.js` (0 bytes)
- `scripts/hair/strand_selectops.js` (0 bytes)

---

## Tier 1 — Quick high-leverage wins (thin shims, huge fan-in)

Mostly re-export shims or tiny data/config modules. Low effort, but unblock
strict typing across dozens of dependents. **Do these first.**

| File | Fan-in | Size | Notes |
|------|:--:|:--:|-------|
| `scripts/util/vectormath.js` | 65 | 1.1 KB | Re-export shim over path.ux + THREE adapters |
| `scripts/util/util.js` | 62 | 1.0 KB | Re-export shim + `inherit`/`mixin` helpers |
| `scripts/editors/icon_enum.js` | 41 | 3.8 KB | Icon enum/data table |
| `scripts/core/platform.js` | 5 | 0.1 KB | Pure re-export shim |
| `scripts/config/config.js` | 5 | 2.1 KB | App config |
| `scripts/config.js` | 5 | 1.0 KB | Path/prefix helpers (root) |
| `scripts/core/modalflags.js` | 3 | 0.1 KB | Flag constants |

## Tier 2 — Foundational core (real logic, high fan-in)

The base layer everything else builds on. Port after Tier 1 so the type info
propagates upward.

| File | Fan-in | Size | Notes |
|------|:--:|:--:|-------|
| `scripts/util/math.js` | 28 | 45 KB | Core math — large, central |
| `scripts/util/binarylib.js` | 3 | 4.5 KB | Binary (de)serialization |
| `scripts/util/bezier.js` | 3 | 6.4 KB | Bezier curve math |
| `scripts/core/graph_class.js` | 3 | 1.8 KB | Dependency-graph base |
| `scripts/core/graph_spatial.js` | 2 | 3.3 KB | Spatial graph |
| `scripts/util/events.js` | 2 | 1.8 KB | Event utilities |
| `scripts/core/graph_datapath.js` | — | 0.2 KB | Tiny graph glue |
| `scripts/core/toolstack.js` | 1 | 3.2 KB | Undo/ToolOp stack |
| `scripts/core/app_ops.js` | — | 5.3 KB | App-level ToolOps |
| `scripts/core/polyfill.js` | — | 7.5 KB | Polyfills |

## Tier 3 — Editors & scene subsystems (moderate fan-in)

User-facing subsystems. Port grouped by directory to keep cross-imports
consistent.

| File | Fan-in | Size | Notes |
|------|:--:|:--:|-------|
| `scripts/editors/all.js` | 11 | 0.6 KB | Editor barrel import |
| `scripts/light/light.js` | 9 | 2.9 KB | Light datablock |
| `scripts/editors/node/NodeEditor.js` | 6 | 36 KB | Node editor — large |
| `scripts/editors/velpan.js` | 5 | 6.0 KB | Velocity-pan widget |
| `scripts/sceneobject/stdtools.js` | 5 | 1.2 KB | Standard scene tools |
| `scripts/editors/menu/MainMenu.js` | 4 | 10 KB | Main menu |
| `scripts/editors/node/MaterialEditor.js` | 3 | 4.5 KB | |
| `scripts/editors/node/NodeEditor_debug.js` | 3 | 12 KB | |
| `scripts/editors/node/node_ops.js` | 2 | 13 KB | |
| `scripts/editors/node/node_selectops.js` | 1 | 5.5 KB | |
| `scripts/sceneobject/sceneobject_ops.js` | 2 | 7.8 KB | |
| `scripts/sceneobject/selectops.js` | 2 | 4.7 KB | |
| `scripts/sceneobject/scenebvh.js` | 1 | 1.9 KB | |
| `scripts/sceneobject/stdtools_exec.js` | — | 0.2 KB | |
| `scripts/nullobject/nullobject.js` | 2 | 1.9 KB | |
| `scripts/image/gpuimage.js` | 2 | 1.3 KB | |
| `scripts/image/image_ops.js` | — | 3.0 KB | |
| `scripts/light/light_ops.js` | 1 | 2.1 KB | |
| `scripts/texture/textures.js` | — | 0.9 KB | |
| `scripts/camera/camera_types.js` | 1 | 0.1 KB | |
| `scripts/graph/node_group.js` | — | 2.5 KB | |
| `scripts/editors/console/console.js` | 1 | 25 KB | Console editor — large |
| `scripts/editors/theme.js` | — | 16 KB | Theme data |
| `scripts/editors/datapath/DataPathBrowser.js` | 1 | 5.8 KB | |
| `scripts/editors/settings/SettingsEditor.js` | 1 | 3.8 KB | |
| `scripts/editors/resbrowser/resbrowser.js` | 2 | 8.6 KB | |
| `scripts/editors/resbrowser/resbrowser_types.js` | 1 | 0.6 KB | |
| `scripts/editors/popup_editor.js` | — | 8.4 KB | |
| `scripts/editors/DrawerEditor.js` | — | 5.1 KB | |
| `scripts/editors/screengen.js` | 2 | 1.5 KB | |
| `scripts/editors/image/uv_ops.js` | — | 7.0 KB | |
| `scripts/editors/image/uv_selectops.js` | 2 | 7.6 KB | |
| `scripts/editors/image/uv_transformops.js` | — | 12 KB | |
| `scripts/hair/strand.js` | 2 | 4.2 KB | |
| `scripts/hair/strand_base.js` | 2 | 0.4 KB | |
| `scripts/hair/strand_types.js` | 1 | 1.5 KB | |
| `scripts/hair/strand_ops.js` | — | 1.6 KB | |

## Tier 4 — `tet/` tetmesh subsystem (cohesive cluster)

Mostly self-referential with low external fan-in. Port as one batch so internal
imports stay typed together. (Note: `tetmesh` is also a builtin addon — confirm
which copy is canonical before porting.)

| File | Fan-in | Size |
|------|:--:|:--:|
| `scripts/tet/tetgen.js` | 10 | 26 KB |
| `scripts/tet/tetgen_base.js` | 10 | 1.4 KB |
| `scripts/tet/tetgen_types.js` | 3 | 10 KB |
| `scripts/tet/tetgen_utils.js` | 2 | 13 KB |
| `scripts/tet/tetgen_octree.js` | — | 8.1 KB |
| `scripts/tet/tet_deform.js` | 2 | 2.4 KB |
| `scripts/tet/tet_element_list.js` | 1 | 6.8 KB |
| `scripts/tet/tet_ops_base.js` | 1 | 4.0 KB |
| `scripts/tet/tet_ops.js` | — | 7.1 KB |
| `scripts/tet/tet_selectops.js` | — | 3.1 KB |
| `scripts/tet/wiregen.js` | 1 | 11 KB |
| `scripts/tet/wiregen_ops.js` | — | 2.0 KB |

## Tier 5 — Leaf utilities & misc (low fan-in, opportunistic)

Few or no dependents — port when touched or for completeness.

| File | Fan-in | Size | Notes |
|------|:--:|:--:|-------|
| `scripts/util/sym.js` | 1 | 38 KB | Symbolic math — large |
| `scripts/util/bluenoise_mask.js` | 2 | 33 KB | Mostly data table |
| `scripts/util/linear_algebra.js` | — | 11 KB | |
| `scripts/util/kdtree.js` | — | 17 KB | |
| `scripts/util/octree.js` | — | 4.7 KB | |
| `scripts/util/spatialhash.js` | 1 | 5.8 KB | |
| `scripts/util/delaunay.js` | 1 | 6.6 KB | |
| `scripts/util/parseutil.js` | 1 | 11 KB | |
| `scripts/util/stlformat.js` | 1 | 0.9 KB | |
| `scripts/util/floathalf.js` | 1 | 1.2 KB | |
| `scripts/setup_pathux.js` | 1 | 2.6 KB | |
| `scripts/entry_point.js` | — | 4.4 KB | App init entry |

## Tier 6 — Tests (port last)

| File | Size |
|------|:--:|
| `scripts/test/test.js` | 6.4 KB |
| `scripts/test/test_base.js` | 2.6 KB |
| `scripts/test/test_sculpt.js` | 2.3 KB |
| `scripts/test/test_sculpt_run.js` | 114 KB |

---

### Summary

- **Port first (Tier 1–2):** ~18 files, mostly small; unblocks the widest set of
  dependents.
- **Bulk middle (Tier 3–4):** editors, scene objects, and the `tet/` cluster.
- **Defer (Tier 5–6):** leaf utilities and tests.
- **Skip entirely:** `scripts/extern/*`, `util/numeric.js`, `typescript_entry.js`;
  consider deleting `image/gpuimage_old.js`.
