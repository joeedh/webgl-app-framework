import {ListProperty, StringProperty, ToolOp, nstructjs, ToolDef, PropertySlots} from '../path.ux/scripts/pathux.js'
import * as util from '../util/util.js'

import {Mesh, MeshDrawFlags, MeshFlags, MeshTypes, Vertex} from './mesh.js'
import {View3DOp} from '../editors/view3d/view3d_ops.js'
import {SceneObject} from '../sceneobject/sceneobject.js'
import {BlockLoader, DataBlock, DataRef} from '../core/lib_api'
import {ToolContext} from '../core/context.js'

/**
 *
 * Iterates over pathset.  If
 * a path refers to a SceneObject
 * or is "_all_objects_",
 *
 * Each mesh will
 * have a .ownerMatrix property set referring
 * to sceneobject.outputs.matrix.getValue()
 *
 * Along with .ownerId referencing sceneobject.lib_id
 * And .meshDataPath for origin src API data path
 * */
export function* resolveMeshes(ctx: ToolContext, pathset: Iterable<string>) {
  for (const key of pathset) {
    if (key === '_all_objects_') {
      for (const ob of ctx.selectedMeshObjects) {
        const mesh = ob.data as Mesh

        mesh.ownerMatrix = ob.outputs.matrix.getValue()
        mesh.ownerId = ob.lib_id
        mesh.meshDataPath = `objects[${ob.lib_id}].data`

        yield mesh
      }
    } else {
      let value = ctx.api.getValue(ctx, key)

      if (!value) {
        console.warn('Bad mesh', key, value)
        continue
      }

      if (value instanceof SceneObject) {
        const ob = value
        value = value.data

        value.ownerMatrix = ob.outputs.matrix.getValue()
        value.ownerId = ob.lib_id
        value.meshDataPath = key
      } else if (value instanceof Mesh) {
        value.ownerMatrix = undefined
        value.ownerId = undefined
        value.meshDataPath = key
      } else {
        continue
      }

      yield value
    }
  }
}

export interface IMeshUndoData {
  dview: DataView
  drawflag: MeshDrawFlags
}

export function saveUndoMesh(mesh: Mesh): IMeshUndoData {
  const data = [] as number[]

  nstructjs.writeObject(data, mesh)

  return {
    dview   : new DataView(new Uint8Array(data).buffer),
    drawflag: mesh.drawflag,
  }
}

export function loadUndoMesh(ctx: ToolContext, data: IMeshUndoData) {
  const datalib = ctx.datalib

  const mesh = nstructjs.readObject<Mesh>(data.dview, Mesh)
  mesh.drawflag = data.drawflag

  //XXX hackish! getblock[_us] copy/pasted code!
  const getblock: BlockLoader = <BlockType extends DataBlock>(
    ref: DataRef | DataBlock | number
  ): BlockType | undefined => {
    return ref instanceof DataBlock ? (ref as BlockType) : datalib.get<BlockType>(ref)
  }

  const getblock_us = <BlockType extends DataBlock>(ref: DataRef | number | DataBlock): BlockType | undefined => {
    const ret = ref instanceof DataBlock ? ref : datalib.get<BlockType>(ref)
    if (ret !== undefined) {
      ret.lib_addUser(mesh)
    }
    return ret as BlockType
  }

  mesh.dataLink(getblock, getblock_us)
  return mesh
}

export abstract class MeshOp<
  InputSet extends PropertySlots = {},
  OutputSet extends PropertySlots = {},
> extends View3DOp<
  InputSet & {
    meshPaths: ListProperty<StringProperty>
  },
  OutputSet
