[ ]: in the TS app toggling SHOW_RENDER on and back off again breaks webgpu state
[ ]: the default scene builder should create a scene with a litemesh sphere of size 4 and dimen 50
     and switch to the sculptcore toolmode.
[ ]: fold the settings editor's tabs into panels in PropsEditor's settings tab,
     except for the theme tab.  that will stay in settings editor, which will be renamed
     to theme editor.
[ ]: the old sculpt mode icon still appears in the toolmode header toolbar in the viewport
     even when it's addon is disabled.  it should not.
[x]: only the mesh and sculptcore addons should be enabled by default.
[ ]: changing parameters in AddLiteMeshCubeOp in the last command panel causes the mesh
     to disappear.  you can reproduce this with:
     `CTX.api.execTool(CTX, 'litemesh.add_cube')` wait for a redraw, then `CTX.toolstack.head.inputs.size.setValue(2); CTX.toolstack.rerun()`
[x]: make an icon for BrushFlags.SQUARE
[x]: sharp brush should have invert flag set by default.
[x]: default autosave interval should be 1 minute
[x]: add a 'load last autosave' to the file menu. 
[x]: make sure autosave properly restores an _appstate.fileHandle that points to the autosave's original file path.  this is possible on electron but may not be possible on web.
[x]: the snake hook is snapping to the surface normal plane it should use the view plane 
[x]: make the grab brush behave like blender's grab brush.
[ ]: add an overlay for drawing sculpt masks, should be enabled by default
[ ]: enable the poly group overlay draw by default
[x]: Add a 'rebuild spatial tree' button to litemesh's obdata tab
[x]: Create a fuzz integration test for the electron app.  it works by randomly selecting a brush tool
     (that's valid for sculptcore) executing a random sculpt stroke, with a 1/5 change of either disabling or enabling dyntopo.  it should wait for redraw after every stroke, and should write some sort of log of what it did for re-executability.  the fuzz test should have some kind of option to control how long it runs.  there is a very intermittent dyntopo crash see if this can
     reproduce it.
[x]: change poly brush so ctrl extends the current brush, and shift instead invokes the smooth brush
     but with projection = 1.0.
[ ]: the edges drawn around poly groups should be updated after each dab if enabled, and they should be
     an option that's off by default.
[x]: the smooth brush should not default to have brush dynamics on its strength on, and it's default strength should be 1.
[x]: add a new toolop to mark edges sharp automatically by face angle and create an icon in the 
     viewport header for it.
[ ]: triangulate is still breaking poly group overlay draw
[x]: kelvinlet brush is also using the surface normal plane it should not
[ ]: kelvinlet brush is behaving like the snake hook for some reason not a kelvinlet grab
[x]: change the default dyntopo max rounds to 5
[ ]: examples/crash2.wproj (which is in the sculptcore toolmode) crashes after a few strokes
[ ]: drawing with mirror on doesn't apply dyntopo in the mirror dabs it should
[ ]: when drawing with mirror the mirrored stroke often seems to have a bit more strength
     then the current one


