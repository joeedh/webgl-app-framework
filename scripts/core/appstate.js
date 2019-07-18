"use strict";

import * as toolsys from '../path.ux/scripts/simple_toolsys.js';
import {Context, AppToolStack} from '../core/context.js';
import {initSimpleController} from '../path.ux/scripts/simple_controller.js';

toolsys.setContextClass(Context);

import {loadWidgetShapes} from '../editors/view3d/widget_shapes.js';

import {App} from '../editors/editor_base.js';
import {Library, DataBlock, DataRef} from '../core/lib_api.js';
import {IDGen} from '../util/util.js';
import * as util from '../util/util.js';
import {Vector3, Vector4, Vector2, Quat, Matrix4} from '../util/vectormath.js';
import {ToolOp, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {getDataAPI} from '../data_api/api_define.js';
import {View3D} from '../editors/view3d/view3d.js';
import {Scene} from '../core/scene.js';
import {BinaryReader, BinaryWriter} from '../util/binarylib.js';
import * as cconst from '../core/const.js';
import {AppSettings} from './settings.js';
import {SceneObject} from './sceneobject.js';
import {Mesh} from './mesh.js';
import {makeCube} from './mesh_shapes.js';
import '../path.ux/scripts/struct.js';
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
    lib.getLibrary("scene").active = scene;
    
    let mesh = makeCube();
    lib.add(mesh);
    
    let ob = new SceneObject(mesh);
    
    lib.add(ob);    
    scene.add(ob);
    scene.objects.setSelect(ob, true);
  }
  
  static tooldef() {return {
    undoflag    : UndoFlags.IS_UNDO_ROOT | UndoFlags.NO_UNDO,
    uiname      : "File Start",
    toolpath    : "app.__new_file_basic"
  }}
};

export function genDefaultScreen(appstate) {
  appstate.screen.clear();
  
  let sarea = document.createElement("screenarea-x");
  
  sarea.ctx = appstate.ctx;
  sarea.switch_editor(View3D);
  
  sarea.pos[0] = sarea.pos[1] = 0.0;
  sarea.size[0] = appstate.screen.size[0];
  sarea.size[1] = appstate.screen.size[1];
  
  appstate.screen.appendChild(sarea);
  appstate.screen.listen();
  
  sarea.setCSS();
  sarea.area.setCSS();
}

export function genDefaultFile(appstate, dont_load_startup=false) {
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
  }
  
  start() {
    this.ctx = new Context(this);
    
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
  
  createFile(args={save_screen : true, load_screen : true}) {
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
    
    if (args.save_screen) {
      writeblock(BlockTypes.SCREEN, this.screen);
    }
    
    writeblock(BlockTypes.LIBRARY, this.datalib);
    
    for (let lib of this.datalib.libs) {
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

  testFileIO() {
    let file = this.createFile();
    this.loadFile(file);
    window.redraw_viewport();
  }

  loadUndoFile(buf) {
    this.loadFile(buf, {
      load_screen   : false,
      load_settings : false
    });
  }

  //expects an ArrayBuffer or a DataView
  loadFile(buf, args={reset_toolstack : true, load_screen : true, load_settings : false}) {
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
    
    let screen;
    let datablocks = [];
    let datalib = undefined;

    console.log(file);

    while (!file.at_end()) {
      let type = file.string(4);
      let len = file.int32();
      
      let data = file.bytes(len);
      data = new DataView((new Uint8Array(data)).buffer);
      console.log("->", type);

      if (args.load_screen && type == BlockTypes.SCREEN) {
        screen = istruct.read_object(data, App);

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
        
        if (cls === undefined) {
          console.warn("Warning, unknown block type", clsname);
          
          block = istruct.read_object(data2, DataBlock);
        } else {
          block = istruct.read_object(data2, cls);
        }
        
        datablocks.push([clsname, block]);
      } else if (args.load_settings && type == BlockTypes.SETTINGS) {
        let settings = istruct.read_object(data, AppSettings);
        
        this.settings.destroy();
        this.settings = settings;
      }
    }
    
    if (screen !== undefined) {
      screen.doOnce(() => {
        this.screen.on_resize([window.innerWidth, window.innerHeight]);
        this.screen.setCSS();
        this.screen.update();
      });
    }

    if (datalib === undefined) {
      throw new Error("failed to load file");
      return;
    }

    for (let dblock of datablocks) {
      datalib.getLibrary(dblock[0]).add(dblock[1]);
    }
    
    this.do_versions(version);
    
    datalib = this.datalib;
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
    
    for (let lib of this.datalib.libs) {
      lib.dataLink(getblock, getblock_us);
    }
    
    this.do_versions_post(version);

    if (args.reset_toolstack) {
      this.toolstack.reset(this.ctx);
    }
  }

  saveStartupFile() {
    let buf = this.createFile();
    buf = util.btoa(buf);

    localStorage[cconst.APP_KEY_NAME] = buf;
    console.log(`saved startup file; ${(buf.length/1024).toFixed(2)}kb`);
  }

  do_versions(version, datalib) {
    
  }
  
  do_versions_post(version, datalib) {
  }
  
  createUndoFile() {
    let args = {
      save_screen : false,
      load_screen : false
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

  _appstate.start();
}
