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

/** Shared mesh lookup for the attribute ToolOps. */
class LiteMeshAttrOp<
  Inputs extends PropertySlots = {},
  Outputs extends PropertySlots = {},
> extends LiteMeshOp<Inputs, Outputs> {
  _getMesh(ctx: ToolContext): LiteMesh | undefined {
    const data = ctx.scene?.objects?.active?.data
    return data instanceof LiteMesh ? data : undefined
  }
}

/**
 * Add a new attribute layer (domain/type/use ints; see LiteMesh AttrDomain /
 * AttrType / AttrUseFlags). Undo removes the freshly-created layer by name (it
 * has no data worth preserving — any paint into it is a later, separately-undone
 * op). `_name` is captured at exec for the by-name remove on undo / redo.
 */
export class AddAttrOp extends LiteMeshAttrOp<{
  domain: IntProperty
  type: IntProperty
  use: IntProperty
}> {
  _name = ''

  static tooldef() {
    return {
      toolpath: 'litemesh.add_attr',
      uiname  : 'Add Attribute',
      inputs  : {
        domain: new IntProperty(1),
        type  : new IntProperty(8),
        use   : new IntProperty(0),
      },
    }
  }

  undoPre(_ctx: ToolContext): void {}
  calcUndoMem(): number {
    return 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const {domain, type, use} = this.getInputs()
    mesh.addAttr(domain, type, use)
    this._name = mesh._selectedAttr?.attrName ?? ''
    window.redraw_all?.()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    if (mesh && this._name) {
      mesh.removeAttrByName(this.getInputs().domain, this._name)
      window.redraw_all?.()
    }
  }
}
ToolOp.register(AddAttrOp)

/**
 * Remove the LiteMesh's currently-selected attribute layer (builtins refused in
 * C++). Detaches the layer into the C++ stash (data preserved, no serialize) so
 * undo restores it intact. The target (domain + name) is captured on the first
 * undoPre so redo re-detaches the same layer regardless of selection state.
 */
export class RemoveAttrOp extends LiteMeshAttrOp {
  _domain = -1
  _name = ''
  _stashId = -1

  static tooldef() {
    return {
      toolpath: 'litemesh.remove_attr',
      uiname  : 'Remove Attribute',
      inputs  : {},
    }
  }

  undoPre(ctx: ToolContext): void {
    if (this._name === '') {
      const sel = this._getMesh(ctx)?._selectedAttr
      if (sel) {
        this._domain = sel.domain
        this._name = sel.attrName
      }
    }
  }
  calcUndoMem(): number {
    return 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh || this._name === '') {
      return
    }
    this._stashId = mesh.detachAttrLayer(this._domain, this._name)
    window.redraw_all?.()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    if (mesh && this._stashId >= 0) {
      mesh.reattachAttrLayer(this._stashId)
      window.redraw_all?.()
    }
  }
}
ToolOp.register(RemoveAttrOp)
