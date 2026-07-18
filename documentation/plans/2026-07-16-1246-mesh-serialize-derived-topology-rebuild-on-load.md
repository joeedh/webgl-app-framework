# Mesh serialization: rebuild derived topology on load

Date: 2026-07-16 12:46
Status: proposed

## Goal

Stop writing the radial-edge link columns and the recomputable normals to the
mesh blob; reconstruct them in `serial::readMesh` from the authoritative
columns. Target: **268.5 MB → 88.5 MB** of uncompressed payload for a
1.5 M-triangle mesh (a 3.0× cut), with an optional further step to 64.5 MB.

## Baseline (measured, not estimated)

`examples/HighPoly1.5m.wproj` was probed directly (decompress + parse the
domain/attr table). Its blob is `raw=361,550,355 comp=269,037,642`, lz4hc ratio
**1.34×**. Note two things about that file:

- It is a **1.5 M-quad** mesh (corners = 4 × faces, E = 2F), not triangles.
- It carries `.boundary.vert.class`, which is now created `temp=true`
  (`boundary.cc:215`) and forced TEMP on load by `mandatoryBuiltinFlags`
  (`mesh_serialize.cc:169`). A re-save already drops it. It is **not** part of
  this plan's savings.

Per-element cost of the current column set, and the resulting budget for a
1.5 M-**triangle** closed manifold mesh (V≈750k, E≈2.25M, C=3F=4.5M, L=F,
F=1.5M):

| Domain | Columns | B/elem | Count | Total |
|---|---|---|---|---|
| VERTEX | positions 12, normals 12, `.vert.e` 4, `.spatial.v.mask` 4, select 1 | 33 | 750k | 24.75 MB |
| EDGE | `.edge.vs` 8, `.edge.vs.disk` 16, `.edge.c` 4, select 1 | 29 | 2.25M | 65.25 MB |
| CORNER | `v,e,l,next,prev,radial_next,radial_prev` (7 × int32) | 28 | 4.5M | 126.00 MB |
| LIST | `.list.c/.f/.next/.size` (4 × int32) | 16 | 1.5M | 24.00 MB |
| FACE | `.face.normal` 12, `.face.list` 4, `list_count` 2, select 1 | 19 | 1.5M | 28.50 MB |
| | | | | **268.50 MB** |

Positions are only 9 MB of that. ~70% is radial-edge connectivity — high-entropy
index data, which is exactly why lz4hc only manages 1.34×.

## Column classification

**Authoritative — must be written.** These define identity and cannot be
re-derived without renumbering elements (which would silently invalidate every
index-keyed attribute column, including `select`, sculpt layers, and
`.boundary.edge.seam/sharp`):

- `v`: `positions`, `select`, `.spatial.v.mask` (a real user-authored sculpt
  mask, despite the `.spatial.` prefix), custom attrs, sculpt-layer channels
- `e`: `.edge.vs`, `select`
- `c`: `.corner.v`, `.corner.next`
- `l`: `.list.c`, `.list.next`
- `f`: `.face.list`, `select`

**Derived — drop and rebuild on load:**

| Column | B/elem | Rebuilt from | Saving @1.5M tris |
|---|---|---|---|
| `v.normals` | 12 | `recalc_normals` | 9.0 MB |
| `.face.normal` | 12 | `recalc_normals` | 18.0 MB |
| `.list.size` | 4 | `recountNgons()` (already called on load) | 6.0 MB |
| `.face.list_count` | 2 | `recountNgons()` | 3.0 MB |
| `.vert.e` | 4 | disk rebuild from `.edge.vs` | 3.0 MB |
| `.edge.vs.disk` | 16 | disk rebuild from `.edge.vs` | 36.0 MB |
| `.edge.c` | 4 | radial rebuild from face loops | 9.0 MB |
| `.corner.e` | 4 | `find_edge` per corner, post-disk | 18.0 MB |
| `.corner.radial_next` | 4 | radial rebuild | 18.0 MB |
| `.corner.radial_prev` | 4 | radial rebuild | 18.0 MB |
| `.corner.prev` | 4 | inverse of `.corner.next` | 18.0 MB |
| `.corner.l` | 4 | walk face → list → corners | 18.0 MB |
| `.list.f` | 4 | walk face → list | 6.0 MB |
| | | | **180.0 MB** |

`268.5 − 180.0 = 88.5 MB`.

## Why `validateAndRepair()` cannot be reused directly

This is the obvious approach and it is wrong. Two independent blockers:

1. **It early-returns on a clean mesh.** `mesh.cc:363-367` returns 0 before the
   pass-5/6 rebuild whenever `errors == 0`, deliberately, so it stays cheap to
   call eagerly on load.
2. **Dropped columns arrive as zeros, not `ELEM_NONE`.** `buildDomain` fills
   absent columns via `ed.alloc()` → `attrs.set_default(i)`, which writes
   `T(0)` (`attribute.h:217-228`) — a *valid-looking index 0*, not a sentinel.
   So `validateAndRepair` would read every dropped link as a real reference to
   element 0, classify the faces as having broken corner loops (pass 2,
   `mesh.cc:249-284`), and **pass 4 would kill them**. It would also
   `make_edge` spurious edges (`mesh.cc:404-408`), changing the element set.

