"use strict";

import * as toolsys from '../path.ux/scripts/toolsys/simple_toolsys.js';
import {ViewContext} from './context.js';
import {AppToolStack} from "./toolstack.js";
import '../editors/node/MaterialEditor.js';

import {initSimpleController, checkForTextBox, keymap, Vector3, Vector4, Vector2, Quat, Matrix4,
  ToolOp, UndoFlags, nstructjs} from '../path.ux/scripts/pathux.js';

import './polyfill.js';

import '../util/fbxloader.js';

import {loadShapes} from "./simplemesh_shapes.js";

import '../editors/resbrowser/resbrowser.js';
import '../editors/resbrowser/resbrowser_ops.js';
import '../editors/resbrowser/resbrowser_types.js';

import '../editors/view3d/tools/tools.js';
import cconst2 from "../path.ux/scripts/config/const.js";
import {Material, makeDefaultMaterial} from './material.js';
import {App, ScreenBlock} from '../editors/editor_base.js';
import {Library, DataBlock, DataRef, BlockFlags} from '../core/lib_api.js';
import {IDGen} from '../util/util.js';
import * as util from '../util/util.js';
import {getDataAPI} from '../data_api/api_define.js';
import {View3D} from '../editors/view3d/view3d.js';
import {MenuBarEditor} from "../editors/menu/MainMenu.js";
import {Scene} from '../scene/scene.js';
import {BinaryReader, BinaryWriter} from '../util/binarylib.js';
import * as cconst from './const.js';
import {AppSettings} from './settings.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {Mesh} from '../mesh/mesh.js';
import {makeCube} from './mesh_shapes.js';
import {NodeFlags} from "./graph.js";
import {ShaderNetwork, makeDefaultShaderNetwork} from "../shadernodes/shadernetwork.js";

cconst2.loadConstants(cconst);

let STRUCT = nstructjs.STRUCT;

export class FileLoadError extends Error {};

//override default undo implementation in Path.ux's toolop class
ToolOp.prototype.undoPre = function(ctx) {
  this._undo = ctx.state.createUndoFile();
}

ToolOp.prototype.undo = function(ctx) {
  console.log("loading undo file 1");
  ctx.state.loadUndoFile(this._undo);

  window.redraw_viewport();
};

ToolOp.prototype.execPost = function(ctx) {
  window.redraw_viewport();
};


/*root operator for when leading files*/
export class RootFileOp extends ToolOp {
  static tooldef() {return {
    undoflag    : UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
    uiname      : "File Start",
    toolpath    : "app.__new_file"
  }}
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

  static tooldef() {return {
    undoflag    : UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
    uiname      : "File Start",
    toolpath    : "app.__new_file_basic"
  }}
};

export {genDefaultScreen} from '../editors/screengen.js';
import {genDefaultScreen} from '../editors/screengen.js';
import {Collection} from "../scene/collection.js";
import {PropsEditor} from "../editors/properties/PropsEditor.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {Light} from "../light/light.js";
import {GridBase} from '../mesh/mesh_grids.js';

export function genDefaultFile(appstate, dont_load_startup=0) {
  if (cconst.APP_KEY_NAME in localStorage && !dont_load_startup) {
    let buf = localStorage[cconst.APP_KEY_NAME];

    try {
      buf = util.atob(buf);
      appstate.loadFile(buf.buffer);
      return;
    } catch (error) {
      util.print_stack(error);
      console.warn("Failed to load startup file");
    }
  }

  let tool = new BasicFileOp();

  appstate.datalib = new Library();
  appstate.toolstack.execTool(appstate.ctx, tool);

  genDefaultScreen(appstate);
}

window._genDefaultFile = genDefaultFile; //this global is for debugging purposes only

export const BlockTypes = {
  SCREEN     : "scrn",
  DATABLOCK  : "dblk",
  SETTINGS   : "sett",
  LIBRARY    : "libr"
}

export class FileBlock {
  constructor(type, data) {
    this.type = type;
    this.data = data;
  }
}

export class FileData {
  constructor() {
    this.blocks = [];
    this.save_screen = undefined;
    this.load_screen = undefined;
  }
}

