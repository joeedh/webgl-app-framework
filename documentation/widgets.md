

<!-- toc -->

- [Widgets](#widgets)
<!-- regenerate with pnpm markdown-toc -->

<!-- tocstop -->

# Widgets

Widgets are 3D UX elements.  They are stored per scene (not viewport)
in ctx.scene.widgets (an instanceof WidgetManager).

There are several levels of widget classes.  WidgetBase is the base class
for 3D widgets.  ToolMode is a separate system that also extends Node and
manages widgets via WidgetManager, sharing the same underlying event system.