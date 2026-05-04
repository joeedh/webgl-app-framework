//override default undo implementation in Path.ux's toolop class
import {ToolOp, BoolProperty, UndoFlags} from '../path.ux/scripts/pathux.js'
import * as cconst from './const.js'
import * as platform from '../core/platform.js'
import {exportSTLMesh} from '../util/stlformat.js'
import {ImportOBJOp} from '../mesh/mesh_createops.js'

ToolOp.prototype.calcUndoMem = function (ctx) {
  if (this.undoPre !== ToolOp.prototype.undoPre) {
    console.warn('ToolOp.prototype.calcUndoMem: implemet me!', this)
    return 0
  }

  return this._undo.byteLength
}

ToolOp.prototype.undoPre = function (ctx) {
  this._undo = ctx.state.createUndoFile()
}

ToolOp.prototype.undo = function (ctx) {
  console.log('loading undo file 1')
  ctx.state.loadUndoFile(this._undo)

  window.redraw_viewport()
}

ToolOp.prototype.execPost = function (ctx) {
  window.redraw_viewport()
}
export class FileSaveOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : 'Save',
      toolpath: 'app.save',
      inputs: {
        forceDialog  : new BoolProperty(true),
        saveToolStack: new BoolProperty(false),
      },
      undoflag: UndoFlags.NO_UNDO,
    }
  }

  exec(ctx) {
    console.log('File save')

    let needDialog = this.inputs.forceDialog.getValue()
    needDialog = needDialog || !_appstate.saveHandle

    let args = {save_toolstack: this.inputs.saveToolStack.getValue()}

    if (!needDialog) {
      let data = _appstate.createFile(args)

      platform.platform
        .writeFile(data, _appstate.saveHandle, 'application/x-octet-stream')
        .then(() => {
          ctx.message('File saved')
        })
        .catch(() => {
          ctx.error('Save Error')
        })
      return
    }

    let savefunc = () => _appstate.createFile(args)

    platform.platform
      .showSaveDialog('Save File', savefunc, {
        filters: [
          {
            defaultPath: 'unnamed.' + cconst.FILE_EXT,
            name       : 'Project Files',
            extensions : [cconst.FILE_EXT],
          },
        ],
      })
      .then((saveHandle) => {
        _appstate.saveHandle = saveHandle
        ctx.message('File saved')
      })
    //saveFile(_appstate.createFile(), "unnamed."+cconst.FILE_EXT, ["."+cconst.FILE_EXT]);
  }
}

ToolOp.register(FileSaveOp)

export class FileOpenOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : 'Open',
      toolpath: 'app.open',
      inputs: {
        //forceDialog: new BoolProperty(true)
      },
      undoflag: UndoFlags.NO_UNDO,
    }
  }

  exec(ctx) {
    console.log('File load')

    platform.platform
      .showOpenDialog('Open File', {
        filters: [
          {
            name      : 'Project Files',
            extensions: [cconst.FILE_EXT],
          },
        ],
      })
      .then((paths) => {
        console.log('paths', paths)
        if (paths.length === 0) {
          return
        }

        return platform.platform.readFile(paths[0], 'application/x-octet-stream')
      })
      .then((data) => {
        console.log('got data!', data)
        _appstate.saveHandle = undefined
        _appstate.loadFileAsync(data)
      })

    //loadFile(undefined, ["."+cconst.FILE_EXT]).then((filedata) => {
    //_appstate.loadFile(filedata);
    //});
  }
}

ToolOp.register(FileOpenOp)

export class FileNewOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : 'New',
      toolpath: 'app.new',
      inputs: {
        //forceDialog: new BoolProperty(true)
      },
      undoflag: UndoFlags.NO_UNDO,
    }
  }

  exec(ctx) {
    console.log('File new')
    if (confirm('Make new file?')) {
      //paranoia check, clear this here
      _appstate.saveHandle = undefined

      genDefaultFile(_appstate, false)
    }
  }
}
ToolOp.register(FileNewOp)

export class FileExportSTL extends ToolOp {
  static tooldef() {
    return {
      uiname  : 'Export STL',
      toolpath: 'app.export_stl',
      inputs: {
        forceDialog  : new BoolProperty(true),
        saveToolStack: new BoolProperty(false),
      },
      undoflag: UndoFlags.NO_UNDO,
    }
  }

  exec(ctx) {
    let list = new Set(ctx.selectedMeshObjects).map((f) => f.data)
    if (list.size === 0) {
      return
    }

    let savefunc = () => {
      return exportSTLMesh(list)
    }

    platform.platform
      .showSaveDialog('Export STL', savefunc, {
        filters: [
          {
            defaultPath: 'unnamed.stl',
            name       : 'STL Files',
            extensions : ['stl'],
          },
        ],
      })
      .then((saveHandle) => {
        _appstate.saveHandle = saveHandle
        ctx.message('File saved')
      })
    //saveFile(_appstate.createFile(), "unnamed."+cconst.FILE_EXT, ["."+cconst.FILE_EXT]);
  }
}

ToolOp.register(FileExportSTL)

export class AppImportOBJOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : 'Import Obj',
      toolpath: 'app.import_obj',
      inputs: {
        //forceDialog: new BoolProperty(true)
      },
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
          return
        }

        return platform.platform.readFile(paths[0], 'text/plain')
      })
      .then((data) => {
        console.log('got data!', data)
        let toolop = new ImportOBJOp()

        toolop.inputs.data.setValue(data)
        ctx.api.execTool(ctx, toolop)
      })

    //loadFile(undefined, ["."+cconst.FILE_EXT]).then((filedata) => {
    //_appstate.loadFile(filedata);
    //});
  }
}
ToolOp.register(AppImportOBJOp)
