# Context

Context is a generic bundle of properties representing 
the application state.  It's used mostly by ToolOps,
and path.ux 

Some important members:

* ctx.scene: Active scene
* ctx.object: Active object, alias for ctx.scene.objects.active
* ctx.view3d: Active view3d, note this isn't available from within ToolOp.prototype.exec, which gets a special Context stripped of editor aliase (like view3d).                              
* ctx.api: The controller path api (DataAPI), alias to _appstate.api.
* ctx.toolstack: The toolstack, alias to _appstate.toolstack.
* ctx.selectedObjects
* ctx.selectedMeshObjects
* ctx.menubar: The menu bar, also not available to ToolOp.prototype.exec
* ctx.props: The properties window, also not available to ToolOp.prototype.exec
