import {ToolDef, PropertySlots, ContextLike} from '@framework/api'
import {ToolOp, BoolProperty} from '@framework/pathux'
import {MeshFlags} from './mesh_base'
import {View3DOp} from '@framework/api'
import {MeshOp} from './mesh_ops_base'
import {Loop} from './mesh_types'
import type {ViewContext} from '@framework/api'

export class MeshOpBaseUV<InputSet extends PropertySlots = {}, OutputSet extends PropertySlots = {}> //
  extends MeshOp<
    InputSet & {
      selectedFacesOnly: BoolProperty
    },
    OutputSet & {}
  >
{
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

  static invoke<CTX extends ContextLike>(_ctx: CTX, args: Record<string, unknown>): ToolOp {
    // the lack of static-level generics in TS can be frustrating at times
    // stupid hack
    const ctx = _ctx as unknown as ViewContext
    const tool = super.invoke(ctx, args) as MeshOpBaseUV

    if (!('selectedFacesOnly' in args)) {
      // The legacy UVEditor's per-editor `selectedFacesOnly` preference is
      // gone (UV editing is being re-designed; see
      // scripts/editors/image/pending-port/TODO.md). Default to the historical
      // value until the new UV abstraction restores a real binding.
      tool.inputs.selectedFacesOnly.setValue(true)
    }

    return tool as ReturnType<typeof ToolOp.invoke>
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

export class UVOpBase<InputSet extends PropertySlots = {}, OutputSet extends PropertySlots = {}> //
  extends View3DOp<
    InputSet & {
      selectedFacesOnly: BoolProperty
    },
    OutputSet & {}
  >
{
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

  static invoke<CTX extends ContextLike>(_ctx: CTX, args: Record<string, unknown>): ToolOp {
    // the lack of static-level generics in TS can be frustrating at times
    // stupid hack
    const ctx = _ctx as unknown as ViewContext
    const tool = super.invoke(ctx, args) as unknown as UVOpBase

    if (!('selectedFacesOnly' in args)) {
      // See note in MeshOpBaseUV.invoke: the legacy UVEditor preference is gone
      // until the new UV abstraction is designed.
      tool.inputs.selectedFacesOnly.setValue(true)
    }

    return tool as ReturnType<typeof ToolOp.invoke>
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
