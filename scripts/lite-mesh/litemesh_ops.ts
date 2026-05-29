import {FloatProperty, IntProperty, ToolOp, PropertySlots} from '../path.ux/scripts/pathux'
import type {ViewContext, ToolContext} from '../core/context'
import {SceneObject} from '../sceneobject/sceneobject'
import {getWasmImmediate} from '@sculptcore/api/api'
import {LiteMesh} from './litemesh'
import {makeDefaultMaterial} from '../core/material'

export class LiteMeshOp<Inputs extends PropertySlots = {}, Outputs extends PropertySlots = {}> extends ToolOp<
  Inputs,
  Outputs,
  ToolContext,
  ViewContext
> {}

export class AddLiteMeshCubeOp extends LiteMeshOp<{
  //
  sphere: FloatProperty
  dimen: IntProperty
  size: FloatProperty
}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.add_cube',
      inputs: {
        sphere: new FloatProperty(0.0).setRange(0.0, 1.0).noUnits(),
        dimen : new IntProperty(50).setRange(1, 1024).noUnits(),
        size  : new FloatProperty(1.0),
      },
    }
  }

  exec(ctx: ToolContext) {
    const wasm = getWasmImmediate()!
    const {sphere, size, dimen} = this.getInputs()
    const wasmMesh = wasm.Mesh_createCube(dimen, size, sphere)

    const litemesh = new LiteMesh(wasmMesh)
    const ob = new SceneObject(litemesh)
    const mat = makeDefaultMaterial()
    
    ctx.datalib.add(mat)
    ctx.datalib.add(litemesh)
    ctx.datalib.add(ob)

    mat.lib_addUser(litemesh)
    litemesh.materials.push(mat)

    ctx.scene.add(ob)
    ctx.scene.objects.clearSelection()
    ctx.scene.objects.setSelect(ob, true)
    ctx.scene.objects.setActive(ob)

    window.redraw_viewport(true)
  }
}
ToolOp.register(AddLiteMeshCubeOp)