The zero-fill is the sharpest trap in this whole change: **any rebuild must
overwrite unconditionally and must never test for an `ELEM_NONE` sentinel.**
A "rebuild only where unset" strategy fails silently.

Additionally `set_default` no-ops on an unmaterialized page
(`attribute.h:219-221`), while `operator[]` dereferences `page.data` with no
null check (`attribute.h:207-210`) — so the rebuild must materialize the topo
pages first or it segfaults rather than faulting in.

`FrozenTopo::rebuildLinks` is likewise not reusable: its input is the five CSRs
of a `FrozenTopo` snapshot, which are as large as the links they restore.

So: a **new, dedicated, unconditional** `Mesh::rebuildDerivedTopo()`. Factor the
pure rebuild loops out of `validateAndRepair` passes 5-6 and have both call
them, so the cycle-splice logic exists once.

## Phases

### Phase 0 — prerequisites (do first, independently landable)

Two existing defects sit directly in this change's path.

**0a. `MESH_FORMAT_VERSION` drift is a live bug.** `scripts/util/lz4.ts:193`
says `3`; `mesh_serialize.h:14` says `4`. Commit `79bec1b` bumped C++ and left
TS behind. Every autosave blob is stamped v3 over v4 bytes, so on load
`migrate()` runs `case 3` — the diskPack re-encode — on already-packed data,
double-encoding `.edge.vs.disk` *and* indexing `w[t * 2 + 0]` with an unpacked
`t` that reaches ~2× the `.edge.vs` column length: an out-of-bounds read
(`mesh_serialize.cc:471`). It has gone unnoticed because `litemesh.ts:896`
calls `repairMesh()` right after, which rebuilds the disk cycles from
`.edge.vs` and silently launders the corruption.

Fix the constant. Better, remove the hand-mirror: export `kMeshFormatVersion`
through the mesh C API and have TS read it. The existing
`tests/unit/lz4.test.ts:96` assertion is self-referential
(`expect(parts.meshFormatVersion).toBe(MESH_FORMAT_VERSION)` — the constant
against itself) and pins nothing; replace it with a cross-language check.

This **must** land first: once v5 exists, a blob mislabeled v3 walks a *two*-step
wrong cascade.

**0b. No test loads an old-version fixture.** Every case in
`test_mesh_serialize.cc` round-trips through the current writer, so `migrate()`'s
`case 1/2/3` are dead code at test time — which is why 0a survived. Check in a
small v4 blob as a binary fixture (the `save_mesh`/`load_mesh` debug verbs from
`79bec1b`, `source/debug/script.cc:2257-2287`, can generate one) and assert it
loads to a valid mesh.

### Phase 1 — drop normals and the ngon counts (27 + 9 = 36 MB)

Lowest risk: no new reconstruction code. `readMesh` already calls
`recountNgons()` (`mesh_serialize.cc:618`), which rebuilds `.list.size` and
`.face.list_count`. Add a `recalc_normals()` call alongside it.

Verify `recountNgons()` genuinely writes both columns for every element rather
than trusting loaded values — if it early-outs anywhere, fix that first.

### Phase 2 — drop the link columns (144 MB)

**Mark the derived columns.** Add `AttrFlag::DERIVED = 1 << 5` and set it on the
builtin declarations in `mesh_types.h`. `writeDomain` then skips
`TEMP | DERIVED` at both `mesh_serialize.cc:222` and `:234` (mirroring how TEMP
already works). A declarative flag beats a hardcoded name list in the serializer.

**Sharp edge:** `buildDomain` does `attr.flag = col.flag | mandatoryBuiltinFlags(col.name)`
(`:385`). A v4 file has `flag=0x01` for `.edge.vs.disk`, so loading it would
**clear** the new `DERIVED` bit and the mesh would re-save the column. Add every
derived builtin to `mandatoryBuiltinFlags` (`:161-173`) so the canonical bits are
re-asserted on load — exactly the class of bug `test_nonpersistent_flag_repair`
already guards.

**Add `Mesh::rebuildDerivedTopo()`**, called from `readMesh` after the
`buildDomain` loop (`:617-620`), next to `recountNgons()` / `markAllDirty()`.

Put it in `readMesh`, **not** in `litemesh.ts` next to `repairMesh()`.
`serial::readMesh` does not repair, so C++ consumers (`test_mesh_serialize.cc`'s
`roundTrip`) would otherwise silently get an unrebuilt mesh.

Order of operations inside it:

1. Materialize topo pages on all five domains (`materializeTopoPages()`).
2. `.corner.prev` ← inverse of `.corner.next`.
3. `.corner.l` / `.list.f` ← walk `f.list` → `l.next` → `l.c` → `c.next`.
4. Disk cycles: `v.e` ← `ELEM_NONE`; `e.disk` ← self-links; then
   `disk_insert(ei, e.vs[ei][0..1])` per edge. (`validateAndRepair` pass 5,
   `mesh.cc:381-393`.)
