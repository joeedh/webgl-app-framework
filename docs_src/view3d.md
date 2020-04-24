# 3D Viewport

This is where the fun happens.  The main class is View3D, which is an Editor subclass.
Any number of 3D viewports are allowed (so long as they don't overlap).

Behind the scenes one giant canvas is used, and viewports are drawn using 
scissor boxes.

View3D has a few important properties and methods:

* glPos[2]: the viewport box position
* glSize[2]: the viewport box size
* gl: the gl context
* camera: the camera
* getLocalMouse(x, y): Returns mouse coords relative to screen origin, basically (x-view3d.pos[0], y-view3d.pos[1]). 
* project(co): Project to 3d space, returns w
* unproject: Project from screen space

Viewport redraws are queued by window.redraw_viewport().  Only one draw request
is allowed at a time, so calling redraw_viewport multiple times in a row will
only draw once.  