export class AppState {
  constructor() {
    this.settings = new AppSettings;
    this.ctx = new ViewContext(this);
    this.toolstack = new AppToolStack(this.ctx);
    this.api = getDataAPI();
    this.screen = undefined;
    this.datalib = new Library();

    this.modalFlag = 0;

    this.three_scene = undefined;
    this.three_renderer = undefined;

    this.playing = false;
  }

  unswapScreen() {
    let screen = this.screen;

    if (screen._swapScreen === undefined) {
      console.warn("Bad call to appstate.unswapScreen()")
      return;
    }

    let screen2 = screen._swapScreen;
    screen._swapScreen = undefined;

    this.setScreen(screen2)
  }

  swapScreen(screen) {
    screen._swapScreen = this.screen;
    this.setScreen(screen, false);
  }

  setScreen(screen, trigger_destroy=true) {
    this.screen.unlisten();
    this.screen.remove(trigger_destroy);

    this.screen = screen;
    screen.ctx = this.ctx;

    document.body.appendChild(this.screen);

    screen.listen();
    screen.setCSS();
    screen.update();
  }

  start() {
    this.loadSettings();

    this.ctx = new ViewContext(this);

    window.addEventListener("mousedown", (e) => {
      let tbox = checkForTextBox(_appstate.screen, e.pageX, e.pageY);

      if (e.button === 0 && !tbox) {
        e.preventDefault();
      }
    });

    window.addEventListener("contextmenu", (e) => {
      console.log(e);
      let screen = _appstate.screen;
      if (screen === undefined) {
        return;
      }

      let elem = screen.pickElement(e.x, e.y);
      console.log(elem, elem.tagName, "|");

      if (elem.tagName !== "TEXTBOX-X") {
        e.preventDefault();
      }
    });

    this.screen = document.createElement("webgl-app-x");
    this.screen.ctx = this.ctx;
    this.screen.size[0] = window.innerWidth-45;
    this.screen.size[1] = window.innerHeight-45;

    document.body.appendChild(this.screen);
    this.screen.setCSS();
    this.screen.listen();

    genDefaultFile(this);
    this.filename = "unnamed." + cconst.FILE_EXT;
  }

  createFile(args={save_screen : true, save_settings : false, save_library : true}) {
    if (args.save_library === undefined) {
      args.save_library = true;
    }

    if (args.save_screen === undefined) {
      args.save_screen = true;
    }

    let file = new BinaryWriter();

    file.string(cconst.FILE_MAGIC);
    file.uint16(cconst.APP_VERSION);
    file.uint16(0); //reserved for file flags (may compression?)

    let buf = nstructjs.write_scripts();

    file.int32(buf.length);
    file.bytes(buf);

    function writeblock(type, object) {
      if (type === undefined || type.length != 4) {
        throw new Error("bad type in writeblock: " + type);
      }

      file.string(type);
      let data = [];

      nstructjs.manager.write_object(data, object);

      file.int32(data.length);
      file.bytes(data);
    }

    //if (args.save_screen) {
    //  writeblock(BlockTypes.SCREEN, this.screen);
    //}

    if (args.save_settings) {
      writeblock(BlockTypes.SETTINGS, this.settings);
    }

    if (!args.save_library) {
      return file.finish().buffer;
    }

    writeblock(BlockTypes.LIBRARY, this.datalib);

    for (let lib of this.datalib.libs) {
      if (!args.save_screen && lib.type.blockDefine().typeName == "screen") {
        continue;
      }

      for (let block of lib) {
        let typeName = block.constructor.blockDefine().typeName;
        let data = [];

        file.string(BlockTypes.DATABLOCK);

        nstructjs.manager.write_object(data, block);
        let len = typeName.length + data.length + 4;

        file.int32(len);
        file.int32(typeName.length);
        file.string(typeName);
        file.bytes(data);
      }
    }

    return file.finish().buffer;
  }

  testUndoFileIO() {
    let file = this.createUndoFile();
    this.loadUndoFile(file);
    window.redraw_viewport();
  }

  testFileIO() {
    let file = this.createFile({save_settings : true});
    this.loadFile(file);
    window.redraw_viewport();
  }