5. Radial cycles: `e.c` ← `ELEM_NONE`; `c.radial_*` ← self; per face walk the
   corner loop, `c.e[cc] = find_edge(c.v[cc], c.v[c.next[cc]])`,
   `radial_insert(ce, cc)`. (Pass 6, `mesh.cc:395-418`.)

**Difference from pass 6:** every edge already exists (we keep `.edge.vs`), so
the rebuild must **never `make_edge`**. A `find_edge` miss means a corrupt file
— return failure and let the caller fall back to `validateAndRepair`, rather
than silently inventing geometry.

**Versioning.** Bump to `kMeshFormatVersion = 5`; `case 4:` in `migrate()` is a
**no-op** (the rebuild needs a live `Mesh`, and `migrate` operates on the
`SerialMesh` IR before any `ElemData` exists — it cannot host it). Run
`rebuildDerivedTopo()` **unconditionally for all versions**. A v4 file's stale
columns load and get overwritten: wasted work, but one code path that is always
exercised, instead of a rarely-tested branch. Old files get the size win on
re-save.

### Phase 3 — canonical corner ordering (optional, further 24 MB)

`writeMeshRaw` already renumbers every domain densely and remaps all topo
columns through `maps[d]` (`mesh_serialize.cc:508-526`), and all columns of a
domain are permuted consistently. So the writer is free to choose a
**loop-contiguous corner permutation** — corners of each face laid out
consecutively in loop order. Then `.corner.next` is implicit (`c+1`, wrapping at
the run end) and `.list.c` is implicit (the run start), dropping 18 + 6 MB and
landing at **64.5 MB**.

Defer this. It couples the writer's compaction to the reader's assumptions in a
way phases 1-2 do not, and phase 2 already captures 80% of the win.

## Risks

- **Cycle order is not preserved.** `thawTopo` restores links bit-identically,
  but a rebuild from authoritative data reconstructs disk/radial cycles in
  slot-iteration order, not the original walk order. This is semantically
  valid but changes brush `for_neighbor` iteration order, so float accumulation
  order — and therefore sculpt results after a save/load round-trip — can differ
  in the last bits. Decide explicitly whether that is acceptable; it likely is,
  but it should be a decision, not a surprise.
- **Load-time cost is unknown and must be measured.** `rebuildLinks` and
  `validateAndRepair` are both fully serial (no `parallel_for` in
  `mesh_topo_cache.cc`), and the rebuild is O(V + E + C) plus page allocation.
  No measurement of `thawTopo` exists anywhere in the tree — the docs treat its
  cost as "O(mesh), avoid per-op" but never quantify it, and
  `dyntopo-m7-cascade.md:70` flags a suspected thaw cost as explicitly
  "not yet proven". Do not assume.
- **It may well be net *faster* to load.** ~180 MB less to read from disk, less
  lz4 to decompress, and — per the `project_electron_startup_profile` finding
  that per-byte nstructjs reading of the litemesh block is a startup hotspot —
  ~3× less of that hotspot. Whether the serial rebuild costs more than the
  bytes it saves is the key open question. **Measure before committing to the
  design.**
- **Non-manifold and degenerate cases:** edges with >2 faces, wire edges (no
  faces, `e.c = ELEM_NONE`), loose verts (`v.e = ELEM_NONE`). Pass 5/6 handle
  these; the tests must cover them.
- **`repairMesh()` still runs after** (`litemesh.ts:896`) and will now validate
  the rebuilt links. On a healthy mesh it early-returns — so it becomes a free
  self-check, not a cost.

## Verification

- Extend `test_mesh_serialize.cc`. `validateMesh()` (`:39-150`) already checks
  disk + radial + face-list cycles — that is the regression net. Add a case
  that compares pre-save and post-load links **as sets, not sequences** (for
  each vert, the set of disk edges; for each edge, the set of radial corners),
  since order is not preserved by design.
- Cover holes/non-manifold/wire/loose in the existing N ∈ {1,4,8,16} grid cases.
- `test_frozen_roundtrip` — confirm it doesn't assert link *identity* across
  save/load; if it does, it needs the set-comparison treatment too.
- **Payload-size regression guard:** assert the serialized payload for a known
  mesh is under a byte budget. Without this the win silently erodes the next
  time someone adds a builtin.
- Round-trip `examples/HighPoly1.5m.wproj` and re-probe: expect the quad-mesh
  raw payload to fall from 361.6 MB to roughly 120 MB (quads: C=4F, E=2F).
- Report before/after: file size, raw payload, load wall-time, peak RSS.

## Open questions

1. Does the serial rebuild cost more or less than the 180 MB it saves reading?
   (Decides whether this is a pure win or a size/time trade.)
2. Is a change in post-load brush iteration order acceptable?
3. Phase 3 now or later?
