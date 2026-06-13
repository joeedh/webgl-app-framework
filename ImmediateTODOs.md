Make sure to keep CLAUDE.md and documentation up to date as you implement each item.

[x]: Only show SculptTools enum icons that are implemented by sculptcore in the header ui (in sculptcore toolmode).
     (SculptCorePaintMode.defineAPI filters the tool enum to TOOL_TO_SCULPTBRUSH's 13 keys;
     verified live via headless --eval; legacy pbvh mode keeps the full enum)
[x]: Write electron app integration tests for the boundary constraint system.  we need a way to
     compute the connected polyline graph of the boundary constraints on a mesh do a few brush strokes with and
     without dyntopo on and then check if the polyline graph has changed by counting the number of non-2-valence vertices.  also test undo/redo.
     (tests/integration/sculptcore_boundary.test.ts; Mesh::boundaryGraphStats + __boundaryTest driver, both backends)
[x]: Pipe brush.color to the paint brush
[x]: Create 'pnpm configure-all':
   - in sculptcore: node make.mjs configure && node make.mjs.configure native
[x]: Create 'pnpm build-all':
   - in sculptcore: node make.mjs codegen && node make.mjs build && node make.mjs build native && node make.mjs node
   - in main repo: pnpm build
[x]: port SettingsEditor.js to typescript then implement a feature flags UI as a tab in it.
     (SettingsEditor.ts; FeatureFlagManager wired into the datapath tree at
     settings.featureFlags.* — dotted flag keys mangled via featureFlagApiName —
     and the new tab lists every flag from FeatureFlags.definitions; guarded by
     tests/e2e/settings_editor.e2e.ts)
[x]: implement the undo memory size calculation for sculptcore's toolops, then make sure the maximum undo memory limit works and is exposed in the settings editor.
     (MeshLog step-id/memSize/freeStep API + SculptPaintOp.calcUndoMem/onUndoDestroy;
     settings.limitUndoMem/undoMemLimit on the Settings General tab; AppToolStack syncs and
     enforces on execTool/undo/redo. Fixed en route: MeshLog::undo/redo now thaw frozen
     topology before replaying topo chunks — undoing a non-newest dyntopo step crashed
     natively / hung on wasm (regression test sculptcore/tests/test_dyntopo_undo_nonnewest.cc).
     Guarded by tests/integration/sculptcore_undomem.test.ts, both backends; see
     documentation/undo-memory.md)
[x]: plane brushes should give you the option of projecting to the center surface normal or the view normal,
     default to the view normal.
     (brush.planeNormalMode enum, default VIEW; resolvePlaneDabNormal in
     scripts/brush/brush_enums.ts swaps the normal handed to execProgram for
     Clay/Scrape/Fill — TS-only, the plane.sbrush kernel just reads ctx.surfaceNo.
     Exposed in the sculptcore tool panel; guarded by tests/unit/plane_normal.test.ts;
     see documentation/brush-notes.md "Plane brushes")
[x]: make sure sculpt mask painting is implemented and works
[x]: make sure all sculptcore SculptTool enum entries have icons, create if necassary
     (added SCULPT_MASK_PAINT/COLOR/POLYGROUP/BSMOOTH/HOLE_FILLER/DIRECTIONAL_FAIR, indices
     120-125 in iconsheet.svg row 7; guarded by tests/unit/sculpt_tool_icons.test.ts)
[x]: smoothing brushes should have accumulate on by default
[x]: all smoothing (dyntopo tangential smoothing, the smoothing brush, etc) must be boundary-aware; 
     the bsmooth brush should replace the smooth brush.
     (TS-only routing: TOOL_TO_SCULPTBRUSH maps SculptTools.SMOOTH → SculptBrushes.BSMOOTH and the
     standalone BSMOOTH tool entry is removed, so the SMOOTH tool IS the boundary-aware bsmooth kernel;
     buildBrushProgram's autosmooth command now chains BSMOOTH too. bsmooth reduces to a plain Laplacian
     with no boundaries marked, so it's a transparent drop-in. Dyntopo tangential smoothing was already
     boundary-aware (smoothTangent skips boundary/non-manifold edges + the caller pins feature verts in
     dyntopo.h). Guarded by a new SMOOTH-stroke case in sculptcore_boundary.test.ts (constraint graph
     byte-for-byte unchanged, both backends) plus the existing smooth/autosmooth/invert cases in
     sculptcore_brushes.test.ts. See documentation/brush-notes.md "Boundary-aware smoothing".)
