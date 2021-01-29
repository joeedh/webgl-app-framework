//override default undo implementation in Path.ux's toolop class
import {
  ToolOp, BoolProperty, EnumProperty, FlagProperty, ToolFlags,
  PropFlags, UndoFlags
} from '../path.ux/scripts/pathux.js';
import {Scene} from '../scene/scene.js';
import {Collection} from '../scene/collection.js';
import {ScreenBlock} from '../editors/editor_base.js';
import {Mesh} from '../mesh/mesh.js';
import {makeCube} from './mesh_shapes.js';
import {makeDefaultMaterial} from './material.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {Light} from '../light/light.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import * as cconst from './const.js';
import * as platform from '../core/platform.js';
import {exportSTLMesh} from '../util/stlformat.js';
import {ImportOBJOp} from '../mesh/mesh_createops.js';

ToolOp.prototype.calcUndoMem = function(ctx) {
  if (this.undoPre !== ToolOp.prototype.undoPre) {
    console.warn("ToolOp.prototype.calcUndoMem: implemet me!", this);
    return 0;
  }

  return this._undo.byteLength;
}

ToolOp.prototype.undoPre = function (ctx) {
  this._undo = ctx.state.createUndoFile();
}

ToolOp.prototype.undo = function (ctx) {
  console.log("loading undo file 1");
  ctx.state.loadUndoFile(this._undo);

  window.redraw_viewport();
};

ToolOp.prototype.execPost = function (ctx) {
  window.redraw_viewport();
};


/*root operator for when loading files*/
export class RootFileOp extends ToolOp {
  static tooldef() {
    return {
      undoflag: UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
      uiname  : "File Start",
      toolpath: "app.__new_file"
    }
  }
}

/*root operator that build a file*/
export class BasicFileOp extends ToolOp {
  constructor() {
    super();
  }

  exec(ctx) {
    let scene = new Scene();
    let lib = ctx.datalib;

    lib.add(scene);
    lib.setActive(scene);

    let collection = new Collection();
    lib.add(collection);

    scene.collection = collection;
    collection.lib_addUser(scene);

    let screenblock = new ScreenBlock();
    screenblock.screen = _appstate.screen;

    lib.add(screenblock);
    lib.setActive(screenblock);

    //*
    let mesh = new Mesh();
    lib.add(mesh);

    makeCube(mesh);

    let mat = makeDefaultMaterial();
    lib.add(mat);
    mesh.materials.push(mat);
    mat.lib_addUser(mesh);

    let sob = new SceneObject();
    lib.add(sob);

    sob.data = mesh;
    mesh.lib_addUser(sob);

    scene.add(sob);
    scene.objects.setSelect(sob, true);
    scene.objects.setActive(sob);

    let light = new Light();
    lib.add(light);

    let sob2 = new SceneObject(light);
    lib.add(sob2);
    sob2.location[2] = 7.0;

    scene.add(sob2);

    sob.graphUpdate();
    mesh.graphUpdate();

    mesh.regenRender();
    mesh.regenTesellation();
    mesh.regenElementsDraw();

    window.updateDataGraph();

    // /*/

    scene.selectMask = SelMask.VERTEX;
    scene.switchToolMode("mesh");
  }

  static tooldef() {
    return {
      undoflag: UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
      uiname  : "File Start",
      toolpath: "app.__new_file_basic"
    }
  }
};