  loadUndoFile(buf) {
    this.loadFile(buf, {
      load_screen     : false,
      load_settings   : false,
      reset_toolstack : false
    });

    this._execEditorOnFileLoad();
  }

  switchScreen(sblock) {
    let screen2 = sblock.screen;

    if (this.screen === screen2) {
      return;
    }

    this.ctx.datalib.setActive(sblock);

    if (screen2 === undefined) {
      throw new Error("screen2 cannot be undefined");
    }

    let screen = this.screen;
    if (screen !== undefined) {
      for (let sarea of screen.sareas) {
        sarea.area.on_area_inactive();
      }

      screen.unlisten();
      screen.remove(false);
    }

    this.screen = screen2;
    screen2.ctx = this.ctx;

    screen2.listen();
    screen2.regenBorders();
    screen2.setCSS();

    for (let sarea of screen2.sareas) {
      sarea.ctx = sarea.area.ctx = this.ctx;
      sarea.setCSS();

      sarea.area.on_area_active();
      sarea.area.setCSS();
    }

    document.body.appendChild(screen2);
  }

  /*this is stupid, I have to delay by 350 ms
  * to avoid race conditions between ui and
  * appstate*/
  _execEditorOnFileLoad() {
    window.setTimeout(() => {
      for (let sarea of this.screen.sareas) {
        sarea._init(); //check that _init has been called

        for (let area of sarea.editors) {
          area._init(); //check that _init has been called
        }
      }

      for (let sarea of this.screen.sareas) {
        for (let area of sarea.editors) {
          area.onFileLoad(area === sarea.area);
        }
      }
    }, 350);
  }

