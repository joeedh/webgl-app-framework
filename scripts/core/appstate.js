"use strict";

import {ViewContext} from './context.js';
import {AppToolStack} from "./toolstack.js";
import '../editors/node/MaterialEditor.js';

import {tileManager} from '../image/gpuimage.js';

import './platform.js';

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

import {BasicFileOp, RootFileOp} from './app_ops.js';
export {BasicFileOp, RootFileOp} from './app_ops.js';

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
  LIBRARY    : "libr",
  TOOLSTACK  : "tstk"
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
    this.saveHandle = undefined;
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

    if (args.save_toolstack === undefined) {
      args.save_toolstack = false;
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

    if (args.save_toolstack) {
      writeblock(BlockTypes.TOOLSTACK, this.toolstack);
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

  loadFileAsync(buf, args) {
    let this2 = this;

    return new Promise((accept, reject) => {
      //kind of want to use new asyn stuff. . .
      let readblocks = function*(filectx) {
        let args = filectx.args;
        filectx.datablocks = [];
        let file = filectx.file;

        window.FILE_LOADING = true;

        while (!file.at_end()) {
          this2.loadFile_readBlock(filectx);
          yield;
        }

        args = filectx.args;

        //just loading settings?
        if (!args.load_library) {
          window.FILE_LOADING = false;
          return;
        }

        if (filectx.datalib === undefined) {
          window.FILE_LOADING = false;

          throw new Error("failed to load file");
        }
      }

      let step = 0.0;

      let log = function() {
        console.log.apply(this, arguments);
      }

      let gen = function*() {
        log("begin");
        let filectx = this2.loadFile_start(buf, args);
        yield;

        step += 1.0;

        let time = util.time_ms();

        let startstep = 0;

        log("reading blocks");
        for (let block of readblocks(filectx)) {
          let file = filectx.file;
          let perc = file.i / file.view.buffer.byteLength;

          step = startstep + perc*4.0;

          if (util.time_ms() - time > 50) {
            time = util.time_ms();
            yield;
          }
        }

        yield;

        log("initializing datalib");
        this2.loadFile_initDatalib(filectx);
        step += 1.0;

        yield;

        log("loading screen data, if any");
        this2.loadFile_loadScreen(filectx);
        step += 1.0;

        yield

        log("finishing");
        this2.loadFile_finish(filectx);
        step += 1.0;

        log("done");

        accept();
      }

      let iter = gen()[Symbol.iterator]();

      if (this.screen) {
        this.screen.remove();
      }

      let pcirc = document.createElement("progress-circle-x");
      pcirc.init();

      document.body.appendChild(pcirc);
      pcirc.startTimer();

      let timer = window.setInterval(() => {
        let perc = step / 6.0;

        pcirc.value = perc;

        perc = (perc*100).toFixed(1) + "%";
        console.log(util.termColor(perc, "green"));

        let item;
        try {
          item = iter.next();
        } catch (error) {
          pcirc.remove();
          window.clearInterval(timer);
          reject(error);
        }

        if (item.done) {
          pcirc.remove();
          window.clearInterval(timer);
        }
      }, 5);
    });
  }

  loadFile(buf, args) {
    let ret;
    try {
      ret = this.loadFile_intern(...arguments);
    } catch (error) {
      window.FILE_LOADING = false;
      throw error;
    }

    return ret;
  }

  loadFile_intern(buf, args) {
    let filectx = this.loadFile_start(buf, args);
    this.loadFile_readBlocks(filectx);
    this.loadFile_initDatalib(filectx);
    this.loadFile_loadScreen(filectx);
    this.loadFile_finish(filectx);
  }

  //expects an ArrayBuffer or a DataView
  loadFile_start(buf, args={reset_toolstack : true, load_screen : true, load_settings : false}) {
    let lastscreens = undefined;
    let lastscreens_active = undefined;

    args.load_library = args.load_library === undefined ? true : args.load_library;
    args.reset_context = args.reset_context === undefined ? args.reset_toolstack : args.reset_context;

    //if we didn't lreset_toolstackoad a screen, preserve screens from last datalib
    if (!args.load_screen && args.load_library) {
      lastscreens = [];

      lastscreens_active = this.datalib.libmap.screen.active;

      for (let sblock of this.datalib.libmap.screen) {
        lastscreens.push(sblock);
      }
    }

    let filectx = {};

    let file = filectx.file = new BinaryReader(buf);

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

    filectx.lastscreens_active = lastscreens_active;
    filectx.lastscreens = lastscreens;
    filectx.istruct = istruct;
    filectx.flag = flag;
    filectx.version = version;
    filectx.args = args;
    filectx.buf = buf;
    filectx.datablocks = [];
    filectx.found_screen = false;
    filectx.datalib = undefined;
    filectx.screen = undefined;

    return filectx;
  }

  loadFile_readBlock(filectx) {
    let {istruct, flag, version, args, buf, file} = filectx;

    let type = file.string(4);
    let len = file.int32();

    let data = file.bytes(len);
    data = new DataView((new Uint8Array(data)).buffer);
    //console.log("Reading block of type", type);

    if (type === BlockTypes.TOOLSTACK) {
      console.warn("File had a toolstack");
      filectx.found_toolstack = true;
      filectx.toolstack = istruct.read_object(data, AppToolStack);
    } else if (args.load_screen && type === BlockTypes.SCREEN) {
      console.warn("Old screen block detected");

      screen = istruct.read_object(data, App);
      filectx.found_screen = true;
    } else if (args.load_library && type === BlockTypes.LIBRARY) {
      filectx.datalib = istruct.read_object(data, Library);

      this.datalib.destroy();
      this.datalib = filectx.datalib;
    } else if (args.load_library && type === BlockTypes.DATABLOCK) {
      let file2 = new BinaryReader(data);

      let len = file2.int32();
      let clsname = file2.string(len);

      let cls = DataBlock.getClass(clsname);
      len = data.byteLength - len - 4;
      let data2 = file2.bytes(len);
      let block;

      if (!args.load_screen && cls.blockDefine().typeName === "screen") {
        return undefined;
      }

      if (cls === undefined) {
        console.warn("Warning, unknown block type", clsname);
        return undefined;
        //block = istruct.read_object(data2, DataBlock);
      } else {
        block = istruct.read_object(data2, cls);
      }

      if (cls.blockDefine().typeName === "screen") {
        block.screen._ctx = this.ctx;
        //console.log("SCREEN", block.screen.sareas)
      }

      filectx.datablocks.push([clsname, block]);

      return block;
    } else if (args.load_settings && type == BlockTypes.SETTINGS) {
      let settings = istruct.read_object(data, AppSettings);

      this.settings.destroy();
      this.settings = settings;

      return settings;
    }
  }

  loadFile_readBlocks(filectx) {
    let args = filectx.args;
    let datablocks = filectx.datablocks = [];
    let file = filectx.file;

    window.FILE_LOADING = true;

    //clear gpu image history cache
    tileManager.clear();

    while (!file.at_end()) {
      this.loadFile_readBlock(filectx);
    }

    args = filectx.args;

    //just loading settings?
    if (!args.load_library) {
      window.FILE_LOADING = false;
      return;
    }

    let {istruct, screen, found_screen, datalib, flag, version, buf} = filectx;

    if (datalib === undefined) {
      window.FILE_LOADING = false;

      throw new Error("failed to load file");
      return;
    }
  }

  loadFile_initDatalib(filectx) {
    let {screen, found_screen, datalib, version, datablocks} = filectx;

    for (let dblock of datablocks) {
      datalib.getLibrary(dblock[0]).add(dblock[1], true);
    }

    this.do_versions(version, datalib);

    //datalib = this.datalib;

    function getblock(dataref) {
      if (dataref === undefined) {
        return undefined;
      }

      //handle cases where dataLink methods are called twice
      if (typeof dataref === "object" && dataref instanceof DataBlock) {
        return dataref;
      }

      return datalib.get(dataref);
    }

    filectx.getblock = getblock;

    function getblock_addUser(dataref, user) {
      if (dataref === undefined) {
        return undefined;
      }

      if (typeof dataref === "object" && dataref instanceof DataBlock) {
        return dataref;
      }

      let addUser = dataref !== undefined && !(dataref instanceof DataBlock);

      let ret = datalib.get(dataref);

      if (addUser && ret !== undefined) {
        ret.lib_addUser(user);
      }

      return ret;
    }

    filectx.getblock_addUser = getblock_addUser;

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

  }

  loadFile_loadScreen(filectx) {
    let {screen, getblock, getblock_addUser, found_screen, datalib, version, args, datablocks} = filectx;

    if (args.load_screen && screen === undefined) {
      screen = datalib.libmap.screen.active;
      if (screen === undefined) { //paranoia check
        screen = datalib.libmap.screen[0];
        datalib.libmap.screen.active = screen;
      }

      screen = screen.screen;
    }

    if (screen !== undefined) {
      found_screen = filectx.found_screen = true;

      if (this.screen !== screen && this.screen !== undefined) {
        this.screen.destroy();
        this.screen.remove();
      }

      document.body.appendChild(screen);

      let ok = false;

      for (let sblock of this.datalib.screen) {
        sblock.screen.ctx = this.ctx;

        if (sblock.screen === this.screen) {
          ok = true;
        }

        for (let sarea of sblock.screen.sareas) {
          for (let editor of sarea.editors) {
            editor.dataLink(sblock, getblock, getblock_addUser);
          }
        }
      }

      if (!ok) {
        for (let sarea of this.screen.sareas) {
          for (let editor of sarea.editors) {
            editor.dataLink(undefined, getblock, getblock_addUser);
          }
        }
      }

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

  }
  loadFile_finish(filectx) {
    let {lastscreens, found_screen, screen, version, datalib, lastscreens_active, datablocks, args} = filectx;

    this.do_versions_post(version, datalib);

    window.FILE_LOADING = false;

    if (args.reset_context) {
      this.ctx.reset(true);
    }

    if (args.reset_toolstack) {
      this.toolstack.reset(this.ctx);

      if (filectx.found_toolstack) {
        this.toolstack = filectx.toolstack;
        this.toolstack.ctx = this.ctx;
      } else {
        this.toolstack.execTool(this.ctx, new RootFileOp());
      }
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

    this._execEditorOnFileLoad();
  }

  clearStartupFile() {
    console.log("clearing startup file");
    delete localStorage[cconst.APP_KEY_NAME];
  }

  saveStartupFile() {
    let buf = this.createFile({write_settings : false});
    buf = util.btoa(buf);

    try {
      localStorage[cconst.APP_KEY_NAME] = buf;
      console.log(`saved startup file; ${(buf.length/1024).toFixed(2)}kb`);
      this.ctx.message("Saved startup file");
    } catch (error) {
      this.ctx.error("Failed to save startup file");
    }
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
