import * as cconst from './const'
import type {AppState} from './appstate'
import * as util from '../util/util'
import {ToolOp, UndoFlags} from '../path.ux/pathux'
import {SelMask} from '../editors/view3d/selectmode'
import {ScreenBlock} from '../editors/editor_base'
import {Collection} from '../scene/collection'
import {Scene} from '../scene/scene'
import type {ToolContext} from './context'
import {Library} from './lib_api'
import {genDefaultScreen} from '../editors/screengen'
import {buildDefaultSceneContents} from './default_file'

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

    // Anything more than an empty scene (the classic startup cube + light) is
    // contributed by whichever subsystem registered a default-scene builder
    // — today the mesh subsystem, soon a builtin addon. See plan §3.
    buildDefaultSceneContents(ctx, lib, scene)

    window.updateDataGraph()

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