[x]: the brush invert flag isn't respected.  it should invert strength for most brushes (except for smooth brushes).
[x]: there is a longstanding bug where faces randomly don't draw, could be a gpu spatial node isn't being batched properly.  hard to reproduce.
     (root cause: SpatialTree::update_gpu_node_slice was called from a parallel_for, and its
     fallback paths (attr-version / slice-not-found / vcount mismatch) called regen_gpu_node —
     which disposes+reallocates the node's shared GpuData (pos/nor/attrBufs/cmd/slices). Two
     worker threads regenning the same GPU owner concurrently could leave it with a null pos
     buffer, which the draw-batch rebuild silently skips (if (!gpu_data->pos) continue) → that
     node's faces vanish for the frame. Rare triggers = "random / hard to reproduce". Fix
     (sculptcore source/spatial/spatial_gpu.cc + spatial.cc): update_gpu_node_slice is now pure
     — it writes only its own disjoint slice + its own leaf flag, never regens and never touches
     the owner-level update_buffer flags, returning false when an in-place update isn't possible.
     The serial pass after the parallel_for flags each touched owner's buffers for re-upload and
     regen_gpu_node's (deduped per owner) any owner whose slice update returned false. Verified:
     native+node+wasm rebuilt; sculptcore_parity (both backends), sculptcore_boundary +
     sculptcore_brushes (56), and native test_spatial_gpu_partition/_dyntopo/_merge/test_live_stroke
     all pass. See sculptcore/documentation/spatial.md "Update lifecycle".)
[x]: using the bsmooth brush with dyntopo on a mesh with polygroups crashes after a few strokes
     (same root cause as the meshlog item below — MeshLog::setActiveMesh was never called on the
     app path, so dyntopo topology changes went unlogged and undo/redo replayed against drifted
     topology. Fixed in CommandExecutor::applyDynTopoDab (sculptcore d5fdab5); stress-verified
     4 polygroup patches + 8 bsmooth dyntopo strokes with interleaved undo/redo over group
     boundaries, both backends, group count stable. CPU command path; GPU dab path untested here.)
[x]: expose the kelvinlet brush to the user as a SculptTool (make sure it has an icon)
     (TS-only: SculptTools.KELVINLET → SculptBrushes.KELVINLET in TOOL_TO_SCULPTBRUSH;
     hand-authored SCULPT_KELVINLET glyph (icon 126) in assets/iconsheet.svg. Grab-style:
     applyGrabDabState writes bound grabFrom/grabTo (force point + per-dab displacement)
     before execProgram, shared by the interactive op and runSculptcoreStroke. Verified on
     both backends by the new kelvinlet case in sculptcore_brushes.test.ts. See
     documentation/brush-notes.md "Grab brushes (kelvinlet)".)
[x]: write 'snake hook' and 'grab' brushes and expose to the user.
     (new grab.sbrush + snakehook.sbrush kernels (SculptBrushes::GRAB=16/SNAKEHOOK=17,
     wired in types.h/all.h/brush_executor.h); grab = direct translation by grabTo,
     snakehook = drag + gather toward the advancing center. Both reuse the already-bound
     grabFrom/grabTo (no new Brush fields) and the applyGrabDabState/isGrabTool path
     added for kelvinlet. Mapped SculptTools.GRAB/SNAKE in TOOL_TO_SCULPTBRUSH; icons
     SCULPT_GRAB/SCULPT_SNAKE already existed. Verified on both backends by new
     grab/snakehook cases in sculptcore_brushes.test.ts. See documentation/brush-notes.md
     "Grab brushes (kelvinlet / grab / snakehook)".)
