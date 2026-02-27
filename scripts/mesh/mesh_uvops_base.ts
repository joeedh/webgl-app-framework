import {
  util,
  math,
  nstructjs,
  ToolOp,
  StringProperty,
  Vec3Property,
  Vec2Property,
  Vec4Property,
  EnumProperty,
  FlagProperty,
  FloatProperty,
  BoolProperty,
  IntProperty,
  Vector2,
  Vector3,
  Vector4,
  Matrix4,
  Quat,
  ToolDef,
  PropertySlots,
} from '../path.ux/scripts/pathux.js'
import {MeshTypes, MeshFlags} from './mesh_base'
import {View3DOp} from '../editors/view3d/view3d_ops.js'
import {MeshOp} from './mesh_ops_base'
import {ToolContext, ViewContext} from '../../types/scripts/core/context'
import {ImageEditor} from '../../types/scripts/editors/image/ImageEditor'
import {Loop} from './mesh_types'

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

  static invoke(ctx: ViewContext, args) {
    let tool = super.invoke(ctx, args)

    if (!('selectedFacesOnly' in args)) {
      let editor = ctx.editors.imageEditor as ImageEditor
      if (editor) {
        const uve = editor.uvEditor

        tool.inputs.selectedFacesOnly.setValue(uve.selectedFacesOnly)
      }
    }

    return tool
  }

  getFaces(ctx: ViewContext) {
    let mesh = ctx.mesh

    if (!mesh) {
      return []
    }

    let selFsOnly = this.inputs.selectedFacesOnly.getValue()
    return selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable
  }

  getLoops(ctx: ViewContext, selOnly = false): Set<Loop> {
    let selFsOnly = this.inputs.selectedFacesOnly.getValue()
    let mesh = ctx.mesh

    if (!mesh) {
      return new Set()
    }

    let iter = selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable
    let ret = new Set<Loop>()

    for (let f of iter) {
      for (let l of f.loops) {
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

    let mesh = ctx.mesh

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

  static invoke(ctx: ViewContext, args: any) {
    let tool = super.invoke(ctx, args)

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
    let selFsOnly = this.inputs.selectedFacesOnly.getValue()
    let mesh = ctx.mesh

    if (!mesh) {
      return new Set()
    }

    let iter = selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable
    let ret = new Set<Loop>()

    for (let f of iter) {
      for (let l of f.loops) {
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
