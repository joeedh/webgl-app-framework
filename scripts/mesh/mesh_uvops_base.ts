import {ToolOp, BoolProperty, ToolDef, PropertySlots} from '../path.ux/scripts/pathux.js'
import {MeshFlags} from './mesh_base'
import {View3DOp} from '../editors/view3d/view3d_ops.js'
import {MeshOp} from './mesh_ops_base'
import {Loop} from './mesh_types'
import type {ViewContext} from '../core/context.js'
import type {ImageEditor} from '../editors/all.js'

export class MeshOpBaseUV<InputSet extends PropertySlots = {}, OutputSet extends PropertySlots = {}> extends MeshOp<
  InputSet & {
    selectedFacesOnly: BoolProperty
  },
  OutputSet & {}
> {
  constructor() {
    super()
  }

  static tooldef(): ToolDef {
    return {
      toolpath: '',
      inputs: ToolOp.inherit({
        selectedFacesOnly: new BoolProperty().saveLastValue(),
      }),
      outputs : ToolOp.inherit({}),
    }
  }

  static invoke(ctx: ViewContext, args: unknown[]) {
    const tool = super.invoke(ctx, args)

    if (!('selectedFacesOnly' in args)) {
      const editor = ctx.editors.imageEditor as ImageEditor
      if (editor) {
        const uve = editor.uvEditor

        tool.inputs.selectedFacesOnly.setValue(uve.selectedFacesOnly)
      }
    }

    return tool
  }

  getFaces(ctx: ViewContext) {
    const mesh = ctx.mesh

    if (!mesh) {
      return []
    }

    const selFsOnly = this.inputs.selectedFacesOnly.getValue()
    return selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable
  }

  getLoops(ctx: ViewContext, selOnly = false): Set<Loop> {
    const selFsOnly = this.inputs.selectedFacesOnly.getValue()
    const mesh = ctx.mesh

    if (!mesh) {
      return new Set()
    }

    const iter = selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable
    const ret = new Set<Loop>()

    for (const f of iter) {
      for (const l of f.loops) {
        if (l.flag & MeshFlags.HIDE) {
          continue
        }

        if (selOnly && !(l.flag & MeshFlags.SELECT)) {
          continue
        }

        ret.add(l)
      }
    }

    return ret
  }
}

export class UnwrapOpBase<
  InputSet extends PropertySlots = {},
  OutputSet extends PropertySlots = {},
> extends MeshOpBaseUV<InputSet, OutputSet> {
  execPre(ctx: ViewContext) {
    super.execPre(ctx)

    const mesh = ctx.mesh

    if (!mesh) {
      return
    }

    if (!mesh.loops.customData.hasLayer('uv')) {
      mesh.loops.addCustomDataLayer('uv')
    }
  }
}

export class UVOpBase<InputSet extends PropertySlots = {}, OutputSet extends PropertySlots = {}> extends View3DOp<
  InputSet & {
    selectedFacesOnly: BoolProperty
  },
  OutputSet & {}
> {
  constructor() {
    super()
  }

  static tooldef() {
    return {
      toolpath: '',
      inputs: ToolOp.inherit({
        selectedFacesOnly: new BoolProperty(),
      }),
      outputs : ToolOp.inherit({}),
    }
  }

  static invoke(ctx: ViewContext, args: unknown[]) {
    const tool = super.invoke(ctx, args)

    if (!('selectedFacesOnly' in args)) {
      let uve = ctx.editors.imageEditor
      if (uve) {
        uve = uve.uvEditor

        tool.inputs.selectedFacesOnly.setValue(uve.selectedFacesOnly)
      }
    }

    return tool
  }

  getLoops(ctx: ViewContext, selOnly = false): Iterable<Loop> {
    const selFsOnly = this.inputs.selectedFacesOnly.getValue()
    const mesh = ctx.mesh

    if (!mesh) {
      return new Set()
    }

    const iter = selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable
    const ret = new Set<Loop>()

    for (const f of iter) {
      for (const l of f.loops) {
        if (l.flag & MeshFlags.HIDE) {
          continue
        }

        if (selOnly && !(l.flag & MeshFlags.SELECT)) {
          continue
        }

        ret.add(l)
      }
    }

    return ret
  }
}
