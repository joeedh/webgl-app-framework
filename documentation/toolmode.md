# Tool Modes

Make sure to read [widgets](widgets.html) page first.

Tool modes are the highest level of 3D UX controllers.  They
create and manage 3D widgets, generate keymaps, and can even
hook into scene object drawing.  They are subclassed from WidgetTool
to hook into the 3D widget event system. 

Unlike other UX classes, tool modes are stored within the object
model and can save data to project files.  This is why tool modes
are stored in ctx.scene.toolmodes and not simply in ctx.scene.widgets
(which is not saved).   

This is necessary to support undo since the undo system works exclusively with
the object model.

# Measure ToolMode

Measurement toolmodes are subclassed from scripts/editors/view3d/tools/measuretool.js:MeasureToolBase.