  //expects an ArrayBuffer or a DataView
  loadFile(buf, args={reset_toolstack : true, load_screen : true, load_settings : false}) {
    let lastscreens = undefined;
    let lastscreens_active = undefined;

    args.load_library = args.load_library === undefined ? true : args.load_library;
    args.reset_context = args.reset_context === undefined ? args.reset_toolstack : args.reset_context;

    //if we didn't load a screen, preserve screens from last datalib
    if (!args.load_screen && args.load_library) {
      lastscreens = [];

      lastscreens_active = this.datalib.libmap.screen.active;

      for (let sblock of this.datalib.libmap.screen) {
        lastscreens.push(sblock);
      }
    }

    let file = new BinaryReader(buf);

    let s = file.string(4);
    if (s !== cconst.FILE_MAGIC) {
      throw new FileLoadError("Not a valid file");
    }

    let version = file.uint16();
    let flag = file.uint16();

    let len = file.int32();
    let structs = file.string(len);

    let istruct = new nstructjs.STRUCT();

    istruct.parse_structs(structs);

    let screen, found_screen;
    let datablocks = [];
    let datalib = undefined;

    while (!file.at_end()) {
      let type = file.string(4);
      let len = file.int32();

      let data = file.bytes(len);
      data = new DataView((new Uint8Array(data)).buffer);
      //console.log("Reading block of type", type);

      if (args.load_screen && type === BlockTypes.SCREEN) {
        console.warn("Old screen block detected");

        screen = istruct.read_object(data, App);
        found_screen = true;
      } else if (args.load_library && type === BlockTypes.LIBRARY) {
        datalib = istruct.read_object(data, Library);

        this.datalib.destroy();
        this.datalib = datalib;
      } else if (args.load_library && type === BlockTypes.DATABLOCK) {
        let file2 = new BinaryReader(data);

        let len = file2.int32();
        let clsname = file2.string(len);

        let cls = DataBlock.getClass(clsname);
        len = data.byteLength - len - 4;
        let data2 = file2.bytes(len);
        let block;

        if (!args.load_screen && cls.blockDefine().typeName === "screen") {
          continue;
        }

        if (cls === undefined) {
          console.warn("Warning, unknown block type", clsname);
          continue;
          //block = istruct.read_object(data2, DataBlock);
        } else {
          block = istruct.read_object(data2, cls);
        }

        if (cls.blockDefine().typeName === "screen") {
          block.screen._ctx = this.ctx;
          //console.log("SCREEN", block.screen.sareas)
        }

        datablocks.push([clsname, block]);
      } else if (args.load_settings && type == BlockTypes.SETTINGS) {
        let settings = istruct.read_object(data, AppSettings);

        this.settings.destroy();
        this.settings = settings;
      }
    }

    //just loading settings?
    if (!args.load_library) {
      return;
    }

    if (datalib === undefined) {
      throw new Error("failed to load file");
      return;
    }

    for (let dblock of datablocks) {
      datalib.getLibrary(dblock[0]).add(dblock[1], true);
    }

    this.do_versions(version, datalib);

    //datalib = this.datalib;

    function getblock(dataref) {
      if (dataref === undefined) {
        return undefined;
      }

      return datalib.get(dataref);
    }

    function getblock_addUser(dataref, user) {
      if (dataref === undefined) {
        return undefined;
      }

      let addUser = dataref !== undefined && !(dataref instanceof DataBlock);

      let ret = datalib.get(dataref);

      if (addUser && ret !== undefined) {
        ret.lib_addUser(user);
      }

      return ret;
    }

    //reference counts are re-derived during linking
    for (let lib of datalib.libs) {
      for (let block of lib) {
        block.lib_users = (block.lib_flag & BlockFlags.FAKE_USER) ? 1 : 0;
      }
    }

    for (let lib of datalib.libs) {
      lib.dataLink(getblock, getblock_addUser);
    }
    datalib.afterSTRUCT();

    if (args.load_screen && screen === undefined) {
      screen = datalib.libmap.screen.active;
      if (screen === undefined) { //paranoia check
        screen = datalib.libmap.screen[0];
        datalib.libmap.screen.active = screen;
      }

      screen = screen.screen;
    }

    if (screen !== undefined) {
      found_screen = true;

      if (this.screen !== screen && this.screen !== undefined) {
        this.screen.destroy();
        this.screen.remove();
      }

      document.body.appendChild(screen);

      this.screen = screen;
      this.screen.ctx = this.ctx;
      this.screen._init();
      this.screen.listen();

      //push active area contexts
      for (let sarea of this.screen.sareas) {
        sarea.area.push_ctx_active();
        sarea.area.pop_ctx_active();
      }

      this.screen.update();
      this.screen.regenBorders();
      this.screen.setCSS();

      screen.doOnce(() => {
        this.screen.on_resize(this.screen.size, [window.innerWidth, window.innerHeight]);
        this.screen.setCSS();
        this.screen.update();
      });
    }

    this.do_versions_post(version, datalib);

    if (args.reset_context) {
      this.ctx.reset(true);
    }

    if (args.reset_toolstack) {
      this.toolstack.reset(this.ctx);
      this.toolstack.execTool(this.ctx, new RootFileOp());
    }

    if (!args.load_screen) {
      this.modalFlag = 0;

      for (let sblock of lastscreens) {
        if (!datalib.has(sblock)) {
          sblock.lib_id = sblock.graph_id = -1; //request new id
          datalib.add(sblock);
        }
      }

      datalib.libmap.screen.active = lastscreens_active;
    }

    if (found_screen) {
      this.screen.afterSTRUCT();
    }


    for (let sblock of this.datalib.screen) {
      sblock.screen.ctx = this.ctx;
    }

    this._execEditorOnFileLoad();
  }

  clearStartupFile() {
    console.log("clearing startup file");
    delete localStorage[cconst.APP_KEY_NAME];
  }

  saveStartupFile() {
    let buf = this.createFile({write_settings : false});
    buf = util.btoa(buf);

    localStorage[cconst.APP_KEY_NAME] = buf;
    console.log(`saved startup file; ${(buf.length/1024).toFixed(2)}kb`);
  }

  /** this is executed before block re-linking has happened*/
  do_versions(version, datalib) {
    if (version < 4) {
      for (let mesh of datalib.mesh) {
        let cd_grid = mesh.loops.customData.getLayerIndex("QuadTreeGrid");

        if (cd_grid < 0) {
          continue;
        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.updateNormalQuad(l);
          grid.pruneDeadPoints();
        }
      }
    }

    if (version < 5) { //recalc normals since GridVert.no changed into a short for saving
      for (let mesh of datalib.mesh) {
        let cd_grid = GridBase.meshGridOffset(mesh);

        if (cd_grid < 0) {
          continue;
        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.flagNormalsUpdate();
        }
      }
    }

    if (version < 6) {
      for (let mesh of datalib.mesh) {
        let cd_grid = GridBase.meshGridOffset(mesh);

        if (cd_grid < 0) {
          continue;
        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          console.error("Building grid vert eids for old file. . .");
          grid.flagIdsRegen();
        }
      }
    }
  }

