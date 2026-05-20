// AppImportOBJOp: shows an Open dialog, reads the selected .obj as text, and
// hands off to ImportOBJOp. Lives in the mesh subsystem rather than core
// because it's a mesh-specific feature — keeping it here lets
// scripts/core/app_ops.js stop importing from mesh. See plan §3 / §12.

import {ToolOp, UndoFlags} from '../path.ux/scripts/pathux.js'
import * as platform from '../core/platform.js'
import {ImportOBJOp} from './mesh_createops.js'

export class AppImportOBJOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : 'Import Obj',
      toolpath: 'app.import_obj',
      inputs  : {},
      undoflag: UndoFlags.NO_UNDO,
    }
  }

  exec(ctx) {
    console.log('File load')

    platform.platform
      .showOpenDialog('Open File', {
        filters: [
          {
            name      : '3D Models (obj)',
            extensions: ['obj'],
          },
        ],
      })
      .then((paths) => {
        console.log('paths', paths)
        if (paths.length === 0) {
          return undefined
        }

        return platform.platform.readFile(paths[0], 'text/plain')
      })
      .then((data) => {
        if (!data) return
        console.log('got data!', data)
        let toolop = new ImportOBJOp()
        toolop.inputs.data.setValue(data)
        ctx.api.execTool(ctx, toolop)
      })
  }
}

ToolOp.register(AppImportOBJOp)
