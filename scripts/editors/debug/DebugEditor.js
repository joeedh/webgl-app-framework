import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {saveFile, loadFile} from '../../path.ux/scripts/html5_fileapi.js';
import {PackFlags} from "../../path.ux/scripts/ui_base.js";

import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DataPathError} from '../../path.ux/scripts/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";
import {glDebug, Shaders} from "./gldebug.js";
import {getWebGL} from '../view3d/view3d.js';
import {SimpleMesh, LayerTypes} from "../../core/simplemesh.js";
import {Texture} from '../../core/webgl.js';
import {DisplayModes} from './DebugEditor_base.js';

export class DebugEditor extends Editor {
  constructor() {
    super();

    this.displayMode = DisplayModes.RAW;

    this.curTex = 0;
    this._ignore_tab_change = false;
  }

  init() {
    super.init();

    this.gl = getWebGL();
    this.canvas = this.gl.canvas;

    if (DEBUG.gl) {
      this.gldebug = glDebug.getDebug(this.gl);
    } else {
      this.gldebug = undefined;
    }

    let header = this.header;
    header.prop("debugEditor.displayMode", PackFlags.USE_ICONS);

    this.defineKeyMap();
  }

  _redraw() {
    this.viewportDraw();
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("Right", [], () => {
        this.curTex = Math.max(this.curTex-1, 0);
        this._redraw();
        console.log("curTex", this.curTex);
      }),
      new HotKey("Left", [], () => {
        this.curTex++;
        this._redraw();
        console.log("curTex", this.curTex);
      })
    ]);
  }

  drawStart() {
    if (!this.gldebug)
      return;

    this.gldebug.saveGL();
    this.gldebug.loadCleanGL();

    let gl = this.gl;
    let dpi = this.canvas.dpi;

    let x = this.pos[0]*dpi, y = this.pos[1]*dpi;
    let w = this.size[0]*dpi, h = this.size[1]*dpi;

    let screen = this.ctx.screen;
    let rect = screen.getClientRects();
    y = rect.height - y;

    this.glPos = new Vector2([~~x, ~~y]);
    this.glSize = new Vector2([~~w, ~~h]);

    gl.viewport(~~x, ~~y, ~~w, ~~h);
    gl.scissor(~~x, ~~y, ~~w, ~~h);

    gl.clearColor(0.25, 0.25, 0.25, 1.0);
    gl.clearDepth(100000);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  }

  rect(gl, tex, uniforms={}) {
    if (this._rect === undefined) {
      let mesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.UV);

      let quad = mesh.quad([-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0]);
      quad.uvs([0, 0], [0, 1], [1, 1], [1, 0]);

      this._rect = mesh;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);

    gl.depthMask(false);

    let depth = new Texture(1, tex.depth);
    tex = new Texture(0, tex);

    uniforms.rgba = tex;
    uniforms.depth = depth;

    let mesh = this._rect;

    if (this.displayMode == DisplayModes.RAW)
      mesh.program = Shaders.DisplayShader;
    else if (this.displayMode == DisplayModes.DEPTH)
      mesh.program = Shaders.DepthShader;

    mesh.program.bind(gl, uniforms);

    mesh.draw(gl, uniforms);
  }

  drawEnd() {
    if (!this.gldebug)
      return;

    let gl = this.gl;

    this.gldebug.restoreGL();
  }

  viewportDraw() {
    let gl = this.gl;

    if (gl._debug === undefined) {
      return;
    }

    let gld = gl._debug;

    this.drawStart();

    let texs = gld.texs;

    let tex = texs[texs.length-this.curTex-1];
    if (tex !== undefined) {
      this.rect(gl, tex);
    }

    this.drawEnd();
  }

  copy() {
    let ret = document.createElement("debug-editor-x");
    ret.ctx = this.ctx;

    return ret;
  }

  static define() {return {
    has3D     : true,
    tagname   : "debug-editor-x",
    areaname  : "DebugEditor",
    uiname    : "Debug",
    icon      : -1
  }}
}

DebugEditor.STRUCT = STRUCT.inherit(DebugEditor, Editor) + `
  displayMode : int;
}
`;

Editor.register(DebugEditor);
nstructjs.manager.add_class(DebugEditor);
