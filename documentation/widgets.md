# Widgets

Widgets are 3D UX elements.  They are stored per scene (not viewport)
in ctx.scene.widgets (an instanceof WidgetManager).

There are several levels of widget classes.  WidgetBase is the base class.
On top of that is WidgetTool for widgets tied to specific ToolOp
operators.  On top of that is ToolMode, which is a much more general system
mostly unrelated to the widget API but uses the same underlying event system.


  