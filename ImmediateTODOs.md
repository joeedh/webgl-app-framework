## Viewport draw stuff

[x]: Move scripts/editors/view3d/drawmode.ts to scripst/sceneobject/drawmode.ts
[x]: Make sure SceneObject has .drawMode and .drawFlag members (make sure to add to
     defineAPI, the nstructjs script, and the copyTo method, etc).
[x]: Implement DrawModes semantics for litemesh
[x]: Add panel in Object tab in the properties editor to configure drawmode and drawflags
[x]: Make sure litemeshes with textures and uv maps draws properly:
   - test scene is a litemesh with a uvmap and a material shader graph with a valid image node
     wired in.  you can create a test image with a test grid via the toolop:
     `datalib.default_new(blockType="image" dataPathToSet="imageEditor.imageUser.image")`
   - textures should draw properly in render mode
   - textures should also draw in nonrender mode, the first image node in the shader graph should
     be used (see node_selectops.ts:170, nodes are reordered when users click them to create a 
     kind of per-node-type active node state)

## Others

[x]: Reproject UVs and colors appears to not be working (at least for colors)
     (pbvh path fixed: normals-snapshot bug + border-vert ray miss aborting the
      whole pass. NOTE: the sculptcore toolmode's reprojectCustomData checkbox
      remains unwired — attribute reprojection doesn't exist in the sculptcore
      engine yet; that is a standalone engine feature.)
[x]: Make sure litemesh's add cube toolop
[x]: Add a selection draw overlay to the object toolmode
[x]: Do not use the native modal alert system for autosave (it blocks devtools), use something
     else to drive the popup.
[x]: Make sure the default autosave interval is not greater then 1 minute.
[x]: Audit the code comments and documentation/CLAUDE.md touched by the recent
     sculpt layers vdm displacement and multires commits.
[x]: The logic used to calculate meshlog undo step memory consumption appears to be incorrect,
     dyntopo meshlog seems to not be properly freeing steps to hit the undo limit.
[x]: Vertex picking is broken for a simple litemesh cube created with with 'litemesh.add_cube(dimen=2)'
[x]: Create a dockable panel in the view3d editor with a last command widget (see the last command tab
     in the properties editor), using the new path.ux dockable panel system.
[x]: Sculpting a litemesh object with a non-identity transform (e.g. scale and rotation)
     is totally broken.
     (root cause: stroke driver composed the local→clip matrix in the wrong
      order — path.ux multiply applies its argument first — plus directions
      pushed through translating matrices. The same wrong composition existed
      in every litemesh picking helper; all fixed.)

## Litemesh add shape toolops
[x]: Add an add_plane toolop that makes a 1x1 plane facing the z axis

## Renderengine bugs

[x]: Subsurface scattering node is broken
     (fixed: WebGPUBatchExecutor.setColorFormats could not grow/shrink its
      color-target list, so the LiteMesh sculpt-batch pipeline stayed
      single-target inside the 3-attachment SSS MRT BasePass — Dawn rejected
      the draw and the whole frame submit went invalid. batch.ts now resizes
      targets to the pass and pads unwritten attachments with writeMask 0.)

## Sculpt layers

[x]: When creating a new layer it should be set to active
[x]: When 'edit target' is enabled the 'enabled' button should be
     disabled
[x]: Litemesh's obdata tab should be regenerated when relevent feature flags change (e.g sculpt layers)
