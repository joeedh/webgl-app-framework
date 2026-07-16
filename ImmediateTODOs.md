## UI stuff
[ ]: in TS app make vert/face/edge selection mode buttons in 
     sculptcore modeling mode behave like an enum, and only 
	 combines modes when holding shift (so clicking 'face' 
	 should switch to just face mode, clicking it against 
	 should *not* clear the bit, etc).

## Select Similar:
Implement the core functionality as utility methods inside 
sculptcore then expose as TS toolops to the TS app. Most
methods should have some sort of threshold parameter
for suzzy selection.

The TS toolops should be exposed to the user via a menu that's 
popped up on 'shift-g' and populated with the tools for the 
enabled selection modes.

### Vertex Mode Select Similar:
[ ]: Similar normal
[ ]: Face count
[ ]: Edge count

### Edge Mode Select Similar:
[ ]: Length
[ ]: Direction
[ ]: Face count
[ ]: Face angles
[ ]: Poly groups

### Face Mode Select similar
[ ]: Area
[ ]: Materal
[ ]: Edge Count
[ ]: Normal
[ ]: Coplanar
[ ]: Flat vs smooth shading state
[ ]: Poly groups

## Other Stuff
[ ]: A toolop where the user clicks a face and extrude region is 
     invoked on all the faces with the same poly group.  Exposed as 
	 an icon in sculptcore's header.
[ ]: Fix shift-f setting of radius in sculptcore toolmode
[ ]: Give brush radius datapath property a bigger step size and 
     more aggressive slider exponent.
[ ]: Support world space brush radius mode.  Primary (non-symmetry) brush dabs
     should keep track of the last valid world and screen space radii, to be used
	 when switching modes.
[ ]: Support assigning materials to selected faces in modelling mode.  Button should live
     in material tab in properties editor.
[ ]: Support assiging materials in sculptcore mode by clicking a face, then
     all faces with the same polygroup gets the same material.  Button should also live in
	 material tab in properties editor.
[ ]: Create a toolmode callback for toolmodes to extend the material tab in the properties
     editor and use it for the prior two items.

[ ]: Expose brush texture settings in the TS app, make sure assigning an image works 
     and drive an nwjs test of stroking with a brush texture.  Also make sure textures 
	 for color paint brushes work (they should read the texture color and multiply by
	 the brush color).
[ ]: Create a standard set of color mix modes for the color paint brush (e.g. mix, multiply,
     difference, screen, overlay, etc).



