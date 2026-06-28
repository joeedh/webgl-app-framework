We need to create a system to implement more traditional box modeling tools
for sculptcore meshes.  We should minimize the amount of code written on
the TS side (note though we will make a new view3d toolmode for it).


## Modelling Tools

Tools we need (items marked with T should invoke a modal transform after the tool):

* Extrude connected face regions - T
* Inset connected face regions - T
* Extrude wire vertices (duplicates vertices and creates wires with original ones). - T
* Extrude faces individually (without merging into regions) - T
* There are a number of tools derived from an "edge split" operation that split faces
  into disconnected regions:
  * Bevel/chamfer - T
  * We could implement the extrude tools this way
  * Split selected faces off of the mesh - T (translate)
* Edge/Face loop based tools (make sure to implement generic loop utilities):
  * Split face loop (with arbitrary number of cuts)
* Pattern-based subdivision of triangles and quads (blender style)

## Selection tools

We also have to deal with selection.  Selection will be done with bool attrs per element domain
as a new attribute category, 'select'.  Users will be able to choose which element domains selection
tools operate on, this should be presented as blender-style selection modes (vertex, face, edge)
where selecting multiple modes can be done by holding shift when clicking the selection mode icons.

Notes:

* There will be one logically "active" element per domain, this is separate from selection but related
  to it.  Exactly how to store this is an open question.  The active vertex is stored in meshlog and is
  properly restored in undo/redo.
* Most selection tools will have an 'xray' mode that doesn't clip to the mesh.
* Selection is *not* reset for most tools, consequently 'shift' does not extend selection as in many
  other apps, it instead deselects (so not holding shift selects, holding shift deselects).
* Selection is undoable

Selection tools needed:

* Select element closest to mouse cursor within a given screen space radius.  Will require implementing cone and cylinder tracing in the spatial tree if they don't exist already.
* Select all/none/auto (where auto chooses 'all' if nothing is selected otherwise 'none')
* Select inside a box drawn by the user
* Circle selection 'brush'
* Select shortest path from active vertex (the final vertex becomes the new active one).

## Drawing

We will need a number of drawing overlays, all of which should respect
the current xray setting. 

* Elements in the current selection mode should highlight when the user 
  mouses over them
* Billboard points for vertices
* Selected/active vertices/edges/faces/etc should be drawn in the appropriate colors
* Wireframe overlay that draws a wireframe over the mesh similar to glPolygonOffset 
  (but respects xray too).

