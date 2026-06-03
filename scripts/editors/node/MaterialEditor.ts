import {NodeEditorBase} from './NodeEditor.js'
import {Editor, type EditorSideBar} from '../editor_base'
import {UIBase} from '../../path.ux/scripts/core/ui_base.js'
import {MakeMaterialOp} from '../../core/material.js'
import {Icons} from '../icon_enum.js'
import {nstructjs, type DataAPI, type DataStruct, type Container, type IAreaDef} from '../../path.ux/scripts/pathux.js'
import {Mesh} from '../../../addons/builtin/mesh/src/mesh.js'
import type {Material} from '../../core/material'
import type {ViewContext} from '../../core/context'
import type {StructReader} from '../../path.ux/scripts/util/nstructjs'

/**
 * NodeEditor specialized for editing the active object's material shader graph.
 * Tracks which datablock/material is being shown and points the inherited
 * `graphPath` at that material's graph (see `updatePath`).
 */
export class MaterialEditor extends NodeEditorBase {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
  MaterialEditor {
    velpan       : VelPan;
    graphPath    : string;
    activeMatMap : string | JSON.stringify(this.activeMatMap);
  }`
  )

  /** change-detection key for the active object/material, drives header rebuilds */
  _last_update_key: string | undefined = undefined
  /** data path to the datablock owning the material (a mesh or object data) */
  dataBlockPath = ''
  /** per-mesh (keyed by lib_id) index of the material slot currently shown */
  activeMatMap: {[lib_id: number]: number} = {}
  headerRow?: Container<ViewContext>

  static defineAPI(api: DataAPI): DataStruct {
    NodeEditorBase.ensureAPI(api)
    return api.inheritStruct(MaterialEditor, NodeEditorBase)
  }

  init(): void {
    super.init()
    this.headerRow = this.header!.row()

    if (this.helppicker) {
      this.helppicker.remove()
      this.helppicker = undefined
    }

    this.doOnce(this.buildHeader)
  }

  /** Recompute `dataBlockPath`/`graphPath` from the active object's material slot. */
  updatePath(): void {
    const ob = this.ctx.object

    if (!ob) {
      this.graphPath = this.dataBlockPath = ''
      return
    }

    if (ob.data instanceof Mesh) {
      this.dataBlockPath = `library.mesh[${ob.data.lib_id}]`
    } else {
      this.dataBlockPath = `library.object[${ob.data.lib_id}].data`
    }

    const block = this.ctx.api.getValue(this.ctx, this.dataBlockPath)

    if (!block) {
      this.graphPath = ''
      return
    }

    if (block instanceof Mesh) {
      if (!(block.lib_id in this.activeMatMap)) {
        this.activeMatMap[block.lib_id] = 0
      }

      this.activeMatMap[block.lib_id] = Math.min(this.activeMatMap[block.lib_id], block.materials.length)

      if (block.materials.length > 0) {
        const idx = this.activeMatMap[block.lib_id]
        this.graphPath = `${this.dataBlockPath}.materials[${idx}].graph`
      } else {
        this.graphPath = ''
      }
    } else {
      this.graphPath = this.dataBlockPath + '.material.graph'
    }
  }

  onSidebarBuild(sidebar: EditorSideBar): void {
    super.onSidebarBuild(sidebar)

    const materialTab = sidebar.tabpanel.tab('Materials')

    // is a MeshMaterialPanel
    const panel = UIBase.createElement('material-panel-x')
    panel.setAttribute('datapath', 'mesh')
    materialTab.add(panel as unknown as UIBase<ViewContext>)
  }

  buildHeader(): void {
    if (!this.ctx) {
      if (!this.isDead()) {
        this.doOnce(this.buildHeader)
      }
      return
    }

    this.updatePath()

    const row = this.headerRow!

    row.clear()

    const col = row.col()
    const row1 = col.row()
    const row2 = col.row()

    const path = this.graphPath
    const graph = path !== '' ? this.ctx.api.resolvePath(this.ctx, path) : undefined

    const dblock = this.dataBlockPath === '' ? undefined : this.ctx.api.getValue(this.ctx, this.dataBlockPath)

    if (!graph && !dblock) {
      row1.label('Nothing here')
      return
    }

    if (dblock instanceof Mesh) {
      this.headerMesh(dblock, row1, row2)
    } else {
      this.headerNonMesh(dblock, row1, row2)
    }
  }

  headerMesh(mesh: Mesh, row1: Container<ViewContext>, _row2: Container<ViewContext>): void {
    if (mesh.materials.length === 0) {
      row1.button('Add Material', () => {
        const op = new MakeMaterialOp()

        this.ctx.toolstack.execTool(this.ctx, op)
        const mat = this.ctx.datalib.get<Material>(op.outputs.materialID.getValue())

        if (mat) {
          mesh.materials.push(mat)
          mat.lib_addUser(mesh)
        }

        this.rebuild()
      })
    }
  }

  headerNonMesh(_dblock: unknown, _row1: Container<ViewContext>, _row2: Container<ViewContext>): void {}

  rebuild(): void {
    this.doOnce(this.buildHeader)
  }

  update(): void {
    const ob = this.ctx.object!

    let updateKey = ob.name

    if (ob.data instanceof Mesh) {
      updateKey += ':ME:' + ob.data.name
      for (const mat of ob.data.materials) {
        updateKey += ':' + mat.lib_id
      }
    }

    if (updateKey !== this._last_update_key) {
      this._last_update_key = updateKey

      this.rebuild()
    }

    super.update()
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this)
    super.loadSTRUCT(reader)

    const amm = this.activeMatMap as unknown
    if (typeof amm === 'string') {
      this.activeMatMap = JSON.parse(amm)
    }
  }

  static define(): IAreaDef {
    return {
      tagname : 'material-editor-x',
      areaname: 'MaterialEditor',
      uiname  : 'Shader Editor',
      icon    : Icons.EDITOR_NODE,
    }
  }
}
Editor.register(MaterialEditor)
