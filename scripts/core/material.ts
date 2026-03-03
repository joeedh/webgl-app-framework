import {BlockLoader, DataBlock, DataRef} from './lib_api'
import {nstructjs, ToolOp, IntProperty, StringProperty} from '../path.ux/scripts/pathux.js'

import {Icons} from '../editors/icon_enum.js'
import {ShaderNetwork} from '../shadernodes/shadernetwork.js'
import {DiffuseNode, GeometryNode, OutputNode} from '../shadernodes/shader_nodes.js'
import {ToolContext} from '../../types/scripts/core/context'
import {StructReader} from '../path.ux/scripts/path-controller/types/util/nstructjs'

export function makeDefaultMaterial() {
  let mat = new Material()

  let diff = new DiffuseNode()
  let output = new OutputNode()
  let geom = new GeometryNode()

  mat.graph.add(geom)
  mat.graph.add(diff)
  mat.graph.add(output)

  geom.graph_ui_pos[0] = -geom.graph_ui_size[0] * 2 - 5
  output.graph_ui_pos[0] = diff.graph_ui_size[0] * 2 + 5

  geom.outputs.normal.connect(diff.inputs.normal)
  diff.outputs.surface.connect(output.inputs.surface)

  return mat
}

export class MakeMaterialOp extends ToolOp<
  {dataPathToSet: StringProperty; name: StringProperty},
  {materialID: IntProperty},
  ToolContext
> {
  constructor() {
    super()
  }

  static tooldef() {
    return {
      uiname     : 'Make Material',
      toolpath   : 'material.new',
      icon       : Icons.SMALL_PLUS,
      description: 'Create a new material',
      inputs: {
        dataPathToSet: new StringProperty(),
        name         : new StringProperty(''),
      },
      outputs: {
        materialID: new IntProperty(),
      },
    }
  }

  exec(ctx: ToolContext) {
    let mat = makeDefaultMaterial()
    let name = this.inputs.name.getValue()

    mat.name = name && name !== '' ? name : mat.name
    ctx.datalib.add(mat)

    let path = this.inputs.dataPathToSet.getValue()
    if (path) {
      let val = ctx.api.getValue(ctx, path)

      if (val !== undefined) {
        let meta = ctx.api.resolvePath(ctx, path)
        val.lib_remUser(meta.obj)
      }

      ctx.api.setValue(ctx, path, mat)

      let meta = ctx.api.resolvePath(ctx, path)
      mat.lib_addUser(meta.obj)
    }

    this.outputs.materialID.setValue(mat.lib_id)
  }
}

ToolOp.register(MakeMaterialOp)

export class UnlinkMaterialOp extends ToolOp<{dataPathToUnset: StringProperty}, {}, ToolContext> {
  constructor() {
    super()
  }

  static tooldef() {
    return {
      uiname     : 'Make Material',
      toolpath   : 'material.unlink',
      icon       : Icons.DELETE,
      description: 'Create a new material',
      inputs: {
        dataPathToUnset: new StringProperty(),
      },
    }
  }

  exec(ctx: ToolContext) {
    let meta = ctx.api.resolvePath(ctx, this.inputs.dataPathToUnset.getValue())
    let val = ctx.api.getValue(ctx, this.inputs.dataPathToUnset.getValue())

    if (val !== undefined) {
      val.lib_remUser(meta.obj)
    }

    ctx.api.setValue(ctx, this.inputs.dataPathToUnset.getValue(), undefined)
  }
}

ToolOp.register(UnlinkMaterialOp)

export class MaterialFlags {}

export var DefaultMat: Material

export class Material extends ShaderNetwork {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
Material {
}
  `
  )

  constructor() {
    super()

    this.flag = 0
  }

  calcSettingsHash() {
    throw new Error('implement me')
  }

  /**
   * Checks if a material name "Default" exists in ctx.datalib and returns it,
   * otherwise it returns a frozen Material instance.
   * @param ctx : Context
   * @returns Material
   * */
  static getDefaultMaterial(ctx: ToolContext): Material {
    //look for material named Default
    let mat = ctx.datalib.getLibrary<Material>('material').get('Default')

    if (mat === undefined) {
      return DefaultMat
    }

    return mat
  }

  static blockDefine() {
    return {
      typeName   : 'material',
      defaultName: 'Material',
      uiName     : 'Material',
      flag       : 0,
      icon       : -1,
    }
  }

  static nodedef() {
    const superdef = super.nodedef()
    return {
      name   : 'material',
      uiname : 'Material',
      inputs : {...superdef.inputs},
      outputs: {...superdef.outputs},
    }
  }

  dataLink(getblock: BlockLoader, getblock_addUser: BlockLoader) {
    super.dataLink(getblock, getblock_addUser)
  }

  loadSTRUCT(reader: StructReader<this>) {
    super.loadSTRUCT(reader)
    reader(this)
  }
}

DataBlock.register(Material)

DefaultMat = Object.freeze(new Material())