export class FileSaveOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Save",
      toolpath: "app.save",
      inputs  : {
        forceDialog  : new BoolProperty(true),
        saveToolStack: new BoolProperty(false)
      },
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    console.log("File save");

    let needDialog = this.inputs.forceDialog.getValue();
    needDialog = needDialog || !_appstate.saveHandle;

    let args = {save_toolstack : this.inputs.saveToolStack.getValue()};

    if (!needDialog) {
      let data = _appstate.createFile(args);

      platform.platform.writeFile(data, _appstate.saveHandle, "application/x-octet-stream").then(() => {
        ctx.message("File saved");
      }).catch(() => {
        ctx.error("Save Error");
      });
      return;
    }

    let savefunc = () => _appstate.createFile(args);

    platform.platform.showSaveDialog("Save File", savefunc, {
      filters: [
        {
          defaultPath: "unnamed." + cconst.FILE_EXT,
          name       : "Project Files",
          extensions : [cconst.FILE_EXT]
        }
      ]
    }).then((saveHandle) => {
      _appstate.saveHandle = saveHandle;
      ctx.message("File saved");
    });
    //saveFile(_appstate.createFile(), "unnamed."+cconst.FILE_EXT, ["."+cconst.FILE_EXT]);
  }
}

ToolOp.register(FileSaveOp);

export class FileOpenOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Open",
      toolpath: "app.open",
      inputs  : {
        //forceDialog: new BoolProperty(true)
      },
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    console.log("File load");

    platform.platform.showOpenDialog("Open File", {
      filters: [
        {
          name      : "Project Files",
          extensions: [cconst.FILE_EXT]
        }
      ]
    }).then((paths) => {
      console.log("paths", paths);
      if (paths.length === 0) {
        return;
      }

      return platform.platform.readFile(paths[0], "application/x-octet-stream")
    }).then((data) => {
      console.log("got data!", data);
      _appstate.saveHandle = undefined;
      _appstate.loadFileAsync(data);
    });

    //loadFile(undefined, ["."+cconst.FILE_EXT]).then((filedata) => {
    //_appstate.loadFile(filedata);
    //});
  }
}

ToolOp.register(FileOpenOp);

export class FileNewOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "New",
      toolpath: "app.new",
      inputs  : {
        //forceDialog: new BoolProperty(true)
      },
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    console.log("File new");
    if (confirm("Make new file?")) {
      //paranoia check, clear this here
      _appstate.saveHandle = undefined;

      _genDefaultFile(_appstate, false);
    }
  }
}
ToolOp.register(FileNewOp);


export class FileExportSTL extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Export STL",
      toolpath: "app.export_stl",
      inputs  : {
        forceDialog  : new BoolProperty(true),
        saveToolStack: new BoolProperty(false)
      },
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    let list = new Set(ctx.selectedMeshObjects).map(f => f.data);
    if (list.size === 0) {
      return;
    }

    let savefunc = () => {
      return exportSTLMesh(list);
    }

    platform.platform.showSaveDialog("Export STL", savefunc, {
      filters: [
        {
          defaultPath: "unnamed.stl",
          name       : "STL Files",
          extensions : ["stl"]
        }
      ]
    }).then((saveHandle) => {
      _appstate.saveHandle = saveHandle;
      ctx.message("File saved");
    });
    //saveFile(_appstate.createFile(), "unnamed."+cconst.FILE_EXT, ["."+cconst.FILE_EXT]);
  }
}

ToolOp.register(FileExportSTL);


export class AppImportOBJOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Import Obj",
      toolpath: "app.import_obj",
      inputs  : {
        //forceDialog: new BoolProperty(true)
      },
      undoflag: UndoFlags.NO_UNDO
    }
  }

  exec(ctx) {
    console.log("File load");

    platform.platform.showOpenDialog("Open File", {
      filters: [
        {
          name      : "3D Models (obj)",
          extensions: ["obj"]
        }
      ]
    }).then((paths) => {
      console.log("paths", paths);
      if (paths.length === 0) {
        return;
      }

      return platform.platform.readFile(paths[0], "text/plain")
    }).then((data) => {
      console.log("got data!", data);
      let toolop = new ImportOBJOp();

      toolop.inputs.data.setValue(data);
      ctx.api.execTool(ctx, toolop);
    });

    //loadFile(undefined, ["."+cconst.FILE_EXT]).then((filedata) => {
    //_appstate.loadFile(filedata);
    //});
  }
}
ToolOp.register(AppImportOBJOp);
