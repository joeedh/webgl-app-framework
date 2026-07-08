## Viewport draw stuff:
[ ]: Move scripts/editors/view3d/drawmode.ts to scripst/sceneobject/drawmode.ts
[ ]: Make sure SceneObject has .drawMode and .drawFlag members (make sure to add to 
     defineAPI, the nstructjs script, and the copyTo method, etc).
[ ]: Implement DrawModes semantics for litemesh
[ ]: Add panel in Object tab in the properties editor to configure drawmode and drawflags

## Others
[ ]: Reproject UVs and colors appears to not be working (at least for colors)
[ ]: Make sure litemesh's add cube toolop 
[ ]: Add a selection draw overlay to the object toolmode
[ ]: Do not use the native modal alert system for autosave (it blocks devtools), use something 
     else to drive the popup.

## Renderengine bugs
[ ]: Subsurface scattering node is broken
