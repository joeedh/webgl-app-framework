"use strict";

import * as toolsys from '../path.ux/scripts/simple_toolsys.js';
import {Context, AppToolStack} from '../core/context.js';
import {initSimpleController} from '../path.ux/scripts/simple_controller.js';
import './polyfill.js';

toolsys.setContextClass(Context);

import {loadWidgetShapes} from '../editors/view3d/widget_shapes.js';
import '../editors/resbrowser/resbrowser.js';
import '../editors/resbrowser/resbrowser_ops.js';
import '../editors/resbrowser/resbrowser_types.js';

import {App, ScreenBlock} from '../editors/editor_base.js';
import {Library, DataBlock, DataRef} from '../core/lib_api.js';
import {IDGen} from '../util/util.js';
import {PropsEditor} from "../editors/properties/PropsEditor.js";
import * as util from '../util/util.js';
import {Vector3, Vector4, Vector2, Quat, Matrix4} from '../util/vectormath.js';
import {ToolOp, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {getDataAPI} from '../data_api/api_define.js';
import {View3D} from '../editors/view3d/view3d.js';
import {MenuBarEditor} from "../editors/menu/MainMenu.js";
import {Scene} from '../core/scene.js';
import {BinaryReader, BinaryWriter} from '../util/binarylib.js';
import * as cconst from '../core/const.js';
import {AppSettings} from './settings.js';
import {SceneObject} from './sceneobject.js';
import {Mesh} from '../mesh/mesh.js';
import {makeCube} from './mesh_shapes.js';
import '../path.ux/scripts/struct.js';
import {NodeFlags} from "./graph.js";
import {ShaderNetwork, makeDefaultShaderNetwork} from "./material.js";

let STRUCT = nstructjs.STRUCT;

export class FileLoadError extends Error {};

//override default undo implementation in Path.ux's toolop class
ToolOp.prototype.undoPre = function(ctx) {
  this._undo = ctx.state.createUndoFile();
}

ToolOp.prototype.undo = function(ctx) {
  console.log("loading undo file");
  ctx.appstate.loadUndoFile(this._undo);
}

export class BasicFileOp extends ToolOp {
  constructor() {
    super();
  }
  
  exec(ctx) {
    let scene = new Scene();
    let lib = ctx.datalib;
    
    lib.add(scene);
    lib.setActive(scene);

    let screenblock = new ScreenBlock();
    screenblock.screen = _appstate.screen;

    lib.add(screenblock);
    lib.setActive(screenblock);
  }
  
  static tooldef() {return {
    undoflag    : UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
    uiname      : "File Start",
    toolpath    : "app.__new_file_basic"
  }}
};

export function genDefaultScreen(appstate) {
  appstate.screen.clear();
  appstate.screen.ctx = appstate.ctx;

  let sarea = document.createElement("screenarea-x");
  sarea.ctx = appstate.ctx;

  appstate.screen.appendChild(sarea);

  sarea.switch_editor(View3D);
  
  sarea.pos[0] = sarea.pos[1] = 0.0;
  sarea.size[0] = appstate.screen.size[0];
  sarea.size[1] = appstate.screen.size[1];

  let yperc = 65 / _appstate.screen.size[1];
  let sarea2 = _appstate.screen.splitArea(sarea, yperc);

  sarea.switch_editor(MenuBarEditor);

  let xperc = 270 / _appstate.screen.size[0];
  let sarea3 = _appstate.screen.splitArea(sarea2, 1.0 - xperc, false);
  sarea3.switch_editor(PropsEditor);

  appstate.screen.listen();

  sarea.setCSS();
  sarea.area.setCSS();
}

export function genDefaultFile(appstate, dont_load_startup=0) {
  if (cconst.APP_KEY_NAME in localStorage && !dont_load_startup) {
    let buf = localStorage[cconst.APP_KEY_NAME];

    try {
      buf = util.atob(buf);
      appstate.loadFile(buf.buffer);
    } catch (error) {
      util.print_stack(error);
      console.warn("Failed to load startup file");
    }

    return;
  }

  let tool = new BasicFileOp();
  
  genDefaultScreen(appstate);

  appstate.datalib = new Library();
  appstate.toolstack.execTool(tool);
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
    this.ctx = new Context(this);
    this.toolstack = new AppToolStack(this.ctx);
    this.api = getDataAPI();
    this.screen = undefined;
    this.datalib = new Library();

    this.three_scene = undefined;
    this.three_renderer = undefined;
  }
  
  start() {
    this.ctx = new Context(this);

    window.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    window.addEventListener("contextmenu", (e) => {
      e.preventDefault();
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

    //if we didn't load a screen, preserve screens from last datalib
    if (!args.load_screen) {
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
      console.log("Reading block of type", type);

      if (args.load_screen && type == BlockTypes.SCREEN) {
        console.warn("Old screen block detected");

        screen = istruct.read_object(data, App);
        found_screen = true;
      } else if (type == BlockTypes.LIBRARY) {
        datalib = istruct.read_object(data, Library);
        console.log("Found library");

        this.datalib.destroy();
        this.datalib = datalib;
      } else if (type == BlockTypes.DATABLOCK) {
        let file2 = new BinaryReader(data);
        
        let len = file2.int32();
        let clsname = file2.string(len);
        
        let cls = DataBlock.getClass(clsname);
        len = data.byteLength - len - 4;
        let data2 = file2.bytes(len);
        let block;

        if (!args.load_screen && cls.blockDefine().typeName == "screen") {
          continue;
        }

        if (cls === undefined) {
          console.warn("Warning, unknown block type", clsname);
          
          block = istruct.read_object(data2, DataBlock);
        } else {
          block = istruct.read_object(data2, cls);
        }

        if (cls.blockDefine().typeName == "screen") {
          block.screen._ctx = this.ctx;
          console.log("SCREEN", block.screen.sareas)
        }

        datablocks.push([clsname, block]);
      } else if (args.load_settings && type == BlockTypes.SETTINGS) {
        let settings = istruct.read_object(data, AppSettings);
        
        this.settings.destroy();
        this.settings = settings;
      }
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
      return datalib.get(dataref);
    }
    
    function getblock_us(dataref, user) {
      let ret = getblock(dataref);
      
      if (ret !== undefined) {
        ret.lib_addUser(user);
      }
      
      return ret;
    }

    for (let lib of datalib.libs) {
      lib.dataLink(getblock, getblock_us);
    }
    datalib.afterSTRUCT();

    this.do_versions_post(version, datalib);
    
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

      if (this.screen !== undefined) {
        this.screen.destroy();
        this.screen.remove();
      }

      this.screen = screen;
      this.screen.ctx = this.ctx;
      this.screen.listen();

      //push active area contexts
      for (let sarea of this.screen.sareas) {
        sarea.area.push_ctx_active();
        sarea.area.pop_ctx_active();
      }

      document.body.appendChild(screen);

      this.screen.update();
      this.screen.regenBorders();
      this.screen.setCSS();

      screen.doOnce(() => {
        this.screen.on_resize([window.innerWidth, window.innerHeight]);
        this.screen.setCSS();
        this.screen.update();
      });
    }

    if (args.reset_toolstack) {
      this.toolstack.reset(this.ctx);
    }

    console.log("-------------------------->", lastscreens);

    if (!args.load_screen) {
      for (let sblock of lastscreens) {
        sblock.lib_id = sblock.graph_id = -1; //request new id
        datalib.add(sblock);
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

  saveStartupFile() {
    let buf = this.createFile({write_settings : false});
    buf = util.btoa(buf);

    localStorage[cconst.APP_KEY_NAME] = buf;
    console.log(`saved startup file; ${(buf.length/1024).toFixed(2)}kb`);
  }

  /** this is executed before block re-linking has happened*/
  do_versions(version, datalib) {
  }

  /** this is executed after block re-linking has happened*/
  do_versions_post(version, datalib) {
  }
  
  createUndoFile() {
    let args = {
      save_screen   : false,
      load_settings : false
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
  loadWidgetShapes();
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

  window.addEventListener("keydown", (e) => {
    return _appstate.screen.on_keydown(e);
  });


  let graphreq = undefined;
  function gf() {
    graphreq = undefined;
    _appstate.datalib.graph.exec(_appstate.ctx);
  }

  window.updateDataGraph = function(force=false) {
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
