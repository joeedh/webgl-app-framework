## UI stuff
[x]: in TS app make vert/face/edge selection mode buttons in 
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

DONE: Select Similar implemented as Mesh::selectSimilar (one C++ gather dispatch,
      criterion implies domain) + litemesh.select_similar ToolOp (seeded from the
      active element, Blender-style) + a shift-G popup menu in BoxModelToolMode
      that lists the criteria for the enabled selection modes. Verified end to end
      headlessly (tests/integration/sculptcore_selectsimilar.test.ts, 5/5 wasm):
      FACE_MATERIAL count matches an independent faceMaterial() count, FACE_SIDES
      selects every quad, VERT_EDGES isolates the 8 valence-distinct cube corners,
      selection undoes. threshold input: fraction for AREA/LENGTH, radians for
      NORMAL/DIRECTION/DIHEDRAL/COPLANAR, ignored for exact-match criteria.

### Vertex Mode Select Similar:
[x]: Similar normal    (VERT_NORMAL, angle threshold)
[x]: Face count        (VERT_FACES)
[x]: Edge count        (VERT_EDGES = valence)

### Edge Mode Select Similar:
[x]: Length            (EDGE_LENGTH, relative threshold)
[x]: Direction         (EDGE_DIRECTION, undirected angle)
[x]: Face count        (EDGE_FACES)
[x]: Face angles       (EDGE_DIHEDRAL, angle threshold)
[ ]: Poly groups       (DEFERRED: edges have no group attr; semantics ambiguous --
                        select edges whose incident faces share the seed's group?
                        needs a decision before implementing)

### Face Mode Select similar
[x]: Area              (FACE_AREA, relative threshold)
[x]: Materal           (FACE_MATERIAL -- per-face material attr now exists)
[x]: Edge Count        (FACE_SIDES = corner count)
[x]: Normal            (FACE_NORMAL, angle threshold)
[x]: Coplanar          (FACE_COPLANAR = normal angle + in-plane distance)
[ ]: Flat vs smooth shading state  (BLOCKED: no per-face smooth/flat attr yet)
[x]: Poly groups       (FACE_GROUP)

## Other Stuff
[x]: A toolop where the user clicks a face and extrude region is 
     invoked on all the faces with the same poly group.  Exposed as 
	 an icon in sculptcore's header.
     (litemesh.extrude_polygroup = macro [select_polygroup, extrude_region,
      translate]; backed by the new C++ Mesh::facesInGroup. NOT yet verified
      against a mesh that actually has painted poly groups -- see below.)
[x]: Fix shift-f setting of radius in sculptcore toolmode
     (SetBrushRadius wrote sharedBrushRadius to a hardcoded `bvh` toolmode
      while sculptcore read its own; undoPre also captured the wrong value)
[x]: Give brush radius datapath property a bigger step size and 
     more aggressive slider exponent.
[x]: Support world space brush radius mode.  Primary (non-symmetry) brush dabs
     should keep track of the last valid world and screen space radii, to be used
	 when switching modes.
     (SculptBrush.radiusMode + resolveWorldRadius; brush.set_radius_mode converts
      through the tracked radii. Note pbvh's own dab path does not honour
      radiusMode -- it never populates the tracked radii. See
      documentation/plans/2026-07-16-1530-world-space-brush-radius.md)
NOTE: the per-face material attr now exists (int16 "material" face attr indexing
      SceneObjectData.materials). See documentation/plans/2026-07-16-1700-per-face-material-attribute.md.
      Steps 1-3 below are done; the VIEWPORT STILL DRAWS SLOT 0 EVERYWHERE --
      assignment is authored/persisted but not previewed until step 4 (the
      renderer), which is the real project.
      Step 4a (the measurement that gates step 4) is DONE: realistic material
      layouts cost 1.55-1.92x draw commands (82 -> 127-157 on 1.5M tris), under
      the 246 that profile at 2.0ms/frame -> step 4 is tractable, no per-node
      material cap needed. BUT that is a lower bound requiring same-slot geometry
      to merge across leaves; a per-(leaf x slot) draw costs 1223+ commands
      (40-71ms regime). Preferred design: split mixed leaves at assign time
      (81-89% of leaves are already single-slot). The pipeline/render-bundle cost
      is still unmeasured and could dominate.
      See documentation/research/2026-07-16-2250-material-draw-split-measurement.md.
[x]: Support assigning materials to selected faces in modelling mode.  Button should live
     in material tab in properties editor.
     (litemesh.assign_material; boxmodel contributes the button)
[x]: Support assiging materials in sculptcore mode by clicking a face, then
     all faces with the same polygroup gets the same material.  Button should also live in
	 material tab in properties editor.
     (litemesh.assign_material_polygroup; sculptcore contributes the button)
[x]: Create a toolmode callback for toolmodes to extend the material tab in the properties
     editor and use it for the prior two items.
     (ToolMode.buildMaterialPanel(container, slot), called from MaterialPanel.rebuild)

[ ]: Expose brush texture settings in the TS app, make sure assigning an image works 
     and drive an nwjs test of stroking with a brush texture.  Also make sure textures 
	 for color paint brushes work (they should read the texture color and multiply by
	 the brush color).
[x]: Create a standard set of color mix modes for the color paint brush (e.g. mix, multiply,
     difference, screen, overlay, etc).
     (9 modes MIX/MULTIPLY/SCREEN/OVERLAY/DIFFERENCE/ADD/SUBTRACT/DARKEN/LIGHTEN in
      color.sbrush `mixMode` switch; SculptBrush.colorMixMode enum prop marshaled via
      configureToolUniforms; Brush::mixMode uniform. Required fixing DSL vector-component
      access (.x/.y/.z) in the sbrush C++ backend -- emit_cpp now lowers a proven vector
      swizzle to litestl Vec operator[]. Verified end to end:
      tests/integration/sculptcore_colormix.test.ts, 5/5 wasm.)