> {
  static tooldef(): ToolDef {
    return {
      inputs: ToolOp.inherit({
        meshPaths: new ListProperty(StringProperty, ['mesh', '_all_objects_']).private(),
      }),
      outputs : ToolOp.inherit({}),
      toolpath: '',
      uiname  : '',
      icon    : -1,
    }
  }

  _undo?: {
    [k: number]: IMeshUndoData
  }

  getActiveMesh(ctx: ToolContext): Mesh {
    //returns first mesh in .getMeshes list
    return this.getMeshes(ctx)[0]
  }

  getMeshes(ctx: ToolContext): Mesh[] {
    const ret = new Set<Mesh>()

    for (const item of resolveMeshes(ctx, this.inputs.meshPaths)) {
      if (item) {
        ret.add(item)
      }
    }

    const ret2 = [] as Mesh[]
    for (const mesh of ret) {
      ret2.push(mesh)
    }

    return ret2
  }

  execPost(ctx: ToolContext) {
    //check for mesh structure errors
    const msg: [string] = ['']
    for (const mesh of this.getMeshes(ctx)) {
      if (1) {
        if (!mesh.validateMesh(msg)) {
          ctx.warning('Mesh error: ' + msg)
          ctx.toolstack.toolCancel(ctx, this)
          break
        }
      }
    }

    window.redraw_viewport()
    window.updateDataGraph()
  }

  calcUndoMem(ctx: ToolContext) {
    if (!this._undo) {
      return 0
    }

    let tot = 0

    for (const id in this._undo) {
      const data = this._undo[id]

      tot += data.dview.buffer.byteLength
    }

    return tot
  }

  undoPre(ctx: ToolContext) {
    this._undo = {}
    const undo = this._undo

    for (const mesh of this.getMeshes(ctx)) {
      undo[mesh.lib_id] = saveUndoMesh(mesh)
    }
  }

  undo(ctx: ToolContext) {
    const undo = this._undo!

    for (const mesh of this.getMeshes(ctx)) {
      const data = undo[mesh.lib_id]

      const mesh2 = loadUndoMesh(ctx, data)

      if (mesh.bvh) {
        mesh.bvh = undefined
      }

      mesh.swapDataBlockContents(mesh2)

      mesh.regenTessellation()
      mesh.recalcNormals()
      mesh.regenElementsDraw()
      mesh.regenRender()
      mesh.graphUpdate()
    }

    window.updateDataGraph()
    window.redraw_viewport()
  }
}

export class MeshDeformOp<InputSet extends PropertySlots = {}, OutputSet extends PropertySlots = {}> extends MeshOp<
  InputSet,
  OutputSet
> {
  constructor() {
    super()
  }

  _deformUndo?: {
    [k: number]: number[]
  }

  calcUndoMem() {
    let tot = 0.0

    if (this._deformUndo !== undefined) {
      for (const k in this._deformUndo) {
        const data = this._deformUndo[k]
        tot += data.length * 8
      }
    }

    return tot
  }

  undoPre(ctx: ToolContext) {
    this._deformUndo = {}
    const undo = this._deformUndo

    for (const mesh of this.getMeshes(ctx)) {
      const list = [] as number[]

      undo[mesh.lib_id] = list

      for (const v of mesh.verts) {
        list.push(v.eid)

        list.push(v.co[0])
        list.push(v.co[1])
        list.push(v.co[2])
      }
    }
  }

  undo(ctx: ToolContext) {
    for (const k of Reflect.ownKeys(this._deformUndo!)) {
      if (typeof k === 'symbol') {
        continue
      }
      const mesh = ctx.datalib.get<Mesh>(parseInt(k))

      if (!mesh) {
        console.warn('Undo error', k)
        continue
      }

      const list = this._deformUndo![k as unknown as keyof typeof this._deformUndo]
      for (let i = 0; i < list.length; i += 4) {
        const eid = list[i],
          x = list[i + 1],
          y = list[i + 2],
          z = list[i + 3]
        const v = mesh.eidMap.get<Vertex>(eid)
        if (v?.type !== MeshTypes.VERTEX) {
          console.error('Undo error for vertex eid', eid, 'got', v)
          continue
        }

        v.co[0] = x
        v.co[1] = y
        v.co[2] = z

        v.flag |= MeshFlags.UPDATE
      }

      mesh.regenAll()
      mesh.recalcNormals()
      mesh.graphUpdate()
    }

    window.redraw_viewport(true)
    window.updateDataGraph()
  }
}
