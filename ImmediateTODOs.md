[x]: Make sure pressing shift temporarily switches to the smooth brush in the TS app
[x]: Pressing shift should temporarily switch to smooth in the native debug app
[x]: The kelvinlet brush appears to be broken, it's extremely slow and can crash the TS app.
[x]: The smooth brush should support a 'projection' parameter that projects vertices
     to their normal planes during smoothing to prevent volume shrinkage ('projection'
	 is a scaling factor for this projection) and it should be wired to the projection
	 brush parameter in the TS app.
[x]: implement a 'grab' brush (like blender's sculpt grab brush) and expose it to the TS app
[x]: implement a 'snake hook' brush (like blender's sculpt snake hook brush) and expose it to the TS app
[x]: the sharp brush is broken, it's not applying positive displacement.  also make sure the 
TS app's pinch brush setting is wired to sculptcore properly (for all brushes that need it,
e.g. the pinch brush too).
[x]: make sure the dyntopo defaults on the TS side are correct (I think it's DynTopoParamsSC?)
[x]: implement a color smoothing brush that averages vertex colors across neighbors
[x]: the extend mode of the poly brush is broken in the TS app
[x]: dyntopo often crashes after a number of strokes, especially if there are uv seams or poly groups
     etc.  reproduce with file example/crash.wproj .  note: that file may not have the proper attribute setup; if it doesn't see if you can have sculptcore's deserialzation code 
     detect and fix it.
[x]: dyntopo undo is broken for the poly brush it mangles the groups
[x]: dyntopo undo also mangles the color brush though to a much less extent then the poly brush
[x]: pressing ctrl and clicking in the color brush (in the TS app) should sample the mesh 
     color under the mouse
[x]: in the TS app add an icon below the primary and seconday colors to swap them (create an appropriate icon).
[x]: smooth brushes should iterate up to 4 times depending on strength, strength at 0
     is 0 iterations and strength at 2 is 4.
[x]: create an icon for the reprojectCustomData icon button in the sculptcore viewport header
     (data path scene.tools.sculptmode.reprojectCustomData).
[x]: add a toolop to the TS app that exposes SpatialTree::applyReorder, and add a button to
     invoke it to litemesh's obdata properties tab.  it should properly deal with meshlog.
[x]: trianguating a mesh either drops poly groups or breaks drawing overlays of them
[x]: dyntopo should execute at an independent spacing from brush dabs; it should have its 
     own spacing paramter exposed to the user (and wired into the TS app).  it should default
     to 0.25
