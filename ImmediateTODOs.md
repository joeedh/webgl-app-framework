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
[ ]: all smoothing (dyntopo tangential smoothing, the smoothing brush, etc) must be boundary-aware; 
     the bsmooth brush should replace the smooth brush.
[x]: the brush invert flag isn't respected.  it should invert strength for most brushes (except for smooth brushes).
[ ]: there is a longstanding bug where faces randomly don't draw, could be a gpu spatial node isn't being batched properly.  hard to reproduce.
[x]: using the bsmooth brush with dyntopo on a mesh with polygroups crashes after a few strokes
     (same root cause as the meshlog item below — MeshLog::setActiveMesh was never called on the
     app path, so dyntopo topology changes went unlogged and undo/redo replayed against drifted
     topology. Fixed in CommandExecutor::applyDynTopoDab (sculptcore d5fdab5); stress-verified
     4 polygroup patches + 8 bsmooth dyntopo strokes with interleaved undo/redo over group
     boundaries, both backends, group count stable. CPU command path; GPU dab path untested here.)
[ ]: expose the kelvinlet brush to the user as a SculptTool (make sure it has an icon)
[ ]: write 'snake hook' and 'grab' brushes and expose to the user.
[x]: meshlog undo/redo sometimes crashes
     (root cause: the TS app path never called MeshLog::setActiveMesh, so topo callbacks
     no-op'd — undo restored positions but never topology; dyntopo undo/redo was replaying
     position chunks against drifted topology. Fixed in CommandExecutor::applyDynTopoDab;
     stress-verified 10 dyntopo strokes + 46 mixed undo/redos incl. redo-branch truncation,
     both backends, identical final stats.)
[x]: the draw sharp brush is far too strong and explodes geometry
[x]: inflate brush should have accumulate on by default
[x]: clay brush should have accumulate on by default
[ ]: make sure autosmoothing works.  it should use the brush command pipeline; fix any issues in the pipeline so it can work for both cpu and gpu backends.
[x]: the add menu in the electron/web apps shows `litemesh.add_cube(dimen=100)` instead of the toolop's ui name.  fix it.
[x]: ui related to quad remeshing should be hidden if the quad remeshing feature flag is disabled.
     (header button was already gated; gated the settings toolPanel + QuadRemeshLiteMeshOp.canRun
     hides it from op search; FeatureFlags now a debug-surface window global; verified headlessly
     on/off/restored)
[ ]: uv marking tool should clear it's drawlines after finishing/cancelling.  it should preview the
     current path and should snap to existing vertices with seams (with 10 pixel radius) showing a circle
     at the mouse cursor during preview when a snap is happening.
[ ]: need an overlay mode for uv seams and marked sharp.
[ ]: uv marking tool should be refactored into a base class, which can also be used to mark edge sharp flag.
