## Sculptcore toolmode:

[x]: Add icon for feature align brush
[x]: drawWireframe wireframe isn't updated during sculpt strokes (or at all)
     (rebuilds at stroke end + undo/redo; per-dab rebuild stays a non-goal —
     it would thaw frozen topology mid-stroke and is O(all edges))

## Box modeling toolmode
[x]: circle select should draw a brush circle.
[x]: select all/none should apply to all element domains not just the active selection mode.
[x]: Loopcut should show an interactive preview.
[x]: Extrude individual faces crashes.
[x]: boxmodel's drawPoints option should only apply if vertex selection mode is enabled.
[x]: the element under the mouse should be highlighted (respecting selection modes) when
     the user hovers over them.
[x]: implement left click selection (select closest element in enabled selection mode 
     to mouse cursor).
[x]: implement edge loop select (invoked by holding CTRL and selecting an edge)
[x]: implement face loop select (invoked by holding CTRL and selecting a face)
[x]: implement face loop edge select (selects all the edges in between the faces of
     a face loop, invoke with ctrl-shift-select-edge)
[x]: Extrude wire crashes
[x]: Inset faces crashes
[x]: Extrude region crashes
     (all four crash reports were one bug: the draw path destroyed the
     leaf-bounds treeBatch on a spatial flush but kept the stale handle when
     the BVH overlay was off; the next topology op / undo double-freed it)
[x]: Pattern-based subdivide is either not being invoked by 
     box modelling toolmode's subdivide op or just doesn't work.
     (vertex-mode selections found no edges/faces; fixed by selectFlush)
[x]: Implement the plan at documentation/plans/selectFlush.md
