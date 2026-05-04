import * as cconst from './const'
import type {AppState} from './appstate'
import * as util from '../util/util'
import {ToolOp, UndoFlags} from '../path.ux/pathux'
import {SelMask} from '../editors/view3d/selectmode'
import {Light} from '../light/light'
import {SceneObject} from '../sceneobject'
import {makeDefaultMaterial} from './material'
import {vertexSmooth} from '../mesh/mesh_utils'
import {subdivide} from '../subsurf'
import {makeCube} from './mesh_shapes'
import {Mesh} from '../mesh/mesh'
import {ScreenBlock} from '../editors/editor_base'
import {Collection} from '../scene/collection'
import {Scene} from '../scene/scene'
import type {ToolContext} from './context'
import {Library} from './lib_api'
import {genDefaultScreen} from '../editors/screengen'
import {LiteMesh} from '../lite-mesh'

/*root operator for when loading files*/
export class RootFileOp extends ToolOp {
  static tooldef() {
    return {
      undoflag: UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
      uiname  : 'File Start',
      toolpath: 'app.__new_file',
    }
  }
}

/** Root operator that builds a file. */
export class BasicFileOp extends ToolOp {
  constructor() {
    super()
  }

  exec(ctx: ToolContext) {
    const scene = new Scene()
    const lib = ctx.datalib

    lib.add(scene)
    lib.setActive(scene)

    const collection = new Collection()
    lib.add(collection)

    scene.collection = collection
    collection.lib_addUser(scene)

    const screenblock = new ScreenBlock()
    screenblock.screen = _appstate.screen as typeof screenblock.screen

    lib.add(screenblock)
    lib.setActive(screenblock)

    let mesh: Mesh | LiteMesh

    if (0) {
      mesh = new Mesh()
      lib.add(mesh)

      makeCube(mesh)
      for (let i = 0; i < 2; i++) {
        subdivide(mesh, mesh.faces)
        vertexSmooth(mesh, mesh.verts)
      }
      for (const v of mesh.verts) {
        v.co.mulScalar(6.0)
      }
      mesh.selectAll()
    } else {
      mesh = new LiteMesh()
    }

    const mat = makeDefaultMaterial()
    lib.add(mat)
    mesh.materials.push(mat)
    mat.lib_addUser(mesh)

    const sob = new SceneObject()
    lib.add(sob)

    sob.data = mesh
    mesh.lib_addUser(sob)

    scene.add(sob)
    scene.objects.setSelect(sob, true)
    scene.objects.setActive(sob)

    const light = new Light()
    lib.add(light)

    const sob2 = new SceneObject(light)
    lib.add(sob2)
    sob2.location[2] = 7.0

    scene.add(sob2)

    sob.graphUpdate()
    mesh.graphUpdate()

    mesh.regenRender()
    mesh.regenTessellation()
    mesh.regenElementsDraw()

    window.updateDataGraph()

    // /*/
    scene.switchToolMode('object')
    // note: switchToolMode sets the select mask, we set it
    // to VERTEX here
    scene.selectMask = SelMask.VERTEX
  }

  static tooldef() {
    return {
      undoflag: UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
      uiname  : 'File Start',
      toolpath: 'app.__new_file_basic',
    }
  }
}

export function genDefaultFile(appstate: AppState, dont_load_startup = 0): void {
  _appstate.saveHandle = undefined

  if (cconst.APP_KEY_NAME in localStorage && !dont_load_startup) {
    let buf = localStorage[cconst.APP_KEY_NAME]

    try {
      buf = util.atob(buf)
      appstate.loadFile(buf.buffer)
      return
    } catch (error) {
      util.print_stack(error as Error)
      console.warn('Failed to load startup file')
    }
  }

  const tool = new BasicFileOp()

  appstate.datalib = new Library()
  appstate.toolstack.execTool(appstate.ctx, tool)

  genDefaultScreen(appstate)
}