[x]: meshlog undo/redo sometimes crashes
     (root cause: the TS app path never called MeshLog::setActiveMesh, so topo callbacks
     no-op'd — undo restored positions but never topology; dyntopo undo/redo was replaying
     position chunks against drifted topology. Fixed in CommandExecutor::applyDynTopoDab;
     stress-verified 10 dyntopo strokes + 46 mixed undo/redos incl. redo-branch truncation,
     both backends, identical final stats.)
[x]: the draw sharp brush is far too strong and explodes geometry
[x]: inflate brush should have accumulate on by default
[x]: clay brush should have accumulate on by default
[x]: make sure autosmoothing works.  it should use the brush command pipeline; fix any issues in the pipeline so it can work for both cpu and gpu backends.
     (already pipeline-driven: buildBrushProgram appends a SMOOTH command (strength=brush.autosmooth,
     invert pinned false) when brush.autosmooth>0; execProgram re-snapshots co_prev per command so
     SMOOTH flattens the just-deformed surface, and builSculptcoreBrush sets CSR ring-1 neighbor mode.
     No TS-side smoothing — the shared executor means both backends (and future WGSL dispatch) run the
     same command list. Verified end-to-end by the new autosmooth case in sculptcore_brushes.test.ts,
     both backends bit-identical: a pure DRAW has ~0 perpendicular displacement, autosmooth drives
     meanPerp clearly positive. See documentation/brush-notes.md "Composite brushes / autosmooth".)
[x]: the add menu in the electron/web apps shows `litemesh.add_cube(dimen=100)` instead of the toolop's ui name.  fix it.
[x]: ui related to quad remeshing should be hidden if the quad remeshing feature flag is disabled.
     (header button was already gated; gated the settings toolPanel + QuadRemeshLiteMeshOp.canRun
     hides it from op search; FeatureFlags now a debug-surface window global; verified headlessly
     on/off/restored)
[x]: uv marking tool should clear it's drawlines after finishing/cancelling.  it should preview the
     current path and should snap to existing vertices with seams (with 10 pixel radius) showing a circle
     at the mouse cursor during preview when a snap is happening.
     (MarkEdgePathBaseOp.modalEnd calls view3d.resetDrawLines on both finish and cancel; on_pointermove
     previews the next shortest-path segment; _snapVert snaps the endpoint to a featureVerts(kind) vertex
     within SNAP_PX=10, and _snapRingLines draws a billboarded white view-plane ring at the cursor while
     a snap is active. See documentation/feature-marking.md.)
[x]: need an overlay mode for uv seams and marked sharp.
     (already present and now documented: SpatialTree::buildSeamBatch draws every boundary-flagged edge
     in a distinct color — seam orange, sharp cyan, projected green, polygroup magenta, uvchart yellow —
     gated by the sculptcore toolmode's drawFeatureOverlay property (default on, "Feature Overlay"
     checkbox in the header; change handler calls markSeamsDirty). See documentation/feature-marking.md.)
[x]: uv marking tool should be refactored into a base class, which can also be used to mark edge sharp flag.
     (abstract MarkEdgePathBaseOp holds all interaction/snap/undo; concrete MarkSeamInteractiveOp (kind 0,
     EDGE_SEAM, orange, Icons.MARK_SEAM, hotkey K) and MarkSharpInteractiveOp (kind 1, EDGE_SHARP, cyan,
     Icons.MARK_SHARP, hotkey Shift+K) supply only _kind() + colors. One kind-parameterized C++/TS engine
     path: Mesh::markEdgePath/edgeFlagKind/setEdgeFlagKind/featureVerts + LiteMesh wrappers + restoreEdgeFlags.
     New MARK_SEAM(127)/MARK_SHARP(128) icons in iconsheet.svg. Sharp tool added to the sculptcore header +
     keymap. Guarded by new sharp-marking cases in sculptcore_boundary.test.ts (both backends, 28 pass).
     See documentation/feature-marking.md.)
