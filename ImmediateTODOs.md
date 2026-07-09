## Viewport draw stuff

[ ]: Move scripts/editors/view3d/drawmode.ts to scripst/sceneobject/drawmode.ts
[ ]: Make sure SceneObject has .drawMode and .drawFlag members (make sure to add to
     defineAPI, the nstructjs script, and the copyTo method, etc).
[ ]: Implement DrawModes semantics for litemesh
[ ]: Add panel in Object tab in the properties editor to configure drawmode and drawflags
[ ]: Make sure litemeshes with textures and uv maps draws properly:
   - test scene is a litemesh with a uvmap and a material shader graph with a valid image node
     wired in.  you can create a test image with a test grid via the toolop:
     `datalib.default_new(blockType="image" dataPathToSet="imageEditor.imageUser.image")`
   - textures should draw properly in render mode
   - textures should also draw in nonrender mode, the first image node in the shader graph should
     be used (see node_selectops.ts:170, nodes are reordered when users click them to create a 
     kind of per-node-type active node state)

## Others

[ ]: Reproject UVs and colors appears to not be working (at least for colors)
[ ]: Make sure litemesh's add cube toolop
[ ]: Add a selection draw overlay to the object toolmode
[ ]: Do not use the native modal alert system for autosave (it blocks devtools), use something
     else to drive the popup.
[ ]: Make sure the default autosave interval is not greater then 1 minute.
[ ]: Audit the code comments and documentation/CLAUDE.md touched by the recent
     sculpt layers vdm displacement and multires commits.
[ ]: The logic used to calculate meshlog undo step memory consumption appears to be incorrect,
     dyntopo meshlog seems to not be properly freeing steps to hit the undo limit.
[ ]: Vertex picking is broken for a simple litemesh cube created with with 'litemesh.add_cube(dimen=2)'
[ ]: Create a dockable panel in the view3d editor with a last command widget (see the last command tab
     in the properties editor), using the new path.ux dockable panel system.
[ ]: Sculpting a litemesh object with a non-identity transform (e.g. scale and rotation)
     is totally broken.

## Litemesh add shape toolops
[ ]: Add an add_plane toolop that makes a 1x1 plane facing the z axis

## Renderengine bugs

[ ]: Subsurface scattering node is broken

## Sculpt layers

[ ]: When creating a new layer it should be set to active
[ ]: When 'edit target' is enabled the 'enabled' button should be
     disabled
[ ]: Litemesh's obdata tab should be regenerated when relevent feature flags change (e.g sculpt layers)