  /** this is executed after block re-linking has happened*/
  do_versions_post(version, datalib) {
    console.log("VERSION", version);

    if (version < 1) {
      for (let scene of datalib.scene) {
        scene.collection = new Collection();
        this.datalib.add(scene.collection);
        scene.collection.lib_addUser(scene);

        scene._loading = true;
        for (let ob of scene.objects) {
          scene.collection.add(ob);
        }
        scene._loading = false;
      }
    }

    if (version < 3) {
      let screen = this.screen;

      let props = document.createElement("screenarea-x");
      props.size[0] = 5;
      props.size[1] = screen.size[1];
      props.ctx = this.ctx;
      props._init();

      props.switch_editor(PropsEditor);
      screen.appendChild(props);
    }
  }

  createSettingsFile() {
    let args = {
      save_settings : true,
      save_screen   : false,
      save_library : false
    };

    return this.createFile(args);
  }

  saveSettings() {
    let file = this.createSettingsFile();
    file = util.btoa(file);

    localStorage[cconst.APP_KEY_NAME + "_settings"] = file;
  }

  loadSettings() {
    try {
      this.loadSettings_intern();
    } catch (error) {
      util.print_stack(error);
      console.log("Failed to load settings");
    }
  }

  loadSettings_intern() {
    let file = localStorage[cconst.APP_KEY_NAME + "_settings"];
    if (file === undefined) {
      return;
    }

    file = util.atob(file).buffer;

    let args = {
      load_screen: false,
      load_settings: true,
      load_library : false,
      reset_toolstack: false
    }

    this.loadFile(file, args);
    window.redraw_viewport();
  }

  createUndoFile() {
    let args = {
      save_screen   : false,
      save_settings : false
    };

    return this.createFile(args);
  }

  destroy() {
    this.screen.unlisten();
  }

  draw() {
  }
};

export function init() {
  loadShapes();
  initSimpleController();

  window._appstate = new AppState();

  let animreq;
  let f = () => {
    animreq = undefined;

    _appstate.draw();
  }
  window.redraw_all = function() {
    if (animreq !== undefined) {
      return;
    }

    animreq = requestAnimationFrame(f);
  }

  let lastKey = undefined;

  window.addEventListener("keydown", (e) => {
    lastKey = e.keyCode;

    console.log(e.keyCode);
    if (e.keyCode === keymap["C"]) {
      e.preventDefault();
      e.stopPropagation();

      let mpos = _appstate.screen.mpos;
      let elem = _appstate.screen.pickElement(mpos[0], mpos[1]);

      console.log(elem ? elem.tagName : elem, mpos);
    }
    //console.log("tbox", checkForTextBox(_appstate.screen, mpos[0], mpos[1]), mpos);

    //prevent reload hotkey, could conflict with redo
    if (e.keyCode == keymap["R"] && e.ctrlKey) {
      e.preventDefault();
    }

    //also prevent ctrl-A, which is usually select all, unless we're over a textbox that
    //uses it
    let mpos = _appstate.screen ? _appstate.screen.mpos : [0, 0];
    let preventdef = !(_appstate.screen && checkForTextBox(_appstate.screen, mpos[0], mpos[1]));
    if (preventdef && e.keyCode == keymap["A"] && e.ctrlKey) {

      e.preventDefault();
    }
  });


  let graphreq = undefined;
  function gf() {
    graphreq = undefined;
    _appstate.datalib.graph.exec(_appstate.ctx);
  }

  window.updateDataGraph = function(force=false) {
    //console.warn("updateDataGraph called");

    if (force) {
      _appstate.datalib.graph.exec(_appstate.ctx);
      return;
    }

    if (graphreq !== undefined) {
      return;
    }

    graphreq = 1;
    setTimeout(gf, 1);
  };

  _appstate.start();
}
