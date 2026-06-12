Make sure to keep CLAUDE.md and documentation up to date as you implement each item.

[ ]: Only show SculptTools enum icons that are implemented by sculptcore in the header ui (in sculptcore toolmode).
[ ]: Write electron app integration tests for the boundary constraint system.  we need a way to
     compute the connected polyline graph of the boundary constraints on a mesh do a few brush strokes with and
     without dyntopo on and then check if the polyline graph has changed by counting the number of non-2-valence vertices.  also test undo/redo.
[x]: Pipe brush.color to the paint brush
[x]: Create 'pnpm configure-all':
   - in sculptcore: node make.mjs configure && node make.mjs.configure native
[x]: Create 'pnpm build-all':
   - in sculptcore: node make.mjs codegen && node make.mjs build && node make.mjs build native && node make.mjs node
   - in main repo: pnpm build
[ ]: port SettingsEditor.js to typescript then implement a feature flags UI as a tab in it.
[ ]: implement the undo memory size calculation for sculptcore's toolops, then make sure the maximum undo memory limit works and is exposed in the settings editor.
[ ]: plane brushes should give you the option of projecting to the center surface normal or the view normal,
     default to the view normal.
[x]: make sure sculpt mask painting is implemented and works
[ ]: make sure all sculptcore SculptTool enum entries have icons, create if necassary
[x]: smoothing brushes should have accumulate on by default
[ ]: all smoothing (dyntopo tangential smoothing, the smoothing brush, etc) must be boundary-aware; 
     the bsmooth brush should replace the smooth brush.
[x]: the brush invert flag isn't respected.  it should invert strength for most brushes (except for smooth brushes).
[ ]: there is a longstanding bug where faces randomly don't draw, could be a gpu spatial node isn't being batched properly.  hard to reproduce.
[ ]: using the bsmooth brush with dyntopo on a mesh with polygroups crashes after a few strokes
[ ]: expose the kelvinlet brush to the user as a SculptTool (make sure it has an icon)
[ ]: write 'snake hook' and 'grab' brushes and expose to the user.
[ ]: meshlog undo/redo sometimes crashes
[x]: the draw sharp brush is far too strong and explodes geometry
[x]: inflate brush should have accumulate on by default
[x]: clay brush should have accumulate on by default
[ ]: make sure autosmoothing works.  it should use the brush command pipeline; fix any issues in the pipeline so it can work for both cpu and gpu backends.
[x]: the add menu in the electron/web apps shows `litemesh.add_cube(dimen=100)` instead of the toolop's ui name.  fix it.
[ ]: ui related to quad remeshing should be hidden if the quad remeshing feature flag is disabled.
[ ]: uv marking tool should clear it's drawlines after finishing/cancelling.  it should preview the
     current path and should snap to existing vertices with seams (with 10 pixel radius) showing a circle
     at the mouse cursor during preview when a snap is happening.
[ ]: need an overlay mode for uv seams and marked sharp.
[ ]: uv marking tool should be refactored into a base class, which can also be used to mark edge sharp flag.
